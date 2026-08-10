(() => {
  "use strict";

  const VERSION = "1.1.0";
  const POLICIES = Object.freeze({
    baseline: Object.freeze({ id: "baseline", cadenceHands: null, bigBlindStep: 0, buyInStep: 0, maxBigBlind: 400 }),
    gentle50: Object.freeze({ id: "gentle50", cadenceHands: 50, bigBlindStep: 100, buyInStep: 3750, maxBigBlind: 1200 }),
    gentle100: Object.freeze({ id: "gentle100", cadenceHands: 100, bigBlindStep: 100, buyInStep: 3750, maxBigBlind: 1200 }),
  });

  let installed = false;
  let activePolicy = null;
  let originalBlindLevelForHand = null;
  let originalBuildNextAiSeats = null;
  let productionLevels = null;

  const telemetry = {
    handSamples: [],
    replacementEvents: 0,
    replacedSeats: 0,
    replacementEntryBbTotal: 0,
    replacementEntryBbMax: 0,
  };

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function resetTelemetry() {
    telemetry.handSamples.length = 0;
    telemetry.replacementEvents = 0;
    telemetry.replacedSeats = 0;
    telemetry.replacementEntryBbTotal = 0;
    telemetry.replacementEntryBbMax = 0;
  }

  function candidateLevel(handNumber) {
    const base = originalBlindLevelForHand(handNumber);
    if (!activePolicy || activePolicy.id === "baseline" || handNumber <= 20) return base;

    const cadence = finite(activePolicy.cadenceHands);
    const increments = cadence > 0 ? Math.max(0, Math.floor((handNumber - 21) / cadence)) : 0;
    if (!increments) return base;

    const step = Math.max(1, finite(activePolicy.bigBlindStep, 100));
    const maxBigBlind = Math.max(400, finite(activePolicy.maxBigBlind, 1200));
    const big = Math.min(maxBigBlind, 400 + increments * step);
    const appliedSteps = Math.max(0, Math.floor((big - 400) / step));
    const small = Math.floor(big / 2);
    const buyIn = 15000 + appliedSteps * finite(activePolicy.buyInStep);
    return {
      level: 5 + appliedSteps,
      small,
      big,
      buyIn,
      experimentOnly: true,
      blindPressurePolicy: activePolicy.id,
    };
  }

  function recordReplacementSeats(seats) {
    const replaced = (Array.isArray(seats) ? seats : []).filter(seat => seat?.replaced);
    if (!replaced.length) return;
    const bigBlind = Math.max(1, finite(typeof currentBigBlind === "function" ? currentBigBlind() : 1, 1));
    telemetry.replacementEvents += 1;
    telemetry.replacedSeats += replaced.length;
    for (const seat of replaced) {
      const entryBb = Math.max(0, finite(seat.stack)) / bigBlind;
      telemetry.replacementEntryBbTotal += entryBb;
      telemetry.replacementEntryBbMax = Math.max(telemetry.replacementEntryBbMax, entryBb);
    }
  }

  function recordHandSnapshot(players, bigBlind) {
    if (!installed || !Array.isArray(players) || !players.length) return false;
    const bb = Math.max(1, finite(bigBlind, 1));
    const hero = players.find(player => player?.isHuman) || players[0];
    const heroChips = Math.max(0, finite(hero?.stack));
    const heroBb = heroChips / bb;
    const opponentBbs = players
      .filter(player => player && player !== hero && !player.isHuman)
      .map(player => Math.max(0, finite(player.stack)) / bb)
      .filter(value => value > 0);
    const opponentMedianBb = median(opponentBbs);
    const ratio = opponentMedianBb > 0 ? heroBb / opponentMedianBb : null;
    const level = typeof currentBlindLevel === "function" ? currentBlindLevel() : null;
    const handNumber = Math.max(0, finite(state?.handNumber));

    if (telemetry.handSamples.length < 1_000) {
      telemetry.handSamples.push({
        handNumber,
        level: Math.max(0, finite(level?.level)),
        smallBlind: Math.max(0, finite(level?.small)),
        bigBlind: bb,
        buyIn: Math.max(0, finite(level?.buyIn)),
        heroChips: round(heroChips, 4),
        heroBb: round(heroBb, 6),
        opponentMedianBb: round(opponentMedianBb, 6),
        heroToOpponentMedianRatio: ratio === null ? null : round(ratio, 6),
        opponentThreatShare: heroBb > 0 ? round(opponentMedianBb / heroBb, 6) : null,
        positiveOpponentSeats: opponentBbs.length,
        heroBusted: heroChips <= 0,
      });
    }
    return true;
  }

  function productionConfigUnchanged() {
    try {
      return JSON.stringify(BLIND_LEVELS) === JSON.stringify(productionLevels);
    } catch {
      return false;
    }
  }

  function install(policyId) {
    if (installed) {
      if (activePolicy?.id !== policyId) throw new Error(`Blind pressure benchmark already installed for ${activePolicy?.id}`);
      return snapshot();
    }
    const policy = POLICIES[policyId];
    if (!policy) throw new Error(`Unknown blind pressure policy: ${policyId}`);
    if (typeof blindLevelForHand !== "function") throw new Error("blindLevelForHand is unavailable");
    if (typeof buildNextAiSeats !== "function") throw new Error("buildNextAiSeats is unavailable");
    if (window.TournamentMode?.isActive?.()) throw new Error("Blind pressure benchmark evaluates normal mode only");

    activePolicy = policy;
    originalBlindLevelForHand = blindLevelForHand;
    originalBuildNextAiSeats = buildNextAiSeats;
    productionLevels = JSON.parse(JSON.stringify(BLIND_LEVELS));

    blindLevelForHand = function blindPressureLevelForHand(handNumber) {
      return candidateLevel(Math.max(1, finite(handNumber, 1)));
    };

    const wrappedBuildNextAiSeats = function buildNextAiSeatsBlindPressure() {
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      recordReplacementSeats(seats);
      return seats;
    };
    wrappedBuildNextAiSeats.__blindPressureBenchmarkV1 = true;
    wrappedBuildNextAiSeats.__original = originalBuildNextAiSeats;
    buildNextAiSeats = wrappedBuildNextAiSeats;

    resetTelemetry();
    installed = true;
    document.documentElement.dataset.blindPressureBenchmarkV1 = policy.id;
    return snapshot();
  }

  function snapshot() {
    const replacementAverage = telemetry.replacedSeats
      ? telemetry.replacementEntryBbTotal / telemetry.replacedSeats
      : 0;
    return {
      version: VERSION,
      schemaVersion: 1,
      installed,
      experimentOnly: true,
      productionSourceChanged: false,
      productionConfigUnchanged: productionConfigUnchanged(),
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      policy: activePolicy ? { ...activePolicy } : null,
      replacementEvents: telemetry.replacementEvents,
      replacedSeats: telemetry.replacedSeats,
      averageReplacementEntryBb: round(replacementAverage, 6),
      maximumReplacementEntryBb: round(telemetry.replacementEntryBbMax, 6),
      handSampleCount: telemetry.handSamples.length,
      handSamples: telemetry.handSamples.map(sample => ({ ...sample })),
    };
  }

  function restore() {
    if (!installed) return true;
    blindLevelForHand = originalBlindLevelForHand;
    if (typeof buildNextAiSeats === "function" && buildNextAiSeats.__blindPressureBenchmarkV1) {
      buildNextAiSeats = originalBuildNextAiSeats;
    }
    installed = false;
    activePolicy = null;
    document.documentElement.removeAttribute("data-blind-pressure-benchmark-v1");
    return true;
  }

  window.BlindPressureBenchmarkV1 = {
    version: VERSION,
    policies: POLICIES,
    install,
    snapshot,
    restore,
    resetTelemetry,
    recordHandSnapshot,
  };
})();
