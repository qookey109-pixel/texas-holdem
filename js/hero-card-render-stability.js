// Keep the player's visible hole-card DOM stable across same-hand table refreshes.
(() => {
  "use strict";

  if (window.HeroCardRenderStability?.version === "1.0.0") return;

  const VERSION = "1.0.0";
  let installed = false;
  let originalRender = null;
  let visibleHandNumber = -1;
  let visibleCardSignature = "";
  let visibleChildCount = 0;
  let preservedRenderCount = 0;
  let refreshedRenderCount = 0;

  function currentHandNumber() {
    return Number(state?.handNumber) || 0;
  }

  function cardIdentity(card) {
    if (!card) return "back";
    if (typeof cardKey === "function") return cardKey(card);
    return `${card.value ?? card.label ?? ""}${card.suit ?? ""}`;
  }

  function currentCardSignature() {
    let cards = [];
    try {
      cards = typeof human === "function" ? (human()?.cards || []) : [];
    } catch (_) {
      cards = [];
    }

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

  function install() {
    if (installed) return true;
    if (typeof window.render !== "function") return false;

    originalRender = window.render;
    window.render = function renderWithStableHeroCards(...args) {
      if (!visibleCardsMatchState()) {
        const result = originalRender.apply(this, args);
        rememberVisibleCards();
        refreshedRenderCount += 1;
        return result;
      }

      const visibleCards = els.playerCards;
      const detachedCards = document.createElement(visibleCards.tagName || "div");
      detachedCards.className = visibleCards.className;
      els.playerCards = detachedCards;

      try {
        const result = originalRender.apply(this, args);
        preservedRenderCount += 1;
        return result;
      } finally {
        els.playerCards = visibleCards;
      }
    };

    installed = true;
    rememberVisibleCards();
    return true;
  }

  window.HeroCardRenderStability = {
    version: VERSION,
    install,
    refresh: rememberVisibleCards,
    resetMetrics() {
      preservedRenderCount = 0;
      refreshedRenderCount = 0;
    },
    status() {
      return {
        installed,
        visibleHandNumber,
        visibleCardSignature,
        visibleChildCount,
        preservedRenderCount,
        refreshedRenderCount,
        matchesState: visibleCardsMatchState(),
      };
    },
  };

  install();
})();
