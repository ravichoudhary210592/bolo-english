// Practice tab (drills) and Words tab (vocabulary with spaced repetition).
import { S, save, logPractice, logSession, markDone, srsGrade, srsDue, srsStats } from './store.js';
import { SHADOW, SOUNDS, VOCAB, PHRASES, TWISTERS, LISTEN, UPGRADES, FILLERS } from './data/content.js';
import { speak } from './speech.js';
import { $, $$, esc, I, push, pop, replace, sheet, toast, micDock, analyse, feedbackHTML, playBlob, scoreClass, scoreWord } from './ui.js';
import { compare, words } from './analysis.js';
import { planFlag } from './speak.js';

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const ALLWORDS = [...VOCAB, ...PHRASES.map(p => ({ w: p.p, pos: p.type === 'idiom' ? 'idiom' : 'phrasal verb', meaning: p.meaning, hi: p.hi, example: p.example, tag: 'Phrases' }))];

export function practiceTab(page) {
  const open = S.mistakes.filter(m => !m.done).length;
  const tiles = [
    ['shadow', I.wave, '', 'Shadowing', 'Listen, repeat, and get a word-by-word score.'],
    ['sounds', I.ear, 'g', 'Sound lab', 'V/W, TH, Z, S/SH — sounds Hindi speakers mix up.'],
    ['upgrade', I.spark, 'w', 'Say it better', 'Swap stiff phrases for natural ones.'],
    ['listen', I.speaker, '', 'Listening', 'Short clips with quick questions.'],
    ['twist', I.twist, 'r', 'Tongue twisters', 'Warm up your mouth and speed.'],
    ['phrases', I.chat, 'g', 'Conversation phrases', 'Buy time, agree, disagree politely.'],
  ];
  page.el.innerHTML = `<div class="scroll"><div class="big-title"><div><div class="sub">Short warm-ups for your voice and ear</div><h1>Practice</h1></div></div>
    <button class="banner tap ${open ? 'w' : ''}" data-act="mistakes"><div class="badge ${open ? 'w' : 'g'}">${open ? I.alert : I.check}</div><div class="grow"><div class="t">${open ? open + ' mistake' + (open > 1 ? 's' : '') + ' to review' : 'My mistakes'}</div><div class="d">${open ? 'Slips the app caught in your own speech.' : 'Slips caught in your speech will collect here.'}</div></div><span class="chev">${I.chev}</span></button>
    <div class="grid">${tiles.map(([k, ic, c, t, d]) => `<button class="tile tap" data-act="${k}"><div class="badge ${c}">${ic}</div><div><div class="t">${t}</div><div class="d">${d}</div></div></button>`).join('')}</div></div>`;
  page.body = $('.scroll', page.el);
  page.on({
    shadow: () => shadowPicker(),
    sounds: () => soundsList(),
    upgrade: () => repeatDrill({ title: 'Say it better', kind: 'Say it better', items: shuffle(UPGRADES).slice(0, 8).map(u => ({ text: u.better, pre: 'Instead of', plain: u.plain, note: u.note, hidden: true })) }),
    listen: () => listenList(),
    twist: () => repeatDrill({ title: 'Tongue twisters', kind: 'Tongue twisters', items: shuffle(TWISTERS).slice(0, 6).map(t => ({ text: t.text, pre: 'Focus: ' + t.focus })) }),
    phrases: () => phrasesPage(),
    mistakes: () => mistakesPage(),
  });
}

export function shadowPicker() {
  const s = sheet(`<h3>Shadowing</h3><p class="muted">Listen to a sentence, then say it the same way. Choose a level.</p><div class="gap"></div>
    <div class="list">${[['B1', 'Comfortable', 'Everyday sentences'], ['B2', 'Stretch', 'Longer, more idiomatic'], ['C1', 'Advanced', 'Complex and fast'], ['', 'Mixed', 'A bit of everything']].map(([l, t, d]) => `<button class="item plain" data-act="go" data-l="${l}"><div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div>${l ? `<span class="lvl">${l}</span>` : ''}</button>`).join('')}</div>`, {
    go: b => { s.close(); startShadow(b.dataset.l); },
  });
}
export function startShadow(level) {
  const pool = SHADOW.filter(x => !level || x.level === level);
  repeatDrill({ title: 'Shadowing', kind: 'Shadowing', plan: 'sh', items: shuffle(pool).slice(0, 6).map(x => ({ text: x.text, pre: x.topic })) });
}

/* ---------- Listen-and-repeat drill with word-level scoring ---------- */
export function repeatDrill({ title, kind, items, plan }) {
  push(page => {
    let i = 0, last = null;
    const scores = [];
    const t0 = Date.now();
    page.set({ title, body: `<div class="progress" style="margin-top:6px"><i id="d-bar"></i></div><div id="d-main"></div>` });
    const dock = micDock(page, { hint: 'Listen first, then tap and repeat', maxSec: 30, right: { icon: I.skip, act: 'next', label: 'Next' }, onResult: r => onSaid(r) });

    function show() {
      const it = items[i];
      last = null;
      page.$('#d-bar').style.width = (i / items.length) * 100 + '%';
      page.$('#d-main').innerHTML = `<p class="muted small center" style="margin:14px 0 6px">${i + 1} of ${items.length}${it.pre && !it.plain ? ' · ' + esc(it.pre) : ''}</p>
        ${it.plain ? `<div class="card center"><div class="tiny b muted" style="text-transform:uppercase;letter-spacing:.06em">${esc(it.pre)}</div><div style="font-size:19px;margin-top:4px;text-decoration:line-through;text-decoration-color:var(--bad)">${esc(it.plain)}</div></div><div class="gap"></div>` : ''}
        <div class="card"><div id="d-target" class="target sel">${it.hidden ? `<span class="muted" style="font-size:18px;font-weight:500">How would you say it naturally?</span>` : spans(it.text)}</div>
          <div class="btns" style="margin-top:12px">${it.hidden ? `<button class="btn soft sm" data-act="reveal">Show answer</button>` : `<button class="btn soft sm" data-act="hear">${I.speaker} Listen</button><button class="btn ghost sm" data-act="slow">Slow</button>`}</div></div>
        <div id="d-res"></div>`;
      dock.setHint(it.hidden ? 'Try it, or tap Show answer' : 'Listen first, then tap and repeat');
      if (!it.hidden && S.settings.autoSpeak) speak(it.text);
    }
    const spans = (text, toks) => (toks || text.split(/\s+/).map(w => ({ w }))).map(t => `<span class="w ${t.ok === undefined ? '' : t.ok ? 'ok' : 'no'}">${esc(t.w)}</span>`).join(' ');
    function reveal() {
      const it = items[i];
      if (!it.hidden) return;
      it.hidden = false;
      page.$('#d-target').innerHTML = spans(it.text);
      const row = page.$('#d-target').nextElementSibling;
      row.innerHTML = `<button class="btn soft sm" data-act="hear">${I.speaker} Listen</button><button class="btn ghost sm" data-act="slow">Slow</button>`;
      if (it.note) row.insertAdjacentHTML('afterend', `<p class="muted small center" style="margin-top:10px">${esc(it.note)}</p>`);
    }
    function onSaid(r) {
      const it = items[i];
      const wasHidden = it.hidden;
      reveal();
      const c = compare(it.text, r.text);
      last = { r, c };
      scores[i] = Math.max(scores[i] || 0, c.score);
      logPractice({ sec: r.duration, words: words(r.text).length, pron: c.score });
      page.$('#d-target').innerHTML = spans(it.text, c.tokens);
      page.$('#d-res').innerHTML = `<div class="gap"></div><div class="card center"><div class="score" style="color:var(--${scoreClass(c.score) === 'g' ? 'good' : scoreClass(c.score) === 'w' ? 'warn' : 'bad'})">${c.score}<small>%</small></div>
        <div class="b" style="margin-top:4px">${scoreWord(c.score)}</div>
        <p class="muted small sel" style="margin-top:8px">I heard: “${esc(r.text)}”</p>
        ${c.missed.length ? `<div class="metrics" style="justify-content:center;margin-top:10px">${[...new Set(c.missed)].slice(0, 6).map(w => `<button class="metric r" data-act="word" data-text="${esc(w)}">${I.speaker.replace('width="24" height="24"', 'width="14" height="14"')} ${esc(w)}</button>`).join('')}</div><p class="tiny muted" style="margin-top:6px">Tap a word to hear it, then try again.</p>` : wasHidden ? '' : ''}
        <div class="btns" style="margin-top:12px"><button class="btn ghost sm" data-act="mine">${I.play} Me</button><button class="btn sm" data-act="next">${i + 1 < items.length ? 'Next' : 'Finish'}</button></div></div>`;
      dock.setHint(c.score >= 85 ? 'Great — tap Next, or try once more' : 'Tap to try again');
      requestAnimationFrame(() => { page.body.scrollTop = page.body.scrollHeight; });
    }
    function next() {
      if (dock.busy) return;
      i++;
      if (i < items.length) return show();
      const done = scores.filter(s => s !== undefined);
      const avg = done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null;
      if (done.length) { logSession({ kind, title, sec: (Date.now() - t0) / 1000 * 0.5, score: avg }); if (plan) planFlag(plan); }
      replace(p => {
        p.set({ title: 'Done', backLabel: 'Done', body: `<div class="center" style="padding:40px 0 10px"><div style="font-size:56px">${avg === null ? '👋' : avg >= 80 ? '🎯' : '💪'}</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:8px">${avg === null ? 'Skipped' : scoreWord(avg)}</h1>
          ${avg === null ? '<p class="muted">You did not record any sentence this time.</p>' : `<div class="score" style="margin-top:14px">${avg}<small>%</small></div><p class="muted" style="margin-top:6px">average accuracy over ${done.length} sentence${done.length > 1 ? 's' : ''}</p>`}</div>`,
          footer: `<div class="footer"><button class="btn" data-act="back">Done</button></div>` });
      });
    }
    page.on({
      hear: () => speak(items[i].text), slow: () => speak(items[i].text, { rate: 0.7 }),
      word: b => speak(b.dataset.text, { rate: 0.8 }),
      mine: () => last && playBlob(last.r.blob), reveal, next,
    });
    show();
  });
}

/* ---------- Sound lab ---------- */
function soundsList() {
  push(page => {
    const draw = () => page.set({ title: 'Sound lab', body: `<p class="muted" style="margin:8px 2px 14px">Sounds that Hindi doesn't separate the way English does. Train your ear first, then your mouth.</p>
      <div class="list">${SOUNDS.map(s => `<button class="item plain" data-act="open" data-id="${s.id}"><div class="grow"><div class="t">${esc(s.title)}</div><div class="d">${esc(s.pairs.slice(0, 3).map(p => p.join(' / ')).join(' · '))}</div></div>${S.done['snd-' + s.id] ? `<div class="check on">${I.check}</div>` : `<span class="chev">${I.chev}</span>`}</button>`).join('')}</div>` });
    draw();
    page.refresh = draw;
    page.on({ open: b => soundLesson(SOUNDS.find(s => s.id === b.dataset.id)) });
  });
}
function soundLesson(s) {
  const canQuiz = s.pairs.every(p => p.length === 2);
  push(page => {
    page.set({ title: s.title, body: `<div class="card" style="margin-top:8px"><div class="row" style="align-items:flex-start"><div class="badge g">${I.bulb}</div><div class="grow"><div class="sel">${esc(s.tip)}</div>${S.settings.hindi ? `<div class="hi sel" style="margin-top:6px">${esc(s.tipHi)}</div>` : ''}</div></div></div>
      <div class="sec"><h3>Hear the difference</h3><span class="muted small">Tap a word</span></div>
      <div class="pair">${s.pairs.map(p => p.map(w => `<button class="word-btn tap" data-act="say" data-text="${esc(w)}" ${p.length === 1 ? 'style="grid-column:span 2"' : ''}>${esc(w)}</button>`).join('')).join('')}</div>`,
      footer: `<div class="footer"><div class="btns">${canQuiz ? `<button class="btn soft" data-act="quiz">Ear test</button>` : ''}<button class="btn" data-act="drill">Speak sentences</button></div></div>` });
    page.on({
      say: b => speak(b.dataset.text.toLowerCase(), { rate: 0.85 }),
      quiz: () => earQuiz(s),
      drill: () => { markDone('snd-' + s.id); repeatDrill({ title: s.title, kind: 'Sound lab', items: s.sentences.map(t => ({ text: t })) }); },
    });
  });
}
function earQuiz(s) {
  push(page => {
    const rounds = shuffle(s.pairs).slice(0, 8).map(p => ({ p, a: Math.random() < 0.5 ? 0 : 1 }));
    let i = 0, right = 0, locked = false;
    page.set({ title: 'Ear test', body: `<div class="progress" style="margin-top:6px"><i id="q-bar"></i></div><div id="q-main"></div>` });
    const show = () => {
      locked = false;
      page.$('#q-bar').style.width = (i / rounds.length) * 100 + '%';
      page.$('#q-main').innerHTML = `<div class="center" style="padding:36px 0 26px"><button class="mic" data-act="play" style="margin:0 auto">${I.speaker}</button><p class="muted" style="margin-top:14px">Which word did you hear?</p></div>
        <div class="pair">${rounds[i].p.map((w, k) => `<button class="word-btn" data-act="pick" data-k="${k}">${esc(w)}</button>`).join('')}</div>`;
      speak(rounds[i].p[rounds[i].a], { rate: 0.9 });
    };
    page.on({
      play: () => speak(rounds[i].p[rounds[i].a], { rate: 0.9 }),
      pick: b => {
        if (locked) return; locked = true;
        const ok = +b.dataset.k === rounds[i].a;
        if (ok) right++;
        $$('.word-btn', page.el).forEach((x, k) => x.classList.add(k === rounds[i].a ? 'right' : (x === b ? 'wrong' : 'x')));
        setTimeout(() => {
          i++;
          if (i < rounds.length) return show();
          logPractice({ sec: 40 }); logSession({ kind: 'Ear test', title: s.title, sec: 40, score: Math.round((right / rounds.length) * 100) });
          page.$('#q-bar').style.width = '100%';
          page.$('#q-main').innerHTML = `<div class="center" style="padding:44px 0"><div style="font-size:56px">${right >= rounds.length - 1 ? '👂' : '💪'}</div><div class="score" style="margin-top:10px">${right}<small>/${rounds.length}</small></div><p class="muted" style="margin-top:8px">${right >= rounds.length - 1 ? 'Your ear has it. Now train your mouth.' : 'Listen to the pairs again and retry.'}</p><div class="gap"></div><button class="btn" data-act="back">Done</button></div>`;
        }, ok ? 650 : 1300);
      },
    });
    show();
  });
}

/* ---------- Listening ---------- */
function listenList() {
  push(page => {
    const draw = () => page.set({ title: 'Listening', body: `<p class="muted" style="margin:8px 2px 14px">Listen without reading, then answer three questions.</p><div class="list">${LISTEN.map(l => `<button class="item plain" data-act="open" data-id="${l.id}"><div class="grow"><div class="t">${esc(l.title)}<span class="lvl">${l.level}</span></div></div>${S.done[l.id] ? `<div class="check on">${I.check}</div>` : `<span class="chev">${I.chev}</span>`}</button>`).join('')}</div>` });
    draw();
    page.refresh = draw;
    page.on({ open: b => listenPage(LISTEN.find(l => l.id === b.dataset.id)) });
  });
}
function listenPage(l) {
  push(page => {
    let answered = 0, right = 0;
    page.set({ title: l.title, body: `<div class="center" style="padding:24px 0 10px"><button class="mic" data-act="play" style="margin:0 auto">${I.play}</button><div class="btns" style="margin:16px auto 0;max-width:260px"><button class="btn ghost sm" data-act="slow">Slower</button><button class="btn ghost sm" data-act="text">Show text</button></div></div>
      <div class="card sel" id="l-text" style="display:none;font-size:16px">${esc(l.text)}</div>
      ${l.questions.map((q, n) => `<div class="sec"><h3 style="font-size:17px">${n + 1}. ${esc(q.q)}</h3></div>${q.options.map((o, k) => `<button class="opt" data-act="pick" data-n="${n}" data-k="${k}">${esc(o)}</button>`).join('')}`).join('')}<div id="l-res"></div>` });
    page.on({
      play: () => speak(l.text), slow: () => speak(l.text, { rate: 0.78 }),
      text: () => { const t = page.$('#l-text'); t.style.display = t.style.display === 'none' ? '' : 'none'; },
      pick: b => {
        const n = +b.dataset.n, q = l.questions[n];
        const opts = $$(`[data-n="${n}"]`, page.el);
        if (opts.some(o => o.classList.contains('right') || o.classList.contains('wrong'))) return;
        const ok = +b.dataset.k === q.answer;
        opts[q.answer].classList.add('right');
        if (!ok) b.classList.add('wrong'); else right++;
        if (++answered === l.questions.length) {
          markDone(l.id); logPractice({ sec: 45 }); logSession({ kind: 'Listening', title: l.title, sec: 45, score: Math.round((right / answered) * 100) });
          page.$('#l-res').innerHTML = `<div class="gap"></div><div class="card center"><div class="score">${right}<small>/${answered}</small></div><p class="muted" style="margin-top:6px">${right === answered ? 'Perfect listening.' : 'Play it again and read the text to catch what you missed.'}</p></div>`;
          page.$('#l-res').scrollIntoView({ behavior: 'smooth' });
        }
      },
    });
  });
}

/* ---------- Conversation phrases ---------- */
function phrasesPage() {
  push(page => {
    const groups = [...new Set(FILLERS.map(f => f.group))];
    page.set({ title: 'Conversation phrases', body: `<p class="muted" style="margin:8px 2px 4px">Fluent speakers are not faster thinkers — they have ready phrases. Tap to hear, then say each one aloud.</p>
      ${groups.map(g => `<div class="sec"><h3>${esc(g)}</h3></div><div class="list">${FILLERS.filter(f => f.group === g).map(f => `<button class="item plain" data-act="say" data-text="${esc(f.text)}"><div class="grow sel" style="font-size:16px">${esc(f.text)}</div><span style="color:var(--accent)">${I.speaker}</span></button>`).join('')}</div>`).join('')}` });
    page.on({ say: b => speak(b.dataset.text) });
  });
}

/* ---------- My mistakes ---------- */
function mistakesPage() {
  push(page => {
    const draw = () => {
      const open = S.mistakes.filter(m => !m.done), fixed = S.mistakes.filter(m => m.done);
      page.set({ title: 'My mistakes', body: !S.mistakes.length ? `<div class="empty"><div class="e">✨</div><div class="b">Nothing here yet</div><p>When the app catches a slip in your speech, it is saved here so you can practise the correct form.</p></div>` :
        `<p class="muted" style="margin:8px 2px 14px">Say the correct version aloud three times, then mark it as fixed.</p>
        ${open.map(m => card(m)).join('') || `<div class="card center muted">All fixed. Well done.</div>`}
        ${fixed.length ? `<div class="sec"><h3>Fixed</h3><button data-act="clear">Clear</button></div>${fixed.map(m => card(m)).join('')}` : ''}` });
    };
    const card = m => { const n = S.mistakes.indexOf(m); return `<div class="card" style="${m.done ? 'opacity:.6' : ''}"><div class="row"><div class="grow"><div style="font-size:17px"><span class="x" style="color:var(--bad);text-decoration:line-through">${esc(m.found)}</span> → <span class="b" style="color:var(--good)">${esc(m.better)}</span></div>
      <p class="muted small" style="margin-top:4px">${esc(m.why)}</p>${S.settings.hindi && m.hi ? `<p class="hi" style="margin-top:2px">${esc(m.hi)}</p>` : ''}<p class="tiny muted" style="margin-top:4px">Caught ${m.n} time${m.n > 1 ? 's' : ''}</p></div>
      <button class="check ${m.done ? 'on' : ''}" data-act="done" data-n="${n}" aria-label="Mark fixed">${I.check}</button></div>
      <div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-act="say" data-text="${esc(m.better)}">${I.speaker} Hear the correct form</button></div></div>`; };
    draw();
    page.on({
      say: b => speak(b.dataset.text),
      done: b => { const m = S.mistakes[+b.dataset.n]; m.done = !m.done; save(); draw(); },
      clear: () => { S.mistakes = S.mistakes.filter(m => !m.done); save(); draw(); },
    });
  });
}

/* ---------- Words tab ---------- */
let wseg = 'Work', wq = '';
export function wordsTab(page) {
  const st = srsStats(ALLWORDS);
  const due = srsDue(ALLWORDS, 10).length;
  const tags = ['Work', 'Opinions', 'Everyday', 'Feelings', 'Phrases'];
  page.el.innerHTML = `<div class="scroll"><div class="big-title"><div><h1>Words</h1></div></div>
    <div class="hero"><div class="row"><div class="grow" style="position:relative;z-index:1"><div class="label">Today's review</div><div class="num">${due}</div><div style="opacity:.9">cards ready · ${st.mastered} mastered · ${st.learning} learning</div></div></div>
      <div class="gap"></div><button class="btn" data-act="review" style="background:#fff;color:#4B3FF0;position:relative;z-index:1">Start review</button></div>
    <div class="sec"><h3>Browse</h3><span class="muted small">${ALLWORDS.length} items</span></div>
    <label class="field" style="margin:0 0 12px"><input id="wq" type="search" placeholder="Search words and phrases" value="${esc(wq)}" autocomplete="off" autocorrect="off"></label>
    <div class="chips">${tags.map(t => `<button class="chip ${t === wseg ? 'on' : ''}" data-act="tag" data-t="${t}">${t}</button>`).join('')}</div>
    <div class="list" id="wlist"></div></div>`;
  page.body = $('.scroll', page.el);
  const draw = () => {
    const q = wq.trim().toLowerCase();
    const list = ALLWORDS.filter(v => q ? (v.w.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)) : v.tag === wseg);
    $('#wlist', page.el).innerHTML = list.map(v => { const s = S.srs[v.w]; return `<button class="item plain" data-act="word" data-w="${esc(v.w)}"><div class="grow"><div class="t">${esc(v.w)}</div><div class="d" style="-webkit-line-clamp:1">${esc(v.meaning)}</div></div>${s ? `<span class="lvl" style="${s.box >= 4 ? 'background:var(--good-soft);color:var(--good)' : ''}">${s.box >= 4 ? 'Mastered' : 'Learning'}</span>` : ''}</button>`; }).join('') || `<div class="empty">No matches</div>`;
  };
  draw();
  $('#wq', page.el).addEventListener('input', e => { wq = e.target.value; draw(); });
  page.on({
    tag: b => { wseg = b.dataset.t; wq = ''; wordsTab(page); },
    review: () => flashcards(),
    word: b => wordSheet(ALLWORDS.find(v => v.w === b.dataset.w)),
  });
}
function wordSheet(v) {
  const s = sheet(`<div class="row"><div class="grow"><h3 style="font-size:30px;margin:0">${esc(v.w)}</h3><div class="muted" style="font-style:italic">${esc(v.pos)}</div></div><button class="side-btn" data-act="say" data-text="${esc(v.w)}">${I.speaker}</button></div>
    <div class="gap"></div><div class="card"><div class="sel" style="font-size:17px">${esc(v.meaning)}</div>${S.settings.hindi ? `<div class="hi sel" style="margin-top:4px;font-size:16px">${esc(v.hi)}</div>` : ''}</div>
    <button class="card tap" data-act="say" data-text="${esc(v.example)}" style="display:block;width:100%"><div class="tiny b muted" style="text-transform:uppercase;letter-spacing:.06em">Example · tap to hear</div><div class="sel" style="font-size:17px;font-style:italic;margin-top:3px">${esc(v.example)}</div></button>
    <div class="gap"></div>${S.srs[v.w] ? '' : `<button class="btn" data-act="add">Add to my review cards</button><div class="gap"></div>`}<button class="btn ghost" data-act="close">Close</button>`, {
    say: b => speak(b.dataset.text),
    add: () => { srsGrade(v.w, false); S.srs[v.w].due = 0; save(); toast('Added to review'); s.close(); },
  });
}

export function flashcards() {
  const queue = srsDue(ALLWORDS, 10);
  if (!queue.length) return toast('No cards due. Come back tomorrow.');
  push(page => {
    let i = 0, flipped = false, knew = 0;
    page.set({ title: 'Review', body: `<div class="progress" style="margin:6px 0 16px"><i id="f-bar"></i></div><div id="f-main"></div><div id="f-fb"></div>`,
      footer: `<div class="footer" id="f-foot"></div>` });
    const dock = micDock(page, { hint: 'Now say your own sentence with it', maxSec: 25, onResult: r => {
      const v = queue[i], a = analyse(r);
      const stem = v.w.toLowerCase().split(' ')[0].replace(/(e|y)$/, '');
      const used = a.text.toLowerCase().includes(stem);
      page.$('#f-fb').innerHTML = `<div class="gap"></div><div class="card sel">“${esc(a.text)}”</div><div class="gap"></div>${feedbackHTML(a, `<div class="tipline">${used ? 'You used “' + esc(v.w) + '” in your own sentence — that is how words stick.' : 'I did not hear “' + esc(v.w) + '”. Try once more with the word in it.'}</div>`)}`;
      requestAnimationFrame(() => { page.body.scrollTop = page.body.scrollHeight; });
    } });
    page.el.insertBefore(dock.el, page.$('#f-foot'));
    const show = () => {
      const v = queue[i]; flipped = false;
      page.$('#f-bar').style.width = (i / queue.length) * 100 + '%';
      page.$('#f-fb').innerHTML = '';
      page.$('#f-main').innerHTML = `<button class="flash tap" data-act="flip"><div class="word">${esc(v.w)}</div><div class="pos">${esc(v.pos)}</div><div class="muted small" style="margin-top:16px">Do you know it? Tap to check.</div></button>`;
      page.$('#f-foot').innerHTML = `<button class="btn soft" data-act="flip">Show meaning</button>`;
      if (S.settings.autoSpeak) speak(v.w);
    };
    const grade = ok => {
      srsGrade(queue[i].w, ok); if (ok) knew++;
      i++;
      if (i < queue.length) return show();
      logPractice({ sec: queue.length * 8 }); logSession({ kind: 'Word review', title: queue.length + ' cards', sec: queue.length * 8, score: Math.round((knew / queue.length) * 100) });
      planFlag('vo');
      replace(p => p.set({ title: 'Done', backLabel: 'Done', body: `<div class="center" style="padding:44px 0"><div style="font-size:56px">📚</div><h1 style="font-size:26px;font-weight:800;margin-top:8px">Review complete</h1><div class="score" style="margin-top:14px">${knew}<small>/${queue.length}</small></div><p class="muted" style="margin-top:6px">known. The rest come back tomorrow.</p></div>`, footer: `<div class="footer"><button class="btn" data-act="back">Done</button></div>` }));
    };
    page.on({
      flip: () => {
        if (flipped) return; flipped = true;
        const v = queue[i];
        page.$('#f-main').innerHTML = `<div class="flash"><div class="word">${esc(v.w)}</div><div class="pos">${esc(v.pos)}</div><div class="mean sel">${esc(v.meaning)}</div>${S.settings.hindi ? `<div class="hi" style="font-size:17px">${esc(v.hi)}</div>` : ''}<div class="ex sel">“${esc(v.example)}”</div>
          <div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-act="say" data-text="${esc(v.w)}">${I.speaker} Word</button><button class="btn ghost sm" data-act="say" data-text="${esc(v.example)}">${I.speaker} Example</button></div></div>`;
        page.$('#f-foot').innerHTML = `<div class="btns"><button class="btn danger" data-act="no">Still learning</button><button class="btn good" data-act="yes">I know it</button></div>`;
      },
      say: b => speak(b.dataset.text), yes: () => grade(true), no: () => grade(false),
    });
    show();
  });
}
