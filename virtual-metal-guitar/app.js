import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";

const camera = document.querySelector('#camera');
const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = document.querySelector('#stage');
const startCameraBtn = document.querySelector('#startCameraBtn');
const permissionOverlay = document.querySelector('#permissionOverlay');
const recordBtn = document.querySelector('#recordBtn');
const stopBtn = document.querySelector('#stopBtn');
const fullscreenBtn = document.querySelector('#fullscreenBtn');
const statusText = document.querySelector('#statusText');
const cameraDot = document.querySelector('#cameraDot');
const codecText = document.querySelector('#codecText');
const recordBadge = document.querySelector('#recordBadge');
const recordTimer = document.querySelector('#recordTimer');
const driveSlider = document.querySelector('#driveSlider');
const volumeSlider = document.querySelector('#volumeSlider');
const stringSpacingSlider = document.querySelector('#stringSpacingSlider');
const toneLabel = document.querySelector('#toneLabel');
const tuningText = document.querySelector('#tuningText');
const patternText = document.querySelector('#patternText');
const modeHelp = document.querySelector('#modeHelp');
const chordBadge = document.querySelector('#chordBadge');
const chordName = document.querySelector('#chordName');
const instrumentBadgeName = document.querySelector('#instrumentBadgeName');
const instrumentBadgeDetail = document.querySelector('#instrumentBadgeDetail');
const instrumentButtons = [...document.querySelectorAll('.instrument-btn')];
const modeButtons = [...document.querySelectorAll('.mode-btn')];

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FINGERTIP_IDS = [4, 8, 12, 16, 20];
const FRET_FINGER_IDS = [8, 12, 16, 20];
const FINGER_LABELS = { 4: 'T', 8: '1', 12: '2', 16: '3', 20: '4' };

const INSTRUMENTS = {
  bass: {
    name: '貝斯', badge: '4 弦 · DEEP LOW', icon: '🎸', accent: '#38bdf8',
    names: ['E1', 'A1', 'D2', 'G2'], freqs: [41.20, 55.00, 73.42, 98.00],
    toneLabel: '厚度 DRIVE', drive: 34, body: 'bass',
    tone: { pre: 2.0, lowpass: 3600, highpass: 32, presenceFreq: 900, presenceGain: 3.2, distortionScale: .35, decay: .9982, attack: .14, duration: 3.4, brightness: .70 }
  },
  electric: {
    name: '電吉他', badge: '6 弦 · HIGH GAIN', icon: '⚡', accent: '#ef4444',
    names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], freqs: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
    toneLabel: '失真 DRIVE', drive: 72, body: 'electric',
    tone: { pre: 2.8, lowpass: 6200, highpass: 70, presenceFreq: 2800, presenceGain: 4.5, distortionScale: 1, decay: .9968, attack: .24, duration: 2.3, brightness: .88 }
  },
  acoustic: {
    name: '民謠吉他', badge: '6 弦 · STEEL', icon: '🪕', accent: '#f59e0b',
    names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], freqs: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
    toneLabel: '明亮 TONE', drive: 18, body: 'acoustic',
    tone: { pre: 1.45, lowpass: 9800, highpass: 75, presenceFreq: 3600, presenceGain: 2.2, distortionScale: .055, decay: .99725, attack: .32, duration: 2.8, brightness: .96 }
  },
  classical: {
    name: '古典吉他', badge: '6 弦 · NYLON', icon: '🎼', accent: '#d6a76f',
    names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], freqs: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
    toneLabel: '柔和 TONE', drive: 8, body: 'classical',
    tone: { pre: 1.25, lowpass: 5600, highpass: 60, presenceFreq: 2100, presenceGain: 1.0, distortionScale: .018, decay: .99765, attack: .09, duration: 3.1, brightness: .58 }
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
let cameraStream = null;
let handLandmarker = null;
let lastVideoTime = -1;
let animationId = null;
let audioCtx = null;
let masterGain = null;
let recordAudioDest = null;
let audioNodes = null;
let stringBuffers = [];
let mediaRecorder = null;
let recordChunks = [];
let recordStartedAt = 0;
let timerInterval = null;
let mp4MimeType = '';
let handHistory = new Map();
let fingerSmoothing = new Map();
let activeStrings = new Map();
let lastPluckAt = new Map();
let pickSequence = [];
let chordCandidate = null;
let chordCandidateSince = 0;
let activeChordName = null;
let lastChordSeenAt = 0;

function config() { return INSTRUMENTS[currentInstrument]; }

function setStatus(text, type = 'idle') {
  statusText.textContent = text;
  cameraDot.classList.toggle('live', type === 'live');
  cameraDot.classList.toggle('error', type === 'error');
}

function resetTrackingState() {
  handHistory.clear();
  fingerSmoothing.clear();
  activeStrings.clear();
  lastPluckAt.clear();
  chordCandidate = null;
  chordCandidateSince = 0;
  activeChordName = null;
  lastChordSeenAt = 0;
  chordName.textContent = '等待按弦';
  chordBadge.classList.remove('locked');
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(640, Math.round(rect.width * dpr));
  const h = Math.max(360, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function selectMp4MimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,opus',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4'
  ];
  if (!window.MediaRecorder) return '';
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function updateCodecStatus() {
  mp4MimeType = selectMp4MimeType();
  codecText.textContent = mp4MimeType
    ? `錄影：MP4 / H.264 優先 · ${mp4MimeType}`
    : '此瀏覽器無法直接錄製 MP4/H.264；可改用最新版 Chrome / Edge';
}

function makeDistortionCurve(amount = 72) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = i * 2 / samples - 1;
    curve[i] = amount < .5 ? x : ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function buildStringBuffer(freq, tone) {
  const sr = audioCtx.sampleRate;
  const length = Math.floor(sr * tone.duration);
  const buffer = audioCtx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);
  const delay = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(delay);
  for (let i = 0; i < delay; i++) ring[i] = (Math.random() * 2 - 1) * tone.brightness;

  let idx = 0;
  let previous = 0;
  for (let i = 0; i < length; i++) {
    const current = ring[idx];
    const nextIdx = (idx + 1) % delay;
    const smooth = current * .47 + ring[nextIdx] * .53;
    ring[idx] = tone.decay * smooth;
    idx = nextIdx;

    const t = i / sr;
    const attackSamples = currentInstrument === 'acoustic' ? 150 : currentInstrument === 'classical' ? 90 : 120;
    const attackClick = i < attackSamples ? (Math.random() * 2 - 1) * (1 - i / attackSamples) * tone.attack : 0;
    const body = currentInstrument === 'bass' ? Math.sin(2 * Math.PI * freq * t) * .08 : 0;
    const sample = current * .78 + previous * .18 + body + attackClick;
    out[i] = Math.max(-1, Math.min(1, sample));
    previous = current;
  }
  return buffer;
}

function rebuildStringBuffers() {
  if (!audioCtx) return;
  const c = config();
  stringBuffers = c.freqs.map(freq => buildStringBuffer(freq, c.tone));
}

function updateModeUI() {
  modeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.playMode === currentPlayMode);
    if (btn.dataset.playMode === 'chord') btn.disabled = currentInstrument === 'bass';
  });
  chordBadge.classList.toggle('hidden', currentPlayMode !== 'chord');
  modeHelp.textContent = currentPlayMode === 'single'
    ? '單弦模式：弦距加寬，每根手指獨立判定；T=拇指、1=食指、2=中指、3=無名指、4=小指。'
    : '和弦模式：一隻手在前 1–3 格按弦，另一隻手在琴身附近刷弦。支援 C、G、D、E、Em、A、Am、Dm。';
}

function applyInstrumentTone() {
  const c = config();
  document.documentElement.style.setProperty('--accent', c.accent);
  toneLabel.textContent = c.toneLabel;
  driveSlider.value = String(c.drive);
  tuningText.textContent = `${c.icon} ${c.name}${c.names.length}弦：${c.names.join(' · ')}`;
  instrumentBadgeName.textContent = c.name;
  instrumentBadgeDetail.textContent = c.badge;
  instrumentButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.instrument === currentInstrument));
  updateModeUI();

  if (audioNodes && audioCtx) {
    const t = c.tone;
    audioNodes.preGain.gain.setTargetAtTime(t.pre, audioCtx.currentTime, .02);
    audioNodes.lowpass.frequency.setTargetAtTime(t.lowpass, audioCtx.currentTime, .02);
    audioNodes.highpass.frequency.setTargetAtTime(t.highpass, audioCtx.currentTime, .02);
    audioNodes.presence.frequency.setTargetAtTime(t.presenceFreq, audioCtx.currentTime, .02);
    audioNodes.presence.gain.setTargetAtTime(t.presenceGain, audioCtx.currentTime, .02);
    audioNodes.distortion.curve = makeDistortionCurve(Number(driveSlider.value) * t.distortionScale);
    rebuildStringBuffers();
  }
}

function switchInstrument(next) {
  if (!INSTRUMENTS[next] || next === currentInstrument) return;
  currentInstrument = next;
  if (currentInstrument === 'bass' && currentPlayMode === 'chord') currentPlayMode = 'single';
  resetTrackingState();
  pickSequence = [];
  patternText.textContent = '撥弦序列：—';
  applyInstrumentTone();
  if (cameraStream) setStatus(`已切換：${config().name} · ${currentPlayMode === 'single' ? '單弦精準' : '和弦按弦'}`, 'live');
  else drawIdleScene();
}

function switchPlayMode(next) {
  if (!['single', 'chord'].includes(next) || next === currentPlayMode) return;
  if (next === 'chord' && currentInstrument === 'bass') return;
  currentPlayMode = next;
  resetTrackingState();
  pickSequence = [];
  patternText.textContent = '撥弦序列：—';
  updateModeUI();
  if (cameraStream) setStatus(`${config().name} · ${next === 'single' ? '單弦精準模式' : '和弦按弦模式'}`, 'live');
  else drawIdleScene();
}

async function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  const preGain = audioCtx.createGain();
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  const distortion = audioCtx.createWaveShaper();
  distortion.oversample = '4x';
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass';
  const presence = audioCtx.createBiquadFilter();
  presence.type = 'peaking';
  masterGain = audioCtx.createGain();
  recordAudioDest = audioCtx.createMediaStreamDestination();

  preGain.connect(lowpass);
  lowpass.connect(distortion);
  distortion.connect(highpass);
  highpass.connect(presence);
  presence.connect(masterGain);
  masterGain.connect(audioCtx.destination);
  masterGain.connect(recordAudioDest);

  audioNodes = { preGain, lowpass, distortion, highpass, presence };
  masterGain.gain.value = Number(volumeSlider.value) / 100 * .55;
  applyInstrumentTone();
}

function rememberPick(fingerLabel) {
  if (!fingerLabel) return;
  pickSequence.push(fingerLabel);
  if (pickSequence.length > 12) pickSequence.shift();
  patternText.textContent = `撥弦序列：${pickSequence.join(' · ')}`;
}

function pluckString(index, strength = 1, fret = 0, fingerLabel = '') {
  if (!audioCtx || !audioNodes || !stringBuffers[index]) return;
  const nowMs = performance.now();
  const debounce = currentInstrument === 'bass' ? 86 : currentPlayMode === 'single' ? 58 : 62;
  if (nowMs - (lastPluckAt.get(index) || 0) < debounce) return;
  lastPluckAt.set(index, nowMs);
  activeStrings.set(index, { t: nowMs, fret });

  const src = audioCtx.createBufferSource();
  src.buffer = stringBuffers[index];
  src.playbackRate.value = Math.pow(2, Math.max(0, fret) / 12);
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(1.25, Math.max(.14, strength));
  src.connect(gain);
  gain.connect(audioNodes.preGain);
  src.start();
  rememberPick(fingerLabel);
}

async function initHandTracking() {
  if (handLandmarker) return;
  setStatus('載入高精度手部辨識模型…');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: .58,
    minHandPresenceConfidence: .58,
    minTrackingConfidence: .62
  });
}

async function startCamera() {
  try {
    startCameraBtn.disabled = true;
    await initAudio();
    await initHandTracking();
    setStatus('等待鏡頭授權…');

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, min: 30 } },
      audio: false
    });

    camera.srcObject = cameraStream;
    await camera.play();
    permissionOverlay.classList.add('hidden');
    recordBtn.disabled = !mp4MimeType;
    setStatus(`${config().name} · ${currentPlayMode === 'single' ? '單弦精準' : '和弦按弦'} · 手指追蹤中`, 'live');
    resizeCanvas();
    renderLoop();
  } catch (error) {
    console.error(error);
    startCameraBtn.disabled = false;
    setStatus(`啟動失敗：${error.message || error.name}`, 'error');
  }
}

function fretPosition(start, end, fretIndex) {
  const t = fretIndex / 12;
  return start + (end - start) * (1 - Math.pow(1 - t, 1.28));
}

function instrumentGeometry(w, h) {
  const count = config().names.length;
  const spacingScale = Number(stringSpacingSlider.value) / 100;
  const baseSpacing = count === 4 ? .050 : (currentPlayMode === 'single' ? .041 : .0355);
  const spacing = Math.max(13, h * baseSpacing * spacingScale);
  const centerY = h * .59;
  const yTop = centerY - spacing * (count - 1) / 2;
  const stringX1 = w * .24;
  const stringX2 = w * .91;
  const bodyX = w * .23;
  const bodyW = w * .20;
  const fretStart = bodyX + bodyW * .47;
  const fretLines = Array.from({ length: 7 }, (_, i) => fretPosition(fretStart, stringX2, i));
  return {
    count, stringX1, stringX2, spacing, yTop,
    stringYs: Array.from({ length: count }, (_, i) => yTop + i * spacing),
    bodyX, bodyY: centerY, bodyW, bodyH: h * .32,
    neckY: centerY, neckH: Math.max(spacing * (count + .4), h * .12),
    fretStart, fretLines,
    pluckX1: w * .18,
    pluckX2: fretStart + w * .018,
    fretX1: fretLines[0],
    fretX2: fretLines[4]
  };
}

function drawMirroredCamera() {
  const w = canvas.width, h = canvas.height;
  if (camera.readyState >= 2) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(camera, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, w, h);
  }
  const vignette = ctx.createRadialGradient(w * .5, h * .45, h * .18, w * .5, h * .45, h * .78);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.44)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function roundRect(c, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + width, y, x + width, y + height, r);
  c.arcTo(x + width, y + height, x, y + height, r);
  c.arcTo(x, y + height, x, y, r);
  c.arcTo(x, y, x + width, y, r); c.closePath();
}

function drawElectricBody(g, bass = false) {
  const { bodyX: cx, bodyY: cy, bodyW: bw, bodyH: bh } = g;
  ctx.beginPath();
  if (bass) {
    ctx.moveTo(cx - bw * .55, cy - bh * .10);
    ctx.bezierCurveTo(cx - bw * .95, cy - bh * .48, cx - bw * .50, cy - bh * .58, cx - bw * .12, cy - bh * .31);
    ctx.bezierCurveTo(cx + bw * .22, cy - bh * .56, cx + bw * .62, cy - bh * .35, cx + bw * .50, cy - bh * .02);
    ctx.bezierCurveTo(cx + bw * .55, cy + bh * .30, cx + bw * .10, cy + bh * .48, cx - bw * .12, cy + bh * .24);
    ctx.bezierCurveTo(cx - bw * .38, cy + bh * .54, cx - bw * .90, cy + bh * .30, cx - bw * .55, cy - bh * .10);
  } else {
    ctx.moveTo(cx - bw * .58, cy - bh * .08);
    ctx.lineTo(cx - bw * .95, cy - bh * .52); ctx.lineTo(cx - bw * .25, cy - bh * .32);
    ctx.lineTo(cx + bw * .05, cy - bh * .58); ctx.lineTo(cx + bw * .30, cy - bh * .18);
    ctx.lineTo(cx + bw * .58, cy - bh * .08); ctx.lineTo(cx + bw * .38, cy + bh * .14);
    ctx.lineTo(cx + bw * .10, cy + bh * .48); ctx.lineTo(cx - bw * .14, cy + bh * .18);
    ctx.lineTo(cx - bw * .72, cy + bh * .48); ctx.lineTo(cx - bw * .55, cy + bh * .10);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx - bw, cy - bh, cx + bw, cy + bh);
  if (bass) {
    grad.addColorStop(0, 'rgba(8,27,40,.98)'); grad.addColorStop(.48, 'rgba(12,74,110,.98)'); grad.addColorStop(1, 'rgba(2,9,15,.98)');
  } else {
    grad.addColorStop(0, 'rgba(18,18,22,.98)'); grad.addColorStop(.42, 'rgba(75,10,12,.98)'); grad.addColorStop(.72, 'rgba(20,20,24,.98)'); grad.addColorStop(1, 'rgba(2,2,3,.98)');
  }
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = Math.max(2, canvas.width * .0015); ctx.strokeStyle = config().accent; ctx.stroke();

  ctx.fillStyle = 'rgba(5,5,7,.94)';
  roundRect(ctx, cx - bw * .20, cy - bh * .15, bw * .42, bh * .10, 5); ctx.fill();
  roundRect(ctx, cx - bw * .10, cy + bh * .01, bw * .43, bh * .08, 5); ctx.fill();
  ctx.fillStyle = '#d4d4d8'; ctx.fillRect(cx + bw * .28, cy - bh * .12, bw * .025, bh * .28);
}

function drawWoodBody(g, classical = false) {
  const { bodyX: cx, bodyY: cy, bodyW: bw, bodyH: bh } = g;
  ctx.beginPath();
  ctx.moveTo(cx, cy - bh * .48);
  ctx.bezierCurveTo(cx - bw * .58, cy - bh * .56, cx - bw * .72, cy - bh * .22, cx - bw * .42, cy - bh * .04);
  ctx.bezierCurveTo(cx - bw * .94, cy + bh * .14, cx - bw * .68, cy + bh * .56, cx, cy + bh * .50);
  ctx.bezierCurveTo(cx + bw * .68, cy + bh * .56, cx + bw * .94, cy + bh * .14, cx + bw * .42, cy - bh * .04);
  ctx.bezierCurveTo(cx + bw * .72, cy - bh * .22, cx + bw * .58, cy - bh * .56, cx, cy - bh * .48);
  ctx.closePath();
  const wood = ctx.createRadialGradient(cx - bw * .2, cy - bh * .2, 5, cx, cy, bw);
  if (classical) {
    wood.addColorStop(0, '#e8c18b'); wood.addColorStop(.50, '#b9783f'); wood.addColorStop(1, '#5c321c');
  } else {
    wood.addColorStop(0, '#f4c56d'); wood.addColorStop(.48, '#b86b27'); wood.addColorStop(1, '#4a2613');
  }
  ctx.fillStyle = wood; ctx.fill();
  ctx.strokeStyle = classical ? '#f1d3a6' : '#e9a23b'; ctx.lineWidth = Math.max(2, canvas.width * .0014); ctx.stroke();

  ctx.beginPath(); ctx.arc(cx + bw * .02, cy - bh * .02, bw * .15, 0, Math.PI * 2);
  ctx.fillStyle = '#1c120d'; ctx.fill(); ctx.lineWidth = Math.max(2, bw * .015); ctx.strokeStyle = classical ? '#ead0a8' : '#d59b58'; ctx.stroke();
  ctx.fillStyle = '#4b2a17'; roundRect(ctx, cx + bw * .26, cy - bh * .10, bw * .045, bh * .22, 4); ctx.fill();
}

function drawPlayZones(g) {
  const h = canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  roundRect(ctx, g.pluckX1, g.yTop - g.spacing * .7, g.pluckX2 - g.pluckX1, g.spacing * (g.count - 1 + 1.4), 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.58)';
  ctx.font = `700 ${Math.max(10, h * .014)}px ui-sans-serif`;
  ctx.fillText(currentPlayMode === 'single' ? '精準撥弦區' : '刷弦區', g.pluckX1 + 8, g.yTop - g.spacing * .85);

  if (currentPlayMode === 'chord') {
    ctx.fillStyle = 'rgba(255,255,255,.026)';
    roundRect(ctx, g.fretX1, g.yTop - g.spacing * .65, g.fretX2 - g.fretX1, g.spacing * (g.count - 1 + 1.3), 8);
    ctx.fill();
    ctx.strokeStyle = config().accent;
    ctx.globalAlpha = .34;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.58)';
    ctx.fillText('按弦區 1–3 格', g.fretX1 + 8, g.yTop - g.spacing * .85);
  }
  ctx.restore();
}

function drawInstrument() {
  const w = canvas.width, h = canvas.height, c = config();
  const g = instrumentGeometry(w, h);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.78)'; ctx.shadowBlur = 24;

  const neckGrad = ctx.createLinearGradient(g.stringX1, 0, g.stringX2, 0);
  if (c.body === 'acoustic' || c.body === 'classical') {
    neckGrad.addColorStop(0, '#4c2d18'); neckGrad.addColorStop(1, '#8b5a34');
  } else {
    neckGrad.addColorStop(0, 'rgba(22,22,26,.98)'); neckGrad.addColorStop(1, 'rgba(58,42,31,.96)');
  }
  ctx.fillStyle = neckGrad;
  roundRect(ctx, g.bodyX + g.bodyW * .34, g.neckY - g.neckH / 2, g.stringX2 - (g.bodyX + g.bodyW * .29), g.neckH, 9); ctx.fill();

  if (c.body === 'electric') drawElectricBody(g, false);
  if (c.body === 'bass') drawElectricBody(g, true);
  if (c.body === 'acoustic') drawWoodBody(g, false);
  if (c.body === 'classical') drawWoodBody(g, true);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(1, h * .0012);
  for (let i = 0; i < 13; i++) {
    const x = fretPosition(g.fretStart, g.stringX2, i);
    ctx.beginPath(); ctx.moveTo(x, g.yTop - g.spacing * .5); ctx.lineTo(x, g.stringYs[g.stringYs.length - 1] + g.spacing * .5); ctx.stroke();
    if (i > 0 && i <= 4) {
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.font = `700 ${Math.max(9, h * .012)}px ui-monospace`;
      ctx.fillText(String(i), x - 4, g.yTop - g.spacing * .62);
    }
  }

  g.stringYs.forEach((y, i) => {
    const state = activeStrings.get(i);
    const age = performance.now() - (state?.t || -9999);
    const glow = age < 260 ? 1 - age / 260 : 0;
    ctx.beginPath(); ctx.moveTo(g.stringX1, y); ctx.lineTo(g.stringX2, y);
    ctx.lineWidth = Math.max(1.45, h * (.0015 + (g.count - 1 - i) * .0002));
    ctx.strokeStyle = glow > 0 ? c.accent : (c.body === 'classical' ? 'rgba(244,229,205,.92)' : 'rgba(235,235,240,.92)');
    ctx.shadowColor = glow > 0 ? c.accent : 'rgba(255,255,255,.15)'; ctx.shadowBlur = glow * 22; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.68)'; ctx.font = `${Math.max(12, h * .018)}px ui-monospace, monospace`;
    ctx.fillText(c.names[i], g.stringX2 + w * .008, y + h * .006);
  });

  drawPlayZones(g);
  ctx.restore();
  return g;
}

function smoothFinger(key, x, y) {
  const prev = fingerSmoothing.get(key);
  const alpha = currentPlayMode === 'single' ? .62 : .54;
  const next = prev
    ? { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha }
    : { x, y };
  fingerSmoothing.set(key, next);
  return next;
}

function nearestStringIndex(g, y) {
  let best = 0, bestDist = Infinity;
  g.stringYs.forEach((stringY, i) => {
    const d = Math.abs(y - stringY);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return { index: best, distance: bestDist };
}

function fretAtX(g, x) {
  for (let fret = 1; fret <= 4; fret++) {
    if (x >= g.fretLines[fret - 1] && x < g.fretLines[fret]) return fret;
  }
  return null;
}

function collectChordPresses(hands, g) {
  if (currentPlayMode !== 'chord' || g.count !== 6) return [];
  const presses = [];
  hands.forEach(hand => {
    FRET_FINGER_IDS.forEach(fingerId => {
      const p = hand.tips.get(fingerId);
      if (!p || p.x < g.fretX1 || p.x > g.fretX2) return;
      const nearest = nearestStringIndex(g, p.y);
      const fret = fretAtX(g, p.x);
      if (fret && nearest.distance <= g.spacing * .47) {
        presses.push({ stringIndex: nearest.index, fret, fingerId, x: p.x, y: p.y });
      }
    });
  });
  return presses;
}

function recognizeChord(presses, now) {
  if (currentPlayMode !== 'chord') return;
  const observed = new Set(presses.map(p => `${p.stringIndex}:${p.fret}`));
  let bestName = null;
  let bestScore = -Infinity;

  Object.entries(CHORDS).forEach(([name, chord]) => {
    const requiredKeys = chord.required.map(([s, f]) => `${s}:${f}`);
    const hits = requiredKeys.filter(k => observed.has(k)).length;
    const misses = requiredKeys.length - hits;
    if (misses > 0) return;
    const extras = [...observed].filter(k => !requiredKeys.includes(k)).length;
    const score = requiredKeys.length * 10 - extras * 2;
    if (score > bestScore) { bestScore = score; bestName = name; }
  });

  if (bestName) {
    lastChordSeenAt = now;
    if (chordCandidate !== bestName) {
      chordCandidate = bestName;
      chordCandidateSince = now;
    } else if (now - chordCandidateSince > 140) {
      activeChordName = bestName;
    }
  } else {
    chordCandidate = null;
    chordCandidateSince = 0;
    if (now - lastChordSeenAt > 340) activeChordName = null;
  }

  chordName.textContent = activeChordName || (bestName ? `${bestName}…` : '等待按弦');
  chordBadge.classList.toggle('locked', Boolean(activeChordName));
}

function drawChordPresses(presses, g) {
  if (currentPlayMode !== 'chord') return;
  presses.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, g.stringYs[p.stringIndex], Math.max(8, g.spacing * .22), 0, Math.PI * 2);
    ctx.fillStyle = config().accent;
    ctx.globalAlpha = .38;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
}

function fretForString(stringIndex) {
  if (currentPlayMode !== 'chord' || !activeChordName) return 0;
  const fret = CHORDS[activeChordName]?.frets?.[stringIndex];
  return fret == null ? null : fret;
}

function processPluck(key, fingerId, p, prev, g, now) {
  if (!prev) return;
  const inZone = p.x >= g.pluckX1 && p.x <= g.pluckX2;
  const prevInZone = prev.x >= g.pluckX1 - 8 && prev.x <= g.pluckX2 + 8;
  if (!inZone || !prevInZone) return;

  const dy = p.y - prev.y;
  const dt = Math.max(1, now - prev.t);
  const speed = Math.abs(dy) / dt * 16.67;
  const minMove = Math.max(2.5, canvas.height * .0043);
  if (Math.abs(dy) < minMove || speed < minMove) return;

  const deadBand = Math.max(2, g.spacing * .055);
  const crossed = [];
  g.stringYs.forEach((stringY, stringIndex) => {
    const a = prev.y - stringY;
    const b = p.y - stringY;
    const crossedWithHysteresis = (a < -deadBand && b > deadBand) || (a > deadBand && b < -deadBand);
    const crossedFast = (a < 0 && b >= 0) || (a > 0 && b <= 0);
    if (crossedWithHysteresis || (Math.abs(dy) > g.spacing * .18 && crossedFast)) {
      crossed.push({ stringIndex, stringY, midpointDistance: Math.abs((prev.y + p.y) * .5 - stringY) });
    }
  });
  if (!crossed.length) return;

  const fingerLabel = FINGER_LABELS[fingerId] || '';
  const strength = Math.min(1.18, .28 + Math.abs(dy) / (canvas.height * .045));

  if (currentPlayMode === 'single') {
    crossed.sort((a, b) => a.midpointDistance - b.midpointDistance);
    const target = crossed[0];
    pluckString(target.stringIndex, strength, 0, fingerLabel);
    return;
  }

  crossed.sort((a, b) => dy > 0 ? a.stringY - b.stringY : b.stringY - a.stringY);
  crossed.forEach((target, order) => {
    const fret = fretForString(target.stringIndex);
    if (fret == null) return;
    setTimeout(() => pluckString(target.stringIndex, strength * .94, fret, order === 0 ? fingerLabel : ''), order * 13);
  });
}

function drawHandsAndDetect(results, g) {
  const w = canvas.width, h = canvas.height, now = performance.now();
  const hands = [];
  const seenKeys = new Set();
  const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

  results.landmarks?.forEach((landmarks, handIndex) => {
    const handed = results.handedness?.[handIndex]?.[0]?.categoryName || `H${handIndex}`;
    const hand = { label: handed, points: new Map(), tips: new Map() };

    landmarks.forEach((lm, id) => {
      const rawX = (1 - lm.x) * w;
      const rawY = lm.y * h;
      const key = `${handed}-${id}`;
      const point = FINGERTIP_IDS.includes(id) ? smoothFinger(key, rawX, rawY) : { x: rawX, y: rawY };
      hand.points.set(id, point);
      if (FINGERTIP_IDS.includes(id)) hand.tips.set(id, point);
    });
    hands.push(hand);
  });

  const presses = collectChordPresses(hands, g);
  recognizeChord(presses, now);
  drawChordPresses(presses, g);

  hands.forEach(hand => {
    ctx.strokeStyle = 'rgba(245,158,11,.42)';
    ctx.lineWidth = Math.max(1, h * .0015);
    connections.forEach(([a,b]) => {
      const p1 = hand.points.get(a), p2 = hand.points.get(b);
      if (!p1 || !p2) return;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });

    FINGERTIP_IDS.forEach(fingerId => {
      const p = hand.tips.get(fingerId);
      if (!p) return;
      const key = `${hand.label}-${fingerId}`;
      const prev = handHistory.get(key);
      seenKeys.add(key);

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(7, h * .0095), 0, Math.PI * 2);
      ctx.fillStyle = fingerId === 4 ? 'rgba(96,210,255,.96)' : 'rgba(255,191,70,.96)';
      ctx.shadowColor = fingerId === 4 ? 'rgba(56,189,248,.9)' : 'rgba(245,158,11,.9)';
      ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#08080a';
      ctx.font = `900 ${Math.max(9, h * .012)}px ui-monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(FINGER_LABELS[fingerId], p.x, p.y + 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      processPluck(key, fingerId, p, prev, g, now);
      handHistory.set(key, { x: p.x, y: p.y, t: now });
    });
  });

  for (const key of handHistory.keys()) {
    if (!seenKeys.has(key) && now - handHistory.get(key).t > 420) handHistory.delete(key);
  }
}

function drawIdleScene() {
  resizeCanvas();
  drawMirroredCamera();
  drawInstrument();
}

function renderLoop() {
  resizeCanvas();
  drawMirroredCamera();
  const instrument = drawInstrument();
  if (handLandmarker && camera.readyState >= 2 && camera.currentTime !== lastVideoTime) {
    lastVideoTime = camera.currentTime;
    try {
      const results = handLandmarker.detectForVideo(camera, performance.now());
      drawHandsAndDetect(results, instrument);
    } catch (error) {
      console.warn('Hand detection frame skipped:', error);
    }
  }
  animationId = requestAnimationFrame(renderLoop);
}

function buildRecordingStream() {
  const videoStream = canvas.captureStream(30);
  const tracks = [...videoStream.getVideoTracks()];
  if (recordAudioDest?.stream?.getAudioTracks().length) tracks.push(recordAudioDest.stream.getAudioTracks()[0]);
  return new MediaStream(tracks);
}

function formatTimer(ms) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function startRecording() {
  if (!mp4MimeType) { alert('目前瀏覽器無法直接輸出 MP4/H.264。請改用最新版 Chrome 或 Edge。'); return; }
  if (mediaRecorder?.state === 'recording') return;
  recordChunks = [];
  try {
    mediaRecorder = new MediaRecorder(buildRecordingStream(), { mimeType: mp4MimeType, videoBitsPerSecond: 7_000_000, audioBitsPerSecond: 192_000 });
  } catch (error) { setStatus(`錄影啟動失敗：${error.message}`, 'error'); return; }

  mediaRecorder.ondataavailable = event => { if (event.data?.size) recordChunks.push(event.data); };
  mediaRecorder.onerror = event => { console.error('MediaRecorder error', event.error || event); setStatus('錄影發生錯誤', 'error'); };
  mediaRecorder.onstop = () => {
    clearInterval(timerInterval);
    const blob = new Blob(recordChunks, { type: mp4MimeType.split(';')[0] || 'video/mp4' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url; a.download = `virtual-${currentInstrument}-${stamp}.mp4`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    recordBadge.classList.add('hidden'); recordBtn.classList.remove('active'); recordBtn.disabled = false; stopBtn.disabled = true;
    setStatus('錄影完成 · MP4 已輸出', 'live');
  };

  mediaRecorder.start(1000); recordStartedAt = performance.now(); recordTimer.textContent = '00:00';
  recordBadge.classList.remove('hidden'); recordBtn.classList.add('active'); recordBtn.disabled = true; stopBtn.disabled = false;
  timerInterval = setInterval(() => { recordTimer.textContent = formatTimer(performance.now() - recordStartedAt); }, 250);
  setStatus(`正在錄製 ${config().name} · MP4 / H.264…`, 'live');
}

function stopRecording() { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); }

instrumentButtons.forEach(btn => btn.addEventListener('click', () => switchInstrument(btn.dataset.instrument)));
modeButtons.forEach(btn => btn.addEventListener('click', () => switchPlayMode(btn.dataset.playMode)));
driveSlider.addEventListener('input', () => {
  if (!audioNodes) return;
  audioNodes.distortion.curve = makeDistortionCurve(Number(driveSlider.value) * config().tone.distortionScale);
});
stringSpacingSlider.addEventListener('input', () => {
  resetTrackingState();
  if (!cameraStream) drawIdleScene();
});
volumeSlider.addEventListener('input', () => {
  if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(Number(volumeSlider.value) / 100 * .55, audioCtx.currentTime, .02);
});
startCameraBtn.addEventListener('click', startCamera);
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
fullscreenBtn.addEventListener('click', async () => {
  try { if (!document.fullscreenElement) await stage.requestFullscreen(); else await document.exitFullscreen(); }
  catch (e) { console.warn(e); }
});
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  cameraStream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
});

updateCodecStatus();
applyInstrumentTone();
updateModeUI();
drawIdleScene();
