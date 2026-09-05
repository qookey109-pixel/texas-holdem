import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const camera = $('#camera');
const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = $('#stage');
const startCameraBtn = $('#startCameraBtn');
const testSoundBtn = $('#testSoundBtn');
const overlayTestSoundBtn = $('#overlayTestSoundBtn');
const permissionOverlay = $('#permissionOverlay');
const recordBtn = $('#recordBtn');
const stopBtn = $('#stopBtn');
const fullscreenBtn = $('#fullscreenBtn');
const statusText = $('#statusText');
const cameraDot = $('#cameraDot');
const codecText = $('#codecText');
const recordBadge = $('#recordBadge');
const recordTimer = $('#recordTimer');
const driveSlider = $('#driveSlider');
const volumeSlider = $('#volumeSlider');
const stringSpacingSlider = $('#stringSpacingSlider');
const toneLabel = $('#toneLabel');
const tuningText = $('#tuningText');
const patternText = $('#patternText');
const modeHelp = $('#modeHelp');
const chordBadge = $('#chordBadge');
const chordName = $('#chordName');
const instrumentBadgeName = $('#instrumentBadgeName');
const instrumentBadgeDetail = $('#instrumentBadgeDetail');
const audioStateText = $('#audioStateText');
const instrumentButtons = $$('.instrument-btn');
const modeButtons = $$('.mode-btn');
const orientationButtons = $$('.orientation-btn');

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FINGERTIP_IDS = [4, 8, 12, 16, 20];
const FRET_FINGER_IDS = [8, 12, 16, 20];
const FINGER_LABELS = { 4: 'T', 8: '1', 12: '2', 16: '3', 20: '4' };

const INSTRUMENTS = {
  bass: {
    name: '貝斯', badge: '4 弦 · DEEP LOW', icon: '🎸', accent: '#38bdf8',
    names: ['E1', 'A1', 'D2', 'G2'], freqs: [41.20, 55.00, 73.42, 98.00],
    toneLabel: '厚度 DRIVE', drive: 26, body: 'bass',
    tone: { pre: 1.15, lowpass: 3200, highpass: 30, presenceFreq: 900, presenceGain: 2.2, wave: 'triangle', release: 2.0, brightness: .12 }
  },
  electric: {
    name: '電吉他', badge: '6 弦 · HIGH GAIN', icon: '⚡', accent: '#ef4444',
    names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], freqs: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
    toneLabel: '失真 DRIVE', drive: 62, body: 'electric',
    tone: { pre: 1.45, lowpass: 6500, highpass: 65, presenceFreq: 2700, presenceGain: 3.8, wave: 'sawtooth', release: 1.45, brightness: .18 }
  },
  acoustic: {
    name: '民謠吉他', badge: '6 弦 · STEEL', icon: '🪕', accent: '#f59e0b',
    names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], freqs: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
    toneLabel: '明亮 TONE', drive: 10, body: 'acoustic',
    tone: { pre: 1.05, lowpass: 9000, highpass: 75, presenceFreq: 3600, presenceGain: 2.4, wave: 'triangle', release: 1.7, brightness: .30 }
  },
  classical: {
    name: '古典吉他', badge: '6 弦 · NYLON', icon: '🎼', accent: '#d6a76f',
    names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], freqs: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
    toneLabel: '柔和 TONE', drive: 2, body: 'classical',
    tone: { pre: .95, lowpass: 5200, highpass: 55, presenceFreq: 1900, presenceGain: 1.0, wave: 'sine', release: 1.9, brightness: .08 }
  }
};

const CHORDS = {
  C:  { frets: [null, 3, 2, 0, 1, 0], required: [[1,3],[2,2],[4,1]] },
  G:  { frets: [3, 2, 0, 0, 0, 3], required: [[0,3],[1,2],[5,3]] },
  D:  { frets: [null, null, 0, 2, 3, 2], required: [[3,2],[4,3],[5,2]] },
  E:  { frets: [0, 2, 2, 1, 0, 0], required: [[1,2],[2,2],[3,1]] },
  Em: { frets: [0, 2, 2, 0, 0, 0], required: [[1,2],[2,2]] },
  A:  { frets: [null, 0, 2, 2, 2, 0], required: [[2,2],[3,2],[4,2]] },
  Am: { frets: [null, 0, 2, 2, 1, 0], required: [[2,2],[3,2],[4,1]] },
  Dm: { frets: [null, null, 0, 2, 3, 1], required: [[3,2],[4,3],[5,1]] }
};

let currentInstrument = 'electric';
let currentPlayMode = 'single';
let orientation = 'right';
let cameraStream = null;
let handLandmarker = null;
let lastVideoTime = -1;
let animationId = null;
let audioCtx = null;
let masterGain = null;
let recordAudioDest = null;
let audioNodes = null;
let mediaRecorder = null;
let recordChunks = [];
let recordStartedAt = 0;
let timerInterval = null;
let mp4MimeType = '';
let handHistory = new Map();
let smoothHistory = new Map();
let activeStrings = new Map();
let lastPluckAt = new Map();
let pickSequence = [];
let activeChordName = null;
let chordCandidate = null;
let chordCandidateSince = 0;
let lastChordSeenAt = 0;
let lastStrumAt = 0;

function cfg() { return INSTRUMENTS[currentInstrument]; }
function setStatus(text, type = 'idle') {
  statusText.textContent = text;
  cameraDot.classList.toggle('live', type === 'live');
  cameraDot.classList.toggle('error', type === 'error');
}
function setAudioState(text, ok = false) {
  audioStateText.textContent = text;
  audioStateText.classList.toggle('ok', ok);
}
function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(640, Math.round(rect.width * dpr));
  const h = Math.max(360, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function makeDistortionCurve(amount = 0) {
  const samples = 22050;
  const curve = new Float32Array(samples);
  const k = Math.max(0, amount);
  for (let i = 0; i < samples; i++) {
    const x = i * 2 / samples - 1;
    curve[i] = k < 1 ? x : ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
async function ensureAudio() {
  if (!audioCtx) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('此瀏覽器不支援 Web Audio');
    audioCtx = new AudioContextCtor({ latencyHint: 'interactive' });
    const preGain = audioCtx.createGain();
    const lowpass = audioCtx.createBiquadFilter(); lowpass.type = 'lowpass';
    const distortion = audioCtx.createWaveShaper(); distortion.oversample = '2x';
    const highpass = audioCtx.createBiquadFilter(); highpass.type = 'highpass';
    const presence = audioCtx.createBiquadFilter(); presence.type = 'peaking';
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 4;
    masterGain = audioCtx.createGain();
    recordAudioDest = audioCtx.createMediaStreamDestination();
    preGain.connect(lowpass); lowpass.connect(distortion); distortion.connect(highpass); highpass.connect(presence);
    presence.connect(compressor); compressor.connect(masterGain); masterGain.connect(audioCtx.destination); masterGain.connect(recordAudioDest);
    audioNodes = { preGain, lowpass, distortion, highpass, presence, compressor };
    applyTone();
  }
  if (audioCtx.state !== 'running') {
    try { await audioCtx.resume(); } catch (e) { console.warn('Audio resume failed', e); }
  }
  if (audioCtx.state === 'running') {
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    g.gain.setValueAtTime(.00001, audioCtx.currentTime); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + .015);
  }
  setAudioState(audioCtx.state === 'running' ? '🔊 音訊已啟用' : `🔇 音訊：${audioCtx.state}`, audioCtx.state === 'running');
  return audioCtx.state === 'running';
}
function applyTone() {
  const c = cfg();
  document.documentElement.style.setProperty('--accent', c.accent);
  toneLabel.textContent = c.toneLabel; driveSlider.value = String(c.drive);
  tuningText.textContent = `${c.icon} ${c.name}${c.names.length}弦：${c.names.join(' · ')}`;
  instrumentBadgeName.textContent = c.name; instrumentBadgeDetail.textContent = c.badge;
  instrumentButtons.forEach(b => b.classList.toggle('active', b.dataset.instrument === currentInstrument));
  if (audioNodes && audioCtx) {
    const t = c.tone, now = audioCtx.currentTime;
    audioNodes.preGain.gain.setTargetAtTime(t.pre, now, .015); audioNodes.lowpass.frequency.setTargetAtTime(t.lowpass, now, .015);
    audioNodes.highpass.frequency.setTargetAtTime(t.highpass, now, .015); audioNodes.presence.frequency.setTargetAtTime(t.presenceFreq, now, .015);
    audioNodes.presence.gain.setTargetAtTime(t.presenceGain, now, .015); audioNodes.distortion.curve = makeDistortionCurve(Number(driveSlider.value));
    masterGain.gain.setTargetAtTime(Math.max(.02, Number(volumeSlider.value) / 100) * .82, now, .015);
  }
  updateModeUI();
}
function updateModeUI() {
  modeButtons.forEach(b => { b.classList.toggle('active', b.dataset.playMode === currentPlayMode); if (b.dataset.playMode === 'chord') b.disabled = currentInstrument === 'bass'; });
  orientationButtons.forEach(b => b.classList.toggle('active', b.dataset.orientation === orientation));
  chordBadge.classList.toggle('hidden', currentPlayMode !== 'chord');
  modeHelp.textContent = currentPlayMode === 'single'
    ? '單弦：弦距加寬，T=拇指、1=食指、2=中指、3=無名指、4=小指。'
    : `和弦：${orientation === 'right' ? '左手在左側指板按弦，右手在右側琴身刷弦' : '右手在右側指板按弦，左手在左側琴身刷弦'}；↓ 下刷、↑ 上刷。`;
}
function resetTracking() {
  handHistory.clear(); smoothHistory.clear(); activeStrings.clear(); lastPluckAt.clear();
  activeChordName = null; chordCandidate = null; chordCandidateSince = 0; lastChordSeenAt = 0; lastStrumAt = 0;
  chordName.textContent = '等待按弦'; chordBadge.classList.remove('locked');
}
function rememberAction(label) {
  if (!label) return; pickSequence.push(label); if (pickSequence.length > 14) pickSequence.shift();
  patternText.textContent = `演奏序列：${pickSequence.join(' · ')}`;
}
function playVoice(freq, strength = .8, fret = 0, delay = 0) {
  if (!audioCtx || audioCtx.state !== 'running' || !audioNodes) return;
  const now = audioCtx.currentTime + delay, tone = cfg().tone, f = freq * Math.pow(2, Math.max(0, fret) / 12);
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = tone.wave; osc.frequency.setValueAtTime(f, now);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.035, Math.min(.34, strength * .24)), now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + tone.release); osc.connect(gain); gain.connect(audioNodes.preGain); osc.start(now); osc.stop(now + tone.release + .04);
  if (tone.brightness > .01) {
    const overtone = audioCtx.createOscillator(), og = audioCtx.createGain(); overtone.type = 'triangle'; overtone.frequency.setValueAtTime(f * 2, now);
    og.gain.setValueAtTime(.0001, now); og.gain.exponentialRampToValueAtTime(Math.max(.004, tone.brightness * strength * .08), now + .004);
    og.gain.exponentialRampToValueAtTime(.0001, now + Math.min(.48, tone.release * .45)); overtone.connect(og); og.connect(audioNodes.preGain);
    overtone.start(now); overtone.stop(now + .55);
  }
}
async function pluckString(index, strength = .8, fret = 0, label = '') {
  if (index < 0 || index >= cfg().freqs.length) return;
  await ensureAudio();
  if (audioCtx.state !== 'running') { setStatus('音訊被瀏覽器暫停，請按「測試聲音」重新啟用', 'error'); return; }
  const nowMs = performance.now(), debounce = currentPlayMode === 'single' ? 52 : 45;
  if (nowMs - (lastPluckAt.get(index) || 0) < debounce) return;
  lastPluckAt.set(index, nowMs); activeStrings.set(index, { t: nowMs, fret }); playVoice(cfg().freqs[index], strength, fret); rememberAction(label);
}
async function testSound() {
  try {
    const ok = await ensureAudio(); if (!ok) throw new Error('AudioContext 未進入 running');
    const base = Math.min(2, cfg().freqs.length - 1); playVoice(cfg().freqs[base], .95, 0, 0); playVoice(cfg().freqs[Math.min(base + 1, cfg().freqs.length - 1)], .70, 0, .11);
    setStatus('測試聲音已播放 · 若聽得到，音訊正常', 'live');
  } catch (e) { setStatus(`音訊啟動失敗：${e.message}`, 'error'); setAudioState('🔇 音訊啟動失敗', false); }
}
async function initHandTracking() {
  if (handLandmarker) return; setStatus('載入手部辨識模型…');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .60 });
  } catch (e) {
    console.warn('GPU hand tracking failed, retry CPU', e);
    handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .50, minHandPresenceConfidence: .50, minTrackingConfidence: .55 });
  }
}
async function startCamera() {
  try {
    startCameraBtn.disabled = true; await ensureAudio(); await initHandTracking();
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } }, audio: false });
    camera.srcObject = cameraStream; await camera.play(); await ensureAudio(); permissionOverlay.classList.add('hidden'); recordBtn.disabled = !mp4MimeType;
    setStatus(`${cfg().name} · ${currentPlayMode === 'single' ? '單弦精準' : '和弦'} · 手部追蹤中`, 'live'); renderLoop();
  } catch (e) { console.error(e); startCameraBtn.disabled = false; setStatus(`啟動失敗：${e.message || e.name}`, 'error'); }
}
function fretX(start, end, fretIndex) { const t = fretIndex / 12; return start + (end - start) * (1 - Math.pow(1 - t, 1.28)); }
function geometry(w, h) {
  const count = cfg().names.length, spacingScale = Number(stringSpacingSlider.value) / 100;
  const baseSpacing = count === 4 ? .052 : (currentPlayMode === 'single' ? .043 : .036), spacing = Math.max(14, h * baseSpacing * spacingScale);
  const centerY = h * .59, yTop = centerY - spacing * (count - 1) / 2, rightHanded = orientation === 'right';
  const neckStart = w * (rightHanded ? .075 : .925), bodyJoint = w * (rightHanded ? .665 : .335), bodyX = w * (rightHanded ? .79 : .21), bodyW = w * .19;
  const stringEnd = w * (rightHanded ? .895 : .105), fretLines = Array.from({ length: 7 }, (_, i) => fretX(neckStart, bodyJoint, i));
  const fretZoneMin = Math.min(fretLines[0], fretLines[4]), fretZoneMax = Math.max(fretLines[0], fretLines[4]), pluckHalf = w * .105;
  return { count, spacing, centerY, yTop, stringYs: Array.from({ length: count }, (_, i) => yTop + i * spacing), stringX1: neckStart, stringX2: stringEnd,
    neckStart, bodyJoint, bodyX, bodyW, bodyH: h * .32, neckH: Math.max(spacing * (count + .55), h * .13), fretLines, fretX1: fretZoneMin, fretX2: fretZoneMax,
    pluckX1: bodyX - pluckHalf, pluckX2: bodyX + pluckHalf, rightHanded };
}
function roundRect(c, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, height / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + width, y, x + width, y + height, r);
  c.arcTo(x + width, y + height, x, y + height, r); c.arcTo(x, y + height, x, y, r); c.arcTo(x, y, x + width, y, r); c.closePath();
}
function drawMirroredCamera() {
  const w = canvas.width, h = canvas.height;
  if (camera.readyState >= 2) { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(camera, 0, 0, w, h); ctx.restore(); }
  else { ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, w, h); }
  const v = ctx.createRadialGradient(w * .5, h * .45, h * .18, w * .5, h * .45, h * .8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
}
function drawBody(g) {
  const { bodyX: cx, centerY: cy, bodyW: bw, bodyH: bh } = g, wood = cfg().body === 'acoustic' || cfg().body === 'classical'; ctx.beginPath();
  if (wood) {
    ctx.moveTo(cx, cy - bh * .48); ctx.bezierCurveTo(cx - bw * .58, cy - bh * .56, cx - bw * .72, cy - bh * .22, cx - bw * .42, cy - bh * .04);
    ctx.bezierCurveTo(cx - bw * .94, cy + bh * .14, cx - bw * .68, cy + bh * .56, cx, cy + bh * .50); ctx.bezierCurveTo(cx + bw * .68, cy + bh * .56, cx + bw * .94, cy + bh * .14, cx + bw * .42, cy - bh * .04);
    ctx.bezierCurveTo(cx + bw * .72, cy - bh * .22, cx + bw * .58, cy - bh * .56, cx, cy - bh * .48);
  } else {
    ctx.moveTo(cx - bw * .56, cy - bh * .08); ctx.bezierCurveTo(cx - bw * .92, cy - bh * .48, cx - bw * .45, cy - bh * .58, cx - bw * .10, cy - bh * .30);
    ctx.bezierCurveTo(cx + bw * .30, cy - bh * .52, cx + bw * .66, cy - bh * .27, cx + bw * .50, cy); ctx.bezierCurveTo(cx + bw * .55, cy + bh * .32, cx + bw * .12, cy + bh * .48, cx - bw * .10, cy + bh * .24);
    ctx.bezierCurveTo(cx - bw * .38, cy + bh * .52, cx - bw * .88, cy + bh * .30, cx - bw * .56, cy - bh * .08);
  }
  ctx.closePath(); const grad = ctx.createRadialGradient(cx - bw * .25, cy - bh * .2, 5, cx, cy, bw);
  if (cfg().body === 'acoustic') { grad.addColorStop(0, '#f6d17a'); grad.addColorStop(.55, '#b96c28'); grad.addColorStop(1, '#4a2512'); }
  else if (cfg().body === 'classical') { grad.addColorStop(0, '#e8c18b'); grad.addColorStop(.55, '#a96c3b'); grad.addColorStop(1, '#4d2a18'); }
  else if (cfg().body === 'bass') { grad.addColorStop(0, '#164e63'); grad.addColorStop(.55, '#075985'); grad.addColorStop(1, '#06151d'); }
  else { grad.addColorStop(0, '#7f1d1d'); grad.addColorStop(.55, '#2b1115'); grad.addColorStop(1, '#08080b'); }
  ctx.fillStyle = grad; ctx.fill(); ctx.lineWidth = Math.max(2, canvas.width * .0014); ctx.strokeStyle = cfg().accent; ctx.stroke();
  if (wood) { ctx.beginPath(); ctx.arc(cx, cy - bh * .02, bw * .145, 0, Math.PI * 2); ctx.fillStyle = '#1a100c'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke(); }
  else { ctx.fillStyle = '#08080b'; roundRect(ctx, cx - bw * .20, cy - bh * .13, bw * .40, bh * .10, 5); ctx.fill(); roundRect(ctx, cx - bw * .15, cy + bh * .02, bw * .42, bh * .08, 5); ctx.fill(); }
}
function drawInstrument() {
  const w = canvas.width, h = canvas.height, g = geometry(w, h); ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.78)'; ctx.shadowBlur = 24;
  const nx = Math.min(g.neckStart, g.bodyJoint), nw = Math.abs(g.bodyJoint - g.neckStart); ctx.fillStyle = cfg().body === 'acoustic' || cfg().body === 'classical' ? '#5b381f' : '#27272d';
  roundRect(ctx, nx, g.centerY - g.neckH / 2, nw + w * .03, g.neckH, 8); ctx.fill(); drawBody(g); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(1, h * .0012);
  g.fretLines.forEach(x => { ctx.beginPath(); ctx.moveTo(x, g.yTop - g.spacing * .52); ctx.lineTo(x, g.stringYs[g.count - 1] + g.spacing * .52); ctx.stroke(); });
  g.stringYs.forEach((y, i) => {
    const active = activeStrings.get(i), age = performance.now() - (active?.t || -9999), glow = age < 250 ? 1 - age / 250 : 0;
    ctx.beginPath(); ctx.moveTo(g.stringX1, y); ctx.lineTo(g.stringX2, y); ctx.lineWidth = Math.max(1.4, h * (.0015 + (g.count - 1 - i) * .00018));
    ctx.strokeStyle = glow > 0 ? cfg().accent : 'rgba(240,240,244,.92)'; ctx.shadowColor = cfg().accent; ctx.shadowBlur = glow * 22; ctx.stroke(); ctx.shadowBlur = 0;
  });
  ctx.fillStyle = 'rgba(255,255,255,.035)'; roundRect(ctx, g.pluckX1, g.yTop - g.spacing * .72, g.pluckX2 - g.pluckX1, g.spacing * (g.count - 1 + 1.44), 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.setLineDash([7,6]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = `700 ${Math.max(10, h * .014)}px ui-sans-serif`;
  ctx.fillText(currentPlayMode === 'single' ? '精準撥弦區' : '刷弦區 ↓ / ↑', g.pluckX1 + 8, g.yTop - g.spacing * .88);
  if (currentPlayMode === 'chord') {
    ctx.fillStyle = 'rgba(255,255,255,.025)'; roundRect(ctx, g.fretX1, g.yTop - g.spacing * .65, g.fretX2 - g.fretX1, g.spacing * (g.count - 1 + 1.3), 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.fillText('按弦區 1–3 格', g.fretX1 + 8, g.yTop - g.spacing * .83);
  }
  ctx.fillStyle = 'rgba(255,255,255,.58)'; ctx.font = `700 ${Math.max(10, h * .013)}px ui-monospace`;
  ctx.fillText(g.rightHanded ? '右手吉他：琴頸 ← 左｜右 → 琴身' : '左手吉他：琴身 ← 左｜右 → 琴頸', w * .035, h * .94); ctx.restore(); return g;
}
function smoothPoint(key, x, y) {
  const prev = smoothHistory.get(key), alpha = .58, p = prev ? { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha } : { x, y }; smoothHistory.set(key, p); return p;
}
function nearestString(g, y) {
  let best = 0, d = Infinity; g.stringYs.forEach((sy, i) => { const nd = Math.abs(y - sy); if (nd < d) { d = nd; best = i; } }); return { index: best, distance: d };
}
function fretAtX(g, x) {
  for (let fret = 1; fret <= 3; fret++) { const a = g.fretLines[fret - 1], b = g.fretLines[fret]; if (x >= Math.min(a,b) && x <= Math.max(a,b)) return fret; } return null;
}
function collectChordPresses(hands, g) {
  if (currentPlayMode !== 'chord' || g.count !== 6) return []; const presses = [];
  hands.forEach(hand => FRET_FINGER_IDS.forEach(fid => {
    const p = hand.tips.get(fid); if (!p || p.x < g.fretX1 || p.x > g.fretX2) return; const n = nearestString(g, p.y), fret = fretAtX(g, p.x);
    if (fret && n.distance < g.spacing * .48) presses.push({ stringIndex: n.index, fret, fingerId: fid, x: p.x, y: p.y });
  })); return presses;
}
function recognizeChord(presses, now) {
  if (currentPlayMode !== 'chord') return; const observed = new Set(presses.map(p => `${p.stringIndex}:${p.fret}`)); let best = null, bestScore = -Infinity;
  Object.entries(CHORDS).forEach(([name, chord]) => {
    const req = chord.required.map(([s,f]) => `${s}:${f}`), hits = req.filter(k => observed.has(k)).length; if (hits !== req.length) return;
    const extras = [...observed].filter(k => !req.includes(k)).length, score = req.length * 10 - extras * 2; if (score > bestScore) { bestScore = score; best = name; }
  });
  if (best) { lastChordSeenAt = now; if (chordCandidate !== best) { chordCandidate = best; chordCandidateSince = now; } else if (now - chordCandidateSince > 130) activeChordName = best; }
  else { chordCandidate = null; if (now - lastChordSeenAt > 360) activeChordName = null; }
  chordName.textContent = activeChordName || (best ? `${best}…` : '等待按弦'); chordBadge.classList.toggle('locked', Boolean(activeChordName));
}
function chordFret(i) { if (!activeChordName) return 0; const fret = CHORDS[activeChordName]?.frets?.[i]; return fret == null ? null : fret; }
function processSingle(fid, p, prev, g) {
  if (!prev || p.x < g.pluckX1 || p.x > g.pluckX2 || prev.x < g.pluckX1 - 8 || prev.x > g.pluckX2 + 8) return;
  const dy = p.y - prev.y, minMove = Math.max(2.2, g.spacing * .10); if (Math.abs(dy) < minMove) return; const crossed = [];
  g.stringYs.forEach((sy, i) => { if ((prev.y < sy && p.y >= sy) || (prev.y > sy && p.y <= sy)) crossed.push({ i, d: Math.abs((prev.y + p.y) * .5 - sy) }); });
  if (!crossed.length) return; crossed.sort((a,b) => a.d - b.d); pluckString(crossed[0].i, Math.min(1.1, .42 + Math.abs(dy) / (g.spacing * 1.6)), 0, FINGER_LABELS[fid]);
}
function processStrum(indexTip, prev, g, now) {
  if (!prev || !indexTip) return; if (indexTip.x < g.pluckX1 || indexTip.x > g.pluckX2 || prev.x < g.pluckX1 - 12 || prev.x > g.pluckX2 + 12) return;
  const dy = indexTip.y - prev.y; if (Math.abs(dy) < g.spacing * .52 || now - lastStrumAt < 105) return;
  const minY = Math.min(prev.y, indexTip.y), maxY = Math.max(prev.y, indexTip.y), crossed = g.stringYs.map((sy,i) => ({sy,i})).filter(s => s.sy >= minY && s.sy <= maxY);
  if (crossed.length < 2) return; lastStrumAt = now; crossed.sort((a,b) => dy > 0 ? a.sy - b.sy : b.sy - a.sy); const arrow = dy > 0 ? '↓' : '↑'; rememberAction(`${activeChordName || 'OPEN'}${arrow}`);
  crossed.forEach((s, order) => { const fret = chordFret(s.i); if (fret == null) return; activeStrings.set(s.i, { t: performance.now() + order * 14, fret }); playVoice(cfg().freqs[s.i], .78, fret, order * .014); });
}
function drawHandsAndDetect(results, g) {
  const w = canvas.width, h = canvas.height, now = performance.now(), hands = [], seen = new Set();
  const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  results.landmarks?.forEach((landmarks, hi) => {
    const handed = results.handedness?.[hi]?.[0]?.categoryName || `H${hi}`, hand = { label: handed, points: new Map(), tips: new Map() };
    landmarks.forEach((lm, id) => { const x = (1 - lm.x) * w, y = lm.y * h, p = FINGERTIP_IDS.includes(id) ? smoothPoint(`${handed}-${id}`, x, y) : {x,y}; hand.points.set(id,p); if (FINGERTIP_IDS.includes(id)) hand.tips.set(id,p); }); hands.push(hand);
  });
  const presses = collectChordPresses(hands, g); recognizeChord(presses, now);
  presses.forEach(p => { ctx.beginPath(); ctx.arc(p.x, g.stringYs[p.stringIndex], Math.max(8, g.spacing * .22), 0, Math.PI * 2); ctx.fillStyle = cfg().accent; ctx.globalAlpha = .35; ctx.fill(); ctx.globalAlpha = 1; });
  hands.forEach(hand => {
    ctx.strokeStyle = 'rgba(245,158,11,.44)'; ctx.lineWidth = Math.max(1, h * .0015);
    connections.forEach(([a,b]) => { const p1 = hand.points.get(a), p2 = hand.points.get(b); if (!p1 || !p2) return; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); });
    FINGERTIP_IDS.forEach(fid => {
      const p = hand.tips.get(fid); if (!p) return; const key = `${hand.label}-${fid}`, prev = handHistory.get(key); seen.add(key);
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(7,h*.0095),0,Math.PI*2); ctx.fillStyle = fid === 4 ? 'rgba(96,210,255,.96)' : 'rgba(255,191,70,.96)'; ctx.fill();
      ctx.fillStyle = '#08080a'; ctx.font = `900 ${Math.max(9,h*.012)}px ui-monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(FINGER_LABELS[fid],p.x,p.y+1); ctx.textAlign='start'; ctx.textBaseline='alphabetic';
      if (currentPlayMode === 'single') processSingle(fid,p,prev,g); handHistory.set(key,{x:p.x,y:p.y,t:now});
    });
    if (currentPlayMode === 'chord') {
      const p = hand.tips.get(8), prev = handHistory.get(`${hand.label}-STRUM`); processStrum(p, prev, g, now);
      if (p) { handHistory.set(`${hand.label}-STRUM`, {x:p.x,y:p.y,t:now}); seen.add(`${hand.label}-STRUM`); }
    }
  });
  for (const key of handHistory.keys()) if (!seen.has(key) && now - handHistory.get(key).t > 450) handHistory.delete(key);
}
function renderLoop() {
  resizeCanvas(); drawMirroredCamera(); const g = drawInstrument();
  if (handLandmarker && camera.readyState >= 2 && camera.currentTime !== lastVideoTime) { lastVideoTime = camera.currentTime; try { drawHandsAndDetect(handLandmarker.detectForVideo(camera, performance.now()), g); } catch (e) { console.warn('Hand frame skipped', e); } }
  animationId = requestAnimationFrame(renderLoop);
}
function drawIdle() { resizeCanvas(); drawMirroredCamera(); drawInstrument(); }
function selectMp4MimeType() {
  if (!window.MediaRecorder) return ''; return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
}
function updateCodecStatus() { mp4MimeType = selectMp4MimeType(); codecText.textContent = mp4MimeType ? '錄影：MP4 / H.264 可用' : '此瀏覽器不支援直接 MP4 錄影'; }
function buildRecordingStream() {
  const v = canvas.captureStream(30), tracks = [...v.getVideoTracks()]; if (recordAudioDest?.stream?.getAudioTracks().length) tracks.push(recordAudioDest.stream.getAudioTracks()[0]); return new MediaStream(tracks);
}
function startRecording() {
  if (!mp4MimeType) { alert('此瀏覽器目前無法直接輸出 MP4/H.264。'); return; } recordChunks = [];
  try { mediaRecorder = new MediaRecorder(buildRecordingStream(), { mimeType: mp4MimeType, videoBitsPerSecond: 6500000, audioBitsPerSecond: 192000 }); }
  catch (e) { setStatus(`錄影失敗：${e.message}`, 'error'); return; }
  mediaRecorder.ondataavailable = e => { if (e.data?.size) recordChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    clearInterval(timerInterval); const blob = new Blob(recordChunks, {type:'video/mp4'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `virtual-guitar-${Date.now()}.mp4`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    recordBadge.classList.add('hidden'); recordBtn.disabled = false; stopBtn.disabled = true;
  };
  mediaRecorder.start(1000); recordStartedAt = performance.now(); recordBadge.classList.remove('hidden'); recordBtn.disabled = true; stopBtn.disabled = false;
  timerInterval = setInterval(() => { const s = Math.floor((performance.now()-recordStartedAt)/1000); recordTimer.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; },250);
}
function stopRecording() { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); }

instrumentButtons.forEach(b => b.addEventListener('click', () => { currentInstrument = b.dataset.instrument; if (currentInstrument === 'bass' && currentPlayMode === 'chord') currentPlayMode = 'single'; resetTracking(); pickSequence=[]; patternText.textContent='演奏序列：—'; applyTone(); drawIdle(); }));
modeButtons.forEach(b => b.addEventListener('click', () => { if (b.dataset.playMode === 'chord' && currentInstrument === 'bass') return; currentPlayMode = b.dataset.playMode; resetTracking(); pickSequence=[]; patternText.textContent='演奏序列：—'; updateModeUI(); drawIdle(); }));
orientationButtons.forEach(b => b.addEventListener('click', () => { orientation = b.dataset.orientation; resetTracking(); updateModeUI(); drawIdle(); }));
driveSlider.addEventListener('input', () => { if (audioNodes) audioNodes.distortion.curve = makeDistortionCurve(Number(driveSlider.value)); });
volumeSlider.addEventListener('input', async () => { await ensureAudio(); if (masterGain) masterGain.gain.setTargetAtTime(Math.max(.02, Number(volumeSlider.value)/100)*.82, audioCtx.currentTime, .015); });
stringSpacingSlider.addEventListener('input', drawIdle);
startCameraBtn.addEventListener('click', startCamera); testSoundBtn.addEventListener('click', testSound); overlayTestSoundBtn.addEventListener('click', testSound);
recordBtn.addEventListener('click', startRecording); stopBtn.addEventListener('click', stopRecording);
fullscreenBtn.addEventListener('click', async () => { try { if (!document.fullscreenElement) await stage.requestFullscreen(); else await document.exitFullscreen(); } catch(e) { console.warn(e); } });
window.addEventListener('resize', drawIdle); window.addEventListener('pointerdown', () => { if (audioCtx?.state === 'suspended') audioCtx.resume(); }, { passive: true });
window.addEventListener('beforeunload', () => { if (animationId) cancelAnimationFrame(animationId); cameraStream?.getTracks().forEach(t => t.stop()); audioCtx?.close(); });

updateCodecStatus(); applyTone(); updateModeUI(); drawIdle();
