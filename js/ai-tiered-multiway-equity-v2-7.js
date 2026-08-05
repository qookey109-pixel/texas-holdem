// AI V2.7: deterministic, tiered multiway equity for middle and elite characters.
(() => {
  "use strict";

  if (window.AiTieredMultiwayEquityV27?.version) return;

  const VERSION = "2.7.0";
  const MIDDLE_NAMES = Object.freeze(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE_NAMES = Object.freeze(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const SUPPORTED_NAMES = Object.freeze([...MIDDLE_NAMES, ...ELITE_NAMES]);
  const SAMPLE_TABLE = Object.freeze({
    middle: Object.freeze({
      flop: Object.freeze({ short: 72, medium: 60, large: 48 }),
      turn: Object.freeze({ short: 96, medium: 80, large: 64 }),
      river: Object.freeze({ short: 120, medium: 96, large: 80 }),
    }),
    elite: Object.freeze({
      flop: Object.freeze({ short: 144, medium: 112, large: 80 }),
      turn: Object.freeze({ short: 192, medium: 152, large: 112 }),
      river: Object.freeze({ short: 240, medium: 192, large: 144 }),
    }),
  });
  const TIER_CONFIG = Object.freeze({
    middle: Object.freeze({ baseBlend: 0.32, confidenceBlend: 0.08, equityCap: 0.065, rescueMargin: 0.055 }),
    elite: Object.freeze({ baseBlend: 0.54, confidenceBlend: 0.14, equityCap: 0.115, rescueMargin: 0.025 }),
  });

  let installTimer = 0;
  let installAttempts = 0;
  let previousBotAction = null;
  let wrappedBotAction = null;
  let originalReprice = null;
  const lastEstimateByPlayer = new WeakMap();

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function tierFor(name) {
    if (MIDDLE_NAMES.includes(name)) return "middle";
    if (ELITE_NAMES.includes(name)) return "elite";
    return "";
  }

  function streetFor(board = state?.board || []) {
    const count = Array.isArray(board) ? board.length : 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function fieldBand(opponentCount) {
    const count = Math.max(1, Math.floor(Number(opponentCount) || 1));
    if (count <= 2) return "short";
    if (count <= 4) return "medium";
    return "large";
  }

  function samplesFor(tier, street, opponentCount) {
    const table = SAMPLE_TABLE[tier];
    if (!table || !table[street]) return 0;
    return table[street][fieldBand(opponentCount)] || 0;
  }

  function normalizedCard(card) {
    return `${Number(card?.value ?? card?.rank ?? 0) || 0}:${String(card?.suit || "").toLowerCase()}`;
  }

  function publicOpponentSnapshot(player) {
    return (state?.players || [])
      .filter(candidate => candidate && candidate !== player && !candidate.folded)
      .map(candidate => ({
        name: String(candidate.name || ""),
        position: Number(candidate.position) || 0,
        isHuman: Boolean(candidate.isHuman),
        allIn: Boolean(candidate.allIn),
        bet: Math.max(0, Number(candidate.bet) || 0),
        totalContribution: Math.max(0, Number(candidate.totalContribution) || 0),
        stack: Math.max(0, Number(candidate.stack) || 0),
        lastAction: String(candidate.lastAction || ""),
      }))
      .sort((left, right) => (
        left.position - right.position || left.name.localeCompare(right.name)
      ));
  }

  function publicSeedKey(player, board, opponentCount) {
    return JSON.stringify({
      version: VERSION,
      actor: String(player?.name || ""),
      ownCards: (player?.cards || []).map(normalizedCard).sort(),
      board: (board || []).map(normalizedCard),
      street: streetFor(board),
      opponentCount: Math.max(1, Number(opponentCount) || 1),
      pot: Math.max(0, Number(state?.pot) || 0),
      currentBet: Math.max(0, Number(state?.currentBet) || 0),
      handNumber: Math.max(0, Number(state?.handNumber) || 0),
      opponents: publicOpponentSnapshot(player),
    });
  }

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let stateValue = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
      stateValue += 0x6d2b79f5;
      let value = stateValue;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function activeOpponentCount(player) {
    return Math.max(1, (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded
    )).length);
  }

  function baseEquityFor(player, options = {}) {
    const supplied = options.baseEquity
      ?? options.decision?.equityProxy
      ?? options.decision?.context?.equityProxy;
    if (Number.isFinite(Number(supplied))) return clamp(supplied, 0.001, 0.999);
    try {
      return clamp(window.AiCharacterStrategies?.publicContext?.(player)?.equityProxy, 0.001, 0.999);
    } catch (_) {
      return 0.5;
    }
  }

  function confidenceFor(result, targetSamples) {
    const samples = Math.max(0, Number(result?.samples) || 0);
    if (!samples || !targetSamples) return 0;
    const equity = clamp(result?.equity, 0.001, 0.999);
    const standardError = Math.sqrt((equity * (1 - equity)) / samples);
    const completion = clamp(samples / targetSamples, 0, 1);
    return clamp(completion * (1 - standardError / 0.16), 0.3, 0.97);
  }

  function skipped(reason, details = {}) {
    return {
      applied: false,
      reason,
      version: VERSION,
      publicInformationOnly: true,
      ...details,
    };
  }

  function estimate(player, options = {}) {
    const tier = tierFor(player?.name);
    if (!tier) return skipped("unsupported-tier", { tier: "" });

    const board = Array.isArray(options.board)
      ? options.board
      : (Array.isArray(state?.board) ? state.board : []);
    const street = streetFor(board);
    if (street === "preflop") return skipped("postflop-only", { tier, street });

    const opponentCount = Math.max(1, Math.floor(
      Number(options.opponentCount ?? activeOpponentCount(player)) || 1,
    ));
    if (opponentCount < 2) return skipped("multiway-only", { tier, street, opponentCount });

    const engine = window.BossEquityEngineV1;
    if (!engine?.estimate) return skipped("equity-engine-unavailable", { tier, street, opponentCount });

    const targetSamples = samplesFor(tier, street, opponentCount);
    if (!targetSamples) return skipped("sample-profile-unavailable", { tier, street, opponentCount });

    const baseEquity = baseEquityFor(player, options);
    const seed = Number.isFinite(Number(options.seed))
      ? (Number(options.seed) >>> 0)
      : hashString(publicSeedKey(player, board, opponentCount));
    const random = typeof options.random === "function" ? options.random : seededRandom(seed);
    const raisePressure = clamp(options.raisePressure ?? 0.65, 0.15, 2.5);
    const result = engine.estimate(player, {
      board,
      opponentCount,
      samples: targetSamples,
      random,
      rangeModel: options.rangeModel !== false,
      opponentProfiles: options.opponentProfiles || null,
      raisePressure,
    });

    const completedSamples = Math.max(0, Number(result?.samples) || 0);
    if (!completedSamples) return skipped("equity-simulation-empty", {
      tier,
      street,
      opponentCount,
      targetSamples,
      seed,
    });

    const config = TIER_CONFIG[tier];
    const confidence = confidenceFor(result, targetSamples);
    const blendWeight = clamp(config.baseBlend + config.confidenceBlend * confidence, 0, 0.78);
    const rawEquity = clamp(result.equity, 0.001, 0.999);
    const rawRaiseCalledEquity = clamp(result.raiseCalledEquity ?? rawEquity, 0.001, 0.999);
    const equityAdjustment = clamp(
      (rawEquity - baseEquity) * blendWeight,
      -config.equityCap,
      config.equityCap,
    );
    const raiseAdjustment = clamp(
      (rawRaiseCalledEquity - baseEquity) * blendWeight,
      -config.equityCap,
      config.equityCap,
    );

    return {
      applied: true,
      version: VERSION,
      tier,
      street,
      fieldBand: fieldBand(opponentCount),
      opponentCount,
      targetSamples,
      samples: completedSamples,
      method: result.method || "joint-multiway-monte-carlo",
      seed,
      baseEquity: round(baseEquity),
      rawEquity: round(rawEquity),
      equity: round(clamp(baseEquity + equityAdjustment, 0.001, 0.999)),
      equityAdjustment: round(equityAdjustment),
      rawRaiseCalledEquity: round(rawRaiseCalledEquity),
      raiseCalledEquity: round(clamp(baseEquity + raiseAdjustment, 0.001, 0.999)),
      raiseEquityAdjustment: round(raiseAdjustment),
      rangeFoldEquity: round(clamp(result.rangeFoldEquity, 0, 1)),
      rangeConditioned: Boolean(result.rangeConditioned),
      rangeModelVersion: result.rangeModelVersion || "uniform",
      confidence: round(confidence),
      blendWeight: round(blendWeight),
      adjustmentCap: config.equityCap,
      publicInformationOnly: true,
    };
  }

  function enhanceDecision(player, decision, options = {}) {
    if (!decision || decision.action === "fallback") return decision;
    if (!decision.rangeDecisionIntegrated) return decision;

    const result = estimate(player, { ...options, decision });
    if (!result.applied) {
      decision.tieredMultiwayEquitySkipped = result.reason;
      return decision;
    }

    const originalEquity = clamp(decision.equityProxy ?? decision.context?.equityProxy, 0.001, 0.999);
    const adjustedEquity = clamp(result.equity, 0.001, 0.999);
    const delta = adjustedEquity - originalEquity;
    const context = decision.context || {};
    const needed = Math.max(0, Number(context.needed) || 0);
    const pot = Math.max(0, Number(context.pot) || 0);
    const potOdds = needed / Math.max(1, pot + needed);
    const callEv = window.AiEvAccountingV1?.callEv
      ? window.AiEvAccountingV1.callEv({ equity: adjustedEquity, pot, callAmount: needed })
      : adjustedEquity * (pot + needed) - needed;
    const tier = result.tier;
    const config = TIER_CONFIG[tier];
    const drawPotential = clamp(context.drawPotential, 0, 1);

    decision.context = {
      ...context,
      legacyEquityProxy: originalEquity,
      equityProxy: adjustedEquity,
      tieredMultiwayEquity: adjustedEquity,
      tieredMultiwayOpponentCount: result.opponentCount,
    };
    decision.legacyEquityProxy = originalEquity;
    decision.equityProxy = adjustedEquity;
    decision.raiseCalledEquity = clamp(result.raiseCalledEquity, 0.001, 0.999);
    decision.callScore = Number(decision.callScore || 0) + delta;

    if (
      decision.action === "call"
      && needed > 0
      && callEv < -Math.max(1, pot * 0.018)
      && drawPotential < 0.12
    ) {
      decision.action = "fold";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.bluffing = false;
      decision.reason = `${player.name} 依 V2.7 多人 Equity 停止負期望跟注`;
      decision.tieredEquityAdjustment = "multiway-tighten-negative-call";
    } else if (
      decision.action === "fold"
      && needed > 0
      && callEv > Math.max(1, pot * 0.015)
      && adjustedEquity >= potOdds + config.rescueMargin
    ) {
      decision.action = "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依 V2.7 多人 Equity 保留正期望防守`;
      decision.tieredEquityAdjustment = "multiway-rescue-positive-call";
    }

    decision.tieredMultiwayEquityIntegrated = true;
    decision.tieredMultiwayEquityVersion = VERSION;
    decision.tieredMultiwayEquityTier = tier;
    decision.tieredMultiwayEquityResult = { ...result };
    decision.tieredMultiwayCallEv = round(callEv);
    decision.publicInformationOnly = true;
    lastEstimateByPlayer.set(player, result);
    return decision;
  }

  function repriceRaiseCandidates(decision) {
    if (!decision?.tieredMultiwayEquityIntegrated || !window.AiEvAccountingV1?.raiseEv) return decision;
    const context = decision.context || {};
    const equity = clamp(decision.raiseCalledEquity ?? decision.equityProxy, 0.001, 0.999);
    const pot = Math.max(0, Number(context.pot) || 0);
    const needed = Math.max(0, Number(context.needed) || 0);
    const candidates = (decision.candidates || []).map(candidate => ({
      ...candidate,
      callEquityEv: candidate.ev,
      ev: window.AiEvAccountingV1.raiseEv({
        equity,
        pot,
        callAmount: needed,
        raiseBy: candidate.raiseBy,
        foldEquity: candidate.foldEquity,
        calledBy: candidate.calledBy ?? 1,
      }),
      tieredRaiseCalledEquity: true,
    })).sort((left, right) => Number(right.ev) - Number(left.ev));

    decision.candidates = candidates;
    decision.bestRaiseEv = candidates[0]?.ev ?? Number.NEGATIVE_INFINITY;
    if (decision.action !== "raise") return decision;

    const selected = candidates
      .filter(candidate => Number(candidate.raiseBy) > 0)
      .sort((left, right) => (
        Math.abs(Number(left.raiseBy) - Number(decision.raiseBy))
        - Math.abs(Number(right.raiseBy) - Number(decision.raiseBy))
      ))[0] || candidates[0] || null;
    const callEv = Number.isFinite(Number(decision.callEv)) ? Number(decision.callEv) : 0;
    if (selected && Number(selected.ev) <= Math.max(0, callEv)) {
      decision.action = needed > 0 && callEv < 0 ? "fold" : "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.bluffing = false;
      decision.reason = "V2.7 多人被跟注 Equity 安全閘取消負期望加注";
      decision.tieredEquityAdjustment = "multiway-raise-ev-guard";
    }
    return decision;
  }

  function patchEvAccounting() {
    const accounting = window.AiEvAccountingV1;
    if (!accounting?.repriceStrategyDecision) return false;
    if (accounting.__tieredMultiwayEquityV27Patched) return true;

    originalReprice = accounting.repriceStrategyDecision.bind(accounting);
    accounting.repriceStrategyDecision = function repriceWithTieredMultiwayEquity(decision) {
      const actorName = String(decision?.context?.name || "");
      const player = (state?.players || []).find(candidate => candidate?.name === actorName) || null;
      const enhanced = player ? enhanceDecision(player, decision) : decision;
      return repriceRaiseCandidates(originalReprice(enhanced));
    };
    accounting.__tieredMultiwayEquityV27Patched = true;
    accounting.tieredMultiwayEquityVersion = VERSION;
    return true;
  }

  function attachDecisionDiagnostics(player) {
    const result = lastEstimateByPlayer.get(player);
    if (!result?.applied || !player?.lastStrategyDecision) return;
    Object.assign(player.lastStrategyDecision, {
      strategyVersion: VERSION,
      decisionChainVersion: VERSION,
      tieredMultiwayEquityVersion: VERSION,
      tieredMultiwayEquityTier: result.tier,
      tieredMultiwayEquity: result.equity,
      tieredMultiwayRawEquity: result.rawEquity,
      tieredMultiwayRaiseCalledEquity: result.raiseCalledEquity,
      tieredMultiwaySamples: result.samples,
      tieredMultiwayOpponentCount: result.opponentCount,
      tieredMultiwayMethod: result.method,
      tieredMultiwayRangeConditioned: result.rangeConditioned,
      tieredMultiwayPublicInformationOnly: true,
    });
  }

  function wrapDecisionExecution() {
    if (!window.AiMidEliteDecisionChainV26?.version || typeof botAction !== "function") return false;
    if (wrappedBotAction === botAction) return true;

    previousBotAction = botAction;
    wrappedBotAction = function botActionWithTieredMultiwayDiagnostics(player) {
      lastEstimateByPlayer.delete(player);
      const output = previousBotAction.apply(this, arguments);
      attachDecisionDiagnostics(player);
      return output;
    };
    wrappedBotAction.__aiTieredMultiwayEquityV27Wrapper = true;
    botAction = wrappedBotAction;
    return true;
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const name of SUPPORTED_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) Object.assign(profile, {
        tieredMultiwayEquity: true,
        tieredMultiwayEquityTier: tierFor(name),
        tieredMultiwayEquityVersion: VERSION,
        publicInformationOnly: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].tieredMultiwayEquityVersion = VERSION;
      }
    }
    return true;
  }

  function refresh() {
    const ready = Boolean(
      window.BossEquityEngineV1?.version
      && window.BossPublicRangeModelV1?.version
      && window.AiEvAccountingV1?.version
      && window.AiMidEliteDecisionChainV26?.version
      && patchEvAccounting()
      && wrapDecisionExecution()
      && registerProfiles()
    );
    document.documentElement.dataset.aiTieredMultiwayEquity = ready ? "ready" : "loading";
    if ((ready || installAttempts >= 320) && installTimer) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return ready;
  }

  const api = Object.freeze({
    version: VERSION,
    middleNames: [...MIDDLE_NAMES],
    eliteNames: [...ELITE_NAMES],
    supportedNames: [...SUPPORTED_NAMES],
    sampleTable: SAMPLE_TABLE,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActiveSeats: true,
      publicActions: true,
      publicBetSizes: true,
      publicStacks: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    supports: name => SUPPORTED_NAMES.includes(name),
    tierFor,
    fieldBand,
    samplesFor,
    publicSeedKey,
    hashString,
    seededRandom,
    estimate,
    enhanceDecision,
    repriceRaiseCandidates,
    refresh,
  });

  window.AiTieredMultiwayEquityV27 = api;
  window.AiMidEliteDecisionChainV27 = Object.freeze({
    version: VERSION,
    previousVersion: window.AiMidEliteDecisionChainV26?.version || "2.6.0",
    supports: name => SUPPORTED_NAMES.includes(name),
    composeDecision(player, options = {}) {
      return window.AiMidEliteDecisionChainV26?.composeDecision?.(player, options) || null;
    },
    refresh,
  });

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();