// All progress is stored on this device only (localStorage). Nothing is uploaded.
const KEY = 'bolo.v1';

const DEFAULTS = {
  onboarded: false,
  profile: { name: '', level: 'B2', goal: 10 },
  settings: { voice: '', rate: 1, sttModel: 'onnx-community/whisper-base.en', llmModel: 'onnx-community/Qwen2.5-0.5B-Instruct', hindi: true, autoSpeak: true, handsFree: true, coachEach: false, accent: 'in', partner: 'any', pause: 4, livePause: 2.5, geminiKey: '', liveVariant: 0 },
  packs: { stt: '', llm: '' },
  days: {},        // 'YYYY-MM-DD' -> { sec, sessions, words, wpmSum, wpmN, pronSum, pronN }
  history: [],     // recent sessions: { t, kind, title, sec, score, wpm }
  mistakes: [],    // { found, better, why, hi, n, t, done }
  srs: {},         // word -> { box, due }
  done: {},        // scenario / item ids completed -> count
  saved: [],       // saved phrases
};

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k in extra || {}) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], extra[k]);
    else out[k] = extra[k];
  }
  return out;
}

function read() {
  try { return merge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return merge(DEFAULTS, {}); }
}

export let S = read();

let timer = 0;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } }, 150);
}
export function saveNow() { clearTimeout(timer); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
export function resetAll() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } S = read(); }
export function exportData() { return JSON.stringify({ ...S, settings: { ...S.settings, geminiKey: '' } }, null, 1); } // the key never leaves the phone in a backup
export function importData(text) { const d = JSON.parse(text); if (!d || typeof d !== 'object' || !d.profile) throw new Error('Not a backup file'); S = merge(DEFAULTS, d); saveNow(); }

export function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function today() {
  const k = dayKey();
  return S.days[k] || (S.days[k] = { sec: 0, sessions: 0, words: 0, wpmSum: 0, wpmN: 0, pronSum: 0, pronN: 0 });
}

// Record practice. sec = speaking/active seconds.
export function logPractice({ sec = 0, words = 0, wpm = 0, pron = null }) {
  const d = today();
  d.sec += Math.round(sec);
  d.words += words;
  if (wpm) { d.wpmSum += wpm; d.wpmN++; }
  if (pron !== null) { d.pronSum += pron; d.pronN++; }
  save();
}
export function logSession({ kind, title, sec = 0, score = null, wpm = 0 }) {
  today().sessions++;
  S.history.unshift({ t: Date.now(), kind, title, sec: Math.round(sec), score, wpm });
  if (S.history.length > 120) S.history.length = 120;
  save();
}
export function markDone(id) { S.done[id] = (S.done[id] || 0) + 1; save(); }

export function streak() {
  let n = 0;
  const d = new Date();
  if (!(S.days[dayKey(d)] && S.days[dayKey(d)].sec >= 60)) d.setDate(d.getDate() - 1); // today not done yet: streak still alive
  for (;;) {
    const day = S.days[dayKey(d)];
    if (day && day.sec >= 60) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
export function lastDays(n) {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const k = dayKey(d);
    out.push({ key: k, label: 'SMTWTFS'[d.getDay()], date: d.getDate(), ...(S.days[k] || { sec: 0, sessions: 0, words: 0, wpmSum: 0, wpmN: 0, pronSum: 0, pronN: 0 }) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
export function totals() {
  let sec = 0, words = 0, sessions = 0, wpmSum = 0, wpmN = 0, pronSum = 0, pronN = 0, days = 0;
  for (const k in S.days) {
    const d = S.days[k];
    sec += d.sec; words += d.words; sessions += d.sessions; wpmSum += d.wpmSum; wpmN += d.wpmN; pronSum += d.pronSum; pronN += d.pronN;
    if (d.sec >= 60) days++;
  }
  return { sec, words, sessions, days, wpm: wpmN ? Math.round(wpmSum / wpmN) : 0, pron: pronN ? Math.round(pronSum / pronN) : 0 };
}

export function addMistakes(issues) {
  for (const i of issues) {
    const ex = S.mistakes.find(m => m.found.toLowerCase() === i.found.toLowerCase());
    if (ex) { ex.n++; ex.t = Date.now(); ex.done = false; }
    else S.mistakes.unshift({ found: i.found, better: i.better, why: i.why, hi: i.hi, type: i.type, n: 1, t: Date.now(), done: false });
  }
  if (S.mistakes.length > 200) S.mistakes.length = 200;
  save();
}

// Spaced repetition (Leitner boxes). Intervals in days per box.
const GAPS = [0, 1, 3, 7, 16, 35];
export function srsGrade(word, knew) {
  const cur = S.srs[word] || { box: 0, due: 0 };
  cur.box = knew ? Math.min(5, cur.box + 1) : 1;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + GAPS[cur.box]);
  cur.due = d.getTime();
  S.srs[word] = cur;
  save();
}
export function srsDue(all, limit = 10) {
  const now = Date.now();
  const due = all.filter(v => S.srs[v.w] && S.srs[v.w].due <= now && S.srs[v.w].box < 5);
  const fresh = all.filter(v => !S.srs[v.w]);
  return [...due, ...fresh].slice(0, limit);
}
export function srsStats(all) {
  let learning = 0, mastered = 0;
  for (const v of all) { const s = S.srs[v.w]; if (!s) continue; if (s.box >= 4) mastered++; else learning++; }
  return { learning, mastered, fresh: all.length - learning - mastered };
}
