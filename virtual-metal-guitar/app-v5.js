// Single-string reliability hotfix layer for Virtual Guitar Studio.
// Loads the proven v4 runtime, patches only the picking-sensitive sections,
// then executes the patched module. This keeps chord/orientation/audio guard behavior intact.

const sourceUrl = new URL('./app-v4.js?v=5', import.meta.url);
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Unable to load app-v4.js: ${response.status}`);
let source = await response.text();

const patches = [
  {
    name: 'single smoothing responsiveness',
    from: "const prev = smoothHistory.get(key), alpha = .58, p = prev ? { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha } : { x, y }; smoothHistory.set(key, p); return p;",
    to: "const prev = smoothHistory.get(key), alpha = currentPlayMode === 'single' ? .76 : .58, p = prev ? { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha } : { x, y }; smoothHistory.set(key, p); return p;"
  },
  {
    name: 'wider single picking zone',
    from: "const fretZoneMin = Math.min(fretLines[0], fretLines[4]), fretZoneMax = Math.max(fretLines[0], fretLines[4]), pluckHalf = w * .105;",
    to: "const fretZoneMin = Math.min(fretLines[0], fretLines[4]), fretZoneMax = Math.max(fretLines[0], fretLines[4]), pluckHalf = w * (currentPlayMode === 'single' ? .145 : .105);"
  },
  {
    name: 'stronger single-string attack',
    from: "gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.035, Math.min(.34, strength * .24)), now + .008);",
    to: "gain.gain.setValueAtTime(.0001, now); const singleMode = currentPlayMode === 'single'; const peak = singleMode ? Math.max(.08, Math.min(.48, strength * .30)) : Math.max(.035, Math.min(.34, strength * .24)); const attack = singleMode ? .004 : .008; gain.gain.exponentialRampToValueAtTime(peak, now + attack);"
  },
  {
    name: 'shorter single-string debounce',
    from: "const nowMs = performance.now(), debounce = currentPlayMode === 'single' ? 52 : 45;",
    to: "const nowMs = performance.now(), debounce = currentPlayMode === 'single' ? 38 : 45;"
  },
  {
    name: 'forgiving single-string hit detection',
    from: `function processSingle(fid, p, prev, g) {
  if (!prev || p.x < g.pluckX1 || p.x > g.pluckX2 || prev.x < g.pluckX1 - 8 || prev.x > g.pluckX2 + 8) return;
  const dy = p.y - prev.y, minMove = Math.max(2.2, g.spacing * .10); if (Math.abs(dy) < minMove) return; const crossed = [];
  g.stringYs.forEach((sy, i) => { if ((prev.y < sy && p.y >= sy) || (prev.y > sy && p.y <= sy)) crossed.push({ i, d: Math.abs((prev.y + p.y) * .5 - sy) }); });
  if (!crossed.length) return; crossed.sort((a,b) => a.d - b.d); pluckString(crossed[0].i, Math.min(1.1, .42 + Math.abs(dy) / (g.spacing * 1.6)), 0, FINGER_LABELS[fid]);
}`,
    to: `function processSingle(fid, p, prev, g) {
  if (!prev) return;

  const zonePad = Math.max(14, canvas.width * .008);
  const inZoneNow = p.x >= g.pluckX1 - zonePad && p.x <= g.pluckX2 + zonePad;
  const inZonePrev = prev.x >= g.pluckX1 - zonePad && prev.x <= g.pluckX2 + zonePad;
  if (!inZoneNow || !inZonePrev) return;

  const dy = p.y - prev.y;
  const dt = Math.max(1, performance.now() - prev.t);
  const speed = Math.abs(dy) / dt * 16.67;
  const minMove = Math.max(1.35, g.spacing * .055);
  const minSpeed = Math.max(1.1, g.spacing * .035);
  if (Math.abs(dy) < minMove || speed < minSpeed) return;

  const hitRadius = Math.max(5, g.spacing * .20);
  const candidates = [];
  g.stringYs.forEach((sy, i) => {
    const crossed = (prev.y < sy && p.y >= sy) || (prev.y > sy && p.y <= sy);
    const sweptNear = Math.min(prev.y, p.y) - hitRadius <= sy && Math.max(prev.y, p.y) + hitRadius >= sy;
    const endpointNear = Math.min(Math.abs(prev.y - sy), Math.abs(p.y - sy)) <= hitRadius;
    if (crossed || (sweptNear && endpointNear)) {
      candidates.push({ i, d: Math.abs((prev.y + p.y) * .5 - sy) });
    }
  });

  if (!candidates.length) {
    const near = nearestString(g, p.y);
    if (near.distance <= hitRadius * .85) candidates.push({ i: near.index, d: near.distance });
  }
  if (!candidates.length) return;

  candidates.sort((a, b) => a.d - b.d);
  const target = candidates[0];
  const strength = Math.min(1.28, .62 + Math.abs(dy) / (g.spacing * 1.25));
  pluckString(target.i, strength, 0, FINGER_LABELS[fid]);
}`
  }
];

for (const patch of patches) {
  const index = source.indexOf(patch.from);
  if (index === -1) throw new Error(`Virtual Guitar v5 patch target missing: ${patch.name}`);
  if (source.indexOf(patch.from, index + patch.from.length) !== -1) {
    throw new Error(`Virtual Guitar v5 patch target duplicated: ${patch.name}`);
  }
  source = source.replace(patch.from, patch.to);
}

source += `\n//# sourceURL=virtual-guitar-app-v5-patched.js\n`;
const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(blobUrl);
  window.__VIRTUAL_GUITAR_SINGLE_V5__ = true;
} finally {
  URL.revokeObjectURL(blobUrl);
}
