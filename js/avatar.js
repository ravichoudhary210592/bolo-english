// Friendly illustrated conversation partners. Each has a face that blinks, moves its mouth while
// speaking, looks attentive while you talk, and a voice of the matching gender.
import { speechEvents, forcedGender } from './speech.js';

export const PEOPLE = [
  { name: 'Maya', g: 'f', skin: '#E3AC84', hair: '#2A1A16', style: 'long', shirt: '#7C4DF2', bg: '#E9E4FF' },
  { name: 'Arjun', g: 'm', skin: '#D49A6E', hair: '#1E1512', style: 'short', shirt: '#0E9F8E', bg: '#DDF5F0' },
  { name: 'Sarah', g: 'f', skin: '#F3C9A9', hair: '#8A4B2A', style: 'bob', shirt: '#E0619F', bg: '#FFE6F0' },
  { name: 'Daniel', g: 'm', skin: '#F0C3A0', hair: '#5A3A22', style: 'side', shirt: '#3B82F6', bg: '#E1EEFF' },
  { name: 'Priya', g: 'f', skin: '#C98E62', hair: '#1B1210', style: 'bun', shirt: '#F08A3C', bg: '#FFEBD9' },
  { name: 'James', g: 'm', skin: '#8D5B3E', hair: '#17100D', style: 'short', shirt: '#6D5BD0', bg: '#E8E4FA', beard: true },
  { name: 'Emma', g: 'f', skin: '#F6D2B8', hair: '#D9A441', style: 'long', shirt: '#12A66A', bg: '#DFF6EA' },
  { name: 'Tom', g: 'm', skin: '#EFC09B', hair: '#B8632E', style: 'side', shirt: '#E0483E', bg: '#FFE4E1', beard: true },
];
export const COACH = PEOPLE[0];

// Pick a partner for a scenario. If the learner chose a specific voice, only people of that gender.
export function personFor(id) {
  const g = forcedGender();
  const pool = g ? PEOPLE.filter(p => p.g === g) : PEOPLE;
  return pool[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % pool.length];
}
export function coach() {
  const g = forcedGender();
  return g && g !== COACH.g ? PEOPLE.find(p => p.g === g) : COACH;
}

let uid = 0;
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');

export function faceSVG(p, size = 120) {
  const id = 'fc' + (++uid);
  const hairBack = { long: 'M30 60 Q27 20 60 18 Q93 20 90 60 L93 96 Q77 104 60 104 Q43 104 27 96 Z', bob: 'M30 58 Q27 20 60 18 Q93 20 90 58 L91 80 Q76 88 60 88 Q44 88 29 80 Z', bun: 'M33 54 Q31 22 60 21 Q89 22 87 54 L86 66 L34 66 Z' }[p.style] || '';
  const hairTop = {
    long: 'M33 54 Q31 23 60 22 Q89 23 87 54 Q83 38 66 34 Q52 44 33 54 Z',
    bob: 'M33 54 Q31 23 60 22 Q89 23 87 54 Q80 36 60 34 Q40 36 33 54 Z',
    bun: 'M33 52 Q32 24 60 23 Q88 24 87 52 Q80 35 60 33 Q40 35 33 52 Z',
    short: 'M33 50 Q30 22 60 21 Q90 22 87 50 Q84 35 60 32 Q36 35 33 50 Z',
    side: 'M33 50 Q30 21 62 20 Q91 22 87 50 Q84 36 70 33 Q50 30 38 40 Q35 44 33 50 Z',
  }[p.style];
  return `<svg class="face" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
    <defs><clipPath id="${id}"><circle cx="60" cy="60" r="60"/></clipPath></defs>
    <circle cx="60" cy="60" r="60" fill="${p.bg}"/>
    <g clip-path="url(#${id})"><g class="f-body">
      ${hairBack ? `<path d="${hairBack}" fill="${p.hair}"/>` : ''}
      ${p.style === 'bun' ? `<circle cx="60" cy="17" r="10" fill="${p.hair}"/>` : ''}
      <path d="M18 124 Q20 96 47 91 L73 91 Q100 96 102 124 Z" fill="${p.shirt}"/>
      <path d="M52 78 h16 v13 q-8 7 -16 0 Z" fill="${shade(p.skin, 0.88)}"/>
      <g class="f-head">
        <ellipse cx="33.500" cy="58" rx="4" ry="5.500" fill="${shade(p.skin, 0.93)}"/><ellipse cx="86.500" cy="58" rx="4" ry="5.500" fill="${shade(p.skin, 0.93)}"/>
        <path d="M34 52 Q34 26 60 26 Q86 26 86 52 Q86 70 76 80 Q68 87 60 87 Q52 87 44 80 Q34 70 34 52 Z" fill="${p.skin}"/>
        ${p.beard ? `<path d="M37 62 Q38 76 46 82 Q53 88 60 88 Q67 88 74 82 Q82 76 83 62 Q80 72 72 74 Q60 70 48 74 Q40 72 37 62 Z" fill="${p.hair}" opacity=".5"/>` : ''}
        <path d="${hairTop}" fill="${p.hair}"/>
        <circle cx="45" cy="67" r="5" fill="#F0768B" opacity=".2"/><circle cx="75" cy="67" r="5" fill="#F0768B" opacity=".2"/>
        <g class="f-brows" stroke="${shade(p.hair, 0.9)}" stroke-width="2.200" stroke-linecap="round" fill="none"><path d="M44 49.500 Q49 47 54 49.500"/><path d="M66 49.500 Q71 47 76 49.500"/></g>
        <g class="f-eyes"><g class="f-pupils"><ellipse cx="49" cy="57" rx="3.200" ry="3.800" fill="#2A1B18"/><ellipse cx="71" cy="57" rx="3.200" ry="3.800" fill="#2A1B18"/><circle cx="50.200" cy="55.600" r="1" fill="#fff"/><circle cx="72.200" cy="55.600" r="1" fill="#fff"/></g></g>
        <path d="M60 61 Q58.500 65 60.500 66.500" stroke="${shade(p.skin, 0.78)}" stroke-width="1.600" stroke-linecap="round" fill="none"/>
        <path class="f-smile" d="M51 72 Q60 80 69 72" stroke="#8A3340" stroke-width="2.600" stroke-linecap="round" fill="none"/>
        <ellipse class="f-mouth" cx="60" cy="74" rx="7" ry="0" fill="#7A2633"/>
      </g>
    </g></g></svg>`;
}

// Bring a face to life. States: idle | speaking | listening | thinking.
export function liveFace(host, person, size) {
  host.innerHTML = `<div class="face-wrap"><span class="face-ring"></span>${faceSVG(person, size)}</div>`;
  const wrap = host.firstElementChild;
  const mouth = wrap.querySelector('.f-mouth');
  let timer = 0, state = 'idle', until = 0;
  const shut = () => { mouth.setAttribute('ry', 0); mouth.setAttribute('rx', 7); };
  const flap = () => {
    // Open on syllables, close briefly between words: irregular so it reads as speech, not a loop.
    const open = Math.random() > 0.22 || Date.now() < until;
    mouth.setAttribute('ry', open ? (1.600 + Math.random() * 5).toFixed(1) : 0.400);
    mouth.setAttribute('rx', (5.500 + Math.random() * 2.500).toFixed(1));
  };
  const onStart = () => { if (state !== 'speaking') return; clearInterval(timer); timer = setInterval(flap, 95); wrap.classList.add('talking'); };
  const onEnd = () => { clearInterval(timer); shut(); wrap.classList.remove('talking'); };
  const onWord = () => { until = Date.now() + 130; };
  speechEvents.addEventListener('start', onStart);
  speechEvents.addEventListener('end', onEnd);
  speechEvents.addEventListener('boundary', onWord);
  return {
    set(s) { state = s; wrap.dataset.state = s; if (s !== 'speaking') onEnd(); },
    destroy() { clearInterval(timer); speechEvents.removeEventListener('start', onStart); speechEvents.removeEventListener('end', onEnd); speechEvents.removeEventListener('boundary', onWord); },
  };
}
