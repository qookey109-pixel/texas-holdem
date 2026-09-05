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

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const STRING_FREQUENCIES = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
const STRING_NAMES = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
const FINGERTIP_IDS = [4, 8, 12, 16, 20];

let cameraStream = null;
let handLandmarker = null;
let lastVideoTime = -1;
let animationId = null;
let audioCtx = null;
let masterGain = null;
let distortion = null;
let recordAudioDest = null;
let stringBuffers = [];
let mediaRecorder = null;
let recordChunks = [];
let recordStartedAt = 0;
let timerInterval = null;
let mp4MimeType = '';
let handHistory = new Map();
let activeStrings = new Map();
let lastPluckAt = new Map();

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
  if (mp4MimeType) {
    codecText.textContent = `錄影：MP4 / H.264 優先 · ${mp4MimeType}`;
  } else {
    codecText.textContent = '此瀏覽器無法直接錄製 MP4/H.264；請使用最新版 Chrome / Edge';
  }
}

function makeDistortionCurve(amount = 72) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = i * 2 / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function buildKarplusStrongBuffer(freq, duration = 2.2) {
  const sr = audioCtx.sampleRate;
  const length = Math.floor(sr * duration);
  const buffer = audioCtx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);
  const delay = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(delay);
  for (let i = 0; i < delay; i++) ring[i] = Math.random() * 2 - 1;

  let idx = 0;
  let previous = 0;
  const decay = freq < 120 ? 0.9974 : freq < 220 ? 0.9968 : 0.9961;
  for (let i = 0; i < length; i++) {
    const current = ring[idx];
    const nextIdx = (idx + 1) % delay;
    const next = decay * 0.5 * (current + ring[nextIdx]);
    ring[idx] = next;
    idx = nextIdx;

    const t = i / sr;
    const attackClick = i < 120 ? (Math.random() * 2 - 1) * (1 - i / 120) * 0.24 : 0;
    const envelope = Math.exp(-t * (freq < 120 ? 1.1 : 1.55));
    const sample = (current * 0.83 + previous * 0.17) * envelope + attackClick;
    out[i] = Math.max(-1, Math.min(1, sample));
    previous = current;
  }
  return buffer;
}

async function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });

  const preGain = audioCtx.createGain();
  preGain.gain.value = 2.8;

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 6200;
  lowpass.Q.value = 0.65;

  distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(Number(driveSlider.value));
  distortion.oversample = '4x';

  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 70;
  highpass.Q.value = 0.7;

  const presence = audioCtx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2800;
  presence.Q.value = 0.85;
  presence.gain.value = 4.5;

  masterGain = audioCtx.createGain();
  masterGain.gain.value = Number(volumeSlider.value) / 100 * 0.55;
  recordAudioDest = audioCtx.createMediaStreamDestination();

  preGain.connect(lowpass);
  lowpass.connect(distortion);
  distortion.connect(highpass);
  highpass.connect(presence);
  presence.connect(masterGain);
  masterGain.connect(audioCtx.destination);
  masterGain.connect(recordAudioDest);

  window.__metalGuitarInput = preGain;
  stringBuffers = STRING_FREQUENCIES.map(f => buildKarplusStrongBuffer(f));
}

function pluckString(index, strength = 1) {
  if (!audioCtx || !window.__metalGuitarInput || !stringBuffers[index]) return;
  const nowMs = performance.now();
  if (nowMs - (lastPluckAt.get(index) || 0) < 72) return;
  lastPluckAt.set(index, nowMs);
  activeStrings.set(index, nowMs);

  const src = audioCtx.createBufferSource();
  src.buffer = stringBuffers[index];
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(1.25, Math.max(0.18, strength));
  src.connect(gain);
  gain.connect(window.__metalGuitarInput);
  src.start();
}

async function initHandTracking() {
  if (handLandmarker) return;
  setStatus('載入手部辨識模型…');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

async function startCamera() {
  try {
    startCameraBtn.disabled = true;
    await initAudio();
    await initHandTracking();
    setStatus('等待鏡頭授權…');

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    });

    camera.srcObject = cameraStream;
    await camera.play();
    permissionOverlay.classList.add('hidden');
    recordBtn.disabled = !mp4MimeType;
    setStatus('鏡頭已開啟 · 手指追蹤中', 'live');
    resizeCanvas();
    renderLoop();
  } catch (error) {
    console.error(error);
    startCameraBtn.disabled = false;
    setStatus(`啟動失敗：${error.message || error.name}`, 'error');
  }
}

function guitarGeometry(w, h) {
  const stringX1 = w * 0.24;
  const stringX2 = w * 0.91;
  const yTop = h * 0.50;
  const spacing = Math.max(10, h * 0.035);
  return {
    stringX1,
    stringX2,
    yTop,
    spacing,
    stringYs: Array.from({ length: 6 }, (_, i) => yTop + i * spacing),
    bodyX: w * 0.23,
    bodyY: yTop + spacing * 2.5,
    bodyW: w * 0.20,
    bodyH: h * 0.31,
    neckY: yTop + spacing * 2.5,
    neckH: spacing * 6.2
  };
}

function drawMirroredCamera() {
  const w = canvas.width;
  const h = canvas.height;
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
  const vignette = ctx.createRadialGradient(w * .5, h * .45, h * .18, w * .5, h * .45, h * .75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function drawGuitar() {
  const w = canvas.width;
  const h = canvas.height;
  const g = guitarGeometry(w, h);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 26;

  const neckGrad = ctx.createLinearGradient(g.stringX1, 0, g.stringX2, 0);
  neckGrad.addColorStop(0, 'rgba(22,22,26,.95)');
  neckGrad.addColorStop(1, 'rgba(52,40,31,.94)');
  ctx.fillStyle = neckGrad;
  roundRect(ctx, g.bodyX + g.bodyW * .35, g.neckY - g.neckH / 2, g.stringX2 - (g.bodyX + g.bodyW * .30), g.neckH, 9);
  ctx.fill();

  ctx.beginPath();
  const cx = g.bodyX;
  const cy = g.bodyY;
  const bw = g.bodyW;
  const bh = g.bodyH;
  ctx.moveTo(cx - bw * .58, cy - bh * .08);
  ctx.lineTo(cx - bw * .95, cy - bh * .52);
  ctx.lineTo(cx - bw * .25, cy - bh * .32);
  ctx.lineTo(cx + bw * .05, cy - bh * .58);
  ctx.lineTo(cx + bw * .30, cy - bh * .18);
  ctx.lineTo(cx + bw * .58, cy - bh * .08);
  ctx.lineTo(cx + bw * .38, cy + bh * .14);
  ctx.lineTo(cx + bw * .10, cy + bh * .48);
  ctx.lineTo(cx - bw * .14, cy + bh * .18);
  ctx.lineTo(cx - bw * .72, cy + bh * .48);
  ctx.lineTo(cx - bw * .55, cy + bh * .10);
  ctx.closePath();
  const bodyGrad = ctx.createLinearGradient(cx - bw, cy - bh, cx + bw, cy + bh);
  bodyGrad.addColorStop(0, 'rgba(18,18,22,.98)');
  bodyGrad.addColorStop(.42, 'rgba(75,10,12,.98)');
  bodyGrad.addColorStop(.72, 'rgba(20,20,24,.98)');
  bodyGrad.addColorStop(1, 'rgba(2,2,3,.98)');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(2, w * .0015);
  ctx.strokeStyle = 'rgba(239,68,68,.75)';
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(5,5,7,.96)';
  roundRect(ctx, cx - bw * .22, cy - bh * .17, bw * .42, bh * .11, 5); ctx.fill();
  roundRect(ctx, cx - bw * .12, cy + bh * .01, bw * .46, bh * .09, 5); ctx.fill();
  ctx.fillStyle = '#d4d4d8';
  ctx.fillRect(cx + bw * .28, cy - bh * .12, bw * .025, bh * .30);

  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = Math.max(1, h * .0012);
  const fretStart = g.bodyX + g.bodyW * .47;
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = fretStart + (g.stringX2 - fretStart) * (1 - Math.pow(1 - t, 1.28));
    ctx.beginPath();
    ctx.moveTo(x, g.yTop - g.spacing * .5);
    ctx.lineTo(x, g.yTop + g.spacing * 5.5);
    ctx.stroke();
  }

  g.stringYs.forEach((y, i) => {
    const age = performance.now() - (activeStrings.get(i) || -9999);
    const glow = age < 240 ? 1 - age / 240 : 0;
    ctx.beginPath();
    ctx.moveTo(g.stringX1, y);
    ctx.lineTo(g.stringX2, y);
    ctx.lineWidth = Math.max(1.3, h * (0.0014 + (5 - i) * .00018));
    ctx.strokeStyle = glow > 0 ? `rgba(255,90,70,${.55 + glow * .45})` : 'rgba(235,235,240,.88)';
    ctx.shadowColor = glow > 0 ? 'rgba(239,68,68,.95)' : 'rgba(255,255,255,.18)';
    ctx.shadowBlur = glow * 22;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = `${Math.max(12, h * .018)}px ui-monospace, monospace`;
    ctx.fillText(STRING_NAMES[i], g.stringX2 + w * .008, y + h * .006);
  });

  ctx.fillStyle = 'rgba(0,0,0,.42)';
  roundRect(ctx, g.stringX1, g.yTop - g.spacing * .85, (g.stringX2 - g.stringX1) * .28, g.spacing * .58, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = `700 ${Math.max(10, h * .015)}px ui-sans-serif`;
  ctx.fillText('手指跨過弦線 = 撥弦', g.stringX1 + w * .01, g.yTop - g.spacing * .45);

  ctx.restore();
  return g;
}

function roundRect(c, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + width, y, x + width, y + height, r);
  c.arcTo(x + width, y + height, x, y + height, r);
  c.arcTo(x, y + height, x, y, r);
  c.arcTo(x, y, x + width, y, r);
  c.closePath();
}

function drawHandsAndDetect(results, guitar) {
  const w = canvas.width;
  const h = canvas.height;
  const now = performance.now();
  const seenKeys = new Set();

  results.landmarks?.forEach((landmarks, handIndex) => {
    const label = results.handedness?.[handIndex]?.[0]?.categoryName || `H${handIndex}`;

    ctx.strokeStyle = 'rgba(245,158,11,.42)';
    ctx.fillStyle = 'rgba(255,214,120,.92)';
    ctx.lineWidth = Math.max(1, h * .0015);
    const connections = [
      [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17]
    ];
    connections.forEach(([a,b]) => {
      const p1 = landmarks[a], p2 = landmarks[b];
      ctx.beginPath();
      ctx.moveTo((1 - p1.x) * w, p1.y * h);
      ctx.lineTo((1 - p2.x) * w, p2.y * h);
      ctx.stroke();
    });

    FINGERTIP_IDS.forEach(fingerId => {
      const lm = landmarks[fingerId];
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      const key = `${label}-${fingerId}`;
      seenKeys.add(key);
      const prev = handHistory.get(key);

      ctx.beginPath();
      ctx.arc(x, y, Math.max(5, h * .009), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,191,70,.95)';
      ctx.shadowColor = 'rgba(245,158,11,.9)';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (prev && x >= guitar.stringX1 && x <= guitar.stringX2) {
        const dy = y - prev.y;
        const speed = Math.abs(dy) / Math.max(1, now - prev.t) * 16.67;
        if (Math.abs(dy) > h * .006 && speed > h * .006) {
          guitar.stringYs.forEach((stringY, stringIndex) => {
            const crossed = (prev.y < stringY && y >= stringY) || (prev.y > stringY && y <= stringY);
            if (crossed) {
              const strength = Math.min(1.15, 0.35 + Math.abs(dy) / (h * .05));
              pluckString(stringIndex, strength);
            }
          });
        }
      }
      handHistory.set(key, { x, y, t: now });
    });
  });

  for (const key of handHistory.keys()) {
    if (!seenKeys.has(key) && now - handHistory.get(key).t > 500) handHistory.delete(key);
  }
}

function renderLoop() {
  resizeCanvas();
  drawMirroredCamera();
  const guitar = drawGuitar();

  if (handLandmarker && camera.readyState >= 2 && camera.currentTime !== lastVideoTime) {
    lastVideoTime = camera.currentTime;
    try {
      const results = handLandmarker.detectForVideo(camera, performance.now());
      drawHandsAndDetect(results, guitar);
    } catch (error) {
      console.warn('Hand detection frame skipped:', error);
    }
  }

  animationId = requestAnimationFrame(renderLoop);
}

function buildRecordingStream() {
  const videoStream = canvas.captureStream(30);
  const tracks = [...videoStream.getVideoTracks()];
  if (recordAudioDest?.stream?.getAudioTracks().length) {
    tracks.push(recordAudioDest.stream.getAudioTracks()[0]);
  }
  return new MediaStream(tracks);
}

function formatTimer(ms) {
  const total = Math.floor(ms / 1000);
  const min = String(Math.floor(total / 60)).padStart(2, '0');
  const sec = String(total % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function startRecording() {
  if (!mp4MimeType) {
    alert('目前瀏覽器無法直接輸出 MP4/H.264。請改用最新版 Chrome 或 Edge。');
    return;
  }
  if (mediaRecorder?.state === 'recording') return;

  const stream = buildRecordingStream();
  recordChunks = [];
  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: mp4MimeType,
      videoBitsPerSecond: 7_000_000,
      audioBitsPerSecond: 192_000
    });
  } catch (error) {
    setStatus(`錄影啟動失敗：${error.message}`, 'error');
    return;
  }

  mediaRecorder.ondataavailable = event => {
    if (event.data?.size) recordChunks.push(event.data);
  };
  mediaRecorder.onerror = event => {
    console.error('MediaRecorder error', event.error || event);
    setStatus('錄影發生錯誤', 'error');
  };
  mediaRecorder.onstop = () => {
    clearInterval(timerInterval);
    const blob = new Blob(recordChunks, { type: mp4MimeType.split(';')[0] || 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `virtual-metal-guitar-${stamp}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    recordBadge.classList.add('hidden');
    recordBtn.classList.remove('active');
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus('錄影完成 · MP4 已輸出', 'live');
  };

  mediaRecorder.start(1000);
  recordStartedAt = performance.now();
  recordTimer.textContent = '00:00';
  recordBadge.classList.remove('hidden');
  recordBtn.classList.add('active');
  recordBtn.disabled = true;
  stopBtn.disabled = false;
  timerInterval = setInterval(() => {
    recordTimer.textContent = formatTimer(performance.now() - recordStartedAt);
  }, 250);
  setStatus('正在錄製 MP4 / H.264…', 'live');
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

driveSlider.addEventListener('input', () => {
  if (distortion) distortion.curve = makeDistortionCurve(Number(driveSlider.value));
});
volumeSlider.addEventListener('input', () => {
  if (masterGain) masterGain.gain.setTargetAtTime(Number(volumeSlider.value) / 100 * 0.55, audioCtx.currentTime, .02);
});
startCameraBtn.addEventListener('click', startCamera);
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
fullscreenBtn.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) { console.warn(e); }
});
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  cameraStream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
});

updateCodecStatus();
resizeCanvas();
drawMirroredCamera();
drawGuitar();
