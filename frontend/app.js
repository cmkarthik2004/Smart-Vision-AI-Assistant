/*
 * app.js – Smart Vision AI Assistant
 * Enhanced: WhatsApp-style interactive chat with smart responses
 * FIXED: Full multilingual TTS — Hindi & Kannada spoken correctly
 */

// ── Voice loader (must be before "use strict" so it runs immediately) ──
let _voicesLoaded = false;
let _voices = [];

function loadVoices() {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) { _voices = v; _voicesLoaded = true; resolve(v); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      _voices = window.speechSynthesis.getVoices();
      _voicesLoaded = true;
      resolve(_voices);
    };
    // Fallback: some browsers never fire onvoiceschanged
    setTimeout(() => {
      if (!_voicesLoaded) {
        _voices = window.speechSynthesis.getVoices();
        _voicesLoaded = true;
        resolve(_voices);
      }
    }, 1500);
  });
}
loadVoices();

"use strict";

const API = window.location.origin;

function getToken() { return localStorage.getItem('sv_token') || ''; }
function getUser()  { try { return JSON.parse(localStorage.getItem('sv_user')||'null'); } catch { return null; } }
function authH()    { return { 'Authorization': 'Bearer '+getToken() }; }
function authHJ()   { return { 'Authorization': 'Bearer '+getToken(), 'Content-Type': 'application/json' }; }

// ── Auth guard ────────────────────────────────────────────────
(async () => {
  if (!getToken()) { window.location.href='/'; return; }
  try {
    const r = await fetch(`${API}/api/auth/me`, { headers: authH() });
    const d = await r.json();
    if (!d.ok) { localStorage.clear(); window.location.href='/'; return; }
    const ul = document.getElementById('userLabel');
    if (ul) ul.textContent = d.user.username || d.user.user_id;
    init();
  } catch { init(); }
})();

async function doLogout() {
  stopCamera();
  try { await fetch(`${API}/api/auth/logout`,{method:'POST',headers:authH()}); } catch {}
  localStorage.clear();
  window.location.href='/';
}
window.doLogout = doLogout;

// ── State ─────────────────────────────────────────────────────
let currentLang='en', currentDetections=[], currentStream=null;
// Export to window so app.html inline scripts can read the correct value
Object.defineProperty(window, 'currentLang', {
  get() { return currentLang; },
  set(v) { currentLang = v; },
  configurable: true
});
let isCameraOn=false, captureInterval=null, lastCaptureTime=0;
let isProcessing=false, uploadMode='detect', voiceListening=false;
let recognition=null, voiceEnabled=false, conversationHistory=[];
let currentObjectContext=null, currentColorContext='';
let fullInfoText='', currentImageId=null, currentImageRecord=null;

const LANG_CODES = {en:'en-IN',hi:'hi-IN',kn:'kn-IN'};
const $ = id => document.getElementById(id);

// ── Multilingual spoken phrases ───────────────────────────────
// All TTS output must go through these — never hardcode English in speak()
const SPEAK_PHRASES = {
  detected: {
    en: (name, col, dist) => `${name} detected${col?', colour '+col:''}${dist?', '+dist+' centimetres away':''}`,
    hi: (name, col, dist) => `${name} पहचाना गया${col?', रंग '+col:''}${dist?', '+dist+' सेंटीमीटर दूर':''}`,
    kn: (name, col, dist) => `${name} ಪತ್ತೆಯಾಗಿದೆ${col?', ಬಣ್ಣ '+col:''}${dist?', '+dist+' ಸೆಂಟಿಮೀಟರ್ ದೂರದಲ್ಲಿ':''}`
  },
  distance: {
    en: (name, cm, zone) => `${name} is ${cm} centimetres away. ${zone}`,
    hi: (name, cm, zone) => `${name} ${cm} सेंटीमीटर दूर है। ${zone}`,
    kn: (name, cm, zone) => `${name} ${cm} ಸೆಂಟಿಮೀಟರ್ ದೂರದಲ್ಲಿದೆ। ${zone}`
  },
  distanceZone: {
    en: { veryClose:'Very close, be careful!', close:'Close range.', near:'Nearby.', medium:'Medium distance.', far:'Far away.' },
    hi: { veryClose:'बहुत पास है, सावधान रहें!', close:'पास की दूरी।', near:'नज़दीक।', medium:'मध्यम दूरी।', far:'दूर।' },
    kn: { veryClose:'ತುಂಬಾ ಹತ್ತಿರ, ಎಚ್ಚರಿಕೆ!', close:'ಹತ್ತಿರದ ದೂರ।', near:'ನಿಕಟ।', medium:'ಮಧ್ಯಮ ದೂರ।', far:'ದೂರ।' }
  },
  colour: {
    en: (name, col) => `The ${name} is ${col}`,
    hi: (name, col) => `${name} का रंग ${col} है`,
    kn: (name, col) => `${name} ನ ಬಣ್ಣ ${col} ಆಗಿದೆ`
  },
  obstacle: {
    en: (name, cm) => `Warning! ${name} is only ${cm} centimetres away!`,
    hi: (name, cm) => `चेतावनी! ${name} केवल ${cm} सेंटीमीटर दूर है!`,
    kn: (name, cm) => `ಎಚ್ಚರಿಕೆ! ${name} ಕೇವಲ ${cm} ಸೆಂಟಿಮೀಟರ್ ದೂರದಲ್ಲಿದೆ!`
  },
  speakAll: {
    en: (list) => `Detected: ${list}`,
    hi: (list) => `पहचाना गया: ${list}`,
    kn: (list) => `ಪತ್ತೆಯಾಗಿದೆ: ${list}`
  },
  saved: {
    en: 'Saved to gallery!',
    hi: 'गैलरी में सेव हो गया!',
    kn: 'ಗ್ಯಾಲರಿಗೆ ಉಳಿಸಲಾಗಿದೆ!'
  },
  noObjects: {
    en: 'No objects detected yet.',
    hi: 'अभी कोई वस्तु नहीं मिली।',
    kn: 'ಇನ್ನೂ ಯಾವ ವಸ್ತುವೂ ಕಂಡುಬಂದಿಲ್ಲ।'
  }
};

function phrase(key, lang, ...args) {
  const p = SPEAK_PHRASES[key];
  if (!p) return '';
  const fn = p[lang] || p['en'];
  return typeof fn === 'function' ? fn(...args) : (fn[args[0]] || fn['en'] || '');
}

// ── Smart offline knowledge base ──────────────────────────────
const OBJECT_INFO = {
  person:      { uses:"A human being — can detect people, pedestrians, or yourself in the mirror.", facts:"YOLOv8 detects people with ~90% accuracy. Distance calculation uses average height of 170cm.", tips:"Good for crowd detection, safety alerts, attendance systems." },
  cell_phone:  { uses:"A mobile phone or smartphone.", facts:"Modern smartphones have 6-7 inch screens. Most weigh around 150-200 grams.", tips:"Keep screen clean for better camera quality. Average battery life: 4000mAh." },
  laptop:      { uses:"A portable computer for work, study, and entertainment.", facts:"Average laptop battery lasts 6-10 hours. Screen sizes range from 13 to 17 inches.", tips:"Keep vents clear for cooling. Clean keyboard regularly." },
  bottle:      { uses:"Container for liquids — water, juice, soft drinks.", facts:"Plastic bottles take 450 years to decompose. Glass bottles are 100% recyclable.", tips:"Stay hydrated — drink 8 glasses of water daily. Prefer reusable bottles." },
  cup:         { uses:"Drinking vessel for hot or cold beverages.", facts:"Average cup holds 250ml. Ceramic cups retain heat better than plastic.", tips:"Wash cups after every use to prevent bacterial growth." },
  chair:       { uses:"Furniture for sitting — office, dining, or relaxation.", facts:"Ergonomic chairs reduce back pain by 60%. Invented over 5000 years ago.", tips:"Adjust chair height so feet flat on floor. Take breaks every hour." },
  book:        { uses:"Printed or bound collection of pages for reading.", facts:"The average book has 64,000 words. Reading improves memory and focus.", tips:"Read 20 minutes daily to reduce stress by 68%." },
  dog:         { uses:"Domestic pet and working animal — guard, guide, companion.", facts:"Dogs can smell 100,000 times better than humans. 340+ recognised breeds exist.", tips:"Walk dogs at least 30 minutes daily. Regular vet checkups are important." },
  cat:         { uses:"Popular household pet known for independence and agility.", facts:"Cats sleep 12-16 hours per day. They can jump 6 times their height.", tips:"Cats need fresh water daily. Indoor cats live 2-3x longer than outdoor ones." },
  car:         { uses:"Motor vehicle for personal transportation.", facts:"Average car has 30,000 parts. Cars emit 4.6 metric tons of CO2 per year.", tips:"Check tyre pressure monthly. Service every 10,000 km." },
  backpack:    { uses:"Bag worn on back for carrying items — school, travel, hiking.", facts:"Backpacks distribute weight across shoulders reducing strain.", tips:"Never carry more than 15% of your body weight in a backpack." },
  keyboard:    { uses:"Input device for typing on computers.", facts:"Average keyboard has 104 keys. QWERTY layout designed in 1873.", tips:"Clean keyboard monthly with compressed air. Use wrist rest to prevent strain." },
  mouse:       { uses:"Computer pointing device for navigation.", facts:"First computer mouse was made of wood in 1964.", tips:"Use a mouse pad for better tracking accuracy." },
  tv:          { uses:"Television — entertainment and information display device.", facts:"First colour TV broadcast was in 1954. Modern 4K TVs have 8 million pixels.", tips:"Sit at least 1.5 metres from screen. Adjust brightness for eye comfort." },
  couch:       { uses:"Upholstered furniture for sitting or lying — living room staple.", facts:"Also called sofa or settee. Average lifespan is 7-15 years.", tips:"Vacuum weekly. Use armrest covers to prevent wear." },
  bicycle:     { uses:"Two-wheeled human-powered vehicle.", facts:"Cycling burns 400-600 calories per hour. 1 billion bicycles exist worldwide.", tips:"Always wear a helmet. Check brakes before riding." },
  clock:       { uses:"Timekeeping device — wall, desk, or alarm clock.", facts:"First mechanical clock invented in 1300s. Atomic clocks accurate to 1 second per 300 million years.", tips:"Set alarms 5 minutes early to avoid rushing." },
  default:     { uses:"Common everyday object.", facts:"Objects around us are designed to make life easier and more comfortable.", tips:"Handle with appropriate care. Store in a dry, clean place." }
};

// ── Per-object chip templates ─────────────────────────────────
const OBJECT_CHIPS = {
  person: {
    en: [['👤 What is a person?',       'What is a person?'],
         ['📏 How far is the person?',  'How far is the person?'],
         ['🎨 Colour details',          'What colour is the person?'],
         ['⚠️ Safety tips for people', 'Safety tips for people'],
         ['✨ More information',         'Tell me more about person']],
    hi: [['👤 व्यक्ति क्या है?',           'व्यक्ति क्या है?'],
         ['📏 व्यक्ति कितनी दूरी पर है?',  'व्यक्ति कितनी दूरी पर है?'],
         ['🎨 रंग की जानकारी',             'रंग की जानकारी बताओ'],
         ['⚠️ सुरक्षा सुझाव',              'सुरक्षा सुझाव बताओ'],
         ['✨ अधिक जानकारी',               'और जानकारी बताओ']],
    kn: [['👤 ವ್ಯಕ್ತಿ ಎಂದರೆ ಏನು?',           'ವ್ಯಕ್ತಿ ಎಂದರೆ ಏನು?'],
         ['📏 ವ್ಯಕ್ತಿ ಎಷ್ಟು ದೂರದಲ್ಲಿದ್ದಾರೆ?',   'ವ್ಯಕ್ತಿ ಎಷ್ಟು ದೂರದಲ್ಲಿದ್ದಾರೆ?'],
         ['🎨 ಬಣ್ಣದ ವಿವರ',                   'ಬಣ್ಣದ ವಿವರ ತಿಳಿಸಿ'],
         ['⚠️ ಸುರಕ್ಷತಾ ಸಲಹೆಗಳು',             'ಸುರಕ್ಷತಾ ಸಲಹೆಗಳು ಕೊಡಿ'],
         ['✨ ಹೆಚ್ಚಿನ ಮಾಹಿತಿ',                'ಇನ್ನಷ್ಟು ಮಾಹಿತಿ ಕೊಡಿ']]
  },
  'cell phone': {
    en: [['📱 What is a cell phone?',  'What is a cell phone?'],
         ['📱 Uses of a cell phone',   'What are the uses of a cell phone?'],
         ['🎨 Phone colour',           'What colour is the phone?'],
         ['📏 Distance from phone',    'How far is the phone?'],
         ['💡 Phone facts',            'Tell me facts about cell phone']],
    hi: [['📱 मोबाइल फोन क्या है?',    'मोबाइल फोन क्या है?'],
         ['📱 मोबाइल फोन के उपयोग',    'मोबाइल फोन के उपयोग बताओ'],
         ['🎨 फोन का रंग',              'फोन का रंग क्या है?'],
         ['📏 फोन कितनी दूरी पर है?',   'फोन कितनी दूरी पर है?'],
         ['💡 फोन के रोचक तथ्य',        'फोन के रोचक तथ्य बताओ']],
    kn: [['📱 ಮೊಬೈಲ್ ಫೋನ್ ಎಂದರೆ ಏನು?',     'ಮೊಬೈಲ್ ಫೋನ್ ಎಂದರೆ ಏನು?'],
         ['📱 ಮೊಬೈಲ್ ಫೋನ್‌ನ ಉಪಯೋಗಗಳು',      'ಮೊಬೈಲ್ ಫೋನ್‌ನ ಉಪಯೋಗಗಳು ತಿಳಿಸಿ'],
         ['🎨 ಫೋನ್‌ನ ಬಣ್ಣ',                  'ಫೋನ್‌ನ ಬಣ್ಣ ಏನು?'],
         ['📏 ಫೋನ್ ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?',        'ಫೋನ್ ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?'],
         ['💡 ಫೋನ್ ಬಗ್ಗೆ ಮಾಹಿತಿ',             'ಫೋನ್ ಬಗ್ಗೆ ಮಾಹಿತಿ ಕೊಡಿ']]
  },
  car: {
    en: [['🚗 What is a car?',       'What is a car?'],
         ['📏 How far is the car?',  'How far is the car?'],
         ['🎨 Car colour',           'What colour is the car?'],
         ['⚠️ Car safety tips',     'Safety tips around cars'],
         ['💡 Car facts',           'Tell me facts about cars']],
    hi: [['🚗 कार क्या है?',         'कार क्या है?'],
         ['📏 कार कितनी दूर है?',    'कार कितनी दूर है?'],
         ['🎨 कार का रंग',           'कार का रंग क्या है?'],
         ['⚠️ कार सुरक्षा सुझाव',   'कार के पास सुरक्षा सुझाव'],
         ['💡 कार के तथ्य',          'कार के बारे में रोचक तथ्य']],
    kn: [['🚗 ಕಾರು ಎಂದರೆ ಏನು?',      'ಕಾರು ಎಂದರೆ ಏನು?'],
         ['📏 ಕಾರು ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?', 'ಕಾರು ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?'],
         ['🎨 ಕಾರಿನ ಬಣ್ಣ',            'ಕಾರಿನ ಬಣ್ಣ ಏನು?'],
         ['⚠️ ಕಾರು ಸುರಕ್ಷತಾ ಸಲಹೆ',  'ಕಾರಿನ ಸುರಕ್ಷತಾ ಸಲಹೆ ಕೊಡಿ'],
         ['💡 ಕಾರಿನ ಮಾಹಿತಿ',          'ಕಾರಿನ ಬಗ್ಗೆ ಮಾಹಿತಿ ಕೊಡಿ']]
  },
  bottle: {
    en: [['🍶 What is a bottle?',    'What is a bottle?'],
         ['📏 Bottle distance',      'How far is the bottle?'],
         ['🎨 Bottle colour',        'What colour is the bottle?'],
         ['♻️ Is it recyclable?',   'Is this bottle recyclable?'],
         ['💡 Bottle facts',         'Tell me facts about bottles']],
    hi: [['🍶 बोतल क्या है?',        'बोतल क्या है?'],
         ['📏 बोतल कितनी दूर है?',   'बोतल कितनी दूर है?'],
         ['🎨 बोतल का रंग',          'बोतल का रंग क्या है?'],
         ['♻️ क्या यह recyclable है?','क्या यह बोतल recyclable है?'],
         ['💡 बोतल के तथ्य',         'बोतल के बारे में रोचक तथ्य']],
    kn: [['🍶 ಬಾಟಲಿ ಎಂದರೆ ಏನು?',     'ಬಾಟಲಿ ಎಂದರೆ ಏನು?'],
         ['📏 ಬಾಟಲಿ ಎಷ್ಟು ದೂರ?',      'ಬಾಟಲಿ ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?'],
         ['🎨 ಬಾಟಲಿ ಬಣ್ಣ',             'ಬಾಟಲಿ ಬಣ್ಣ ಏನು?'],
         ['♻️ ಇದು ಮರುಬಳಕೆ ಆಗುತ್ತಾ?', 'ಈ ಬಾಟಲಿ ಮರುಬಳಕೆ ಆಗುತ್ತಾ?'],
         ['💡 ಬಾಟಲಿ ಬಗ್ಗೆ ಮಾಹಿತಿ',    'ಬಾಟಲಿ ಬಗ್ಗೆ ಮಾಹಿತಿ ಕೊಡಿ']]
  },
  laptop: {
    en: [['💻 What is a laptop?',    'What is a laptop?'],
         ['📏 Laptop distance',      'How far is the laptop?'],
         ['🎨 Laptop colour',        'What colour is the laptop?'],
         ['⚠️ Laptop safety tips',  'Safety tips for using a laptop'],
         ['💡 Laptop facts',         'Tell me facts about laptops']],
    hi: [['💻 लैपटॉप क्या है?',       'लैपटॉप क्या है?'],
         ['📏 लैपटॉप कितनी दूर है?',  'लैपटॉप कितनी दूर है?'],
         ['🎨 लैपटॉप का रंग',         'लैपटॉप का रंग क्या है?'],
         ['⚠️ लैपटॉप सुरक्षा',        'लैपटॉप उपयोग के सुरक्षा सुझाव'],
         ['💡 लैपटॉप तथ्य',           'लैपटॉप के बारे में रोचक तथ्य']],
    kn: [['💻 ಲ್ಯಾಪ್‌ಟಾಪ್ ಎಂದರೆ ಏನು?',  'ಲ್ಯಾಪ್‌ಟಾಪ್ ಎಂದರೆ ಏನು?'],
         ['📏 ಲ್ಯಾಪ್‌ಟಾಪ್ ಎಷ್ಟು ದೂರ?',   'ಲ್ಯಾಪ್‌ಟಾಪ್ ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?'],
         ['🎨 ಲ್ಯಾಪ್‌ಟಾಪ್ ಬಣ್ಣ',          'ಲ್ಯಾಪ್‌ಟಾಪ್ ಬಣ್ಣ ಏನು?'],
         ['⚠️ ಲ್ಯಾಪ್‌ಟಾಪ್ ಸುರಕ್ಷತೆ',     'ಲ್ಯಾಪ್‌ಟಾಪ್ ಬಳಕೆ ಸುರಕ್ಷತಾ ಸಲಹೆ'],
         ['💡 ಲ್ಾಯಪ್‌ಟಾಪ್ ಮಾಹಿತಿ',       'ಲ್ಯಾಪ್‌ಟಾಪ್ ಬಗ್ಗೆ ಮಾಹಿತಿ ಕೊಡಿ']]
  }
};

/**
 * Generate dynamic chips for any object, even if not in OBJECT_CHIPS.
 * Falls back to generic template using the raw object name.
 */
function getDynamicChips(objName, lang) {
  // Normalise key: lowercase, trim
  const key = (objName || '').toLowerCase().trim();

  // Check for exact match first, then partial match
  let template = OBJECT_CHIPS[key];
  if (!template) {
    for (const k of Object.keys(OBJECT_CHIPS)) {
      if (key.includes(k) || k.includes(key)) { template = OBJECT_CHIPS[k]; break; }
    }
  }

  // Use matched template in the right language
  if (template) {
    return template[lang] || template['en'];
  }

  // ── Generic fallback: build chips dynamically from object name ──
  const n = objName; // display name as-is
  const generics = {
    en: [[`🔍 What is a ${n}?`,       `What is a ${n}?`],
         [`📏 How far is the ${n}?`,  `How far is the ${n}?`],
         [`🎨 ${n} colour`,           `What colour is the ${n}?`],
         [`⚠️ Safety tips`,          `Safety tips for ${n}`],
         [`✨ More info about ${n}`,  `Tell me more about ${n}`]],
    hi: [[`🔍 ${n} क्या है?`,          `${n} क्या है?`],
         [`📏 ${n} कितनी दूरी पर है?`, `${n} कितनी दूरी पर है?`],
         [`🎨 ${n} का रंग`,            `${n} का रंग क्या है?`],
         [`⚠️ सुरक्षा सुझाव`,          `${n} के लिए सुरक्षा सुझाव`],
         [`✨ ${n} की जानकारी`,         `${n} के बारे में और बताओ`]],
    kn: [[`🔍 ${n} ಎಂದರೆ ಏನು?`,        `${n} ಎಂದರೆ ಏನು?`],
         [`📏 ${n} ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?`,  `${n} ಎಷ್ಟು ದೂರದಲ್ಲಿದೆ?`],
         [`🎨 ${n} ಬಣ್ಣ`,               `${n} ಬಣ್ಣ ಏನು?`],
         [`⚠️ ಸುರಕ್ಷತಾ ಸಲಹೆ`,          `${n} ಗಾಗಿ ಸುರಕ್ಷತಾ ಸಲಹೆ`],
         [`✨ ${n} ಬಗ್ಗೆ ಮಾಹಿತಿ`,        `${n} ಬಗ್ಗೆ ಇನ್ನಷ್ಟು ಮಾಹಿತಿ`]]
  };
  return generics[lang] || generics['en'];
}

/**
 * Refresh the #chatChipBar with chips for the current object + language.
 * Call this after every successful detection and after every language change.
 */
function refreshChipBar(objName, lang) {
  const bar = document.getElementById('chatChipBar');
  if (!bar) return;

  if (!objName) { bar.innerHTML = ''; return; }

  const chips = getDynamicChips(objName, lang || currentLang);

  bar.innerHTML = chips.map(([label, query]) =>
    `<div class="chip-suggestion" data-query="${escHtml(query)}">${escHtml(label)}</div>`
  ).join('');

  bar.querySelectorAll('.chip-suggestion').forEach(chip => {
    chip.addEventListener('click', () => {
      const inp = document.getElementById('chatInput');
      if (inp) { inp.value = chip.getAttribute('data-query'); }
      if (typeof sendChat === 'function') sendChat();
    });
  });
}
// Expose so app.html inline script can also call it
window.refreshChipBar = refreshChipBar;

function getObjectKey(name) {
  const n = (name||'').toLowerCase().replace(/ /g,'_');
  if (OBJECT_INFO[n]) return n;
  for (const k of Object.keys(OBJECT_INFO)) {
    if (n.includes(k) || k.includes(n)) return k;
  }
  return 'default';
}

// ── Smart chat response (when Claude not available) ───────────
function buildSmartResponse(message, detectedObject, colorName, distance, language) {
  const msg = message.toLowerCase();
  const obj = detectedObject || 'the object';
  const col = colorName || '';
  const dist = distance ? `${distance.cm} cm (${distance.m} m)` : 'unknown';
  const info = OBJECT_INFO[getObjectKey(obj)] || OBJECT_INFO.default;

  if (language === 'hi') {
    if (msg.includes('क्या') || msg.includes('what') || msg.includes('kya')) return `यह एक ${obj} है। ${col ? `इसका रंग ${col} है। ` : ''}${info.uses}`;
    if (msg.includes('दूरी') || msg.includes('door') || msg.includes('distance')) return distance ? `${obj} आपसे ${dist} दूर है।` : `${obj} की दूरी नहीं मापी जा सकी।`;
    if (msg.includes('रंग') || msg.includes('rang') || msg.includes('color')) return col ? `${obj} का रंग ${col} है।` : `${obj} का रंग पहचाना नहीं गया।`;
    if (msg.includes('hello') || msg.includes('नमस्ते') || msg.includes('hi')) return `नमस्ते! मैंने ${obj} देखा है। आप इसके बारे में क्या जानना चाहते हैं?`;
    return `${obj} के बारे में: ${info.uses} ${col ? `रंग: ${col}.` : ''}`;
  }

  if (language === 'kn') {
    if (msg.includes('ಏನು') || msg.includes('what')) return `ಇದು ${obj} ಆಗಿದೆ. ${col ? `ಇದರ ಬಣ್ಣ ${col}. ` : ''}${info.uses}`;
    if (msg.includes('ದೂರ') || msg.includes('distance')) return distance ? `${obj} ನಿಮ್ಮಿಂದ ${dist} ದೂರದಲ್ಲಿದೆ.` : `${obj} ದೂರ ಅಳೆಯಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ.`;
    if (msg.includes('ಬಣ್ಣ') || msg.includes('color')) return col ? `${obj} ಬಣ್ಣ ${col}.` : `${obj} ಬಣ್ಣ ಗುರುತಿಸಲಾಗಿಲ್ಲ.`;
    return `${obj} ಬಗ್ಗೆ: ${info.uses}`;
  }

  // English
  if (msg.match(/^(hi|hello|hey|hii|yo)/)) return `Hello! 👋 I can see a **${obj}**${col?' ('+col+')':''}${distance?' at '+dist:''}. Ask me anything about it!`;
  if (msg.match(/what is|what's this|identify|tell me about|describe/)) return `That's a **${obj}**! 🎯\n\n${info.uses}\n\n${col ? '🎨 Colour: **'+col+'**\n' : ''}${distance ? '📏 Distance: **'+dist+'**\n' : ''}\n💡 ${info.tips}`;
  if (msg.match(/how far|distance|how close|how near|metres|meters|cm|centimetre/)) return distance ? `📏 The **${obj}** is **${dist}** away from the camera.\n\n${distance.cm < 80 ? '⚠️ That\'s quite close! Be careful.' : distance.cm < 200 ? 'Nearby range.' : 'At a comfortable distance.'}` : `I can't measure the distance for ${obj} right now.`;
  if (msg.match(/what colou?r|colour|color/)) return col ? `🎨 The **${obj}** appears to be **${col}**.` : `I couldn't identify the colour of this ${obj}. Try better lighting.`;
  if (msg.match(/use|useful|purpose|why|what for/)) return `**${obj.charAt(0).toUpperCase()+obj.slice(1)}** uses:\n\n${info.uses}\n\n${info.tips}`;
  if (msg.match(/fact|interesting|tell me more|info|information/)) return `📚 Facts about **${obj}**:\n\n${info.facts}\n\n${info.tips}`;
  if (msg.match(/safe|danger|hazard|warning|careful/)) return distance && distance.cm < 80 ? `⚠️ The **${obj}** is very close (${dist})! Be careful.` : `The **${obj}** appears safe. ${info.tips}`;
  if (msg.match(/how many|count|number of/)) return currentDetections.length > 0 ? `I can see **${currentDetections.length} object(s)**: ${currentDetections.map(d=>d.name).join(', ')}.` : `I currently see **1 object**: the **${obj}**.`;
  if (msg.match(/price|cost|buy|purchase|shop/)) return `I can identify objects but don't have pricing data. Search for **"${obj} price"** on Amazon or Flipkart.`;
  if (msg.match(/thank|thanks|thx|good|great|nice|wow|amazing|cool/)) return `You're welcome! 😊 Want to know more about the **${obj}**?`;
  if (obj && obj !== 'the object') return `About the **${obj}**${col?' ('+col+')':''}:\n\n${info.uses}\n\n${distance?'📏 Distance: **'+dist+'**\n':''}💡 ${info.tips}\n\nAsk me: "what is it", "how far", "what colour", or "facts"!`;
  return `I'm your Smart Vision AI! 🤖 Ask me about:\n• What is this?\n• How far is it?\n• What colour?\n• Tell me facts\n• Is it safe?`;
}

// ── INIT ──────────────────────────────────────────────────────
function init() {
  setupEvents();
  checkHealth();
  loadHistory();
  const saved = localStorage.getItem('svt');
  if (saved) document.documentElement.setAttribute('data-theme',saved);
  setTimeout(showQuickChips, 500);
}

function showQuickChips() {
  const cm = $('chatMessages');
  if (!cm) return;

  // Remove existing quick chips first to avoid duplicates
  const existing = $('quickChips');
  if (existing) existing.remove();

  const chips = document.createElement('div');
  chips.className = 'chat-chips';
  chips.id = 'quickChips';
  const chipData = {
    en: [['🔍 What is this?','What is this?'],['📏 Distance?','How far is it?'],['🎨 Colour?','What colour?'],['📚 Facts','Tell me facts'],['⚠️ Safe?','Is it safe?']],
    hi: [['🔍 यह क्या है?','यह क्या है?'],['📏 दूरी?','दूरी कितनी है?'],['🎨 रंग?','रंग क्या है?'],['📚 जानकारी','जानकारी बताओ'],['⚠️ सुरक्षित?','सुरक्षित है?']],
    kn: [['🔍 ಇದು ಏನು?','ಇದು ಏನು?'],['📏 ದೂರ?','ದೂರ ಎಷ್ಟು?'],['🎨 ಬಣ್ಣ?','ಬಣ್ಣ ಏನು?'],['📚 ಮಾಹಿತಿ','ಮಾಹಿತಿ ಕೊಡಿ'],['⚠️ ಸುರಕ್ಷಿತ?','ಸುರಕ್ಷಿತವೇ?']]
  };
  const ch = chipData[currentLang] || chipData.en;
  chips.innerHTML = ch.map(([label, query]) => `<span class="chip" onclick="chipAsk('${query}')">${label}</span>`).join('');
  cm.appendChild(chips);
  cm.scrollTop = cm.scrollHeight;
}

function chipAsk(text) { $('chatInput').value = text; sendChat(); }
window.chipAsk = chipAsk;

function setupEvents() {
  $('startCamBtn').addEventListener('click', startCamera);
  $('stopCamBtn').addEventListener('click',  stopCamera);
  $('captureBtn').addEventListener('click',  saveCurrentFrame);
  $('dropZone').addEventListener('click',    ()=>$('fileInput').click());
  $('dropZone').addEventListener('dragover', e=>{e.preventDefault();$('dropZone').classList.add('drag-over');});
  $('dropZone').addEventListener('dragleave',()=>$('dropZone').classList.remove('drag-over'));
  $('dropZone').addEventListener('drop',     e=>{e.preventDefault();$('dropZone').classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});
  $('fileInput').addEventListener('change',  e=>handleFile(e.target.files[0]));
  $('clearUploadBtn').addEventListener('click',  clearUpload);
  $('analyseAgainBtn').addEventListener('click', ()=>{if(window._lastFile)handleFile(window._lastFile);});
  $('sendBtn').addEventListener('click',    sendChat);
  $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}});
  $('clearChatBtn').addEventListener('click',    clearChat);
  $('clearResultsBtn').addEventListener('click', clearResults);
  $('speakAllBtn').addEventListener('click',     speakAll);
  $('clearHistoryBtn').addEventListener('click', clearHistoryQuick);
  $('langSelect').addEventListener('change',     e=>applyLang(e.target.value));
  $('voiceCmdBtn').addEventListener('click',     toggleVoice);
  $('themeBtn').addEventListener('click',        toggleTheme);
  applyLang('en');
}

function switchTab(tab) {
  ['detect','gallery','feedback','history'].forEach(t=>{
    const pg=$('page-'+t); if(pg) pg.style.display=t===tab?'block':'none';
    const btn=$('tab'+t.charAt(0).toUpperCase()+t.slice(1));
    if(btn) btn.classList.toggle('active',t===tab);
  });
  if(tab==='gallery')  loadGallery();
  if(tab==='feedback') loadFeedbackSummary();
  if(tab==='history')  loadHistoryFull();
}
window.switchTab=switchTab;

function applyLang(lang) {
  currentLang = lang;
  window.currentLang = lang; // keep window in sync for app.html overrides
  window.speechSynthesis.cancel();
  const ml=$('mLang'); if(ml) ml.textContent=lang.toUpperCase();
  const L={
    en:{start:'Start Camera',stop:'Stop',cap:'📸 Save',voice:'Start Voice',
        welcome:"Hello! 👋 I'm your Smart Vision AI. Start camera or upload image — then ask me anything!"},
    hi:{start:'कैमरा शुरू करें',stop:'बंद',cap:'📸 सेव',voice:'वॉयस शुरू करें',
        welcome:'नमस्ते! 👋 कैमरा चालू करें और मुझसे कुछ भी पूछें!'},
    kn:{start:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ',stop:'ನಿಲ್ಲಿಸಿ',cap:'📸 ಸೇವ್',voice:'ಧ್ವನಿ ಪ್ರಾರಂಭಿಸಿ',
        welcome:'ನಮಸ್ಕಾರ! 👋 ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ ಮತ್ತು ಏನಾದರೂ ಕೇಳಿ!'},
  };
  const u=L[lang]||L.en;
  if($('startCamBtn')) $('startCamBtn').textContent=u.start;
  if($('stopCamBtn'))  $('stopCamBtn').textContent=u.stop;
  if($('captureBtn'))  $('captureBtn').textContent=u.cap;
  if($('lblVoiceCmd')) $('lblVoiceCmd').textContent=u.voice;

  // Update welcome message text
  const wm=$('welcomeMsg');
  if(wm) wm.textContent=u.welcome;

  // Update chat input placeholder
  const ci=$('chatInput');
  if(ci) ci.placeholder = lang==='hi'
    ? 'हिंदी में पूछें… जैसे: यह क्या है?'
    : lang==='kn'
    ? 'ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ… ಉದಾ: ಇದು ಏನು?'
    : 'Ask about detected object…';

  // ── NEW: refresh quick chips in new language ──
  const existingChips = $('quickChips');
  if (existingChips) existingChips.remove();

  // Only show chips if no camera/detection active yet
  // (if detections exist, chips are managed by addDetectionCard)
  if (!currentDetections || currentDetections.length === 0) {
    showQuickChips();
  }

  // ── NEW: update chip bar suggestions in new language ──
  if (window.updateChatSuggestions) {
    window.updateChatSuggestions();
  }
  refreshChipBar(currentObjectContext || '', lang);
  // ── NEW: update follow-up chips if any exist ──
  const followups = document.querySelectorAll('.followup-chips');
  followups.forEach(el => el.remove());
}

function setStatus(msg,type='ok') {
  const t=$('statusText'),c=$('statusChip');
  if(t) t.textContent=msg;
  if(c) c.className='status-chip'+(type==='error'?' error':'');
}

async function checkHealth() {
  try {
    const r=await fetch(`${API}/api/health`);
    const d=await r.json();
    setStatus('Ready'+(d.ai_ready?' · AI':''),'ok');
  } catch { setStatus('Server offline','error'); }
}

// ── CAMERA ────────────────────────────────────────────────────
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showPhoneHelp(); return; }
  try {
    let stream;
    try { stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}}); }
    catch { stream=await navigator.mediaDevices.getUserMedia({video:true}); }
    currentStream=stream;
    const ve=$('videoEl'); ve.srcObject=stream;
    await new Promise(res=>{ve.onloadedmetadata=res;});
    await ve.play();
    ve.style.display='block';
    $('camPlaceholder').style.display='none';
    $('camScanOverlay').style.display='block';
    $('liveBadge').style.display='inline-flex';
    $('startCamBtn').disabled=true; $('stopCamBtn').disabled=false; $('captureBtn').disabled=false;
    isCameraOn=true; setStatus('Camera Active','ok');
    drawLoop();
    captureInterval=setInterval(captureAndDetect,3000);
  } catch(e) { setStatus('Camera Error','error'); showPhoneHelp(); }
}

function showPhoneHelp() {
  const isPhone=/Android|iPhone|iPad/i.test(navigator.userAgent);
  const isHttp=location.protocol==='http:';
  if(isPhone&&isHttp){
    addBotMsg(`📱 Camera blocked on phone over HTTP.\n\n✅ Fix in Chrome:\n1. Go to chrome://flags\n2. Search "Insecure origins"\n3. Add: http://${location.hostname}:5000\n4. Enable → Relaunch\n\nOR use 📤 Upload to upload photos from gallery.`);
  } else {
    addBotMsg(`❌ Camera error. Allow camera permission in browser settings.\n\nOr use the 📤 Upload section below.`);
  }
}

function stopCamera() {
  if(currentStream) currentStream.getTracks().forEach(t=>t.stop());
  currentStream=null; clearInterval(captureInterval); captureInterval=null;
  const ve=$('videoEl'); if(ve) ve.style.display='none';
  if($('camPlaceholder')) $('camPlaceholder').style.display='flex';
  if($('camScanOverlay')) $('camScanOverlay').style.display='none';
  if($('liveBadge'))      $('liveBadge').style.display='none';
  if($('startCamBtn'))    $('startCamBtn').disabled=false;
  if($('stopCamBtn'))     $('stopCamBtn').disabled=true;
  if($('captureBtn'))     $('captureBtn').disabled=true;
  isCameraOn=false; setStatus('Camera Stopped','ok');
}

function drawLoop() {
  if(!isCameraOn) return;
  const vc=$('videoCanvas'),ve=$('videoEl');
  if(ve&&ve.videoWidth>0){vc.width=ve.videoWidth;vc.height=ve.videoHeight;vc.getContext('2d').drawImage(ve,0,0);}
  requestAnimationFrame(drawLoop);
}

async function captureAndDetect() {
  if(!isCameraOn||isProcessing) return;
  const now=Date.now(); if(now-lastCaptureTime<2500) return;
  lastCaptureTime=now;
  const ve=$('videoEl'),c=document.createElement('canvas');
  c.width=ve.videoWidth||640; c.height=ve.videoHeight||480;
  c.getContext('2d').drawImage(ve,0,0);
  c.toBlob(blob=>{if(blob)sendForDetection(blob,'camera');},'image/jpeg',0.85);
}

async function saveCurrentFrame() {
  if(!isCameraOn||!currentDetections.length){addBotMsg('Start camera and detect an object first, then click Save.');return;}
  const ve=$('videoEl'),c=document.createElement('canvas');
  c.width=ve.videoWidth||640; c.height=ve.videoHeight||480;
  c.getContext('2d').drawImage(ve,0,0);
  c.toBlob(async blob=>{
    const fd=new FormData();
    fd.append('file',blob,'capture.jpg');
    fd.append('language',currentLang);
    fd.append('auto_save','true');
    try{
      const r=await fetch(`${API}/api/detect`,{method:'POST',headers:{'Authorization':'Bearer '+getToken()},body:fd});
      const d=await r.json();
      if(d.saved_image_id){ addBotMsg(`📸 Saved to gallery!`); const mi=$('mImages'); if(mi)mi.textContent=parseInt(mi.textContent||0)+1; }
    }catch(e){addBotMsg('Save failed: '+e.message);}
  },'image/jpeg',0.9);
}

function setUploadMode(mode){ uploadMode=mode; $('tabDet').classList.toggle('active',mode==='detect'); $('tabOCR').classList.toggle('active',mode==='ocr'); }
window.setUploadMode=setUploadMode;

function handleFile(file){
  if(!file||!file.type.startsWith('image/'))return;
  const r=new FileReader();
  r.onload=e=>{$('previewImg').src=e.target.result;$('dropZone').style.display='none';$('uploadPreview').style.display='block';};
  r.readAsDataURL(file); window._lastFile=file;
  if(uploadMode==='ocr') sendForOCR(file); else sendForDetection(file,'upload');
}
function clearUpload(){$('uploadPreview').style.display='none';$('dropZone').style.display='flex';$('fileInput').value='';window._lastFile=null;}

// ── DETECTION ─────────────────────────────────────────────────
async function sendForDetection(blob,source) {
  if(isProcessing) return; isProcessing=true; setStatus('Analysing…','ok');
  const fd=new FormData();
  fd.append('file',blob,'image.jpg');
  fd.append('language',currentLang);
  fd.append('auto_save','false');
  try{
    const res=await fetch(`${API}/api/detect`,{method:'POST',headers:{'Authorization':'Bearer '+getToken()},body:fd});
    if(res.status===401){setStatus('Session expired','error');stopCamera();setTimeout(()=>window.location.href='/',1500);isProcessing=false;return;}
    const data=await res.json();
    if(data.error)throw new Error(data.error);

    currentDetections=data.objects||[];
    renderDetections(currentDetections);
    const md=$('mDetections');if(md)md.textContent=currentDetections.length;

    if(data.annotated_image){
      const img=new Image();
      img.onload=()=>{const vc=$('videoCanvas');vc.width=img.naturalWidth;vc.height=img.naturalHeight;vc.getContext('2d').drawImage(img,0,0);};
      img.src=`data:image/jpeg;base64,${data.annotated_image}`;
      if(source==='upload')$('previewImg').src=img.src;
    }

    if(currentDetections.length>0){
      const first=currentDetections[0];
      currentObjectContext=first.name;
      currentColorContext=first.color?.name||'';
      refreshChipBar(first.name, currentLang);
      $('chatInput').disabled=false;$('sendBtn').disabled=false;
      $('speakAllBtn').disabled=false;
      if(first.name!==window._lastChatObj){
        window._lastChatObj=first.name;
        addDetectionCard(first, currentDetections.length);

        if(voiceEnabled){
          // ── FIXED: speak detection announcement in current language ──
          const spokenText = phrase('detected', currentLang,
            first.name,
            first.color?.name || '',
            first.distance?.cm || null
          );
          speak(spokenText);
        }
      }
    }
    checkObstacles(currentDetections);
    loadHistory();
    setStatus('Ready','ok');
    if(data.saved_image_id){ const mi=$('mImages'); if(mi)mi.textContent=parseInt(mi.textContent||0)+1; }
  }catch(e){setStatus('Detection error','error');console.error(e);}
  isProcessing=false;
}

function addDetectionCard(det, totalCount) {
  const col = det.color;
  const dist = det.distance;
  const conf = Math.round(det.confidence*100);
  const lang = currentLang || 'en';

  const chipLabels = {
    en: ['Tell me more', 'Uses', 'Facts', 'Distance'],
    hi: ['और बताओ', 'उपयोग', 'तथ्य', 'दूरी'],
    kn: ['ಇನ್ನಷ್ಟು ತಿಳಿಸಿ', 'ಉಪಯೋಗ', 'ವಿಷಯ', 'ದೂರ']
  };
  const chipQueries = {
    en: [`What is a ${det.name}?`, `What are the uses of ${det.name}?`, `Tell me facts about ${det.name}`, `How far is it?`],
    hi: [`${det.name} क्या है?`, `${det.name} का उपयोग क्या है?`, `${det.name} के बारे में रोचक तथ्य बताओ`, `दूरी कितनी है?`],
    kn: [`${det.name} ಏನು?`, `${det.name} ಉಪಯೋಗ ಏನು?`, `${det.name} ಬಗ್ಗೆ ಮಾಹಿತಿ ಕೊಡಿ`, `ದೂರ ಎಷ್ಟು?`]
  };
  const labels = chipLabels[lang] || chipLabels.en;
  const queries = chipQueries[lang] || chipQueries.en;

  const chipsHtml = labels.map((l, i) => {
    if (i === 3 && !dist) return '';
    return `<span class="chip sm" onclick="chipAsk('${queries[i]}')">${l}</span>`;
  }).join('');

  const d = document.createElement('div');
  d.className = 'msg-bot detection-card-msg';
  d.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble detection-bubble">
      <div class="db-header">
        <span class="db-icon">🎯</span>
        <strong>${det.name.toUpperCase()}</strong>
        <span class="db-conf ${conf>=80?'high':conf>=55?'med':'low'}">${conf}%</span>
        ${totalCount>1?`<span class="db-total">+${totalCount-1} more</span>`:''}
      </div>
      <div class="db-row">${col&&col.name?`<span class="db-tag">🎨 ${col.name}</span>`:''} ${dist?`<span class="db-tag">📏 ${dist.cm}cm</span>`:''}</div>
    <div class="db-chips">
  ${labels.map((l, i) => `<span class="chip sm" onclick="chipAsk('${queries[i]}')">${l}</span>`).join('')}
</div>`;
  const cm=$('chatMessages');
  cm.appendChild(d);
  cm.scrollTop=cm.scrollHeight;
}
function renderDetections(dets) {
  const rc=$('resultsContainer');
  if(!dets||!dets.length){
    rc.innerHTML=`<div class="empty-results"><div class="empty-icon-anim">🎯</div><p>No objects detected</p><p class="empty-note">Point camera at an object or upload an image</p></div>`;
    return;
  }
  rc.innerHTML=dets.map((det,i)=>{
    const conf=Math.round(det.confidence*100);
    const cls=conf>=80?'conf-high':conf>=55?'conf-med':'conf-low';
    const d=det.distance,col=det.color;
    let zone='',zoneCol='#888';
    if(d){if(d.cm<50){zone='🔴 Very Close';zoneCol='#ff3c5e';}else if(d.cm<100){zone='🟡 Close';zoneCol='#f5a623';}else if(d.cm<200){zone='🔵 Near';zoneCol='#00d4ff';}else if(d.cm<500){zone='🟢 Medium';zoneCol='#00ff9d';}else{zone='🟣 Far';zoneCol='#7b5ea7';}}
    const barW=d?Math.max(3,Math.min(97,100-Math.min(d.cm,1000)/1000*100)):0;
    return `
    <div class="det-item">
      <div class="det-header">
        <span class="det-name">${det.name.toUpperCase()}</span>
        <span class="det-conf-badge ${cls}">${conf}%</span>
        ${det.original_name&&det.original_name!==det.name?`<span class="corrected-badge">corrected</span>`:''}
      </div>
      ${col&&col.name?`<div class="det-colour-row"><div class="colour-swatch" style="background:${col.hex||'#888'}"></div><span class="colour-name">🎨 ${col.name}</span><span class="colour-hex">${col.hex||''}</span></div>`:''}
      ${d?`<div class="dist-row">
        <div class="dist-top-row"><span>📏</span><span class="dist-number">${d.cm} cm${d.cm>=100?' ('+d.m+'m)':''}</span><span class="dist-zone-badge" style="background:${zoneCol}22;border:1px solid ${zoneCol};color:${zoneCol}">${zone}</span></div>
        <div class="dist-bar-wrap"><div class="dist-bar" style="width:${barW}%;background:linear-gradient(90deg,${zoneCol},${zoneCol}88)"></div></div>
        <div class="dist-hint-row"><span class="dist-scale-lbl">0cm</span><span class="dist-scale-mid">5m</span><span class="dist-scale-lbl">10m+</span></div>
      </div>`:''}
      <div class="det-actions">
        <button class="det-btn speak" onclick="speakDet(${i})">🔊 Speak</button>
        <button class="det-btn" onclick="askAbout('${det.name}','${col?.name||''}')">💬 Ask AI</button>
        <button class="det-btn info" onclick="showFullInfo('${det.name}')">📋 Info</button>
        <button class="det-btn" style="border-color:rgba(255,60,94,.4);color:#ff3c5e" onclick="quickCorrect('${det.name}','${col?.name||''}')">🔄 Wrong?</button>
      </div>
    </div>`;
  }).join('');
}

async function sendForOCR(blob){
  if(isProcessing)return;isProcessing=true;setStatus('Reading text…','ok');addBotMsg('🔠 Reading text from image…');
  const fd=new FormData();fd.append('file',blob,'image.jpg');fd.append('language',currentLang);
  try{
    const res=await fetch(`${API}/api/ocr`,{method:'POST',headers:{'Authorization':'Bearer '+getToken()},body:fd});
    const data=await res.json();
    if(data.text){addBotMsg(`📝 Text found:\n\n${data.text}`);if(voiceEnabled)speak(data.text);$('chatInput').disabled=false;$('sendBtn').disabled=false;}
    else{addBotMsg(data.message||'No text found.');if(data.tip)addBotMsg(`💡 ${data.tip}`);}
    setStatus('Ready','ok');
  }catch{addBotMsg('OCR failed.');setStatus('Error','error');}
  isProcessing=false;
}

async function showFullInfo(name){
  $('fullInfoModal').style.display='flex';
  $('infoTitle').textContent=name;
  $('infoBody').textContent='Loading…';
  try{
    const res=await fetch(`${API}/api/full_info`,{method:'POST',headers:authHJ(),body:JSON.stringify({object_name:name,language:currentLang})});
    const data=await res.json();
    fullInfoText=data.info||'No information available.';
    $('infoBody').textContent=fullInfoText;
  }catch{$('infoBody').textContent='Could not load information.';}
}
window.showFullInfo=showFullInfo;
window.closeFullInfo=()=>{$('fullInfoModal').style.display='none';};
window.speakFullInfo=()=>{if(fullInfoText)speak(fullInfoText);};

async function checkObstacles(dets){
  const close=dets.filter(d=>d.distance&&d.distance.cm<80);if(!close.length)return;
  try{
    const res=await fetch(`${API}/api/obstacle_check`,{method:'POST',headers:authHJ(),body:JSON.stringify({detections:dets,language:currentLang})});
    const data=await res.json();
    if(data.has_alert){
      $('alertTitle').textContent='⚠️ Obstacle Alert!';
      $('alertMsg').textContent=data.alerts[0];
      $('obstacleModal').style.display='flex';
      // Speak obstacle warning in current language
      const firstClose=close[0];
      speak(phrase('obstacle', currentLang, firstClose.name, firstClose.distance.cm));
    }
  }catch{}
}
window.closeObstacleAlert=()=>{$('obstacleModal').style.display='none';};

// ── SPEAK — core TTS function with proper multilingual voice matching ──
async function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();

  // Ensure voices are loaded (async on first call)
  if (!_voicesLoaded) await loadVoices();

  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.88;
  utt.pitch = 1.0;
  utt.volume = 1.0;

  // Language code + ordered fallback chain per language
  const langConfig = {
    en: { primary: 'en-IN', fallbacks: ['en-US', 'en-GB', 'en-AU', 'en'] },
    hi: { primary: 'hi-IN', fallbacks: ['hi', 'en-IN', 'en-US'] },
    kn: { primary: 'kn-IN', fallbacks: ['kn', 'hi-IN', 'en-IN', 'en-US'] }
  };

  const config = langConfig[currentLang] || langConfig.en;
  const tryOrder = [config.primary, ...config.fallbacks];

  // Find best matching voice
  let matched = null;
  for (const code of tryOrder) {
    const baseLang = code.split('-')[0];
    // Exact match first
    matched = _voices.find(v => v.lang === code);
    if (matched) break;
    // Prefix match (e.g. 'hi' matches 'hi-IN')
    matched = _voices.find(v => v.lang.startsWith(baseLang + '-') || v.lang === baseLang);
    if (matched) break;
  }

  // Set lang on utterance (use matched voice's lang or primary code)
  utt.lang = matched ? matched.lang : config.primary;
  if (matched) utt.voice = matched;

  voiceEnabled = true;
  const mv = $('mVoice');
  if (mv) { mv.textContent = 'ON'; mv.classList.add('on'); }

  // Chrome bug workaround: long utterances get cut off — chunk if needed
  if (text.length > 200) {
    const sentences = text.match(/[^।.!?]+[।.!?]+/g) || [text];
    let i = 0;
    function speakNext() {
      if (i >= sentences.length) return;
      const u2 = new SpeechSynthesisUtterance(sentences[i++]);
      u2.lang = utt.lang; u2.rate = utt.rate; u2.pitch = utt.pitch; u2.volume = utt.volume;
      if (matched) u2.voice = matched;
      u2.onend = speakNext;
      window.speechSynthesis.speak(u2);
    }
    speakNext();
    return;
  }

  window.speechSynthesis.speak(utt);
}

// ── speakDet: speaks detection info in current language ────────
function speakDet(idx) {
  const det = currentDetections[idx];
  if (!det) return;
  const dist = det.distance;
  const col  = det.color;

  // Build fully localised spoken string
  let spokenText = phrase('detected', currentLang,
    det.name,
    col?.name || '',
    dist?.cm || null
  );

  // Add distance zone description if available
  if (dist) {
    const zoneKey = dist.cm < 50 ? 'veryClose' : dist.cm < 100 ? 'close' : dist.cm < 200 ? 'near' : dist.cm < 500 ? 'medium' : 'far';
    const zones = SPEAK_PHRASES.distanceZone[currentLang] || SPEAK_PHRASES.distanceZone.en;
    spokenText += '. ' + zones[zoneKey];
  }

  speak(spokenText);
}

// ── speakAll: speaks all detected objects in current language ──
function speakAll() {
  if (!currentDetections.length) {
    speak(SPEAK_PHRASES.noObjects[currentLang] || SPEAK_PHRASES.noObjects.en);
    return;
  }
  const nameList = currentDetections.map(d => d.name).join(', ');
  speak(phrase('speakAll', currentLang, nameList));
}

function toggleVoice(){if(voiceListening)stopVoice();else startVoice();}
function startVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addBotMsg('Voice recognition needs Chrome or Edge.');return;}
  recognition=new SR();
  recognition.lang=LANG_CODES[currentLang]||'en-IN';
  recognition.continuous=false;recognition.interimResults=false;
  recognition.onstart=()=>{voiceListening=true;$('voiceCmdBtn').classList.add('listening');$('lblVoiceCmd').textContent='Stop Listening';$('voiceTranscript').style.display='block';$('vtText').textContent='…';$('vsText').textContent='Listening…';const vd=document.querySelector('.vs-dot');if(vd)vd.classList.add('active');};
  recognition.onresult=e=>{const t=e.results[0][0].transcript;$('vtText').textContent=t;handleCmd(t.toLowerCase());};
  recognition.onerror=recognition.onend=stopVoice;
  recognition.start();
}
function stopVoice(){
  voiceListening=false;if(recognition)recognition.stop();
  $('voiceCmdBtn').classList.remove('listening');$('lblVoiceCmd').textContent='Start Voice';
  $('vsText').textContent='Ready';
  const vd=document.querySelector('.vs-dot');if(vd)vd.classList.remove('active');
}
function handleCmd(cmd){
  if(cmd.includes('hindi')||cmd.includes('हिंदी')){$('langSelect').value='hi';applyLang('hi');return;}
  if(cmd.includes('kannada')||cmd.includes('ಕನ್ನಡ')){$('langSelect').value='kn';applyLang('kn');return;}
  if(cmd.includes('english')){$('langSelect').value='en';applyLang('en');return;}
  const obj=currentDetections[0]?.name;
  if(cmd.includes('what is')||cmd.includes('describe')||cmd.includes('ಏನು')||cmd.includes('क्या')){if(obj)askAbout(obj,currentColorContext);return;}
  if(cmd.includes('distance')||cmd.includes('दूरी')||cmd.includes('ದೂರ')){
    const d=currentDetections[0]?.distance;
    if(d&&obj) speak(phrase('distance', currentLang, obj, d.cm, ''));
    return;
  }
  if(cmd.includes('colour')||cmd.includes('color')||cmd.includes('रंग')||cmd.includes('ಬಣ್ಣ')){
    const c=currentDetections[0]?.color;
    if(c&&obj) speak(phrase('colour', currentLang, obj, c.name));
    return;
  }
  if(cmd.includes('full info')){if(obj)showFullInfo(obj);return;}
  if(cmd.includes('save')||cmd.includes('capture')){saveCurrentFrame();return;}
  $('chatInput').value=cmd;sendChat();
}

// ── CHAT ──────────────────────────────────────────────────────
async function sendChat(){
  const msg=$('chatInput').value.trim();if(!msg||isProcessing)return;
  addUserMsg(msg);$('chatInput').value='';
  const qc=$('quickChips'); if(qc) qc.remove();
  showTyping();isProcessing=true;

  const first=currentDetections[0];
  const dist=first?.distance;

  try{
    const res=await fetch(`${API}/api/chat`,{method:'POST',headers:authHJ(),
      body:JSON.stringify({
        message: msg,
        object_context: currentObjectContext,
        color_context: currentColorContext,
        distance_context: dist?.cm || null,
        confidence_context: currentDetections[0]
          ? Math.round(currentDetections[0].confidence * 100) : null,
        language: currentLang,
        conversation_history: conversationHistory.slice(-10)
      })});
    const data=await res.json();
    removeTyping();
    let finalReply;
if (data.use_client_fallback || data.response === null) {
  // Server signalled offline — use JS knowledge base
  finalReply = buildSmartResponse(msg, currentObjectContext, currentColorContext, dist, currentLang);
} else {
  const reply = data.response || 'No response.';
  const isGeneric = reply.includes('What would you like to know') && !data.ai_used;
  finalReply = isGeneric
    ? buildSmartResponse(msg, currentObjectContext, currentColorContext, dist, currentLang)
    : reply;
}
    addBotMsg(finalReply);
    // Speak reply in correct language (strip markdown symbols)
    if(voiceEnabled) speak(finalReply.replace(/\*\*/g,'').replace(/\n/g,' ').replace(/📏|🎨|💡|🎯|📚|⚠️|👋|🔊/g,''));
    conversationHistory.push({role:'user',content:msg},{role:'assistant',content:finalReply});
    if(conversationHistory.length>20)conversationHistory=conversationHistory.slice(-20);
    addFollowUpChips(currentObjectContext);
  }catch{
    removeTyping();
    const fallback = buildSmartResponse(msg, currentObjectContext, currentColorContext, dist, currentLang);
    addBotMsg(fallback);
    if(voiceEnabled) speak(fallback.replace(/\*\*/g,'').replace(/\n/g,' ').replace(/📏|🎨|💡|🎯|📚|⚠️|👋|🔊/g,''));
    conversationHistory.push({role:'user',content:msg},{role:'assistant',content:fallback});
  }
  isProcessing=false;
}

function addFollowUpChips(objName) {
  if (!objName) return;
  const cm=$('chatMessages');
  const existing = cm.querySelectorAll('.followup-chips');
  existing.forEach(e=>e.remove());
  const chips = document.createElement('div');
  chips.className='chat-chips followup-chips';
  const followData = {
    en: [`More info`, `Safe?`, `Facts`, `Uses`],
    hi: [`और जानकारी`, `सुरक्षित?`, `तथ्य`, `उपयोग`],
    kn: [`ಇನ್ನಷ್ಟು`, `ಸುರಕ್ಷಿತ?`, `ತಥ್ಯ`, `ಉಪಯೋಗ`]
  };
  const followQ = {
    en: [`Tell me more about ${objName}`, `Is ${objName} safe?`, `Interesting facts about ${objName}`, `Uses of ${objName}`],
    hi: [`${objName} के बारे में बताओ`, `${objName} सुरक्षित है?`, `${objName} के बारे में रोचक तथ्य`, `${objName} का उपयोग`],
    kn: [`${objName} ಬಗ್ಗೆ ತಿಳಿಸಿ`, `${objName} ಸುರಕ್ಷಿತವೇ?`, `${objName} ಬಗ್ಗೆ ಆಸಕ್ತಿಕರ ವಿಷಯ`, `${objName} ಉಪಯೋಗ`]
  };
  const labels = followData[currentLang] || followData.en;
  const queries = followQ[currentLang] || followQ.en;
  chips.innerHTML = labels.map((l,i) => `<span class="chip" onclick="chipAsk('${queries[i]}')">${l}</span>`).join('');
  cm.appendChild(chips);
  cm.scrollTop=cm.scrollHeight;
}

async function askAbout(name,colorName=''){
  currentObjectContext=name;currentColorContext=colorName;
  $('chatInput').value=`What is a ${colorName?colorName+' ':''}${name}?`;
  $('chatInput').disabled=false;$('sendBtn').disabled=false;
  sendChat();
}
window.askAbout=askAbout;

function addBotMsg(text){
  const d=document.createElement('div');d.className='msg-bot';
  const html=escHtml(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  d.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble">${html}</div>`;
  const cm=$('chatMessages');cm.appendChild(d);cm.scrollTop=cm.scrollHeight;
}
function addUserMsg(text){const d=document.createElement('div');d.className='msg-user';d.innerHTML=`<div class="msg-bubble">${escHtml(text)}</div>`;const cm=$('chatMessages');cm.appendChild(d);cm.scrollTop=cm.scrollHeight;}
function showTyping(){const d=document.createElement('div');d.id='typingDots';d.className='msg-bot';d.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble typing-dots"><span></span><span></span><span></span></div>`;const cm=$('chatMessages');cm.appendChild(d);cm.scrollTop=cm.scrollHeight;}
function removeTyping(){const e=$('typingDots');if(e)e.remove();}
function clearChat(){$('chatMessages').innerHTML='';conversationHistory=[];window._lastChatObj=null;const wm=document.createElement('div');wm.className='msg-bot';wm.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble" id="welcomeMsg">Hello! 👋 Start the camera or upload an image, then ask me anything!</div>`;$('chatMessages').appendChild(wm);showQuickChips();}
function clearResults(){currentDetections=[];const md=$('mDetections');if(md)md.textContent='0';$('resultsContainer').innerHTML='<div class="empty-results"><div class="empty-icon-anim">🎯</div><p>No objects detected yet</p></div>';const sa=$('speakAllBtn');if(sa)sa.disabled=true;}

async function loadHistory(){
  try{
    const res=await fetch(`${API}/api/history`,{headers:authH()});
    const data=await res.json();
    const items=data.history||[];
    const mh=$('mHistory');if(mh)mh.textContent=items.length;
    const hl=$('historyList');if(!hl)return;
    if(!items.length){hl.innerHTML='<div class="history-empty"><p>No detections yet</p></div>';return;}
    hl.innerHTML=items.slice(0,8).map(h=>{
      const colors=Array.isArray(h.colors)?h.colors:[];
      const colName=colors[0]?.name||'';
      return `<div class="history-item"><div class="hi-dot"></div><div class="hi-name">${(h.name||'').toUpperCase()}</div>${colName?`<div class="hi-dist" style="color:#aaa;font-size:10px">${colName}</div>`:''}<div class="hi-dist">${h.distance_cm?h.distance_cm+'cm':'—'}</div><div class="hi-conf">${h.confidence?Math.round(h.confidence)+'%':'—'}</div></div>`;
    }).join('');
  }catch{}
}

async function loadHistoryFull(){
  const cards=$('historyCards');if(!cards)return;
  cards.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:13px">Loading history…</div>';
  try{
    const res=await fetch(`${API}/api/history/with_images`,{headers:authH()});
    const data=await res.json();
    const items=data.history||[];
    if(!items.length){cards.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;font-size:13px">No history yet.<br>Start camera to detect objects.</div>';return;}
    cards.innerHTML=items.map((h,i)=>{
      const colors=Array.isArray(h.colors)?h.colors:[];
      const col=colors[0]||{};
      const imgHtml=h.image_url?`<img class="hcard-img" src="${h.image_url}" alt="${h.name||''}" onerror="this.parentElement.innerHTML='<div class=hcard-img-placeholder>🎯</div>'"/>` :`<div class="hcard-img-placeholder">🎯</div>`;
      const safeName=(h.name||'unknown').replace(/'/g,"\\'");
      return `<div class="hcard" id="hcard-${i}">${imgHtml}<div class="hcard-body"><div class="hcard-name">${(h.name||'—').toUpperCase()}</div><div class="hcard-meta">${col.name?`<span class="hcard-col"><span class="hcard-dot" style="background:${col.hex||'#888'}"></span>${col.name}</span>`:''}${h.distance_cm?`<span>${h.distance_cm} cm</span>`:''} ${h.confidence?`<span>${Math.round(h.confidence)}%</span>`:''}<span style="color:var(--text-dim)">${h.time||''}</span></div><div class="hcard-actions"><button class="hcard-btn hcard-correct" id="hbtn-ok-${i}" onclick="markCorrect(${i})">✅ Correct</button><button class="hcard-btn hcard-wrong" id="hbtn-wr-${i}" onclick="toggleWrongInput(${i},'${safeName}')">❌ Wrong</button></div></div><div class="hcard-correct-input" id="hinput-${i}"><input type="text" id="htext-${i}" placeholder="What is it? e.g. cup" onkeydown="if(event.key==='Enter')submitCorrection(${i},'${safeName}')"/><button class="hcard-submit-btn" onclick="submitCorrection(${i},'${safeName}')">✅ Submit — AI learns this</button></div></div>`;
    }).join('');
  }catch(e){cards.innerHTML='<div style="text-align:center;color:#ff3c5e;padding:30px;font-size:13px">Error loading history.</div>';console.error(e);}
}

function markCorrect(i){const ok=$(`hbtn-ok-${i}`),wr=$(`hbtn-wr-${i}`);if(ok){ok.textContent='✅ Confirmed!';ok.style.background='rgba(0,255,157,.25)';ok.disabled=true;}if(wr)wr.disabled=true;}
function toggleWrongInput(i,n){const inp=$(`hinput-${i}`);if(!inp)return;inp.classList.toggle('show');if(inp.classList.contains('show')){const t=$(`htext-${i}`);if(t){t.placeholder=`What is it? (AI said: ${n})`;t.focus();}}}
async function submitCorrection(i,wrongName){
  const correctName=($(`htext-${i}`)?.value||'').trim();
  if(!correctName){alert('Please type the correct name first');return;}
  try{
    const res=await fetch(`${API}/api/feedback`,{method:'POST',headers:authHJ(),body:JSON.stringify({wrong_label:wrongName,correct_label:correctName,extra_notes:'From history'})});
    const d=await res.json();
    if(d.ok||d.feedback_id){
      const inp=$(`hinput-${i}`);if(inp)inp.classList.remove('show');
      const wr=$(`hbtn-wr-${i}`);if(wr){wr.textContent='Corrected ✓';wr.style.background='rgba(245,166,35,.2)';wr.disabled=true;}
      const ok=$(`hbtn-ok-${i}`);if(ok)ok.disabled=true;
      try{await fetch(`${API}/api/corrections/reload`,{method:'POST',headers:authH()});}catch{}
      window._lastChatObj=null;
      addBotMsg(`✅ AI now knows "${wrongName}" → "${correctName}". Applied immediately!`);
    }
  }catch(e){alert('Error: '+e.message);}
}

async function clearHistoryQuick(){try{await fetch(`${API}/api/history/clear`,{method:'POST',headers:authH()});}catch{}const hl=$('historyList');if(hl)hl.innerHTML='<div class="history-empty"><p>No detections yet</p></div>';const mh=$('mHistory');if(mh)mh.textContent='0';}
async function clearHistoryFull(){if(!confirm('Clear all history?'))return;await clearHistoryQuick();const cards=$('historyCards');if(cards)cards.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;font-size:13px">History cleared.</div>';}
window.clearHistoryFull=clearHistoryFull;

async function loadGallery(){
  try{
    const res=await fetch(`${API}/api/gallery`,{headers:authH()});
    const data=await res.json();
    const items=data.images||[];
    const mi=$('mImages');if(mi)mi.textContent=items.length;
    const grid=$('galleryGrid');if(!grid)return;
    if(!items.length){grid.innerHTML='<div class="gallery-empty"><p>No images saved yet.<br>Images save automatically when camera detects objects.</p></div>';return;}
    const u=getUser();
    grid.innerHTML=items.map(img=>{
      let colors=[];try{colors=typeof img.colors==='string'?JSON.parse(img.colors||'[]'):img.colors||[];}catch{}
      const colName=colors[0]?.name||'';
      return `<div class="gallery-card" onclick="openImageModal(${img.id})"><div style="background:#0b1220;min-height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="/uploads/${u?.user_id||''}/${img.filename}" alt="${img.detected_object||''}" loading="lazy" style="width:100%;max-height:160px;object-fit:cover" onerror="this.parentElement.innerHTML='<span style=color:#5f7a96;font-size:12px;padding:20px>No image</span>'"/></div><div class="gallery-info"><div class="gallery-obj">${(img.detected_object||'Unknown').toUpperCase()}</div><div class="gallery-sub">${colName?'🎨 '+colName+' · ':''}${img.distance_cm?img.distance_cm+'cm · ':''}${img.confidence?Math.round(img.confidence*100)+'%':''}</div><div class="gallery-sub" style="font-size:10px;margin-top:2px">${img.created_at||''}</div>${img.notes?`<div class="gallery-sub" style="color:#7b5ea7;font-style:italic">${img.notes}</div>`:''}</div></div>`;
    }).join('');
  }catch(e){console.error('Gallery error:',e);}
}
window.loadGallery=loadGallery;

async function openImageModal(imgId){
  currentImageId=imgId;
  const res=await fetch(`${API}/api/gallery`,{headers:authH()});
  const data=await res.json();
  const img=(data.images||[]).find(i=>i.id===imgId);if(!img)return;
  currentImageRecord=img;
  const u=getUser();
  const mi=$('modalImg');if(mi)mi.src=`/uploads/${u?.user_id||''}/${img.filename}`;
  const ml=$('modalLabel');if(ml)ml.value=img.label||img.detected_object||'';
  const mn=$('modalNotes');if(mn)mn.value=img.notes||'';
  $('imageModal').style.display='flex';
}
window.openImageModal=openImageModal;
window.closeImageModal=()=>{$('imageModal').style.display='none';currentImageId=null;currentImageRecord=null;};

async function saveImageEdit(){if(!currentImageId)return;await fetch(`${API}/api/gallery/${currentImageId}/notes`,{method:'PUT',headers:authHJ(),body:JSON.stringify({notes:$('modalNotes').value})});window.closeImageModal();loadGallery();addBotMsg('✅ Notes saved!');}
window.saveImageEdit=saveImageEdit;

async function deleteCurrentImage(){if(!currentImageId)return;if(!confirm('Delete this image?'))return;await fetch(`${API}/api/gallery/${currentImageId}`,{method:'DELETE',headers:authH()});window.closeImageModal();loadGallery();}
window.deleteCurrentImage=deleteCurrentImage;

function quickFeedbackFromModal(){if(!currentImageRecord)return;window.closeImageModal();switchTab('feedback');const fwl=$('fb-wrong-label');if(fwl)fwl.value=currentImageRecord.detected_object||'';const fcl=$('fb-correct-label');if(fcl)fcl.focus();}
window.quickFeedbackFromModal=quickFeedbackFromModal;

function quickCorrect(detectedName,detectedColor){switchTab('feedback');const fwl=$('fb-wrong-label');if(fwl)fwl.value=detectedName;const fwc=$('fb-wrong-color');if(fwc)fwc.value=detectedColor||'';const fcl=$('fb-correct-label');if(fcl)fcl.focus();}
window.quickCorrect=quickCorrect;

async function submitFeedback(){
  const wrong_label=($('fb-wrong-label')?.value||'').trim();
  const correct_label=($('fb-correct-label')?.value||'').trim();
  const extra_notes=($('fb-notes')?.value||'').trim();
  if(!wrong_label||!correct_label){showFbMsg('Fill in both wrong and correct fields.','err');return;}
  try{
    const res=await fetch(`${API}/api/feedback`,{method:'POST',headers:authHJ(),body:JSON.stringify({wrong_label,correct_label,extra_notes})});
    const data=await res.json();
    showFbMsg(data.message||'Correction saved! AI will learn from this.','ok');
    ['fb-wrong-label','fb-correct-label','fb-wrong-color','fb-correct-color','fb-notes'].forEach(id=>{const el=$(id);if(el)el.value='';});
    window._lastChatObj=null;
    try{await fetch(`${API}/api/corrections/reload`,{method:'POST',headers:authH()});}catch{}
    loadFeedbackSummary();
  }catch{showFbMsg('Failed. Check server.','err');}
}
window.submitFeedback=submitFeedback;

function showFbMsg(msg,type){const el=$('fb-msg');if(!el)return;el.textContent=msg;el.className='fb-msg '+type;setTimeout(()=>{el.textContent='';el.className='fb-msg';},4000);}

async function loadFeedbackSummary(){
  try{
    const res=await fetch(`${API}/api/feedback`,{headers:authH()});
    const data=await res.json();
    const list=$('correctionsList');if(!list)return;
    const items=data.feedback||[];
    if(!items.length){list.innerHTML='<div class="empty-results"><p style="font-size:13px">No corrections yet.<br>Use ❌ Wrong? when AI makes a mistake!</p></div>';return;}
    list.innerHTML=items.map(f=>`<div class="correction-item"><span class="ci-wrong">${f.wrong_label||'—'}</span><span class="ci-arrow">→</span><span class="ci-right">${f.correct_label||'—'}</span><span class="ci-votes" style="color:${f.status==='trained'?'#00ff9d':f.status==='reviewed'?'#00d4ff':'#f5a623'}">${f.status}</span></div>`).join('');
  }catch{}
}
window.loadFeedbackSummary=loadFeedbackSummary;

function toggleTheme(){const h=document.documentElement;const n=h.getAttribute('data-theme')==='dark'?'light':'dark';h.setAttribute('data-theme',n);$('themeBtn').textContent=n==='dark'?'💡':'🌙';localStorage.setItem('svt',n);}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
window._lastChatObj=null;