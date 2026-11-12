// Home, Progress, Settings and first-run onboarding.
import { S, save, saveNow, today, streak, lastDays, totals, resetAll, exportData, importData, srsDue } from './store.js';
import { SCENARIOS } from './data/scenarios.js';
import { UPGRADES } from './data/content.js';
import { stt, llm, speak, englishVoices, removePack, STT_MODELS, LLM_MODELS } from './speech.js';
import { $, esc, I, push, sheet, toast, confirmSheet, speechSetup, ringHTML, fmtMin, refreshRoot, micDock } from './ui.js';
import { coach, faceSVG, liveFace } from './avatar.js';
import { openScenario, scenarioOfDay, planFlag, aiSetup, openTopic } from './speak.js';
import { startShadow, flashcards, ALLWORDS } from './practice.js';
import { TOPICS } from './data/content.js';

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export function homeTab(page) {
  const d = today(), goal = S.profile.goal * 60, st = streak();
  const h = new Date().getHours();
  const hello = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const plan = planFlag();
  const sod = scenarioOfDay();
  const due = srsDue(ALLWORDS, 10).length;
  const tip = UPGRADES[Math.floor(Date.now() / 86400000) % UPGRADES.length];
  const left = Math.max(0, goal - d.sec);
  const maya = coach();
  const tasks = [
    ['rp', sod.emoji, "Let's talk: " + sod.title, sod.summary],
    ['sh', '🎧', 'Repeat after me', 'Six sentences. Copy my rhythm and stress.'],
    ['vo', '📚', due ? `Let's revisit ${due} words` : 'Pick up new words', due ? 'A quick look so they stay with you.' : 'Nothing due today — browse something new.'],
  ];
  const line = plan.rp ? (left ? "Nice talking earlier! Shall we keep going with something new?" : "You've hit your goal today. Fancy one more chat anyway?")
    : `Let's talk about <b>${esc(sod.title.toLowerCase())}</b> today. Ready when you are!`;
  page.el.innerHTML = `<div class="scroll">
    <div class="big-title"><div><div class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Let's talk</h1></div><button class="icon-btn" data-act="settings" aria-label="Settings" style="background:var(--card);box-shadow:var(--shadow)">${I.gear}</button></div>
    ${!stt.installed ? `<button class="banner tap" data-act="setup"><div class="badge">${I.down}</div><div class="grow"><div class="t">Let me hear you</div><div class="d">One-time ${STT_MODELS[S.settings.sttModel].size} download so we can talk without internet.</div></div><span class="chev">${I.chev}</span></button>` : ''}
    ${isIOS && !standalone() ? `<button class="banner tap w" data-act="install"><div class="badge w">${I.home}</div><div class="grow"><div class="t">Add to Home Screen</div><div class="d">Runs full screen like an app and keeps your data safe.</div></div><span class="chev">${I.chev}</span></button>` : ''}
    <div class="card coach"><div class="row" style="align-items:flex-start"><div class="coach-face">${faceSVG(maya, 68)}</div>
      <div class="grow"><div class="tiny b muted">${esc(maya.name)}</div><div class="coach-say">${hello}${S.profile.name ? ', ' + esc(S.profile.name) : ''}! ${line}</div></div></div>
      <div class="gap"></div><button class="btn" data-act="task" data-k="${plan.rp ? 'free' : 'rp'}">${I.mic} Let's talk</button></div>
    <div class="gap"></div>
    <div class="hero"><div class="row">
      ${ringHTML(d.sec / goal, Math.floor(d.sec / 60), 'of ' + S.profile.goal + ' min')}
      <div class="grow" style="position:relative;z-index:1"><div class="label">Today</div>
        <div style="font-size:22px;font-weight:800;line-height:1.2;margin:4px 0 10px">${left ? (d.sec ? 'Just ' + fmtMin(left) + ' more to go' : "Let's chat for " + S.profile.goal + ' minutes today') : 'You did it today. Lovely!'}</div>
        <span class="pill">${I.flame.replace('width="24" height="24"', 'width="16" height="16"')} ${st} day streak</span></div></div></div>
    <div class="sec"><h3>Today, let's…</h3><span class="muted small">${tasks.filter(t => plan[t[0]]).length} of 3 done</span></div>
    <div class="list">${tasks.map(([k, e, t, s]) => `<button class="item" data-act="task" data-k="${k}"><div class="badge">${e}</div><div class="grow"><div class="t">${esc(t)}</div><div class="d">${esc(s)}</div></div><div class="check ${plan[k] ? 'on' : ''}">${I.check}</div></button>`).join('')}</div>
    <div class="sec"><h3>Or pick a mood</h3></div>
    <div class="hscroll">
      <button class="tile tap" data-act="ai"><div class="badge">${I.spark}</div><div><div class="t">Just chat</div><div class="d">Talk about anything</div></div></button>
      <button class="tile tap" data-act="topic"><div class="badge w">${I.clock}</div><div><div class="t">Tell me about…</div><div class="d">A surprise topic</div></div></button>
      <button class="tile tap" data-act="interview"><div class="badge g">💼</div><div><div class="t">Interview me</div><div class="d">Practise the big one</div></div></button>
      <button class="tile tap" data-act="smalltalk"><div class="badge r">☕</div><div><div class="t">Small talk</div><div class="d">Easy, friendly chat</div></div></button>
    </div>
    <div class="sec" style="margin-top:12px"><h3>A nicer way to say it</h3></div>
    <button class="card tap" data-act="tip" style="display:block;width:100%"><div class="muted" style="text-decoration:line-through;text-decoration-color:var(--bad)">${esc(tip.plain)}</div><div style="font-size:19px;font-weight:700;margin-top:4px;color:var(--good)">${esc(tip.better)}</div><div class="muted small" style="margin-top:6px">${esc(tip.note)} · Tap to hear</div></button>
  </div>`;
  page.body = $('.scroll', page.el);
  const find = re => (SCENARIOS.find(s => re.test(s.id) || re.test(s.title)) || SCENARIOS[0]).id;
  page.on({
    settings: () => settingsPage(),
    setup: () => speechSetup(() => refreshRoot()),
    install: () => installSheet(),
    task: b => { const k = b.dataset.k; if (k === 'free') page.handlers.ai(); else if (k === 'rp') openScenario(sod.id); else if (k === 'sh') startShadow(S.profile.level === 'C1' ? 'C1' : S.profile.level === 'B1' ? 'B1' : 'B2'); else if (due) flashcards(); else document.querySelector('.tab[data-tab="words"]').click(); },
    ai: () => { document.querySelector('.tab[data-tab="speak"]').click(); setTimeout(() => { const b = document.querySelector('.seg [data-k="ai"]'); if (b) b.click(); }, 30); },
    topic: () => openTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]),
    interview: () => openScenario(find(/interview/i)),
    smalltalk: () => openScenario(find(/small.?talk|party/i)),
    tip: () => speak(tip.better),
  });
}

function installSheet() {
  sheet(`<h3>Add to Home Screen</h3><p class="muted">Installing gives the app its own icon, full-screen layout, and permanent offline storage.</p>
    <ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>Bolo</b> from your Home Screen and download the speech pack there.</li></ol>
    <div class="gap"></div><button class="btn" data-act="close">Got it</button>`);
}

/* ---------- Progress ---------- */
export function progressTab(page) {
  const t = totals(), week = lastDays(7), goal = S.profile.goal * 60, st = streak();
  const max = Math.max(goal, ...week.map(d => d.sec), 1);
  const month = lastDays(28);
  const wp = month.filter(d => d.wpmN).map(d => Math.round(d.wpmSum / d.wpmN));
  const top = [...S.mistakes].sort((a, b) => b.n - a.n).slice(0, 4);
  page.el.innerHTML = `<div class="scroll"><div class="big-title"><div><h1>Progress</h1></div></div>
    <div class="grid">
      <div class="stat"><div class="v">${st}</div><div class="k">Day streak</div></div>
      <div class="stat"><div class="v">${t.sec < 3600 ? Math.round(t.sec / 60) + '<small style="font-size:15px"> min</small>' : (t.sec / 3600).toFixed(1) + '<small style="font-size:15px"> h</small>'}</div><div class="k">Total speaking time</div></div>
      <div class="stat"><div class="v">${t.wpm || '–'}</div><div class="k">Average words / min</div></div>
      <div class="stat"><div class="v">${t.pron ? t.pron + '%' : '–'}</div><div class="k">Repeat accuracy</div></div>
    </div>
    <div class="sec"><h3>This week</h3><span class="muted small">Goal ${S.profile.goal} min / day</span></div>
    <div class="card"><div class="bars">${week.map((d, i) => `<div class="col ${i === 6 ? 'now' : ''}"><div class="bar ${d.sec >= goal ? 'hit' : ''}" style="height:${Math.max(3, (d.sec / max) * 100)}%"></div><span>${d.label}</span></div>`).join('')}</div>
      <p class="muted small" style="margin-top:10px">${week.filter(d => d.sec >= goal).length} of 7 days on goal · ${Math.round(week.reduce((s, d) => s + d.sec, 0) / 60)} minutes this week</p></div>
    <div class="sec"><h3>Speaking pace</h3></div>
    <div class="card">${wp.length >= 2 ? spark(wp) + `<p class="muted small" style="margin-top:8px">From ${wp[0]} to ${wp[wp.length - 1]} words per minute over your last ${wp.length} practice days. Natural conversation is about 125–165.</p>` : `<p class="muted">Practise on two different days to see how your speaking pace changes.</p>`}</div>
    <div class="sec"><h3>Most repeated slips</h3></div>
    ${top.length ? `<div class="list">${top.map(m => `<div class="item plain"><div class="grow"><div><span style="color:var(--bad);text-decoration:line-through">${esc(m.found)}</span> → <span class="b" style="color:var(--good)">${esc(m.better)}</span></div></div><span class="lvl">${m.n}×</span></div>`).join('')}</div>` : `<div class="card muted">No slips recorded yet.</div>`}
    <div class="sec"><h3>Recent sessions</h3><span class="muted small">${t.sessions} total</span></div>
    ${S.history.length ? `<div class="list">${S.history.slice(0, 12).map(x => `<div class="item plain"><div class="grow"><div class="t" style="font-weight:580;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.title)}</div><div class="d">${esc(x.kind)} · ${new Date(x.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${x.sec ? ' · ' + fmtMin(x.sec) : ''}</div></div>${x.score !== null && x.score !== undefined ? `<span class="lvl">${x.score}</span>` : ''}</div>`).join('')}</div>` : `<div class="card muted">Your sessions will appear here after your first practice.</div>`}
  </div>`;
  page.body = $('.scroll', page.el);
}
function spark(v) {
  const w = 300, h = 70, min = Math.min(...v) - 5, max = Math.max(...v) + 5;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - ((y - min) / (max - min)) * h]);
  return `<svg viewBox="-4 -6 ${w + 8} ${h + 12}" width="100%" height="84" preserveAspectRatio="none"><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---------- Settings ---------- */
function settingsPage() {
  push(page => {
    const draw = async () => {
      const voices = englishVoices();
      let est = '';
      try { const e = await navigator.storage.estimate(); est = (e.usage / 1048576).toFixed(0) + ' MB used on this device'; } catch (e) { /* ignore */ }
      const sw = (k, on) => `<button class="switch ${on ? 'on' : ''}" data-act="toggle" data-k="${k}" role="switch" aria-checked="${on}"></button>`;
      page.set({ title: 'Settings', body: `
        <div class="sec"><h3>You</h3></div>
        <div class="card"><label class="field" style="margin-top:0"><span>Name</span><input id="s-name" value="${esc(S.profile.name)}" placeholder="Your name" autocomplete="off"></label>
          <label class="field"><span>Level</span><select id="s-level">${[['B1', 'Intermediate (B1)'], ['B2', 'Upper intermediate (B2)'], ['C1', 'Advanced (C1)']].map(([v, l]) => `<option value="${v}" ${S.profile.level === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Daily speaking goal</span><select id="s-goal">${[5, 10, 15, 20, 30].map(g => `<option value="${g}" ${S.profile.goal === g ? 'selected' : ''}>${g} minutes</option>`).join('')}</select></label></div>
        <div class="sec"><h3>Voice</h3></div>
        <div class="card"><label class="field" style="margin-top:0"><span>Partner voice</span><select id="s-voice"><option value="">Automatic</option>${voices.map(v => `<option value="${esc(v.voiceURI)}" ${S.settings.voice === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></label>
          <label class="field"><span>Speed · <b id="s-rate-l">${S.settings.rate.toFixed(2)}×</b></span><input id="s-rate" type="range" min="0.7" max="1.2" step="0.05" value="${S.settings.rate}"></label>
          <div class="gap"></div><button class="btn soft sm" data-act="test" style="width:100%">${I.speaker} Test voice</button>
          <p class="muted tiny" style="margin-top:10px">For voices that sound like real people, download a “Premium” or “Enhanced” English voice (one female, one male) in iPhone Settings → Accessibility → Spoken Content → Voices → English. The app picks them up automatically and matches each partner's face to a voice.</p></div>
        <div class="gap"></div>
        <div class="list"><div class="item plain"><div class="grow"><div class="t">Hands-free conversation</div><div class="d">The mic opens when your partner stops and closes when you pause</div></div>${sw('handsFree', S.settings.handsFree)}</div>
          <div class="item plain"><div class="grow"><div class="t">Coach me after every answer</div><div class="d">Off: tips wait until the conversation ends, so it flows naturally</div></div>${sw('coachEach', S.settings.coachEach)}</div>
          <div class="item plain"><div class="grow"><div class="t">Partner speaks aloud</div></div>${sw('autoSpeak', S.settings.autoSpeak)}</div>
          <div class="item plain"><div class="grow"><div class="t">Hindi explanations</div><div class="d">Show हिंदी notes with corrections and words</div></div>${sw('hindi', S.settings.hindi)}</div></div>
        <div class="sec"><h3>Offline packs</h3></div>
        <div class="card"><div class="row"><div class="badge ${stt.installed ? 'g' : ''}">${I.wave}</div><div class="grow"><div class="b">Speech recognition</div><div class="small muted">${stt.installed ? 'Installed · works offline' : 'Not downloaded'}</div></div>
          ${stt.installed ? `<button class="btn danger sm" data-act="rm-stt">Remove</button>` : `<button class="btn sm" data-act="get-stt">Get</button>`}</div>
          <label class="field"><span>Quality</span><select id="s-stt">${Object.entries(STT_MODELS).map(([k, v]) => `<option value="${k}" ${S.settings.sttModel === k ? 'selected' : ''}>${v.label} · ${v.size}</option>`).join('')}</select></label></div>
        <div class="card"><div class="row"><div class="badge ${llm.installed ? 'g' : ''}">${I.spark}</div><div class="grow"><div class="b">Free-talk partner</div><div class="small muted">${!llm.supported ? 'Needs iOS 26 or later' : llm.installed ? 'Installed · works offline' : 'Optional · not downloaded'}</div></div>
          ${llm.installed ? `<button class="btn danger sm" data-act="rm-llm">Remove</button>` : llm.supported ? `<button class="btn sm" data-act="get-llm">Get</button>` : ''}</div>
          <label class="field"><span>Model</span><select id="s-llm">${Object.entries(LLM_MODELS).map(([k, v]) => `<option value="${k}" ${S.settings.llmModel === k ? 'selected' : ''}>${v.label} · ${v.size}</option>`).join('')}</select></label>
          <p class="muted tiny" style="margin-top:10px">The larger model gives better replies but may not fit in memory on every iPhone. If the app restarts when loading it, switch back to the compact one.</p></div>
        <div class="sec"><h3>Your data</h3></div>
        <div class="card"><p class="muted small">Progress is stored only on this iPhone. Recordings are never saved or uploaded. ${est ? esc(est) + '.' : ''}</p><div class="gap"></div>
          <div class="btns"><button class="btn ghost sm" data-act="export">Back up</button><button class="btn ghost sm" data-act="import">Restore</button></div>
          <div class="gap"></div><button class="btn danger sm" data-act="reset" style="width:100%">Erase all progress</button></div>
        <p class="muted tiny center" style="margin-top:18px">Bolo English · version 1.0</p>` });
      const bind = (id, fn) => page.$(id).addEventListener('change', e => { fn(e.target.value); save(); });
      bind('#s-name', v => { S.profile.name = v.trim(); });
      bind('#s-level', v => { S.profile.level = v; });
      bind('#s-goal', v => { S.profile.goal = +v; });
      bind('#s-voice', v => { S.settings.voice = v; });
      bind('#s-stt', v => { S.settings.sttModel = v; stt.loaded = false; draw(); });
      bind('#s-llm', v => { S.settings.llmModel = v; llm.unload(); draw(); });
      page.$('#s-rate').addEventListener('input', e => { S.settings.rate = +e.target.value; page.$('#s-rate-l').textContent = S.settings.rate.toFixed(2) + '×'; save(); });
    };
    draw();
    page.on({
      toggle: b => { const k = b.dataset.k; S.settings[k] = !S.settings[k]; b.classList.toggle('on', S.settings[k]); save(); },
      test: () => speak("Hi, it's " + coach().name + ". So, what shall we talk about today?", { gender: coach().g }),
      'get-stt': () => speechSetup(draw),
      'get-llm': () => aiSetup(draw),
      'rm-stt': async () => { if (await confirmSheet('Remove speech pack?', 'You will need to download it again before you can speak to the app.', 'Remove', true)) { await removePack('stt'); draw(); } },
      'rm-llm': async () => { if (await confirmSheet('Remove AI partner?', 'This frees storage. You can download it again later.', 'Remove', true)) { await removePack('llm'); draw(); } },
      export: async () => {
        const file = new File([exportData()], 'bolo-backup.json', { type: 'application/json' });
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Bolo backup' });
          else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
        } catch (e) { /* cancelled */ }
      },
      import: () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
        inp.onchange = async () => { try { importData(await inp.files[0].text()); toast('Backup restored'); draw(); } catch (e) { toast('That file is not a Bolo backup'); } };
        inp.click();
      },
      reset: async () => { if (await confirmSheet('Erase all progress?', 'Your streak, history, word cards and saved mistakes will be deleted from this iPhone. Downloaded packs stay. This cannot be undone.', 'Erase everything', true)) { const packs = { ...S.packs }; resetAll(); S.packs = packs; S.onboarded = true; saveNow(); location.reload(); } },
    });
  });
}

/* ---------- Onboarding (voice first: nothing to type) ---------- */
function nameFrom(text) {
  const t = (text || '').replace(/[.!?,]/g, ' ').trim();
  const m = t.match(/(?:my name is|my name's|i am|i'm|this is|call me|it's|it is|myself|name is)\s+([A-Za-z]+)/i);
  const w = m ? m[1] : (t.split(/\s+/).filter(x => !/^(hi|hello|hey|yes|yeah|ok|okay|um|uh|well|so|the|a)$/i.test(x))[0] || '');
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
}

export function onboarding(done) {
  const el = document.createElement('section');
  el.className = 'page fade';
  el.style.zIndex = 10;
  document.getElementById('stack').appendChild(el);
  document.getElementById('tabs').classList.add('hidden');
  const maya = coach();
  const handlers = {};
  const page = { el, cleanup: [], on(map) { Object.assign(handlers, map); return page; } };
  el._page = { handlers };
  let level = 'B2', goal = 10, face = null;
  const clear = () => { page.cleanup.forEach(f => f()); page.cleanup = []; if (face) { face.destroy(); face = null; } };
  const hello = (html, size = 132) => { clear(); el.innerHTML = html; face = liveFace($('.o-face', el), maya, size); };
  const talk = async text => { if (!face) return; face.set('speaking'); await speak(text, { gender: maya.g }); if (face) face.set('idle'); };

  const step1 = () => {
    hello(`<div class="onb"><div class="o-face" style="align-self:center;margin-bottom:18px"></div>
      <h1 class="center">Hi, I'm ${maya.name}. 👋<br>Let's talk!</h1>
      <p class="lead center">नमस्ते! A few minutes of real English conversation every day — I'll listen, chat back, and help you sound more natural.</p>
      <div class="feat"><div class="badge">${I.chat}</div><div><div class="t">Just talk — no typing</div><div class="d">Interviews, meetings, small talk, travel. You speak, we answer.</div></div></div>
      <div class="feat"><div class="badge g">${I.target}</div><div><div class="t">Gentle tips afterwards</div><div class="d">Pace, fillers, and the slips Hindi speakers make most.</div></div></div>
      <div class="feat"><div class="badge w">${I.wave}</div><div><div class="t">Private, and works offline</div><div class="d">Your voice stays on your iPhone. Nothing is uploaded.</div></div></div>
      <div class="spacer"></div><button class="btn" data-act="n1">Let's start</button></div>`, 150);
  };
  const stepPack = () => {
    hello(`<div class="onb"><div class="o-face" style="align-self:center;margin-bottom:18px"></div><h1 class="center">First, let me learn to hear you</h1>
      <p class="lead center">I need a one-time download (${STT_MODELS[S.settings.sttModel].size}) so I can understand you without internet. Best on Wi-Fi.</p>
      <div class="gap"></div><div class="card"><div class="small muted" id="o-status">Ready when you are</div><div class="gap"></div><div class="progress"><i id="o-bar" style="width:0%"></i></div></div>
      <div class="spacer"></div><button class="btn" data-act="dl">Download</button><div class="gap"></div><button class="btn ghost" data-act="skipdl">Later</button></div>`);
    talk('First, let me learn to hear you. This is a one time download.');
  };
  const stepName = () => {
    hello(`<div class="onb" style="padding-bottom:0"><div class="o-face" style="align-self:center;margin-bottom:18px"></div><h1 class="center">What should I call you?</h1>
      <p class="lead center" id="o-heard">Tap the mic and just say your name.</p><div class="spacer"></div><button class="btn ghost" data-act="skipname" style="margin-bottom:12px">Skip</button></div>`);
    el.firstElementChild.style.height = 'auto'; el.firstElementChild.style.flex = '1';
    el.style.display = 'flex'; el.style.flexDirection = 'column';
    micDock(page, { hint: 'Tap and say your name', maxSec: 8, autoStop: true, onStart: () => face && face.set('listening'), onResult: r => {
      const n = nameFrom(r.text);
      if (!n) { $('#o-heard', el).textContent = 'Sorry, I missed that. Try once more.'; return; }
      S.profile.name = n; save();
      $('#o-heard', el).innerHTML = `Nice to meet you, <b>${esc(n)}</b>!<br><span class="small">Not right? Just say it again.</span>`;
      const b = $('[data-act=skipname]', el); b.textContent = "That's me — continue"; b.className = 'btn';
      talk('Nice to meet you, ' + n + '!');
    } });
    talk('What should I call you?');
  };
  const stepYou = () => {
    hello(`<div class="onb"><div class="row" style="margin-bottom:14px"><div class="o-face"></div><h1 style="font-size:26px">${S.profile.name ? esc(S.profile.name) + ', how' : 'How'} is your English today?</h1></div>
      <div class="list">${[['B1', 'I manage, but I search for words'], ['B2', 'I speak well, but not smoothly'], ['C1', 'I am fluent and want polish']].map(([v, l]) => `<button class="item plain" data-act="lvl" data-v="${v}"><div class="grow"><div class="t" style="font-weight:560">${l}</div></div><div class="check ${v === level ? 'on' : ''}">${I.check}</div></button>`).join('')}</div>
      <div class="field"><span>How long shall we talk each day?</span><div class="seg" style="margin:0">${[5, 10, 15, 20].map(g => `<button class="${g === goal ? 'on' : ''}" data-act="goal" data-v="${g}">${g} min</button>`).join('')}</div></div>
      <div class="spacer"></div><button class="btn" data-act="go">Let's talk</button></div>`, 64);
  };
  const finish = () => { clear(); stopSpeakingSafe(); S.profile.level = level; S.profile.goal = goal; S.onboarded = true; saveNow(); el.remove(); done(); };
  const stopSpeakingSafe = () => { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } };
  page.on({
    n1: () => (stt.installed ? stepName() : stepPack()),
    skipdl: stepYou,
    skipname: stepYou,
    lvl: b => { level = b.dataset.v; stepYou(); },
    goal: b => { goal = +b.dataset.v; stepYou(); },
    go: finish,
    dl: async b => {
      b.disabled = true; b.textContent = 'Downloading…';
      try {
        await stt.load(p => { if (!p.total) return; $('#o-bar', el).style.width = Math.min(100, (p.loaded / p.total) * 100) + '%'; $('#o-status', el).textContent = p.loaded >= p.total ? 'Almost ready…' : (p.loaded / 1048576).toFixed(1) + ' of ' + (p.total / 1048576).toFixed(1) + ' MB'; });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        stepName();
      } catch (err) { b.disabled = false; b.textContent = 'Try again'; $('#o-status', el).textContent = navigator.onLine ? 'Download failed: ' + err.message : 'You are offline. Connect once to download.'; }
    },
  });
  step1();
}
