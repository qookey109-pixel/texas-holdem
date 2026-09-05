// Virtual Guitar Studio v8: customizable physical keyboard chord map.
// It preserves the proven v7 keyboard + v6 hybrid guitar runtime and only adds
// persistent key remapping plus a larger chord palette.

const sourceUrl = new URL('./app-v7.js?v=1', import.meta.url);
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Unable to load app-v7.js: ${response.status}`);
let source = await response.text();

function replaceOnce(name, from, to) {
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`Virtual Guitar v8 patch target missing: ${name}`);
  if (source.indexOf(from, index + from.length) !== -1) {
    throw new Error(`Virtual Guitar v8 patch target duplicated: ${name}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
  'expand keyboard chord palette',
  'let keyboardChordName = null;',
  `let keyboardChordName = null;
Object.assign(KEYBOARD_CHORDS, {
  C:     { frets: [null,3,2,0,1,0] },
  C7:    { frets: [null,3,2,3,1,0] },
  D:     { frets: [null,null,0,2,3,2] },
  Dm:    { frets: [null,null,0,2,3,1] },
  Dmaj7: { frets: [null,null,0,2,2,2] },
  E:     { frets: [0,2,2,1,0,0] },
  Em:    { frets: [0,2,2,0,0,0] },
  F:     { frets: [1,3,3,2,1,1] },
  G:     { frets: [3,2,0,0,0,3] },
  Gmaj7: { frets: [3,2,0,0,0,2] },
  A:     { frets: [null,0,2,2,2,0] },
  Am:    { frets: [null,0,2,2,1,0] },
  Amaj7: { frets: [null,0,2,1,2,0] },
  B7:    { frets: [null,2,1,2,0,2] },
  Bm7:   { frets: [null,2,4,2,3,2] }
});`
);

replaceOnce(
  'mutable saved keyboard bindings',
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
};`,
  `const DEFAULT_KEYBOARD_BINDINGS = Object.freeze({
  a: 'Am7',
  s: 'Cmaj7',
  d: 'Dm7',
  f: 'Fmaj7',
  g: 'G7',
  h: 'Em7',
  j: 'A7',
  k: 'D7',
  l: 'E7'
});
const KEYBOARD_STORAGE_KEY = 'virtual-guitar-keymap-v8';
const AVAILABLE_KEYBOARD_CHORDS = Object.keys(KEYBOARD_CHORDS).sort((a, b) => a.localeCompare(b));
let KEYBOARD_BINDINGS = { ...DEFAULT_KEYBOARD_BINDINGS };
try {
  const saved = JSON.parse(localStorage.getItem(KEYBOARD_STORAGE_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    Object.keys(DEFAULT_KEYBOARD_BINDINGS).forEach(key => {
      if (AVAILABLE_KEYBOARD_CHORDS.includes(saved[key])) KEYBOARD_BINDINGS[key] = saved[key];
    });
  }
} catch (error) {
  console.warn('Unable to restore keyboard chord map', error);
}`
);

replaceOnce(
  'keyboard editor element refs',
  `const keyboardChordDisplay = document.querySelector('#keyboardChordDisplay');
const keyboardChordButtons = [...document.querySelectorAll('.chord-key')];`,
  `const keyboardChordDisplay = document.querySelector('#keyboardChordDisplay');
const keyboardChordButtons = [...document.querySelectorAll('.chord-key')];
const keyboardMapSelects = [...document.querySelectorAll('.keymap-select')];
const resetKeyboardMapBtn = document.querySelector('#resetKeyboardMapBtn');
const keyboardMapStatus = document.querySelector('#keyboardMapStatus');

function saveKeyboardBindings() {
  try {
    localStorage.setItem(KEYBOARD_STORAGE_KEY, JSON.stringify(KEYBOARD_BINDINGS));
    if (keyboardMapStatus) keyboardMapStatus.textContent = '已儲存到此瀏覽器';
  } catch (error) {
    console.warn('Unable to save keyboard chord map', error);
    if (keyboardMapStatus) keyboardMapStatus.textContent = '本次設定可使用，但瀏覽器無法保存';
  }
}

function populateKeyboardMapSelects() {
  keyboardMapSelects.forEach(select => {
    const key = (select.dataset.mapKey || '').toLowerCase();
    const fragment = document.createDocumentFragment();
    AVAILABLE_KEYBOARD_CHORDS.forEach(chord => {
      const option = document.createElement('option');
      option.value = chord;
      option.textContent = chord;
      fragment.appendChild(option);
    });
    select.replaceChildren(fragment);
    select.value = KEYBOARD_BINDINGS[key] || DEFAULT_KEYBOARD_BINDINGS[key];
  });
}`
);

replaceOnce(
  'keyboard ui reflects custom map',
  `function updateKeyboardChordUI(key = '') {
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
}`,
  `function updateKeyboardChordUI(key = '') {
  keyboardChordButtons.forEach(btn => {
    const btnKey = btn.dataset.chordKey || '';
    const isOpen = btn.hasAttribute('data-open-key');
    const chordLabel = btn.querySelector('span');
    if (chordLabel && btnKey) chordLabel.textContent = KEYBOARD_BINDINGS[btnKey] || '—';
    btn.classList.toggle('active', key ? btnKey === key : isOpen);
    btn.setAttribute('aria-pressed', key ? String(btnKey === key) : String(isOpen));
  });
  keyboardMapSelects.forEach(select => {
    const mapKey = (select.dataset.mapKey || '').toLowerCase();
    if (KEYBOARD_BINDINGS[mapKey] && select.value !== KEYBOARD_BINDINGS[mapKey]) {
      select.value = KEYBOARD_BINDINGS[mapKey];
    }
  });
  if (keyboardChordDisplay) {
    keyboardChordDisplay.textContent = key
      ? key.toUpperCase() + ' → ' + KEYBOARD_BINDINGS[key]
      : 'SPACE → OPEN';
  }
}`
);

replaceOnce(
  'install keyboard editor listeners',
  `keyboardChordButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.hasAttribute('data-open-key')) setKeyboardChord('');
    else setKeyboardChord((btn.dataset.chordKey || '').toLowerCase());
  });
});

updateKeyboardChordUI('');

updateCodecStatus(); applyTone(); updateModeUI(); drawIdle();`,
  `keyboardChordButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.hasAttribute('data-open-key')) setKeyboardChord('');
    else setKeyboardChord((btn.dataset.chordKey || '').toLowerCase());
  });
});

keyboardMapSelects.forEach(select => {
  select.addEventListener('change', () => {
    const key = (select.dataset.mapKey || '').toLowerCase();
    if (!DEFAULT_KEYBOARD_BINDINGS[key]) return;
    if (!AVAILABLE_KEYBOARD_CHORDS.includes(select.value)) return;

    const activeButton = document.querySelector('.chord-key[data-chord-key="' + key + '"]');
    const wasActive = Boolean(activeButton?.classList.contains('active'));
    KEYBOARD_BINDINGS[key] = select.value;
    saveKeyboardBindings();
    updateKeyboardChordUI(wasActive ? key : '');
    if (wasActive) setKeyboardChord(key);
  });
});

resetKeyboardMapBtn?.addEventListener('click', () => {
  KEYBOARD_BINDINGS = { ...DEFAULT_KEYBOARD_BINDINGS };
  saveKeyboardBindings();
  populateKeyboardMapSelects();
  setKeyboardChord('');
  if (keyboardMapStatus) keyboardMapStatus.textContent = '已恢復預設配置';
});

populateKeyboardMapSelects();
updateKeyboardChordUI('');
if (keyboardMapStatus) keyboardMapStatus.textContent = '可自訂；設定會保留在此瀏覽器';

updateCodecStatus(); applyTone(); updateModeUI(); drawIdle();`
);

source += `\n//# sourceURL=virtual-guitar-app-v8-custom-keymap.js\n`;
const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(blobUrl);
  window.__VIRTUAL_GUITAR_KEYMAP_V8__ = true;
} finally {
  URL.revokeObjectURL(blobUrl);
}
