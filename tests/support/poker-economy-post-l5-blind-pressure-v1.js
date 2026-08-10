(() => {
  "use strict";

  if (window.PokerEconomyPostL5BlindPressureV1?.version) return;

  const VERSION = "1.0.0";
  const POLICIES = Object.freeze({
    "frozen-l5": Object.freeze({ id: "frozen-l5", extendAfterL5: false }),
    "slow-post-l5": Object.freeze({ id: "slow-post-l5", extendAfterL5: true }),
  });
  const EXTENDED_LEVELS = Object.freeze([
    Object.freeze({ startHand: 71, level: 6, small: 250, big: 500, buyIn: 18750 }),
    Object.freeze({ startHand: 121, level: 7, small: 300, big: 600, buyIn: 22500 }),
    Object.freeze({ startHand: 171, level: 8, small: 400, big: 800, buyIn: 30000 }),
    Object.freeze({ startHand: 221, level: 9, small: 500, big: 1000, buyIn: 37500 }),
  ]);

  let installed = false;
  let activePolicy = null;
  let originalBlindLevelForHand = null;
  let originalBuildNextAiSeats = null;
  let productionConfig = null;

  const telemetry = {
    hands: [],
    replacementEvents: 0,
    replacedSeats: 0,
    adjustedReplacementEvents: 0,
    adjustedReplacementSeats: 0,
    post70ReplacementEntryBbMax: null,
    post70ReplacementEntryBbMin: null,
    post70ReplacementDepthViolations: 0,
    scheduleMismatches: [],
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const round = (value, digits = 6) => {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  };

  function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function resetTelemetry() {
    telemetry.hands.length = 0;
    telemetry.replacementEvents = 0;
    telemetry.replacedSeats = 0;
    telemetry.adjustedReplacementEvents = 0;
    telemetry.adjustedReplacementSeats = 0;
    telemetry.post70ReplacementEntryBbMax = null;
    telemetry.post70ReplacementEntryBbMin = null;
    telemetry.post70ReplacementDepthViolations = 0;
    telemetry.scheduleMismatches.length = 0;
  }

  function candidateLevelForHand(handNumber) {
    const safeHand = Math.max(1, Number.parseInt(handNumber, 10) || 1);
    const baseline = originalBlindLevelForHand(safeHand);
    if (!activePolicy?.extendAfterL5 || safeHand < EXTENDED_LEVELS[0].startHand) return baseline;
    let selected = EXTENDED_LEVELS[0];
    for (const level of EXTENDED_LEVELS) {
      if (safeHand < level.startHand) break;
      selected = level;
    }
    return { level: selected.level, small: selected.small, big: selected.big, buyIn: selected.buyIn };
  }

  function currentExpectedLevel() {
    const handNumber = Math.max(1, Number(state?.handNumber || 1));
    return candidateLevelForHand(handNumber);
  }

  function replacementLevelForNextHand() {
    const handNumber = Math.max(1, Number(state?.handNumber || 0) + 1);
    return candidateLevelForHand(handNumber);
  }

  function configUnchanged() {
    const current = window.ReplacementStackBalance?.normalConfig || {};
    return Boolean(
      productionConfig
      && current.version === productionConfig.version
      && current.strategy === productionConfig.strategy
      && finite(current.tableMedianRatio) === finite(productionConfig.tableMedianRatio)
      && finite(current.buyInRatioCap) === finite(productionConfig.buyInRatioCap)
      && finite(current.softFloorBigBlinds) === finite(productionConfig.softFloorBigBlinds)
      && finite(current.maxBigBlinds) === finite(productionConfig.maxBigBlinds)
    );
  }

  function install(policyId) {
    if (installed) {
      if (activePolicy?.id !== policyId) throw new Error(`Post-L5 blind adapter already installed for ${activePolicy?.id}`);
      return snapshot();
    }

    const policy = POLICIES[policyId];
    if (!policy) throw new Error(`Unknown post-L5 blind policy: ${policyId}`);
    if (window.TournamentMode?.isActive?.()) throw new Error("Post-L5 blind benchmark only evaluates normal mode");
    if (typeof blindLevelForHand !== "function") throw new Error("blindLevelForHand is unavailable");
    if (typeof buildNextAiSeats !== "function") throw new Error("buildNextAiSeats is unavailable");

    const balance = window.ReplacementStackBalance;
    if (!balance || balance.version !== "2.1.0" || typeof balance.calculateNormalReplacementPlan !== "function") {
      throw new Error("ReplacementStackBalance 2.1.0 is required");
    }

    activePolicy = policy;
    productionConfig = Object.freeze({ ...(balance.normalConfig || {}) });
    originalBlindLevelForHand = blindLevelForHand;
    originalBuildNextAiSeats = buildNextAiSeats;

    const benchmarkBlindLevelForHand = function benchmarkBlindLevelForHand(handNumber) {
      if (window.TournamentMode?.isActive?.()) return originalBlindLevelForHand(handNumber);
      return candidateLevelForHand(handNumber);
    };
    benchmarkBlindLevelForHand.__postL5BlindPressureV1 = true;
    benchmarkBlindLevelForHand.__original = originalBlindLevelForHand;
    blindLevelForHand = benchmarkBlindLevelForHand;

    buildNextAiSeats = function buildNextAiSeatsWithPostL5BlindPressure(previousPlayers) {
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      if (!Array.isArray(previousPlayers) || !previousPlayers.length || window.TournamentMode?.isActive?.()) return seats;

      let replacedSeats = 0;
      for (const seat of Array.isArray(seats) ? seats : []) if (seat?.replaced) replacedSeats += 1;
      if (!replacedSeats) return seats;

      telemetry.replacementEvents += 1;
      telemetry.replacedSeats += replacedSeats;

      if (!activePolicy.extendAfterL5) return seats;
      const nextLevel = replacementLevelForNextHand();
      if (nextLevel.level <= 5) return seats;

      const plan = balance.calculateNormalReplacementPlan(previousPlayers, {
        bigBlind: nextLevel.big,
        buyIn: nextLevel.buyIn,
      });
      const entryBb = finite(plan?.actualEntryBb);
      telemetry.adjustedReplacementEvents += 1;
      telemetry.adjustedReplacementSeats += replacedSeats;
      telemetry.post70ReplacementEntryBbMax = telemetry.post70ReplacementEntryBbMax === null
        ? entryBb
        : Math.max(telemetry.post70ReplacementEntryBbMax, entryBb);
      telemetry.post70ReplacementEntryBbMin = telemetry.post70ReplacementEntryBbMin === null
        ? entryBb
        : Math.min(telemetry.post70ReplacementEntryBbMin, entryBb);

      // Level 5 has 37.5BB buy-in. Keeping buy-in proportional to the blind
      // must preserve the same 75% structural cap: 28.125BB.
      if (entryBb > 28.125 + 1e-9) telemetry.post70ReplacementDepthViolations += replacedSeats;

      return seats.map(seat => seat?.replaced ? {
        ...seat,
        stack: plan.stack,
        replacementStackBalanced: true,
        replacementStackPolicy: plan.strategy,
        postL5BlindPressurePolicy: activePolicy.id,
      } : seat);
    };

    installed = true;
    resetTelemetry();
    return snapshot();
  }

  function recordHandSnapshot(players, observedBigBlind) {
    if (!installed || !Array.isArray(players) || !players.length) return false;
    const handNumber = Math.max(1, Number(state?.handNumber || telemetry.hands.length + 1));
    const expected = candidateLevelForHand(handNumber);
    const bb = Math.max(1, finite(observedBigBlind, expected.big));
    const hero = players.find(player => player?.isHuman) || players[0];
    const heroBb = Math.max(0, finite(hero?.stack)) / bb;
    const opponentBbs = players
      .filter(player => player && player !== hero && !player.isHuman)
      .map(player => Math.max(0, finite(player?.stack)) / bb)
      .filter(value => value > 0);
    const opponentMedianBb = median(opponentBbs);
    const ratio = opponentMedianBb > 0 ? heroBb / opponentMedianBb : null;
    const buyInBb = expected.buyIn / Math.max(1, expected.big);
    const structuralReplacementCapBb = Math.min(
      buyInBb * finite(productionConfig?.buyInRatioCap, 0.75),
      finite(productionConfig?.maxBigBlinds, 60),
    );

    if (bb !== expected.big && telemetry.scheduleMismatches.length < 30) {
      telemetry.scheduleMismatches.push({ handNumber, observedBigBlind: bb, expectedBigBlind: expected.big });
    }

    if (telemetry.hands.length < 1_000) {
      telemetry.hands.push({
        handNumber,
        blindLevel: expected.level,
        bigBlind: bb,
        expectedBigBlind: expected.big,
        buyInBb: round(buyInBb, 4),
        structuralReplacementCapBb: round(structuralReplacementCapBb, 4),
        heroBb: round(heroBb, 4),
        opponentMedianBb: round(opponentMedianBb, 4),
        heroToOpponentMedianRatio: ratio === null ? null : round(ratio, 6),
        positiveOpponentSeats: opponentBbs.length,
      });
    }
    return true;
  }

  function snapshot() {
    const observedBigBlinds = telemetry.hands.map(hand => hand.bigBlind).filter(Number.isFinite);
    const observedLevels = [...new Set(telemetry.hands.map(hand => hand.blindLevel).filter(Number.isFinite))].sort((a, b) => a - b);
    return {
      version: VERSION,
      schemaVersion: 1,
      installed,
      experimentOnly: true,
      productionSourceUnchanged: true,
      productionConfigUnchanged: configUnchanged(),
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      policy: activePolicy ? { ...activePolicy } : null,
      extendedLevels: EXTENDED_LEVELS.map(level => ({ ...level })),
      productionConfig: productionConfig ? { ...productionConfig } : null,
      handSampleCount: telemetry.hands.length,
      observedLevels,
      maximumObservedBigBlind: observedBigBlinds.length ? Math.max(...observedBigBlinds) : null,
      scheduleMismatchCount: telemetry.scheduleMismatches.length,
      scheduleMismatches: telemetry.scheduleMismatches.map(item => ({ ...item })),
      replacementEvents: telemetry.replacementEvents,
      replacedSeats: telemetry.replacedSeats,
      adjustedReplacementEvents: telemetry.adjustedReplacementEvents,
      adjustedReplacementSeats: telemetry.adjustedReplacementSeats,
      post70ReplacementEntryBbMax: telemetry.post70ReplacementEntryBbMax === null ? null : round(telemetry.post70ReplacementEntryBbMax, 4),
      post70ReplacementEntryBbMin: telemetry.post70ReplacementEntryBbMin === null ? null : round(telemetry.post70ReplacementEntryBbMin, 4),
      post70ReplacementDepthViolations: telemetry.post70ReplacementDepthViolations,
      hands: telemetry.hands.map(hand => ({ ...hand })),
    };
  }

  window.PokerEconomyPostL5BlindPressureV1 = Object.freeze({
    version: VERSION,
    policies: POLICIES,
    extendedLevels: EXTENDED_LEVELS,
    install,
    levelForHand: handNumber => ({ ...candidateLevelForHand(handNumber) }),
    recordHandSnapshot,
    snapshot,
    resetTelemetry,
  });
})();
