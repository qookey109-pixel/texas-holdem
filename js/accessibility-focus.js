// Desktop keyboard focus management for dialogs and AI profile panels.
(() => {
  "use strict";

  if (window.DesktopAccessibilityFocus?.version) return;

  const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const dialogState = new WeakMap();
  let aiReturnPosition = null;

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function focusableElements(container) {
    if (!(container instanceof HTMLElement)) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(visible);
  }

  function safeFocus(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected || !visible(element)) return false;
    element.focus({ preventScroll: true });
    return document.activeElement === element;
  }

  function nextFrame(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  }

  function activateDialog(container, { initialFocus, returnFocus } = {}) {
    if (!(container instanceof HTMLElement)) return;
    const previous = returnFocus instanceof HTMLElement
      ? returnFocus
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogState.set(container, { returnFocus: previous });

    nextFrame(() => {
      if (!visible(container)) return;
      const first = initialFocus instanceof HTMLElement
        ? initialFocus
        : focusableElements(container)[0];
      if (!safeFocus(first)) {
        container.tabIndex = -1;
        safeFocus(container);
      }
    });
  }

  function deactivateDialog(container, fallback) {
    const remembered = container instanceof HTMLElement
      ? dialogState.get(container)?.returnFocus
      : null;
    if (container instanceof HTMLElement) dialogState.delete(container);
    const target = fallback instanceof HTMLElement ? fallback : remembered;
    nextFrame(() => safeFocus(target));
  }

  function trapTab(event, container) {
    if (event.key !== "Tab" || !(container instanceof HTMLElement)) return false;
    const items = focusableElements(container);

    if (!items.length) {
      event.preventDefault();
      container.tabIndex = -1;
      safeFocus(container);
      return true;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      safeFocus(last);
      return true;
    }

    if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault();
      safeFocus(first);
      return true;
    }

    return false;
  }

  function installFocusStyles() {
    if (document.querySelector("#desktopAccessibilityFocusStyles")) return;
    const style = document.createElement("style");
    style.id = "desktopAccessibilityFocusStyles";
    style.textContent = `
      :where(
        button,
        a[href],
        input,
        select,
        textarea,
        [role="button"],
        [tabindex]:not([tabindex="-1"])
      ):focus-visible {
        outline: 3px solid #ffe29a !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 5px rgba(38, 210, 192, 0.34) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function patchTutorialDialog() {
    if (typeof window.openTutorial !== "function" || typeof window.closeTutorial !== "function") return;
    const originalOpen = window.openTutorial;
    const originalClose = window.closeTutorial;

    window.openTutorial = function patchedOpenTutorial(...args) {
      const returnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : els.tutorialButton;
      const result = originalOpen.apply(this, args);
      activateDialog(els.tutorialOverlay, {
        initialFocus: els.tutorialCloseButton,
        returnFocus,
      });
      return result;
    };

    window.closeTutorial = function patchedCloseTutorial(...args) {
      const result = originalClose.apply(this, args);
      deactivateDialog(els.tutorialOverlay, els.tutorialButton);
      return result;
    };
  }

  function patchSessionSummaryDialog() {
    if (typeof window.renderSessionSummary !== "function"
      || typeof window.closeSessionSummaryAndRestart !== "function") return;
    const originalRender = window.renderSessionSummary;
    const originalClose = window.closeSessionSummaryAndRestart;

    window.renderSessionSummary = function patchedRenderSessionSummary(...args) {
      const returnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : els.newHandButton;
      const result = originalRender.apply(this, args);
      activateDialog(els.sessionSummaryOverlay, {
        initialFocus: els.sessionSummaryClose,
        returnFocus,
      });
      return result;
    };

    window.closeSessionSummaryAndRestart = function patchedCloseSessionSummary(...args) {
      const result = originalClose.apply(this, args);
      deactivateDialog(els.sessionSummaryOverlay, els.newHandButton);
      return result;
    };
  }

  function aiSeat(position) {
    return document.querySelector(`#opponents .seat[data-profile-position="${position}"]`);
  }

  function syncAiSemantics() {
    const panel = els.aiProfilePanel;
    if (panel) {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "AI 角色資訊");
      panel.setAttribute("aria-modal", "false");
    }

    document.querySelectorAll("#opponents .seat[data-profile-position]").forEach(seat => {
      const expanded = !panel?.hidden
        && Number(seat.dataset.profilePosition) === Number(state.selectedProfilePosition);
      seat.setAttribute("aria-controls", "aiProfilePanel");
      seat.setAttribute("aria-expanded", String(expanded));
    });
  }

  function focusAiPanel(position) {
    aiReturnPosition = String(position);
    nextFrame(() => {
      syncAiSemantics();
      if (els.aiProfilePanel?.hidden) return;
      safeFocus(els.aiProfilePanel.querySelector("[data-profile-close]"));
    });
  }

  function restoreAiSeat(position = aiReturnPosition) {
    const targetPosition = position == null ? null : String(position);
    aiReturnPosition = null;
    nextFrame(() => {
      syncAiSemantics();
      if (targetPosition !== null) safeFocus(aiSeat(targetPosition));
    });
  }

  function installAiProfileFocus() {
    syncAiSemantics();
    if (!els.arena) return;

    els.arena.addEventListener("click", event => {
      const close = event.target.closest("[data-profile-close]");
      if (close) {
        restoreAiSeat();
        return;
      }

      const seat = event.target.closest(".seat[data-profile-position]");
      if (seat && !state.layout.editing) focusAiPanel(seat.dataset.profilePosition);
    });

    els.arena.addEventListener("keydown", event => {
      const seat = event.target.closest(".seat[data-profile-position]");
      if (!seat || state.layout.editing) return;
      if (event.key === "Enter" || event.key === " ") {
        focusAiPanel(seat.dataset.profilePosition);
      }
    });

    const observer = new MutationObserver(syncAiSemantics);
    if (els.opponents) observer.observe(els.opponents, { childList: true });
    if (els.aiProfilePanel) {
      observer.observe(els.aiProfilePanel, {
        attributes: true,
        attributeFilter: ["hidden"],
        childList: true,
      });
    }
  }

  function visibleDialog() {
    if (visible(els.sessionSummaryOverlay)) return els.sessionSummaryOverlay;
    if (visible(els.tutorialOverlay)) return els.tutorialOverlay;
    return null;
  }

  function installGlobalKeyboardHandling() {
    document.addEventListener("keydown", event => {
      const dialog = visibleDialog();
      if (dialog) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (dialog === els.sessionSummaryOverlay) closeSessionSummaryAndRestart();
          else closeTutorial();
          return;
        }
        trapTab(event, dialog);
        return;
      }

      if (event.key === "Escape" && visible(els.aiProfilePanel)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const returnPosition = aiReturnPosition ?? state.selectedProfilePosition;
        state.selectedProfilePosition = null;
        render();
        restoreAiSeat(returnPosition);
      }
    }, true);
  }

  installFocusStyles();
  patchTutorialDialog();
  patchSessionSummaryDialog();
  installAiProfileFocus();
  installGlobalKeyboardHandling();

  window.DesktopAccessibilityFocus = Object.freeze({
    version: "1.0.0",
    focusableElements,
    trapTab,
    syncAiSemantics,
  });
})();
