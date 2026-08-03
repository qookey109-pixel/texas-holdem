// Approved official table layout captured from the production layout editor.
(() => {
  "use strict";

  if (window.OfficialLayoutPreset?.version) return;

  const SIZE_STORAGE_KEY = "texasHoldemLayoutSizesV2";
  const POT_STORAGE_KEY = "texasHoldemPotScaleV1";

  const OFFICIAL_LAYOUT = Object.freeze({
    seat1: { left: 2.29, top: 73.63 },
    seat2: { left: 1.5, top: 17.5 },
    seat3: { left: 28.25, top: 2 },
    seat4: { left: 57.54, top: 1.89 },
    seat5: { left: 79.66, top: 14.55 },
    seat6: { left: 82.05, top: 62.81 },
    seatCards1: { left: 22.88, top: 59.02 },
    seatCards2: { left: 21.5, top: 37.5 },
    seatCards3: { left: 38.59, top: 26.36 },
    seatCards4: { left: 60.94, top: 26.61 },
    seatCards5: { left: 76.3, top: 35.19 },
    seatCards6: { left: 77.42, top: 54.77 },
    dialogue1: { left: 10.87, top: 67.62 },
    dialogue2: { left: 9, top: 33 },
    dialogue3: { left: 34.41, top: 18.16 },
    dialogue4: { left: 66, top: 18 },
    dialogue5: { left: 90.19, top: 31.6 },
    dialogue6: { left: 92.35, top: 57.17 },
    board: { left: 50, top: 47.55 },
    pot: { left: 50, top: 33.5 },
    stage: { left: 50, top: 39 },
    hero: { left: 50, top: 88 },
    heroCards: { left: 50, top: 63.2 },
    heroPanel: { left: 50, top: 90.46 },
    heroStack: { left: 33.28, top: 90.48 },
    actions: { left: 81.6, top: 89.13 },
  });

  const OFFICIAL_SIZES = Object.freeze({
    heroCard: 70,
    boardCard: 65,
    aiCard: 52,
    aiSeat: 176,
    aiProfile: 272,
  });

  const OFFICIAL_POT_SCALE = 70;
  const OFFICIAL_ARROWS = Object.freeze({
    dialogue1: "left",
    dialogue2: "left",
    dialogue3: "up",
    dialogue4: "up",
    dialogue5: "right",
    dialogue6: "right",
  });

  const SIZE_CSS_VARS = Object.freeze({
    heroCard: "--layout-hero-card-width",
    boardCard: "--layout-board-card-width",
    aiCard: "--layout-ai-card-width",
    aiSeat: "--layout-ai-seat-width",
    aiProfile: "--layout-ai-profile-width",
  });

  function cloneLayout() {
    return JSON.parse(JSON.stringify(OFFICIAL_LAYOUT));
  }

  function applyOfficialConstants() {
    if (typeof DEFAULT_LAYOUT === "object") {
      Object.entries(OFFICIAL_LAYOUT).forEach(([key, value]) => {
        if (DEFAULT_LAYOUT[key]) Object.assign(DEFAULT_LAYOUT[key], value);
        else DEFAULT_LAYOUT[key] = { ...value };
      });
    }

    if (typeof DEFAULT_DIALOGUE_ARROWS === "object") {
      Object.assign(DEFAULT_DIALOGUE_ARROWS, OFFICIAL_ARROWS);
    }
  }

  function seedNewBrowserDefaults() {
    try {
      if (!localStorage.getItem(SIZE_STORAGE_KEY)) {
        localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(OFFICIAL_SIZES));
      }
      if (!localStorage.getItem(POT_STORAGE_KEY)) {
        localStorage.setItem(POT_STORAGE_KEY, String(OFFICIAL_POT_SCALE));
      }
    } catch (_) {
      // Private browsing may block storage; runtime defaults still apply where possible.
    }
  }

  function applyOfficialSizes({ persist = false } = {}) {
    Object.entries(OFFICIAL_SIZES).forEach(([key, value]) => {
      if (window.LayoutSizeController?.setSize) {
        window.LayoutSizeController.setSize(key, value, { persist });
      } else {
        document.documentElement.style.setProperty(SIZE_CSS_VARS[key], `${value}px`);
      }
    });

    if (persist) {
      try {
        localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(OFFICIAL_SIZES));
      } catch (_) {}
    }
  }

  function applyOfficialPot({ persist = false } = {}) {
    if (window.LayoutCornerResize?.setPotScale) {
      window.LayoutCornerResize.setPotScale(OFFICIAL_POT_SCALE, { persist });
    } else {
      document.documentElement.style.setProperty(
        "--layout-pot-scale",
        (OFFICIAL_POT_SCALE / 100).toFixed(3),
      );
      if (persist) {
        try { localStorage.setItem(POT_STORAGE_KEY, String(OFFICIAL_POT_SCALE)); } catch (_) {}
      }
    }
  }

  function applyOfficialLayout({ persist = true, announceResult = true } = {}) {
    if (typeof state === "object" && state.layout) {
      state.layout.items = cloneLayout();
      state.layout.arrows = { ...OFFICIAL_ARROWS };
      if (typeof normalizePanelPosition === "function") {
        state.layout.panel = normalizePanelPosition(null);
      }
      if (typeof applyLayout === "function") applyLayout();
    }

    applyOfficialSizes({ persist });
    applyOfficialPot({ persist });

    if (persist && typeof state === "object" && state.layout) {
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout.items));
        localStorage.setItem(LAYOUT_ARROW_STORAGE_KEY, JSON.stringify(state.layout.arrows));
        if (typeof saveLayoutPanelPosition === "function") saveLayoutPanelPosition();
      } catch (error) {
        console.warn("Official layout preset save failed:", error);
      }
    }

    if (typeof updateLayoutEditorUI === "function") updateLayoutEditorUI();
    if (announceResult && typeof announce === "function") announce("已套用官方預設版面");
  }

  function labelOfficialResetButton() {
    const button = document.querySelector("#resetLayoutButton");
    if (!button) return;
    button.textContent = "⭐ 官方預設";
    button.title = "套用網站官方版面、牌卡大小與底池大小";
    button.setAttribute("aria-label", "套用官方預設版面");
  }

  applyOfficialConstants();
  seedNewBrowserDefaults();
  labelOfficialResetButton();

  document.addEventListener("click", event => {
    const button = event.target.closest?.("#resetLayoutButton, #resetLayoutSizesButton");
    if (!button) return;

    window.setTimeout(() => {
      if (button.id === "resetLayoutButton") {
        applyOfficialLayout({ persist: false, announceResult: false });
      } else {
        applyOfficialSizes({ persist: false });
        applyOfficialPot({ persist: false });
      }
      labelOfficialResetButton();
    }, 0);
  }, true);

  window.OfficialLayoutPreset = Object.freeze({
    version: "1.0.0",
    layout: cloneLayout(),
    sizes: { ...OFFICIAL_SIZES },
    potScale: OFFICIAL_POT_SCALE,
    arrows: { ...OFFICIAL_ARROWS },
    apply: applyOfficialLayout,
  });
})();
