// Voice in and out: text-to-speech, microphone capture, on-device transcription, AI partner bridge.
import { S, save } from './store.js';

/* ---------- Text to speech (built-in iPhone voices, offline) ---------- */
let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
}
export function englishVoices() { if (!voices.length) loadVoices(); return voices; }
// Events for the animated faces: 'start', 'boundary' (each word), 'end'.
export const speechEvents = new EventTarget();
const FEMALE = /samantha|ava|allison|susan|zoe|nicky|karen|moira|tessa|kate|serena|fiona|veena|isha|sangeeta|martha|catherine|stephanie|joelle|noelle|shelley|sandy|flo|kathy|princess|victoria|aria|zira|jenny|hazel|sonia|libby|female|woman/i;
const MALE = /daniel|alex|tom|fred|aaron|arthur|oliver|rishi|evan|nathan|gordon|lee|jamie|malcolm|eddy|reed|rocko|grandpa|albert|ralph|junior|david|mark|guy|ryan|george|male|\bman\b/i;
export function voiceGender(v) { const n = v.name + ' ' + v.voiceURI; return FEMALE.test(n) ? 'f' : MALE.test(n) ? 'm' : ''; }
// If the learner picked a specific voice, partners are chosen to match it.
export function forcedGender() {
  const chosen = englishVoices().find(v => v.voiceURI === S.settings.voice);
  return chosen ? voiceGender(chosen) : '';
}
function pickVoice(gender) {
  let list = englishVoices();
  if (!list.length) return null;
  const chosen = list.find(v => v.voiceURI === S.settings.voice);
  if (chosen) return chosen;
  // Prefer a voice in the accent the learner chose (Indian, British or Australian English).
  const want = { in: /^en[-_]IN/i, uk: /^en[-_]GB/i, au: /^en[-_]AU/i }[S.settings.accent || 'in'];
  if (want) { const local = list.filter(v => want.test(v.lang)); if (local.length) list = local; }
  if (gender) { const same = list.filter(v => voiceGender(v) === gender); if (same.length) list = same; }
  // The downloadable Premium / Enhanced iPhone voices sound far more human than the compact defaults.
  const human = list.find(v => /premium/i.test(v.name + v.voiceURI)) || list.find(v => /enhanced/i.test(v.name + v.voiceURI)) || list.find(v => /natural|neural/i.test(v.name));
  if (human) return human;
  const pref = gender === 'm' ? ['Rishi', 'Daniel', 'Lee', 'Aaron', 'Arthur', 'Alex', 'Rishi', 'Microsoft David', 'Microsoft Mark', 'Google UK English Male']
    : ['Isha', 'Veena', 'Kate', 'Serena', 'Karen', 'Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Microsoft Zira'];
  for (const p of pref) { const v = list.find(x => x.name.includes(p)); if (v) return v; }
  return list.find(v => /en[-_]US/i.test(v.lang)) || list[0];
}
let speakToken = 0;
export function stopSpeaking() { speakToken++; try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } speechEvents.dispatchEvent(new Event('end')); }
export function speak(text, opts = {}) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window) || !text) return resolve(false);
    stopSpeaking();
    const my = speakToken;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.gender || 'f');
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = opts.rate || S.settings.rate || 1;
    let done = false;
    const finish = ok => { if (done) return; done = true; clearTimeout(timer); if (my === speakToken) speechEvents.dispatchEvent(new Event('end')); resolve(ok && my === speakToken); };
    u.onstart = () => speechEvents.dispatchEvent(new Event('start'));
    u.onboundary = () => speechEvents.dispatchEvent(new Event('boundary'));
    setTimeout(() => { if (!done && my === speakToken) speechEvents.dispatchEvent(new Event('start')); }, 60); // some iOS versions never fire 'start'
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    // iOS sometimes never fires 'end'; never let the app hang on it.
    const timer = setTimeout(() => finish(true), 4000 + (text.split(/\s+/).length / (2.2 * u.rate)) * 1000);
    try { speechSynthesis.speak(u); } catch (e) { finish(false); }
  });
}

/* ---------- One microphone for the whole session ---------- */
// iPhone asks for permission every time a page opens the mic. So open it once and keep it:
// the question appears at most once per launch instead of before every answer.
let micStream = null, micPending = null;
export function getMic() {
  if (micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')) return Promise.resolve(micStream);
  if (micPending) return micPending;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('Microphone is not available in this browser.'));
  micPending = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then(st => { micStream = st; return st; }).finally(() => { micPending = null; });
  return micPending;
}

/* ---------- Microphone capture as 16 kHz PCM ---------- */
export class Recorder {
  constructor() { this.level = 0; this.noise = 0.02; this.talking = false; this.chunks = []; this.active = false; }
  async start() {
    this.stream = await getMic();
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') {
      await Promise.race([this.ctx.resume(), new Promise(r => setTimeout(r, 600))]);
      if (this.ctx.state !== 'running') { // iOS refuses audio that was not started by a tap
        try { this.ctx.close(); } catch (e) { /* ignore */ }
        throw new Error('needs-tap');
      }
    }
    this.rate = this.ctx.sampleRate;
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = ev => {
      const d = ev.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(d));
      let s = 0;
      for (let i = 0; i < d.length; i += 8) s += d[i] * d[i];
      const raw = Math.sqrt(s / (d.length / 8));
      this.level = Math.min(1, raw * 6);
      // Adaptive voice detection: follow the room's background noise and call it speech only when clearly above it.
      this.noise = raw < this.noise ? raw * 0.5 + this.noise * 0.5 : this.noise * 0.995 + raw * 0.005;
      this.talking = raw > Math.max(0.012, this.noise * 2.6);
    };
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.src.connect(this.node);
    this.node.connect(mute);
    mute.connect(this.ctx.destination);
    this.started = performance.now();
    this.active = true;
  }
  elapsed() { return this.active ? (performance.now() - this.started) / 1000 : 0; }
  async stop() {
    if (!this.active) return null;
    this.active = false;
    const duration = (performance.now() - this.started) / 1000;
    try { this.node.disconnect(); this.src.disconnect(); } catch (e) { /* ignore */ }
    try { await this.ctx.close(); } catch (e) { /* ignore */ }
    let len = 0;
    for (const c of this.chunks) len += c.length;
    const full = new Float32Array(len);
    let o = 0;
    for (const c of this.chunks) { full.set(c, o); o += c.length; }
    this.chunks = [];
    const pcm = resample(full, this.rate, 16000);
    return { pcm, duration, blob: wavBlob(pcm, 16000) };
  }
  cancel() { if (this.active) this.stop(); }
}

function resample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to;
  const n = Math.floor(data.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(data.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += data[j];
    out[i] = b > a ? s / (b - a) : data[a] || 0;
  }
  return out;
}

function wavBlob(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------- Worker bridge shared by speech recognition and the AI partner ---------- */
class Bridge {
  constructor(url) { this.url = url; this.worker = null; this.pending = new Map(); this.seq = 0; this.onProgress = null; this.onToken = null; }
  ensure() {
    if (this.worker) return;
    this.worker = new Worker(this.url, { type: 'module' });
    this.worker.onmessage = e => {
      const d = e.data;
      if (d.type === 'progress') { if (this.onProgress) this.onProgress(d); return; }
      if (d.type === 'token') { if (this.onToken) this.onToken(d.text); return; }
      const p = this.pending.get(d.id);
      if (!p) return;
      this.pending.delete(d.id);
      if (d.type === 'error') p.reject(new Error(d.message)); else p.resolve(d);
    };
    this.worker.onerror = e => {
      const err = new Error(e.message || 'The engine stopped unexpectedly.');
      this.pending.forEach(p => p.reject(err));
      this.pending.clear();
      this.reset();
    };
  }
  call(msg, transfer) {
    this.ensure();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id }, transfer || []);
    });
  }
  reset() { if (this.worker) { this.worker.terminate(); this.worker = null; } }
}

export const STT_MODELS = {
  'onnx-community/whisper-base.en': { label: 'Accurate', size: '77 MB' },
  'onnx-community/whisper-tiny.en': { label: 'Fast', size: '41 MB' },
};
export const LLM_MODELS = {
  'onnx-community/Qwen2.5-0.5B-Instruct': { label: 'Compact partner', size: '483 MB' },
  'onnx-community/Llama-3.2-1B-Instruct-q4f16': { label: 'Smarter partner', size: '1.2 GB' },
};

const sttBridge = new Bridge(new URL('./stt-worker.js', import.meta.url));
const llmBridge = new Bridge(new URL('./llm-worker.js', import.meta.url));

export const stt = {
  loaded: false, loading: null,
  get installed() { return !!S.packs.stt && S.packs.stt === S.settings.sttModel; },
  async load(onProgress) {
    if (this.loaded === S.settings.sttModel) return true;
    if (this.loading) { sttBridge.onProgress = onProgress || sttBridge.onProgress; return this.loading; }
    sttBridge.onProgress = onProgress || null;
    const model = S.settings.sttModel;
    this.loading = sttBridge.call({ type: 'load', model }).then(() => {
      this.loaded = model; S.packs.stt = model; save(); return true;
    }).finally(() => { this.loading = null; });
    return this.loading;
  },
  async transcribe(pcm) {
    await this.load();
    const copy = new Float32Array(pcm);
    const r = await sttBridge.call({ type: 'transcribe', pcm: copy }, [copy.buffer]);
    return cleanTranscript(r.text);
  },
  // Warm the model in the background once it is installed, so the first answer is fast.
  warm() { if (this.installed && !this.loaded && !this.loading) this.load().catch(() => {}); },
};

function cleanTranscript(t) {
  t = (t || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(you|thank you\.?|thanks for watching\.?|\.)$/i.test(t)) return ''; // typical output for silence
  return t;
}

export const llm = {
  loaded: false, loading: null,
  get supported() { return 'gpu' in navigator; },
  get installed() { return !!S.packs.llm && S.packs.llm === S.settings.llmModel; },
  async load(onProgress) {
    if (this.loaded === S.settings.llmModel) return true;
    if (this.loading) return this.loading;
    llmBridge.onProgress = onProgress || null;
    const model = S.settings.llmModel;
    this.loading = llmBridge.call({ type: 'load', model }).then(() => {
      this.loaded = model; S.packs.llm = model; save(); return true;
    }).catch(err => { llmBridge.reset(); throw err; }).finally(() => { this.loading = null; });
    return this.loading;
  },
  async chat(messages, onToken, maxTokens) {
    await this.load();
    llmBridge.onToken = onToken || null;
    const r = await llmBridge.call({ type: 'chat', messages, maxTokens });
    return r.text;
  },
  unload() { llmBridge.reset(); this.loaded = false; },
};

export async function removePack(kind) {
  if (kind === 'llm') { llm.unload(); S.packs.llm = ''; } else { sttBridge.reset(); stt.loaded = false; S.packs.stt = ''; }
  save();
  // Model files live in the transformers.js cache; clear the ones for this kind.
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    const pat = kind === 'llm' ? /Qwen|Llama/i : /whisper/i;
    await Promise.all(keys.filter(k => pat.test(k.url)).map(k => cache.delete(k)));
  } catch (e) { /* ignore */ }
}
