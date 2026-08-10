// Observation-only audit for late-game Hero effective-stack risk insulation.
(() => {
  "use strict";

  if (window.AiHeroEffectiveRiskAuditV1?.version) return;

  const VERSION = "1.0.0";
  const MAX_HANDS = 2_000;
  let hands = [];
  let errors = [];

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  }

  function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function recordHand(players, bigBlind, handNumber, heroProfile) {
    try {
      if (hands.length >= MAX_HANDS) return null;
      const list = Array.isArray(players) ? players : [];
      if (!list.length) return null;
      const bb = Math.max(1, finite(bigBlind, 1));
      const hero = list.find(player => player?.isHuman) || list[0] || null;
      const heroBb = Math.max(0, finite(hero?.stack)) / bb;
      const opponentBbs = list
        .filter(player => player && player !== hero && !player.isHuman)
        .map(player => Math.max(0, finite(player.stack)) / bb)
        .filter(value => value > 0)
        .sort((left, right) => right - left);
      const opponentMedianBb = median(opponentBbs);
      const opponentMaxBb = opponentBbs[0] || 0;
      const opponentSecondBb = opponentBbs[1] || 0;
      const heroToMedianRatio = opponentMedianBb > 0 ? heroBb / opponentMedianBb : null;
      const deepestRiskFraction = heroBb > 0 ? Math.min(heroBb, opponentMaxBb) / heroBb : null;
      const medianRiskFraction = heroBb > 0 ? Math.min(heroBb, opponentMedianBb) / heroBb : null;
      const buyIn = typeof currentBuyIn === "function" ? finite(currentBuyIn()) : 0;
      const buyInBb = buyIn > 0 ? buyIn / bb : 0;
      const level = typeof currentBlindLevel === "function" ? currentBlindLevel() : null;
      const structuralReplacementCapBb = Math.min(60, Math.max(0, buyInBb * 0.75));

      const record = {
        handNumber: finite(handNumber),
        heroProfile: String(heroProfile || ""),
        blindLevel: finite(level?.level),
        bigBlind: bb,
        buyInBb: round(buyInBb, 4),
        structuralReplacementCapBb: round(structuralReplacementCapBb, 4),
        heroBb: round(heroBb, 4),
        opponentMedianBb: round(opponentMedianBb, 4),
        opponentMaxBb: round(opponentMaxBb, 4),
        opponentSecondBb: round(opponentSecondBb, 4),
        heroToOpponentMedianRatio: heroToMedianRatio === null ? null : round(heroToMedianRatio, 6),
        deepestOpponentRiskFraction: deepestRiskFraction === null ? null : round(deepestRiskFraction, 6),
        medianOpponentRiskFraction: medianRiskFraction === null ? null : round(medianRiskFraction, 6),
        positiveOpponentSeats: opponentBbs.length,
      };
      hands.push(record);
      return record;
    } catch (error) {
      errors.push(`recordHand:${String(error?.message || error)}`);
      return null;
    }
  }

  function reset() {
    hands = [];
    errors = [];
    return snapshot();
  }

  function snapshot() {
    return {
      version: VERSION,
      schemaVersion: 1,
      observationOnly: true,
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      handsCompleted: hands.length,
      hands: JSON.parse(JSON.stringify(hands)),
      errors: [...errors],
    };
  }

  window.AiHeroEffectiveRiskAuditV1 = Object.freeze({
    version: VERSION,
    recordHand,
    reset,
    snapshot,
  });
  document.documentElement.dataset.aiHeroEffectiveRiskAuditV1 = "ready";
})();