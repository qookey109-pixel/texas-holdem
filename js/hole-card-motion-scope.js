// Keep hole-card dealing separate from public-board dealing.
(() => {
  "use strict";

  const VERSION = "1.0.0";
  const STYLE_ID = "hole-card-motion-scope-v1";
  if (window.HoleCardMotionScope?.version === VERSION) return;

  let installed = false;
  let originalRender = null;
  let wrappedRender = null;

  function currentPhase() {
    return Array.isArray(state?.board) && state.board.length > 0 ? "locked" : "deal";
  }

  function syncPhase() {
    const phase = currentPhase();
    document.documentElement.dataset.holeCardMotion = phase;
    return phase;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[data-hole-card-motion="locked"] #playerCards > .card,
      html[data-hole-card-motion="locked"] .seat-card-zone .cards > .card {
        animation-name: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    if (typeof window.render !== "function") return false;

    installStyle();
    originalRender = window.render;
    wrappedRender = function renderWithScopedCardMotion(...args) {
      syncPhase();
      return originalRender.apply(this, args);
    };
    window.render = wrappedRender;
    installed = true;
    syncPhase();
    return true;
  }

  window.HoleCardMotionScope = {
    version: VERSION,
    install,
    refresh: syncPhase,
    status() {
      return {
        installed,
        phase: syncPhase(),
        boardCount: Array.isArray(state?.board) ? state.board.length : 0,
        styleInstalled: Boolean(document.getElementById(STYLE_ID)),
      };
    },
  };

  install();
})();
