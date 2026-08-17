// Layout V4: one official baseline, one explicit custom generation.
(() => {
  "use strict";

  if (window.OfficialLayoutPreset?.version) return;

  const SIZE_STORAGE_KEY = "texasHoldemLayoutSizesV2";
  const POT_STORAGE_KEY = "texasHoldemPotScaleV1";
  const LEGACY_STORAGE_KEYS = Object.freeze([
    "texasHoldemTableLayoutV1",
    "texasHoldemTableLayoutV2",
    "texasHoldemTableLayoutV3",
    "texasHoldemLayoutPanelPositionV1",
    "texasHoldemDialogueArrowsV1",
    "texasHoldemLayoutPreferenceV1",
    "texasHoldemOfficialLayoutPresetVersionV1",
  ]);

  const OFFICIAL_LAYOUT = Object.freeze(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
  const OFFICIAL_SIZES = Object.freeze({
    heroCard: 70,
    boardCard: 68,
    aiCard: 44,
    aiSeat: 176,
    aiProfile: 272,
  });
  const OFFICIAL_POT_SCALE = 70;
  const OFFICIAL_ARROWS = Object.freeze({ ...DEFAULT_DIALOGUE_ARROWS });
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

  function clearLegacyStorage() {
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  }

  function clearV4CustomStorage() {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_PANEL_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_ARROW_STORAGE_KEY);
  }

  function persistOfficialDimensions() {
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(OFFICIAL_SIZES));
    localStorage.setItem(POT_STORAGE_KEY, String(OFFICIAL_POT_SCALE));
  }

  function prepareStorageGeneration() {
    try {
      clearLegacyStorage();

      const explicitCustom = localStorage.getItem(LAYOUT_PREFERENCE_KEY) === "custom";
      const hasV4Layout = Boolean(localStorage.getItem(LAYOUT_STORAGE_KEY));
      if (explicitCustom && hasV4Layout) return;

      clearV4CustomStorage();
      persistOfficialDimensions();
      localStorage.setItem(LAYOUT_PREFERENCE_KEY, "official");
    } catch (_) {
      // Runtime defaults remain authoritative when storage is unavailable.
    }
  }

  function applyOfficialConstants() {
    Object.entries(OFFICIAL_LAYOUT).forEach(([key, value]) => {
      if (DEFAULT_LAYOUT[key]) Object.assign(DEFAULT_LAYOUT[key], value);
      else DEFAULT_LAYOUT[key] = { ...value };
    });
    Object.assign(DEFAULT_DIALOGUE_ARROWS, OFFICIAL_ARROWS);
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
      return;
    }

    document.documentElement.style.setProperty(
      "--layout-pot-scale",
      (OFFICIAL_POT_SCALE / 100).toFixed(3),
    );
    if (persist) {
      try { localStorage.setItem(POT_STORAGE_KEY, String(OFFICIAL_POT_SCALE)); } catch (_) {}
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

    if (persist) {
      try {
        clearLegacyStorage();
        clearV4CustomStorage();
        persistOfficialDimensions();
        localStorage.setItem(LAYOUT_PREFERENCE_KEY, "official");
      } catch (error) {
        console.warn("Official layout preset save failed:", error);
      }
    }

    if (typeof updateLayoutEditorUI === "function") updateLayoutEditorUI();
    if (announceResult && typeof announce === "function") announce("已套用官方預設版面");
  }

  function labelOfficialButton() {
    const resetButton = document.querySelector("#resetLayoutButton");
    if (!resetButton) return;
    resetButton.textContent = "⭐ 官方預設";
    resetButton.title = "清除自訂版面並回到網站官方位置、大小與底池設定";
    resetButton.setAttribute("aria-label", "清除自訂版面並套用官方預設");
  }

  prepareStorageGeneration();
  applyOfficialConstants();
  labelOfficialButton();

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
      labelOfficialButton();
    }, 0);
  }, true);

  window.OfficialLayoutPreset = Object.freeze({
    version: "4.0.0",
    storageGeneration: "V4",
    layout: cloneLayout(),
    sizes: { ...OFFICIAL_SIZES },
    potScale: OFFICIAL_POT_SCALE,
    arrows: { ...OFFICIAL_ARROWS },
    preferenceKey: LAYOUT_PREFERENCE_KEY,
    apply: applyOfficialLayout,
  });
})();