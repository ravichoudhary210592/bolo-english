// The conversation screen. It is built to feel like talking to a person, not operating a machine:
// the partner has a name, reacts and speaks; the mic opens by itself when they stop; it notices when
// you have finished; and coaching waits until the conversation is over (unless you ask for it earlier).
import { S, logSession, markDone } from './store.js';
import { llm, speak, stopSpeaking } from './speech.js';
import { $, $$, esc, I, pop, replace, sheet, toast, micDock, analyse, feedbackHTML, metricsHTML, sampleHTML, issuesHTML, playBlob, fmtMin } from './ui.js';
import { keywordCoverage } from './analysis.js';
import { planFlag, scenarioOfDay } from './speak.js';
import { liveFace, personFor, coach } from './avatar.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

export const OPEN_CHAT = { id: 'open-chat', title: 'Just chat', emoji: '💬', partner: '', you: 'yourself',
  aiPrompt: 'You are a warm, curious friend catching up casually about their day, work, weekend plans and interests. You have your own life: you work in marketing, love cooking and long walks.',
  turns: [{ partner: "Hey! Good to hear your voice. So, how's your day going?", hint: 'Say how your day is and why', sample: '', keywords: [] }], phrases: [], closing: 'Anyway, I should let you go. Really nice talking to you!' };

export function conversation(page, scn, ai) {
  scn = scn || OPEN_CHAT;
  const P = scn === OPEN_CHAT ? coach() : personFor(scn.id);
  const person = P.name;
  const voice = { gender: P.g };
  // Some scripts introduce the partner by a name of their own ("I'm Sam"); use this partner's name instead.
  if (!scn._named) {
    const all = [scn.aiPrompt, scn.closing, ...scn.turns.map(t => t.partner)].join(' ');
    const m = all.match(/\b(?:I'm|I am|[Mm]y name is|[Mm]y name's|[Tt]his is|It's) (?!Sorry|Glad|Happy|Afraid|Sure|Here|Just|Not|So|Really|Still|Also|Calling|Going)([A-Z][a-z]{2,})\b/);
    scn._named = m ? m[1] : '-';
  }
  if (scn._named !== '-' && scn._named !== person) {
    const re = new RegExp('\\b' + scn._named + '\\b', 'g');
    scn = { ...scn, aiPrompt: scn.aiPrompt.replace(re, person), closing: (scn.closing || '').replace(re, person), turns: scn.turns.map(t => ({ ...t, partner: t.partner.replace(re, person) })) };
  }
  const who = person + (scn.partner ? ' · ' + scn.partner : '');
  const coachEach = S.settings.coachEach;
  const maxTurns = ai ? 10 : scn.turns.length;
  const answers = [];
  let idx = 0, waiting = false, ended = false, lastPartner = '';
  const started = Date.now();
  const msgs = [{ role: 'system', content:
    `Your name is ${person}. ${scn.aiPrompt} You are in a live spoken conversation with ${S.profile.name || 'someone'}${scn.you ? ' (' + scn.you + ')' : ''}. ` +
    `Talk the way people really talk: relaxed, warm, with contractions. First react in a few words to what they just said — agreement, surprise, a little humour, or a small detail about yourself — then keep things moving with one natural question or comment. ` +
    `Say one or two short sentences only. Never sound like an assistant: no "Great question", no "I'm here to help", no lists, no summaries, no advice about their English. You are a person, not an AI, and you never say otherwise.` }];

  page.set({ title: scn.title, right: `<button class="link" data-act="end" style="padding:8px 4px">End</button>`, body: `<div class="progress" style="margin-top:6px"><i id="cv-bar" style="width:0%"></i></div><div class="chat" id="chat"></div>` });
  const chat = page.$('#chat');
  // The partner's face sits above the conversation, like a video call.
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.innerHTML = `<div class="stage-face"></div><div class="stage-name">${esc(who)}</div>`;
  page.el.insertBefore(stage, page.body);
  const face = liveFace($('.stage-face', stage), P, 128);
  page.cleanup.push(() => face.destroy());
  const idleHint = () => (S.settings.handsFree && !coachEach ? 'Just speak when it is your turn' : 'Tap to answer');
  const dock = micDock(page, {
    hint: idleHint(), maxSec: 75, autoStop: S.settings.handsFree, onStart: () => face.set('listening'),
    right: { icon: I.bulb, act: 'hint', label: 'Hint' },
    onResult: r => onAnswer(r),
  });
  const scrollEnd = () => requestAnimationFrame(() => { page.body.scrollTop = page.body.scrollHeight; });
  const add = html => { chat.insertAdjacentHTML('beforeend', html); scrollEnd(); return chat.lastElementChild; };
  const typing = () => add(`<div class="bubble them"><div class="who">${esc(who)}</div><div class="tx"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
  const bar = () => { page.$('#cv-bar').style.width = (idx / maxTurns) * 100 + '%'; };

  async function partnerSays(text, { listen = true } = {}) {
    lastPartner = text;
    add(`<div class="bubble them"><div class="who">${esc(who)}</div><div class="sel tx">${esc(text)}</div><div class="tools"><button data-act="say" data-text="${esc(text)}">${I.speaker} Again</button><button data-act="slow" data-text="${esc(text)}">Slower</button></div></div>`);
    if (S.settings.autoSpeak) { dock.setHint(person + ' is speaking…'); face.set('speaking'); await speak(text, voice); }
    if (ended) return;
    face.set('idle');
    dock.setHint(idleHint());
    if (listen && S.settings.handsFree && !waiting) { await wait(250); if (!ended && !waiting) dock.listen(); }
  }

  function onAnswer(r) {
    if (waiting || ended) return;
    face.set('thinking');
    const a = analyse(r);
    const turn = scn.turns[Math.min(idx, scn.turns.length - 1)];
    a.q = lastPartner;
    a.sample = !ai && turn.sample ? turn.sample : '';
    a.kw = !ai && turn.keywords ? keywordCoverage(a.text, turn.keywords) : null;
    answers.push(a);
    const n = answers.length - 1;
    add(`<div class="bubble me sel">${esc(a.text)}</div>`);
    if (coachEach) {
      const tools = `<div class="btns" style="margin-top:12px">${a.blob ? `<button class="btn ghost sm" data-act="mine" data-n="${n}">${I.play} Me</button>` : ''}<button class="btn ghost sm" data-act="retry">Try again</button><button class="btn sm" data-act="next">Next</button></div>`;
      add(feedbackHTML(a, (a.sample ? sampleHTML('A natural answer', a.sample) : '') + tools));
      face.set('idle'); waiting = true; dock.enable(false); dock.setHint('Read the feedback, then tap Next');
      return;
    }
    // Natural flow: a quiet note under the bubble, and the conversation simply carries on.
    add(`<button class="peek" data-act="peek" data-n="${n}">${a.issues.length ? a.issues.length + ' tip' + (a.issues.length > 1 ? 's' : '') + ' for later' : 'Sounded natural'} ›</button>`);
    carryOn(a.text);
  }

  async function carryOn(userText) {
    waiting = true; dock.enable(false);
    idx++; bar();
    if (ai) return aiReply(userText);
    const t = typing();
    dock.setHint(person + ' is thinking…');
    await wait(650 + Math.random() * 600); // a human beat before replying
    t.remove();
    if (ended) return;
    waiting = false; dock.enable(true);
    if (idx >= scn.turns.length) return goodbye();
    partnerSays(scn.turns[idx].partner);
  }

  async function aiReply(userText) {
    msgs.push({ role: 'user', content: userText });
    if (idx >= maxTurns) { waiting = false; dock.enable(true); return goodbye(); }
    dock.setHint(llm.loaded ? person + ' is thinking…' : person + ' is joining…');
    const el = typing();
    const tx = $('.tx', el);
    let acc = '';
    try {
      const text = await llm.chat(msgs.slice(0, 1).concat(msgs.slice(-8)), tk => { acc += tk; tx.textContent = acc; scrollEnd(); }, 80);
      let clean = (text || acc).replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim();
      if (!clean || /\b(as an ai|language model|i am an ai|i'm an ai|virtual assistant)\b/i.test(clean)) clean = 'Sorry, I lost my train of thought for a second. What were you saying?';
      msgs.push({ role: 'assistant', content: clean });
      el.remove();
      waiting = false; dock.enable(true);
      if (!ended) await partnerSays(clean);
    } catch (err) {
      el.remove(); waiting = false; dock.enable(true);
      face.set('idle');
      toast(person + ' could not reply: ' + err.message, 4500);
      dock.setHint(idleHint());
    }
  }

  async function goodbye() {
    waiting = true; dock.enable(false);
    if (scn.closing) { await partnerSays(scn.closing, { listen: false }); if (!S.settings.autoSpeak) await wait(1400); else await wait(500); }
    finish(true);
  }

  function next() { // coach-after-every-answer mode
    waiting = false; dock.enable(true);
    $$('[data-act="next"], [data-act="retry"]', chat).forEach(b => b.remove());
    idx++; bar();
    if (ai) { waiting = true; dock.enable(false); return aiReply(answers[answers.length - 1].text); }
    if (idx >= scn.turns.length) return goodbye();
    partnerSays(scn.turns[idx].partner);
  }

  function finish(natural) {
    if (ended && !natural) return;
    ended = true; stopSpeaking();
    if (!answers.length) return pop();
    const sec = answers.reduce((s, a) => s + (a.typed ? 0 : a.duration), 0);
    const spoken = answers.filter(a => !a.typed && a.fl.words >= 5);
    const wpm = spoken.length ? Math.round(spoken.reduce((s, a) => s + a.fl.wpm, 0) / spoken.length) : 0;
    const score = spoken.length ? Math.round(spoken.reduce((s, a) => s + a.fl.score, 0) / spoken.length) : null;
    const words = answers.reduce((s, a) => s + a.fl.words, 0);
    const issues = [];
    answers.forEach(a => a.issues.forEach(i => { if (!issues.find(x => x.found.toLowerCase() === i.found.toLowerCase())) issues.push(i); }));
    logSession({ kind: ai ? 'Free talk' : 'Role-play', title: scn.title, sec: sec || (Date.now() - started) / 1000, score, wpm });
    if (natural) { markDone(scn.id); if (scn.id === scenarioOfDay().id) planFlag('rp'); }
    replace(p => {
      p.set({
        title: 'How it went', backLabel: 'Done',
        body: `<div class="center" style="padding:16px 0 8px"><div style="font-size:56px">${natural ? '🎉' : '👍'}</div><h1 style="font-size:26px;font-weight:800;margin-top:6px">${natural ? 'Good conversation' : 'Nice practice'}</h1><p class="muted" style="margin-top:4px">with ${esc(person)}</p></div><div class="gap"></div>
          <div class="grid"><div class="stat"><div class="v">${score === null ? '–' : score}</div><div class="k">Fluency score</div></div><div class="stat"><div class="v">${wpm || '–'}</div><div class="k">Words per minute</div></div>
          <div class="stat"><div class="v">${words}</div><div class="k">Words spoken</div></div><div class="stat"><div class="v">${fmtMin(sec)}</div><div class="k">Speaking time</div></div></div>
          <div class="sec"><h3>${issues.length ? 'Fix these next time' : 'No slips caught'}</h3></div>
          ${issues.length ? `<div class="card" style="padding-top:5px">${issuesHTML(issues)}</div>` : `<div class="card muted">The checker looks for the most common mistakes and found none. Compare your answers with the natural versions below to polish your phrasing.</div>`}
          <div class="sec"><h3>Your answers</h3></div>
          ${answers.map((a, n) => `<div class="card"><p class="muted small">${esc(person)}: ${esc(a.q)}</p><div class="sel" style="font-size:16.5px;margin:6px 0 10px">${esc(a.text)}</div>${metricsHTML(a)}${a.tips.map(t => `<div class="tipline">${esc(t)}</div>`).join('')}${a.sample ? sampleHTML('A natural answer', a.sample) : ''}${a.blob ? `<div class="gap"></div><button class="btn ghost sm" data-act="mine" data-n="${n}" style="width:100%">${I.play} Hear yourself</button>` : ''}</div>`).join('')}
          <div class="gap"></div><p class="muted small center">A comfortable conversational pace is 125–165 words per minute.</p>`,
        footer: `<div class="footer"><div class="btns"><button class="btn ghost" data-act="again">Talk again</button><button class="btn" data-act="back">Done</button></div></div>`,
      });
      p.on({
        again: () => replace(pp => conversation(pp, scn === OPEN_CHAT ? null : scn, ai)),
        say: b => speak(b.dataset.text, voice),
        mine: b => playBlob(answers[+b.dataset.n].blob),
      });
    });
  }

  page.on({
    say: b => { face.set('speaking'); speak(b.dataset.text, voice).then(() => face.set('idle')); },
    slow: b => { face.set('speaking'); speak(b.dataset.text, { rate: 0.75, gender: P.g }).then(() => face.set('idle')); },
    hint: () => {
      const turn = scn.turns[Math.min(idx, scn.turns.length - 1)];
      const h = ai && idx > 0 ? 'Answer, add a reason or a small story, then ask something back.' : turn.hint;
      sheet(`<h3>Stuck?</h3><p style="font-size:17px">${esc(h || 'Answer in two or three sentences.')}</p>${!ai && turn.sample ? `<div class="gap"></div><button class="btn soft" data-act="show">Show one way to answer</button><div id="smp"></div>` : ''}
        ${scn.phrases.length ? `<div class="sec"><h3 style="font-size:17px">Phrases you can use</h3></div><div class="list">${scn.phrases.map(x => `<div class="item plain"><div class="grow sel">${esc(x)}</div></div>`).join('')}</div>` : ''}`, {
        show: b => { b.style.display = 'none'; $('#smp', b.parentNode).innerHTML = sampleHTML('One way to answer', turn.sample); },
        say: b => speak(b.dataset.text),
      });
    },
    peek: b => {
      const a = answers[+b.dataset.n];
      sheet(`<h3>Coach's note</h3><div class="card sel">“${esc(a.text)}”</div><div class="gap"></div>${feedbackHTML(a, a.sample ? sampleHTML('A natural answer', a.sample) : '')}<div class="gap"></div><button class="btn" data-act="close">Back to the conversation</button>`, { say: x => speak(x.dataset.text) });
    },
    mine: b => playBlob(answers[+b.dataset.n].blob),
    retry: b => {
      const fb = b.closest('.fb'); const me = fb.previousElementSibling;
      fb.remove(); if (me) me.remove(); answers.pop();
      face.set('idle'); waiting = false; dock.enable(true); dock.setHint('Tap to answer again');
    },
    next,
    end: () => finish(false),
    back: () => { ended = true; pop(); },
  });

  setTimeout(() => { if (!ended) partnerSays(scn.turns[0].partner); }, 450);
  if (ai) { msgs.push({ role: 'assistant', content: scn.turns[0].partner }); llm.load().catch(() => {}); }
}
