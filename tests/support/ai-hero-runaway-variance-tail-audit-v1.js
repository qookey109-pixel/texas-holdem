// Observation-only audit for Hero stack-ratio variance tails.
(() => {
  "use strict";

  if (window.AiHeroRunawayVarianceTailAuditV1?.version) return;

  const VERSION = "1.0.0";
  const MAX_HANDS = 2_000;
  let active = null;
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

  function snapshot(players, bigBlind, handNumber) {
    const bb = Math.max(1, finite(bigBlind, 1));
    const list = Array.isArray(players) ? players : [];
    const hero = list.find(player => player?.isHuman) || list[0] || null;
    const opponents = list.filter(player => player && player !== hero);
    const positiveOpponentBb = opponents
      .map(player => finite(player.stack) / bb)
      .filter(value => value > 0);
    const opponentMedianBb = median(positiveOpponentBb);
    const heroStackBb = round(finite(hero?.stack) / bb, 4);
    const heroWealthBb = round((finite(hero?.stack) + finite(hero?.totalContribution)) / bb, 4);
    const ratio = opponentMedianBb > 0 ? round(heroStackBb / opponentMedianBb, 6) : null;
    return {
      handNumber: finite(handNumber),
      heroName: String(hero?.name || "Hero"),
      heroStackBb,
      heroWealthBb,
      opponentMedianBb: round(opponentMedianBb, 4),
      ratio,
    };
  }

  function recordHandStart(players, bigBlind, handNumber, heroProfile) {
    try {
      active = {
        ...snapshot(players, bigBlind, handNumber),
        heroProfile: String(heroProfile || ""),
      };
      return active;
    } catch (error) {
      errors.push(`recordHandStart:${String(error?.message || error)}`);
      active = null;
      return null;
    }
  }

  function recordHandEnd(players, bigBlind, handNumber, winners = [], boardCount = 0) {
    try {
      if (!active || hands.length >= MAX_HANDS) return null;
      const end = snapshot(players, bigBlind, handNumber);
      const winnerNames = new Set((Array.isArray(winners) ? winners : []).map(String));
      const list = Array.isArray(players) ? players : [];
      const unfoldedCount = list.filter(player => player && !player.folded).length;
      const showdown = finite(boardCount) === 5 && unfoldedCount >= 2;
      const heroDeltaBb = round(end.heroStackBb - active.heroWealthBb, 4);
      const record = {
        handNumber: active.handNumber,
        heroProfile: active.heroProfile,
        heroStackBb: end.heroStackBb,
        opponentMedianBb: end.opponentMedianBb,
        heroToOpponentMedianRatio: end.ratio,
        heroDeltaBb,
        heroWon: winnerNames.has(active.heroName),
        showdown,
        boardCount: finite(boardCount),
        largeShowdown: showdown && Math.abs(heroDeltaBb) >= 50,
      };
      hands.push(record);
      active = null;
      return record;
    } catch (error) {
      errors.push(`recordHandEnd:${String(error?.message || error)}`);
      active = null;
      return null;
    }
  }

  function reset() {
    active = null;
    hands = [];
    errors = [];
    return snapshotState();
  }

  function snapshotState() {
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

  window.AiHeroRunawayVarianceTailAuditV1 = Object.freeze({
    version: VERSION,
    recordHandStart,
    recordHandEnd,
    reset,
    snapshot: snapshotState,
  });
  document.documentElement.dataset.aiHeroRunawayVarianceTailAuditV1 = "ready";
})();
