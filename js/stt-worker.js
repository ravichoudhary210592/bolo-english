// Speech-to-text worker: Whisper running on the device (WebAssembly). Audio never leaves the phone.
import { pipeline, env } from '../vendor/transformers.min.js';

env.allowLocalModels = false;
// One thread: measured faster than four for this model, and it needs no special server headers.
try { env.backends.onnx.wasm.numThreads = 1; } catch (e) { /* ignore */ }

let asr = null;
let loadedModel = '';

function progressReporter() {
  const files = {};
  let last = 0;
  return p => {
    if (!p || !p.file) return;
    if (p.status === 'progress' || p.status === 'done') {
      const f = files[p.file] || (files[p.file] = { loaded: 0, total: 0 });
      if (p.total) f.total = p.total;
      f.loaded = p.status === 'done' ? (f.total || f.loaded) : (p.loaded || 0);
      let loaded = 0, total = 0;
      for (const k in files) { loaded += files[k].loaded; total += files[k].total; }
      const now = Date.now();
      if (now - last > 120 || p.status === 'done') {
        last = now;
        self.postMessage({ type: 'progress', loaded, total });
      }
    }
  };
}

self.onmessage = async e => {
  const d = e.data;
  try {
    if (d.type === 'load') {
      if (!asr || loadedModel !== d.model) {
        asr = null;
        asr = await pipeline('automatic-speech-recognition', d.model, { dtype: 'q8', device: 'wasm', progress_callback: progressReporter() });
        loadedModel = d.model;
        // The first run is slow while the engine warms up; do it now on a second of silence, not on the learner's first answer.
        try { await asr(new Float32Array(16000), { max_new_tokens: 3 }); } catch (e) { /* ignore */ }
      }
      self.postMessage({ type: 'ready', id: d.id, model: loadedModel });
    } else if (d.type === 'transcribe') {
      if (!asr) throw new Error('Speech pack is not loaded');
      const long = d.pcm.length > 16000 * 28;
      // Cap the output length (people say at most ~4 words a second) so noise can never make it run on.
      const cap = Math.min(440, Math.round(Math.min(d.pcm.length / 16000, 30) * 8) + 24);
      const out = await asr(d.pcm, long ? { chunk_length_s: 30, stride_length_s: 5, max_new_tokens: 440 } : { max_new_tokens: cap });
      const text = (Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text || '').trim();
      self.postMessage({ type: 'result', id: d.id, text });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
  }
};
