// Continuous upbeat lounge BGM override.
// Keeps the existing Style C sound effects, but replaces the timer-based BGM
// with a real looping AudioBuffer so it cannot stop after one phrase.
(() => {
  "use strict";

  if (typeof Audio !== "object" || !Audio) return;

  const ENABLED_KEY = "texasHoldemBgmEnabledV1";
  const VOLUME_KEY = "texasHoldemBgmVolumeV1";
  const BPM = 120;
  const BEAT_SECONDS = 60 / BPM;
  const BAR_SECONDS = BEAT_SECONDS * 4;
  const LOOP_BARS = 8;
  const LOOP_SECONDS = BAR_SECONDS * LOOP_BARS;

  const oldStopBgm = typeof Audio.stopBgm === "function" ? Audio.stopBgm.bind(Audio) : null;
  const oldSetMuted = typeof Audio.setMuted === "function" ? Audio.setMuted.bind(Audio) : null;
  const oldCleanup = typeof Audio.cleanup === "function" ? Audio.cleanup.bind(Audio) : null;

  let ctx = null;
  let output = null;
  let loopBuffer = null;
  let loopSource = null;
  let stopTimer = null;
  let muted = false;
  let enabled = readEnabled();
  let volume = readVolume();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readEnabled() {
    try {
      return localStorage.getItem(ENABLED_KEY) === "true";
    } catch (_) {
      return false;
    }
  }

  function readVolume() {
    try {
      const value = Number(localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(value) ? clamp(value, 0, 1) : 0.34;
    } catch (_) {
      return 0.34;
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(ENABLED_KEY, String(enabled));
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch (_) {
      // The session still works when storage is blocked.
    }
  }

  function getContext() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is not supported.");
      ctx = new AudioContextClass();
      output = ctx.createGain();
      output.gain.value = 0.0001;
      output.connect(ctx.destination);
    }

    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function createLoopBuffer() {
    const c = getContext();
    if (loopBuffer && loopBuffer.sampleRate === c.sampleRate) return loopBuffer;

    const sampleRate = c.sampleRate;
    const frameCount = Math.ceil(LOOP_SECONDS * sampleRate);
    const buffer = c.createBuffer(2, frameCount, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let seed = 19790317;

    function random() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    function addTone(note, start, duration, gain, options = {}) {
      const {
        attack = 0.012,
        release = 0.16,
        pan = 0,
        warmth = 0.16,
        sparkle = 0.03,
      } = options;
      const frequency = midiToFrequency(note);
      const startFrame = Math.max(0, Math.floor(start * sampleRate));
      const endFrame = Math.min(frameCount, Math.ceil((start + duration) * sampleRate));
      const attackFrames = Math.max(1, Math.floor(attack * sampleRate));
      const releaseFrames = Math.max(1, Math.floor(release * sampleRate));
      const panValue = clamp(pan, -1, 1);
      const leftGain = Math.cos((panValue + 1) * Math.PI / 4);
      const rightGain = Math.sin((panValue + 1) * Math.PI / 4);

      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const localFrame = frame - startFrame;
        const remaining = endFrame - frame;
        const envelope = Math.min(1, localFrame / attackFrames, remaining / releaseFrames);
        const time = localFrame / sampleRate;
        const phase = Math.PI * 2 * frequency * time;
        const wave = Math.sin(phase)
          + warmth * Math.sin(phase * 2)
          + sparkle * Math.sin(phase * 3);
        const sample = wave * envelope * gain;
        left[frame] += sample * leftGain;
        right[frame] += sample * rightGain;
      }
    }

    function addShaker(start, gain = 0.0045, pan = 0) {
      const duration = 0.055;
      const startFrame = Math.max(0, Math.floor(start * sampleRate));
      const endFrame = Math.min(frameCount, Math.ceil((start + duration) * sampleRate));
      const panValue = clamp(pan, -1, 1);
      const leftGain = Math.cos((panValue + 1) * Math.PI / 4);
      const rightGain = Math.sin((panValue + 1) * Math.PI / 4);
      let previous = 0;

      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const progress = (frame - startFrame) / Math.max(1, endFrame - startFrame);
        const raw = random() * 2 - 1;
        const brightNoise = raw - previous * 0.72;
        previous = raw;
        const envelope = Math.pow(1 - progress, 2.6);
        const sample = brightNoise * envelope * gain;
        left[frame] += sample * leftGain;
        right[frame] += sample * rightGain;
      }
    }

    function addSoftClick(start, pan = 0) {
      addTone(84, start, 0.045, 0.0048, {
        attack: 0.002,
        release: 0.038,
        pan,
        warmth: 0.04,
        sparkle: 0.02,
      });
    }

    const bars = [
      { chord: [60, 64, 67, 71], bass: [48, 55], melody: [76, 79, 81, 79] }, // Cmaj7
      { chord: [59, 62, 64, 67], bass: [47, 55], melody: [74, 76, 79, 76] }, // G6/B
      { chord: [57, 60, 64, 67], bass: [45, 52], melody: [72, 76, 81, 79] }, // Am7
      { chord: [52, 55, 59, 62], bass: [40, 47], melody: [71, 74, 76, 74] }, // Em7
      { chord: [53, 57, 60, 64], bass: [41, 48], melody: [69, 72, 76, 74] }, // Fmaj7
      { chord: [52, 55, 60, 64], bass: [40, 48], melody: [67, 72, 76, 79] }, // C/E
      { chord: [50, 53, 57, 60], bass: [38, 45], melody: [69, 72, 77, 76] }, // Dm7
      { chord: [55, 59, 62, 64], bass: [43, 50], melody: [71, 74, 79, 76] }, // G6
    ];

    bars.forEach((bar, barIndex) => {
      const barStart = barIndex * BAR_SECONDS;

      // Warm bass on beats one and three.
      addTone(bar.bass[0], barStart, 0.72, 0.033, {
        attack: 0.018,
        release: 0.22,
        pan: -0.06,
        warmth: 0.08,
        sparkle: 0,
      });
      addTone(bar.bass[1], barStart + BEAT_SECONDS * 2, 0.62, 0.026, {
        attack: 0.015,
        release: 0.2,
        pan: -0.04,
        warmth: 0.08,
        sparkle: 0,
      });

      // Two short, buoyant chord pulses per bar.
      [0, 2].forEach((beatOffset, pulseIndex) => {
        bar.chord.forEach((note, noteIndex) => {
          addTone(note, barStart + BEAT_SECONDS * beatOffset + noteIndex * 0.012, 0.82, 0.0105, {
            attack: 0.03,
            release: 0.24,
            pan: (noteIndex - 1.5) * 0.16,
            warmth: pulseIndex ? 0.12 : 0.18,
            sparkle: 0.018,
          });
        });
      });

      // A simple cheerful motif with room for the poker sound effects.
      bar.melody.forEach((note, noteIndex) => {
        const start = barStart + BEAT_SECONDS * (0.5 + noteIndex * 0.75);
        addTone(note, start, 0.29, 0.0145, {
          attack: 0.006,
          release: 0.13,
          pan: noteIndex % 2 ? 0.2 : -0.16,
          warmth: 0.1,
          sparkle: 0.08,
        });
      });

      // Light café-style pulse: soft shaker eighth notes and wood-like clicks.
      for (let eighth = 0; eighth < 8; eighth += 1) {
        addShaker(barStart + eighth * BEAT_SECONDS / 2, eighth % 2 ? 0.0048 : 0.0034, eighth % 2 ? 0.2 : -0.15);
      }
      addSoftClick(barStart + BEAT_SECONDS, -0.1);
      addSoftClick(barStart + BEAT_SECONDS * 3, 0.1);
    });

    // Prevent clicks at the exact loop boundary.
    const edgeFrames = Math.max(1, Math.floor(sampleRate * 0.012));
    for (let frame = 0; frame < edgeFrames; frame += 1) {
      const fadeIn = frame / edgeFrames;
      const fadeOut = (edgeFrames - frame) / edgeFrames;
      left[frame] *= fadeIn;
      right[frame] *= fadeIn;
      left[frameCount - 1 - frame] *= fadeOut;
      right[frameCount - 1 - frame] *= fadeOut;
    }

    let peak = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
    }
    const normalise = peak > 0.72 ? 0.72 / peak : 1;
    if (normalise < 1) {
      for (let frame = 0; frame < frameCount; frame += 1) {
        left[frame] *= normalise;
        right[frame] *= normalise;
      }
    }

    loopBuffer = buffer;
    return loopBuffer;
  }

  function targetGain() {
    return enabled && !muted ? Math.max(0.0001, volume) : 0.0001;
  }

  function rampOutput(duration = 0.22) {
    if (!ctx || !output) return;
    const now = ctx.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now);
    output.gain.exponentialRampToValueAtTime(targetGain(), now + duration);
  }

  function stopSource() {
    clearTimeout(stopTimer);
    stopTimer = null;
    if (!loopSource) return;
    const source = loopSource;
    loopSource = null;
    source.onended = null;
    try { source.stop(); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
  }

  function ensureSource() {
    const c = getContext();
    if (loopSource) return;

    const source = c.createBufferSource();
    source.buffer = createLoopBuffer();
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = LOOP_SECONDS;
    source.connect(output);
    source.onended = () => {
      if (loopSource === source) loopSource = null;
      if (enabled && document.visibilityState !== "hidden") ensureSource();
    };
    source.start();
    loopSource = source;
  }

  function startBgm({ persist = true } = {}) {
    clearTimeout(stopTimer);
    stopTimer = null;
    enabled = true;
    if (persist) savePreferences();

    try {
      ensureSource();
      rampOutput(0.38);
    } catch (error) {
      console.warn("Continuous BGM error:", error);
    }
    return enabled;
  }

  function stopBgm({ persist = true } = {}) {
    enabled = false;
    if (persist) savePreferences();
    rampOutput(0.24);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stopSource, 280);
    return enabled;
  }

  function setBgmVolume(value) {
    volume = clamp(Number(value) || 0, 0, 1);
    savePreferences();
    rampOutput(0.12);
    return volume;
  }

  function setMuted(value) {
    muted = Boolean(value);
    rampOutput(0.14);
    return muted;
  }

  // Stop the older timer-based phrase scheduler without changing the saved setting.
  try {
    oldStopBgm?.({ persist: false });
  } catch (_) {
    // The replacement can still run if the older engine was not initialized.
  }

  Audio.startBgm = startBgm;
  Audio.stopBgm = stopBgm;
  Audio.toggleBgm = () => (enabled ? stopBgm() : startBgm());
  Audio.isBgmEnabled = () => enabled;
  Audio.getBgmVolume = () => volume;
  Audio.setBgmVolume = setBgmVolume;
  Audio.setMuted = value => {
    const result = oldSetMuted ? oldSetMuted(value) : Boolean(value);
    setMuted(value);
    return result;
  };
  Audio.cleanup = () => {
    stopSource();
    oldCleanup?.();
  };

  function updatePreviewCopy() {
    const description = document.querySelector("#audioPreviewPanelC .audio-preview-head-c span");
    if (description) {
      description.textContent = "牌桌音效保留寫實感；背景改成較輕快的咖啡館 Lounge，會持續循環播放。";
    }

    const note = document.querySelector("#audioPreviewPanelC .audio-preview-note-c");
    if (note) {
      note.textContent = "BGM 已改成真正的循環音軌，不會在 16 秒後停止；仍然不使用外部歌曲或大型音檔。";
    }
  }

  function resumeSavedMusic() {
    if (!enabled || muted || document.visibilityState === "hidden") return;
    startBgm({ persist: false });
  }

  const installCopy = () => setTimeout(updatePreviewCopy, 0);
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", installCopy, { once: true })
    : installCopy();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeSavedMusic();
  });
  document.addEventListener("pointerdown", resumeSavedMusic, { once: true });
  document.addEventListener("keydown", resumeSavedMusic, { once: true });
})();