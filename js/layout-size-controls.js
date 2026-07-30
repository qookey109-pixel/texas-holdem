// Balanced card sizes + user-adjustable size controls inside the existing layout editor.
(() => {
  "use strict";

  const STORAGE_KEY = "texasHoldemLayoutSizesV2";
  const DEFAULTS = Object.freeze({
    heroCard: 92,
    boardCard: 86,
    aiCard: 44,
    aiSeat: 176,
    aiProfile: 272,
  });

  const LIMITS = Object.freeze({
    heroCard: [70, 115],
    boardCard: [65, 105],
    aiCard: [32, 58],
    aiSeat: [150, 210],
    aiProfile: [230, 330],
  });

  const CSS_VARS = Object.freeze({
    heroCard: "--layout-hero-card-width",
    boardCard: "--layout-board-card-width",
    aiCard: "--layout-ai-card-width",
    aiSeat: "--layout-ai-seat-width",
    aiProfile: "--layout-ai-profile-width",
  });

  let sizes = readSavedSizes();
  let sideRailObserver = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalize(raw) {
    const normalized = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach(key => {
      const [min, max] = LIMITS[key];
      const value = Number(raw?.[key]);
      if (Number.isFinite(value)) normalized[key] = Math.round(clamp(value, min, max));
    });
    return normalized;
  }

  function readSavedSizes() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSizes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch (error) {
      console.warn("Layout size settings were not saved:", error);
    }
  }

  function applySizes() {
    const root = document.documentElement;
    Object.keys(CSS_VARS).forEach(key => {
      root.style.setProperty(CSS_VARS[key], `${sizes[key]}px`);
    });
    syncControls();
    requestAnimationFrame(() => {
      if (typeof applyLayoutPanelPosition === "function") applyLayoutPanelPosition();
    });
  }

  function setSize(key, value, { persist = true } = {}) {
    if (!(key in DEFAULTS)) return;
    const [min, max] = LIMITS[key];
    sizes[key] = Math.round(clamp(Number(value) || DEFAULTS[key], min, max));
    if (persist) saveSizes();
    applySizes();
  }

  function resetSizes() {
    sizes = { ...DEFAULTS };
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    applySizes();
    if (typeof announce === "function") announce("牌卡與資訊卡大小已還原");
  }

  function syncControls() {
    document.querySelectorAll("[data-layout-size]").forEach(input => {
      const key = input.dataset.layoutSize;
      if (!(key in sizes)) return;
      input.value = String(sizes[key]);
      const output = document.querySelector(`[data-layout-size-output="${key}"]`);
      if (output) output.textContent = `${sizes[key]}px`;
    });
  }

  function syncSideRailEditorState() {
    const panel = document.querySelector("#layoutEditorPanel");
    const sideRail = document.querySelector(".side-rail");
    if (!panel || !sideRail) return;
    sideRail.classList.toggle("is-layout-editor-active", !panel.hidden);
  }

  function observeSideRailEditorState() {
    const panel = document.querySelector("#layoutEditorPanel");
    if (!panel) return;
    syncSideRailEditorState();
    sideRailObserver?.disconnect();
    sideRailObserver = new MutationObserver(syncSideRailEditorState);
    sideRailObserver.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  }

  function installStyles() {
    if (document.querySelector("#layoutSizeControlStyles")) return;
    const style = document.createElement("style");
    style.id = "layoutSizeControlStyles";
    style.textContent = `
      :root {
        --layout-hero-card-width: 92px;
        --layout-board-card-width: 86px;
        --layout-ai-card-width: 44px;
        --layout-ai-seat-width: 176px;
        --layout-ai-profile-width: 272px;
      }

      html body #playerCards .card {
        width: clamp(70px, min(var(--layout-hero-card-width), 10vw), 115px) !important;
      }
      html body .board-cards .card {
        width: clamp(65px, min(var(--layout-board-card-width), 7.2vw), 105px) !important;
      }
      html body .seat .card {
        width: clamp(32px, min(var(--layout-ai-card-width), 5vw), 58px) !important;
      }

      html body .seat,
      html body .seat-header {
        width: clamp(150px, min(var(--layout-ai-seat-width), 18vw), 210px) !important;
        inline-size: clamp(150px, min(var(--layout-ai-seat-width), 18vw), 210px) !important;
        max-width: clamp(150px, min(var(--layout-ai-seat-width), 18vw), 210px) !important;
      }
      html body .seat-header {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 58px !important;
        grid-template-rows: repeat(3, 20px) !important;
        align-items: center !important;
        gap: 2px 7px !important;
        min-height: 74px !important;
        padding: 7px 7px 7px 8px !important;
        overflow: hidden !important;
      }
      html body .seat-header .seat-identity {
        grid-column: 1 !important;
        grid-row: 1 / 4 !important;
        width: 100% !important;
        min-width: 0 !important;
        overflow: visible !important;
      }
      html body .seat-header .seat-identity > div {
        min-width: 0 !important;
        width: 100% !important;
      }
      html body .seat-header .position-chip {
        position: static !important;
        grid-column: 2 !important;
        grid-row: 1 !important;
        justify-self: end !important;
        min-width: 34px !important;
        max-width: 58px !important;
      }
      html body .seat-header > .emotion-chip {
        position: static !important;
        grid-column: 2 !important;
        grid-row: 2 !important;
        justify-self: end !important;
        max-width: 58px !important;
        min-height: 18px !important;
        padding: 2px 6px !important;
        font-size: .58rem !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      html body .seat-header .seat-status {
        position: static !important;
        grid-column: 2 !important;
        grid-row: 3 !important;
        justify-self: end !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: 58px !important;
        min-height: 18px !important;
        padding: 2px 6px !important;
      }
      html body .seat-header .seat-status strong {
        display: none !important;
      }
      html body .seat-header .seat-status.is-thinking {
        width: 58px !important;
        min-width: 58px !important;
        padding-right: 18px !important;
      }
      html body .seat-meta {
        gap: 0 !important;
        overflow: visible !important;
      }
      html body .seat-meta strong {
        display: block !important;
        min-width: 4ch !important;
        max-width: 100% !important;
        overflow: visible !important;
        text-overflow: clip !important;
        white-space: nowrap !important;
        font-size: 1.02rem !important;
        font-variant-numeric: tabular-nums !important;
      }
      html body .seat-meta .mini-chip-stack {
        display: none !important;
      }
      html body .player-emoji {
        width: 29px !important;
        height: 29px !important;
        font-size: 1.14rem !important;
      }
      html body .seat h2 {
        max-width: 100% !important;
        font-size: .94rem !important;
      }
      html body .seat-street-bet {
        min-width: 82px !important;
        margin-top: 3px !important;
      }

      html body .ai-profile-panel {
        width: clamp(230px, min(var(--layout-ai-profile-width), 31vw), 330px) !important;
        padding: 12px !important;
      }
      html body .ai-profile-avatar {
        width: 44px !important;
        height: 44px !important;
        font-size: 1.52rem !important;
      }

      .layout-editor-panel {
        max-height: calc(100% - 16px);
        overflow: auto;
      }
      html body .side-rail.is-layout-editor-active {
        grid-template-rows: minmax(0, 1fr) !important;
        overflow: visible !important;
        z-index: 24 !important;
      }
      html body .side-rail.is-layout-editor-active > #coachPanel,
      html body .side-rail.is-layout-editor-active > #historyPanel {
        display: none !important;
      }
      html body .side-rail.is-layout-editor-active > #layoutEditorPanel {
        height: 100% !important;
        min-height: 0 !important;
        max-height: 100% !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }
      .layout-size-controls {
        display: grid;
        gap: 7px;
        padding-top: 9px;
        border-top: 1px solid rgba(255,255,255,.1);
      }
      .layout-size-controls-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .layout-size-controls-head strong {
        margin: 0;
        color: var(--gold);
        font-size: .76rem;
      }
      .layout-size-controls-head button {
        min-width: 0;
        min-height: 26px;
        padding: 3px 8px;
        border-radius: 7px;
        font-size: .64rem;
      }
      .layout-size-row {
        display: grid;
        grid-template-columns: 76px minmax(80px, 1fr) 43px;
        align-items: center;
        gap: 7px;
        color: var(--muted);
        font-size: .66rem;
        font-weight: 820;
      }
      .layout-size-row input {
        width: 100%;
        min-width: 0;
      }
      .layout-size-row output {
        color: var(--ink);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .layout-size-note {
        margin: 0;
        color: rgba(172,192,186,.78);
        font-size: .6rem;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(style);
  }

  function sliderRow(key, label) {
    const [min, max] = LIMITS[key];
    return `
      <label class="layout-size-row">
        <span>${label}</span>
        <input type="range" min="${min}" max="${max}" step="1" value="${sizes[key]}" data-layout-size="${key}" aria-label="${label}大小" />
        <output data-layout-size-output="${key}">${sizes[key]}px</output>
      </label>`;
  }

  function installControls() {
    const panel = document.querySelector("#layoutEditorPanel");
    if (!panel || panel.querySelector("#layoutSizeControls")) return;

    const section = document.createElement("section");
    section.id = "layoutSizeControls";
    section.className = "layout-size-controls";
    section.innerHTML = `
      <div class="layout-size-controls-head">
        <strong>牌卡與資訊卡大小</strong>
        <button id="resetLayoutSizesButton" type="button">還原大小</button>
      </div>
      ${sliderRow("heroCard", "我的手牌")}
      ${sliderRow("boardCard", "公共牌")}
      ${sliderRow("aiCard", "AI 手牌")}
      ${sliderRow("aiSeat", "AI 資訊卡")}
      ${sliderRow("aiProfile", "AI 詳細卡")}
      <p class="layout-size-note">拖曳時即時預覽，調整後會自動儲存在這台裝置。</p>
    `;

    const dialogueControls = panel.querySelector("#dialogueArrowControls");
    panel.insertBefore(section, dialogueControls || null);

    section.addEventListener("input", event => {
      const input = event.target.closest("[data-layout-size]");
      if (!input) return;
      setSize(input.dataset.layoutSize, input.value);
    });

    section.querySelector("#resetLayoutSizesButton")?.addEventListener("click", resetSizes);
    document.querySelector("#resetLayoutButton")?.addEventListener("click", resetSizes);

    const status = document.querySelector("#layoutStatus");
    if (status && status.textContent.includes("拖曳牌桌元素")) {
      status.textContent = "拖曳位置，也可調整牌卡與資訊卡大小";
    }

    syncControls();
    requestAnimationFrame(() => {
      if (typeof applyLayoutPanelPosition === "function") applyLayoutPanelPosition();
    });
  }

  function install() {
    installStyles();
    applySizes();
    installControls();
    observeSideRailEditorState();
  }

  window.LayoutSizeController = {
    getSizes: () => ({ ...sizes }),
    setSize,
    reset: resetSizes,
  };

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", install, { once: true })
    : install();
})();