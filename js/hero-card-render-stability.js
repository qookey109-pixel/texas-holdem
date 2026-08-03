// Paint the player's new hole cards before the heavier full-table refresh,
// then keep those visible card nodes stable throughout the same hand.
(() => {
  "use strict";

  if (window.HeroCardRenderStability?.version === "2.0.0") return;
  window.HeroCardRenderStability?.cancel?.();

  const VERSION = "2.0.0";
  const FRAME_FALLBACK_MS = 18;
  const FULL_RENDER_FALLBACK_MS = 220;
  const STYLE_ID = "hero-card-motion-v2";

  let installed = false;
  let originalRender = null;
  let wrappedRender = null;
  let visibleHandNumber = -1;
  let visibleCardSignature = "";
  let visibleChildCount = 0;
  let preservedRenderCount = 0;
  let refreshedRenderCount = 0;
  let earlyPaintCount = 0;
  let deferredFullRenderCount = 0;
  let pendingDeal = false;
  let firstFrameId = 0;
  let secondFrameId = 0;
  let fallbackTimer = 0;
  let pendingContext = window;
  let pendingArgs = [];

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

  function installMotionStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .player-cards .card:not(.is-static) {
        animation-name: heroDealInV2;
        animation-duration: 230ms;
        animation-timing-function: cubic-bezier(.2,.82,.3,1);
        animation-delay: calc(var(--card-index, 0) * 42ms);
        backface-visibility: hidden;
        transform-origin: 50% 70%;
        will-change: transform, opacity;
      }
      @keyframes heroDealInV2 {
        from { opacity: .2; transform: translate3d(24px,-18px,0) rotateZ(4deg) scale(.965); }
        to { opacity: 1; transform: translate3d(0,0,0) rotateZ(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  function currentHandNumber() {
    return Number(state?.handNumber) || 0;
  }

  function cardIdentity(card) {
    if (!card) return "back";
    if (typeof cardKey === "function") return cardKey(card);
    return `${card.value ?? card.label ?? ""}${card.suit ?? ""}`;
  }

  function currentCards() {
    try {
      return typeof human === "function" ? (human()?.cards || []) : [];
    } catch (_) {
      return [];
    }
  }

  function currentCardSignature() {
    const cards = currentCards();
    if (cards.length !== 2) return "back|back";
    return cards.map(cardIdentity).join("|");
  }

  function rememberVisibleCards() {
    if (typeof els !== "object" || !els.playerCards) return;
    visibleHandNumber = currentHandNumber();
    visibleCardSignature = currentCardSignature();
    visibleChildCount = els.playerCards.children.length;
    els.playerCards.dataset.renderedHeroHand = String(visibleHandNumber);
    els.playerCards.dataset.renderedHeroCards = visibleCardSignature;
  }

  function visibleCardsMatchState() {
    if (typeof els !== "object" || !els.playerCards) return false;
    return visibleChildCount === 2
      && els.playerCards.children.length === visibleChildCount
      && visibleHandNumber === currentHandNumber()
      && visibleCardSignature === currentCardSignature();
  }

  function canEarlyPaint() {
    return typeof els === "object"
      && Boolean(els.playerCards)
      && typeof renderCard === "function"
      && currentHandNumber() > 0
      && currentCards().length === 2;
  }

  function paintHeroCardsEarly() {
    if (!canEarlyPaint()) return false;
    const cards = currentCards();
    els.playerCards.innerHTML = cards
      .map((card, index) => renderCard(card, index, { animate: true }))
      .join("");
    els.playerCards.dataset.heroDealPreview = "true";
    document.documentElement.dataset.heroDealPreviewPending = "true";
    rememberVisibleCards();
    earlyPaintCount += 1;
    return true;
  }

  function clearPreviewMarker() {
    document.documentElement.removeAttribute("data-hero-deal-preview-pending");
    if (typeof els === "object") els.playerCards?.removeAttribute?.("data-hero-deal-preview");
  }

  function clearSchedule() {
    cancelFrame(firstFrameId);
    cancelFrame(secondFrameId);
    window.clearTimeout(fallbackTimer);
    firstFrameId = 0;
    secondFrameId = 0;
    fallbackTimer = 0;
  }

  function withStableVisibleCards(callback) {
    if (!visibleCardsMatchState()) {
      const result = callback();
      rememberVisibleCards();
      refreshedRenderCount += 1;
      return result;
    }

    const visibleCards = els.playerCards;
    const detachedCards = document.createElement(visibleCards.tagName || "div");
    detachedCards.className = visibleCards.className;
    els.playerCards = detachedCards;

    try {
      const result = callback();
      preservedRenderCount += 1;
      return result;
    } finally {
      els.playerCards = visibleCards;
    }
  }

  function completeDeferredRender() {
    if (!pendingDeal) return undefined;
    clearSchedule();
    pendingDeal = false;
    clearPreviewMarker();
    deferredFullRenderCount += 1;

    // Re-enter the current public render entry so wrappers installed after this
    // module (seat balance, street transitions, mode UI) still run normally.
    const currentRenderEntry = window.render;
    if (typeof currentRenderEntry === "function" && currentRenderEntry !== originalRender) {
      return currentRenderEntry.apply(pendingContext, pendingArgs);
    }
    return withStableVisibleCards(() => originalRender.apply(pendingContext, pendingArgs));
  }

  function scheduleFullRender() {
    clearSchedule();
    firstFrameId = requestFrame(() => {
      firstFrameId = 0;
      secondFrameId = requestFrame(() => {
        secondFrameId = 0;
        completeDeferredRender();
      });
    });
    fallbackTimer = window.setTimeout(completeDeferredRender, FULL_RENDER_FALLBACK_MS);
  }

  function install() {
    if (installed) return true;
    if (typeof window.render !== "function") return false;

    installMotionStyle();
    originalRender = window.render;
    wrappedRender = function renderWithStableHeroCards(...args) {
      pendingContext = this;
      pendingArgs = args;

      if (pendingDeal) return undefined;

      if (!visibleCardsMatchState() && paintHeroCardsEarly()) {
        pendingDeal = true;
        scheduleFullRender();
        return undefined;
      }

      return withStableVisibleCards(() => originalRender.apply(this, args));
    };
    window.render = wrappedRender;

    installed = true;
    rememberVisibleCards();
    return true;
  }

  window.HeroCardRenderStability = {
    version: VERSION,
    install,
    refresh: rememberVisibleCards,
    cancel() {
      clearSchedule();
      pendingDeal = false;
      clearPreviewMarker();
    },
    flush: completeDeferredRender,
    resetMetrics() {
      preservedRenderCount = 0;
      refreshedRenderCount = 0;
      earlyPaintCount = 0;
      deferredFullRenderCount = 0;
    },
    status() {
      return {
        installed,
        visibleHandNumber,
        visibleCardSignature,
        visibleChildCount,
        preservedRenderCount,
        refreshedRenderCount,
        earlyPaintCount,
        deferredFullRenderCount,
        pendingDeal,
        matchesState: visibleCardsMatchState(),
      };
    },
  };

  install();
})();
