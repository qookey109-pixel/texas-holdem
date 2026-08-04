// Desktop keyboard focus management for existing dialogs and AI profile panels.
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
  let focusedAiSeatPosition = null;
  let restoreAiOnClose = false;
  let aiFocusRequestId = 0;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
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

  function focusAiWhenReady(resolveTarget, shouldContinue) {
    const requestId = ++aiFocusRequestId;
    let attemptsRemaining = 40;
    let stableFrames = 0;

    const attempt = () => {
      if (requestId !== aiFocusRequestId || !shouldContinue()) return;

      const target = resolveTarget();
      if (safeFocus(target)) {
        stableFrames += 1;
        if (stableFrames >= 2) return;
      } else {
        stableFrames = 0;
      }

      attemptsRemaining -= 1;
      if (attemptsRemaining <= 0) return;
      requestAnimationFrame(() => window.setTimeout(attempt, 16));
    };

    requestAnimationFrame(attempt);
  }

  function activeElementOr(fallback) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.isConnected) return active;
    return fallback instanceof HTMLElement ? fallback : null;
  }

  function activateDialog(container, { initialFocus, fallbackReturnFocus } = {}) {
    if (!(container instanceof HTMLElement)) return;
    if (!dialogState.has(container)) {
      dialogState.set(container, {
        returnFocus: activeElementOr(fallbackReturnFocus),
      });
    }

    nextFrame(() => {
      if (!visible(container)) return;
      const preferred = initialFocus instanceof HTMLElement ? initialFocus : null;
      const first = preferred || focusableElements(container)[0];
      if (!safeFocus(first)) {
        container.tabIndex = -1;
        safeFocus(container);
      }
    });
  }

  function deactivateDialog(container, fallbackReturnFocus) {
    if (!(container instanceof HTMLElement)) return;
    const remembered = dialogState.get(container)?.returnFocus;
    dialogState.delete(container);
    const target = remembered instanceof HTMLElement ? remembered : fallbackReturnFocus;
    nextFrame(() => safeFocus(target));
  }

  function watchDialog(container, options) {
    if (!(container instanceof HTMLElement)) return;
    let wasVisible = visible(container);
    if (wasVisible) activateDialog(container, options);

    const observer = new MutationObserver(() => {
      const isVisible = visible(container);
      if (isVisible && !wasVisible) activateDialog(container, options);
      if (!isVisible && wasVisible) deactivateDialog(container, options.fallbackReturnFocus);
      wasVisible = isVisible;
    });
    observer.observe(container, {
      attributes: true,
      attributeFilter: ["hidden", "class", "style"],
    });
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

  function aiSeat(position) {
    if (position == null) return null;
    return document.querySelector(`#opponents .seat[data-profile-position="${String(position)}"]`);
  }

  function selectedAiPosition() {
    return state?.selectedProfilePosition ?? aiReturnPosition;
  }

  function syncAiSemantics() {
    const panel = els?.aiProfilePanel;
    if (panel) {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "AI 角色資訊");
      panel.setAttribute("aria-modal", "false");
    }

    const selected = selectedAiPosition();
    document.querySelectorAll("#opponents .seat[data-profile-position]").forEach(seat => {
      const expanded = Boolean(panel && !panel.hidden)
        && String(seat.dataset.profilePosition) === String(selected);
      seat.setAttribute("aria-controls", "aiProfilePanel");
      seat.setAttribute("aria-expanded", String(expanded));
    });
  }

  function openAiProfileFromKeyboard(event, seat, panel) {
    event.preventDefault();
    event.stopPropagation();
    const position = String(seat.dataset.profilePosition);
    aiReturnPosition = position;
    focusedAiSeatPosition = position;
    restoreAiOnClose = false;
    state.selectedProfilePosition = Number(position);
    render();
    focusAiWhenReady(
      () => panel.querySelector("[data-profile-close]"),
      () => visible(panel),
    );
  }

  function closeAiProfileFromKeyboard(event) {
    event.preventDefault();
    event.stopPropagation();
    aiReturnPosition = String(selectedAiPosition() ?? aiReturnPosition ?? "");
    focusedAiSeatPosition = aiReturnPosition || focusedAiSeatPosition;
    restoreAiOnClose = true;
    state.selectedProfilePosition = null;
    render();
  }

  function installAiProfileFocus() {
    const panel = els?.aiProfilePanel;
    if (!(panel instanceof HTMLElement)) return;

    let wasVisible = visible(panel);
    syncAiSemantics();

    document.addEventListener("focusin", event => {
      const seat = event.target.closest?.(".seat[data-profile-position]");
      if (seat) {
        focusedAiSeatPosition = seat.dataset.profilePosition;
        return;
      }
      if (!event.target.closest?.("#aiProfilePanel")) focusedAiSeatPosition = null;
    }, true);

    document.addEventListener("pointerdown", event => {
      const seat = event.target.closest?.(".seat[data-profile-position]");
      if (seat && !state.layout.editing) {
        aiReturnPosition = seat.dataset.profilePosition;
        restoreAiOnClose = false;
      }

      if (event.target.closest?.("[data-profile-close]")) {
        aiReturnPosition = String(selectedAiPosition() ?? "");
        focusedAiSeatPosition = aiReturnPosition || focusedAiSeatPosition;
        restoreAiOnClose = true;
      }
    }, true);

    document.addEventListener("keydown", event => {
      const activates = event.key === "Enter" || event.key === " ";
      if (!activates) return;

      const closeButton = event.target.closest?.("[data-profile-close]");
      if (closeButton) {
        closeAiProfileFromKeyboard(event);
        return;
      }

      const seat = event.target.closest?.(".seat[data-profile-position]");
      if (seat && !state.layout.editing) openAiProfileFromKeyboard(event, seat, panel);
    }, true);

    const observer = new MutationObserver(() => {
      const isVisible = visible(panel);
      syncAiSemantics();

      if (isVisible && (!wasVisible || !panel.contains(document.activeElement))) {
        aiReturnPosition = String(selectedAiPosition() ?? aiReturnPosition ?? "");
        focusAiWhenReady(
          () => panel.querySelector("[data-profile-close]"),
          () => visible(panel),
        );
      }

      if (!isVisible && wasVisible) {
        const position = aiReturnPosition;
        aiFocusRequestId += 1;
        if (restoreAiOnClose && position !== null && position !== "") {
          focusedAiSeatPosition = position;
          focusAiWhenReady(
            () => aiSeat(position),
            () => !visible(panel),
          );
        }
        restoreAiOnClose = false;
      }

      wasVisible = isVisible;
    });

    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["hidden"],
      childList: true,
    });

    if (els.opponents) {
      const seatObserver = new MutationObserver(() => {
        syncAiSemantics();
        const position = focusedAiSeatPosition;
        const active = document.activeElement;
        const focusWasLost = active === document.body || !(active instanceof HTMLElement) || !active.isConnected;
        if (!visible(panel) && position && focusWasLost) {
          focusAiWhenReady(
            () => aiSeat(position),
            () => !visible(panel) && focusedAiSeatPosition === position,
          );
        }
      });
      seatObserver.observe(els.opponents, { childList: true });
    }
  }

  function visibleModalDialog() {
    if (visible(els?.sessionSummaryOverlay)) return els.sessionSummaryOverlay;
    if (visible(els?.tutorialOverlay)) return els.tutorialOverlay;
    return null;
  }

  function installGlobalKeyboardHandling() {
    document.addEventListener("keydown", event => {
      const dialog = visibleModalDialog();
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

      if (event.key === "Escape" && visible(els?.aiProfilePanel)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        aiReturnPosition = String(selectedAiPosition() ?? aiReturnPosition ?? "");
        focusedAiSeatPosition = aiReturnPosition || focusedAiSeatPosition;
        restoreAiOnClose = true;
        state.selectedProfilePosition = null;
        render();
      }
    }, true);
  }

  installFocusStyles();
  watchDialog(els?.tutorialOverlay, {
    initialFocus: els?.tutorialCloseButton,
    fallbackReturnFocus: els?.tutorialButton,
  });
  watchDialog(els?.sessionSummaryOverlay, {
    initialFocus: els?.sessionSummaryClose,
    fallbackReturnFocus: els?.newHandButton,
  });
  installAiProfileFocus();
  installGlobalKeyboardHandling();

  window.DesktopAccessibilityFocus = Object.freeze({
    version: "2.1.0",
    focusableElements,
    trapTab,
    syncAiSemantics,
  });
})();
