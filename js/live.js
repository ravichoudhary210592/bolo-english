// Live talk: a real-time voice call with a human-sounding partner (Google Gemini Live).
// Your voice streams to the service, it hears exactly what you said, and answers aloud within about a second.
// Needs internet and your own Gemini API key (kept only on this phone).
import { S, save, logPractice, logSession, markDone } from './store.js';
import { getMic } from './speech.js';
import { $, esc, I, pop, replace, sheet, toast, metricsHTML, issuesHTML, fmtMin } from './ui.js';
import { checkGrammar, fluency, countFillers, words } from './analysis.js';
import { liveFace, personFor, coach, ACCENTS } from './avatar.js';
import { addMistakes } from './store.js';

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
const MODELS = ['models/gemini-3.8-live', 'models/gemini-3.1-flash-live-preview', 'models/gemini-2.5-flash-native-audio-preview-12-2025'];
export const hasKey = () => !!(S.settings.geminiKey && S.settings.geminiKey.length > 20);
export const liveReady = () => hasKey() && navigator.onLine;

function b64FromInt16(int16) {
  const u8 = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function int16FromB64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer, 0, u8.length >> 1);
}

// Different message shapes are tried in turn, so a small change on the service side does not break the app.
function setupMessage(variant, cfg) {
  const speech = { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } };
  const vad = { automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', prefixPaddingMs: 120, silenceDurationMs: cfg.silenceMs } };
  const base = { model: MODELS[variant.model], systemInstruction: { parts: [{ text: cfg.system }] } };
  if (variant.shape === 'flat') Object.assign(base, { responseModalities: ['AUDIO'], speechConfig: speech });
  else base.generationConfig = { responseModalities: ['AUDIO'], speechConfig: speech };
  if (variant.extras !== 'min') {
    base.inputAudioTranscription = {};
    base.outputAudioTranscription = {};
    base.realtimeInputConfig = vad;
    base.contextWindowCompression = { slidingWindow: {} };
    base.sessionResumption = cfg.handle ? { handle: cfg.handle } : {};
    if (variant.extras === 'full') base.tools = [{ googleSearch: {} }];
  } else { base.inputAudioTranscription = {}; base.outputAudioTranscription = {}; }
  return { setup: base };
}
const VARIANTS = [
  { model: 0, shape: 'gen', extras: 'full' }, { model: 0, shape: 'flat', extras: 'full' }, { model: 0, shape: 'gen', extras: 'nosearch' },
  { model: 0, shape: 'gen', extras: 'min' }, { model: 1, shape: 'gen', extras: 'full' }, { model: 1, shape: 'gen', extras: 'min' }, { model: 2, shape: 'gen', extras: 'min' },
];

export class LiveSession {
  constructor(cfg, on) {
    this.cfg = cfg; this.on = on;
    this.state = 'connecting'; this.closed = false; this.ready = false;
    this.sources = new Set(); this.nextTime = 0; this.userSpeech = 0; this.muted = false;
    this.noise = 0.02; this.variantIdx = Math.min(S.settings.liveVariant || 0, VARIANTS.length - 1); this.triedAll = 0;
    this.queue = Promise.resolve();
  }
  setState(s) { if (this.state !== s) { this.state = s; this.on.state && this.on.state(s); } }

  async start() {
    // One audio context for both directions, created inside the tap that started the call (iOS requires that).
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.out = this.ctx.createGain();
    this.meter = this.ctx.createAnalyser(); this.meter.fftSize = 512;
    this.out.connect(this.meter); this.meter.connect(this.ctx.destination);
    this.stream = await getMic();
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    const sink = this.ctx.createGain(); sink.gain.value = 0;
    this.src.connect(this.node); this.node.connect(sink); sink.connect(this.ctx.destination);
    this.node.onaudioprocess = ev => this.onMic(ev.inputBuffer.getChannelData(0));
    this.connect();
    const buf = new Float32Array(this.meter.fftSize);
    const tick = () => {
      if (this.closed) return;
      this.meter.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] * buf[i];
      this.on.mouth && this.on.mouth(Math.min(1, Math.sqrt(s / (buf.length / 4)) * 5));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  connect() {
    const variant = VARIANTS[this.variantIdx];
    let ws;
    try { ws = new WebSocket(WS + encodeURIComponent(S.settings.geminiKey)); } catch (e) { return this.fail('Could not open the connection.'); }
    this.ws = ws; this.ready = false;
    ws.onopen = () => ws.send(JSON.stringify(setupMessage(variant, { ...this.cfg, handle: this.handle })));
    ws.onmessage = e => { this.queue = this.queue.then(async () => { const t = typeof e.data === 'string' ? e.data : await new Response(e.data).text(); try { this.onMessage(JSON.parse(t)); } catch (err) { /* ignore a malformed frame */ } }); };
    ws.onerror = () => {};
    ws.onclose = e => {
      if (this.closed || ws !== this.ws) return;
      const why = (e.reason || '').slice(0, 200);
      if (!this.ready) {
        if (/api key|API_KEY|permission|unauth|not valid/i.test(why) || e.code === 1008 && /key/i.test(why)) return this.fail('Google did not accept the key. Check it in Settings. (' + why + ')');
        if (/quota|exhaust|rate|limit/i.test(why)) return this.fail('The free allowance for today is used up, or too many requests. Try again later. (' + why + ')');
        // This shape was refused: try the next one.
        if (++this.triedAll < VARIANTS.length) { this.variantIdx = (this.variantIdx + 1) % VARIANTS.length; return this.connect(); }
        return this.fail('Could not start the call. ' + (why || 'Code ' + e.code) + (navigator.onLine ? '' : ' You seem to be offline.'));
      }
      // Dropped mid-call (connections last about ten minutes): pick the conversation up again if possible.
      if (this.handle && !this.resumed) { this.resumed = true; this.setState('connecting'); return this.connect(); }
      this.on.ended && this.on.ended(why);
    };
  }
  fail(msg) { if (this.closed) return; this.on.error && this.on.error(msg); this.stop(); }

  onMessage(m) {
    if (m.setupComplete) {
      this.ready = true; this.resumed = false;
      if (S.settings.liveVariant !== this.variantIdx) { S.settings.liveVariant = this.variantIdx; save(); }
      if (!this.greeted) { this.greeted = true; this.sendText(this.cfg.opening || '(The call has just connected. Greet them warmly and start talking.)'); }
      this.setState('listening');
      return;
    }
    if (m.sessionResumptionUpdate && m.sessionResumptionUpdate.resumable && m.sessionResumptionUpdate.newHandle) this.handle = m.sessionResumptionUpdate.newHandle;
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) this.on.userText && this.on.userText(sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) this.on.partnerText && this.on.partnerText(sc.outputTranscription.text);
    if (sc.interrupted) { this.flush(); this.on.partnerDone && this.on.partnerDone(); }
    if (sc.modelTurn && sc.modelTurn.parts) for (const p of sc.modelTurn.parts) {
      if (p.inlineData && p.inlineData.data) {
        const rate = +((p.inlineData.mimeType || '').match(/rate=(\d+)/) || [])[1] || 24000;
        this.play(int16FromB64(p.inlineData.data), rate);
      }
    }
    if (sc.turnComplete) { this.turnDone = true; this.on.partnerDone && this.on.partnerDone(); if (!this.sources.size) this.setState('listening'); }
  }

  play(int16, rate) {
    if (this.closed || !int16.length) return;
    const buf = this.ctx.createBuffer(1, int16.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
    const node = this.ctx.createBufferSource();
    node.buffer = buf; node.connect(this.out);
    const t = Math.max(this.ctx.currentTime + 0.03, this.nextTime);
    node.start(t); this.nextTime = t + buf.duration;
    this.sources.add(node); this.turnDone = false;
    this.setState('speaking');
    node.onended = () => { this.sources.delete(node); if (!this.sources.size && !this.closed) { this.quietUntil = performance.now() + 250; this.setState('listening'); } };
  }
  flush() { this.sources.forEach(n => { try { n.onended = null; n.stop(); } catch (e) { /* ignore */ } }); this.sources.clear(); this.nextTime = 0; if (!this.closed) this.setState('listening'); }
  interrupt() { if (this.sources.size) { this.flush(); this.quietUntil = performance.now() + 150; } }

  onMic(data) {
    if (this.closed) return;
    let s = 0; for (let i = 0; i < data.length; i += 8) s += data[i] * data[i];
    const level = Math.sqrt(s / (data.length / 8));
    this.noise = level < this.noise ? level * 0.5 + this.noise * 0.5 : this.noise * 0.995 + level * 0.005;
    const talking = level > Math.max(0.012, this.noise * 2.6);
    // While the partner is speaking the mic is held back, so the phone's speaker cannot be mistaken for you.
    const gated = this.muted || !this.ready || this.sources.size > 0 || performance.now() < (this.quietUntil || 0);
    this.on.level && this.on.level(gated ? 0 : Math.min(1, level * 8), talking && !gated);
    if (gated) { if (!this.paused && this.ready) { this.paused = true; this.send({ realtimeInput: { audioStreamEnd: true } }); } return; }
    this.paused = false;
    if (talking) this.userSpeech += data.length / this.ctx.sampleRate;
    const ratio = this.ctx.sampleRate / 16000, n = Math.floor(data.length / ratio), out = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(data.length, Math.floor((i + 1) * ratio));
      let v = 0; for (let j = a; j < b; j++) v += data[j];
      v = b > a ? v / (b - a) : 0;
      out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
    }
    this.send({ realtimeInput: { audio: { data: b64FromInt16(out), mimeType: 'audio/pcm;rate=16000' } } });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1 && this.ready) this.ws.send(JSON.stringify(obj)); }
  sendText(text) { this.send({ realtimeInput: { text } }); }
  stop() {
    if (this.closed) return; this.closed = true;
    cancelAnimationFrame(this.raf);
    try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
    this.sources.forEach(n => { try { n.stop(); } catch (e) { /* ignore */ } });
    try { this.node.disconnect(); this.src.disconnect(); } catch (e) { /* ignore */ }
    try { this.ctx.close(); } catch (e) { /* ignore */ }
  }
}

/* ---------- Asking for the key (once) ---------- */
export function keySheet(done) {
  const s = sheet(`<h3>Turn on live talk</h3>
    <p class="muted">Live talk gives you a partner with a natural human voice who hears you exactly and answers at once. It uses Google's Gemini service with your own free key.</p>
    <ol class="steps"><li>On this phone, open <b>aistudio.google.com/apikey</b> and sign in with your Google account.</li><li>Tap <b>Create API key</b>, then copy it.</li><li>Paste it below. It is stored only on this iPhone.</li></ol>
    <label class="field"><span>Gemini API key</span><input id="gk" type="password" placeholder="Paste your key" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <div class="gap"></div><button class="btn" data-act="savekey">Save and continue</button><div class="gap"></div>
    <button class="btn ghost" data-act="open">Open the key page</button><div class="gap"></div><button class="btn ghost" data-act="close">Not now</button>
    <p class="muted tiny" style="margin-top:12px">During live talk your voice is sent to Google to be understood and answered. Without a key the app still works offline with scripted partners.</p>`, {
    savekey: () => { const v = $('#gk', s.el).value.trim(); if (v.length < 20) return toast('That does not look like a full key'); S.settings.geminiKey = v; S.settings.liveVariant = 0; save(); s.close(); toast('Live talk is on'); if (done) done(); },
    open: () => window.open('https://aistudio.google.com/apikey', '_blank'),
  });
}

/* ---------- The call screen ---------- */
const PAUSE = () => Math.round((S.settings.livePause || 2.5) * 1000);

function persona(P) {
  const a = ACCENTS[P.acc];
  return `Your name is ${P.name}. You are a real ${a.adj} person from ${a.city}, and you speak English with a natural ${a.adj} accent and ${a.adj} everyday expressions. `;
}
const HUMAN = `This is a live voice call. Sound like a real person, not an assistant: relaxed, warm, a bit playful, with natural fillers such as "hmm", "oh nice", "right", and small laughs. React to what they actually said before moving on, share little details about your own life, and ask one question at a time. Keep each turn short — one to three sentences — so that they do most of the talking. Speak at a natural, unhurried pace. Never say you are an AI, a model or an assistant, never offer "help", never list options. `;
const COACHING = `They are a native Hindi speaker practising spoken English. Do not correct their English during the conversation and do not comment on it, unless they ask you to — then correct kindly and briefly with one example. If they are stuck, help with a word. If they switch to Hindi, understand it and gently continue in English. If they ask you to teach or tell them something — a nursery rhyme, a word, a phrase, a fact, a story — do it properly, line by line, and let them repeat. Look things up on the web when you need exact or current information. `;

export function liveTalk(page, scn, opts = {}) {
  const P = scn ? personFor(scn.id) : coach();
  const user = S.profile.name || 'your friend';
  const challenge = opts.challenge || null; // { prompt, points }
  let system, opening, title;
  if (challenge) {
    title = '2-minute challenge';
    system = persona(P) + HUMAN + COACHING + `Right now ${user} is doing a speaking challenge: they must talk for two full minutes about this topic: "${challenge.prompt}". Your job is to be an encouraging listener. Introduce the topic in one friendly sentence and tell them to go for it. After that, while they are talking, say almost nothing: when they pause, give only a tiny nudge of a few words such as "Mm-hm, go on", "And then?", "Why was that?" or one short follow-up question taken from these ideas: ${(challenge.points || []).join('; ')}. Do not take over the conversation. When you receive a note that the two minutes are up, congratulate them warmly, mention one thing they said that you liked, and give two short, specific tips to sound more natural.`;
    opening = '(The call has just connected. Introduce the two-minute topic in one sentence and invite them to start.)';
  } else if (scn) {
    title = scn.title;
    system = persona(P) + HUMAN + COACHING + `Role-play: ${scn.aiPrompt.replace(/^You are [^.]*\.\s*/, m => m)} In this scene you are the ${scn.partner} and ${user} is the ${scn.you}. Stay in the scene, but keep it natural and human. Start the scene yourself. After roughly eight exchanges, wrap it up naturally.`;
    opening = '(The scene starts now. You speak first, in character.)';
  } else {
    title = 'Just chat';
    system = persona(P) + HUMAN + COACHING + `You are catching up with ${user} like a good friend. Talk about their day, work, family, food, films, cricket, weekend plans — whatever comes up. You have your own life and opinions.`;
    opening = `(The call has just connected. Say hi to ${user} by name and ask something friendly.)`;
  }

  page.set({ title, right: `<button class="link" data-act="end" style="padding:8px 4px">End</button>`, body: `${challenge ? `<div class="progress" style="margin-top:6px"><i id="lv-bar" style="width:0%"></i></div><p class="center small muted" id="lv-time" style="margin-top:6px">0:00 of 2:00</p>` : ''}<div class="chat" id="chat"></div>` });
  const chat = page.$('#chat');
  const stage = document.createElement('div');
  stage.className = 'stage live';
  stage.innerHTML = `<button class="stage-face" data-act="tapface" aria-label="Interrupt"></button><div class="stage-name">${esc(P.name)}<span class="muted"> · ${esc(ACCENTS[P.acc].label)}</span></div><div class="stage-status" id="lv-status">Calling ${esc(P.name)}…</div>`;
  page.el.insertBefore(stage, page.body);
  const face = liveFace($('.stage-face', stage), P, 150, true);
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.innerHTML = `<div class="ctl"><button class="side-btn" data-act="mute" aria-label="Mute">${I.mic}</button><div class="live-wave"><i></i><i></i><i></i><i></i><i></i></div><button class="side-btn end" data-act="end" aria-label="End call">${I.x}</button></div>`;
  page.el.appendChild(dock);
  const bars = Array.from(dock.querySelectorAll('.live-wave i'));
  const status = t => { const el = page.$('#lv-status'); if (el) el.textContent = t; };
  const scrollEnd = () => requestAnimationFrame(() => { page.body.scrollTop = page.body.scrollHeight; });

  const turns = []; // { who: 'me' | 'them', text }
  let curMe = null, curThem = null, ended = false, firstSpeech = 0, timeUp = false;
  const started = Date.now();
  const bubble = (who, text) => { chat.insertAdjacentHTML('beforeend', `<div class="bubble ${who === 'me' ? 'me' : 'them'} sel">${esc(text)}</div>`); scrollEnd(); return chat.lastElementChild; };
  const closeMe = () => { if (curMe) { curMe.t.text = curMe.t.text.trim(); curMe = null; } };
  const closeThem = () => { if (curThem) { curThem.t.text = curThem.t.text.trim(); curThem = null; } };

  const session = new LiveSession({ system, opening, voice: P.live, silenceMs: challenge ? Math.max(PAUSE(), 3000) : PAUSE() }, {
    state: s => {
      face.set(s === 'speaking' ? 'speaking' : s === 'listening' ? 'listening' : 'thinking');
      status(s === 'speaking' ? P.name + ' is speaking — tap the face to interrupt' : s === 'listening' ? (session.muted ? 'You are muted' : 'Listening… just talk') : 'Connecting…');
    },
    mouth: v => face.mouth(v),
    level: (v, talking) => {
      bars.forEach((b, i) => { b.style.height = 6 + Math.min(1, v * (0.6 + ((i * 37) % 5) / 5)) * 26 + 'px'; });
      if (talking && !firstSpeech) firstSpeech = Date.now();
    },
    userText: t => { closeThem(); if (!curMe) { const tr = { who: 'me', text: '' }; turns.push(tr); curMe = { t: tr, el: bubble('me', '') }; } curMe.t.text += t; curMe.el.textContent = curMe.t.text; scrollEnd(); },
    partnerText: t => { closeMe(); if (!curThem) { const tr = { who: 'them', text: '' }; turns.push(tr); curThem = { t: tr, el: bubble('them', '') }; } curThem.t.text += t; curThem.el.textContent = curThem.t.text; scrollEnd(); },
    partnerDone: () => closeThem(),
    error: msg => { if (ended) return; status('Could not connect'); sheet(`<h3>Live talk could not start</h3><p class="muted sel">${esc(msg)}</p><div class="gap"></div><button class="btn" data-act="close">OK</button>`).onClose = () => finish(); },
    ended: () => { if (!ended) { toast('The call ended'); finish(); } },
  });
  session.start().catch(err => {
    const denied = /denied|NotAllowed/i.test(String(err));
    sheet(`<h3>Microphone needed</h3><p class="muted">${denied ? 'Allow the microphone for this app: iPhone Settings → Apps → Safari → Microphone → Allow.' : esc(String(err.message || err))}</p><div class="gap"></div><button class="btn" data-act="close">OK</button>`).onClose = () => { ended = true; pop(); };
  });

  let timer = 0;
  if (challenge) timer = setInterval(() => {
    const sec = Math.min(120, session.userSpeech);
    const bar = page.$('#lv-bar'), lab = page.$('#lv-time');
    if (bar) bar.style.width = (sec / 120) * 100 + '%';
    if (lab) lab.textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')} of 2:00 spoken`;
    if (sec >= 120 && !timeUp) { timeUp = true; if (lab) lab.textContent = 'Two minutes done! 🎉'; session.sendText('(Note: the two minutes are up. Congratulate them and give your two tips now.)'); }
  }, 500);

  function finish() {
    if (ended) return; ended = true;
    clearInterval(timer); session.stop(); face.destroy();
    closeMe(); closeThem();
    const mine = turns.filter(t => t.who === 'me' && t.text);
    if (!mine.length) return pop();
    const all = mine.map(t => t.text).join(' ');
    const sec = Math.max(session.userSpeech, 1);
    const w = words(all).length;
    const wpm = w >= 8 && sec > 5 ? Math.round(w / (sec / 60)) : 0;
    const issues = checkGrammar(all);
    const fillers = countFillers(all);
    if (issues.length) addMistakes(issues);
    logPractice({ sec, words: w, wpm });
    const fl = fluency(all, sec, null);
    logSession({ kind: challenge ? '2-minute challenge' : 'Live talk', title: challenge ? challenge.prompt : title, sec, score: wpm ? fl.score : null, wpm });
    if (scn) markDone(scn.id);
    if (opts.onDone) opts.onDone();
    replace(p => {
      p.set({ title: 'How it went', backLabel: 'Done',
        body: `<div class="center" style="padding:16px 0 8px"><div style="font-size:56px">${challenge ? (timeUp ? '🏆' : '💪') : '🎉'}</div><h1 style="font-size:26px;font-weight:800;margin-top:6px">${challenge ? (timeUp ? 'Two minutes — done!' : 'Good effort') : 'Lovely chat'}</h1><p class="muted" style="margin-top:4px">with ${esc(P.name)}</p></div><div class="gap"></div>
          <div class="grid"><div class="stat"><div class="v">${fmtMin(sec)}</div><div class="k">You spoke for</div></div><div class="stat"><div class="v">${wpm || '–'}</div><div class="k">Words per minute</div></div>
          <div class="stat"><div class="v">${w}</div><div class="k">Words spoken</div></div><div class="stat"><div class="v">${fillers.total}</div><div class="k">Filler words</div></div></div>
          <div class="sec"><h3>${issues.length ? 'Fix these next time' : 'No slips caught'}</h3></div>
          ${issues.length ? `<div class="card" style="padding-top:5px">${issuesHTML(issues)}</div>` : `<div class="card muted">Nothing from the common-mistake list this time. Ask ${esc(P.name)} “How could I say that better?” during a call for more.</div>`}
          <div class="sec"><h3>What you said</h3></div>
          <div class="card">${turns.filter(t => t.text).map(t => `<p class="sel" style="margin:0 0 9px;${t.who === 'me' ? '' : 'color:var(--muted)'}"><b>${t.who === 'me' ? 'You' : esc(P.name)}:</b> ${esc(t.text)}</p>`).join('')}</div>`,
        footer: `<div class="footer"><div class="btns"><button class="btn ghost" data-act="again">Talk again</button><button class="btn" data-act="back">Done</button></div></div>` });
      p.on({ again: () => replace(pp => liveTalk(pp, scn, opts)) });
    });
  }

  page.on({
    tapface: () => session.interrupt(),
    mute: b => { session.muted = !session.muted; b.classList.toggle('off', session.muted); status(session.muted ? 'You are muted' : 'Listening… just talk'); },
    end: () => finish(),
    back: () => finish(),
  });
  page.cleanup.push(() => { clearInterval(timer); session.stop(); face.destroy(); });
}
