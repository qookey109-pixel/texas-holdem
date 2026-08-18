// Final runtime authority for the official table layout.
//
// Layout V4 owns persisted coordinates, while several presentation controllers
// load later during boot. Keep the arena hidden until those controllers exist,
// then reconcile the final rendered state exactly once before first reveal.
(() => {
  "use strict";

  const VERSION = "1.0.0";
  if (window.OfficialLayoutRuntimeAuthorityV1?.version === VERSION) return;

  const READY_ATTRIBUTE = "data-official-layout-runtime-ready";
  const STYLE_ID = "officialLayoutRuntimeAuthorityV1Styles";
  const SIZE_STORAGE_KEY = "texasHoldemLayoutSizesV2";
  const POT_STORAGE_KEY = "texasHoldemPotScaleV1";
  const STARTED_AT = performance.now();
  const WAIT_TIMEOUT_MS = 3000;
  let attempts = 0;
  let lastMode = "pending";
  let lastReason = "boot";

  function installRevealGuard() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html:not([${READY_ATTRIBUTE}="true"]) #arena {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function hasExplicitCustomLayout() {
    const preferenceKey = window.OfficialLayoutPreset?.preferenceKey || "texasHoldemLayoutPreferenceV2";
    return readStorage(preferenceKey) === "custom"
      && Boolean(readStorage("texasHoldemTableLayoutV4"));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function applyOfficialDimensions(preset) {
    const sizes = preset?.sizes || {};
    Object.entries(sizes).forEach(([key, value]) => {
      if (window.LayoutSizeController?.setSize) {
        window.LayoutSizeController.setSize(key, value, { persist: false });
      }
    });

    const potScale = Number(preset?.potScale) || 70;
    if (window.LayoutCornerResize?.setPotScale) {
      window.LayoutCornerResize.setPotScale(potScale, { persist: false });
    } else {
      document.documentElement.style.setProperty(
        "--layout-pot-scale",
        (potScale / 100).toFixed(3),
      );
    }

    try {
      localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(sizes));
      localStorage.setItem(POT_STORAGE_KEY, String(potScale));
    } catch (_) {
      // Runtime CSS remains authoritative when storage is unavailable.
    }
  }

  function reconcile({ reason = "manual", reveal = true } = {}) {
    attempts += 1;
    lastReason = reason;

    const preset = window.OfficialLayoutPreset;
    if (!preset || typeof state !== "object" || !state?.layout || typeof applyLayout !== "function") {
      return false;
    }

    const custom = hasExplicitCustomLayout();
    lastMode = custom ? "custom" : "official";

    if (!custom) {
      state.layout.items = clone(preset.layout);
      state.layout.arrows = { ...preset.arrows };
      if (typeof normalizePanelPosition === "function") {
        state.layout.panel = normalizePanelPosition(null);
      }
      applyOfficialDimensions(preset);

      try {
        localStorage.setItem(preset.preferenceKey || "texasHoldemLayoutPreferenceV2", "official");
      } catch (_) {
        // State and CSS are still valid without persistence.
      }
    }

    applyLayout();

    if (reveal) {
      document.documentElement.setAttribute(READY_ATTRIBUTE, "true");
    }
    return true;
  }

  function bootReconcile() {
    const controllerReady = Boolean(window.LayoutSizeController?.getSizes);
    const timedOut = performance.now() - STARTED_AT >= WAIT_TIMEOUT_MS;

    if (!controllerReady && !timedOut) {
      window.requestAnimationFrame(bootReconcile);
      return;
    }

    if (!reconcile({ reason: controllerReady ? "controller-ready" : "timeout" })) {
      if (!timedOut) {
        window.requestAnimationFrame(bootReconcile);
        return;
      }
      // Never leave the table permanently hidden if another unrelated script
      // failed. Existing CSS fallbacks remain the final safety net.
      lastMode = "fallback";
      document.documentElement.setAttribute(READY_ATTRIBUTE, "true");
    }
  }

  installRevealGuard();

  window.OfficialLayoutRuntimeAuthorityV1 = Object.freeze({
    version: VERSION,
    reconcile,
    status() {
      return {
        version: VERSION,
        ready: document.documentElement.getAttribute(READY_ATTRIBUTE) === "true",
        mode: lastMode,
        reason: lastReason,
        attempts,
        layoutReady: document.documentElement.dataset.layoutReady || "",
        presetVersion: window.OfficialLayoutPreset?.version || "",
        sizes: window.LayoutSizeController?.getSizes?.() || null,
        potScale: window.LayoutCornerResize?.getPotScale?.()
          ?? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--layout-pot-scale")) * 100
          ?? null,
      };
    },
  });

  window.requestAnimationFrame(bootReconcile);
})();
