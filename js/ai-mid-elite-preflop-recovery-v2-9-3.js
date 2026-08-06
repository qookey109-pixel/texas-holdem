// AI V2.9.3: restore valid middle/elite preflop strength before V2.8 EV guards.
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

  function clamp(value, minimum = 0.01, maximum = 0.99) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function decisionStreet(decision) {
    const explicit = String(decision?.context?.street || "").toLowerCase();
    if (explicit) return explicit;
    return (state?.board?.length || 0) >= 3 ? "postflop" : "preflop";
  }

  function usableProxy(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0.001 ? clamp(numeric) : null;
  }

  function preflopStrengthProxy(player, decision) {
    const existing = usableProxy(decision?.equityProxy)
      ?? usableProxy(decision?.context?.equityProxy)
      ?? usableProxy(decision?.hand?.score);
    if (existing !== null) return { value: existing, source: "decision" };

    try {
      const estimated = usableProxy(typeof estimateStrength === "function" ? estimateStrength(player) : null);
      if (estimated !== null) return { value: estimated, source: "public-own-hand-strength" };
    } catch (_) {
      // Fall through to the neutral proxy. The caller still receives a legal,
      // public-information-only decision rather than the old 0.001 sentinel.
    }

    return { value: 0.5, source: "neutral-fallback" };
  }

  function recoverDecision(player, decision) {
    if (!decision || decision.action === "fallback") return decision;
    if (!SUPPORTED_NAMES.includes(player?.name)) return decision;
    if (decisionStreet(decision) !== "preflop") return decision;

    const proxy = preflopStrengthProxy(player, decision);
    const context = decision.context || {};
    decision.context = {
      ...context,
      equityProxy: proxy.value,
      preflopEquityProxy: proxy.value,
    };
    decision.equityProxy = proxy.value;
    if (usableProxy(decision.raiseCalledEquity) === null) {
      decision.raiseCalledEquity = proxy.value;
    }
    decision.preflopEquityProxySource = proxy.source;
    decision.preflopRecoveryVersion = VERSION;
    decision.publicInformationOnly = true;
    return decision;
  }

  function patchDecisionChain() {
    const source = window.AiMidEliteDecisionChainV27;
    if (!source?.version || typeof source.composeDecision !== "function") return false;
    if (source.__aiMidElitePreflopRecoveryV293Patched) return true;

    const originalComposeDecision = source.composeDecision.bind(source);
    const patched = Object.freeze({
      ...source,
      composeDecision(player, options = {}) {
        return recoverDecision(player, originalComposeDecision(player, options));
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
    recoverDecision,
    refresh,
  });

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
