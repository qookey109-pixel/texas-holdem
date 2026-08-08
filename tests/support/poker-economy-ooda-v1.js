(() => {
  "use strict";

  const VERSION = "1.1.0";
  const POLICY_VERSION = "1.0.0";
  const POLICIES = Object.freeze({
    "80-75": Object.freeze({ id: "80-75", tableMedianRatio: 0.80, buyInRatioCap: 0.75 }),
    "85-75": Object.freeze({ id: "85-75", tableMedianRatio: 0.85, buyInRatioCap: 0.75 }),
    "80-85": Object.freeze({ id: "80-85", tableMedianRatio: 0.80, buyInRatioCap: 0.85 }),
    "85-85": Object.freeze({ id: "85-85", tableMedianRatio: 0.85, buyInRatioCap: 0.85 }),
  });

  let installed = false;
  let activePolicy = null;
  let originalCalculate = null;
  let originalPlan = null;
  let originalBuildNextAiSeats = null;
  let productionConfig = null;
  const telemetry = {
    sharedCalculatorCalls: 0,
    aiReplacementEvents: 0,
    aiReplacedSeats: 0,
    entryBbTotal: 0,
    entryBbMinimum: null,
    entryBbMaximum: null,
    tableMedianBbTotal: 0,
    samples: [],
    handStackSamples: [],
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
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function resetTelemetry() {
    telemetry.sharedCalculatorCalls = 0;
    telemetry.aiReplacementEvents = 0;
    telemetry.aiReplacedSeats = 0;
    telemetry.entryBbTotal = 0;
    telemetry.entryBbMinimum = null;
    telemetry.entryBbMaximum = null;
    telemetry.tableMedianBbTotal = 0;
    telemetry.samples.length = 0;
    telemetry.handStackSamples.length = 0;
  }

  function candidatePlan(players, options = {}) {
    if (typeof originalPlan !== "function" || !activePolicy) {
      throw new Error("Poker Economy OODA adapter is not installed");
    }
    const baseline = originalPlan(players, options);
    const bigBlind = Math.max(1, finite(baseline?.bigBlind, 20));
    const fullBuyIn = Math.max(bigBlind, finite(baseline?.fullBuyIn, bigBlind * 100));
    const tableMedian = Math.max(bigBlind, finite(baseline?.tableMedian, fullBuyIn));
    const softFloorBb = Math.max(0, finite(productionConfig?.softFloorBigBlinds, 12));
    const maxBigBlinds = Math.max(1, finite(productionConfig?.maxBigBlinds, 60));
    const rawTarget = Math.min(
      tableMedian * activePolicy.tableMedianRatio,
      fullBuyIn * activePolicy.buyInRatioCap,
      bigBlind * maxBigBlinds,
    );
    const softFloor = Math.min(tableMedian, bigBlind * softFloorBb);
    const boundedTarget = Math.min(tableMedian, Math.max(rawTarget, softFloor));
    const roundedDown = Math.floor(boundedTarget / bigBlind) * bigBlind;
    const minimumPlayable = Math.min(tableMedian, bigBlind);
    const stack = Math.max(minimumPlayable, roundedDown || minimumPlayable);
    return {
      ...baseline,
      strategy: `ooda-${activePolicy.id}`,
      experimentOnly: true,
      policyVersion: POLICY_VERSION,
      tableMedianRatio: activePolicy.tableMedianRatio,
      buyInRatioCap: activePolicy.buyInRatioCap,
      rawTarget,
      softFloor,
      boundedTarget,
      stack,
      actualEntryBb: stack / bigBlind,
    };
  }

  function recordAiReplacement(plan, replacedSeats) {
    const count = Math.max(0, Number(replacedSeats) || 0);
    if (!count) return;
    const entryBb = finite(plan?.actualEntryBb);
    const tableMedianBb = finite(plan?.tableMedian) / Math.max(1, finite(plan?.bigBlind, 20));
    telemetry.aiReplacementEvents += 1;
    telemetry.aiReplacedSeats += count;
    telemetry.entryBbTotal += entryBb * count;
    telemetry.tableMedianBbTotal += tableMedianBb * count;
    telemetry.entryBbMinimum = telemetry.entryBbMinimum === null
      ? entryBb
      : Math.min(telemetry.entryBbMinimum, entryBb);
    telemetry.entryBbMaximum = telemetry.entryBbMaximum === null
      ? entryBb
      : Math.max(telemetry.entryBbMaximum, entryBb);
    if (telemetry.samples.length < 200) {
      telemetry.samples.push({
        entryBb: round(entryBb, 4),
        tableMedianBb: round(tableMedianBb, 4),
        replacedSeats: count,
      });
    }
  }

  function recordHandSnapshot(players, bigBlind) {
    if (!installed || !Array.isArray(players) || !players.length) return false;
    const bb = Math.max(1, finite(bigBlind, 20));
    const hero = players[0];
    const heroBb = Math.max(0, finite(hero?.stack)) / bb;
    const positiveOpponentBbs = players
      .slice(1)
      .map(player => Math.max(0, finite(player?.stack)) / bb)
      .filter(stackBb => stackBb > 0);
    const opponentMedianBb = median(positiveOpponentBbs);
    const ratio = opponentMedianBb > 0 ? heroBb / opponentMedianBb : null;
    if (telemetry.handStackSamples.length < 1_000) {
      telemetry.handStackSamples.push({
        heroBb: round(heroBb, 4),
        opponentMedianBb: round(opponentMedianBb, 4),
        heroToOpponentMedianRatio: ratio === null ? null : round(ratio, 6),
        positiveOpponentSeats: positiveOpponentBbs.length,
        allOpponentsBusted: positiveOpponentBbs.length === 0,
      });
    }
    return true;
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
      if (activePolicy?.id !== policyId) throw new Error(`Economy OODA already installed for ${activePolicy?.id}`);
      return snapshot();
    }
    const policy = POLICIES[policyId];
    if (!policy) throw new Error(`Unknown Poker Economy OODA policy: ${policyId}`);
    const balance = window.ReplacementStackBalance;
    if (!balance || typeof balance.calculate !== "function" || typeof balance.calculateNormalReplacementPlan !== "function") {
      throw new Error("ReplacementStackBalance 2.1.0 is required before installing Economy OODA");
    }
    if (window.TournamentMode?.isActive?.()) {
      throw new Error("Poker Economy OODA V1 only evaluates normal mode");
    }

    activePolicy = policy;
    productionConfig = Object.freeze({ ...(balance.normalConfig || {}) });
    originalCalculate = balance.calculate;
    originalPlan = balance.calculateNormalReplacementPlan;
    originalBuildNextAiSeats = typeof buildNextAiSeats === "function" ? buildNextAiSeats : null;
    if (typeof originalBuildNextAiSeats !== "function") throw new Error("buildNextAiSeats is unavailable");

    balance.calculateNormalReplacementPlan = function calculateOodaNormalReplacementPlan(players, options) {
      telemetry.sharedCalculatorCalls += 1;
      return candidatePlan(players, options);
    };
    balance.calculate = function calculateOodaNormalReplacementStack(players, options) {
      telemetry.sharedCalculatorCalls += 1;
      return candidatePlan(players, options).stack;
    };

    const wrappedBuildNextAiSeats = function buildNextAiSeatsWithOodaEconomy(previousPlayers) {
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      if (window.TournamentMode?.isActive?.() || !Array.isArray(previousPlayers) || !previousPlayers.length) return seats;
      const plan = candidatePlan(previousPlayers);
      let replacedSeats = 0;
      const adjusted = (Array.isArray(seats) ? seats : []).map(seat => {
        if (!seat?.replaced) return seat;
        replacedSeats += 1;
        return {
          ...seat,
          stack: plan.stack,
          replacementStackPolicy: plan.strategy,
          economyOodaCandidate: activePolicy.id,
        };
      });
      recordAiReplacement(plan, replacedSeats);
      return adjusted;
    };
    wrappedBuildNextAiSeats.__pokerEconomyOodaV1 = true;
    wrappedBuildNextAiSeats.__original = originalBuildNextAiSeats;
    buildNextAiSeats = wrappedBuildNextAiSeats;

    resetTelemetry();
    installed = true;
    document.documentElement.dataset.pokerEconomyOodaV1 = policy.id;
    return snapshot();
  }

  function snapshot() {
    const seats = telemetry.aiReplacedSeats;
    const stackSamples = telemetry.handStackSamples;
    const ratioSamples = stackSamples
      .map(sample => sample.heroToOpponentMedianRatio)
      .filter(value => Number.isFinite(Number(value)))
      .map(Number);
    const average = values => values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    return {
      version: VERSION,
      schemaVersion: 1,
      policyVersion: POLICY_VERSION,
      installed,
      experimentOnly: true,
      productionBehaviorChanged: false,
      policy: activePolicy ? {
        id: activePolicy.id,
        tableMedianRatio: activePolicy.tableMedianRatio,
        buyInRatioCap: activePolicy.buyInRatioCap,
        softFloorBigBlinds: finite(productionConfig?.softFloorBigBlinds, 12),
        maxBigBlinds: finite(productionConfig?.maxBigBlinds, 60),
      } : null,
      productionConfig: productionConfig ? { ...productionConfig } : null,
      productionConfigUnchanged: configUnchanged(),
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      sharedCalculatorCalls: telemetry.sharedCalculatorCalls,
      aiReplacementEvents: telemetry.aiReplacementEvents,
      aiReplacedSeats: seats,
      averageEntryBb: seats ? round(telemetry.entryBbTotal / seats, 4) : 0,
      minimumEntryBb: telemetry.entryBbMinimum === null ? null : round(telemetry.entryBbMinimum, 4),
      maximumEntryBb: telemetry.entryBbMaximum === null ? null : round(telemetry.entryBbMaximum, 4),
      averageTableMedianBb: seats ? round(telemetry.tableMedianBbTotal / seats, 4) : 0,
      handStackSampleCount: stackSamples.length,
      averageHeroBb: round(average(stackSamples.map(sample => sample.heroBb)), 4),
      averageOpponentMedianBb: round(average(stackSamples.map(sample => sample.opponentMedianBb)), 4),
      averageHeroToOpponentMedianRatio: round(average(ratioSamples), 6),
      maximumHeroToOpponentMedianRatio: ratioSamples.length ? round(Math.max(...ratioSamples), 6) : null,
      allOpponentsBustedHands: stackSamples.filter(sample => sample.allOpponentsBusted).length,
      handStackSamples: stackSamples.map(sample => ({ ...sample })),
      samples: telemetry.samples.map(sample => ({ ...sample })),
    };
  }

  function restore() {
    if (!installed) return true;
    const balance = window.ReplacementStackBalance;
    if (balance) {
      balance.calculate = originalCalculate;
      balance.calculateNormalReplacementPlan = originalPlan;
    }
    if (typeof buildNextAiSeats === "function" && buildNextAiSeats.__pokerEconomyOodaV1) {
      buildNextAiSeats = originalBuildNextAiSeats;
    }
    installed = false;
    activePolicy = null;
    document.documentElement.removeAttribute("data-poker-economy-ooda-v1");
    return true;
  }

  window.PokerEconomyOodaV1 = {
    version: VERSION,
    policies: POLICIES,
    install,
    snapshot,
    restore,
    resetTelemetry,
    recordHandSnapshot,
  };
})();