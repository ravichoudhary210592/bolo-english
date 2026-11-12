// Speak tab: role-plays, AI partner, topic talks.
import { S, save, logSession, markDone, dayKey } from './store.js';
import { SCENARIOS } from './data/scenarios.js';
import { TOPICS } from './data/content.js';
import { llm, LLM_MODELS, speak, stopSpeaking } from './speech.js';
import { $, $$, esc, I, push, pop, replace, sheet, toast, micDock, analyse, feedbackHTML, sampleHTML, issuesHTML, playBlob, mb, fmtMin } from './ui.js';
import { conversation } from './talk.js';
import { personFor, faceSVG, coach } from './avatar.js';
import { stt } from './speech.js';
import { speechSetup } from './ui.js';

let seg = 'role', cat = 'All', topicCat = 'All';

export function planFlag(k) {
  const d = dayKey();
  if (!S.plan || S.plan.date !== d) S.plan = { date: d };
  if (k) { S.plan[k] = true; save(); }
  return S.plan;
}
export const scenarioOfDay = () => SCENARIOS[Math.floor(Date.now() / 86400000) % SCENARIOS.length];

export function speakTab(page) {
  const cats = ['All', ...new Set(SCENARIOS.map(s => s.category))];
  const tcats = ['All', ...new Set(TOPICS.map(t => t.category))];
  let body = `<div class="big-title"><div><div class="sub">Pick a situation, or just chat</div><h1>Let's talk</h1></div></div>
    <div class="seg">${[['role', 'Role-plays'], ['ai', 'Free talk'], ['topic', 'Topics']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="seg" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (seg === 'role') {
    const list = SCENARIOS.filter(s => cat === 'All' || s.category === cat);
    body += `<div class="chips">${cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-act="cat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="list">${list.map(s => `<button class="item" data-act="open" data-id="${s.id}"><div class="badge">${s.emoji}</div><div class="grow"><div class="t">${esc(s.title)}<span class="lvl">${s.level}</span></div><div class="d">${esc(s.summary)}</div></div>${S.done[s.id] ? `<div class="check on">${I.check}</div>` : `<span class="chev">${I.chev}</span>`}</button>`).join('')}</div>`;
  } else if (seg === 'ai') {
    const info = LLM_MODELS[S.settings.llmModel];
    body += `<div class="hero"><div class="label">Free talk</div><div style="font-size:24px;font-weight:800;margin:6px 0 8px;position:relative;z-index:1">Say anything. Get a real reply.</div>
      <div style="opacity:.92;position:relative;z-index:1">An unscripted partner who listens, reacts and asks back — like a call with a friend or colleague. It runs entirely on your iPhone, so it works offline and stays private.</div></div><div class="gap"></div>`;
    if (!llm.supported) body += `<div class="banner w"><div class="badge w">${I.alert}</div><div class="grow"><div class="t">Not available on this device</div><div class="d">Free talk needs iOS 26 or later. Role-plays and everything else work without it.</div></div></div>`;
    else if (!llm.installed) body += `<button class="banner tap" data-act="getai"><div class="badge">${I.down}</div><div class="grow"><div class="t">Download the free-talk partner · ${info.size}</div><div class="d">One-time download on Wi-Fi. It is a small on-device model, so replies are short and simple.</div></div><span class="chev">${I.chev}</span></button>`;
    body += `<div class="list"><button class="item" data-act="ai" data-id=""><div class="badge">💬</div><div class="grow"><div class="t">Just chat</div><div class="d">Catch up with Maya about your day, plans, work — anything.</div></div><span class="chev">${I.chev}</span></button>
      ${SCENARIOS.map(s => `<button class="item" data-act="ai" data-id="${s.id}"><div class="badge">${s.emoji}</div><div class="grow"><div class="t">${esc(s.title)}<span class="lvl">${s.level}</span></div><div class="d">You: ${esc(s.you)} · with the ${esc(s.partner)}</div></div><span class="chev">${I.chev}</span></button>`).join('')}</div>`;
  } else {
    const list = TOPICS.filter(t => topicCat === 'All' || t.category === topicCat);
    body += `<div class="chips">${tcats.map(c => `<button class="chip ${c === topicCat ? 'on' : ''}" data-act="tcat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <button class="btn soft" data-act="random">${I.swap} Surprise me with a topic</button><div class="gap"></div>
      <div class="list">${list.map(t => `<button class="item plain" data-act="topic" data-id="${t.id}"><div class="grow"><div class="t" style="font-weight:560">${esc(t.prompt)}</div><div class="d">${esc(t.category)} · ${t.level}</div></div>${S.done[t.id] ? `<div class="check on">${I.check}</div>` : `<span class="chev">${I.chev}</span>`}</button>`).join('')}</div>`;
  }
  page.el.innerHTML = `<div class="scroll">${body}</div>`;
  page.body = $('.scroll', page.el);
  page.on({
    seg: b => { seg = b.dataset.k; speakTab(page); page.body.scrollTop = 0; },
    cat: b => { cat = b.dataset.c; speakTab(page); },
    tcat: b => { topicCat = b.dataset.c; speakTab(page); },
    open: b => openScenario(b.dataset.id),
    ai: b => startAI(SCENARIOS.find(s => s.id === b.dataset.id) || null),
    getai: () => aiSetup(() => speakTab(page)),
    topic: b => openTopic(TOPICS.find(t => t.id === b.dataset.id)),
    random: () => openTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]),
  });
}

export function openScenario(id) {
  const s = SCENARIOS.find(x => x.id === id);
  if (!s) return;
  const who = personFor(s.id);
  push(page => {
    page.set({
      title: s.category,
      body: `<div class="center" style="padding:14px 0 6px"><div class="meet">${faceSVG(who, 112)}<span>${s.emoji}</span></div><h1 style="font-size:27px;font-weight:800;letter-spacing:-.02em;margin-top:12px">Let's talk: ${esc(s.title)}</h1><p class="muted" style="margin-top:6px">${esc(s.summary)}</p></div>
        <div class="gap"></div><div class="card center"><b>${esc(who.name)}</b> will be the ${esc(s.partner.toLowerCase())}. You are the ${esc(s.you.toLowerCase())}.<div class="muted small" style="margin-top:4px">Just speak naturally — ${esc(who.name)} listens and replies.</div></div>
        <div class="sec"><h3>Handy things to say</h3><span class="muted small">Tap to hear</span></div>
        <div class="list">${s.phrases.map(p => `<button class="item plain" data-act="say" data-text="${esc(p)}"><div class="grow sel" style="font-size:16px">${esc(p)}</div><span style="color:var(--accent)">${I.speaker}</span></button>`).join('')}</div>
        <div class="gap"></div><p class="muted small center">About ${Math.round(s.turns.length * 0.8)} minutes · level ${s.level}</p>`,
      footer: `<div class="footer"><button class="btn" data-act="start">${I.mic} Let's talk</button>${llm.installed ? `<div class="gap"></div><button class="btn soft" data-act="ai">${I.spark} Unscripted version</button>` : ''}</div>`,
    });
    page.on({
      say: b => speak(b.dataset.text, { gender: who.g }),
      start: () => withSpeech(() => push(p => conversation(p, s, false))),
      ai: () => startAI(s),
    });
  });
}

/* ---------- AI partner ---------- */
export function aiSetup(done) {
  const info = LLM_MODELS[S.settings.llmModel];
  const s = sheet(`<h3>Download the free-talk partner</h3>
    <p class="muted">A small language model (${info.size}) that runs on your iPhone's graphics chip. Download it once on Wi-Fi; afterwards it works offline. It needs free storage and may be slow to start the first time.</p><div class="gap"></div>
    <div class="card"><div class="row"><div class="badge">${I.spark}</div><div class="grow"><div class="b">${info.label}</div><div class="small muted" id="ai-status">Keep the app open while it downloads.</div></div></div><div class="gap"></div><div class="progress"><i id="ai-bar" style="width:0%"></i></div></div>
    <div class="gap"></div><button class="btn" data-act="get">Download</button><div class="gap"></div><button class="btn ghost" data-act="close">Not now</button>`, {
    get: async btn => {
      btn.disabled = true; btn.textContent = 'Downloading…'; s.locked = true;
      try {
        await llm.load(p => {
          if (!p.total) return;
          $('#ai-bar', s.el).style.width = Math.min(100, (p.loaded / p.total) * 100) + '%';
          $('#ai-status', s.el).textContent = p.loaded >= p.total ? 'Preparing the model…' : mb(p.loaded) + ' of ' + mb(p.total);
        });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        toast('Ready — let us talk');
        s.close();
        if (done) done();
      } catch (err) {
        s.locked = false; btn.disabled = false; btn.textContent = 'Try again';
        $('#ai-status', s.el).textContent = navigator.onLine ? 'Could not start: ' + err.message : 'You are offline. Connect once to download.';
      }
    },
  });
}
// Conversations are voice only, so the speech pack must be there first.
function withSpeech(go) { if (stt.installed) go(); else speechSetup(go); }
function startAI(scn) {
  if (!llm.supported) return toast('Free talk needs iOS 26 or later. Pick a role-play instead.', 3800);
  if (!llm.installed) return aiSetup(() => withSpeech(() => push(p => conversation(p, scn, true))));
  withSpeech(() => push(p => conversation(p, scn, true)));
}

/* ---------- Topic talk ---------- */
export function openTopic(t) {
  if (!t) return;
  push(page => {
    let result = null;
    const render = () => {
      page.set({
        title: "Let's talk about…",
        body: `<div class="card" style="margin-top:8px"><div class="tiny b muted" style="text-transform:uppercase;letter-spacing:.06em">${esc(t.category)} · ${t.level}</div>
          <div style="font-size:22px;font-weight:750;line-height:1.25;margin-top:6px" class="sel">${esc(t.prompt)}</div>
          <div class="gap"></div>${t.points.map(p => `<div class="tipline" style="margin-top:6px">${esc(p)}</div>`).join('')}</div>
          <div class="card"><div class="tiny b muted" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">You could start with</div>${t.starters.map(s => `<div class="sel" style="font-size:16px;margin-top:4px">“${esc(s)}”</div>`).join('')}</div>
          <div class="gap"></div><div class="progress"><i id="tt-bar" style="width:0%"></i></div><p class="muted small center" style="margin-top:8px">Take your time — try to keep going for a minute or two.</p>
          <div id="tt-out"></div>`,
      });
      const dock = micDock(page, {
        hint: 'Tap and tell me about it', maxSec: 120,
        onTick: s => { const b = page.$('#tt-bar'); if (b) b.style.width = Math.min(100, (s / 120) * 100) + '%'; },
        onResult: r => {
          result = analyse(r);
          logSession({ kind: 'Topic talk', title: t.prompt, sec: r.typed ? 0 : r.duration, score: r.typed ? null : result.fl.score, wpm: r.typed ? 0 : result.fl.wpm });
          markDone(t.id);
          const len = r.typed ? '' : `<div class="tipline">${r.duration >= 60 ? 'You kept going for over a minute — that is real fluency practice.' : 'Next time try to reach one full minute. Use the bullet points to keep going.'}</div>`;
          page.$('#tt-out').innerHTML = `<div class="sec"><h3>Your talk</h3>${result.blob ? `<button data-act="mine">Listen</button>` : ''}</div>
            ${r.typed ? '' : `<div class="grid" style="margin-bottom:12px"><div class="stat"><div class="v">${result.fl.score}</div><div class="k">Fluency score</div></div><div class="stat"><div class="v">${fmtMin(r.duration)}</div><div class="k">Speaking time</div></div></div>`}
            <div class="card sel" style="font-size:16px">${esc(result.text)}</div><div class="gap"></div>${feedbackHTML(result, len)}`;
          dock.setHint('Tap to try again');
          requestAnimationFrame(() => page.$('#tt-out').scrollIntoView({ behavior: 'smooth', block: 'start' }));
        },
      });
    };
    render();
    page.on({ mine: () => result && result.blob && playBlob(result.blob), say: b => speak(b.dataset.text) });
  });
}
