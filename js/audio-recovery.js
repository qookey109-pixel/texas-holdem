// Stable single-context audio replacement for Safari and other autoplay-restricted browsers.
(() => {
  "use strict";

  if (typeof Audio !== "object" || !Audio) return;

  const SFX_KEY = "texasHoldemSfxVolumeV1";
  const BGM_KEY = "texasHoldemBgmVolumeV1";
  const BGM_ON_KEY = "texasHoldemBgmEnabledV1";
  const DEFAULT_VOLUME = 0.6;
  const BPM = 120;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;
  const LOOP_SECONDS = BAR * 4;

  try { Audio.stopBgm?.({ persist: false }); } catch (_) {}
  try { Audio.cleanup?.(); } catch (_) {}

  let ctx = null;
  let sfxBus = null;
  let bgmBus = null;
  let noiseBuffer = null;
  let loopBuffer = null;
  let loopSource = null;
  let stopTimer = null;
  let gestureReady = false;
  let sfxMuted = false;
  let sfxVolume = readNumber(SFX_KEY, DEFAULT_VOLUME);
  let bgmVolume = readNumber(BGM_KEY, DEFAULT_VOLUME);
  let bgmEnabled = readBoolean(BGM_ON_KEY, false);
  const activeSfx = new Set();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readNumber(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value = Number(raw);
      return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readBoolean(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw === "true";
    } catch (_) {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function getContext() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is not supported.");
      ctx = new AudioContextClass();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 16;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxMuted ? 0.0001 : Math.max(0.0001, sfxVolume);
      sfxBus.connect(compressor);

      bgmBus = ctx.createGain();
      bgmBus.gain.value = bgmEnabled ? Math.max(0.0001, bgmVolume) : 0.0001;
      bgmBus.connect(compressor);
    }
    return ctx;
  }

  async function resume() {
    gestureReady = true;
    try {
      const current = getContext();
      if (current.state === "suspended") await current.resume();
      return current.state === "running";
    } catch (error) {
      console.warn("Audio resume error:", error);
      return false;
    }
  }

  function ramp(bus, value, duration = 0.14) {
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, value), now + duration);
  }

  function track(source, nodes = []) {
    activeSfx.add(source);
    source.addEventListener("ended", () => {
      activeSfx.delete(source);
      [source, ...nodes].forEach(node => {
        try { node.disconnect(); } catch (_) {}
      });
    }, { once: true });
  }

  function tone(freq, duration = 0.1, gain = 0.05, options = {}) {
    if (!gestureReady && !ctx) return;
    try {
      const current = getContext();
      if (current.state === "suspended") current.resume().catch(() => {});
      const start = current.currentTime + (options.start || 0);
      const osc = current.createOscillator();
      const amp = current.createGain();
      osc.type = options.type || "triangle";
      osc.detune.value = options.detune || 0;
      osc.frequency.setValueAtTime(Math.max(20, freq), start);
      if (options.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), start + duration);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(options.attack || 0.003, duration * 0.4));
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp);
      amp.connect(sfxBus);
      osc.start(start);
      osc.stop(start + duration + 0.025);
      track(osc, [amp]);
    } catch (error) {
      console.warn("SFX tone error:", error);
    }
  }

  function noise(duration = 0.08, gain = 0.04, options = {}) {
    if (!gestureReady && !ctx) return;
    try {
      const current = getContext();
      if (current.state === "suspended") current.resume().catch(() => {});
      if (!noiseBuffer || noiseBuffer.sampleRate !== current.sampleRate) {
        noiseBuffer = current.createBuffer(1, current.sampleRate, current.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      }
      const start = current.currentTime + (options.start || 0);
      const source = current.createBufferSource();
      const hp = current.createBiquadFilter();
      const lp = current.createBiquadFilter();
      const amp = current.createGain();
      source.buffer = noiseBuffer;
      source.playbackRate.value = options.rate || 1;
      hp.type = "highpass";
      hp.frequency.value = options.highpass || 500;
      lp.type = "lowpass";
      lp.frequency.value = options.lowpass || 7000;
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.003);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(hp);
      hp.connect(lp);
      lp.connect(amp);
      amp.connect(sfxBus);
      source.start(start, Math.random() * 0.65, duration + 0.03);
      source.stop(start + duration + 0.04);
      track(source, [hp, lp, amp]);
    } catch (error) {
      console.warn("SFX noise error:", error);
    }
  }

  function card(start = 0, strength = 1) {
    noise(0.085, 0.052 * strength, { start, highpass: 850, lowpass: 6200, rate: 1.05 + Math.random() * 0.3 });
    tone(1100 + Math.random() * 220, 0.055, 0.012 * strength, { start: start + 0.012, endFreq: 760 + Math.random() * 100 });
  }

  function chipSound(start = 0, strength = 1, pitch = 1) {
    tone((1380 + Math.random() * 230) * pitch, 0.048, 0.034 * strength, { start, endFreq: (880 + Math.random() * 150) * pitch, detune: Math.random() * 30 - 15 });
    noise(0.025, 0.012 * strength, { start, highpass: 1700, lowpass: 9000, rate: 1.5 + Math.random() * 0.6 });
  }

  function knock(start = 0, strength = 1) {
    tone(165, 0.075, 0.08 * strength, { start, type: "sine", endFreq: 92 });
    tone(360, 0.045, 0.025 * strength, { start: start + 0.004, endFreq: 190 });
  }

  function chips(count, start = 0, rising = false) {
    for (let index = 0; index < count; index += 1) {
      chipSound(start + index * 0.027 + Math.random() * 0.006, 0.72 + Math.random() * 0.25, rising ? 0.86 + index / Math.max(1, count - 1) * 0.3 : 0.9 + Math.random() * 0.2);
    }
  }

  function chime(notes, start = 0) {
    notes.forEach((freq, index) => {
      tone(freq, 0.42, 0.05, { start: start + index * 0.08, type: "sine", attack: 0.004 });
      tone(freq * 2, 0.3, 0.016, { start: start + index * 0.08 });
    });
  }

  function midi(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function buildLoop() {
    const current = getContext();
    if (loopBuffer && loopBuffer.sampleRate === current.sampleRate) return loopBuffer;
    const rate = current.sampleRate;
    const frames = Math.ceil(LOOP_SECONDS * rate);
    const buffer = current.createBuffer(2, frames, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const chords = [[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,64]];
    const bass = [[48,55],[45,52],[41,48],[43,50]];
    const melody = [[76,79,81,79],[72,76,79,76],[69,72,76,74],[71,74,79,76]];
    let seed = 13579;

    for (let frame = 0; frame < frames; frame += 1) {
      const time = frame / rate;
      const barIndex = Math.min(3, Math.floor(time / BAR));
      const local = time - barIndex * BAR;
      const beatPos = local / BEAT;
      const beatIndex = Math.floor(beatPos) % 4;
      const beatPhase = beatPos - Math.floor(beatPos);
      const chordEnv = beatIndex % 2 === 0 ? Math.exp(-beatPhase * 5.2) : 0;
      const bassEnv = beatIndex % 2 === 0 ? Math.exp(-beatPhase * 4.2) : 0;
      const melodyIndex = Math.min(3, Math.floor(local / (BAR / 4)));
      const melodyPhase = (local % (BAR / 4)) / (BAR / 4);
      const melodyEnv = Math.sin(Math.PI * melodyPhase);
      const eighthPhase = (local / (BEAT / 2)) % 1;
      const shakerEnv = eighthPhase < 0.15 ? Math.pow(1 - eighthPhase / 0.15, 2.4) : 0;
      let chordSignal = 0;
      chords[barIndex].forEach((note, index) => {
        chordSignal += Math.sin(Math.PI * 2 * midi(note) * time + index * 0.3) * (0.021 - index * 0.0014);
      });
      const bassSignal = Math.sin(Math.PI * 2 * midi(bass[barIndex][beatIndex < 2 ? 0 : 1]) * time) * 0.067 * bassEnv;
      const melodySignal = Math.sin(Math.PI * 2 * midi(melody[barIndex][melodyIndex]) * time) * 0.025 * melodyEnv;
      seed = (seed * 16807) % 2147483647;
      const shaker = (((seed - 1) / 2147483646) * 2 - 1) * 0.008 * shakerEnv;
      const signal = chordSignal * chordEnv + bassSignal + melodySignal + shaker;
      const pan = melodyIndex % 2 ? 0.07 : -0.07;
      left[frame] = signal * (0.94 - pan);
      right[frame] = signal * (0.94 + pan);
    }

    const edge = Math.max(1, Math.floor(rate * 0.018));
    for (let frame = 0; frame < edge; frame += 1) {
      const fade = frame / edge;
      left[frame] *= fade;
      right[frame] *= fade;
      left[frames - 1 - frame] *= fade;
      right[frames - 1 - frame] *= fade;
    }
    loopBuffer = buffer;
    return loopBuffer;
  }

  function stopLoop() {
    clearTimeout(stopTimer);
    stopTimer = null;
    if (!loopSource) return;
    const source = loopSource;
    loopSource = null;
    source.onended = null;
    try { source.stop(); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
  }

  function ensureLoop() {
    const current = getContext();
    if (loopSource) return;
    const source = current.createBufferSource();
    source.buffer = buildLoop();
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = LOOP_SECONDS;
    source.connect(bgmBus);
    source.start();
    source.onended = () => {
      if (loopSource === source) loopSource = null;
      if (bgmEnabled && document.visibilityState !== "hidden") ensureLoop();
    };
    loopSource = source;
  }

  function startBgm({ persist = true } = {}) {
    bgmEnabled = true;
    if (persist) save(BGM_ON_KEY, true);
    resume().then(ok => {
      if (!ok || !bgmEnabled) return;
      ensureLoop();
      ramp(bgmBus, bgmVolume, 0.3);
    });
    return true;
  }

  function stopBgm({ persist = true } = {}) {
    bgmEnabled = false;
    if (persist) save(BGM_ON_KEY, false);
    ramp(bgmBus, 0.0001, 0.2);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stopLoop, 240);
    return false;
  }

  function cleanup() {
    activeSfx.forEach(source => {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    });
    activeSfx.clear();
  }

  Object.assign(Audio, {
    resume,
    deal() { card(); },
    streetDeal() { [0, 0.09, 0.18].forEach((delay, index) => card(delay, 0.95 - index * 0.05)); },
    chip() { chipSound(0, 0.92); chipSound(0.032, 0.68, 0.92); },
    check() { knock(0, 0.78); knock(0.105, 0.62); },
    fold() { noise(0.18, 0.058, { highpass: 420, lowpass: 3300, rate: 0.72 }); tone(310, 0.18, 0.022, { start: 0.025, endFreq: 155 }); },
    raise() { knock(0, 0.46); chips(6, 0.045, true); },
    allIn() { tone(96, 0.32, 0.16, { type: "sine", endFreq: 43 }); noise(0.11, 0.055, { start: 0.012, highpass: 80, lowpass: 850, rate: 0.7 }); chips(13, 0.055); knock(0.29, 0.58); },
    turn() { chime([659.25, 880]); },
    win() { chips(7, 0, true); chime([523.25, 659.25, 783.99, 1046.5], 0.12); },
    unlock() { chime([783.99, 987.77, 1174.66, 1567.98]); },
    button() { tone(690, 0.045, 0.025, { endFreq: 520 }); },
    startBgm,
    stopBgm,
    toggleBgm() { return bgmEnabled ? stopBgm() : startBgm(); },
    isBgmEnabled() { return bgmEnabled; },
    getBgmVolume() { return bgmVolume; },
    setBgmVolume(value) {
      bgmVolume = clamp(Number(value) || 0, 0, 1);
      save(BGM_KEY, bgmVolume);
      if (bgmEnabled) ramp(bgmBus, bgmVolume, 0.12);
      return bgmVolume;
    },
    getSfxVolume() { return sfxVolume; },
    setSfxVolume(value) {
      sfxVolume = clamp(Number(value) || 0, 0, 1);
      save(SFX_KEY, sfxVolume);
      ramp(sfxBus, sfxMuted ? 0.0001 : sfxVolume, 0.12);
      return sfxVolume;
    },
    setMuted(value) {
      sfxMuted = Boolean(value);
      ramp(sfxBus, sfxMuted ? 0.0001 : sfxVolume, 0.12);
      return sfxMuted;
    },
    cleanup,
    cleanupAll() { cleanup(); stopLoop(); },
  });

  function activate() {
    resume().then(() => {
      if (bgmEnabled && document.visibilityState !== "hidden") startBgm({ persist: false });
    });
  }

  document.addEventListener("pointerdown", activate, { once: true });
  document.addEventListener("keydown", activate, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && bgmEnabled) activate();
  });
})();
