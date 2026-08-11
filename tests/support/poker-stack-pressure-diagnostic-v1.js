(() => {
  "use strict";

  if (window.PokerStackPressureDiagnosticV1?.version) return;

  const VERSION = "1.0.0";
  const BUCKETS = Object.freeze(["under3", "lead3to5", "lead5plus"]);
  const STREETS = Object.freeze(["preflop", "flop", "turn", "river"]);
  const ACTIONS = Object.freeze(["fold", "check", "call", "raise", "allin"]);

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

  function emptyActions() {
    return Object.fromEntries(ACTIONS.map(action => [action, 0]));
  }

  function emptyStreetActions() {
    return Object.fromEntries(STREETS.map(street => [street, emptyActions()]));
  }

  function emptyBucket() {
    return {
      actions: 0,
      facingBetActions: 0,
      freeActions: 0,
      foldsFacingBet: 0,
      callsFacingBet: 0,
      raisesFacingBet: 0,
      checksFree: 0,
      raisesFree: 0,
      aggressiveActions: 0,
      strongActions: 0,
      strongPassiveActions: 0,
      strengthTotal: 0,
      ratioTotal: 0,
      actionCounts: emptyActions(),
      streetActionCounts: emptyStreetActions(),
    };
  }

  const telemetry = {
    buckets: Object.fromEntries(BUCKETS.map(bucket => [bucket, emptyBucket()])),
    samples: [],
    heroLeadSamples: 0,
    maximumHeroLeadRatio: 0,
  };

  function reset() {
    telemetry.buckets = Object.fromEntries(BUCKETS.map(bucket => [bucket, emptyBucket()]));
    telemetry.samples.length = 0;
    telemetry.heroLeadSamples = 0;
    telemetry.maximumHeroLeadRatio = 0;
  }

  function normalizeAction(action) {
    const value = String(action || "").toLowerCase();
    if (value.includes("fold")) return "fold";
    if (value.includes("check")) return "check";
    if (value.includes("all-in") || value.includes("allin")) return value.includes("raise") ? "allin" : "allin";
    if (value.includes("raise")) return "raise";
    if (value.includes("call")) return "call";
    return "";
  }

  function streetKey() {
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function leadSnapshot() {
    const players = Array.isArray(state?.players) ? state.players : [];
    const hero = players.find(player => player?.isHuman) || players[0] || null;
    const heroStack = Math.max(0, finite(hero?.stack) + finite(hero?.bet));
    const opponents = players
      .filter(player => player && player !== hero && !player.isHuman && finite(player.stack) > 0)
      .map(player => Math.max(0, finite(player.stack) + finite(player.bet)));
    const opponentMedian = median(opponents);
    const ratio = opponentMedian > 0 ? heroStack / opponentMedian : 0;
    return { heroStack, opponentMedian, ratio };
  }

  function bucketFor(ratio) {
    if (ratio >= 5) return "lead5plus";
    if (ratio >= 3) return "lead3to5";
    return "under3";
  }

  function recordAction(player, action) {
    if (!player || player.isHuman) return false;
    const normalized = normalizeAction(action);
    if (!normalized) return false;

    const lead = leadSnapshot();
    const bucketName = bucketFor(lead.ratio);
    const bucket = telemetry.buckets[bucketName];
    const street = streetKey();
    const needed = Math.max(0, finite(typeof amountToCall === "function" ? amountToCall(player) : 0));
    const facingBet = needed > 0;
    const strength = Math.max(0, Math.min(1, finite(typeof estimateStrength === "function" ? estimateStrength(player) : 0.5, 0.5)));
    const aggressive = normalized === "raise" || normalized === "allin";
    const passive = normalized === "fold" || normalized === "check" || normalized === "call";
    const strong = strength >= 0.58;

    bucket.actions += 1;
    bucket.actionCounts[normalized] += 1;
    bucket.streetActionCounts[street][normalized] += 1;
    bucket.strengthTotal += strength;
    bucket.ratioTotal += lead.ratio;
    if (aggressive) bucket.aggressiveActions += 1;
    if (strong) {
      bucket.strongActions += 1;
      if (passive) bucket.strongPassiveActions += 1;
    }

    if (facingBet) {
      bucket.facingBetActions += 1;
      if (normalized === "fold") bucket.foldsFacingBet += 1;
      if (normalized === "call" || normalized === "allin") bucket.callsFacingBet += 1;
      if (normalized === "raise") bucket.raisesFacingBet += 1;
    } else {
      bucket.freeActions += 1;
      if (normalized === "check") bucket.checksFree += 1;
      if (aggressive) bucket.raisesFree += 1;
    }

    telemetry.heroLeadSamples += 1;
    telemetry.maximumHeroLeadRatio = Math.max(telemetry.maximumHeroLeadRatio, lead.ratio);
    if (telemetry.samples.length < 500) {
      telemetry.samples.push({
        handNumber: Math.max(0, Math.trunc(finite(state?.handNumber))),
        player: String(player.name || ""),
        street,
        action: normalized,
        facingBet,
        strength: round(strength, 4),
        heroLeadRatio: round(lead.ratio, 6),
        bucket: bucketName,
      });
    }
    return true;
  }

  function rate(numerator, denominator) {
    return denominator > 0 ? round(numerator / denominator, 6) : 0;
  }

  function summarizeBucket(bucket) {
    return {
      ...bucket,
      aggressionRate: rate(bucket.aggressiveActions, bucket.actions),
      foldFacingBetRate: rate(bucket.foldsFacingBet, bucket.facingBetActions),
      callFacingBetRate: rate(bucket.callsFacingBet, bucket.facingBetActions),
      raiseFacingBetRate: rate(bucket.raisesFacingBet, bucket.facingBetActions),
      checkFreeRate: rate(bucket.checksFree, bucket.freeActions),
      raiseFreeRate: rate(bucket.raisesFree, bucket.freeActions),
      strongPassiveRate: rate(bucket.strongPassiveActions, bucket.strongActions),
      averageStrength: rate(bucket.strengthTotal, bucket.actions),
      averageHeroLeadRatio: rate(bucket.ratioTotal, bucket.actions),
    };
  }

  function snapshot() {
    return {
      version: VERSION,
      schemaVersion: 1,
      behaviorChanged: false,
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      heroLeadSamples: telemetry.heroLeadSamples,
      maximumHeroLeadRatio: round(telemetry.maximumHeroLeadRatio, 6),
      buckets: Object.fromEntries(BUCKETS.map(name => [name, summarizeBucket(telemetry.buckets[name])])),
      samples: telemetry.samples.map(sample => ({ ...sample })),
    };
  }

  window.PokerStackPressureDiagnosticV1 = {
    version: VERSION,
    reset,
    recordAction,
    snapshot,
  };
})();
