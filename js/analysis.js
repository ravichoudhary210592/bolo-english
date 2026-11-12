// Offline language analysis: grammar and naturalness checks tuned for Hindi speakers,
// fluency metrics, and read-aloud comparison. No network, no model needed.

const BASE = { went: 'go', came: 'come', saw: 'see', did: 'do', got: 'get', took: 'take', gave: 'give', told: 'tell', said: 'say', made: 'make', knew: 'know', had: 'have', ate: 'eat', bought: 'buy', found: 'find', thought: 'think', wrote: 'write', spoke: 'speak', felt: 'feel', left: 'leave', met: 'meet', sent: 'send', brought: 'bring', kept: 'keep', understood: 'understand', heard: 'hear', ran: 'run', paid: 'pay', forgot: 'forget', began: 'begin', became: 'become', has: 'have' };
const PART = { went: 'gone', came: 'come', saw: 'seen', did: 'done', took: 'taken', gave: 'given', wrote: 'written', spoke: 'spoken', ate: 'eaten', drank: 'drunk', began: 'begun', ran: 'run', knew: 'known', forgot: 'forgotten', chose: 'chosen', broke: 'broken' };
const AUX3 = { "don't": "doesn't", 'do not': 'does not', have: 'has', are: 'is', were: 'was' };
const AUXPL = { is: 'are', was: 'were', has: 'have', does: 'do' };
const UNCOUNT = { informations: 'information', advices: 'advice', equipments: 'equipment', furnitures: 'furniture', feedbacks: 'feedback', softwares: 'software', staffs: 'staff', luggages: 'luggage', baggages: 'baggage', homeworks: 'homework', knowledges: 'knowledge', sceneries: 'scenery', evidences: 'evidence', machineries: 'machinery', jewelleries: 'jewellery', stationeries: 'stationery' };
const NUM = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|few|a few|many|several|some|couple of|a couple of)';
const NOAUX = '(?<!\\b(?:does|did|do|can|could|should|would|will|may|might|must|let|lets|make|makes|made|help|helps|helped|to|not|and|or|see|saw|watch|watched|hear|heard) )';

// g = grammar error, n = sounds unnatural / Indian English
const RULES = [
  ['g', /\b(discuss(?:ed|ing|es)?) about\b/gi, m => m[1], "'Discuss' takes the topic directly — no 'about'.", "'discuss' के बाद 'about' नहीं लगता।"],
  ['n', /\brevert(?:ed)? back\b/gi, () => 'get back (to you)', "'Revert' already means 'go back'. In everyday English say 'get back to you' or 'reply'.", "'revert back' की जगह 'get back to you' कहें।"],
  ['g', /\breturn(ed|ing|s)? back\b/gi, m => 'return' + (m[1] || ''), "'Return' already includes 'back'.", "'return' में 'back' पहले से शामिल है।"],
  ['n', /\bdo the needful\b/gi, () => 'take care of it', "This phrase is only used in South Asia. Say exactly what you need, or 'please take care of it'.", "'do the needful' केवल भारतीय अंग्रेज़ी में चलता है।"],
  ['n', /\bprepone(d|s)?\b/gi, m => m[1] === 'd' ? 'brought forward' : 'bring forward', "'Prepone' is not used outside India. Say 'bring forward' or 'move up'.", "'prepone' की जगह 'bring forward' कहें।"],
  ['n', /\b[Mm]yself ([A-Z][a-z]+)\b/g, m => "I'm " + m[1], "Introduce yourself with 'I'm ...' or 'My name is ...'.", "परिचय में 'Myself Ravi' नहीं, 'I'm Ravi' कहें।"],
  ['g', /\b(?:i am|i'm|we are|we're|they are|you are) (not )?agree\b/gi, m => m[1] ? "I don't agree" : 'I agree', "'Agree' is a verb, not an adjective: 'I agree', 'I don't agree'.", "'agree' क्रिया है — 'I am agree' नहीं, 'I agree'।"],
  ['g', /\b(did not|didn't|did n't|does not|doesn't|do not|don't) (went|came|saw|did|got|took|gave|told|said|made|knew|had|has|ate|bought|found|thought|wrote|spoke|felt|left|met|sent|brought|kept|understood|heard|ran|paid|forgot|began|became)\b/gi, m => m[1] + ' ' + BASE[m[2].toLowerCase()], "After 'did/does/do + not' use the base form of the verb.", "'did not' के बाद क्रिया का पहला रूप आता है।"],
  ['g', /\b(doesn't|does not|didn't|did not) (knows|works|likes|wants|needs|goes|comes|makes|takes|gets|says|thinks|feels|looks|seems|means|understands)\b/gi, m => m[1] + ' ' + (/^goes$/i.test(m[2]) ? 'go' : m[2].slice(0, -1)), "After 'doesn't/didn't' the verb has no '-s'.", "'doesn't' के बाद क्रिया में 's' नहीं लगता।"],
  ['g', /\bmore (better|easier|faster|bigger|smaller|cheaper|higher|lower|older|younger|worse|stronger|simpler|clearer|safer|nicer|harder|quicker)\b/gi, m => 'much ' + m[1], "'Better', 'easier' etc. are already comparative. Use 'much better' for emphasis.", "'more better' गलत है — 'much better' कहें।"],
  ['n', /\bcousin (brother|sister)\b/gi, () => 'cousin', "English just says 'cousin'.", "अंग्रेज़ी में केवल 'cousin' कहा जाता है।"],
  ['g', new RegExp('\\bsince (' + NUM + '(?: \\w+)? (?:years?|months?|weeks?|days?|hours?|minutes?))\\b(?! ago)', 'gi'), m => 'for ' + m[1], "Use 'for' with a length of time and 'since' with a starting point (since 2019).", "अवधि के साथ 'for', शुरुआती समय के साथ 'since'।"],
  ['g', /\b(explain(?:ed|s)?|describe(?:d|s)?|suggest(?:ed|s)?) (me|him|her|us|them)\b/gi, m => m[1] + ' ... to ' + m[2], "Say 'explain it to me', not 'explain me'.", "'explain me' नहीं, 'explain it to me'।"],
  ['g', /\bsaid (me|him|her|us|them)\b/gi, m => 'told ' + m[1], "'Say' needs 'to' (said to me); 'tell' takes the person directly (told me).", "'said me' नहीं, 'told me'।"],
  ['g', /\btold to (me|him|her|us|them)\b/gi, m => 'told ' + m[1], "'Tell' takes the person directly: 'told me'.", "'told to me' नहीं, 'told me'।"],
  ['g', new RegExp(NOAUX + "\\b(he|she|it) (don't|do not|have|are|were)\\b", 'gi'), m => m[1] + ' ' + AUX3[m[2].toLowerCase()], "With he / she / it use 'doesn't', 'has', 'is', 'was'.", "he / she / it के साथ doesn't, has, is, was आता है।"],
  ['g', /\b(they|we|you) (is|was|has|does)\b/gi, m => m[1] + ' ' + AUXPL[m[2].toLowerCase()], "With we / you / they use 'are', 'were', 'have', 'do'.", "we / you / they के साथ are, were, have, do आता है।"],
  ['g', /\b(informations|advices|equipments|furnitures|feedbacks|softwares|staffs|luggages|baggages|homeworks|knowledges|sceneries|evidences|machineries|jewelleries|stationeries)\b/gi, m => UNCOUNT[m[1].toLowerCase()], "This noun is uncountable in English — no plural 's'. Use 'some' or 'a piece of'.", "यह संज्ञा अगणनीय है — बहुवचन 's' नहीं लगता।"],
  ['n', /\bpass(?:ed)? out (?:of|from) (?:my |the )?(college|school|university|engineering)\b/gi, m => 'graduated from ' + m[1], "'Pass out' means to faint. Say 'graduated from'.", "'pass out' का अर्थ बेहोश होना है — 'graduated' कहें।"],
  ['n', /\bout of station\b/gi, () => 'out of town', "Say 'out of town' or 'away'.", "'out of station' की जगह 'out of town'।"],
  ['n', /\b(your|his|her) good name\b/gi, m => m[1] + ' name', "Just 'your name' — 'good name' is a direct translation of 'शुभ नाम'.", "'good name' हिंदी 'शुभ नाम' का सीधा अनुवाद है।"],
  ['g', /\btoday (morning|afternoon|evening)\b/gi, m => 'this ' + m[1], "Say 'this morning', 'this evening'.", "'today morning' नहीं, 'this morning'।"],
  ['g', /\b(?:today|yesterday) night\b/gi, m => /^t/i.test(m[0]) ? 'tonight' : 'last night', "Say 'tonight' or 'last night'.", "'yesterday night' नहीं, 'last night'।"],
  ['g', /\bmarried with (?!(?:\w+ )?(?:kids?|children|sons?|daughters?)\b)/gi, () => 'married to ', "You are 'married to' a person.", "'married with' नहीं, 'married to'।"],
  ['g', /\bcope up( with)?\b/gi, () => 'cope with', "The verb is 'cope with' — no 'up'.", "'cope up' नहीं, 'cope with'।"],
  ['g', /\b(although|even though|though)\b([^.?!]{3,90}?),? but\b/gi, m => m[1] + m[2] + ',', "Use either 'although' or 'but', not both in one sentence.", "'although' और 'but' एक साथ नहीं आते।"],
  ['g', /\b(have|has|had|having|'ve) (went|came|saw|did|took|gave|wrote|spoke|ate|drank|began|ran|knew|forgot|chose|broke)\b/gi, m => m[1] + ' ' + PART[m[2].toLowerCase()], "After 'have/has/had' use the past participle.", "have / has / had के बाद क्रिया का तीसरा रूप आता है।"],
  ['g', /\bone of (my|our|his|her|their|the) (friend|colleague|cousin|client|customer|teacher|student|manager|relative|neighbour|neighbor|brother|sister|uncle|reason|example|problem|thing|way|option|project|goal|challenge|issue|strength|weakness)\b(?!s)/gi, m => 'one of ' + m[1] + ' ' + m[2] + (/s$/.test(m[2]) ? 'es' : 's'), "After 'one of' the noun is plural: 'one of my friends'.", "'one of' के बाद बहुवचन संज्ञा आती है।"],
  ['n', /\baccording to me\b/gi, () => 'in my opinion', "'According to' is for other people or sources. For yourself say 'I think' or 'in my opinion'.", "अपने लिए 'according to me' नहीं, 'in my opinion' कहें।"],
  ['n', new RegExp('\\b(' + NUM + ' (?:years?|months?|weeks?|days?)) back\\b', 'gi'), m => m[1] + ' ago', "Say 'two years ago'.", "'years back' की जगह 'years ago'।"],
  ['n', /\bupdation\b/gi, () => 'update', "'Updation' is not a standard word. Use 'update'.", "'updation' शब्द नहीं है — 'update' कहें।"],
  ['n', /\bupgradation\b/gi, () => 'upgrade', "Use 'upgrade'.", "'upgradation' की जगह 'upgrade'।"],
  ['g', /\b(would|could|should|must|might) of\b/gi, m => m[1] + ' have', "It is 'would have' (sounds like 'would've').", "'would of' नहीं, 'would have'।"],
  ['g', /\b(i am|i'm|we are|we're|they are|they're|you are|you're|he is|he's|she is|she's) having (?!(?:\w+ )?(?:lunch|dinner|breakfast|coffee|tea|fun|a good|a great|a hard|a tough|a bad|a nice|trouble|problems?|difficulty|a meeting|a call|a party|a baby|second|an? \w+ time|a look|a chat|a word|a break|a drink|a conversation|a discussion|some food|food)\b)/gi, m => m[1].replace(/ ?(?:am|are|is)$| ?'(?:m|re|s)$/i, '') + (/^(?:he|she)/i.test(m[1]) ? ' has ' : ' have '), "For possession use the simple form: 'I have a car', not 'I am having'.", "अधिकार बताने के लिए 'I have', 'I am having' नहीं।"],
  ['g', /\b(i am|i'm|we are|we're|they are|they're|you are|you're) (knowing|understanding|believing|wanting|needing|owning|belonging|preferring)\b/gi, m => m[1].replace(/ ?(?:am|are)$| ?'(?:m|re)$/i, '') + ' ' + m[2].replace(/ing$/, '').replace(/^(believ|prefer{2})$/, x => x === 'believ' ? 'believe' : 'prefer'), "State verbs (know, want, need, understand) are not used in the -ing form.", "know, want, need जैसी क्रियाएँ -ing रूप में नहीं आतीं।"],
  ['g', /\ba (hour|honest|honour|heir|mba|[aeio][a-z]+|u(?![ns][aeiou]|ser|til|su|se|ro|k\b)[a-z]+)\b/gi, m => 'an ' + m[1], "Use 'an' before a vowel sound.", "स्वर ध्वनि से पहले 'an' आता है।"],
  ['g', /\ban (uni[a-z]+|use[a-z]*|usual[a-z]*|european|one[a-z]*|utility)\b/gi, m => 'a ' + m[1], "Use 'a' here — the word starts with a 'y' or 'w' sound.", "यहाँ 'a' आएगा क्योंकि शब्द 'य' ध्वनि से शुरू होता है।"],
  ['g', /\bmuch (people|friends|things|problems|options|years|times|employees|customers|clients|questions|days|mistakes)\b/gi, m => 'many ' + m[1], "Use 'many' with things you can count.", "गिनने योग्य चीज़ों के साथ 'many'।"],
  ['g', /\bmany (money|work|information|water|traffic|advice|experience|knowledge)\b/gi, m => 'much ' + m[1], "Use 'much' or 'a lot of' with uncountable nouns.", "अगणनीय संज्ञा के साथ 'much' या 'a lot of'।"],
  ['g', /\bless (people|employees|customers|options|problems|mistakes|errors|days|hours|items|things)\b/gi, m => 'fewer ' + m[1], "Use 'fewer' with things you can count.", "गिनने योग्य चीज़ों के साथ 'fewer'।"],
  ['g', /\blooking forward to (meet|see|hear|work|speak|talk|join|discuss|connect|receive|visit|learn|start)\b(?!ing)/gi, m => 'looking forward to ' + m[1].replace(/e$/, '') + 'ing', "After 'look forward to' use the -ing form.", "'look forward to' के बाद -ing रूप आता है।"],
  ['n', /\bkindly\b/gi, () => 'please', "'Kindly' sounds stiff or old-fashioned in speech. 'Please' or 'Could you...' is friendlier.", "बोलचाल में 'kindly' की जगह 'please' बेहतर है।"],
  ['n', /\b(today|tomorrow|yesterday|now|here|there|then|monday|tuesday|wednesday|thursday|friday|saturday|sunday) (itself|only)\b(?! (?:a|an|the|one|two|if|when|for|in)\b)/gi, m => m[1], "'Itself' / 'only' for emphasis is a translation of Hindi 'ही'. Drop it, or say 'just today', 'right now'.", "'today itself / only' हिंदी 'ही' का अनुवाद है — इसे हटा दें।"],
  ['g', /(^|[.?!]\s+)(what|where|why|how|when) (you|he|she|they|we|it) (are|is|were|was|will|can|would|should|have|has)\b([^.?!]*\?)/gi, m => m[1] + m[2] + ' ' + m[4] + ' ' + m[3] + m[5], "In a question the helping verb comes before the subject: 'What are you doing?'", "प्रश्न में सहायक क्रिया कर्ता से पहले आती है।"],
  ['g', /\b(am|is|are|was|were) (live|stay|go|come|do|make|think|speak|learn|manage|handle|prepare)\b(?! (?:to|by)\b)/gi, m => m[1] + ' ' + m[2].replace(/e$/, '') + 'ing', "After am / is / are use the -ing form: 'I am living'.", "am / is / are के बाद -ing रूप आता है।"],
  ['g', /\b(can|could|will|would|should|must|might) to (\w+)\b/gi, m => m[1] + ' ' + m[2], "No 'to' after can / will / should / must.", "can / will / should के बाद 'to' नहीं लगता।"],
  ['g', /\b(can|could|will|would|should|must|might) (went|came|saw|did|took|gave|told|made|got)\b/gi, m => m[1] + ' ' + BASE[m[2].toLowerCase()], "After a modal verb use the base form.", "can / could / will के बाद क्रिया का पहला रूप।"],
  ['n', /\b(?:is|are|was|were) paining\b/gi, () => 'hurts', "Say 'my head hurts' or 'I have a pain in ...'.", "'is paining' नहीं, 'hurts' कहें।"],
  ['n', /\btime ?pass\b/gi, () => 'to pass the time', "Say 'just to pass the time' or 'killing time'.", "'timepass' की जगह 'to pass the time'।"],
  ['n', /\bmug(?:ged|ging)? up\b/gi, () => 'memorise', "Say 'memorise' or 'learn by heart'.", "'mug up' की जगह 'memorise'।"],
  ['n', /\bcent percent\b/gi, () => 'a hundred percent', "Say 'a hundred percent'.", "'cent percent' की जगह 'a hundred percent'।"],
  ['n', /\bdo one thing\b/gi, () => "here's an idea", "A translation of 'एक काम करो'. Say 'How about...' or 'Here's an idea'.", "'do one thing' हिंदी 'एक काम करो' का अनुवाद है।"],
  ['g', /\bbelongs? from\b/gi, () => 'come from', "Say 'I come from Jaipur' or 'I'm from Jaipur'.", "'belong from' नहीं, 'come from' या 'I'm from'।"],
  ['g', /\bemphasi[sz]e(d|s)? on\b/gi, m => 'emphasise' + (m[1] || ''), "'Emphasise' takes the object directly — no 'on'.", "'emphasise' के बाद 'on' नहीं लगता।"],
  ['g', /\b(i|we|they|he|she|you) ((?:have |had |would like to |want to )?request(?:ed)?) for\b/gi, m => m[1] + ' ' + m[2], "As a verb, 'request' has no 'for': 'I requested a refund'.", "क्रिया 'request' के बाद 'for' नहीं लगता।"],
  ['g', /\b(reach(?:ed|es)?) to (?:the )?(office|home|station|airport|hotel|venue|site|there|here)\b/gi, m => m[1] + ' ' + (/home|there|here/i.test(m[2]) ? '' : 'the ') + m[2], "'Reach' takes the place directly: 'reach the office'.", "'reach' के बाद 'to' नहीं लगता।"],
  ['n', /\bmet with an accident\b/gi, () => 'had an accident', "Say 'had an accident'.", "'met with an accident' की जगह 'had an accident'।"],
  ['n', /\b(give|gave|giving|given) (an |the |my )?(exam|exams|test)\b/gi, m => ({ give: 'take', gave: 'took', giving: 'taking', given: 'taken' })[m[1].toLowerCase()] + ' ' + (m[2] || '') + m[3], "Students 'take' an exam; teachers 'give' one.", "विद्यार्थी परीक्षा 'take' करते हैं, 'give' नहीं।"],
  ['n', /\bbackside\b/gi, () => 'back', "Say 'at the back' or 'behind'. 'Backside' means a person's bottom.", "'backside' की जगह 'at the back' कहें।"],
];

const FILLERS = [
  [/\b(?:um+|uh+|er+|erm+|hmm+|ah+)\b/gi, 'um / uh'],
  [/\byou know\b/gi, 'you know'],
  [/\bi mean\b/gi, 'I mean'],
  [/\bbasically\b/gi, 'basically'],
  [/\bactually\b/gi, 'actually'],
  [/\bliterally\b/gi, 'literally'],
  [/\b(?:kind|sort) of\b/gi, 'kind of'],
  [/(?:^|,)\s*like,/gi, 'like'],
  [/\band all\b/gi, 'and all'],
  [/\b(?:yaar|matlab|accha|achha|haan|na)\b/gi, 'Hindi filler'],
];

export function words(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

export function checkGrammar(text) {
  const out = [];
  if (!text) return out;
  for (const [type, re, fix, why, hi] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      let better = '';
      try { better = fix(m) || ''; } catch (e) { better = ''; }
      out.push({ type, found: m[0].trim(), better: better.trim(), why, hi, index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  out.sort((a, b) => a.index - b.index);
  // drop duplicates of the same phrase
  return out.filter((x, i) => out.findIndex(y => y.found.toLowerCase() === x.found.toLowerCase() && y.why === x.why) === i);
}

export function countFillers(text) {
  const found = {};
  let total = 0;
  for (const [re, label] of FILLERS) {
    re.lastIndex = 0;
    const n = ((text || '').match(re) || []).length;
    if (n) { found[label] = (found[label] || 0) + n; total += n; }
  }
  return { total, found };
}

// Voice activity from 16 kHz PCM: speaking time and pauses.
export function voiceActivity(pcm, rate = 16000) {
  if (!pcm || !pcm.length) return null;
  const frame = Math.round(rate * 0.03);
  const n = Math.floor(pcm.length / frame);
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * frame, e = j + frame; j < e; j++) s += pcm[j] * pcm[j];
    rms[i] = Math.sqrt(s / frame);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const loud = sorted[Math.floor(n * 0.95)] || 0;
  const thr = Math.max(0.006, loud * 0.12);
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) if (rms[i] > thr) { if (first < 0) first = i; last = i; }
  if (first < 0) return { speaking: 0, span: 0, pauses: 0, longest: 0, silent: true };
  let speaking = 0, run = 0, pauses = 0, longest = 0;
  for (let i = first; i <= last; i++) {
    if (rms[i] > thr) {
      speaking++;
      if (run * 0.03 >= 0.7) { pauses++; longest = Math.max(longest, run * 0.03); }
      run = 0;
    } else run++;
  }
  return { speaking: speaking * 0.03, span: (last - first + 1) * 0.03, pauses, longest, silent: false };
}

// Fluency summary of a spoken answer.
export function fluency(text, durationSec, va) {
  const w = words(text);
  const span = va && va.span > 1 ? va.span : durationSec;
  const mins = Math.max(span, 1) / 60;
  const wpm = w.length ? Math.round(w.length / mins) : 0;
  const fillers = countFillers(text);
  const fillerRate = fillers.total / Math.max(mins, 0.15);
  const pauseRate = va ? va.pauses / Math.max(mins, 0.15) : 0;
  const unique = new Set(w).size;
  const variety = w.length ? unique / Math.sqrt(2 * w.length) : 0; // corrected type-token ratio
  // pace: 125-165 wpm is a comfortable conversational pace
  let pace = 100;
  if (wpm < 125) pace = Math.max(20, 100 - (125 - wpm) * 1.1);
  else if (wpm > 175) pace = Math.max(50, 100 - (wpm - 175) * 0.8);
  const smooth = Math.max(20, 100 - fillerRate * 6 - pauseRate * 5);
  const score = w.length < 3 ? 0 : Math.round(pace * 0.5 + smooth * 0.5);
  let paceLabel = 'Good pace';
  if (wpm && wpm < 100) paceLabel = 'Slow — try to keep going';
  else if (wpm < 125) paceLabel = 'A little slow';
  else if (wpm > 185) paceLabel = 'Very fast — slow down a bit';
  return { words: w.length, wpm, fillers, pauses: va ? va.pauses : 0, longest: va ? va.longest : 0, variety: Math.round(variety * 10) / 10, score, paceLabel };
}

const NUMWORDS = { '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten' };
function norm(text) {
  return (text || '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map(w => NUMWORDS[w] || w.replace(/^'+|'+$/g, ''));
}
function close(a, b) {
  if (a === b) return true;
  if (a.replace(/'/g, '') === b.replace(/'/g, '')) return true;
  if (a.length > 4 && b.length > 4 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 1) return true;
  return false;
}

// Speech recognition may write "I would" where the sentence has "I'd" (or "ok" for "okay").
// Rewrite the heard text into the target's own contractions so these count as correct.
const TAILS = [["n't", [' not']], ["'d", [' would', ' had']], ["'ll", [' will']], ["'re", [' are']], ["'ve", [' have']], ["'m", [' am']], ["'s", [' is', ' has']]];
const ODD = { "won't": ['will not'], "can't": ['cannot', 'can not'], "shan't": ['shall not'], "let's": ['let us'], okay: ['ok'], "gonna": ['going to'], "wanna": ['want to'] };
function contractLike(targetTokens, said) {
  let s = ' ' + (said || '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const tok of new Set(targetTokens)) {
    let forms = ODD[tok];
    if (!forms) {
      const tail = TAILS.find(([end]) => tok.endsWith(end) && tok.length > end.length);
      if (tail) forms = tail[1].map(x => tok.slice(0, -tail[0].length) + x);
    }
    if (!forms || s.includes(' ' + tok + ' ')) continue;
    for (const f of forms) if (s.includes(' ' + f + ' ')) { s = s.replace(' ' + f + ' ', ' ' + tok + ' '); break; }
  }
  return s;
}

// Compare what was said with a target sentence. Returns per-word result and a 0-100 score.
export function compare(target, said) {
  const raw = (target || '').split(/\s+/).filter(Boolean);
  const t = raw.map(w => norm(w).join(''));
  const s = norm(contractLike(t, said));
  const n = t.length, m = s.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = close(t[i], s[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ok = new Array(n).fill(false);
  const heard = new Array(n).fill('');
  let i = 0, j = 0, pending = [];
  while (i < n && j < m) {
    if (close(t[i], s[j])) { ok[i] = true; i++; j++; pending = []; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { heard[i] = pending.join(' ') || heard[i]; i++; }
    else { pending.push(s[j]); if (!heard[i]) heard[i] = s[j]; j++; }
  }
  const real = t.filter(Boolean).length || 1;
  const hit = ok.filter((v, k) => v && t[k]).length;
  return {
    tokens: raw.map((w, k) => ({ w, ok: ok[k] || !t[k], heard: heard[k] })),
    score: Math.round((hit / real) * 100),
    missed: raw.filter((w, k) => !ok[k] && t[k]).map(w => w.replace(/[^A-Za-z']/g, '')),
  };
}

export function keywordCoverage(text, keywords) {
  const w = new Set(words(text));
  const joined = ' ' + words(text).join(' ') + ' ';
  const hit = (keywords || []).filter(k => w.has(k.toLowerCase()) || joined.includes(' ' + k.toLowerCase()));
  return { hit, total: (keywords || []).length };
}

// One-paragraph coaching note for an answer.
export function coach(text, fl, issues) {
  const tips = [];
  if (fl.words < 6) tips.push('Try a longer answer — add a reason or an example.');
  else if (fl.words < 15) tips.push('Good start. Extend it with "because..." or "for example...".');
  if (fl.wpm && fl.wpm < 110 && fl.words >= 6) tips.push('Speak in chunks of 4–6 words without stopping between each word.');
  if (fl.wpm > 185) tips.push('Slow down slightly and stress the key words.');
  if (fl.fillers.total >= 2) tips.push('Replace fillers (' + Object.keys(fl.fillers.found).join(', ') + ') with a short silent pause.');
  if (fl.pauses >= 3) tips.push('Long pauses: use a phrase like "Let me think..." to buy time.');
  if (!issues.length && !tips.length) tips.push('Clear and natural. Now try adding one new phrase from the list.');
  return tips;
}
