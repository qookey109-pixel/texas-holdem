// Separate SFX and BGM toggles with independent 0–100% volume controls.
(() => {
  "use strict";

  if (typeof Audio !== "object" || !Audio) return;

  const BGM_DEFAULT_MIGRATION_KEY = "texasHoldemBgmDefault60V1";
  const originalCleanup = typeof Audio.cleanup === "function" ? Audio.cleanup.bind(Audio) : null;
  const portraitMedia = window.matchMedia("(max-width: 900px) and (orientation: portrait)");
  let resumeBgmAfterPortrait = false;

  Audio.setMuted = value => Boolean(value);
  Audio.cleanup = () => {};

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function applyDefaultVolumes() {
    try {
      if (!localStorage.getItem(BGM_DEFAULT_MIGRATION_KEY)) {
        Audio.setBgmVolume?.(0.6);
        localStorage.setItem(BGM_DEFAULT_MIGRATION_KEY, "true");
      }
    } catch (_) {
      // Use the engine's current value when storage is unavailable.
    }
  }

  function removePreviewUi() {
    document.querySelector("#audioPreviewButtonC")?.remove();
    document.querySelector("#audioPreviewPanelC")?.remove();
    document.querySelector("#audioPreviewStylesC")?.remove();
  }

  function syncBgmButton() {
    const button = document.querySelector("#bgmButton");
    if (!button) return;
    const enabled = Boolean(Audio.isBgmEnabled?.());
    button.textContent = enabled ? "🎶 BGM" : "🎵 BGM";
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "關閉背景音樂" : "開啟背景音樂");
    button.title = enabled ? "關閉背景音樂" : "開啟背景音樂";
    button.classList.toggle("is-bgm-on", enabled);
  }

  function syncVolumeControls() {
    const sfxSlider = document.querySelector("#sfxVolumeSlider");
    const bgmSlider = document.querySelector("#bgmVolumeSlider");
    const sfxOutput = document.querySelector("#sfxVolumeOutput");
    const bgmOutput = document.querySelector("#bgmVolumeOutput");
    const sfxPercent = Math.round((Audio.getSfxVolume?.() ?? 0.6) * 100);
    const bgmPercent = Math.round((Audio.getBgmVolume?.() ?? 0.6) * 100);

    if (sfxSlider) sfxSlider.value = String(sfxPercent);
    if (bgmSlider) bgmSlider.value = String(bgmPercent);
    if (sfxOutput) sfxOutput.textContent = `${sfxPercent}%`;
    if (bgmOutput) bgmOutput.textContent = `${bgmPercent}%`;
  }

  function positionVolumePanel() {
    const panel = document.querySelector("#audioVolumePanel");
    const button = document.querySelector("#audioVolumeButton");
    if (!panel || !button || panel.hidden) return;

    const buttonRect = button.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 310;
    const viewportPadding = 10;
    const preferredLeft = buttonRect.left + buttonRect.width / 2 - panelWidth / 2;
    const left = clamp(preferredLeft, viewportPadding, window.innerWidth - panelWidth - viewportPadding);
    const top = Math.min(buttonRect.bottom + 8, window.innerHeight - panel.offsetHeight - viewportPadding);

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.max(viewportPadding, Math.round(top))}px`;
    panel.style.setProperty("--audio-arrow-left", `${Math.round(buttonRect.left + buttonRect.width / 2 - left)}px`);
  }

  function setVolumePanelOpen(open, { focus = false } = {}) {
    const panel = document.querySelector("#audioVolumePanel");
    const button = document.querySelector("#audioVolumeButton");
    if (!panel || !button) return;

    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.classList.toggle("is-volume-open", open);

    if (open) {
      syncVolumeControls();
      requestAnimationFrame(() => {
        positionVolumePanel();
        if (focus) panel.querySelector("#sfxVolumeSlider")?.focus({ preventScroll: true });
      });
    }
  }

  function closeVolumePanel() {
    setVolumePanelOpen(false);
  }

  function installControls() {
    const sfxButton = document.querySelector("#muteButton");
    if (!sfxButton || document.querySelector("#bgmButton")) return;

    applyDefaultVolumes();

    const style = document.createElement("style");
    style.id = "splitAudioControlsStyles";
    style.textContent = `
      #bgmButton.is-bgm-on {
        border-color: rgba(112,216,201,.58);
        background: rgba(112,216,201,.13);
        color: var(--cyan);
      }
      #audioVolumeButton.is-volume-open {
        border-color: rgba(240,194,94,.55);
        background: rgba(240,194,94,.12);
        color: var(--gold);
      }
      .audio-volume-panel {
        position: fixed;
        z-index: 220;
        width: min(310px, calc(100vw - 20px));
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(240,194,94,.34);
        border-radius: 12px;
        background:
          radial-gradient(circle at 18% 0%, rgba(240,194,94,.14), transparent 48%),
          linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.025)),
          rgba(5,13,17,.97);
        color: var(--ink);
        box-shadow: 0 20px 44px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.1);
        backdrop-filter: blur(16px) saturate(128%);
        animation: audioPanelIn 160ms ease both;
      }
      .audio-volume-panel::before {
        content: "";
        position: absolute;
        left: clamp(18px, calc(var(--audio-arrow-left, 50%) - 7px), calc(100% - 32px));
        top: -7px;
        width: 13px;
        height: 13px;
        border-left: 1px solid rgba(240,194,94,.34);
        border-top: 1px solid rgba(240,194,94,.34);
        background: rgba(18,25,27,.98);
        transform: rotate(45deg);
      }
      .audio-volume-panel[hidden] { display: none; }
      :root[data-theme="light"] .audio-volume-panel {
        background:
          radial-gradient(circle at 18% 0%, rgba(181,126,34,.1), transparent 48%),
          rgba(255,250,239,.98);
        border-color: rgba(95,69,35,.22);
      }
      :root[data-theme="light"] .audio-volume-panel::before {
        background: rgba(255,250,239,.98);
        border-color: rgba(95,69,35,.22);
      }
      .audio-volume-head {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .audio-volume-head p {
        margin: 0 0 2px;
        color: var(--gold);
        font-size: .58rem;
        font-weight: 950;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .audio-volume-head h2 { margin: 0; font-size: .84rem; }
      .audio-volume-close {
        display: grid;
        place-items: center;
        width: 25px;
        height: 25px;
        min-width: 25px;
        padding: 0;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        color: var(--muted);
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
      }
      .audio-volume-row {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 67px minmax(70px, 1fr) 40px;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        color: var(--muted);
        font-size: .68rem;
        font-weight: 850;
      }
      .audio-volume-row input { width: 100%; min-width: 0; }
      .audio-volume-row output {
        color: var(--ink);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .audio-volume-note {
        position: relative;
        z-index: 1;
        margin: 7px 0 0;
        color: var(--muted);
        font-size: .59rem;
        line-height: 1.35;
        text-align: center;
      }
      @keyframes audioPanelIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .audio-volume-panel { animation: none; }
      }
    `;
    document.head.appendChild(style);

    const bgmButton = document.createElement("button");
    bgmButton.id = "bgmButton";
    bgmButton.className = "ghost-button tool-button";
    bgmButton.type = "button";
    sfxButton.insertAdjacentElement("afterend", bgmButton);

    const volumeButton = document.createElement("button");
    volumeButton.id = "audioVolumeButton";
    volumeButton.className = "ghost-button tool-button";
    volumeButton.type = "button";
    volumeButton.textContent = "🎚 音量";
    volumeButton.setAttribute("aria-expanded", "false");
    volumeButton.setAttribute("aria-controls", "audioVolumePanel");
    bgmButton.insertAdjacentElement("afterend", volumeButton);

    const panel = document.createElement("aside");
    panel.id = "audioVolumePanel";
    panel.className = "audio-volume-panel";
    panel.hidden = true;
    panel.setAttribute("aria-labelledby", "audioVolumeTitle");
    panel.innerHTML = `
      <div class="audio-volume-head">
        <div>
          <p>Audio Settings</p>
          <h2 id="audioVolumeTitle">音量控制</h2>
        </div>
        <button class="audio-volume-close" type="button" aria-label="收起音量控制">×</button>
      </div>
      <label class="audio-volume-row">
        <span>🔊 音效</span>
        <input id="sfxVolumeSlider" type="range" min="0" max="100" step="1" value="60" aria-label="遊戲音效音量" />
        <output id="sfxVolumeOutput">60%</output>
      </label>
      <label class="audio-volume-row">
        <span>🎵 BGM</span>
        <input id="bgmVolumeSlider" type="range" min="0" max="100" step="1" value="60" aria-label="背景音樂音量" />
        <output id="bgmVolumeOutput">60%</output>
      </label>
      <p class="audio-volume-note">兩者可獨立調整，設定會自動儲存。</p>
    `;
    document.body.appendChild(panel);

    bgmButton.addEventListener("click", () => {
      Audio.toggleBgm?.();
      syncBgmButton();
    });

    volumeButton.addEventListener("click", event => {
      event.stopPropagation();
      setVolumePanelOpen(panel.hidden);
    });

    panel.addEventListener("click", event => event.stopPropagation());
    panel.querySelector(".audio-volume-close")?.addEventListener("click", closeVolumePanel);

    panel.querySelector("#sfxVolumeSlider")?.addEventListener("input", event => {
      Audio.setSfxVolume?.(Number(event.target.value) / 100);
      syncVolumeControls();
    });

    panel.querySelector("#bgmVolumeSlider")?.addEventListener("input", event => {
      Audio.setBgmVolume?.(Number(event.target.value) / 100);
      syncVolumeControls();
    });

    document.addEventListener("click", () => {
      if (!panel.hidden) closeVolumePanel();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !panel.hidden) closeVolumePanel();
    });
    window.addEventListener("resize", positionVolumePanel);
    window.addEventListener("scroll", positionVolumePanel, true);

    syncBgmButton();
    syncVolumeControls();
  }

  function handlePortraitChange() {
    if (portraitMedia.matches) {
      resumeBgmAfterPortrait = Boolean(Audio.isBgmEnabled?.());
      if (resumeBgmAfterPortrait) Audio.stopBgm?.({ persist: false });
      closeVolumePanel();
    } else if (resumeBgmAfterPortrait) {
      Audio.startBgm?.({ persist: false });
      resumeBgmAfterPortrait = false;
    }
    syncBgmButton();
  }

  function install() {
    removePreviewUi();
    installControls();
    setTimeout(removePreviewUi, 80);
    setTimeout(removePreviewUi, 240);
    handlePortraitChange();
  }

  if (portraitMedia.addEventListener) portraitMedia.addEventListener("change", handlePortraitChange);
  else portraitMedia.addListener(handlePortraitChange);

  window.addEventListener("pagehide", () => {
    try { Audio.cleanupSfx?.(); } catch (_) {}
    try { originalCleanup?.(); } catch (_) {}
  }, { once: true });

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true })
    : setTimeout(install, 0);
})();
