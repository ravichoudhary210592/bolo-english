// On-device AI conversation partner: a small language model running on the phone's GPU (WebGPU).
import { pipeline, env, TextStreamer } from '../vendor/transformers.min.js';

env.allowLocalModels = false;

let gen = null;
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
      if (now - last > 150 || p.status === 'done') { last = now; self.postMessage({ type: 'progress', loaded, total }); }
    }
  };
}

self.onmessage = async e => {
  const d = e.data;
  try {
    if (d.type === 'load') {
      if (!gen || loadedModel !== d.model) {
        if (!self.navigator || !navigator.gpu) throw new Error('This device or iOS version does not support WebGPU, which the AI partner needs.');
        gen = null;
        gen = await pipeline('text-generation', d.model, { dtype: 'q4f16', device: 'webgpu', progress_callback: progressReporter() });
        loadedModel = d.model;
      }
      self.postMessage({ type: 'ready', id: d.id });
    } else if (d.type === 'chat') {
      if (!gen) throw new Error('AI partner is not loaded');
      const streamer = new TextStreamer(gen.tokenizer, {
        skip_prompt: true, skip_special_tokens: true,
        callback_function: t => self.postMessage({ type: 'token', id: d.id, text: t }),
      });
      const out = await gen(d.messages, {
        max_new_tokens: d.maxTokens || 90, do_sample: true, temperature: 0.7, top_p: 0.9, repetition_penalty: 1.15, streamer,
      });
      const g = out[0].generated_text;
      const text = Array.isArray(g) ? g[g.length - 1].content : String(g);
      self.postMessage({ type: 'result', id: d.id, text: (text || '').trim() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
  }
};
