(() => {
  "use strict";

  if (window.PokerEconomySustainedRunawayV1?.version) return;

  const VERSION = "1.0.0";
  const TRIGGER_WINDOW_HANDS = 50;
  const TRIGGER_FIVE_X_HANDS = 10;
  const TRIGGER_RATIO = 5;
  const POLICIES = Object.freeze({
    "80-75": Object.freeze({
      id: "80-75",
      sustainedResponse: false,
      responseTableMedianRatio: 0.80,
      responseExtraBbCap: 0,
    }),
    "sustain5-median100": Object.freeze({
      id: "sustain5-median100",
      sustainedResponse: true,
      responseTableMedianRatio: 1.00,
      responseExtraBbCap: 8,
    }),
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
    sustainedEligibleEvents: 0,
    sustainedEligibleSeats: 0,
    sustainedAppliedEvents: 0,
    sustainedAppliedSeats: 0,
    sustainedExtraInjectedBb: 0,
    handStackSamples: [],
    replacementSamples: [],
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
    telemetry.sharedCalculatorCalls = 0;
    telemetry.aiReplacementEvents = 0;
    telemetry.aiReplacedSeats = 0;
    telemetry.entryBbTotal = 0;
    telemetry.entryBbMinimum = null;
    telemetry.entryBbMaximum = null;
    telemetry.tableMedianBbTotal = 0;
    telemetry.sustainedEligibleEvents = 0;
    telemetry.sustainedEligibleSeats = 0;
    telemetry.sustainedAppliedEvents = 0;
    telemetry.sustainedAppliedSeats = 0;
    telemetry.sustainedExtraInjectedBb = 0;
    telemetry.handStackSamples.length = 0;
    telemetry.replacementSamples.length = 0;
  }

  function currentTriggerState() {
    const all = telemetry.handStackSamples;
    const window = all.slice(-TRIGGER_WINDOW_HANDS);
    const ratios = window
      .map(sample => Number(sample?.heroToOpponentMedianRatio))
      .filter(Number.isFinite);
    const fiveXHands = ratios.filter(value => value >= TRIGGER_RATIO).length;
    const enoughHistory = ratios.length >= TRIGGER_WINDOW_HANDS;
    return {
      enoughHistory,
      windowHands: ratios.length,
      fiveXHands,
      fiveXRate: ratios.length ? fiveXHands / ratios.length : 0,
      active: enoughHistory && fiveXHands >= TRIGGER_FIVE_X_HANDS,
    };
  }

  function candidatePlan(players, options = {}) {
    if (!installed || typeof originalPlan !== "function" || !activePolicy) {
      throw new Error("Sustained-runaway benchmark adapter is not installed");
    }

    const baseline = originalPlan(players, options);
    const bigBlind = Math.max(1, finite(baseline?.bigBlind, 20));
    const fullBuyIn = Math.max(bigBlind, finite(baseline?.fullBuyIn, bigBlind * 100));
    const tableMedian = Math.max(bigBlind, finite(baseline?.tableMedian, fullBuyIn));
    const productionBuyInCap = Math.max(0, finite(productionConfig?.buyInRatioCap, 0.75));
    const productionSoftFloorBb = Math.max(0, finite(productionConfig?.softFloorBigBlinds, 12));
    const productionMaxBb = Math.max(1, finite(productionConfig?.maxBigBlinds, 60));
    const baselineStack = Math.max(0, finite(baseline?.stack));
    const trigger = currentTriggerState();
    const eligible = Boolean(activePolicy.sustainedResponse && trigger.active);

    let stack = baselineStack;
    let responseTarget = baselineStack;
    if (eligible) {
      // The first candidate retained the production 75% buy-in cap inside the
      // response target. On real runaway paths that made the challenger inert:
      // the cap was already binding before a 100%-median target could add chips.
      // Keep the production config itself untouched, but permit this experiment
      // to lift only this future replacement by at most 8BB, never above the
      // current table median and never above the production 60BB hard cap.
      const rawTarget = Math.min(
        tableMedian * finite(activePolicy.responseTableMedianRatio, 1),
        baselineStack + bigBlind * Math.max(0, finite(activePolicy.responseExtraBbCap, 0)),
        bigBlind * productionMaxBb,
      );
      const softFloor = Math.min(tableMedian, bigBlind * productionSoftFloorBb);
      const boundedTarget = Math.min(tableMedian, Math.max(rawTarget, softFloor));
      const roundedDown = Math.floor(boundedTarget / bigBlind) * bigBlind;
      const minimumPlayable = Math.min(tableMedian, bigBlind);
      responseTarget = Math.max(minimumPlayable, roundedDown || minimumPlayable);
      stack = Math.max(baselineStack, responseTarget);
    }

    const extraBb = Math.max(0, (stack - baselineStack) / bigBlind);
    return {
      ...baseline,
      strategy: eligible ? `sustained-${activePolicy.id}` : baseline.strategy,
      experimentOnly: true,
      triggerWindowHands: TRIGGER_WINDOW_HANDS,
      triggerFiveXHands: TRIGGER_FIVE_X_HANDS,
      triggerRatio: TRIGGER_RATIO,
      triggerWindowObserved: trigger.windowHands,
      triggerFiveXObserved: trigger.fiveXHands,
      triggerFiveXRate: round(trigger.fiveXRate, 6),
      sustainedEligible: eligible,
      sustainedApplied: extraBb > 0,
      responseTableMedianRatio: finite(activePolicy.responseTableMedianRatio, 0.80),
      responseExtraBbCap: finite(activePolicy.responseExtraBbCap, 0),
      productionBuyInRatioCap: productionBuyInCap,
      baselineStack,
      baselineEntryBb: baselineStack / bigBlind,
      responseTarget,
      stack,
      actualEntryBb: stack / bigBlind,
      sustainedExtraBb: extraBb,
      maxBigBlinds: productionMaxBb,
    };
  }

  function recordReplacement(plan, replacedSeats) {
    const count = Math.max(0, Number(replacedSeats) || 0);
    if (!count) return;

    const entryBb = finite(plan?.actualEntryBb);
    const tableMedianBb = finite(plan?.tableMedian) / Math.max(1, finite(plan?.bigBlind, 20));
    telemetry.aiReplacementEvents += 1;
    telemetry.aiReplacedSeats += count;
    telemetry.entryBbTotal += entryBb * count;
    telemetry.tableMedianBbTotal += tableMedianBb * count;
    telemetry.entryBbMinimum = telemetry.entryBbMinimum === null ? entryBb : Math.min(telemetry.entryBbMinimum, entryBb);
    telemetry.entryBbMaximum = telemetry.entryBbMaximum === null ? entryBb : Math.max(telemetry.entryBbMaximum, entryBb);

    if (plan?.sustainedEligible) {
      telemetry.sustainedEligibleEvents += 1;
      telemetry.sustainedEligibleSeats += count;
    }
    if (plan?.sustainedApplied) {
      telemetry.sustainedAppliedEvents += 1;
      telemetry.sustainedAppliedSeats += count;
      telemetry.sustainedExtraInjectedBb += finite(plan.sustainedExtraBb) * count;
    }

    if (telemetry.replacementSamples.length < 300) {
      telemetry.replacementSamples.push({
        handIndex: telemetry.handStackSamples.length,
        baselineEntryBb: round(plan?.baselineEntryBb, 4),
        entryBb: round(entryBb, 4),
        tableMedianBb: round(tableMedianBb, 4),
        triggerWindowObserved: finite(plan?.triggerWindowObserved),
        triggerFiveXObserved: finite(plan?.triggerFiveXObserved),
        sustainedEligible: Boolean(plan?.sustainedEligible),
        sustainedApplied: Boolean(plan?.sustainedApplied),
        sustainedExtraBb: round(plan?.sustainedExtraBb, 4),
        replacedSeats: count,
      });
    }
  }

  function recordHandSnapshot(players, bigBlind) {
    if (!installed || !Array.isArray(players) || !players.length) return false;
    const bb = Math.max(1, finite(bigBlind, 20));
    const hero = players.find(player => player?.isHuman) || players[0];
    const heroBb = Math.max(0, finite(hero?.stack)) / bb;
    const opponentBbs = players
      .filter(player => player && player !== hero && !player.isHuman)
      .map(player => Math.max(0, finite(player.stack)) / bb)
      .filter(value => value > 0);
    const opponentMedianBb = median(opponentBbs);
    const ratio = opponentMedianBb > 0 ? heroBb / opponentMedianBb : null;

    if (telemetry.handStackSamples.length < 1_000) {
      telemetry.handStackSamples.push({
        heroBb: round(heroBb, 4),
        opponentMedianBb: round(opponentMedianBb, 4),
        heroToOpponentMedianRatio: ratio === null ? null : round(ratio, 6),
        positiveOpponentSeats: opponentBbs.length,
        allOpponentsBusted: opponentBbs.length === 0,
      });
      const trigger = currentTriggerState();
      telemetry.handStackSamples.at(-1).sustainedTriggerActive = trigger.active;
      telemetry.handStackSamples.at(-1).rollingFiveXHands = trigger.fiveXHands;
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
      if (activePolicy?.id !== policyId) throw new Error(`Sustained-runaway adapter already installed for ${activePolicy?.id}`);
      return snapshot();
    }
    const policy = POLICIES[policyId];
    if (!policy) throw new Error(`Unknown sustained-runaway policy: ${policyId}`);
    const balance = window.ReplacementStackBalance;
    if (!balance || typeof balance.calculateNormalReplacementPlan !== "function" || typeof balance.calculate !== "function") {
      throw new Error("ReplacementStackBalance 2.1.0 is required");
    }
    if (window.TournamentMode?.isActive?.()) throw new Error("Sustained-runaway benchmark only evaluates normal mode");

    activePolicy = policy;
    productionConfig = Object.freeze({ ...(balance.normalConfig || {}) });
    originalCalculate = balance.calculate;
    originalPlan = balance.calculateNormalReplacementPlan;
    originalBuildNextAiSeats = typeof buildNextAiSeats === "function" ? buildNextAiSeats : null;
    if (typeof originalBuildNextAiSeats !== "function") throw new Error("buildNextAiSeats is unavailable");

    installed = true;
    balance.calculateNormalReplacementPlan = function calculateSustainedPlan(players, options) {
      telemetry.sharedCalculatorCalls += 1;
      return candidatePlan(players, options);
    };
    balance.calculate = function calculateSustainedStack(players, options) {
      telemetry.sharedCalculatorCalls += 1;
      return candidatePlan(players, options).stack;
    };

    buildNextAiSeats = function buildNextAiSeatsWithSustainedResponse(previousPlayers) {
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
          economySustainedCandidate: activePolicy.id,
        };
      });
      recordReplacement(plan, replacedSeats);
      return adjusted;
    };

    resetTelemetry();
    return snapshot();
  }

  function snapshot() {
    const seats = telemetry.aiReplacedSeats;
    const trigger = currentTriggerState();
    return {
      version: VERSION,
      schemaVersion: 1,
      installed,
      experimentOnly: true,
      productionBehaviorChanged: false,
      productionConfigUnchanged: configUnchanged(),
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      policy: activePolicy ? {
        id: activePolicy.id,
        sustainedResponse: activePolicy.sustainedResponse,
        responseTableMedianRatio: activePolicy.responseTableMedianRatio,
        responseExtraBbCap: activePolicy.responseExtraBbCap,
        triggerWindowHands: TRIGGER_WINDOW_HANDS,
        triggerFiveXHands: TRIGGER_FIVE_X_HANDS,
        triggerRatio: TRIGGER_RATIO,
        buyInRatioCap: finite(productionConfig?.buyInRatioCap, 0.75),
        softFloorBigBlinds: finite(productionConfig?.softFloorBigBlinds, 12),
        maxBigBlinds: finite(productionConfig?.maxBigBlinds, 60),
      } : null,
      productionConfig: productionConfig ? { ...productionConfig } : null,
      sharedCalculatorCalls: telemetry.sharedCalculatorCalls,
      aiReplacementEvents: telemetry.aiReplacementEvents,
      aiReplacedSeats: seats,
      averageEntryBb: seats ? round(telemetry.entryBbTotal / seats, 4) : 0,
      minimumEntryBb: telemetry.entryBbMinimum === null ? null : round(telemetry.entryBbMinimum, 4),
      maximumEntryBb: telemetry.entryBbMaximum === null ? null : round(telemetry.entryBbMaximum, 4),
      averageTableMedianBb: seats ? round(telemetry.tableMedianBbTotal / seats, 4) : 0,
      sustainedEligibleEvents: telemetry.sustainedEligibleEvents,
      sustainedEligibleSeats: telemetry.sustainedEligibleSeats,
      sustainedAppliedEvents: telemetry.sustainedAppliedEvents,
      sustainedAppliedSeats: telemetry.sustainedAppliedSeats,
      sustainedExtraInjectedBb: round(telemetry.sustainedExtraInjectedBb, 4),
      currentTriggerActive: trigger.active,
      currentRollingFiveXHands: trigger.fiveXHands,
      handStackSampleCount: telemetry.handStackSamples.length,
      handStackSamples: telemetry.handStackSamples.map(sample => ({ ...sample })),
      replacementSamples: telemetry.replacementSamples.map(sample => ({ ...sample })),
    };
  }

  window.PokerEconomySustainedRunawayV1 = Object.freeze({
    version: VERSION,
    policies: POLICIES,
    install,
    snapshot,
    resetTelemetry,
    recordHandSnapshot,
  });
})();