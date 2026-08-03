// Keep community-card street transitions responsive on Safari without rebuilding the board twice.
(() => {
  "use strict";

  if (window.StreetTransitionPerformance?.version === "2.0.0") return;
  window.StreetTransitionPerformance?.cancel?.();

  const VERSION = "2.0.0";
  const FRAME_FALLBACK_MS = 18;
  const FULL_RENDER_FALLBACK_MS = 1400;
  const COACH_IDLE_TIMEOUT_MS = 500;

  let installed = false;
  let originalAdvanceStreet = null;
  let originalRender = null;
  let suppressNextFullRender = false;
  let transitionPending = false;
  let fallbackRenderTimer = 0;
  let warmupFrameId = 0;
  let warmupSecondFrameId = 0;
  let coachIdleId = 0;
  let coachFallbackTimer = 0;
  let scheduledHandNumber = 0;
  let scheduledBoardSignature = "";
  let visibleHandNumber = -1;
  let visibleBoardSignature = "";
  let visibleBoardChildCount = 0;

  let previewCount = 0;
  let skippedRenderCount = 0;
  let scheduledFullRenderCount = 0;
  let fallbackFullRenderCount = 0;
  let explicitFullRenderCount = 0;
  let preservedBoardRenderCount = 0;
  let incrementalCardAppendCount = 0;
  let coachWarmupCount = 0;
  let lastPreviewDurationMs = 0;
  let lastFullRenderDurationMs = 0;
  let lastCoachWarmupDurationMs = 0;

  function now() {
    return typeof performance?.now === "function" ? performance.now() : Date.now();
  }

  function requestFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return window.setTimeout(() => callback(now()), FRAME_FALLBACK_MS);
  }

  function cancelFrame(id) {
    if (!id) return;
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
    else window.clearTimeout(id);
  }

  function cardIdentity(card) {
    if (!card) return "";
    if (typeof cardKey === "function") return cardKey(card);
    return `${card.value ?? card.label ?? ""}${card.suit ?? ""}`;
  }

  function boardSignature() {
    return Array.isArray(state?.board)
      ? state.board.map(cardIdentity).join("|")
      : "";
  }

  function currentHandNumber() {
    return Number(state?.handNumber) || 0;
  }

  function rememberVisibleBoard() {
    if (typeof els !== "object" || !els.boardCards) return;
    visibleHandNumber = currentHandNumber();
    visibleBoardSignature = boardSignature();
    visibleBoardChildCount = els.boardCards.children.length;
    els.boardCards.dataset.renderedHand = String(visibleHandNumber);
    els.boardCards.dataset.renderedBoard = visibleBoardSignature;
  }

  function visibleBoardMatchesState() {
    if (typeof els !== "object" || !els.boardCards) return false;
    return visibleHandNumber === currentHandNumber()
      && visibleBoardSignature === boardSignature()
      && visibleBoardChildCount === els.boardCards.children.length;
  }

  function clearPreviewMarkers() {
    document.documentElement.removeAttribute("data-street-preview-pending");
    if (typeof els === "object") els.boardCards?.removeAttribute?.("data-street-preview");
  }

  function cancelCoachWarmup() {
    cancelFrame(warmupFrameId);
    cancelFrame(warmupSecondFrameId);
    warmupFrameId = 0;
    warmupSecondFrameId = 0;

    if (coachIdleId) {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(coachIdleId);
      else window.clearTimeout(coachIdleId);
      coachIdleId = 0;
    }

    window.clearTimeout(coachFallbackTimer);
    coachFallbackTimer = 0;
  }

  function clearDeferredRender({ clearSuppression = true, clearMarkers = true } = {}) {
    window.clearTimeout(fallbackRenderTimer);
    fallbackRenderTimer = 0;
    cancelCoachWarmup();
    transitionPending = false;
    scheduledHandNumber = 0;
    scheduledBoardSignature = "";
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
    if (
      typeof state !== "object"
      || typeof els !== "object"
      || !els.boardCards
      || typeof renderCard !== "function"
    ) {
      return false;
    }

    const startedAt = now();
    const cards = Array.isArray(state.board) ? state.board : [];
    const nextSignature = boardSignature();
    const nextCardKeys = nextSignature ? nextSignature.split("|") : [];
    const previousCardKeys = visibleBoardSignature ? visibleBoardSignature.split("|") : [];
    const sameHand = visibleHandNumber === currentHandNumber();
    const canAppend = sameHand
      && previousCardKeys.length > 0
      && previousCardKeys.length < nextCardKeys.length
      && previousCardKeys.every((key, index) => key === nextCardKeys[index])
      && els.boardCards.children.length === previousCardKeys.length;
    const animateCards = typeof shouldAnimateCards === "function" ? shouldAnimateCards() : true;

    if (canAppend) {
      const extraCards = cards
        .slice(previousCardKeys.length)
        .map((card, offset) => renderCard(card, previousCardKeys.length + offset, { animate: animateCards }))
        .join("");
      els.boardCards.insertAdjacentHTML("beforeend", extraCards);
      incrementalCardAppendCount += cards.length - previousCardKeys.length;
    } else {
      els.boardCards.innerHTML = cards.length
        ? cards.map((card, index) => renderCard(card, index, { animate: animateCards })).join("")
        : Array.from({ length: 5 }, (_, index) => renderCard(null, index, { animate: animateCards })).join("");
    }

    if (els.boardStageLabel && typeof streetLabel === "function") {
      els.boardStageLabel.textContent = streetLabel();
    }
    if (els.streetValue) els.streetValue.textContent = state.street;
    if (els.currentBetValue) els.currentBetValue.textContent = state.currentBet;

    disableActionControls();
    els.boardCards.dataset.streetPreview = "true";
    document.documentElement.dataset.streetPreviewPending = "true";
    rememberVisibleBoard();
    previewCount += 1;
    lastPreviewDurationMs = Number((now() - startedAt).toFixed(2));
    return true;
  }

  function runCoachWarmup(handNumber, signature) {
    coachIdleId = 0;
    coachFallbackTimer = 0;
    if (
      currentHandNumber() !== handNumber
      || boardSignature() !== signature
      || state?.handOver
      || !state?.coach?.enabled
      || typeof human !== "function"
      || typeof getCoachAnalysis !== "function"
    ) {
      return;
    }

    const startedAt = now();
    try {
      getCoachAnalysis(human());
      coachWarmupCount += 1;
    } catch (_) {
      // A later normal render can still calculate the coach panel.
    }
    lastCoachWarmupDurationMs = Number((now() - startedAt).toFixed(2));
  }

  function scheduleCoachWarmup() {
    cancelCoachWarmup();
    const handNumber = scheduledHandNumber;
    const signature = scheduledBoardSignature;

    warmupFrameId = requestFrame(() => {
      warmupFrameId = 0;
      warmupSecondFrameId = requestFrame(() => {
        warmupSecondFrameId = 0;
        const callback = () => runCoachWarmup(handNumber, signature);
        if (typeof window.requestIdleCallback === "function") {
          coachIdleId = window.requestIdleCallback(callback, { timeout: COACH_IDLE_TIMEOUT_MS });
        } else {
          coachFallbackTimer = window.setTimeout(callback, 90);
        }
      });
    });
  }

  function withStableVisibleBoard(callback) {
    if (typeof els !== "object" || !els.boardCards || !visibleBoardMatchesState()) {
      const result = callback();
      rememberVisibleBoard();
      return result;
    }

    const visibleBoard = els.boardCards;
    const detachedBoard = document.createElement(visibleBoard.tagName || "div");
    detachedBoard.className = visibleBoard.className;
    els.boardCards = detachedBoard;

    try {
      const result = callback();
      preservedBoardRenderCount += 1;
      return result;
    } finally {
      els.boardCards = visibleBoard;
    }
  }

  function callOriginalRender(context, args, source = "normal") {
    if (typeof originalRender !== "function") return undefined;
    const startedAt = now();
    const result = withStableVisibleBoard(() => originalRender.apply(context, args));
    lastFullRenderDurationMs = Number((now() - startedAt).toFixed(2));

    if (source !== "normal") {
      scheduledFullRenderCount += 1;
      if (source === "fallback") fallbackFullRenderCount += 1;
      else explicitFullRenderCount += 1;
    }
    return result;
  }

  function completeDeferredRender(source, context = window, args = []) {
    window.clearTimeout(fallbackRenderTimer);
    fallbackRenderTimer = 0;
    cancelCoachWarmup();
    transitionPending = false;
    suppressNextFullRender = false;
    scheduledHandNumber = 0;
    scheduledBoardSignature = "";
    clearPreviewMarkers();
    return callOriginalRender(context, args, source);
  }

  function scheduleFallbackFullRender() {
    window.clearTimeout(fallbackRenderTimer);
    const handNumber = scheduledHandNumber;
    const signature = scheduledBoardSignature;

    fallbackRenderTimer = window.setTimeout(() => {
      fallbackRenderTimer = 0;
      if (
        currentHandNumber() !== handNumber
        || boardSignature() !== signature
        || state?.handOver
      ) {
        clearDeferredRender();
        return;
      }
      completeDeferredRender("fallback");
    }, FULL_RENDER_FALLBACK_MS);
  }

  function install() {
    if (installed) return true;
    if (typeof window.advanceStreet !== "function" || typeof window.render !== "function") return false;

    originalAdvanceStreet = window.advanceStreet;
    originalRender = window.render;
    rememberVisibleBoard();

    window.advanceStreet = function advanceStreetWithStableCommunityCards(...args) {
      const boardCountBefore = Number(state?.board?.length) || 0;
      const result = originalAdvanceStreet.apply(this, args);
      const boardCountAfter = Number(state?.board?.length) || 0;

      if (!state?.handOver && boardCountAfter > boardCountBefore && boardCountAfter <= 5) {
        if (renderStreetPreview()) {
          suppressNextFullRender = true;
          transitionPending = true;
          scheduledHandNumber = currentHandNumber();
          scheduledBoardSignature = boardSignature();
          scheduleCoachWarmup();
          scheduleFallbackFullRender();
        }
      }
      return result;
    };

    window.render = function renderWithDeferredStreetRebuild(...args) {
      const sameTransition = transitionPending
        && currentHandNumber() === scheduledHandNumber
        && boardSignature() === scheduledBoardSignature;

      if (suppressNextFullRender && sameTransition) {
        suppressNextFullRender = false;
        skippedRenderCount += 1;
        return undefined;
      }

      if (sameTransition) {
        return completeDeferredRender("explicit", this, args);
      }

      if (transitionPending || suppressNextFullRender) {
        clearDeferredRender();
      }
      return callOriginalRender(this, args);
    };

    installed = true;
    return true;
  }

  function resetMetrics() {
    previewCount = 0;
    skippedRenderCount = 0;
    scheduledFullRenderCount = 0;
    fallbackFullRenderCount = 0;
    explicitFullRenderCount = 0;
    preservedBoardRenderCount = 0;
    incrementalCardAppendCount = 0;
    coachWarmupCount = 0;
    lastPreviewDurationMs = 0;
    lastFullRenderDurationMs = 0;
    lastCoachWarmupDurationMs = 0;
  }

  window.StreetTransitionPerformance = {
    version: VERSION,
    install,
    cancel: () => clearDeferredRender(),
    resetMetrics,
    status() {
      return {
        installed,
        previewCount,
        skippedRenderCount,
        scheduledFullRenderCount,
        fallbackFullRenderCount,
        explicitFullRenderCount,
        preservedBoardRenderCount,
        incrementalCardAppendCount,
        coachWarmupCount,
        lastPreviewDurationMs,
        lastFullRenderDurationMs,
        lastCoachWarmupDurationMs,
        pending: transitionPending,
        scheduledHandNumber,
        scheduledBoardSignature,
      };
    },
  };

  install();
})();
