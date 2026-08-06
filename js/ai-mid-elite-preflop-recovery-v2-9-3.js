// AI V2.9.3: route middle/elite preflop decisions back to the proven range chain.
(() => {
  "use strict";

  if (window.AiMidElitePreflopRecoveryV293?.version) return;

  const VERSION = "2.9.3";
  const SUPPORTED_NAMES = Object.freeze([
    "Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper",
    "Nova", "Unit-9", "Merlin", "Vlad",
  ]);
  let installTimer = 0;
  let installAttempts = 0;

  function isPreflop() {
    return (state?.board?.length || 0) < 3;
  }

  function shouldDelegate(player) {
    return SUPPORTED_NAMES.includes(player?.name) && isPreflop();
  }

  function fallbackDecision(player) {
    return {
      action: "fallback",
      reason: "v2-9-3-preflop-delegate",
      tier: SUPPORTED_NAMES.slice(0, 6).includes(player?.name) ? "middle" : "elite",
      preflopRecoveryVersion: VERSION,
      publicInformationOnly: true,
    };
  }

  function patchDecisionChain() {
    const source = window.AiMidEliteDecisionChainV27;
    if (!source?.version || typeof source.composeDecision !== "function") return false;
    if (source.__aiMidElitePreflopRecoveryV293Patched) return true;

    const originalComposeDecision = source.composeDecision.bind(source);
    const patched = Object.freeze({
      ...source,
      composeDecision(player, options = {}) {
        if (shouldDelegate(player)) return fallbackDecision(player);
        return originalComposeDecision(player, options);
      },
      preflopRecoveryVersion: VERSION,
      __aiMidElitePreflopRecoveryV293Patched: true,
    });
    window.AiMidEliteDecisionChainV27 = patched;
    return true;
  }

  function refresh() {
    const ready = patchDecisionChain();
    document.documentElement.dataset.aiMidElitePreflopRecoveryV293 = ready ? "ready" : "loading";
    installAttempts += 1;
    if ((ready || installAttempts >= 320) && installTimer) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return ready;
  }

  window.AiMidElitePreflopRecoveryV293 = Object.freeze({
    version: VERSION,
    supportedNames: [...SUPPORTED_NAMES],
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicBetSizes: true,
      publicStacks: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    isPreflop,
    shouldDelegate,
    fallbackDecision,
    refresh,
  });

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
