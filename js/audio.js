// Audio engine — Style C: realistic poker table + playful victory cues + relaxed lounge BGM.
const Audio = (() => {
  let ctx = null;
  let compressor = null;
  let master = null;
  let bgmBus = null;
  let noiseBuffer = null;
  let bgmTimer = null;
  let muted = false;
  let bgmEnabled = readBgmEnabled();
  let bgmVolume = readBgmVolume();

  const activeSources = new Set();
  const activeBgmSources = new Set();

  const BGM_ENABLED_KEY = "texasHoldemBgmEnabledV1";
  const BGM_VOLUME_KEY = "texasHoldemBgmVolumeV1";
  const SFX_LEVEL = 0.78;
  const BGM_PHRASE_SECONDS = 16;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const random = (min, max) => min + Math.random() * (max - min);

  function readBgmEnabled() {
    try { return localStorage.getItem("texasHoldemBgmEnabledV1") === "true"; }
    catch (_) { return false; }
  }

  function readBgmVolume() {
    try {
      const value = Number(localStorage.getItem("texasHoldemBgmVolumeV1"));
      return Number.isFinite(value) ? clamp(value, 0, 1) : 0.34;
    } catch (_) {
      return 0.34;
    }
  }

  function saveBgmPreference() {
    try {
      localStorage.setItem(BGM_ENABLED_KEY, String(bgmEnabled));
      localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume));
    } catch (_) {
      // Audio still works when storage is unavailable.
    }
  }

  function getCtx() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is not supported.");
      ctx = new AudioContextClass();

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      compressor.connect(ctx.destination);

      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : SFX_LEVEL;
      master.connect(compressor);

      bgmBus = ctx.createGain();
      bgmBus.gain.value = muted || !bgmEnabled ? 0.0001 : bgmVolume;
      bgmBus.connect(compressor);
    }

    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function rampGain(node, value, duration = 0.18) {
    if (!ctx || !node) return;
    const now = ctx.currentTime;
    const target = Math.max(0.0001, value);
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), now);
    node.gain.exponentialRampToValueAtTime(target, now + duration);
  }

  function trackSource(source, extraNodes = [], sourceSet = activeSources) {
    sourceSet.add(source);
    source.addEventListener("ended", () => {
      sourceSet.delete(source);
      [source, ...extraNodes].forEach(node => {
        try { node.disconnect(); } catch (_) {}
      });
    }, { once: true });
  }

  function getNoiseBuffer(c) {
    if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
    const length = c.sampleRate;
    noiseBuffer = c.createBuffer(1, length, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
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
      const c = getCtx();
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
      amp.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      trackSource(osc, [amp]);
    } catch (error) {
      console.warn("Audio tone error:", error);
    }
  }

  function noise({
    gain = 0.05,
    start = 0,
    duration = 0.08,
    attack = 0.002,
    highpass = 500,
    lowpass = 7000,
    playbackRate = 1,
  } = {}) {
    try {
      const c = getCtx();
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
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(attack, duration * 0.35));
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(hp);
      hp.connect(lp);
      lp.connect(amp);
      amp.connect(master);
      source.start(now, random(0, 0.7), duration + 0.03);
      source.stop(now + duration + 0.04);
      trackSource(source, [hp, lp, amp]);
    } catch (error) {
      console.warn("Audio noise error:", error);
    }
  }

  function cardSlide(start = 0, strength = 1) {
    noise({
      start,
      duration: 0.085,
      gain: 0.052 * strength,
      highpass: 850,
      lowpass: 6200,
      playbackRate: random(1.05, 1.35),
    });
    tone({
      start: start + 0.012,
      freq: random(1050, 1320),
      endFreq: random(720, 880),
      type: "triangle",
      gain: 0.012 * strength,
      duration: 0.055,
    });
  }

  function ceramicChip(start = 0, strength = 1, pitch = 1) {
    tone({
      start,
      freq: random(1350, 1650) * pitch,
      endFreq: random(850, 1050) * pitch,
      type: "triangle",
      gain: 0.034 * strength,
      attack: 0.001,
      duration: 0.048,
      detune: random(-16, 16),
    });
    noise({
      start,
      duration: 0.025,
      gain: 0.012 * strength,
      highpass: 1700,
      lowpass: 9000,
      playbackRate: random(1.5, 2.2),
    });
  }

  function woodKnock(start = 0, strength = 1) {
    tone({ start, freq: 165, endFreq: 92, type: "sine", gain: 0.08 * strength, duration: 0.075, attack: 0.001 });
    tone({ start: start + 0.004, freq: 360, endFreq: 190, type: "triangle", gain: 0.025 * strength, duration: 0.045, attack: 0.001 });
  }

  function chipCascade({ count = 5, interval = 0.026, start = 0, strength = 1, rising = false } = {}) {
    for (let i = 0; i < count; i += 1) {
      const progress = count <= 1 ? 0 : i / (count - 1);
      ceramicChip(
        start + i * interval + random(0, 0.008),
        strength * random(0.72, 1),
        rising ? 0.85 + progress * 0.32 : random(0.88, 1.12),
      );
    }
  }

  function chimeSequence(notes, { start = 0, interval = 0.075, strength = 1, duration = 0.42 } = {}) {
    notes.forEach((freq, index) => {
      tone({ start: start + index * interval, freq, type: "sine", gain: 0.055 * strength, duration, attack: 0.004 });
      tone({ start: start + index * interval, freq: freq * 2, type: "triangle", gain: 0.018 * strength, duration: duration * 0.72, attack: 0.003 });
    });
  }

  function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function bgmVoice(note, {
    start = 0,
    duration = 3.6,
    gain = 0.018,
    type = "triangle",
    attack = 0.35,
    filter = 1450,
    detune = 0,
  } = {}) {
    try {
      const c = getCtx();
      const now = c.currentTime + Math.max(0, start);
      const osc = c.createOscillator();
      const lowpass = c.createBiquadFilter();
      const amp = c.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(midiToFrequency(note), now);
      osc.detune.value = detune;
      lowpass.type = "lowpass";
      lowpass.frequency.value = filter;
      lowpass.Q.value = 0.55;

      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(attack, duration * 0.3));
      amp.gain.setValueAtTime(Math.max(0.0002, gain * 0.72), now + Math.max(attack, duration - 0.75));
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(lowpass);
      lowpass.connect(amp);
      amp.connect(bgmBus);
      osc.start(now);
      osc.stop(now + duration + 0.04);
      trackSource(osc, [lowpass, amp], activeBgmSources);
    } catch (error) {
      console.warn("Audio BGM voice error:", error);
    }
  }

  function scheduleBgmPhrase() {
    if (!bgmEnabled) return;

    const progression = [
      { bass: 48, chord: [60, 64, 67, 71], melody: [76, 74] }, // Cmaj7
      { bass: 45, chord: [57, 60, 64, 67], melody: [72, 76] }, // Am7
      { bass: 41, chord: [53, 57, 60, 64], melody: [69, 67] }, // Fmaj7
      { bass: 43, chord: [55, 59, 62, 64], melody: [71, 74] }, // G6
    ];

    progression.forEach((section, sectionIndex) => {
      const start = sectionIndex * 4;

      bgmVoice(section.bass, {
        start,
        duration: 3.75,
        gain: 0.024,
        type: "sine",
        attack: 0.22,
        filter: 420,
      });

      section.chord.forEach((note, noteIndex) => {
        bgmVoice(note, {
          start: start + noteIndex * 0.035,
          duration: 3.65,
          gain: 0.0115,
          type: noteIndex % 2 ? "sine" : "triangle",
          attack: 0.42,
          filter: 1250,
          detune: noteIndex % 2 ? -4 : 4,
        });
      });

      section.melody.forEach((note, noteIndex) => {
        bgmVoice(note, {
          start: start + 1.05 + noteIndex * 1.45,
          duration: 1.55,
          gain: 0.009,
          type: "sine",
          attack: 0.11,
          filter: 1850,
        });
      });
    });

    clearTimeout(bgmTimer);
    bgmTimer = setTimeout(scheduleBgmPhrase, (BGM_PHRASE_SECONDS - 0.4) * 1000);
  }

  function stopBgmSources() {
    clearTimeout(bgmTimer);
    bgmTimer = null;
    activeBgmSources.forEach(source => {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    });
    activeBgmSources.clear();
  }

  function startBgm({ persist = true } = {}) {
    bgmEnabled = true;
    getCtx();
    rampGain(bgmBus, muted ? 0.0001 : bgmVolume, 0.45);
    if (!bgmTimer && activeBgmSources.size === 0) scheduleBgmPhrase();
    if (persist) saveBgmPreference();
    return bgmEnabled;
  }

  function stopBgm({ persist = true } = {}) {
    bgmEnabled = false;
    if (bgmBus) rampGain(bgmBus, 0.0001, 0.35);
    setTimeout(stopBgmSources, 380);
    if (persist) saveBgmPreference();
    return bgmEnabled;
  }

  function setBgmVolume(value) {
    bgmVolume = clamp(Number(value) || 0, 0, 1);
    if (bgmBus && bgmEnabled && !muted) rampGain(bgmBus, bgmVolume, 0.12);
    saveBgmPreference();
    return bgmVolume;
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (!ctx) return muted;
    rampGain(master, muted ? 0.0001 : SFX_LEVEL, 0.12);
    rampGain(bgmBus, muted || !bgmEnabled ? 0.0001 : bgmVolume, 0.18);
    return muted;
  }

  const api = {
    deal() {
      cardSlide(0, 1);
    },

    streetDeal() {
      [0, 0.09, 0.18].forEach((delay, index) => cardSlide(delay, 0.95 - index * 0.05));
    },

    chip() {
      ceramicChip(0, 0.92);
      ceramicChip(0.032, 0.68, 0.92);
    },

    check() {
      woodKnock(0, 0.78);
      woodKnock(0.105, 0.62);
    },

    fold() {
      noise({ duration: 0.18, gain: 0.058, highpass: 420, lowpass: 3300, playbackRate: 0.72 });
      tone({ start: 0.025, freq: 310, endFreq: 155, type: "triangle", gain: 0.022, duration: 0.18 });
    },

    raise() {
      woodKnock(0, 0.46);
      chipCascade({ count: 6, interval: 0.032, start: 0.045, strength: 0.92, rising: true });
    },

    allIn() {
      tone({ freq: 96, endFreq: 43, type: "sine", gain: 0.16, duration: 0.32, attack: 0.002 });
      noise({ start: 0.012, duration: 0.11, gain: 0.055, highpass: 80, lowpass: 850, playbackRate: 0.7 });
      chipCascade({ count: 13, interval: 0.025, start: 0.055, strength: 1.06, rising: false });
      woodKnock(0.29, 0.58);
    },

    turn() {
      chimeSequence([659.25, 880], { interval: 0.09, strength: 0.72, duration: 0.28 });
    },

    win() {
      chipCascade({ count: 7, interval: 0.024, start: 0, strength: 0.72, rising: true });
      chimeSequence([523.25, 659.25, 783.99, 1046.5], { start: 0.12, interval: 0.085, strength: 1, duration: 0.5 });
    },

    unlock() {
      chimeSequence([783.99, 987.77, 1174.66, 1567.98], { interval: 0.07, strength: 0.92, duration: 0.46 });
      tone({ start: 0.24, freq: 2093, type: "sine", gain: 0.025, duration: 0.5, attack: 0.004 });
    },

    button() {
      tone({ freq: 690, endFreq: 520, type: "triangle", gain: 0.025, duration: 0.045, attack: 0.001 });
    },

    startBgm,
    stopBgm,
    toggleBgm() {
      return bgmEnabled ? stopBgm() : startBgm();
    },
    isBgmEnabled() {
      return bgmEnabled;
    },
    getBgmVolume() {
      return bgmVolume;
    },
    setBgmVolume,
    setMuted,

    preview(name) {
      if (typeof api[name] === "function" && !["preview", "cleanup", "startBgm", "stopBgm", "toggleBgm"].includes(name)) api[name]();
    },

    cleanup() {
      stopBgmSources();
      activeSources.forEach(source => {
        try { source.stop(); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
      });
      activeSources.clear();
    },
  };

  return api;
})();

// Temporary listening panel for the Style C prototype.
(() => {
  const panelId = "audioPreviewPanelC";

  function closePanel() {
    const panel = document.querySelector(`#${panelId}`);
    const trigger = document.querySelector("#audioPreviewButtonC");
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function syncBgmControls() {
    const button = document.querySelector("#bgmToggleButtonC");
    const slider = document.querySelector("#bgmVolumeC");
    const enabled = Audio.isBgmEnabled();

    if (button) {
      button.textContent = enabled ? "⏸ 停止輕鬆 BGM" : "🎵 播放輕鬆 BGM";
      button.classList.toggle("is-playing", enabled);
      button.setAttribute("aria-pressed", String(enabled));
    }

    if (slider) slider.value = String(Math.round(Audio.getBgmVolume() * 100));
  }

  function installPreview() {
    const muteButton = document.querySelector("#muteButton");
    if (!muteButton || document.querySelector("#audioPreviewButtonC")) return;

    const style = document.createElement("style");
    style.id = "audioPreviewStylesC";
    style.textContent = `
      #audioPreviewButtonC[aria-expanded="true"] { border-color: rgba(240,194,94,.58); color: var(--gold); background: rgba(240,194,94,.12); }
      .audio-preview-panel-c { position: fixed; z-index: 180; top: 72px; right: 16px; width: min(390px, calc(100vw - 24px)); max-height: calc(100vh - 88px); overflow: auto; padding: 14px; border: 1px solid rgba(240,194,94,.38); border-radius: 14px; background: rgba(5,13,17,.97); color: var(--ink); box-shadow: 0 24px 60px rgba(0,0,0,.5); backdrop-filter: blur(18px); }
      .audio-preview-panel-c[hidden] { display: none; }
      :root[data-theme="light"] .audio-preview-panel-c { background: rgba(255,250,239,.98); border-color: rgba(95,69,35,.22); }
      .audio-preview-head-c { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
      .audio-preview-head-c p, .audio-preview-head-c h2, .audio-preview-head-c span { margin: 0; }
      .audio-preview-head-c p { color: var(--gold); font-size: .64rem; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
      .audio-preview-head-c h2 { margin-top: 2px; font-size: 1rem; }
      .audio-preview-head-c span { display: block; margin-top: 4px; color: var(--muted); font-size: .7rem; line-height: 1.4; }
      .audio-preview-close-c { width: 30px; min-width: 30px; min-height: 30px; padding: 0; border-radius: 999px; background: rgba(255,255,255,.08); color: var(--ink); box-shadow: none; }
      .audio-bgm-card-c { margin-top: 12px; padding: 10px; border: 1px solid rgba(112,216,201,.2); border-radius: 11px; background: rgba(112,216,201,.06); }
      .audio-bgm-card-c > button { width: 100%; min-height: 42px; border-radius: 9px; font-size: .76rem; }
      .audio-bgm-card-c > button.is-playing { border-color: rgba(112,216,201,.6); background: rgba(112,216,201,.16); color: var(--cyan); }
      .audio-bgm-volume-c { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; margin-top: 9px; color: var(--muted); font-size: .65rem; }
      .audio-bgm-volume-c input { width: 100%; }
      .audio-preview-grid-c { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
      .audio-preview-grid-c button { min-height: 42px; border-radius: 9px; font-size: .76rem; }
      .audio-preview-note-c { margin: 10px 0 0; color: var(--muted); font-size: .64rem; line-height: 1.45; text-align: center; }
      @media (max-width: 620px) { .audio-preview-panel-c { top: 56px; right: 10px; max-height: calc(100vh - 66px); } }
    `;
    document.head.appendChild(style);

    const trigger = document.createElement("button");
    trigger.id = "audioPreviewButtonC";
    trigger.className = "ghost-button tool-button";
    trigger.type = "button";
    trigger.textContent = "🎧 試聽";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", panelId);
    muteButton.insertAdjacentElement("afterend", trigger);

    const panel = document.createElement("section");
    panel.id = panelId;
    panel.className = "audio-preview-panel-c";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "音效風格 C 試聽");
    panel.innerHTML = `
      <header class="audio-preview-head-c">
        <div>
          <p>Sound Style C</p>
          <h2>寫實牌桌＋童趣勝利</h2>
          <span>牌局操作維持紙牌、陶瓷籌碼與木桌質感；背景使用低音量的輕鬆夜間 Lounge。</span>
        </div>
        <button class="audio-preview-close-c" type="button" aria-label="關閉音效試聽">×</button>
      </header>
      <section class="audio-bgm-card-c" aria-label="背景音樂">
        <button id="bgmToggleButtonC" type="button" aria-pressed="false">🎵 播放輕鬆 BGM</button>
        <label class="audio-bgm-volume-c">
          <span>背景音量</span>
          <input id="bgmVolumeC" type="range" min="0" max="60" step="1" value="34" aria-label="背景音樂音量" />
          <output id="bgmVolumeValueC">34%</output>
        </label>
      </section>
      <div class="audio-preview-grid-c">
        <button type="button" data-audio-preview="deal">🃏 發牌</button>
        <button type="button" data-audio-preview="chip">🪙 跟注籌碼</button>
        <button type="button" data-audio-preview="check">✊ 過牌敲桌</button>
        <button type="button" data-audio-preview="raise">📈 加注</button>
        <button type="button" data-audio-preview="allIn">🔥 All-in</button>
        <button type="button" data-audio-preview="fold">↩ 棄牌</button>
        <button type="button" data-audio-preview="win">🏆 勝利</button>
        <button type="button" data-audio-preview="unlock">✨ 解鎖</button>
      </div>
      <p class="audio-preview-note-c">背景音樂預設關閉，按下播放後才會開始；不使用外部歌曲，因此沒有授權與大型檔案問題。</p>`;
    document.body.appendChild(panel);

    const bgmButton = panel.querySelector("#bgmToggleButtonC");
    const bgmVolumeSlider = panel.querySelector("#bgmVolumeC");
    const bgmVolumeValue = panel.querySelector("#bgmVolumeValueC");

    muteButton.addEventListener("click", () => {
      setTimeout(() => {
        if (typeof state !== "undefined") Audio.setMuted(state.isMuted);
      }, 0);
    });

    function applyVolumeLabel() {
      if (bgmVolumeValue && bgmVolumeSlider) bgmVolumeValue.textContent = `${bgmVolumeSlider.value}%`;
    }

    syncBgmControls();
    applyVolumeLabel();

    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) Audio.button();
    });

    panel.querySelector(".audio-preview-close-c")?.addEventListener("click", closePanel);

    bgmButton?.addEventListener("click", () => {
      if (typeof state !== "undefined" && state.isMuted) {
        state.isMuted = false;
        Audio.setMuted(false);
        if (typeof render === "function") render();
      }
      Audio.toggleBgm();
      syncBgmControls();
    });

    bgmVolumeSlider?.addEventListener("input", () => {
      Audio.setBgmVolume(Number(bgmVolumeSlider.value) / 100);
      applyVolumeLabel();
    });

    panel.addEventListener("click", event => {
      const button = event.target.closest("[data-audio-preview]");
      if (button) Audio.preview(button.dataset.audioPreview);
    });

    document.addEventListener("click", event => {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) closePanel();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !panel.hidden) closePanel();
    });

    if (Audio.isBgmEnabled()) {
      const resumeSavedBgm = () => {
        if (typeof state === "undefined" || !state.isMuted) Audio.startBgm({ persist: false });
        syncBgmControls();
      };
      document.addEventListener("pointerdown", resumeSavedBgm, { once: true });
      document.addEventListener("keydown", resumeSavedBgm, { once: true });
    }
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", installPreview, { once: true })
    : installPreview();
})();
