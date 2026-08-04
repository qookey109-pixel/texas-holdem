// Keep hole-card dealing separate from public-board dealing.
(() => {
  "use strict";

  const VERSION = "1.1.0";
  const STYLE_ID = "hole-card-motion-scope-v2";
  if (window.HoleCardMotionScope?.version === VERSION) return;

  let installed = false;
  let boardObserver = null;

  function renderedBoardHasCards() {
    return Boolean(document.querySelector("#boardCards > .card:not(.back)"));
  }

  function currentPhase() {
    return renderedBoardHasCards() ? "locked" : "deal";
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
      html:has(#boardCards > .card:not(.back)) #playerCards > .card,
      html:has(#boardCards > .card:not(.back)) .seat-card-zone .cards > .card,
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

  function observeBoard() {
    const boardCards = document.querySelector("#boardCards");
    if (!boardCards || boardObserver) return;
    boardObserver = new MutationObserver(syncPhase);
    boardObserver.observe(boardCards, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function install() {
    if (installed) return true;
    installStyle();
    observeBoard();
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
        boardCount: document.querySelectorAll("#boardCards > .card:not(.back)").length,
        styleInstalled: Boolean(document.getElementById(STYLE_ID)),
        observerInstalled: Boolean(boardObserver),
      };
    },
  };

  install();
})();
