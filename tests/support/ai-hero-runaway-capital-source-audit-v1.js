// Observation-only audit for the capital sources behind Hero runaway gains.
(() => {
  "use strict";

  if (window.AiHeroRunawayCapitalSourceAuditV1?.version) return;

  const VERSION = "1.0.0";
  const MAX_HANDS = 2_000;
  let active = null;
  let hands = [];
  let errors = [];
  let seatState = new Map();

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

  function publicSeatSnapshot(player, seatIndex, bb, handNumber) {
    const name = String(player?.name || `seat-${seatIndex}`);
    const stackBb = round(finite(player?.stack) / bb, 4);
    const wealthBb = round((finite(player?.stack) + finite(player?.totalContribution)) / bb, 4);
    const previous = seatState.get(seatIndex);
    let generation = previous?.generation || 1;
    let firstSeenHand = previous?.firstSeenHand || handNumber;
    const replacementLike = Boolean(previous && (
      previous.name !== name ||
      (previous.endStackBb <= 0 && stackBb > 0)
    ));
    if (replacementLike) {
      generation += 1;
      firstSeenHand = handNumber;
    }
    const tenureHands = Math.max(1, handNumber - firstSeenHand + 1);
    return {
      seatIndex,
      name,
      generation,
      firstSeenHand,
      tenureHands,
      replacementLike,
      stackBb,
      wealthBb,
    };
  }

  function recordHandStart(players, bigBlind, handNumber, heroProfile) {
    try {
      const bb = Math.max(1, finite(bigBlind, 1));
      const list = Array.isArray(players) ? players : [];
      const heroIndex = Math.max(0, list.findIndex(player => player?.isHuman));
      const hero = list[heroIndex] || list[0] || null;
      const opponents = list
        .map((player, seatIndex) => ({ player, seatIndex }))
        .filter(entry => entry.player && entry.player !== hero)
        .map(entry => publicSeatSnapshot(entry.player, entry.seatIndex, bb, finite(handNumber)));
      const opponentMedianBb = median(opponents.map(entry => entry.stackBb).filter(value => value > 0));
      const heroStackBb = round(finite(hero?.stack) / bb, 4);
      const heroWealthBb = round((finite(hero?.stack) + finite(hero?.totalContribution)) / bb, 4);
      active = {
        handNumber: finite(handNumber),
        heroName: String(hero?.name || "Hero"),
        heroProfile: String(heroProfile || ""),
        heroStackBb,
        heroWealthBb,
        opponentMedianBb: round(opponentMedianBb, 4),
        ratio: opponentMedianBb > 0 ? round(heroStackBb / opponentMedianBb, 6) : null,
        opponents,
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
      const bb = Math.max(1, finite(bigBlind, 1));
      const list = Array.isArray(players) ? players : [];
      const hero = list.find(player => player?.isHuman) || list[0] || null;
      const winnerNames = new Set((Array.isArray(winners) ? winners : []).map(String));
      const heroStackBb = round(finite(hero?.stack) / bb, 4);
      const heroDeltaBb = round(heroStackBb - active.heroWealthBb, 4);
      const positiveOpponentBb = list
        .filter(player => player && player !== hero)
        .map(player => finite(player.stack) / bb)
        .filter(value => value > 0);
      const opponentMedianBb = median(positiveOpponentBb);
      const ratio = opponentMedianBb > 0 ? round(heroStackBb / opponentMedianBb, 6) : null;
      const unfoldedCount = list.filter(player => player && !player.folded).length;
      const showdown = finite(boardCount) === 5 && unfoldedCount >= 2;

      const sources = active.opponents.map(start => {
        const player = list[start.seatIndex] || null;
        const endName = String(player?.name || start.name);
        const endStackBb = round(finite(player?.stack) / bb, 4);
        const lossBb = round(Math.max(0, start.wealthBb - endStackBb), 4);
        const gainBb = round(Math.max(0, endStackBb - start.wealthBb), 4);
        const deepAtStart = start.wealthBb >= 30;
        const veryDeepAtStart = start.wealthBb >= 50;
        const incumbent25 = start.tenureHands >= 25;
        const incumbent50 = start.tenureHands >= 50;
        const fresh5 = start.tenureHands <= 5;
        const sameGeneration = endName === start.name;
        seatState.set(start.seatIndex, {
          name: endName,
          generation: start.generation,
          firstSeenHand: start.firstSeenHand,
          endStackBb,
        });
        return {
          seatIndex: start.seatIndex,
          name: start.name,
          generation: start.generation,
          tenureHands: start.tenureHands,
          startWealthBb: start.wealthBb,
          endStackBb,
          lossBb,
          gainBb,
          deepAtStart,
          veryDeepAtStart,
          incumbent25,
          incumbent50,
          fresh5,
          sameGeneration,
        };
      });

      const sourceLossBb = round(sources.reduce((sum, source) => sum + source.lossBb, 0), 4);
      const deepIncumbentLossBb = round(sources
        .filter(source => source.deepAtStart && source.incumbent25)
        .reduce((sum, source) => sum + source.lossBb, 0), 4);
      const veryDeepIncumbentLossBb = round(sources
        .filter(source => source.veryDeepAtStart && source.incumbent25)
        .reduce((sum, source) => sum + source.lossBb, 0), 4);
      const freshLossBb = round(sources
        .filter(source => source.fresh5)
        .reduce((sum, source) => sum + source.lossBb, 0), 4);
      const topSource = [...sources].sort((a, b) => b.lossBb - a.lossBb)[0] || null;

      const record = {
        handNumber: active.handNumber,
        heroProfile: active.heroProfile,
        heroStackBb,
        opponentMedianBb: round(opponentMedianBb, 4),
        heroToOpponentMedianRatio: ratio,
        heroDeltaBb,
        heroWon: winnerNames.has(active.heroName),
        showdown,
        boardCount: finite(boardCount),
        largeHeroGain20: heroDeltaBb >= 20,
        largeHeroGain50: heroDeltaBb >= 50,
        sourceLossBb,
        deepIncumbentLossBb,
        veryDeepIncumbentLossBb,
        freshLossBb,
        topSource,
        sources,
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
    seatState = new Map();
    return snapshotState();
  }

  function snapshotState() {
    return {
      version: VERSION,
      schemaVersion: 1,
      observationOnly: true,
      causalClaim: false,
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

  window.AiHeroRunawayCapitalSourceAuditV1 = Object.freeze({
    version: VERSION,
    recordHandStart,
    recordHandEnd,
    reset,
    snapshot: snapshotState,
  });
  document.documentElement.dataset.aiHeroRunawayCapitalSourceAuditV1 = "ready";
})();
