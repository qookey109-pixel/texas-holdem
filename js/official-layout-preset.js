// Approved official table layout captured from the production layout editor.
(() => {
  "use strict";

  if (window.OfficialLayoutPreset?.version) return;

  const SIZE_STORAGE_KEY = "texasHoldemLayoutSizesV2";
  const POT_STORAGE_KEY = "texasHoldemPotScaleV1";
  const PRESET_MIGRATION_KEY = "texasHoldemOfficialLayoutPresetVersionV1";

  const OFFICIAL_LAYOUT = Object.freeze({
    seat1: { left: 2.29, top: 73.63 },
    seat2: { left: 1.5, top: 18 },
    seat3: { left: 29.25, top: 2.5 },
    seat4: { left: 55.04, top: 2.39 },
    seat5: { left: 80.16, top: 14.55 },
    seat6: { left: 82.05, top: 62.81 },
    seatCards1: { left: 23.38, top: 57.02 },
    seatCards2: { left: 23, top: 38.5 },
    seatCards3: { left: 38.59, top: 26.36 },
    seatCards4: { left: 60.94, top: 26.61 },
    seatCards5: { left: 76.3, top: 35.69 },
    seatCards6: { left: 76.42, top: 54.77 },
    dialogue1: { left: 10.87, top: 67.62 },
    dialogue2: { left: 9, top: 34 },
    dialogue3: { left: 36.91, top: 19.16 },
    dialogue4: { left: 63.5, top: 19.5 },
    dialogue5: { left: 89.19, top: 32.6 },
    dialogue6: { left: 92.35, top: 57.17 },
    board: { left: 50, top: 46.55 },
    pot: { left: 50, top: 32.5 },
    stage: { left: 50, top: 37.5 },
    hero: { left: 50, top: 88 },
    heroCards: { left: 50, top: 64.57 },
    heroPanel: { left: 50, top: 90.46 },
    heroStack: { left: 33.28, top: 90.48 },
    actions: { left: 81.6, top: 89.13 },
  });

  const PREVIOUS_OFFICIAL_LAYOUT = Object.freeze({
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
    heroCards: { left: 50, top: 65.7 },
    heroPanel: { left: 50, top: 90.46 },
    heroStack: { left: 33.28, top: 90.48 },
    actions: { left: 81.6, top: 89.13 },
  });

  const LEGACY_OFFICIAL_LAYOUT = Object.freeze({
    ...PREVIOUS_OFFICIAL_LAYOUT,
    heroCards: { left: 50, top: 63.2 },
  });

  const OFFICIAL_SIZES = Object.freeze({
    heroCard: 70,
    boardCard: 68,
    aiCard: 44,
    aiSeat: 176,
    aiProfile: 272,
  });
  const PREVIOUS_OFFICIAL_SIZES = Object.freeze({
    heroCard: 92,
    boardCard: 86,
    aiCard: 44,
    aiSeat: 176,
    aiProfile: 272,
  });
  const LEGACY_OFFICIAL_SIZES = Object.freeze({
    heroCard: 70,
    boardCard: 65,
    aiCard: 52,
    aiSeat: 176,
    aiProfile: 272,
  });
  const OFFICIAL_POT_SCALE = 70;
  const PREVIOUS_OFFICIAL_POT_SCALE = 100;
  const OFFICIAL_ARROWS = Object.freeze({
    dialogue1: "down",
    dialogue2: "up",
    dialogue3: "up",
    dialogue4: "up",
    dialogue5: "up",
    dialogue6: "down",
  });
  const PREVIOUS_OFFICIAL_ARROWS = Object.freeze({
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

  function matchesObject(raw, expected) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const rawKeys = Object.keys(raw);
    const expectedKeys = Object.keys(expected);
    if (rawKeys.length !== expectedKeys.length) return false;
    return expectedKeys.every(key => String(raw[key]) === String(expected[key]));
  }

  function matchesLayout(raw, expected) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const rawKeys = Object.keys(raw);
    const expectedKeys = Object.keys(expected);
    if (rawKeys.length !== expectedKeys.length) return false;
    return expectedKeys.every(key => (
      raw[key]
      && Number(raw[key].left) === Number(expected[key].left)
      && Number(raw[key].top) === Number(expected[key].top)
    ));
  }

  function migrateStoredObject(key, previousValues, officialValue) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(officialValue));
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(previousValues) ? previousValues : [previousValues];
      if (candidates.some(expected => matchesObject(parsed, expected))) {
        localStorage.setItem(key, JSON.stringify(officialValue));
      }
    } catch (_) {
      // Leave malformed or custom values untouched.
    }
  }

  function migratePreviousOfficialDefaults() {
    try {
      if (localStorage.getItem(PRESET_MIGRATION_KEY) === "4") return;

      const rawLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (rawLayout) {
        try {
          const parsedLayout = JSON.parse(rawLayout);
          if (
            matchesLayout(parsedLayout, PREVIOUS_OFFICIAL_LAYOUT)
            || matchesLayout(parsedLayout, LEGACY_OFFICIAL_LAYOUT)
          ) {
            localStorage.removeItem(LAYOUT_STORAGE_KEY);
          }
        } catch (_) {
          // Leave malformed or custom values untouched.
        }
      }

      migrateStoredObject(
        SIZE_STORAGE_KEY,
        [PREVIOUS_OFFICIAL_SIZES, LEGACY_OFFICIAL_SIZES],
        OFFICIAL_SIZES,
      );

      const rawPot = localStorage.getItem(POT_STORAGE_KEY);
      if (!rawPot || Number(rawPot) === PREVIOUS_OFFICIAL_POT_SCALE) {
        localStorage.setItem(POT_STORAGE_KEY, String(OFFICIAL_POT_SCALE));
      }

      migrateStoredObject(
        LAYOUT_ARROW_STORAGE_KEY,
        PREVIOUS_OFFICIAL_ARROWS,
        OFFICIAL_ARROWS,
      );

      localStorage.setItem(PRESET_MIGRATION_KEY, "4");
    } catch (_) {
      // Runtime layout defaults still work when storage is unavailable.
    }
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

  function applyOfficialSizes({ persist = false } = {}) {
    if (window.LayoutSizeController?.setSize) {
      Object.entries(OFFICIAL_SIZES).forEach(([key, value]) => {
        window.LayoutSizeController.setSize(key, value, { persist });
      });
      return;
    }

    Object.entries(OFFICIAL_SIZES).forEach(([key, value]) => {
      document.documentElement.style.setProperty(SIZE_CSS_VARS[key], `${value}px`);
    });
    if (persist) {
      try { localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(OFFICIAL_SIZES)); } catch (_) {}
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
    button.title = "套用網站官方版面、指定牌卡大小與 70% 底池大小";
    button.setAttribute("aria-label", "套用官方預設版面");
  }

  migratePreviousOfficialDefaults();
  applyOfficialConstants();
  labelOfficialResetButton();

  document.addEventListener("click", event => {
    const button = event.target.closest?.("#resetLayoutButton, #resetLayoutSizesButton");
    if (!button) return;

    window.setTimeout(() => {
      if (button.id === "resetLayoutButton") {
        applyOfficialLayout({ persist: true, announceResult: false });
      } else {
        applyOfficialSizes({ persist: true });
        applyOfficialPot({ persist: true });
      }
      labelOfficialResetButton();
    }, 0);
  }, true);

  window.OfficialLayoutPreset = Object.freeze({
    version: "3.0.0",
    layout: cloneLayout(),
    sizes: { ...OFFICIAL_SIZES },
    potScale: OFFICIAL_POT_SCALE,
    arrows: { ...OFFICIAL_ARROWS },
    apply: applyOfficialLayout,
  });
})();
