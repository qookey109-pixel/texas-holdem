// Unified performance runtime for Virtual Guitar Studio.
// Loads the proven v4 runtime, then patches it into one right-handed hybrid mode:
// finger-pick single strings + hold chords + strum without a mode switch.

const sourceUrl = new URL('./app-v4.js?v=5', import.meta.url);
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Unable to load app-v4.js: ${response.status}`);
let source = await response.text();

function replaceOnce(name, from, to) {
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`Virtual Guitar v6 patch target missing: ${name}`);
  if (source.indexOf(from, index + from.length) !== -1) throw new Error(`Virtual Guitar v6 patch target duplicated: ${name}`);
  source = source.replace(from, to);
}

function replaceRegex(name, regex, to) {
  if (!regex.test(source)) throw new Error(`Virtual Guitar v6 regex target missing: ${name}`);
  regex.lastIndex = 0;
  source = source.replace(regex, to);
}

replaceOnce('hybrid mode default', "let currentPlayMode = 'single';", "let currentPlayMode = 'hybrid';");
replaceOnce('right hand fixed', "let orientation = 'right';", "const orientation = 'right';");

replaceRegex(
  'unified mode UI',
  /function updateModeUI\(\) \{[\s\S]*?\n\}/,
  `function updateModeUI() {
  chordBadge.classList.toggle('hidden', currentInstrument === 'bass');
  modeHelp.textContent = currentInstrument === 'bass'
    ? '右手貝斯：直接撥單弦；不需要切換模式。'
    : '右手吉他混合演奏：右手單指撥一條弦＝單弦；左手按住和弦後，右手一次掃過 2 條以上＝和弦刷奏。';
}`
);

replaceOnce(
  'hybrid geometry spacing',
  "const baseSpacing = count === 4 ? .052 : (currentPlayMode === 'single' ? .043 : .036), spacing = Math.max(14, h * baseSpacing * spacingScale);",
  "const baseSpacing = count === 4 ? .052 : .041, spacing = Math.max(14, h * baseSpacing * spacingScale);"
);
replaceOnce(
  'wider hybrid picking zone',
  "const fretZoneMin = Math.min(fretLines[0], fretLines[4]), fretZoneMax = Math.max(fretLines[0], fretLines[4]), pluckHalf = w * .105;",
  "const fretZoneMin = Math.min(fretLines[0], fretLines[4]), fretZoneMax = Math.max(fretLines[0], fretLines[4]), pluckHalf = w * .14;"
);

replaceOnce(
  'hybrid zone label',
  "ctx.fillText(currentPlayMode === 'single' ? '精準撥弦區' : '刷弦區 ↓ / ↑', g.pluckX1 + 8, g.yTop - g.spacing * .88);",
  "ctx.fillText('單弦 / 和弦刷弦區 ↓ / ↑', g.pluckX1 + 8, g.yTop - g.spacing * .88);"
);
replaceOnce(
  'always draw chord fret zone',
  "if (currentPlayMode === 'chord') {\n    ctx.fillStyle = 'rgba(255,255,255,.025)';",
  "if (currentInstrument !== 'bass') {\n    ctx.fillStyle = 'rgba(255,255,255,.025)';"
);
replaceOnce(
  'right handed footer only',
  "ctx.fillText(g.rightHanded ? '右手吉他：琴頸 ← 左｜右 → 琴身' : '左手吉他：琴身 ← 左｜右 → 琴頸', w * .035, h * .94);",
  "ctx.fillText('右手吉他：琴頸 ← 左｜右 → 琴身', w * .035, h * .94);"
);

replaceOnce(
  'faster fingertip smoothing',
  "const prev = smoothHistory.get(key), alpha = .58, p = prev ? { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha } : { x, y }; smoothHistory.set(key, p); return p;",
  "const prev = smoothHistory.get(key), alpha = .75, p = prev ? { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha } : { x, y }; smoothHistory.set(key, p); return p;"
);

replaceRegex(
  'chord press collection always active on guitars',
  /function collectChordPresses\(hands, g\) \{[\s\S]*?\n\}/,
  `function collectChordPresses(hands, g) {
  if (g.count !== 6 || currentInstrument === 'bass') return [];
  const presses = [];
  hands.forEach(hand => FRET_FINGER_IDS.forEach(fid => {
    const p = hand.tips.get(fid);
    if (!p || p.x < g.fretX1 || p.x > g.fretX2) return;
    const n = nearestString(g, p.y), fret = fretAtX(g, p.x);
    if (fret && n.distance < g.spacing * .50) presses.push({ stringIndex: n.index, fret, fingerId: fid, x: p.x, y: p.y });
  }));
  return presses;
}`
);

replaceRegex(
  'hybrid chord recognition',
  /function recognizeChord\(presses, now\) \{[\s\S]*?\n\}/,
  `function recognizeChord(presses, now) {
  if (currentInstrument === 'bass') {
    activeChordName = null;
    chordName.textContent = '—';
    return;
  }
  const observed = new Set(presses.map(p => \`${'${p.stringIndex}:${p.fret}'}\`));
  let best = null, bestScore = -Infinity;
  Object.entries(CHORDS).forEach(([name, chord]) => {
    const req = chord.required.map(([s,f]) => \`${'${s}:${f}'}\`);
    const hits = req.filter(k => observed.has(k)).length;
    if (hits !== req.length) return;
    const extras = [...observed].filter(k => !req.includes(k)).length;
    const score = req.length * 10 - extras * 2;
    if (score > bestScore) { bestScore = score; best = name; }
  });
  if (best) {
    lastChordSeenAt = now;
    if (chordCandidate !== best) { chordCandidate = best; chordCandidateSince = now; }
    else if (now - chordCandidateSince > 110) activeChordName = best;
  } else {
    chordCandidate = null;
    if (now - lastChordSeenAt > 420) activeChordName = null;
  }
  chordName.textContent = activeChordName || (best ? \`${'${best}'}…\` : 'OPEN');
  chordBadge.classList.toggle('locked', Boolean(activeChordName));
}`
);

replaceRegex(
  'forgiving hybrid single string detection',
  /function processSingle\(fid, p, prev, g\) \{[\s\S]*?\n\}/,
  `function processSingle(fid, p, prev, g) {
  if (!prev) return false;
  const zonePad = Math.max(14, canvas.width * .008);
  if (p.x < g.pluckX1 - zonePad || p.x > g.pluckX2 + zonePad || prev.x < g.pluckX1 - zonePad || prev.x > g.pluckX2 + zonePad) return false;

  const dy = p.y - prev.y;
  const dt = Math.max(1, performance.now() - prev.t);
  const speed = Math.abs(dy) / dt * 16.67;
  const minMove = Math.max(1.25, g.spacing * .05);
  const minSpeed = Math.max(1.0, g.spacing * .032);
  if (Math.abs(dy) < minMove || speed < minSpeed) return false;

  const hitRadius = Math.max(5, g.spacing * .22);
  const candidates = [];
  g.stringYs.forEach((sy, i) => {
    const crossed = (prev.y < sy && p.y >= sy) || (prev.y > sy && p.y <= sy);
    const endpointNear = Math.min(Math.abs(prev.y - sy), Math.abs(p.y - sy)) <= hitRadius;
    const sweepNear = Math.min(prev.y, p.y) - hitRadius <= sy && Math.max(prev.y, p.y) + hitRadius >= sy;
    if (crossed || (endpointNear && sweepNear)) candidates.push({ i, d: Math.abs((prev.y + p.y) * .5 - sy) });
  });
  if (!candidates.length) {
    const near = nearestString(g, p.y);
    if (near.distance <= hitRadius * .9) candidates.push({ i: near.index, d: near.distance });
  }
  if (!candidates.length) return false;

  candidates.sort((a,b) => a.d - b.d);
  const target = candidates[0];
  const fret = activeChordName ? chordFret(target.i) : 0;
  if (fret == null) return false;
  const strength = Math.min(1.30, .62 + Math.abs(dy) / (g.spacing * 1.20));
  pluckString(target.i, strength, fret, FINGER_LABELS[fid]);
  return true;
}`
);

replaceRegex(
  'hybrid strum detector',
  /function processStrum\(indexTip, prev, g, now\) \{[\s\S]*?\n\}/,
  `function processStrum(indexTip, prev, g, now) {
  if (!prev || !indexTip || currentInstrument === 'bass') return false;
  if (indexTip.x < g.pluckX1 || indexTip.x > g.pluckX2 || prev.x < g.pluckX1 - 12 || prev.x > g.pluckX2 + 12) return false;
  const dy = indexTip.y - prev.y;
  if (Math.abs(dy) < g.spacing * .62 || now - lastStrumAt < 92) return false;

  const minY = Math.min(prev.y, indexTip.y), maxY = Math.max(prev.y, indexTip.y);
  const crossed = g.stringYs.map((sy,i) => ({sy,i})).filter(s => s.sy >= minY && s.sy <= maxY);
  if (crossed.length < 2) return false;

  lastStrumAt = now;
  crossed.sort((a,b) => dy > 0 ? a.sy - b.sy : b.sy - a.sy);
  const arrow = dy > 0 ? '↓' : '↑';
  rememberAction(\`${'${activeChordName || \'OPEN\'}${arrow}'}\`);

  const fire = () => crossed.forEach((s, order) => {
    const fret = activeChordName ? chordFret(s.i) : 0;
    if (fret == null) return;
    activeStrings.set(s.i, { t: performance.now() + order * 13, fret });
    playVoice(cfg().freqs[s.i], .80, fret, order * .013);
  });
  if (!audioCtx || audioCtx.state !== 'running') ensureAudio().then(ok => { if (ok) fire(); });
  else fire();
  return true;
}`
);

replaceRegex(
  'hybrid hand arbitration',
  /function drawHandsAndDetect\(results, g\) \{[\s\S]*?\n\}\nfunction renderLoop/,
  `function drawHandsAndDetect(results, g) {
  const w = canvas.width, h = canvas.height, now = performance.now(), hands = [], seen = new Set();
  const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

  results.landmarks?.forEach((landmarks, hi) => {
    const handed = results.handedness?.[hi]?.[0]?.categoryName || \`H${'${hi}'}\`;
    const hand = { label: handed, points: new Map(), tips: new Map() };
    landmarks.forEach((lm, id) => {
      const x = (1 - lm.x) * w, y = lm.y * h;
      const p = FINGERTIP_IDS.includes(id) ? smoothPoint(\`${'${handed}-${id}'}\`, x, y) : {x,y};
      hand.points.set(id,p);
      if (FINGERTIP_IDS.includes(id)) hand.tips.set(id,p);
    });
    hands.push(hand);
  });

  const presses = collectChordPresses(hands, g);
  recognizeChord(presses, now);
  presses.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, g.stringYs[p.stringIndex], Math.max(8, g.spacing * .22), 0, Math.PI * 2);
    ctx.fillStyle = cfg().accent; ctx.globalAlpha = .35; ctx.fill(); ctx.globalAlpha = 1;
  });

  hands.forEach(hand => {
    ctx.strokeStyle = 'rgba(245,158,11,.44)'; ctx.lineWidth = Math.max(1, h * .0015);
    connections.forEach(([a,b]) => {
      const p1 = hand.points.get(a), p2 = hand.points.get(b);
      if (!p1 || !p2) return;
      ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    });

    const indexTip = hand.tips.get(8);
    const strumKey = \`${'${hand.label}-STRUM'}\`;
    const strumPrev = handHistory.get(strumKey);
    const didStrum = processStrum(indexTip, strumPrev, g, now);
    if (indexTip) {
      handHistory.set(strumKey, {x:indexTip.x,y:indexTip.y,t:now});
      seen.add(strumKey);
    }

    FINGERTIP_IDS.forEach(fid => {
      const p = hand.tips.get(fid);
      if (!p) return;
      const key = \`${'${hand.label}-${fid}'}\`, prev = handHistory.get(key);
      seen.add(key);

      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(7,h*.0095),0,Math.PI*2);
      ctx.fillStyle = fid === 4 ? 'rgba(96,210,255,.96)' : 'rgba(255,191,70,.96)'; ctx.fill();
      ctx.fillStyle = '#08080a'; ctx.font = \`900 ${'${Math.max(9,h*.012)}'}px ui-monospace\`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(FINGER_LABELS[fid],p.x,p.y+1);
      ctx.textAlign='start'; ctx.textBaseline='alphabetic';

      if (!didStrum) processSingle(fid,p,prev,g);
      handHistory.set(key,{x:p.x,y:p.y,t:now});
    });
  });

  for (const key of handHistory.keys()) if (!seen.has(key) && now - handHistory.get(key).t > 450) handHistory.delete(key);
}
function renderLoop`
);

replaceOnce(
  'hybrid camera status',
  "setStatus(`${cfg().name} · ${currentPlayMode === 'single' ? '單弦精準' : '和弦'} · 手部追蹤中`, 'live');",
  "setStatus(`${cfg().name} · 單弦 + 和弦自動辨識 · 手部追蹤中`, 'live');"
);

replaceOnce(
  'hybrid debounce',
  "const nowMs = performance.now(), debounce = currentPlayMode === 'single' ? 52 : 45;",
  "const nowMs = performance.now(), debounce = currentInstrument === 'bass' ? 48 : 36;"
);
replaceOnce(
  'stronger attack',
  "gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.035, Math.min(.34, strength * .24)), now + .008);",
  "gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.065, Math.min(.46, strength * .29)), now + .0045);"
);

replaceRegex('remove legacy mode listeners', /modeButtons\.forEach\([\s\S]*?\);\n/, '');
replaceRegex('remove legacy orientation listeners', /orientationButtons\.forEach\([\s\S]*?\);\n/, '');
replaceOnce(
  'instrument switching stays hybrid',
  "instrumentButtons.forEach(b => b.addEventListener('click', () => { currentInstrument = b.dataset.instrument; if (currentInstrument === 'bass' && currentPlayMode === 'chord') currentPlayMode = 'single'; resetTracking(); pickSequence=[]; patternText.textContent='演奏序列：—'; applyTone(); drawIdle(); }));",
  "instrumentButtons.forEach(b => b.addEventListener('click', async () => { await ensureAudio(); currentInstrument = b.dataset.instrument; currentPlayMode = 'hybrid'; resetTracking(); pickSequence=[]; patternText.textContent='演奏序列：—'; applyTone(); drawIdle(); setStatus(`${cfg().name} · 單弦 + 和弦自動辨識`, 'live'); }));"
);

source += `\n//# sourceURL=virtual-guitar-app-v6-unified.js\n`;
const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(blobUrl);
  window.__VIRTUAL_GUITAR_UNIFIED_V6__ = true;
} finally {
  URL.revokeObjectURL(blobUrl);
}
