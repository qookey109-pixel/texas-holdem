// V1.1 difficulty layer: public action memory, multi-street transitions, check-raises, river classes, and blockers.
(() => {
  "use strict";

  if (window.AiCharacterStrategiesV11?.version) return;

  const VERSION = "1.1.0";
  const STREET_INDEX = Object.freeze({ preflop: 0, flop: 1, turn: 2, river: 3 });
  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function currentStreet() {
    return window.AiActionMemory?.streetKey?.() || (
      (state?.board?.length || 0) >= 5 ? "river"
        : (state?.board?.length || 0) === 4 ? "turn"
          : (state?.board?.length || 0) >= 3 ? "flop"
            : "preflop"
    );
  }

  function transitionPlan(player, context, analysis) {
    const plan = player?.aiStrategyPlan;
    if (!plan || plan.handNumber !== state.handNumber) return null;

    const previousStreet = plan.lastStreet || plan.createdStreet || context.street;
    if (previousStreet === context.street) return plan;

    const previousLine = plan.line;
    const previousStrength = Number(plan.previousStrength) || 0;
    const previousDraw = Number(plan.previousDrawPotential) || 0;
    const improved = context.baseStrength >= previousStrength + 0.08;
    const drawCompleted = previousDraw >= 0.09 && context.drawPotential < 0.04 && improved;
    let nextLine = previousLine;

    if (analysis.riverClass === "thick-value") nextLine = "value";
    else if (analysis.riverClass === "thin-value") nextLine = "thin-value";
    else if (analysis.riverClass === "showdown" || analysis.riverClass === "bluff-catcher") nextLine = "control";
    else if (analysis.riverClass === "air" && analysis.blockers.bluffScore >= 0.45) nextLine = "pressure";
    else if (drawCompleted) nextLine = "value";
    else if (previousLine === "semi-bluff" && context.drawPotential >= 0.09) nextLine = "semi-bluff";
    else if (previousLine === "semi-bluff" && context.street === "river") nextLine = analysis.blockers.bluffScore >= 0.45 ? "pressure" : "control";
    else if (previousLine === "delay" && STREET_INDEX[context.street] >= 2) nextLine = "pressure";
    else if (["value", "trap"].includes(previousLine) && context.texture.wetness >= 0.58 && context.equityProxy < 0.7) nextLine = "control";
    else if (previousLine === "pressure" && context.hero.lastAction === "raise" && context.equityProxy < 0.5) nextLine = "control";

    plan.history = Array.isArray(plan.history) ? plan.history : [];
    plan.history.push({
      fromStreet: previousStreet,
      toStreet: context.street,
      fromLine: previousLine,
      toLine: nextLine,
      publicReason: drawCompleted ? "draw-completed" : analysis.riverClass,
    });
    plan.line = nextLine;
    plan.lastStreet = context.street;
    plan.previousStrength = context.baseStrength;
    plan.previousDrawPotential = context.drawPotential;
    return plan;
  }

  function syncPlanSnapshot(player, decision) {
    const plan = player?.aiStrategyPlan;
    if (!plan) return;
    plan.lastStreet = decision.context.street;
    plan.previousStrength = decision.context.baseStrength;
    plan.previousDrawPotential = decision.context.drawPotential;
    plan.lastDecision = decision.action;
    plan.lastReason = decision.reason;
    plan.lastSizeFraction = decision.sizeFraction || 0;
    decision.plan = { ...plan, history: [...(plan.history || [])] };
  }

  function candidateBySize(decision, predicate, fallback = "best") {
    const candidates = [...(decision.candidates || [])].filter(predicate);
    if (candidates.length) return candidates.sort((left, right) => right.ev - left.ev)[0];
    if (fallback === "largest") return [...(decision.candidates || [])].sort((left, right) => right.fraction - left.fraction)[0] || null;
    if (fallback === "smallest") return [...(decision.candidates || [])].sort((left, right) => left.fraction - right.fraction)[0] || null;
    return decision.candidates?.[0] || null;
  }

  function forceRaise(decision, candidate, reason) {
    if (!candidate || candidate.raiseBy <= 0) return decision;
    decision.action = "raise";
    decision.raiseBy = candidate.raiseBy;
    decision.sizeFraction = candidate.fraction;
    decision.reason = reason;
    return decision;
  }

  function enhanceDecision(player, decision, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const context = decision.context;
    const memory = window.AiActionMemory?.playerStreetSummary?.(player, context.street) || {
      actions: [], actionCount: 0, lastAction: "", checked: false, raised: false, checkRaiseReady: false, facedAggression: null,
    };
    const analysis = window.AiRangeTools?.publicAnalysis?.(player, context) || {
      draws: { potential: context.drawPotential || 0 },
      blockers: { bluffScore: 0 },
      riverClass: "not-river",
    };

    context.memory = memory;
    context.rangeAnalysis = analysis;
    context.checkRaiseOpportunity = Boolean(memory.checkRaiseReady && context.needed > 0);

    const strongEnoughForCheckRaise = context.equityProxy >= 0.64;
    const semiBluffCheckRaise = context.drawPotential >= 0.09 && context.equityProxy >= 0.48;
    const blockerCheckRaise = analysis.blockers.bluffScore >= 0.45 && context.hero.foldRate >= 0.36;

    if (
      player.name === "Viper"
      && context.checkRaiseOpportunity
      && context.canRaise
      && (strongEnoughForCheckRaise || semiBluffCheckRaise || blockerCheckRaise)
    ) {
      const candidate = candidateBySize(decision, item => item.fraction >= 0.68, "largest");
      forceRaise(decision, candidate, strongEnoughForCheckRaise ? "Viper 同街過牌反加價值線" : "Viper 同街過牌反加半詐唬線");
      decision.checkRaise = true;
    }

    if (context.street === "river" && context.canRaise) {
      if (analysis.riverClass === "thick-value") {
        const candidate = candidateBySize(decision, item => item.fraction >= 0.65, "largest");
        if (context.needed === 0 || decision.action === "raise") {
          forceRaise(decision, candidate, "河牌厚價值大尺寸");
        }
      } else if (analysis.riverClass === "thin-value") {
        const candidate = candidateBySize(decision, item => item.fraction <= 0.55, "smallest");
        if (context.needed === 0 && random() < 0.68) {
          forceRaise(decision, candidate, "河牌薄價值小尺寸");
        } else if (context.needed > 0 && decision.action === "raise" && decision.sizeFraction > 0.65) {
          decision.action = "call";
          decision.raiseBy = 0;
          decision.sizeFraction = 0;
          decision.reason = "河牌薄價值控制底池";
        }
      } else if (["showdown", "bluff-catcher"].includes(analysis.riverClass)) {
        if (decision.action === "raise" && !decision.checkRaise) {
          decision.action = context.needed > 0 && decision.callScore >= -0.04 ? "call" : (context.needed > 0 ? "fold" : "call");
          decision.raiseBy = 0;
          decision.sizeFraction = 0;
          decision.reason = analysis.riverClass === "bluff-catcher" ? "河牌 Bluff Catcher" : "保留攤牌價值";
        }
      } else if (analysis.riverClass === "air") {
        const blockerBluff = analysis.blockers.bluffScore >= 0.45
          && context.needed <= context.pot * 0.36
          && context.hero.foldRate >= 0.32
          && ["Ace", "Momo", "Nova", "Unit-9", "Merlin", "Vlad"].includes(player.name)
          && random() < clamp(0.28 + analysis.blockers.bluffScore * 0.45, 0.28, 0.66);
        if (blockerBluff) {
          const candidate = candidateBySize(decision, item => item.fraction >= 0.65, "largest");
          forceRaise(decision, candidate, "河牌阻擋牌詐唬");
          decision.blockerBluff = true;
        } else if (decision.action === "raise" && !decision.bluffing) {
          decision.action = context.needed > 0 ? "fold" : "call";
          decision.raiseBy = 0;
          decision.sizeFraction = 0;
          decision.reason = "河牌無攤牌價值且缺少合適阻擋牌";
        }
      }
    }

    if (player.name === "Merlin" && player.aiStrategyPlan?.line === "pressure" && context.street === "turn" && context.canRaise) {
      const candidate = candidateBySize(decision, item => item.fraction >= 0.6, "best");
      if ((decision.valueReady || decision.bluffing) && candidate) {
        forceRaise(decision, candidate, "Merlin 延遲施壓轉牌線");
      }
    }

    if (player.name === "Dodo" && context.needed > 0 && context.needed <= context.pot * 0.28 && context.equityProxy >= 0.42) {
      if (decision.action === "fold") {
        decision.action = "call";
        decision.raiseBy = 0;
        decision.sizeFraction = 0;
        decision.reason = "Dodo 防守合理小尺寸";
      }
    }

    if (player.name === "Bruno" && decision.valueReady && context.canRaise && decision.action === "raise") {
      const candidate = candidateBySize(decision, item => item.fraction >= 0.72, "largest");
      forceRaise(decision, candidate, "Bruno 厚重價值榨取");
    }

    decision.strategyVersion = VERSION;
    decision.multiStreet = true;
    decision.rangeAnalysis = analysis;
    decision.publicActionMemory = memory;
    syncPlanSnapshot(player, decision);
    return decision;
  }

  function chooseDecision(player, options = {}) {
    const base = window.AiCharacterStrategies;
    if (!base?.supports?.(player?.name)) return { action: "fallback", strategyVersion: VERSION };

    const preContext = base.publicContext(player);
    const preAnalysis = window.AiRangeTools?.publicAnalysis?.(player, preContext) || {
      blockers: { bluffScore: 0 }, riverClass: "not-river",
    };
    transitionPlan(player, preContext, preAnalysis);
    const decision = base.chooseDecision(player, options);
    return enhanceDecision(player, decision, options);
  }

  function performFold(player) {
    player.folded = true;
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = "棄牌";
    player.lastAction = "fold";
    if (!state.isMuted) Audio.fold();
    logAction(player, "Fold");
    announceAction("FOLD", "fold");
    say(player, "fold", { chance: 0.24 });
  }

  function performRaise(player, raiseBy) {
    raisePlayer(player, raiseBy);
    if (!state.isMuted) Audio.raise();
    logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
    announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
  }

  function performCall(player, needed) {
    const paid = pay(player, needed);
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : (paid === 0 ? "過牌" : `跟注 ${paid}`);
    if (paid === 0) {
      if (!state.isMuted) Audio.check();
    } else if (!state.isMuted) Audio.chip();
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), {
      chance: player.allIn && paid > 0 ? 0.3 : (paid === 0 ? 0.15 : 0.2),
    });
  }

  function executeDecision(player, decision) {
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyId: decision.strategyId,
      strategyVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      sizeFraction: decision.sizeFraction,
      equityProxy: decision.equityProxy,
      potOdds: decision.potOdds,
      plan: decision.plan?.line || "",
      riverClass: decision.rangeAnalysis?.riverClass || "not-river",
      checkRaise: Boolean(decision.checkRaise),
      blockerBluff: Boolean(decision.blockerBluff),
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player, amountToCall(player));
  }

  function registerProfiles() {
    const base = window.AiCharacterStrategies;
    if (!base?.supportedNames || typeof AI_ROSTER === "undefined") return false;
    for (const name of base.supportedNames) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (!profile) continue;
      Object.assign(profile, {
        strategyUpgradeVersion: VERSION,
        actionMemory: true,
        multiStreetPlanning: true,
        riverRangeMixing: true,
        blockerAware: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].strategyUpgradeVersion = VERSION;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    const base = window.AiCharacterStrategies;
    if (window.__aiCharacterStrategyV11Installed) return true;
    if (!base?.version || typeof botAction !== "function") return false;

    const previousBotAction = botAction;
    window.__aiCharacterStrategyV11PreviousBotAction = previousBotAction;
    botAction = function botActionWithMultiStreetDifficulty(player) {
      if (!base.supports(player?.name)) return previousBotAction(player);
      try {
        return executeDecision(player, chooseDecision(player));
      } catch (error) {
        console.warn("AI strategy V1.1 fallback", player?.name, error);
        return previousBotAction(player);
      }
    };
    window.__aiCharacterStrategyV11Installed = true;
    return true;
  }

  function refresh() {
    window.AiActionMemory?.refresh?.();
    const profilesReady = registerProfiles();
    const installed = installDecisionLayer();
    if ((profilesReady && installed) || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return profilesReady && installed;
  }

  window.AiCharacterStrategiesV11 = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicHeroStatistics: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    chooseDecision,
    transitionPlan,
    enhanceDecision,
    refresh,
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
