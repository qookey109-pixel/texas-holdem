// Allow the player's hole cards to be dealt only once per hand.
(() => {
  "use strict";

  const VERSION = "3.0.0";
  if (window.HeroCardRenderStability?.version === VERSION) return;
  window.HeroCardRenderStability?.cancel?.();

  const STYLE_ID = "hero-card-motion-v3";
  let installed = false;
  let playerCardsElement = null;
  let nativeInnerHtml = null;
  let previousOwnDescriptor = null;
  let animationListener = null;
  let renderedHandNumber = -1;
  let renderedCardSignature = "";
  let renderedChildCount = 0;
  let suppressedWriteCount = 0;
  let allowedWriteCount = 0;
  let animationStartCount = 0;

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

  function findInnerHtmlDescriptor(element) {
    let prototype = element;
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "innerHTML");
      if (descriptor?.get && descriptor?.set) return descriptor;
      prototype = Object.getPrototypeOf(prototype);
    }
    return null;
  }

  function installMotionStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .player-cards .card:not(.is-static) {
        animation-name: heroDealInV3;
        animation-duration: 210ms;
        animation-timing-function: cubic-bezier(.2,.82,.3,1);
        animation-delay: calc(var(--card-index, 0) * 38ms);
        backface-visibility: hidden;
        transform-origin: 50% 70%;
        will-change: transform, opacity;
      }
      @keyframes heroDealInV3 {
        from { opacity: .25; transform: translate3d(20px,-14px,0) rotateZ(3deg) scale(.975); }
        to { opacity: 1; transform: translate3d(0,0,0) rotateZ(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  function rememberVisibleCards() {
    if (!playerCardsElement) return;
    renderedHandNumber = currentHandNumber();
    renderedCardSignature = currentCardSignature();
    renderedChildCount = playerCardsElement.children.length;
    playerCardsElement.dataset.renderedHeroHand = String(renderedHandNumber);
    playerCardsElement.dataset.renderedHeroCards = renderedCardSignature;
  }

  function visibleCardsMatchState() {
    if (!playerCardsElement) return false;
    return renderedChildCount === 2
      && playerCardsElement.children.length === 2
      && renderedHandNumber === currentHandNumber()
      && renderedCardSignature === currentCardSignature();
  }

  function restoreGuard() {
    if (!playerCardsElement) return;
    if (animationListener) {
      playerCardsElement.removeEventListener("animationstart", animationListener, true);
    }

    try {
      if (previousOwnDescriptor) {
        Object.defineProperty(playerCardsElement, "innerHTML", previousOwnDescriptor);
      } else {
        delete playerCardsElement.innerHTML;
      }
    } catch (_) {
      // The page can continue even if a browser refuses descriptor restoration.
    }

    playerCardsElement = null;
    nativeInnerHtml = null;
    previousOwnDescriptor = null;
    animationListener = null;
    installed = false;
  }

  function install() {
    const nextElement = typeof els === "object"
      ? els.playerCards
      : document.querySelector("#playerCards");
    if (!nextElement) return false;
    if (installed && playerCardsElement === nextElement) return true;
    if (installed) restoreGuard();

    const descriptor = findInnerHtmlDescriptor(nextElement);
    if (!descriptor) return false;

    installMotionStyle();
    playerCardsElement = nextElement;
    nativeInnerHtml = descriptor;
    previousOwnDescriptor = Object.getOwnPropertyDescriptor(nextElement, "innerHTML") || null;
    rememberVisibleCards();

    Object.defineProperty(nextElement, "innerHTML", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return nativeInnerHtml.get.call(this);
      },
      set(value) {
        if (visibleCardsMatchState()) {
          suppressedWriteCount += 1;
          return;
        }
        nativeInnerHtml.set.call(this, value);
        allowedWriteCount += 1;
        rememberVisibleCards();
      },
    });

    animationListener = event => {
      if (event.target?.classList?.contains("card")) animationStartCount += 1;
    };
    nextElement.addEventListener("animationstart", animationListener, true);
    installed = true;
    return true;
  }

  window.HeroCardRenderStability = {
    version: VERSION,
    install,
    refresh() {
      install();
      rememberVisibleCards();
    },
    cancel: restoreGuard,
    flush() {
      return undefined;
    },
    resetMetrics() {
      suppressedWriteCount = 0;
      allowedWriteCount = 0;
      animationStartCount = 0;
    },
    status() {
      return {
        installed,
        visibleHandNumber: renderedHandNumber,
        visibleCardSignature: renderedCardSignature,
        visibleChildCount: renderedChildCount,
        preservedRenderCount: suppressedWriteCount,
        refreshedRenderCount: allowedWriteCount,
        suppressedWriteCount,
        allowedWriteCount,
        animationStartCount,
        earlyPaintCount: 0,
        deferredFullRenderCount: 0,
        pendingDeal: false,
        matchesState: visibleCardsMatchState(),
      };
    },
  };

  install();
})();
