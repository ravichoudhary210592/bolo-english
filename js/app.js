// App start: tab bar, first-run flow, offline service worker.
import { S, saveNow } from './store.js';
import { stt } from './speech.js';
import { I, setRoot, toast } from './ui.js';
import { homeTab, progressTab, onboarding } from './home.js';
import { speakTab } from './speak.js';
import { practiceTab, wordsTab } from './practice.js';

const TABS = [
  ['home', 'Home', I.home, homeTab],
  ['speak', 'Talk', I.chat, speakTab],
  ['practice', 'Practice', I.target, practiceTab],
  ['words', 'Words', I.book, wordsTab],
  ['progress', 'Progress', I.chart, progressTab],
];
const tabsEl = document.getElementById('tabs');
let current = 'home';

function drawTabs() {
  tabsEl.innerHTML = TABS.map(([k, label, icon]) => `<button class="tab ${k === current ? 'on' : ''}" data-act="tab" data-tab="${k}" role="tab" aria-selected="${k === current}">${icon}<span>${label}</span></button>`).join('');
}
function go(k) {
  current = k;
  drawTabs();
  setRoot(TABS.find(t => t[0] === k)[3]);
}
tabsEl._handlers = { tab: b => go(b.dataset.tab) };

function start() {
  go('home');
  setTimeout(() => stt.warm(), 1200);
}
if (S.onboarded) start(); else onboarding(start);

window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
// Stop iOS double-tap zoom and the rubber-band pull on the fixed shell.
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Update downloaded — reopen the app to use it', 4000); });
    });
  }).catch(() => {});
}
