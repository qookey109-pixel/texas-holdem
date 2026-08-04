// Public-stack effective SPR and unified repeated All-in adaptation.
(() => {
  "use strict";

  if (window.AiEffectiveStackSprV1?.version) return;

  const VERSION = "1.0.0";
  const TIER_CONFIG = Object.freeze({
    beginner: Object.freeze({ minHands: 5, minJams: 4, cap: 0.07, marginChance: 0.58 }),
    middle: Object.freeze({ minHands: 4, minJams: 3, cap: 0.11, marginChance: 0.72 }),
    elite: Object.freeze({ minHands: 3, minJams: 2, cap: 0.15, marginChance: 0.86 }),
  });
  const CHARACTER_RESPONSE = Object.freeze({
    Leo: 0.72, Toto: 0.78, Foxy: 0.9, Wolf: 0.94, Pao: 0.82, Shark: 1,
    Ace: 1.04, Momo: 1, Nori: 0.78, Bruno: 0.72, Dodo: 0.8, Viper: 1.02,
    Nova: 1.12, "Unit-9": 1.2, Merlin: 1.08, Vlad: 1.22,
  });

  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function publicLiveOpponents(player) {
    return (state?.players || []).filter(candidate => (
      candidate
      && candidate !== player
      && !candidate.folded
    ));
  }

  function publicCommitted(player) {
    return Math.max(0, Number(player?.bet) || 0);
  }

  function publicStackBehind(player) {
    return Math.max(0, Number(player?.stack) || 0);
  }

  function opponentContestableTotal(opponent) {
    return publicStackBehind(opponent) + publicCommitted(opponent);
  }

  function effectiveStackContext(player, options = {}) {
    const pot = Math.max(1, Number(options.pot ?? state?.pot) || 1);
    const needed = Math.max(0, Number(options.needed ?? (typeof amountToCall === "function" ? amountToCall(player) : 0)) || 0);
    const opponents = options.opponents || publicLiveOpponents(player);
    const actorCommitted = publicCommitted(player);
    const actorTotal = publicStackBehind(player) + actorCommitted;
    const relevant = opponents
      .map(opponent => ({
        name: String(opponent?.name || ""),
        total: opponentContestableTotal(opponent),
        stack: publicStackBehind(opponent),
        bet: publicCommitted(opponent),
      }))
      .filter(opponent => opponent.total > 0)
      .sort((left, right) => right.total - left.total);
    const primary = relevant[0] || { name: "", total: actorTotal, stack: actorTotal, bet: 0 };
    const effectiveTotal = Math.max(0, Math.min(actorTotal, primary.total));
    const effectiveBehind = Math.max(0, effectiveTotal - actorCommitted);
    const decisionPot = Math.max(1, pot + needed);
    const effectiveSpr = effectiveBehind / decisionPot;
    const bigBlind = Math.max(1, Number(options.bigBlind ?? (typeof currentBigBlind === "function" ? currentBigBlind() : 1)) || 1);

    return {
      actorStack: publicStackBehind(player),
      actorCommitted,
      primaryOpponent: primary.name,
      opponentStack: primary.stack,
      opponentCommitted: primary.bet,
      effectiveTotal,
      effectiveBehind,
      effectiveStackInBigBlinds: effectiveBehind / bigBlind,
      effectiveSpr,
      sprBand: effectiveSpr <= 2 ? "shallow" : effectiveSpr >= 8 ? "deep" : "medium",
      opponentCount: relevant.length,
      publicInformationOnly: true,
    };
  }

  function environmentBaseline(player, context) {
    const tier = window.AiRepeatedAllInCounterV1?.tierFor?.(player) || "beginner";
    const effectiveRiskBb = Math.max(0, Number(context.effectiveRiskInBigBlinds ?? context.riskInBigBlinds) || 0);
    let threshold = effectiveRiskBb <= 8 ? 0.58
      : effectiveRiskBb <= 12 ? 0.62
        : effectiveRiskBb <= 20 ? 0.68
          : effectiveRiskBb <= 30 ? 0.74
            : 0.8;
    if (tier === "beginner") threshold += 0.025;
    if (tier === "elite") threshold -= 0.02;
    if (context.blindVsBlind) threshold -= 0.035;
    if (Number(context.otherContenders) > 0) threshold += Math.min(0.09, Number(context.otherContenders) * 0.035);
    threshold -= clamp((0.5 - Number(context.potOdds || 0)) * 0.18, -0.015, 0.035);
    return clamp(threshold, 0.48, 0.88);
  }

  function exploitAdjustment(player, profile) {
    const tier = window.AiRepeatedAllInCounterV1?.tierFor?.(player) || "beginner";
    const config = TIER_CONFIG[tier];
    if (!config || Number(profile?.observedHands) < config.minHands || Number(profile?.jamHands) < config.minJams) return 0;
    const rateSignal = clamp((Number(profile.weightedJamRate) - 0.22) / 0.58, 0, 1);
    const streakSignal = clamp((Number(profile.consecutiveJams) - 1) / 3, 0, 1);
    const sampleSignal = clamp((Number(profile.observedHands) - config.minHands + 1) / 5, 0.35, 1);
    const characterFactor = CHARACTER_RESPONSE[player?.name] || 0.85;
    const intensity = Math.max(rateSignal, streakSignal * 0.9) * sampleSignal;
    return clamp(config.cap * intensity * characterFactor, 0, config.cap);
  }

  function unifiedDefenseContext(player, baseContext = null) {
    const context = baseContext || window.AiRepeatedAllInCounterV1?.defenseContext?.(player);
    if (!context) return null;
    const hero = typeof human === "function" ? human() : (state?.players || []).find(candidate => candidate?.isHuman);
    const spr = effectiveStackContext(player, {
      pot: context.pot,
      needed: context.needed,
      bigBlind: context.bigBlind,
      opponents: hero ? [hero] : undefined,
    });
    const effectiveRisk = Math.min(Math.max(0, Number(context.needed) || 0), spr.effectiveBehind || Number(context.needed) || 0);
    return {
      ...context,
      ...spr,
      effectiveRisk,
      effectiveRiskInBigBlinds: effectiveRisk / Math.max(1, Number(context.bigBlind) || 1),
    };
  }

  function planDefense(player, options = {}) {
    const context = unifiedDefenseContext(player, options.context || null);
    if (!context) return { action: "fallback", reason: "未面對玩家翻牌前 All-in" };
    const profile = options.profile || window.AiRepeatedAllInCounterV1?.recentProfile?.() || {};
    const hand = options.hand || window.AiPreflopRangeEngine?.classifyHand?.(player) || {
      code: "--",
      score: typeof estimateStrength === "function" ? estimateStrength(player) : 0,
    };
    const tier = window.AiRepeatedAllInCounterV1?.tierFor?.(player) || "beginner";
    const config = TIER_CONFIG[tier];
    const baseline = environmentBaseline(player, context);
    const adjustment = exploitAdjustment(player, profile);
    const adjustedThreshold = clamp(baseline - adjustment, 0.42, baseline);
    const score = Number(hand.score) || 0;
    const result = {
      action: "fallback",
      reason: "維持有效籌碼基準防守範圍",
      tier,
      hand,
      context,
      profile,
      baselineThreshold: baseline,
      adjustedThreshold,
      adjustment,
      strategyVersion: VERSION,
      effectiveStackSpr: true,
      singleAdjustmentChain: true,
    };
    if (adjustment <= 0 || score < adjustedThreshold || score >= baseline) return result;

    const span = Math.max(0.001, baseline - adjustedThreshold);
    const location = clamp((score - adjustedThreshold) / span, 0, 1);
    const chance = clamp(
      config.marginChance + location * 0.18 + Number(profile.consecutiveJams || 0) * 0.025,
      config.marginChance,
      0.97,
    );
    const random = typeof options.random === "function" ? options.random : Math.random;
    if (random() < chance) {
      result.action = "call";
      result.reason = `${player.name} 依有效籌碼與近期公開 All-in 頻率放寬跟注`;
      result.callChance = chance;
      result.exploitApplied = "effective-stack-repeated-allin";
    }
    return result;
  }

  function executeCall(player, decision) {
    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    player.status = "Thinking...";
    const paid = typeof pay === "function" ? pay(player, needed) : 0;
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : `跟注 ${paid}`;
    player.lastAction = player.allIn && paid > 0 ? "allin" : "call";
    player.lastStrategyDecision = {
      strategyVersion: VERSION,
      action: "call",
      reason: decision.reason,
      handCode: decision.hand?.code || "--",
      handScore: Number(decision.hand?.score) || 0,
      baselineThreshold: decision.baselineThreshold,
      adjustedThreshold: decision.adjustedThreshold,
      adjustment: decision.adjustment,
      effectiveStack: decision.context?.effectiveBehind || 0,
      effectiveSpr: decision.context?.effectiveSpr || 0,
      singleAdjustmentChain: true,
      exploitApplied: decision.exploitApplied || "",
    };
    if (paid > 0 && !state.isMuted) Audio.chip();
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : "Call", paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : "CALL", player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : "call", { chance: 0.3 });
  }

  function installStrategyContextPatch() {
    const base = window.AiCharacterStrategies;
    if (!base?.chooseDecision || base.__effectiveStackSprPatched) return Boolean(base?.__effectiveStackSprPatched);
    const previousChooseDecision = base.chooseDecision.bind(base);
    base.chooseDecision = function chooseDecisionWithEffectiveStack(player, options = {}) {
      const decision = previousChooseDecision(player, options);
      if (!decision || decision.action === "fallback") return decision;
      const spr = effectiveStackContext(player, {
        pot: decision.context?.pot,
        needed: decision.context?.needed,
        bigBlind: decision.context?.bigBlind,
      });
      decision.context = { ...(decision.context || {}), ...spr, spr: spr.effectiveSpr };
      decision.effectiveStackSprVersion = VERSION;
      if (
        spr.sprBand === "deep"
        && decision.action === "raise"
        && !decision.valueReady
        && Number(decision.context?.equityProxy) < 0.58
      ) {
        decision.action = Number(decision.context?.needed) > 0 ? "call" : "call";
        decision.raiseBy = 0;
        decision.sizeFraction = 0;
        decision.reason = "深 SPR 保留邊緣牌與聽牌實現率";
        decision.sprAdjustment = "deep-pot-control";
      }
      if (spr.sprBand === "shallow" && decision.bluffing && !decision.valueReady && Number(decision.context?.drawPotential) < 0.09) {
        decision.action = Number(decision.context?.needed) > 0 ? "fold" : "call";
        decision.raiseBy = 0;
        decision.sizeFraction = 0;
        decision.reason = "淺 SPR 取消低實現率純詐唬";
        decision.sprAdjustment = "shallow-suppress-air";
      }
      return decision;
    };
    base.__effectiveStackSprPatched = true;
    base.effectiveStackSprVersion = VERSION;
    return true;
  }

  function installAllInWrapper() {
    if (window.__aiEffectiveStackSprBotInstalled || typeof botAction !== "function") return Boolean(window.__aiEffectiveStackSprBotInstalled);
    const previousBotAction = botAction;
    botAction = function botActionWithEffectiveStackSpr(player) {
      const counter = window.AiRepeatedAllInCounterV1;
      if (!counter?.supports?.(player)) return previousBotAction.apply(this, arguments);
      const context = unifiedDefenseContext(player);
      if (!context) return previousBotAction.apply(this, arguments);
      try {
        const decision = planDefense(player, { context });
        if (decision.action === "call") return executeCall(player, decision);

        // Disable only the old exploit sample for this invocation. The original
        // baseline strategy still runs, so environment factors are not counted twice.
        const savedStore = state.aiRepeatedAllInCounter;
        state.aiRepeatedAllInCounter = {
          version: counter.version,
          sessionStartHand: Math.max(1, Number(state.handNumber) || 1),
          lastHandNumber: Math.max(1, Number(state.handNumber) || 1),
          entries: [],
        };
        try {
          return previousBotAction.apply(this, arguments);
        } finally {
          state.aiRepeatedAllInCounter = savedStore;
        }
      } catch (error) {
        console.warn("Effective stack SPR fallback", player?.name, error);
        return previousBotAction.apply(this, arguments);
      }
    };
    window.__aiEffectiveStackSprBotInstalled = true;
    return true;
  }

  function refresh() {
    const strategyReady = installStrategyContextPatch();
    const counterReady = installAllInWrapper();
    if ((strategyReady && counterReady) || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    if (strategyReady && counterReady) document.documentElement.dataset.aiEffectiveStackSpr = "ready";
    return strategyReady && counterReady;
  }

  window.AiEffectiveStackSprV1 = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      publicStacks: true,
      publicBets: true,
      publicPositions: true,
      publicHeroActions: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    effectiveStackContext,
    environmentBaseline,
    exploitAdjustment,
    unifiedDefenseContext,
    planDefense,
    refresh,
  };

  if (!refresh()) {
    installTimer = window.setInterval(refresh, 25);
  }
})();
