// UI core: navigation stack, sheets, toast, mic dock, feedback cards.
import { S, save, logPractice, addMistakes } from './store.js';
import { Recorder, stt, speak, stopSpeaking, STT_MODELS } from './speech.js';
import { checkGrammar, fluency, voiceActivity, coach } from './analysis.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtMin = sec => sec < 60 ? Math.round(sec) + 's' : Math.round(sec / 60) + ' min';
export const mb = n => (n / 1048576).toFixed(n > 104857600 ? 0 : 1) + ' MB';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>'),
  chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/>'),
  target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>'),
  chart: svg('<path d="M5 20v-7M12 20V4M19 20v-11"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3.9 2-3.4-2-1.5Z"/>'),
  back: svg('<path d="m15 5-7 7 7 7"/>', 'stroke-width="2.4"'),
  chev: svg('<path d="m9 6 6 6-6 6"/>', 'width="18" height="18"'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>'),
  stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/>'),
  speaker: svg('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  flame: svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.6 1 2.4 1.8 2.6C10.300 9 10.800 5.500 12 3Z"/>'),
  spark: svg('<path d="M12 3.500l1.800 5.200 5.200 1.800-5.200 1.800L12 17.500l-1.800-5.200L5 10.500l5.200-1.800L12 3.500Z"/><path d="M19 16v4M17 18h4"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M8.500 14.500a6 6 0 1 1 7 0c-.6.5-1 1.300-1 2H9.500c0-.7-.4-1.500-1-2Z"/>'),
  skip: svg('<path d="M6 5l9 7-9 7V5Z"/><path d="M18 5v14"/>'),
  redo: svg('<path d="M4 11a8 8 0 1 1 2.300 6"/><path d="M4 5v6h6"/>'),
  ear: svg('<path d="M7 9a5.500 5.500 0 1 1 11 0c0 3-2.500 3.800-3.200 6-.5 1.700-.8 4-3.300 4-1.600 0-2.500-1-2.500-2.500"/><path d="M10 9.500a2.500 2.500 0 0 1 5 0"/>'),
  wave: svg('<path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4"/>'),
  swap: svg('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  bookmark: svg('<path d="M6.500 3.500h11V21L12 17l-5.500 4V3.500Z"/>'),
  alert: svg('<path d="M12 4 2.500 20h19L12 4Z"/><path d="M12 10v4.500M12 17.500h.01"/>'),
  down: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.500 20.500a7.500 7.500 0 0 1 15 0"/>'),
  list: svg('<path d="M8 6.500h12M8 12h12M8 17.500h12M4 6.500h.01M4 12h.01M4 17.500h.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>'),
  twist: svg('<path d="M4 8c4-5 8 5 12 0s4 0 4 0M4 16c4-5 8 5 12 0s4 0 4 0"/>'),
};

/* ---------- Navigation ---------- */
const stackEl = $('#stack');
const tabsEl = $('#tabs');
const pages = [];
let rootRender = null;

function makePage(cls) {
  const el = document.createElement('section');
  el.className = 'page ' + cls;
  const page = {
    el, handlers: {}, cleanup: [],
    // layout: { title, right, body, footer, large }
    set(o) {
      el.innerHTML = (o.title !== undefined ? `<header class="nav"><div class="side"><button class="back" data-act="back">${I.back}<span>${esc(o.backLabel || 'Back')}</span></button></div><h2>${esc(o.title)}</h2><div class="side r">${o.right || ''}</div></header>` : '')
        + `<div class="scroll">${o.body || ''}</div>` + (o.footer ? o.footer : '');
      page.body = $('.scroll', el);
      return page;
    },
    on(map) { Object.assign(page.handlers, map); return page; },
    $(s) { return $(s, el); },
  };
  el._page = page;
  return page;
}

export function setRoot(render) {
  while (pages.length) closePage(pages.pop(), true);
  rootRender = render;
  const page = makePage('root fade');
  stackEl.innerHTML = '';
  stackEl.appendChild(page.el);
  pages.push(page);
  tabsEl.classList.remove('hidden');
  render(page);
}
export function refreshRoot() {
  if (pages.length !== 1 || !rootRender) return;
  const page = pages[0];
  const top = page.body ? page.body.scrollTop : 0;
  page.el.classList.remove('fade');
  page.handlers = {};
  rootRender(page);
  if (page.body) page.body.scrollTop = top;
}
export function push(render) {
  const prev = pages[pages.length - 1];
  const page = makePage('push');
  stackEl.appendChild(page.el);
  pages.push(page);
  tabsEl.classList.add('hidden');
  if (prev) prev.el.classList.add('under');
  page.on({ back: () => pop() });
  render(page);
  return page;
}
function closePage(page, instant) {
  stopSpeaking();
  page.cleanup.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  if (instant) { page.el.remove(); return; }
  page.el.classList.remove('push');
  page.el.classList.add('pop');
  setTimeout(() => page.el.remove(), 300);
}
export function pop(n = 1) {
  while (n-- > 0 && pages.length > 1) closePage(pages.pop(), n > 0);
  const top = pages[pages.length - 1];
  top.el.classList.remove('under');
  if (pages.length === 1) { tabsEl.classList.remove('hidden'); refreshRoot(); }
  else if (top.refresh) top.refresh();
}
// Replace the top page (e.g. conversation -> summary) without stacking.
export function replace(render) {
  const old = pages.pop();
  closePage(old, true);
  const page = makePage('fade');
  stackEl.appendChild(page.el);
  pages.push(page);
  page.on({ back: () => pop() });
  render(page);
  return page;
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const host = t.closest('.page, .sheet, #tabs');
  const h = host && (host._page ? host._page.handlers : host._handlers);
  const fn = h && h[t.dataset.act];
  if (fn) { ev.preventDefault(); fn(t, ev); }
});

/* ---------- Sheets and toast ---------- */
export function sheet(html, handlers = {}) {
  const root = $('#sheets');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = '<div class="grab"></div>' + html;
  root.append(scrim, el);
  let closed = false;
  const api = {
    el,
    close() {
      if (closed) return; closed = true;
      scrim.classList.remove('on'); el.classList.remove('on');
      setTimeout(() => { scrim.remove(); el.remove(); }, 420);
      if (api.onClose) api.onClose();
    },
  };
  el._handlers = { close: () => api.close(), ...handlers };
  scrim.addEventListener('click', () => { if (!api.locked) api.close(); });
  requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); }));
  return api;
}
let toastTimer = 0;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
export function confirmSheet(title, text, okLabel, danger) {
  return new Promise(res => {
    const s = sheet(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="gap"></div><div class="gap"></div>
      <button class="btn ${danger ? 'danger' : ''}" data-act="ok">${esc(okLabel)}</button><div class="gap"></div><button class="btn ghost" data-act="close">Cancel</button>`,
      { ok: () => { res(true); s.close(); } });
    s.onClose = () => res(false);
  });
}

/* ---------- Audio helpers ---------- */
let player = null;
export function playBlob(blob) {
  stopSpeaking();
  if (player) { player.pause(); URL.revokeObjectURL(player.src); }
  player = new Audio(URL.createObjectURL(blob));
  player.play().catch(() => toast('Could not play the recording'));
}
export const say = (text, rate) => speak(text, rate ? { rate } : {});

/* ---------- Speech pack setup ---------- */
export function speechSetup(onReady) {
  const info = STT_MODELS[S.settings.sttModel];
  const s = sheet(`<h3>Set up offline speech</h3>
    <p class="muted">To understand what you say without internet, the app downloads a speech recognition pack once (${info.size}). After that everything works offline, and your voice never leaves your iPhone.</p>
    <div class="gap"></div>
    <div class="card"><div class="row"><div class="badge">${I.wave}</div><div class="grow"><div class="b">Speech pack · ${info.label}</div><div class="small muted" id="sp-status">Best on Wi-Fi. Takes about a minute.</div></div></div>
      <div class="gap"></div><div class="progress"><i id="sp-bar" style="width:0%"></i></div></div>
    <div class="gap"></div><button class="btn" data-act="get">Download speech pack</button>
    <div class="gap"></div><button class="btn ghost" data-act="close">Not now</button>`, {
    get: async btn => {
      btn.disabled = true; btn.textContent = 'Downloading…'; s.locked = true;
      try {
        await stt.load(p => {
          if (!p.total) return;
          $('#sp-bar', s.el).style.width = Math.min(100, (p.loaded / p.total) * 100) + '%';
          $('#sp-status', s.el).textContent = mb(p.loaded) + ' of ' + mb(p.total);
        });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        toast('Speech pack ready — you can practise offline');
        s.close();
        if (onReady) onReady();
      } catch (err) {
        s.locked = false; btn.disabled = false; btn.textContent = 'Try again';
        $('#sp-status', s.el).textContent = navigator.onLine ? 'Download failed: ' + err.message : 'You are offline. Connect once to download.';
      }
    },
  });
  return s;
}

export function typeSheet(title, onText) {
  const s = sheet(`<h3>${esc(title || 'Type your answer')}</h3><label class="field"><textarea id="ty" placeholder="Type in English…" autocapitalize="sentences"></textarea></label>
    <div class="gap"></div><button class="btn" data-act="send">Done</button>`, {
    send: () => { const v = $('#ty', s.el).value.trim(); if (!v) return; s.close(); onText(v); },
  });
  setTimeout(() => $('#ty', s.el).focus(), 450);
}

/* ---------- Mic dock ---------- */
// opts: { onResult({text, duration, pcm, blob, typed}), maxSec, hint, right: {icon, act, label}, noType }
export function micDock(page, opts) {
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.innerHTML = `<div class="hint"></div><div class="ctl">
    <button class="side-btn ${opts.left ? '' : 'blank'}" data-act="${opts.left ? opts.left.act : ''}" aria-label="${opts.left ? esc(opts.left.label) : ''}">${opts.left ? opts.left.icon : ''}</button>
    <button class="mic" data-act="mic" aria-label="Record"><span class="pulse"></span><span class="ic">${I.mic}</span></button>
    <button class="side-btn ${opts.right ? '' : 'blank'}" data-act="${opts.right ? opts.right.act : ''}" aria-label="${opts.right ? esc(opts.right.label) : ''}">${opts.right ? opts.right.icon : ''}</button></div>`;
  page.el.appendChild(dock);
  const hintEl = $('.hint', dock), micEl = $('.mic', dock), icEl = $('.ic', dock), pulse = $('.pulse', dock);
  const rec = new Recorder();
  let state = 'idle', raf = 0, baseHint = opts.hint || 'Tap to speak';
  const maxSec = opts.maxSec || 60;
  hintEl.textContent = baseHint;

  function setState(s) {
    state = s;
    micEl.classList.toggle('rec', s === 'rec');
    micEl.classList.toggle('busy', s === 'busy');
    icEl.innerHTML = s === 'rec' ? I.stop : s === 'busy' ? '<span class="spin"></span>' : I.mic;
    if (s === 'idle') { hintEl.textContent = baseHint; pulse.style.transform = ''; }
  }
  // Like a person on a call: notice when the learner has started talking and when they have finished.
  let heardAt = 0, quietAt = 0, auto = false;
  function tick() {
    if (state !== 'rec') return;
    pulse.style.transform = `scale(${1 + rec.level * 0.75})`;
    const t = rec.elapsed();
    hintEl.textContent = opts.autoStop ? (heardAt ? 'Listening… pause when you finish' : 'Your turn — go ahead') : `Listening… ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · tap to finish`;
    if (opts.onTick) opts.onTick(t);
    if (t >= maxSec) return finish();
    if (opts.autoStop) {
      if (rec.level > 0.16) { if (!heardAt) heardAt = t; quietAt = 0; }
      else if (rec.level < 0.08) { if (!quietAt) quietAt = t; }
      if (heardAt && quietAt && t - quietAt > 1.9 && t - heardAt > 1.2) return finish();
      if (!heardAt && auto && t > 9) { cancelAnimationFrame(raf); rec.cancel(); setState('idle'); hintEl.textContent = 'Tap the mic when you are ready'; return; }
    }
    raf = requestAnimationFrame(tick);
  }
  async function start(silent) {
    if (!stt.installed) { if (!silent) speechSetup(); return; }
    if (state !== 'idle') return;
    stopSpeaking();
    heardAt = 0; quietAt = 0; auto = !!silent;
    try {
      await rec.start();
      setState('rec');
      if (opts.onStart) opts.onStart();
      raf = requestAnimationFrame(tick);
      stt.load().catch(() => {});
    } catch (err) {
      setState('idle');
      if (silent) return; // hands-free start was refused: the learner simply taps the mic instead
      toast(/denied|NotAllowed/i.test(String(err)) ? 'Microphone blocked. Allow it for this app in iPhone Settings.' : 'Microphone error: ' + err.message, 4200);
    }
  }
  async function finish() {
    cancelAnimationFrame(raf);
    setState('busy');
    hintEl.textContent = 'Understanding what you said…';
    try {
      const r = await rec.stop();
      if (!r || r.duration < 0.5) { setState('idle'); toast('Too short — hold on a little longer'); return; }
      // No voice in the recording: do not send silence to the recogniser (it is slow and invents words).
      const va = voiceActivity(r.pcm);
      const text = !va || va.silent || va.speaking < 0.25 ? '' : await stt.transcribe(r.pcm);
      setState('idle');
      if (!text) { toast("I couldn't hear anything. Try again a little louder."); return; }
      opts.onResult({ text, duration: r.duration, pcm: r.pcm, blob: r.blob, typed: false });
    } catch (err) {
      setState('idle');
      toast('Could not transcribe: ' + err.message, 4200);
    }
  }
  page.on({
    mic: () => { if (micEl.disabled) return; if (state === 'idle') start(); else if (state === 'rec') finish(); },
  });
  // Test hook (no UI): feed an answer as text, as if it had been spoken and recognised.
  dock._simulate = text => opts.onResult({ text, duration: Math.max(3, text.split(/\s+/).length / 2.3), pcm: null, blob: null, typed: true });
  page.cleanup.push(() => { cancelAnimationFrame(raf); rec.cancel(); });
  return {
    el: dock,
    setHint(t) { baseHint = t; if (state === 'idle') hintEl.textContent = t; },
    enable(v) { micEl.disabled = !v; $$('.side-btn', dock).forEach(b => { if (!b.classList.contains('blank')) b.disabled = !v; }); },
    show(v) { dock.style.display = v ? '' : 'none'; },
    listen() { if (!micEl.disabled && !document.querySelector('.sheet.on')) start(true); }, // hands-free: open the mic without a tap
    get busy() { return state !== 'idle'; },
  };
}

/* ---------- Answer analysis + feedback card ---------- */
export function analyse(r) {
  const va = r.pcm ? voiceActivity(r.pcm) : null;
  const fl = fluency(r.text, r.duration, va);
  const issues = checkGrammar(r.text);
  const tips = coach(r.text, fl, issues);
  if (!r.typed) logPractice({ sec: r.duration, words: fl.words, wpm: fl.words >= 5 ? fl.wpm : 0 });
  else logPractice({ sec: Math.min(r.duration, 20), words: fl.words });
  if (issues.length) addMistakes(issues);
  return { ...r, fl, issues, tips };
}

export function metricsHTML(a) {
  const f = a.fl, out = [];
  if (!a.typed && f.words >= 5) out.push(`<span class="metric ${f.wpm >= 115 && f.wpm <= 185 ? 'g' : 'w'}">${f.wpm} words/min</span>`);
  out.push(`<span class="metric">${f.words} words</span>`);
  if (f.fillers.total) out.push(`<span class="metric w">${f.fillers.total} filler${f.fillers.total > 1 ? 's' : ''}</span>`);
  if (!a.typed && f.pauses >= 2) out.push(`<span class="metric w">${f.pauses} long pauses</span>`);
  out.push(a.issues.length ? `<span class="metric r">${a.issues.length} to fix</span>` : `<span class="metric g">No errors found</span>`);
  return `<div class="metrics">${out.join('')}</div>`;
}
export function issuesHTML(issues) {
  return issues.map(i => `<div class="issue"><div class="tag">${i.type === 'g' ? 'Grammar' : 'More natural'}</div>
    <div><span class="x">${esc(i.found)}</span> → <span class="ok">${esc(i.better)}</span></div>
    <p>${esc(i.why)}</p>${S.settings.hindi && i.hi ? `<p class="hi">${esc(i.hi)}</p>` : ''}</div>`).join('');
}
export function feedbackHTML(a, extra = '') {
  return `<div class="fb">${metricsHTML(a)}${issuesHTML(a.issues)}${a.tips.map(t => `<div class="tipline">${esc(t)}</div>`).join('')}${extra}</div>`;
}
export const sampleHTML = (label, text) => `<div class="sample"><div class="k"><span>${esc(label)}</span><button class="link small" data-act="say" data-text="${esc(text)}">Listen</button></div><div class="sel">${esc(text)}</div></div>`;

export function ringHTML(pct, mid, sub) {
  const c = 2 * Math.PI * 44;
  return `<div class="ring"><svg viewBox="0 0 104 104" width="104" height="104"><circle class="track" cx="52" cy="52" r="44"/><circle class="val" cx="52" cy="52" r="44" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, pct))}"/></svg><div class="mid"><div>${mid}<small>${sub}</small></div></div></div>`;
}
export const scoreClass = s => s >= 85 ? 'g' : s >= 60 ? 'w' : 'r';
export const scoreWord = s => s >= 92 ? 'Excellent' : s >= 80 ? 'Very good' : s >= 60 ? 'Good try' : 'Keep practising';
export { save };
