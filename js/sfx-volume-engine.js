// Adjustable Style C sound effects with an independent 0–100% volume.
(() => {
  "use strict";

  if (typeof Audio !== "object" || !Audio) return;

  const VOLUME_KEY = "texasHoldemSfxVolumeV1";
  const activeSources = new Set();
  let ctx = null;
  let output = null;
  let noiseBuffer = null;
  let volume = readVolume();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readVolume() {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved === null) return 0.6;
      const value = Number(saved);
      return Number.isFinite(value) ? clamp(value, 0, 1) : 0.6;
    } catch (_) {
      return 0.6;
    }
  }

  function saveVolume() {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch (_) {
      // The current session still works when storage is unavailable.
    }
  }

  function getContext() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is not supported.");
      ctx = new AudioContextClass();
      output = ctx.createGain();
      output.gain.value = Math.max(0.0001, volume);
      output.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function rampOutput(duration = 0.12) {
    if (!ctx || !output) return;
    const now = ctx.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now);
    output.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + duration);
  }

  function track(source, nodes = []) {
    activeSources.add(source);
    source.addEventListener("ended", () => {
      activeSources.delete(source);
      [source, ...nodes].forEach(node => {
        try { node.disconnect(); } catch (_) {}
      });
    }, { once: true });
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function getNoiseBuffer(c) {
    if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function tone({
    freq = 440,
    endFreq = null,
    type = "sine",
    gain = 0.08,
    start = 0,
    duration = 0.12,
    attack = 0.004,
    detune = 0,
  } = {}) {
    try {
      const c = getContext();
      const now = c.currentTime + Math.max(0, start);
      const osc = c.createOscillator();
      const amp = c.createGain();
      osc.type = type;
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(attack, duration * 0.45));
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp);
      amp.connect(output);
      osc.start(now);
      osc.stop(now + duration + 0.025);
      track(osc, [amp]);
    } catch (error) {
      console.warn("SFX tone error:", error);
    }
  }

  function noise({
    gain = 0.05,
    start = 0,
    duration = 0.08,
    highpass = 500,
    lowpass = 7000,
    playbackRate = 1,
  } = {}) {
    try {
      const c = getContext();
      const now = c.currentTime + Math.max(0, start);
      const source = c.createBufferSource();
      const hp = c.createBiquadFilter();
      const lp = c.createBiquadFilter();
      const amp = c.createGain();
      source.buffer = getNoiseBuffer(c);
      source.playbackRate.value = clamp(playbackRate, 0.35, 3);
      hp.type = "highpass";
      hp.frequency.value = highpass;
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.003);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(hp);
      hp.connect(lp);
      lp.connect(amp);
      amp.connect(output);
      source.start(now, random(0, 0.7), duration + 0.03);
      source.stop(now + duration + 0.04);
      track(source, [hp, lp, amp]);
    } catch (error) {
      console.warn("SFX noise error:", error);
    }
  }

  function cardSlide(start = 0, strength = 1) {
    noise({ start, duration: 0.085, gain: 0.052 * strength, highpass: 850, lowpass: 6200, playbackRate: random(1.05, 1.35) });
    tone({ start: start + 0.012, freq: random(1050, 1320), endFreq: random(720, 880), type: "triangle", gain: 0.012 * strength, duration: 0.055 });
  }

  function ceramicChip(start = 0, strength = 1, pitch = 1) {
    tone({ start, freq: random(1350, 1650) * pitch, endFreq: random(850, 1050) * pitch, type: "triangle", gain: 0.034 * strength, attack: 0.001, duration: 0.048, detune: random(-16, 16) });
    noise({ start, duration: 0.025, gain: 0.012 * strength, highpass: 1700, lowpass: 9000, playbackRate: random(1.5, 2.2) });
  }

  function woodKnock(start = 0, strength = 1) {
    tone({ start, freq: 165, endFreq: 92, type: "sine", gain: 0.08 * strength, duration: 0.075, attack: 0.001 });
    tone({ start: start + 0.004, freq: 360, endFreq: 190, type: "triangle", gain: 0.025 * strength, duration: 0.045, attack: 0.001 });
  }

  function chipCascade({ count = 5, interval = 0.026, start = 0, strength = 1, rising = false } = {}) {
    for (let index = 0; index < count; index += 1) {
      const progress = count <= 1 ? 0 : index / (count - 1);
      ceramicChip(start + index * interval + random(0, 0.008), strength * random(0.72, 1), rising ? 0.85 + progress * 0.32 : random(0.88, 1.12));
    }
  }

  function chime(notes, { start = 0, interval = 0.075, strength = 1, duration = 0.42 } = {}) {
    notes.forEach((freq, index) => {
      tone({ start: start + index * interval, freq, type: "sine", gain: 0.055 * strength, duration, attack: 0.004 });
      tone({ start: start + index * interval, freq: freq * 2, type: "triangle", gain: 0.018 * strength, duration: duration * 0.72, attack: 0.003 });
    });
  }

  Object.assign(Audio, {
    deal() { cardSlide(0, 1); },
    streetDeal() { [0, 0.09, 0.18].forEach((delay, index) => cardSlide(delay, 0.95 - index * 0.05)); },
    chip() { ceramicChip(0, 0.92); ceramicChip(0.032, 0.68, 0.92); },
    check() { woodKnock(0, 0.78); woodKnock(0.105, 0.62); },
    fold() {
      noise({ duration: 0.18, gain: 0.058, highpass: 420, lowpass: 3300, playbackRate: 0.72 });
      tone({ start: 0.025, freq: 310, endFreq: 155, type: "triangle", gain: 0.022, duration: 0.18 });
    },
    raise() { woodKnock(0, 0.46); chipCascade({ count: 6, interval: 0.032, start: 0.045, strength: 0.92, rising: true }); },
    allIn() {
      tone({ freq: 96, endFreq: 43, type: "sine", gain: 0.16, duration: 0.32, attack: 0.002 });
      noise({ start: 0.012, duration: 0.11, gain: 0.055, highpass: 80, lowpass: 850, playbackRate: 0.7 });
      chipCascade({ count: 13, interval: 0.025, start: 0.055, strength: 1.06 });
      woodKnock(0.29, 0.58);
    },
    turn() { chime([659.25, 880], { interval: 0.09, strength: 0.72, duration: 0.28 }); },
    win() {
      chipCascade({ count: 7, interval: 0.024, strength: 0.72, rising: true });
      chime([523.25, 659.25, 783.99, 1046.5], { start: 0.12, interval: 0.085, duration: 0.5 });
    },
    unlock() {
      chime([783.99, 987.77, 1174.66, 1567.98], { interval: 0.07, strength: 0.92, duration: 0.46 });
      tone({ start: 0.24, freq: 2093, type: "sine", gain: 0.025, duration: 0.5 });
    },
    button() { tone({ freq: 690, endFreq: 520, type: "triangle", gain: 0.025, duration: 0.045, attack: 0.001 }); },
    setSfxVolume(value) {
      volume = clamp(Number(value) || 0, 0, 1);
      saveVolume();
      rampOutput();
      return volume;
    },
    getSfxVolume() { return volume; },
    cleanupSfx() {
      activeSources.forEach(source => {
        try { source.stop(); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
      });
      activeSources.clear();
    },
  });
})();
