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
const toneLabel = document.querySelector('#toneLabel');
const tuningText = document.querySelector('#tuningText');
const instrumentBadgeName = document.querySelector('#instrumentBadgeName');
const instrumentBadgeDetail = document.querySelector('#instrumentBadgeDetail');
const instrumentButtons = [...document.querySelectorAll('.instrument-btn')];

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FINGERTIP_IDS = [4, 8, 12, 16, 20];

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

let currentInstrument = 'electric';
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
let activeStrings = new Map();
let lastPluckAt = new Map();

function config() { return INSTRUMENTS[currentInstrument]; }

function setStatus(text, type = 'idle') {
  statusText.textContent = text;
  cameraDot.classList.toggle('live', type === 'live');
  cameraDot.classList.toggle('error', type === 'error');
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

function applyInstrumentTone() {
  const c = config();
  document.documentElement.style.setProperty('--accent', c.accent);
  toneLabel.textContent = c.toneLabel;
  driveSlider.value = String(c.drive);
  tuningText.textContent = `${c.icon} ${c.name}${c.names.length}弦：${c.names.join(' · ')}`;
  instrumentBadgeName.textContent = c.name;
  instrumentBadgeDetail.textContent = c.badge;
  instrumentButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.instrument === currentInstrument));

  if (audioNodes && audioCtx) {
    const t = c.tone;
    audioNodes.preGain.gain.setTargetAtTime(t.pre, audioCtx.currentTime, .02);
    audioNodes.lowpass.frequency.setTargetAtTime(t.lowpass, audioCtx.currentTime, .02);
    audioNodes.highpass.frequency.setTargetAtTime(t.highpass, audioCtx.currentTime, .02);
    audioNodes.presence.frequency.setTargetAtTime(t.presenceFreq, audioCtx.currentTime, .02);
    audioNodes.presence.gain.setTargetAtTime(t.presenceGain, audioCtx.currentTime, .02);
    const amount = Number(driveSlider.value) * t.distortionScale;
    audioNodes.distortion.curve = makeDistortionCurve(amount);
    rebuildStringBuffers();
  }
}

function switchInstrument(next) {
  if (!INSTRUMENTS[next] || next === currentInstrument) return;
  currentInstrument = next;
  handHistory.clear();
  activeStrings.clear();
  lastPluckAt.clear();
  applyInstrumentTone();
  if (cameraStream) setStatus(`已切換：${config().name} · 手指追蹤中`, 'live');
  else {
    drawMirroredCamera();
    drawInstrument();
  }
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

function pluckString(index, strength = 1) {
  if (!audioCtx || !audioNodes || !stringBuffers[index]) return;
  const nowMs = performance.now();
  const debounce = currentInstrument === 'bass' ? 90 : 68;
  if (nowMs - (lastPluckAt.get(index) || 0) < debounce) return;
  lastPluckAt.set(index, nowMs);
  activeStrings.set(index, nowMs);

  const src = audioCtx.createBufferSource();
  src.buffer = stringBuffers[index];
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(1.25, Math.max(.16, strength));
  src.connect(gain);
  gain.connect(audioNodes.preGain);
  src.start();
}

async function initHandTracking() {
  if (handLandmarker) return;
  setStatus('載入手部辨識模型…');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: .5,
    minHandPresenceConfidence: .5,
    minTrackingConfidence: .5
  });
}

async function startCamera() {
  try {
    startCameraBtn.disabled = true;
    await initAudio();
    await initHandTracking();
    setStatus('等待鏡頭授權…');

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } },
      audio: false
    });

    camera.srcObject = cameraStream;
    await camera.play();
    permissionOverlay.classList.add('hidden');
    recordBtn.disabled = !mp4MimeType;
    setStatus(`${config().name} · 鏡頭已開啟 · 手指追蹤中`, 'live');
    resizeCanvas();
    renderLoop();
  } catch (error) {
    console.error(error);
    startCameraBtn.disabled = false;
    setStatus(`啟動失敗：${error.message || error.name}`, 'error');
  }
}

function instrumentGeometry(w, h) {
  const count = config().names.length;
  const stringX1 = w * .24;
  const stringX2 = w * .91;
  const spacing = Math.max(12, h * (count === 4 ? .046 : .035));
  const centerY = h * .59;
  const yTop = centerY - spacing * (count - 1) / 2;
  return {
    count, stringX1, stringX2, spacing, yTop,
    stringYs: Array.from({ length: count }, (_, i) => yTop + i * spacing),
    bodyX: w * .23, bodyY: centerY, bodyW: w * .20, bodyH: h * .32,
    neckY: centerY, neckH: Math.max(spacing * (count + .4), h * .12)
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

  const fretStart = g.bodyX + g.bodyW * .47;
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(1, h * .0012);
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = fretStart + (g.stringX2 - fretStart) * (1 - Math.pow(1 - t, 1.28));
    ctx.beginPath(); ctx.moveTo(x, g.yTop - g.spacing * .5); ctx.lineTo(x, g.stringYs[g.stringYs.length - 1] + g.spacing * .5); ctx.stroke();
  }

  g.stringYs.forEach((y, i) => {
    const age = performance.now() - (activeStrings.get(i) || -9999);
    const glow = age < 260 ? 1 - age / 260 : 0;
    ctx.beginPath(); ctx.moveTo(g.stringX1, y); ctx.lineTo(g.stringX2, y);
    ctx.lineWidth = Math.max(1.35, h * (.0014 + (g.count - 1 - i) * .00018));
    ctx.strokeStyle = glow > 0 ? c.accent : (c.body === 'classical' ? 'rgba(244,229,205,.90)' : 'rgba(235,235,240,.90)');
    ctx.shadowColor = glow > 0 ? c.accent : 'rgba(255,255,255,.15)'; ctx.shadowBlur = glow * 22; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.66)'; ctx.font = `${Math.max(12, h * .018)}px ui-monospace, monospace`;
    ctx.fillText(c.names[i], g.stringX2 + w * .008, y + h * .006);
  });

  ctx.fillStyle = 'rgba(0,0,0,.44)';
  roundRect(ctx, g.stringX1, g.yTop - g.spacing * .95, (g.stringX2 - g.stringX1) * .30, g.spacing * .62, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.76)'; ctx.font = `700 ${Math.max(10, h * .015)}px ui-sans-serif`;
  ctx.fillText(`${c.name} · 手指跨過弦線 = 撥弦`, g.stringX1 + w * .01, g.yTop - g.spacing * .52);
  ctx.restore();
  return g;
}

function drawHandsAndDetect(results, instrument) {
  const w = canvas.width, h = canvas.height, now = performance.now();
  const seenKeys = new Set();
  results.landmarks?.forEach((landmarks, handIndex) => {
    const label = results.handedness?.[handIndex]?.[0]?.categoryName || `H${handIndex}`;
    ctx.strokeStyle = 'rgba(245,158,11,.42)'; ctx.fillStyle = 'rgba(255,214,120,.92)'; ctx.lineWidth = Math.max(1, h * .0015);
    const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    connections.forEach(([a,b]) => {
      const p1 = landmarks[a], p2 = landmarks[b];
      ctx.beginPath(); ctx.moveTo((1 - p1.x) * w, p1.y * h); ctx.lineTo((1 - p2.x) * w, p2.y * h); ctx.stroke();
    });

    FINGERTIP_IDS.forEach(fingerId => {
      const lm = landmarks[fingerId], x = (1 - lm.x) * w, y = lm.y * h;
      const key = `${label}-${fingerId}`; seenKeys.add(key); const prev = handHistory.get(key);
      ctx.beginPath(); ctx.arc(x, y, Math.max(5, h * .009), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,191,70,.95)'; ctx.shadowColor = 'rgba(245,158,11,.9)'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;

      if (prev && x >= instrument.stringX1 && x <= instrument.stringX2) {
        const dy = y - prev.y;
        const speed = Math.abs(dy) / Math.max(1, now - prev.t) * 16.67;
        if (Math.abs(dy) > h * .006 && speed > h * .006) {
          instrument.stringYs.forEach((stringY, stringIndex) => {
            const crossed = (prev.y < stringY && y >= stringY) || (prev.y > stringY && y <= stringY);
            if (crossed) pluckString(stringIndex, Math.min(1.15, .35 + Math.abs(dy) / (h * .05)));
          });
        }
      }
      handHistory.set(key, { x, y, t: now });
    });
  });
  for (const key of handHistory.keys()) if (!seenKeys.has(key) && now - handHistory.get(key).t > 500) handHistory.delete(key);
}

function renderLoop() {
  resizeCanvas(); drawMirroredCamera(); const instrument = drawInstrument();
  if (handLandmarker && camera.readyState >= 2 && camera.currentTime !== lastVideoTime) {
    lastVideoTime = camera.currentTime;
    try { drawHandsAndDetect(handLandmarker.detectForVideo(camera, performance.now()), instrument); }
    catch (error) { console.warn('Hand detection frame skipped:', error); }
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
driveSlider.addEventListener('input', () => {
  if (!audioNodes) return;
  audioNodes.distortion.curve = makeDistortionCurve(Number(driveSlider.value) * config().tone.distortionScale);
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
resizeCanvas();
drawMirroredCamera();
drawInstrument();
