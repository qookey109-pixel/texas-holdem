// Paint community cards before rebuilding the full table on street transitions.
(() => {
  "use strict";

  if (window.StreetTransitionPerformance?.version) return;

  const VERSION = "1.0.0";
  const FRAME_FALLBACK_MS = 18;
  let installed = false;
  let originalAdvanceStreet = null;
  let originalRender = null;
  let suppressNextFullRender = false;
  let firstFrameId = 0;
  let secondFrameId = 0;
  let scheduledHandNumber = 0;
  let previewCount = 0;
  let skippedRenderCount = 0;
  let scheduledFullRenderCount = 0;

  function requestFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return window.setTimeout(() => callback(performance.now()), FRAME_FALLBACK_MS);
  }

  function cancelFrame(id) {
    if (!id) return;
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
    else window.clearTimeout(id);
  }

  function clearPreviewMarkers() {
    document.documentElement.removeAttribute("data-street-preview-pending");
    if (typeof els === "object") els.boardCards?.removeAttribute?.("data-street-preview");
  }

  function clearScheduledFrames({ clearSuppression = true, clearMarkers = true } = {}) {
    cancelFrame(firstFrameId);
    cancelFrame(secondFrameId);
    firstFrameId = 0;
    secondFrameId = 0;
    scheduledHandNumber = 0;
    if (clearSuppression) suppressNextFullRender = false;
    if (clearMarkers) clearPreviewMarkers();
  }

  function disableActionControls() {
    if (typeof els !== "object") return;
    for (const button of [els.foldButton, els.callButton, els.raiseButton, els.allInButton]) {
      if (button) button.disabled = true;
    }
    els.quickBets?.querySelectorAll?.("button")?.forEach(button => {
      button.disabled = true;
    });
    els.playerTurnMarker?.classList?.remove("is-visible");
  }

  function renderStreetPreview() {
    if (typeof state !== "object" || typeof els !== "object" || !els.boardCards || typeof renderCard !== "function") {
      return false;
    }

    const animateCards = typeof shouldAnimateCards === "function" ? shouldAnimateCards() : true;
    els.boardCards.innerHTML = state.board.length
      ? state.board.map((card, index) => renderCard(card, index, { animate: animateCards })).join("")
      : Array.from({ length: 5 }, (_, index) => renderCard(null, index, { animate: animateCards })).join("");

    if (els.boardStageLabel && typeof streetLabel === "function") {
      els.boardStageLabel.textContent = streetLabel();
    }
    if (els.streetValue) els.streetValue.textContent = state.street;
    if (els.currentBetValue) els.currentBetValue.textContent = state.currentBet;

    disableActionControls();
    els.boardCards.dataset.streetPreview = "true";
    document.documentElement.dataset.streetPreviewPending = "true";
    previewCount += 1;
    return true;
  }

  function scheduleFullRender() {
    clearScheduledFrames({ clearSuppression: false, clearMarkers: false });
    scheduledHandNumber = Number(state?.handNumber) || 0;
    const handNumber = scheduledHandNumber;
    document.documentElement.dataset.streetPreviewPending = "true";

    firstFrameId = requestFrame(() => {
      firstFrameId = 0;
      secondFrameId = requestFrame(() => {
        secondFrameId = 0;
        scheduledHandNumber = 0;
        clearPreviewMarkers();

        if (Number(state?.handNumber) !== handNumber || state?.handOver) return;
        scheduledFullRenderCount += 1;
        originalRender?.();
      });
    });
  }

  function install() {
    if (installed) return true;
    if (typeof window.advanceStreet !== "function" || typeof window.render !== "function") return false;

    originalAdvanceStreet = window.advanceStreet;
    originalRender = window.render;

    window.advanceStreet = function advanceStreetWithEarlyCommunityCardPaint(...args) {
      const boardCountBefore = Number(state?.board?.length) || 0;
      const result = originalAdvanceStreet.apply(this, args);
      const boardCountAfter = Number(state?.board?.length) || 0;

      if (!state?.handOver && boardCountAfter > boardCountBefore && boardCountAfter <= 5) {
        if (renderStreetPreview()) {
          suppressNextFullRender = true;
          scheduleFullRender();
        }
      }
      return result;
    };

    window.render = function renderWithStreetPreviewYield(...args) {
      const currentHandNumber = Number(state?.handNumber) || 0;
      if (suppressNextFullRender && currentHandNumber === scheduledHandNumber) {
        suppressNextFullRender = false;
        skippedRenderCount += 1;
        return;
      }

      if (firstFrameId || secondFrameId || suppressNextFullRender) {
        clearScheduledFrames();
      }
      return originalRender.apply(this, args);
    };

    installed = true;
    return true;
  }

  function resetMetrics() {
    previewCount = 0;
    skippedRenderCount = 0;
    scheduledFullRenderCount = 0;
  }

  window.StreetTransitionPerformance = {
    version: VERSION,
    install,
    cancel: () => clearScheduledFrames(),
    resetMetrics,
    status() {
      return {
        installed,
        previewCount,
        skippedRenderCount,
        scheduledFullRenderCount,
        pending: Boolean(firstFrameId || secondFrameId),
        scheduledHandNumber,
      };
    },
  };

  install();
})();
