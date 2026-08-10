(() => {
  "use strict";

  const VERSION = "1.0.0";
  const POLICIES = Object.freeze({
    "80-75": Object.freeze({ id: "80-75", tailLeadThreshold: null, tailFloorBb: 0, tailCooldownHands: 0 }),
    "tail5-floor20": Object.freeze({ id: "tail5-floor20", tailLeadThreshold: 5, tailFloorBb: 20, tailCooldownHands: 0 }),
    "tail5-floor20-budgeted": Object.freeze({ id: "tail5-floor20-budgeted", tailLeadThreshold: 5, tailFloorBb: 20, tailCooldownHands: 50 }),
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
    tailEligibleEvents: 0,
    tailEligibleSeats: 0,
    tailCooldownSuppressedEvents: 0,
    tailCooldownSuppressedSeats: 0,
    tailAppliedEvents: 0,
    tailAppliedSeats: 0,
    tailExtraInjectedBb: 0,
    tailLeadRatioTotal: 0,
    tailLeadRatioSamples: 0,
    lastTailAppliedHandIndex: null,
    samples: [],
    handStackSamples: [],
  };

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const round = (value, digits = 6) => {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  };
  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function leadSnapshot(players) {
    const list = Array.isArray(players) ? players : [];
    const hero = list.find(player => player?.isHuman) || list[0] || null;
    const heroStack = Math.max(0, finite(hero?.stack));
    const opponentStacks = list.filter(player => player && player !== hero && !player.isHuman && finite(player.stack) > 0).map(player => finite(player.stack));
    const opponentMedian = median(opponentStacks);
    return { heroStack, opponentMedian, heroLeadRatio: opponentMedian > 0 ? heroStack / opponentMedian : 0 };
  }
  function resetTelemetry() {
    Object.assign(telemetry, {
      sharedCalculatorCalls: 0,
      aiReplacementEvents: 0,
      aiReplacedSeats: 0,
      entryBbTotal: 0,
      entryBbMinimum: null,
      entryBbMaximum: null,
      tableMedianBbTotal: 0,
      tailEligibleEvents: 0,
      tailEligibleSeats: 0,
      tailCooldownSuppressedEvents: 0,
      tailCooldownSuppressedSeats: 0,
      tailAppliedEvents: 0,
      tailAppliedSeats: 0,
      tailExtraInjectedBb: 0,
      tailLeadRatioTotal: 0,
      tailLeadRatioSamples: 0,
      lastTailAppliedHandIndex: null,
    });
    telemetry.samples.length = 0;
    telemetry.handStackSamples.length = 0;
  }
  function candidatePlan(players, options = {}) {
    if (!installed || typeof originalPlan !== "function" || !activePolicy) throw new Error("Tail-floor benchmark adapter is not installed");
    const baseline = originalPlan(players, options);
    const bigBlind = Math.max(1, finite(baseline?.bigBlind, 20));
    const fullBuyIn = Math.max(bigBlind, finite(baseline?.fullBuyIn, bigBlind * 100));
    const productionMaxBb = Math.max(1, finite(productionConfig?.maxBigBlinds, 60));
    const lead = leadSnapshot(players);
    const threshold = Number(activePolicy.tailLeadThreshold);
    const currentHandIndex = telemetry.handStackSamples.length;
    const leadEligible = Number.isFinite(threshold) && threshold > 0 && lead.heroLeadRatio >= threshold;
    const cooldownHands = Math.max(0, finite(activePolicy.tailCooldownHands));
    const cooldownReady = cooldownHands <= 0 || telemetry.lastTailAppliedHandIndex === null || currentHandIndex - telemetry.lastTailAppliedHandIndex >= cooldownHands;
    const tailEligible = leadEligible && cooldownReady;
    const baselineStack = Math.max(0, finite(baseline?.stack));
    const tailFloorStack = Math.min(fullBuyIn, bigBlind * productionMaxBb, bigBlind * Math.max(0, finite(activePolicy.tailFloorBb)));
    const stack = tailEligible ? Math.max(baselineStack, tailFloorStack) : baselineStack;
    const tailExtraBb = Math.max(0, (stack - baselineStack) / bigBlind);
    return {
      ...baseline,
      strategy: `ooda-${activePolicy.id}`,
      experimentOnly: true,
      heroLeadRatio: lead.heroLeadRatio,
      heroStack: lead.heroStack,
      opponentMedian: lead.opponentMedian,
      leadEligible,
      cooldownReady,
      tailEligible,
      tailApplied: tailExtraBb > 0,
      tailLeadThreshold: Number.isFinite(threshold) ? threshold : null,
      tailFloorBigBlinds: finite(activePolicy.tailFloorBb),
      tailCooldownHands: cooldownHands,
      currentHandIndex,
      baselineStack,
      baselineEntryBb: baselineStack / bigBlind,
      stack,
      actualEntryBb: stack / bigBlind,
      tailExtraBb,
      maxBigBlinds: productionMaxBb,
    };
  }
  function recordReplacement(plan, replacedSeats) {
    const count = Math.max(0, Number(replacedSeats) || 0);
    if (!count) return;
    const entryBb = finite(plan.actualEntryBb);
    const tableMedianBb = finite(plan.tableMedian) / Math.max(1, finite(plan.bigBlind, 20));
    telemetry.aiReplacementEvents += 1;
    telemetry.aiReplacedSeats += count;
    telemetry.entryBbTotal += entryBb * count;
    telemetry.tableMedianBbTotal += tableMedianBb * count;
    telemetry.entryBbMinimum = telemetry.entryBbMinimum === null ? entryBb : Math.min(telemetry.entryBbMinimum, entryBb);
    telemetry.entryBbMaximum = telemetry.entryBbMaximum === null ? entryBb : Math.max(telemetry.entryBbMaximum, entryBb);
    if (plan.leadEligible) {
      telemetry.tailEligibleEvents += 1;
      telemetry.tailEligibleSeats += count;
      telemetry.tailLeadRatioTotal += finite(plan.heroLeadRatio) * count;
      telemetry.tailLeadRatioSamples += count;
    }
    if (plan.leadEligible && !plan.cooldownReady) {
      telemetry.tailCooldownSuppressedEvents += 1;
      telemetry.tailCooldownSuppressedSeats += count;
    }
    if (plan.tailApplied) {
      telemetry.tailAppliedEvents += 1;
      telemetry.tailAppliedSeats += count;
      telemetry.tailExtraInjectedBb += finite(plan.tailExtraBb) * count;
      telemetry.lastTailAppliedHandIndex = Math.max(0, finite(plan.currentHandIndex));
    }
    if (telemetry.samples.length < 240) telemetry.samples.push({
      handIndex: plan.currentHandIndex,
      entryBb: round(entryBb, 4),
      baselineEntryBb: round(plan.baselineEntryBb, 4),
      tableMedianBb: round(tableMedianBb, 4),
      heroLeadRatio: round(plan.heroLeadRatio, 6),
      leadEligible: Boolean(plan.leadEligible),
      cooldownReady: Boolean(plan.cooldownReady),
      tailEligible: Boolean(plan.tailEligible),
      tailApplied: Boolean(plan.tailApplied),
      tailExtraBb: round(plan.tailExtraBb, 4),
      replacedSeats: count,
    });
  }
  function recordHandSnapshot(players, bigBlind) {
    if (!installed || !Array.isArray(players) || !players.length) return false;
    const bb = Math.max(1, finite(bigBlind, 20));
    const hero = players.find(player => player?.isHuman) || players[0];
    const heroBb = Math.max(0, finite(hero?.stack)) / bb;
    const opponents = players.filter(player => player && player !== hero && !player.isHuman).map(player => Math.max(0, finite(player.stack)) / bb).filter(value => value > 0);
    const opponentMedianBb = median(opponents);
    const ratio = opponentMedianBb > 0 ? heroBb / opponentMedianBb : null;
    if (telemetry.handStackSamples.length < 1000) telemetry.handStackSamples.push({
      heroBb: round(heroBb, 4),
      opponentMedianBb: round(opponentMedianBb, 4),
      heroToOpponentMedianRatio: ratio === null ? null : round(ratio, 6),
      positiveOpponentSeats: opponents.length,
      allOpponentsBusted: opponents.length === 0,
    });
    return true;
  }
  function configUnchanged() {
    const current = window.ReplacementStackBalance?.normalConfig || {};
    return Boolean(productionConfig
      && current.version === productionConfig.version
      && finite(current.tableMedianRatio) === finite(productionConfig.tableMedianRatio)
      && finite(current.buyInRatioCap) === finite(productionConfig.buyInRatioCap)
      && finite(current.softFloorBigBlinds) === finite(productionConfig.softFloorBigBlinds)
      && finite(current.maxBigBlinds) === finite(productionConfig.maxBigBlinds));
  }
  function install(policyId) {
    if (installed) throw new Error("Tail-floor benchmark adapter already installed");
    const policy = POLICIES[policyId];
    if (!policy) throw new Error(`Unknown tail-floor policy: ${policyId}`);
    const balance = window.ReplacementStackBalance;
    if (!balance || typeof balance.calculateNormalReplacementPlan !== "function") throw new Error("ReplacementStackBalance 2.1.0 is required");
    if (window.TournamentMode?.isActive?.()) throw new Error("Tail-floor benchmark only evaluates normal mode");
    activePolicy = policy;
    productionConfig = Object.freeze({ ...(balance.normalConfig || {}) });
    originalCalculate = balance.calculate;
    originalPlan = balance.calculateNormalReplacementPlan;
    originalBuildNextAiSeats = typeof buildNextAiSeats === "function" ? buildNextAiSeats : null;
    if (typeof originalBuildNextAiSeats !== "function") throw new Error("buildNextAiSeats is unavailable");
    installed = true;
    balance.calculateNormalReplacementPlan = function(players, options) { telemetry.sharedCalculatorCalls += 1; return candidatePlan(players, options); };
    balance.calculate = function(players, options) { telemetry.sharedCalculatorCalls += 1; return candidatePlan(players, options).stack; };
    buildNextAiSeats = function(previousPlayers) {
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      if (window.TournamentMode?.isActive?.() || !Array.isArray(previousPlayers) || !previousPlayers.length) return seats;
      const plan = candidatePlan(previousPlayers);
      let replacedSeats = 0;
      const adjusted = (Array.isArray(seats) ? seats : []).map(seat => {
        if (!seat?.replaced) return seat;
        replacedSeats += 1;
        return { ...seat, stack: plan.stack, replacementStackPolicy: plan.strategy, economyOodaCandidate: activePolicy.id };
      });
      recordReplacement(plan, replacedSeats);
      return adjusted;
    };
    resetTelemetry();
    return snapshot();
  }
  function snapshot() {
    const seats = telemetry.aiReplacedSeats;
    return {
      version: VERSION,
      schemaVersion: 3,
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
        productionMaxBigBlinds: finite(productionConfig?.maxBigBlinds, 60),
        maxBigBlinds: finite(productionConfig?.maxBigBlinds, 60),
        tailLeadThreshold: activePolicy.tailLeadThreshold,
        tailFloorBigBlinds: activePolicy.tailFloorBb,
        tailCooldownHands: activePolicy.tailCooldownHands,
      } : null,
      productionConfig: productionConfig ? { ...productionConfig } : null,
      sharedCalculatorCalls: telemetry.sharedCalculatorCalls,
      aiReplacementEvents: telemetry.aiReplacementEvents,
      aiReplacedSeats: seats,
      averageEntryBb: seats ? round(telemetry.entryBbTotal / seats, 4) : 0,
      minimumEntryBb: telemetry.entryBbMinimum === null ? null : round(telemetry.entryBbMinimum, 4),
      maximumEntryBb: telemetry.entryBbMaximum === null ? null : round(telemetry.entryBbMaximum, 4),
      averageTableMedianBb: seats ? round(telemetry.tableMedianBbTotal / seats, 4) : 0,
      tailEligibleEvents: telemetry.tailEligibleEvents,
      tailEligibleSeats: telemetry.tailEligibleSeats,
      tailCooldownSuppressedEvents: telemetry.tailCooldownSuppressedEvents,
      tailCooldownSuppressedSeats: telemetry.tailCooldownSuppressedSeats,
      tailAppliedEvents: telemetry.tailAppliedEvents,
      tailAppliedSeats: telemetry.tailAppliedSeats,
      tailExtraInjectedBb: round(telemetry.tailExtraInjectedBb, 4),
      averageTailLeadRatio: telemetry.tailLeadRatioSamples ? round(telemetry.tailLeadRatioTotal / telemetry.tailLeadRatioSamples, 6) : 0,
      handStackSampleCount: telemetry.handStackSamples.length,
      handStackSamples: telemetry.handStackSamples.map(sample => ({ ...sample })),
      samples: telemetry.samples.map(sample => ({ ...sample })),
    };
  }
  window.PokerEconomyTailFloorV1 = { version: VERSION, policies: POLICIES, install, snapshot, recordHandSnapshot, resetTelemetry };
})();
