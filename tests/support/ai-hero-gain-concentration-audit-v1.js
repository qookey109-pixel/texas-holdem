// Observation-only audit for Hero chip-gain concentration and runaway threshold crossings.
(() => {
  "use strict";

  if (window.AiHeroGainConcentrationAuditV1?.version) return;

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
    const sorted = values
      .map(value => finite(value, NaN))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function bandFor(ratio) {
    if (!Number.isFinite(ratio)) return "unknown";
    if (ratio < 3) return "under3x";
    if (ratio < 5) return "threeTo5x";
    return "fivePlus";
  }

  function publicSnapshot(players, bigBlind, handNumber) {
    const bb = Math.max(1, finite(bigBlind, 1));
    const list = Array.isArray(players) ? players : [];
    const hero = list.find(player => player?.isHuman) || list[0] || null;
    const opponents = list
      .filter(player => player && player !== hero)
      .map(player => ({
        position: finite(player.position, -1),
        name: String(player.name || ""),
        stackBb: round(finite(player.stack) / bb, 4),
        folded: Boolean(player.folded),
        allIn: Boolean(player.allIn),
      }));
    const positive = opponents.filter(player => player.stackBb > 0).map(player => player.stackBb);
    const opponentMedianBb = median(positive);
    const heroBb = round(finite(hero?.stack) / bb, 4);
    const ratio = opponentMedianBb > 0 ? round(heroBb / opponentMedianBb) : null;
    return {
      handNumber: finite(handNumber),
      bigBlind: bb,
      heroName: String(hero?.name || "Hero"),
      heroBb,
      heroFolded: Boolean(hero?.folded),
      opponentMedianBb: round(opponentMedianBb, 4),
      heroToOpponentMedianRatio: ratio,
      band: bandFor(ratio),
      opponents,
    };
  }

  function recordHandStart(players, bigBlind, handNumber) {
    try {
      active = publicSnapshot(players, bigBlind, handNumber);
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
      const end = publicSnapshot(players, bigBlind, handNumber);
      const startByPosition = new Map(active.opponents.map(player => [player.position, player]));
      const endByPosition = new Map(end.opponents.map(player => [player.position, player]));
      const opponentLosses = [];
      let bustCount = 0;
      let opponentLossBb = 0;

      for (const [position, startSeat] of startByPosition.entries()) {
        const endSeat = endByPosition.get(position);
        if (!endSeat) continue;
        const lossBb = round(startSeat.stackBb - endSeat.stackBb, 4);
        if (lossBb > 0) {
          opponentLossBb += lossBb;
          opponentLosses.push({
            position,
            name: startSeat.name,
            lossBb,
            busted: startSeat.stackBb > 0 && endSeat.stackBb <= 0,
          });
        }
        if (startSeat.stackBb > 0 && endSeat.stackBb <= 0) bustCount += 1;
      }

      opponentLosses.sort((left, right) => right.lossBb - left.lossBb);
      const heroDeltaBb = round(end.heroBb - active.heroBb, 4);
      const endRatio = end.heroToOpponentMedianRatio;
      const startRatio = active.heroToOpponentMedianRatio;
      const winnerNames = new Set((Array.isArray(winners) ? winners : []).map(value => String(value)));
      const activeAtEnd = end.opponents.filter(player => !player.folded).length + (end.heroFolded ? 0 : 1);
      const showdown = finite(boardCount) === 5 && activeAtEnd >= 2;
      const record = {
        handNumber: active.handNumber,
        startBand: active.band,
        startHeroBb: active.heroBb,
        endHeroBb: end.heroBb,
        heroDeltaBb,
        startOpponentMedianBb: active.opponentMedianBb,
        endOpponentMedianBb: end.opponentMedianBb,
        startRatio,
        endRatio,
        endBand: end.band,
        heroWon: winnerNames.has(active.heroName),
        showdown,
        boardCount: finite(boardCount),
        aiBustCount: bustCount,
        opponentLossBb: round(opponentLossBb, 4),
        largestOpponentLossBb: opponentLosses[0]?.lossBb || 0,
        largestOpponentLossName: opponentLosses[0]?.name || "",
        crosses3x: Number.isFinite(startRatio) && Number.isFinite(endRatio) && startRatio < 3 && endRatio >= 3,
        crosses5x: Number.isFinite(startRatio) && Number.isFinite(endRatio) && startRatio < 5 && endRatio >= 5,
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

  window.AiHeroGainConcentrationAuditV1 = Object.freeze({
    version: VERSION,
    recordHandStart,
    recordHandEnd,
    reset,
    snapshot,
  });
  document.documentElement.dataset.aiHeroGainConcentrationAuditV1 = "ready";
})();
