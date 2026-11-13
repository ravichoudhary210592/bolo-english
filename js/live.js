// Live talk: a real-time voice call with a human-sounding partner (Google Gemini Live).
// Your voice streams to the service, it hears exactly what you said, and answers aloud within about a second.
// Needs internet and your own Gemini API key (kept only on this phone).
import { S, save, logPractice, logSession, markDone } from './store.js';
import { getMic, speak, stopSpeaking } from './speech.js';
import { $, esc, I, pop, replace, sheet, toast, metricsHTML, issuesHTML, fmtMin } from './ui.js';
import { checkGrammar, fluency, countFillers, words } from './analysis.js';
import { liveFace, personFor, coach, ACCENTS } from './avatar.js';
import { addMistakes } from './store.js';

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
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

const REST = 'https://generativelanguage.googleapis.com/v1beta/';
const key = () => encodeURIComponent(S.settings.geminiKey || '');
const isQuota = t => /quota|exhaust|rate limit|too many|billing|RESOURCE_EXHAUSTED|429/i.test(t || '');
const isBadKey = t => /api key not valid|API_KEY_INVALID|invalid api key|PERMISSION_DENIED|unauthenticated/i.test(t || '');

/* ---------- Which models does this key offer? Ask Google, instead of assuming. ---------- */
let modelCache = null;
export async function listModels() {
  if (modelCache) return modelCache;
  const out = { live: [], chat: [], tts: [], error: '' };
  try {
    const r = await fetch(REST + 'models?pageSize=1000&key=' + key());
    const j = await r.json();
    if (!r.ok) { out.error = (j.error && j.error.message) || 'HTTP ' + r.status; return out; }
    const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
    for (const m of j.models || []) {
      const n = m.name || '', methods = m.supportedGenerationMethods || [];
      if (methods.includes('bidiGenerateContent') && !/translate|transcribe/i.test(n)) out.live.push(n);
      else if (/tts/i.test(n) && methods.includes('generateContent')) out.tts.push(n);
      else if (methods.includes('generateContent') && /flash/i.test(n) && !/tts|image|live|audio|embed|robot|computer|vision|thinking-exp|learnlm/i.test(n)) out.chat.push(n);
    }
    // Newest first; within a version the plain "flash" before "lite" (lite has the larger free allowance, so it is the fallback).
    const order = (a, b) => ver(b) - ver(a) || (/preview|exp/i.test(a) - /preview|exp/i.test(b)) || (/lite/i.test(a) - /lite/i.test(b)) || a.length - b.length;
    out.live.sort(order); out.chat.sort(order); out.tts.sort(order);
  } catch (e) { out.error = navigator.onLine ? String(e.message || e) : 'offline'; return out; }
  modelCache = out;
  return out;
}
export function forgetModels() { modelCache = null; }

async function post(model, body) {
  const r = await fetch(REST + model + ':generateContent?key=' + key(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) { const err = new Error((j && j.error && j.error.message) || 'HTTP ' + r.status); err.status = r.status; throw err; }
  return j;
}

function setupMessage(model, shape, cfg) {
  const speech = { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } };
  const base = { model, systemInstruction: { parts: [{ text: cfg.system }] }, inputAudioTranscription: {}, outputAudioTranscription: {} };
  if (shape === 'flat') Object.assign(base, { responseModalities: ['AUDIO'], speechConfig: speech });
  else base.generationConfig = { responseModalities: ['AUDIO'], speechConfig: speech };
  if (shape !== 'min') {
    base.realtimeInputConfig = { automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', prefixPaddingMs: 120, silenceDurationMs: cfg.silenceMs } };
    base.contextWindowCompression = { slidingWindow: {} };
    base.sessionResumption = cfg.handle ? { handle: cfg.handle } : {};
    base.tools = [{ googleSearch: {} }];
  }
  return { setup: base };
}

function wavB64(chunks) {
  let n = 0; for (const c of chunks) n += c.length;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44; for (const c of chunks) { for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true); }
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// One conversation. It uses the best transport the key allows:
//   'live'  - real-time streaming voice (fastest, most natural)
//   'turn'  - you speak, Gemini listens to the recording, replies, and the reply is spoken
export class LiveSession {
  constructor(cfg, on) {
    this.cfg = cfg; this.on = on;
    this.state = 'connecting'; this.closed = false; this.ready = false; this.mode = '';
    this.sources = new Set(); this.nextTime = 0; this.userSpeech = 0; this.muted = false; this.noise = 0.02;
    this.queue = Promise.resolve(); this.history = []; this.take = []; this.pre = []; this.heard = 0; this.quiet = 0; this.lastErr = '';
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
    const buf = new Float32Array(this.meter.fftSize);
    const tick = () => {
      if (this.closed) return;
      if (this.fakeMouth) this.on.mouth && this.on.mouth(Math.random() > 0.25 ? 0.25 + Math.random() * 0.6 : 0.02);
      else {
        this.meter.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] * buf[i];
        this.on.mouth && this.on.mouth(Math.min(1, Math.sqrt(s / (buf.length / 4)) * 5));
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    const models = await listModels();
    if (this.closed) return;
    if (models.error && isBadKey(models.error)) return this.fail('Google did not accept the key. Check it in Settings. (' + models.error + ')');
    this.models = models;
    // Every live model the key lists, then the known names, each in a few message shapes.
    const live = [...new Set([...(S.settings.liveModel ? [S.settings.liveModel] : []), ...models.live, 'models/gemini-3.8-live', 'models/gemini-3.1-flash-live-preview', 'models/gemini-2.5-flash-native-audio-preview-12-2025'])];
    this.plan = [];
    for (const m of live) for (const shape of ['gen', 'min', 'flat']) this.plan.push({ m, shape });
    this.step = 0;
    if (S.settings.liveBlocked && Date.now() - S.settings.liveBlocked < 6 * 3600 * 1000 && !this.cfg.forceLive) return this.startTurns(); // refused recently: do not waste time retrying
    this.connect();
  }

  /* ----- live streaming ----- */
  connect() {
    if (this.closed) return;
    if (this.step >= this.plan.length) { S.settings.liveBlocked = Date.now(); save(); return this.startTurns(); }
    const { m, shape } = this.plan[this.step];
    let ws;
    try { ws = new WebSocket(WS + key()); } catch (e) { this.step = this.plan.length; return this.connect(); }
    this.ws = ws; this.ready = false;
    ws.onopen = () => ws.send(JSON.stringify(setupMessage(m, shape, { ...this.cfg, handle: this.handle })));
    ws.onmessage = e => { this.queue = this.queue.then(async () => { const t = typeof e.data === 'string' ? e.data : await new Response(e.data).text(); try { this.onMessage(JSON.parse(t)); } catch (err) { /* ignore a malformed frame */ } }); };
    ws.onerror = () => {};
    ws.onclose = e => {
      if (this.closed || ws !== this.ws) return;
      const why = (e.reason || '').slice(0, 220);
      if (!this.ready) {
        this.lastErr = why || 'code ' + e.code;
        if (isBadKey(why)) return this.fail('Google did not accept the key. Check it in Settings. (' + why + ')');
        // Out of allowance for this model: skip its other shapes and move to the next model.
        if (isQuota(why)) { while (this.step < this.plan.length && this.plan[this.step].m === m) this.step++; }
        else this.step++;
        return this.connect();
      }
      if (this.handle && !this.resumed) { this.resumed = true; this.setState('connecting'); return this.connect(); }
      // The live line dropped for good: carry the conversation on in standard mode.
      this.startTurns(true);
    };
  }

  onMessage(m) {
    if (m.setupComplete) {
      this.ready = true; this.resumed = false; this.mode = 'live';
      const used = this.plan[this.step].m;
      if (S.settings.liveModel !== used || S.settings.liveBlocked) { S.settings.liveModel = used; S.settings.liveBlocked = 0; save(); }
      this.on.mode && this.on.mode('live', used);
      if (!this.greeted) { this.greeted = true; this.send({ realtimeInput: { text: this.cfg.opening } }); }
      this.setState('listening');
      return;
    }
    if (m.sessionResumptionUpdate && m.sessionResumptionUpdate.resumable && m.sessionResumptionUpdate.newHandle) this.handle = m.sessionResumptionUpdate.newHandle;
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) { this.on.userText && this.on.userText(sc.inputTranscription.text); this.history.push({ role: 'user', parts: [{ text: sc.inputTranscription.text }] }); }
    if (sc.outputTranscription && sc.outputTranscription.text) { this.on.partnerText && this.on.partnerText(sc.outputTranscription.text); this.history.push({ role: 'model', parts: [{ text: sc.outputTranscription.text }] }); }
    if (sc.interrupted) { this.flush(); this.on.partnerDone && this.on.partnerDone(); }
    if (sc.modelTurn && sc.modelTurn.parts) for (const p of sc.modelTurn.parts) {
      if (p.inlineData && p.inlineData.data) this.play(int16FromB64(p.inlineData.data), +((p.inlineData.mimeType || '').match(/rate=(\d+)/) || [])[1] || 24000);
    }
    if (sc.turnComplete) { this.on.partnerDone && this.on.partnerDone(); if (!this.sources.size) this.setState('listening'); }
  }

  /* ----- standard mode: record a turn, send it, speak the reply ----- */
  startTurns(midCall) {
    if (this.closed) return;
    try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
    this.ws = null; this.ready = false; this.mode = 'turn';
    this.chatIdx = 0; this.ttsIdx = 0; this.ttsOff = !!(S.settings.ttsBlocked && Date.now() - S.settings.ttsBlocked < 6 * 3600 * 1000);
    this.chat = [...new Set([...(S.settings.chatModel ? [S.settings.chatModel] : []), ...(this.models ? this.models.chat : []), 'models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite', 'models/gemini-2.0-flash'])];
    this.tts = [...new Set([...(this.models ? this.models.tts : []), 'models/gemini-2.5-flash-preview-tts'])];
    this.on.mode && this.on.mode('turn', this.lastErr);
    // History from a dropped live call arrives in small pieces; merge them into whole turns.
    const merged = [];
    for (const h of this.history) { const last = merged[merged.length - 1]; if (last && last.role === h.role) last.parts[0].text += h.parts[0].text; else merged.push({ role: h.role, parts: [{ text: h.parts[0].text }] }); }
    this.history = merged;
    if (midCall && this.history.length) { this.resetTake(); return this.setState('listening'); }
    this.ask({ text: this.cfg.opening });
  }
  resetTake() { this.take = []; this.pre = []; this.heard = 0; this.quiet = 0; }

  async ask(input) {
    if (this.closed) return;
    this.setState('thinking');
    const userParts = input.audio
      ? [{ inlineData: { mimeType: 'audio/wav', data: input.audio } }, { text: '(This is a recording of what they just said. Put the exact words they said — word for word, mistakes included, nothing corrected — in "heard", then answer in "reply".)' }]
      : [{ text: input.text }];
    if (this.pendingNote) { userParts.push({ text: this.pendingNote }); this.pendingNote = ''; }
    const body = {
      systemInstruction: { parts: [{ text: this.cfg.system + ' Answer ONLY with JSON of the form {"heard": "...", "reply": "..."}. "reply" is exactly what you say aloud next, in plain spoken words with no markup. If there was no recording, "heard" is an empty string. If the recording has no clear speech, set "heard" to "" and ask them kindly to say it again.' }] },
      contents: [...this.history.slice(-16), { role: 'user', parts: userParts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 700 },
    };
    let j = null, err = null;
    for (; this.chatIdx < this.chat.length; this.chatIdx++) {
      try { j = await post(this.chat[this.chatIdx], body); break; } catch (e) {
        err = e;
        if (isBadKey(e.message)) return this.fail('Google did not accept the key. Check it in Settings. (' + e.message + ')');
        if (!navigator.onLine) return this.fail('You are offline. Live talk needs internet.');
      }
    }
    if (this.closed) return;
    if (!j) return this.fail(isQuota(err && err.message)
      ? 'Google says this key has no allowance left for any of its models right now. Free keys reset daily; a key from a different Google account, or adding billing in Google AI Studio, also fixes it. Until then the offline partner still works. (' + (err.message || '').slice(0, 160) + ')'
      : 'Could not reach the conversation service. ' + ((err && err.message) || this.lastErr || '').slice(0, 200));
    if (S.settings.chatModel !== this.chat[this.chatIdx]) { S.settings.chatModel = this.chat[this.chatIdx]; save(); }
    let text = '';
    try { text = j.candidates[0].content.parts.map(p => p.text || '').join(''); } catch (e) { /* ignore */ }
    let heard = '', reply = '';
    try { const o = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); heard = (o.heard || '').trim(); reply = (o.reply || '').trim(); } catch (e) { reply = text.replace(/[{}"]/g, ' ').trim(); }
    if (!reply) reply = 'Sorry, I missed that. Could you say it again?';
    if (input.audio && heard) { this.on.userText && this.on.userText(heard); this.history.push({ role: 'user', parts: [{ text: heard }] }); }
    else if (!input.audio) this.history.push({ role: 'user', parts: [{ text: input.text }] });
    this.history.push({ role: 'model', parts: [{ text: reply }] });
    this.on.partnerText && this.on.partnerText(reply);
    this.on.partnerDone && this.on.partnerDone();
    await this.say(reply);
  }

  async say(text) {
    if (this.closed) return;
    // First choice: a natural Gemini voice. If the key has no allowance for it, the iPhone's own voice.
    if (!this.ttsOff) {
      const a = this.cfg.accent ? `Say this in a warm, natural, conversational ${this.cfg.accent} English accent, like a friend on a call: ` : '';
      for (; this.ttsIdx < this.tts.length; this.ttsIdx++) {
        try {
          const j = await post(this.tts[this.ttsIdx], { contents: [{ parts: [{ text: a + text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.cfg.voice } } } } });
          const p = j.candidates[0].content.parts.find(x => x.inlineData && x.inlineData.data);
          if (!p) throw new Error('no audio');
          if (this.closed) return;
          this.on.voice && this.on.voice('gemini');
          this.resetTake();
          return this.play(int16FromB64(p.inlineData.data), +((p.inlineData.mimeType || '').match(/rate=(\d+)/) || [])[1] || 24000);
        } catch (e) { this.lastErr = e.message; }
      }
      this.ttsOff = true; S.settings.ttsBlocked = Date.now(); save();
    }
    if (this.closed) return;
    this.on.voice && this.on.voice('phone');
    this.setState('speaking'); this.fakeMouth = true; this.phoneTalking = true;
    await speak(text, { gender: this.cfg.gender });
    this.fakeMouth = false; this.phoneTalking = false;
    if (this.closed) return;
    this.quietUntil = performance.now() + 300; this.resetTake();
    this.setState('listening');
  }

  /* ----- audio out ----- */
  play(int16, rate) {
    if (this.closed || !int16.length) return;
    const buf = this.ctx.createBuffer(1, int16.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
    const node = this.ctx.createBufferSource();
    node.buffer = buf; node.connect(this.out);
    const t = Math.max(this.ctx.currentTime + 0.03, this.nextTime);
    node.start(t); this.nextTime = t + buf.duration;
    this.sources.add(node);
    this.setState('speaking');
    node.onended = () => { this.sources.delete(node); if (!this.sources.size && !this.closed) { this.quietUntil = performance.now() + 250; this.resetTake(); this.setState('listening'); } };
  }
  flush() { this.sources.forEach(n => { try { n.onended = null; n.stop(); } catch (e) { /* ignore */ } }); this.sources.clear(); this.nextTime = 0; if (!this.closed) this.setState('listening'); }
  interrupt() {
    if (this.phoneTalking) { stopSpeaking(); return; }
    if (this.sources.size) { this.flush(); this.quietUntil = performance.now() + 150; this.resetTake(); }
  }

  /* ----- audio in ----- */
  onMic(data) {
    if (this.closed) return;
    let s = 0; for (let i = 0; i < data.length; i += 8) s += data[i] * data[i];
    const level = Math.sqrt(s / (data.length / 8));
    this.noise = level < this.noise ? level * 0.5 + this.noise * 0.5 : this.noise * 0.995 + level * 0.005;
    const talking = level > Math.max(0.012, this.noise * 2.6);
    const dur = data.length / this.ctx.sampleRate;
    // While the partner is speaking the mic is held back, so the phone's speaker cannot be mistaken for you.
    const busy = this.sources.size > 0 || this.phoneTalking || performance.now() < (this.quietUntil || 0);
    const gated = this.muted || busy || (this.mode === 'live' ? !this.ready : this.state !== 'listening');
    this.on.level && this.on.level(gated ? 0 : Math.min(1, level * 8), talking && !gated);
    if (gated) { if (this.mode === 'live' && !this.paused && this.ready) { this.paused = true; this.send({ realtimeInput: { audioStreamEnd: true } }); } return; }
    this.paused = false;
    if (talking) this.userSpeech += dur;
    const ratio = this.ctx.sampleRate / 16000, n = Math.floor(data.length / ratio), out = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(data.length, Math.floor((i + 1) * ratio));
      let v = 0; for (let j = a; j < b; j++) v += data[j];
      v = b > a ? v / (b - a) : 0;
      out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
    }
    if (this.mode === 'live') return this.send({ realtimeInput: { audio: { data: b64FromInt16(out), mimeType: 'audio/pcm;rate=16000' } } });
    if (this.mode !== 'turn') return;
    // Standard mode: gather the turn, and take it once they have stopped talking for the chosen pause.
    if (!this.heard) {
      this.pre.push(out); if (this.pre.length > 5) this.pre.shift();
      if (talking) { this.heard = dur; this.take = this.pre.slice(); this.pre = []; this.quiet = 0; }
      return;
    }
    this.take.push(out);
    if (talking) { this.heard += dur; this.quiet = 0; } else this.quiet += dur;
    const total = this.take.length * dur;
    if ((this.quiet * 1000 >= this.cfg.silenceMs && this.heard > 0.35) || total > 110) {
      const audio = wavB64(this.take);
      this.resetTake();
      this.ask({ audio });
    }
  }
  send(obj) { if (this.ws && this.ws.readyState === 1 && this.ready) this.ws.send(JSON.stringify(obj)); }
  sendText(text) { if (this.mode === 'live') this.send({ realtimeInput: { text } }); else if (this.mode === 'turn' && this.state === 'listening') { this.resetTake(); this.ask({ text }); } else this.pendingNote = text; }
  fail(msg) { if (this.closed) return; this.on.error && this.on.error(msg); this.stop(); }
  stop() {
    if (this.closed) return; this.closed = true;
    cancelAnimationFrame(this.raf);
    if (this.phoneTalking) stopSpeaking();
    try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
    this.sources.forEach(n => { try { n.stop(); } catch (e) { /* ignore */ } });
    try { this.node.disconnect(); this.src.disconnect(); } catch (e) { /* ignore */ }
    try { this.ctx.close(); } catch (e) { /* ignore */ }
  }
}

/* ---------- Key check: what does this key actually allow? ---------- */
export async function checkKey() {
  forgetModels();
  const lines = [];
  const m = await listModels();
  if (m.error) return ['Key or connection problem: ' + m.error];
  lines.push(`Key accepted. Live voice models: ${m.live.length}, chat models: ${m.chat.length}, voice (TTS) models: ${m.tts.length}.`);
  const short = n => n.replace('models/', '');
  // Chat
  let okChat = '';
  for (const model of m.chat.slice(0, 6)) {
    try { await post(model, { contents: [{ parts: [{ text: 'Say hi in two words.' }] }], generationConfig: { maxOutputTokens: 20 } }); okChat = model; break; } catch (e) { lines.push(`Chat ${short(model)}: ${isQuota(e.message) ? 'no allowance' : e.message.slice(0, 90)}`); }
  }
  lines.push(okChat ? `Chat works: ${short(okChat)}` : 'Chat: no model available on this key.');
  // Voice
  let okTts = '';
  for (const model of m.tts.slice(0, 4)) {
    try { await post(model, { contents: [{ parts: [{ text: 'Hello.' }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } }); okTts = model; break; } catch (e) { lines.push(`Voice ${short(model)}: ${isQuota(e.message) ? 'no allowance' : e.message.slice(0, 90)}`); }
  }
  lines.push(okTts ? `Natural voice works: ${short(okTts)}` : 'Natural voice: not available, the iPhone voice will be used.');
  // Live
  let okLive = '';
  for (const model of m.live.slice(0, 5)) {
    const res = await new Promise(resolve => {
      let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
      let ws; try { ws = new WebSocket(WS + key()); } catch (e) { return fin('cannot connect'); }
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model, generationConfig: { responseModalities: ['AUDIO'] } } }));
      ws.onmessage = async e => { const t = typeof e.data === 'string' ? e.data : await new Response(e.data).text(); if (/setupComplete/.test(t)) { fin('ok'); ws.close(); } };
      ws.onclose = e => fin(e.reason || 'closed ' + e.code);
      setTimeout(() => { fin('no answer'); try { ws.close(); } catch (e) { /* ignore */ } }, 7000);
    });
    if (res === 'ok') { okLive = model; break; }
    lines.push(`Live ${short(model)}: ${isQuota(res) ? 'no allowance' : res.slice(0, 90)}`);
  }
  lines.push(okLive ? `Live voice works: ${short(okLive)}` : 'Live voice: not available on this key, standard mode will be used.');
  if (okLive) { S.settings.liveModel = okLive; S.settings.liveBlocked = 0; } else S.settings.liveBlocked = Date.now();
  if (okTts) S.settings.ttsBlocked = 0;
  if (okChat) S.settings.chatModel = okChat;
  save();
  lines.push(okLive ? 'Result: full live talk.' : okChat ? (okTts ? 'Result: standard mode with a natural voice.' : 'Result: standard mode with the iPhone voice.') : 'Result: this key cannot be used right now. The offline partner still works.');
  return lines;
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
    savekey: () => { const v = $('#gk', s.el).value.trim(); if (v.length < 20) return toast('That does not look like a full key'); S.settings.geminiKey = v; S.settings.liveBlocked = 0; S.settings.ttsBlocked = 0; S.settings.liveModel = ''; S.settings.chatModel = ''; forgetModels(); save(); s.close(); toast('Live talk is on'); if (done) done(); },
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

  let mode = '';
  const session = new LiveSession({ system, opening, voice: P.live, accent: ACCENTS[P.acc].adj, gender: P.g, silenceMs: challenge ? Math.max(PAUSE(), 3000) : PAUSE() }, {
    mode: m => { mode = m; if (m === 'turn') toast('Live voice is not available on your key right now — using standard mode', 4200); },
    state: s => {
      face.set(s === 'speaking' ? 'speaking' : s === 'listening' ? 'listening' : 'thinking');
      status(s === 'speaking' ? P.name + ' is speaking — tap the face to interrupt' : s === 'listening' ? (session.muted ? 'You are muted' : mode === 'turn' ? 'Listening… I answer when you pause' : 'Listening… just talk') : s === 'thinking' ? P.name + ' is thinking…' : 'Calling ' + P.name + '…');
    },
    mouth: v => face.mouth(v),
    level: (v, talking) => {
      bars.forEach((b, i) => { b.style.height = 6 + Math.min(1, v * (0.6 + ((i * 37) % 5) / 5)) * 26 + 'px'; });
      if (talking && !firstSpeech) firstSpeech = Date.now();
    },
    userText: t => { closeThem(); if (!curMe) { const tr = { who: 'me', text: '' }; turns.push(tr); curMe = { t: tr, el: bubble('me', '') }; } curMe.t.text += t; curMe.el.textContent = curMe.t.text; scrollEnd(); },
    partnerText: t => { closeMe(); if (!curThem) { const tr = { who: 'them', text: '' }; turns.push(tr); curThem = { t: tr, el: bubble('them', '') }; } curThem.t.text += t; curThem.el.textContent = curThem.t.text; scrollEnd(); },
    partnerDone: () => closeThem(),
    error: msg => { if (ended) return; status('Could not connect'); sheet(`<h3>Live talk could not start</h3><p class="muted sel">${esc(msg)}</p><div class="gap"></div><button class="btn" data-act="close">OK</button>`).onClose = () => { if (turns.some(t => t.who === 'me' && t.text)) finish(); else { ended = true; pop(); } }; },
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
