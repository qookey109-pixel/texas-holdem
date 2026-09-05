// Virtual Guitar Studio v10 — physical left-hand chord priority + keyboard fallback.
// Builds on the verified v9 runtime without changing audio, picking, strumming or layout.

const sourceUrl = new URL('./app-v9.js?v=10', import.meta.url);
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Unable to load app-v9.js: ${response.status}`);
let source = await response.text();

function replaceOnce(name, from, to) {
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`Virtual Guitar v10 patch target missing: ${name}`);
  if (source.indexOf(from, index + from.length) !== -1) throw new Error(`Virtual Guitar v10 patch target duplicated: ${name}`);
  source = source.replace(from, to);
}

replaceOnce(
  'physical chord priority',
  `  if (keyboardChordName) {
    activeChordName = keyboardChordName;
    chordCandidate = keyboardChordName;
    lastChordSeenAt = now;
    chordName.textContent = keyboardChordName;
    chordBadge.classList.add('locked');
    return;
  }

  const observed = new Set(presses.map(p => \`\${p.stringIndex}:\${p.fret}\`));
  let best = null, bestScore = -Infinity;`,
  `  const observed = new Set(presses.map(p => \`\${p.stringIndex}:\${p.fret}\`));
  let best = null, bestScore = -Infinity;`
);

replaceOnce(
  'physical chord fallback decision',
  `  if (best) {
    lastChordSeenAt = now;
    if (chordCandidate !== best) { chordCandidate = best; chordCandidateSince = now; }
    else if (now - chordCandidateSince > 110) activeChordName = best;
  } else {
    chordCandidate = null;
    if (now - lastChordSeenAt > 420) activeChordName = null;
  }
  chordName.textContent = activeChordName || (best ? \`\${best}…\` : 'OPEN');
  chordBadge.classList.toggle('locked', Boolean(activeChordName));`,
  `  if (best) {
    // A real left-hand shape takes priority over a latched keyboard chord.
    lastChordSeenAt = now;
    if (chordCandidate !== best) { chordCandidate = best; chordCandidateSince = now; }
    else if (now - chordCandidateSince > 105) activeChordName = best;
  } else if (keyboardChordName) {
    // Keyboard remains a stable fallback whenever the physical shape is not recognized.
    chordCandidate = keyboardChordName;
    activeChordName = keyboardChordName;
    lastChordSeenAt = now;
  } else {
    chordCandidate = null;
    if (now - lastChordSeenAt > 420) activeChordName = null;
  }

  const physicalActive = Boolean(best && activeChordName === best);
  chordName.textContent = activeChordName || (best ? \`\${best}…\` : 'OPEN');
  chordBadge.classList.toggle('locked', Boolean(activeChordName));
  if (physicalActive) {
    const display = document.querySelector('#keyboardChordDisplay');
    if (display) display.innerHTML = '<span>LEFT HAND</span><strong>' + activeChordName + '</strong>';
  }`
);

replaceOnce(
  "right handed fixed", 
  "const orientation = 'right';", 
  "const orientation = 'right'; // v10: left hand frets, right hand plucks/strums"
);

source += '\n//# sourceURL=virtual-guitar-app-v10-runtime.js\n';
const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(blobUrl);
  window.__VIRTUAL_GUITAR_V10__ = true;
} finally {
  URL.revokeObjectURL(blobUrl);
}
