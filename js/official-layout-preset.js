// Layout V4: one official baseline, one explicit custom generation.
(() => {
  "use strict";

  if (window.OfficialLayoutPreset?.version) return;

  const VERSION = "4.0.1";
  const RUNTIME_AUTHORITY_VERSION = "1.0.0";
  const READABILITY_VERSION = "1.2.0";
  const READABILITY_SRC = "js/layout-readability-trial.js?v=runtime-20260821-r1";
  const SIZE_STORAGE_KEY = "texasHoldemLayoutSizesV2";
  const POT_STORAGE_KEY = "texasHoldemPotScaleV1";
  const RUNTIME_READY_ATTRIBUTE = "data-official-layout-runtime-ready";
  const RUNTIME_GUARD_STYLE_ID = "officialLayoutRuntimeGuardV1";
  const RUNTIME_WAIT_TIMEOUT_MS = 3000;
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

  const runtimeStartedAt = performance.now();
  let runtimeAttempts = 0;
  let runtimeMode = "pending";
  let runtimeReason = "boot";

  const cloneLayout = () => JSON.parse(JSON.stringify(OFFICIAL_LAYOUT));

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

  function hasExplicitCustomLayout() {
    try {
      return localStorage.getItem(LAYOUT_PREFERENCE_KEY) === "custom"
        && Boolean(localStorage.getItem(LAYOUT_STORAGE_KEY));
    } catch (_) {
      return false;
    }
  }

  function prepareStorageGeneration() {
    try {
      clearLegacyStorage();
      if (hasExplicitCustomLayout()) return;
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

    document.documentElement.dataset.layoutStartupApplied = "true";
    if (typeof updateLayoutEditorUI === "function") updateLayoutEditorUI();
    if (announceResult && typeof announce === "function") announce("已套用官方預設版面");
  }

  function installRuntimeRevealGuard() {
    if (document.getElementById(RUNTIME_GUARD_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = RUNTIME_GUARD_STYLE_ID;
    style.textContent = `
      html:not([${RUNTIME_READY_ATTRIBUTE}="true"]) #arena {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function readabilityAuthorityReady() {
    return window.LayoutReadabilityTrial?.version === READABILITY_VERSION
      && window.LayoutReadabilityTrial?.positionAuthority === "layout-v4";
  }

  function loadReadabilityAuthority() {
    if (readabilityAuthorityReady()) return;
    if (document.querySelector('script[data-layout-readability-v2]')) return;

    const script = document.createElement("script");
    script.src = READABILITY_SRC;
    script.async = false;
    script.dataset.layoutReadabilityV2 = "true";
    document.body.appendChild(script);
  }

  function scheduleReadabilityAuthorityLoad() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadReadabilityAuthority, { once: true });
    } else {
      loadReadabilityAuthority();
    }
  }

  function reconcileRuntime({ reason = "manual", reveal = true } = {}) {
    runtimeAttempts += 1;
    runtimeReason = reason;

    try {
      if (typeof state !== "object" || !state?.layout || typeof applyLayout !== "function") {
        return false;
      }

      const custom = hasExplicitCustomLayout();
      runtimeMode = custom ? "custom" : "official";

      if (!custom) {
        state.layout.items = cloneLayout();
        state.layout.arrows = { ...OFFICIAL_ARROWS };
        if (typeof normalizePanelPosition === "function") {
          state.layout.panel = normalizePanelPosition(null);
        }
        applyOfficialSizes({ persist: false });
        applyOfficialPot({ persist: false });
        try {
          persistOfficialDimensions();
          localStorage.setItem(LAYOUT_PREFERENCE_KEY, "official");
        } catch (_) {
          // Runtime CSS remains authoritative when storage is unavailable.
        }
      }

      window.LayoutReadabilityTrial?.restoreLayoutAuthority?.();
      applyLayout();
      document.documentElement.dataset.layoutStartupApplied = "true";
      if (reveal) document.documentElement.setAttribute(RUNTIME_READY_ATTRIBUTE, "true");
      return true;
    } catch (_) {
      return false;
    }
  }

  function runtimeStatus() {
    const cssPotScale = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--layout-pot-scale"),
    );
    return {
      version: RUNTIME_AUTHORITY_VERSION,
      presetVersion: VERSION,
      readabilityVersion: window.LayoutReadabilityTrial?.version || "",
      readabilityAuthority: window.LayoutReadabilityTrial?.positionAuthority || "",
      ready: document.documentElement.getAttribute(RUNTIME_READY_ATTRIBUTE) === "true",
      mode: runtimeMode,
      reason: runtimeReason,
      attempts: runtimeAttempts,
      layoutReady: document.documentElement.dataset.layoutReady || "",
      sizes: window.LayoutSizeController?.getSizes?.() || null,
      potScale: window.LayoutCornerResize?.getPotScale?.()
        ?? (Number.isFinite(cssPotScale) ? Number((cssPotScale * 100).toFixed(1)) : null),
    };
  }

  function scheduleRuntimeReconcile() {
    const attempt = () => {
      const controllerReady = Boolean(window.LayoutSizeController?.getSizes);
      const readabilityReady = readabilityAuthorityReady();
      const timedOut = performance.now() - runtimeStartedAt >= RUNTIME_WAIT_TIMEOUT_MS;

      if ((!controllerReady || !readabilityReady) && !timedOut) {
        window.requestAnimationFrame(attempt);
        return;
      }

      window.LayoutReadabilityTrial?.refresh?.();
      const reason = controllerReady && readabilityReady ? "controllers-ready" : "timeout";
      if (reconcileRuntime({ reason })) return;
      if (!timedOut) {
        window.requestAnimationFrame(attempt);
        return;
      }

      runtimeMode = "fallback";
      runtimeReason = "timeout-fallback";
      document.documentElement.setAttribute(RUNTIME_READY_ATTRIBUTE, "true");
    };

    window.requestAnimationFrame(attempt);
  }

  function labelOfficialButton() {
    const resetButton = document.querySelector("#resetLayoutButton");
    if (!resetButton) return;
    resetButton.textContent = "⭐ 官方預設";
    resetButton.title = "清除自訂版面並回到網站官方位置、大小與底池設定";
    resetButton.setAttribute("aria-label", "清除自訂版面並套用官方預設");
  }

  installRuntimeRevealGuard();
  prepareStorageGeneration();
  applyOfficialConstants();
  labelOfficialButton();
  scheduleReadabilityAuthorityLoad();

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
      reconcileRuntime({ reason: `button-${button.id}` });
      labelOfficialButton();
    }, 0);
  }, true);

  window.OfficialLayoutPreset = Object.freeze({
    version: VERSION,
    runtimeAuthorityVersion: RUNTIME_AUTHORITY_VERSION,
    storageGeneration: "V4",
    layout: cloneLayout(),
    sizes: { ...OFFICIAL_SIZES },
    potScale: OFFICIAL_POT_SCALE,
    arrows: { ...OFFICIAL_ARROWS },
    preferenceKey: LAYOUT_PREFERENCE_KEY,
    apply: applyOfficialLayout,
    reconcile: reconcileRuntime,
    runtimeStatus,
  });

  scheduleRuntimeReconcile();
})();