// Physical keyboard chord controller for Virtual Guitar Studio v7.
// Builds on the proven v6 right-handed hybrid runtime and adds a latched
// physical-key chord bank plus an on-screen keyboard guide.

const sourceUrl = new URL('./app-v6.js?v=1', import.meta.url);
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Unable to load app-v6.js: ${response.status}`);
let v6Source = await response.text();

const marker = "source += `\\n//# sourceURL=virtual-guitar-app-v6-unified.js\\n`;";

const injection = String.raw`
replaceRegex(
  'keyboard seventh chord bank',
  /const CHORDS = \{[\s\S]*?\n\};/,
  function(match) {
    return match + "\nconst KEYBOARD_CHORDS = {" +
      "\n  Am7:   { frets: [null,0,2,0,1,0] }," +
      "\n  Cmaj7: { frets: [null,3,2,0,0,0] }," +
      "\n  Dm7:   { frets: [null,null,0,2,1,1] }," +
      "\n  Fmaj7: { frets: [null,null,3,2,1,0] }," +
      "\n  G7:    { frets: [3,2,0,0,0,1] }," +
      "\n  Em7:   { frets: [0,2,0,0,0,0] }," +
      "\n  A7:    { frets: [null,0,2,0,2,0] }," +
      "\n  D7:    { frets: [null,null,0,2,1,2] }," +
      "\n  E7:    { frets: [0,2,0,1,0,0] }" +
      "\n};" +
      "\nlet keyboardChordName = null;";
  }
);

replaceRegex(
  'keyboard chord fret lookup',
  /function chordFret\(i\) \{[^\n]*\}/,
  "function chordFret(i) { if (!activeChordName) return 0; const bank = CHORDS[activeChordName] || KEYBOARD_CHORDS[activeChordName]; const fret = bank?.frets?.[i]; return fret == null ? null : fret; }"
);

replaceRegex(
  'keyboard chord priority over camera recognition',
  /function recognizeChord\(presses, now\) \{\n/,
  "function recognizeChord(presses, now) {\n  if (keyboardChordName && currentInstrument !== 'bass') {\n    activeChordName = keyboardChordName;\n    chordCandidate = keyboardChordName;\n    lastChordSeenAt = now;\n    chordName.textContent = keyboardChordName;\n    chordBadge.classList.add('locked');\n    return;\n  }\n"
);

replaceOnce(
  'keyboard chord controller install',
  "updateCodecStatus(); applyTone(); updateModeUI(); drawIdle();",
  `const KEYBOARD_BINDINGS = {
  a: 'Am7',
  s: 'Cmaj7',
  d: 'Dm7',
  f: 'Fmaj7',
  g: 'G7',
  h: 'Em7',
  j: 'A7',
  k: 'D7',
  l: 'E7'
};

const keyboardChordDisplay = document.querySelector('#keyboardChordDisplay');
const keyboardChordButtons = [...document.querySelectorAll('.chord-key')];

function updateKeyboardChordUI(key = '') {
  keyboardChordButtons.forEach(btn => {
    const btnKey = btn.dataset.chordKey || '';
    const isOpen = btn.hasAttribute('data-open-key');
    btn.classList.toggle('active', key ? btnKey === key : isOpen);
    btn.setAttribute('aria-pressed', key ? String(btnKey === key) : String(isOpen));
  });
  if (keyboardChordDisplay) {
    keyboardChordDisplay.textContent = key
      ? key.toUpperCase() + ' → ' + KEYBOARD_BINDINGS[key]
      : 'SPACE → OPEN';
  }
}

function setKeyboardChord(key = '') {
  if (currentInstrument === 'bass') {
    keyboardChordName = null;
    activeChordName = null;
    chordName.textContent = '—';
    updateKeyboardChordUI('');
    setStatus('貝斯模式不使用和弦鍵盤', 'live');
    return;
  }

  keyboardChordName = key ? KEYBOARD_BINDINGS[key] || null : null;
  activeChordName = keyboardChordName;
  chordCandidate = keyboardChordName;
  chordCandidateSince = performance.now();
  lastChordSeenAt = performance.now();

  chordName.textContent = keyboardChordName || 'OPEN';
  chordBadge.classList.toggle('locked', Boolean(keyboardChordName));
  updateKeyboardChordUI(key);

  if (keyboardChordName) rememberAction('KEY:' + keyboardChordName);
  else rememberAction('OPEN');

  setStatus(
    keyboardChordName
      ? '鍵盤和弦已鎖定：' + keyboardChordName + ' · 右手可直接單弦 / 刷弦'
      : 'OPEN · 右手可直接單弦 / 刷弦',
    'live'
  );
}

window.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target && ['TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if (target?.tagName === 'INPUT' && !['range', 'button'].includes(target.type)) return;

  const key = event.key.toLowerCase();
  if (KEYBOARD_BINDINGS[key]) {
    event.preventDefault();
    setKeyboardChord(key);
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    setKeyboardChord('');
  }
});

keyboardChordButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.hasAttribute('data-open-key')) setKeyboardChord('');
    else setKeyboardChord((btn.dataset.chordKey || '').toLowerCase());
  });
});

updateKeyboardChordUI('');

updateCodecStatus(); applyTone(); updateModeUI(); drawIdle();`
);
`;

if (!v6Source.includes(marker)) {
  throw new Error('Virtual Guitar v7 injection point missing');
}
v6Source = v6Source.replace(marker, `${injection}\n${marker}`);

v6Source += `\n//# sourceURL=virtual-guitar-app-v7-keyboard-wrapper.js\n`;
const blobUrl = URL.createObjectURL(new Blob([v6Source], { type: 'text/javascript' }));
try {
  await import(blobUrl);
  window.__VIRTUAL_GUITAR_KEYBOARD_V7__ = true;
} finally {
  URL.revokeObjectURL(blobUrl);
}
