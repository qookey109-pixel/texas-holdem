// Low-risk presentation and accessibility polish for the existing poker UI.
(() => {
  "use strict";

  if (window.UiPolishAccessibilityV1?.version) return;

  const VERSION = "1.0.0";
  const CLOSE_MS = 150;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function installStyles() {
    if (document.getElementById("uiPolishAccessibilityStylesV1")) return;

    const style = document.createElement("style");
    style.id = "uiPolishAccessibilityStylesV1";
    style.textContent = `
      .quick-bets button.is-selected,
      .quick-bets button[aria-pressed="true"] {
        border-color: rgba(112,216,201,.58) !important;
        background:
          linear-gradient(180deg, rgba(112,216,201,.2), rgba(112,216,201,.07)) !important;
        color: var(--cyan) !important;
        box-shadow:
          inset 0 0 0 1px rgba(112,216,201,.1),
          0 6px 16px rgba(0,0,0,.18) !important;
      }

      .tutorial-overlay:not([hidden]):not(.ui-polish-closing),
      .session-summary-overlay:not([hidden]):not(.ui-polish-closing) {
        animation: uiPolishOverlayIn 170ms ease-out both;
      }
      .tutorial-overlay:not([hidden]):not(.ui-polish-closing) .tutorial-modal,
      .session-summary-overlay:not([hidden]):not(.ui-polish-closing) .session-summary-modal {
        animation: uiPolishModalIn 190ms cubic-bezier(.2,.78,.2,1) both;
      }
      .tutorial-overlay.ui-polish-closing,
      .session-summary-overlay.ui-polish-closing {
        animation: uiPolishOverlayOut ${CLOSE_MS}ms ease-in both;
        pointer-events: none;
      }
      .tutorial-overlay.ui-polish-closing .tutorial-modal,
      .session-summary-overlay.ui-polish-closing .session-summary-modal {
        animation: uiPolishModalOut ${CLOSE_MS}ms ease-in both;
      }

      .arena [data-layout-key] {
        transition:
          outline-color 160ms ease,
          box-shadow 160ms ease,
          filter 160ms ease,
          opacity 160ms ease;
      }
      .arena.layout-edit-mode [data-layout-key] {
        animation: uiPolishLayoutEditIn 170ms ease-out both;
      }

      @keyframes uiPolishOverlayIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes uiPolishOverlayOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes uiPolishModalIn {
        from { opacity: 0; transform: translateY(7px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes uiPolishModalOut {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(4px) scale(.992); }
      }
      @keyframes uiPolishLayoutEditIn {
        from { filter: brightness(.94); }
        to { filter: brightness(1); }
      }

      @media (prefers-reduced-motion: reduce) {
        .arena *,
        .arena *::before,
        .arena *::after,
        .tutorial-overlay,
        .tutorial-overlay *,
        .tutorial-overlay *::before,
        .tutorial-overlay *::after,
        .session-summary-overlay,
        .session-summary-overlay *,
        .session-summary-overlay *::before,
        .session-summary-overlay *::after,
        .layout-editor-panel,
        .layout-editor-panel *,
        .layout-editor-panel *::before,
        .layout-editor-panel *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .01ms !important;
          transition-delay: 0ms !important;
          scroll-behavior: auto !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setQuickBetSelection(selectedButton = null) {
    document.querySelectorAll(".quick-bets button[data-bet]").forEach(button => {
      const selected = button === selectedButton;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function installQuickBetState() {
    const group = document.querySelector(".quick-bets");
    const slider = document.querySelector("#raiseAmount");
    if (!group) return;

    setQuickBetSelection();
    group.addEventListener("click", event => {
      const button = event.target.closest("button[data-bet]");
      if (!button || button.disabled) return;
      setQuickBetSelection(button);
    });
    slider?.addEventListener("input", () => setQuickBetSelection());

    ["#foldButton", "#callButton", "#raiseButton", "#allInButton", "#newHandButton"].forEach(selector => {
      document.querySelector(selector)?.addEventListener("click", () => setQuickBetSelection());
    });
  }

  function installTutorialSemantics() {
    const button = document.querySelector("#tutorialButton");
    if (button && !button.hasAttribute("aria-pressed")) button.setAttribute("aria-pressed", "false");
  }

  function installLayoutLabels() {
    const autoButton = document.querySelector("#autoLayoutButton");
    if (!autoButton) return;
    autoButton.textContent = "📐 套用官方版面";
    autoButton.title = "套用目前官方預設位置；不會清除已儲存的自訂版面";
    autoButton.setAttribute("aria-label", "套用官方版面");
  }

  function animateClose(overlay, finish) {
    if (!overlay || overlay.hidden || reducedMotion.matches) {
      finish();
      return;
    }
    if (overlay.classList.contains("ui-polish-closing")) return;

    overlay.classList.add("ui-polish-closing");
    window.setTimeout(() => {
      try {
        finish();
      } finally {
        overlay.classList.remove("ui-polish-closing");
      }
    }, CLOSE_MS);
  }

  function installOverlayClosePolish() {
    if (typeof window.closeTutorial === "function" && !window.closeTutorial.__uiPolishV1) {
      const originalCloseTutorial = window.closeTutorial;
      const wrappedCloseTutorial = function(...args) {
        animateClose(document.querySelector("#tutorialOverlay"), () => originalCloseTutorial.apply(this, args));
      };
      wrappedCloseTutorial.__uiPolishV1 = true;
      window.closeTutorial = wrappedCloseTutorial;
    }

    if (typeof window.closeSessionSummaryAndRestart === "function" && !window.closeSessionSummaryAndRestart.__uiPolishV1) {
      const originalCloseSummary = window.closeSessionSummaryAndRestart;
      const wrappedCloseSummary = function(...args) {
        animateClose(document.querySelector("#sessionSummaryOverlay"), () => originalCloseSummary.apply(this, args));
      };
      wrappedCloseSummary.__uiPolishV1 = true;
      window.closeSessionSummaryAndRestart = wrappedCloseSummary;
    }
  }

  function install() {
    installStyles();
    installTutorialSemantics();
    installQuickBetState();
    installLayoutLabels();
    installOverlayClosePolish();
  }

  window.UiPolishAccessibilityV1 = Object.freeze({
    version: VERSION,
    install,
    setQuickBetSelection,
    isReducedMotion: () => reducedMotion.matches,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
