// V1.3 difficulty layer: carry preflop ranges into postflop c-bets, probes, and barrel plans.
(() => {
  "use strict";

  if (window.AiCharacterStrategiesV13?.version) return;

  const VERSION = "1.3.0";
  const PRESSURE = Object.freeze({
    Ace: 0.66,
    Momo: 0.9,
    Nori: 0.64,
    Bruno: 0.43,
    Dodo: 0.34,
    Viper: 0.61,
    Nova: 0.86,
    "Unit-9": 0.72,
    Merlin: 0.78,
    Vlad: 0.82,
  });
  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function candidateNearest(decision, target, fallback = "best") {
    const candidates = [...(decision.candidates || [])].filter(candidate => candidate.raiseBy > 0);
    if (!candidates.length) return null;
    if (fallback === "largest") return candidates.sort((left, right) => right.fraction - left.fraction)[0];
    if (fallback === "smallest") return candidates.sort((left, right) => left.fraction - right.fraction)[0];
    return candidates.sort((left, right) => {
      const leftDistance = Math.abs(left.fraction - target);
      const rightDistance = Math.abs(right.fraction - target);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return right.ev - left.ev;
    })[0];
  }

  function forceRaise(decision, candidate, reason, line) {
    if (!candidate || candidate.raiseBy <= 0) return false;
    decision.action = "raise";
    decision.raiseBy = candidate.raiseBy;
    decision.sizeFraction = candidate.fraction;
    decision.reason = reason;
    decision.rangeLine = line;
    return true;
  }

  function forceCheck(decision, reason, line = "check-back") {
    if ((Number(decision.context?.needed) || 0) !== 0) return false;
    decision.action = "call";
    decision.raiseBy = 0;
    decision.sizeFraction = 0;
    decision.reason = reason;
    decision.rangeLine = line;
    return true;
  }

  function targetFraction(rangeContext, decision, line) {
    const board = rangeContext.board;
    const value = Boolean(decision.valueReady);
    const draw = Number(decision.context?.drawPotential) || 0;

    if (line === "cbet") {
      if (board.dry && !value && draw < 0.08) return 0.33;
      if (board.wetness >= 0.55 || value) return 0.68;
      return 0.48;
    }
    if (line === "delayed-cbet") return board.wetness >= 0.48 ? 0.68 : 0.5;
    if (line === "probe") return board.wetness >= 0.5 ? 0.66 : 0.44;
    if (line === "donk") return value ? 0.62 : 0.5;
    if (line === "double-barrel") return board.wetness >= 0.55 ? 0.74 : 0.58;
    if (line === "triple-barrel") return value ? 0.78 : 0.72;
    return 0.55;
  }

  function lineChance(player, rangeContext, decision, line) {
    const pressure = PRESSURE[player?.name] ?? 0.6;
    const heroFold = Number(decision.context?.hero?.foldRate) || 0;
    const advantage = rangeContext.rangeAdvantage;
    const nutAdvantage = rangeContext.nutAdvantage;
    const draw = Number(decision.context?.drawPotential) || 0;
    const value = Boolean(decision.valueReady);
    let chance = 0.34 + pressure * 0.28 + advantage * 0.65 + nutAdvantage * 0.35;

    if (value) chance += 0.18;
    if (draw >= 0.09) chance += 0.13;
    if (heroFold >= 0.38) chance += 0.1;
    if ((Number(decision.context?.activeOpponents) || 1) > 1) chance -= 0.12;
    if (line === "delayed-cbet" && player.name === "Merlin") chance += 0.24;
    if (line === "probe" && ["Nova", "Vlad", "Merlin", "Unit-9"].includes(player.name)) chance += 0.13;
    if (line === "donk" && !["Momo", "Nova", "Vlad"].includes(player.name)) chance -= 0.35;
    if (line === "double-barrel" && ["Momo", "Nova", "Merlin", "Vlad"].includes(player.name)) chance += 0.1;
    if (line === "triple-barrel") chance -= 0.08;
    if (player.name === "Bruno" && !value) chance -= 0.28;
    if (player.name === "Dodo" && !value) chance -= 0.34;
    return clamp(chance, 0.08, 0.94);
  }

  function canApplyPressure(decision, rangeContext) {
    return Boolean(
      decision?.context?.canRaise
      && (Number(decision.context.needed) || 0) === 0
      && !decision.checkRaise
    );
  }

  function enhanceDecision(player, decision, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const rangeContext = window.AiRangeContinuation?.publicContext?.(player, decision) || null;
    if (!rangeContext) return decision;

    decision.strategyVersion = VERSION;
    decision.rangeContinuation = rangeContext;
    decision.rangeAdvantage = rangeContext.rangeAdvantage;
    decision.nutAdvantage = rangeContext.nutAdvantage;
    decision.rangeLine = decision.rangeLine || "base";
    decision.context.rangeContinuation = rangeContext;

    if ((state?.board?.length || 0) < 3 || decision.checkRaise) return decision;

    const value = Boolean(decision.valueReady);
    const draw = Number(decision.context?.drawPotential) || 0;
    const equity = Number(decision.context?.equityProxy) || 0;
    const heroFold = Number(decision.context?.hero?.foldRate) || 0;
    const blockerScore = Number(decision.rangeAnalysis?.blockers?.bluffScore) || 0;
    const canPressure = canApplyPressure(decision, rangeContext);

    if (canPressure && rangeContext.tripleBarrelOpportunity) {
      const riverClass = decision.rangeAnalysis?.riverClass || "not-river";
      const valueBarrel = ["thick-value", "thin-value"].includes(riverClass) || value;
      const bluffBarrel = riverClass === "air"
        && blockerScore >= 0.4
        && heroFold >= 0.34
        && rangeContext.rangeAdvantage >= -0.06;
      if ((valueBarrel || bluffBarrel) && random() < lineChance(player, rangeContext, decision, "triple-barrel")) {
        const target = targetFraction(rangeContext, decision, "triple-barrel");
        const candidate = candidateNearest(decision, target, valueBarrel ? "largest" : "best");
        if (forceRaise(
          decision,
          candidate,
          valueBarrel ? "範圍延續：河牌第三槍價值線" : "範圍延續：河牌第三槍阻擋牌詐唬",
          "triple-barrel",
        )) {
          decision.tripleBarrel = true;
          decision.rangeBluff = bluffBarrel;
          return decision;
        }
      }
    }

    if (canPressure && rangeContext.doubleBarrelOpportunity) {
      const favorable = value
        || draw >= 0.075
        || equity >= 0.55
        || rangeContext.rangeAdvantage >= 0.015
        || (heroFold >= 0.4 && rangeContext.nutAdvantage >= -0.03);
      if (favorable && random() < lineChance(player, rangeContext, decision, "double-barrel")) {
        const target = targetFraction(rangeContext, decision, "double-barrel");
        const candidate = candidateNearest(decision, target);
        if (forceRaise(decision, candidate, "範圍延續：轉牌第二槍施壓", "double-barrel")) {
          decision.doubleBarrel = true;
          return decision;
        }
      }
    }

    if (canPressure && rangeContext.delayedCbetOpportunity) {
      const favorable = value
        || draw >= 0.07
        || rangeContext.rangeAdvantage >= -0.015
        || heroFold >= 0.36
        || player.name === "Merlin";
      if (favorable && random() < lineChance(player, rangeContext, decision, "delayed-cbet")) {
        const target = targetFraction(rangeContext, decision, "delayed-cbet");
        const candidate = candidateNearest(decision, target);
        if (forceRaise(decision, candidate, "範圍延續：轉牌延遲 C-bet", "delayed-cbet")) {
          decision.delayedCbet = true;
          return decision;
        }
      }
    }

    if (canPressure && rangeContext.probeOpportunity) {
      const favorable = value
        || draw >= 0.075
        || rangeContext.rangeAdvantage >= 0.025
        || (heroFold >= 0.39 && ["Nova", "Vlad", "Merlin", "Unit-9"].includes(player.name));
      if (favorable && random() < lineChance(player, rangeContext, decision, "probe")) {
        const target = targetFraction(rangeContext, decision, "probe");
        const candidate = candidateNearest(decision, target);
        if (forceRaise(decision, candidate, "範圍延續：對手錯過 C-bet 後 Probe", "probe")) {
          decision.probeBet = true;
          return decision;
        }
      }
    }

    if (canPressure && rangeContext.cbetOpportunity) {
      const favorable = value
        || draw >= 0.075
        || rangeContext.rangeAdvantage >= 0
        || rangeContext.board.dry
        || heroFold >= 0.38;
      if (favorable && random() < lineChance(player, rangeContext, decision, "cbet")) {
        const target = targetFraction(rangeContext, decision, "cbet");
        const candidate = candidateNearest(decision, target);
        if (forceRaise(
          decision,
          candidate,
          rangeContext.board.dry && !value ? "範圍優勢：乾燥牌面小尺寸 C-bet" : "範圍優勢：翻牌持續下注",
          "cbet",
        )) {
          decision.cbet = true;
          return decision;
        }
      }
    }

    if (canPressure && rangeContext.donkOpportunity) {
      const donkValue = value && equity >= 0.62;
      const donkDraw = draw >= 0.11 && rangeContext.board.wetness >= 0.42;
      if ((donkValue || donkDraw) && random() < lineChance(player, rangeContext, decision, "donk")) {
        const target = targetFraction(rangeContext, decision, "donk");
        const candidate = candidateNearest(decision, target);
        if (forceRaise(
          decision,
          candidate,
          donkValue ? "範圍延續：領先下注保護價值" : "範圍延續：濕潤牌面領先半詐唬",
          "donk",
        )) {
          decision.donkBet = true;
          return decision;
        }
      }
    }

    const shouldControl = (Number(decision.context?.needed) || 0) === 0
      && decision.action === "raise"
      && !decision.blockerBluff
      && !decision.bluffing
      && draw < 0.07
      && equity < 0.59
      && rangeContext.rangeAdvantage <= -0.065
      && (player.name === "Dodo" || player.name === "Nori" || player.name === "Bruno" || random() < 0.58);
    if (shouldControl) {
      forceCheck(decision, "範圍劣勢：保留攤牌價值並控制底池");
      decision.checkBack = true;
    }

    return decision;
  }

  function chooseDecision(player, options = {}) {
    const continuation = window.AiRangeContinuation;
    if (!continuation?.supports?.(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    if ((state?.board?.length || 0) === 0) {
      return window.AiCharacterStrategiesV12?.chooseDecision?.(player, options)
        || { action: "fallback", strategyVersion: VERSION };
    }
    const decision = window.AiCharacterStrategiesV11?.chooseDecision?.(player, options);
    if (!decision || decision.action === "fallback") return decision || { action: "fallback", strategyVersion: VERSION };
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
      strategyId: decision.strategyId || player.strategyId || "",
      strategyVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      sizeFraction: decision.sizeFraction || 0,
      equityProxy: decision.equityProxy,
      potOdds: decision.potOdds,
      rangeLine: decision.rangeLine || "base",
      preflopRole: decision.rangeContinuation?.actorRange?.role || "unopened",
      rangeAdvantage: decision.rangeAdvantage || 0,
      nutAdvantage: decision.nutAdvantage || 0,
      cbet: Boolean(decision.cbet),
      delayedCbet: Boolean(decision.delayedCbet),
      doubleBarrel: Boolean(decision.doubleBarrel),
      tripleBarrel: Boolean(decision.tripleBarrel),
      probeBet: Boolean(decision.probeBet),
      donkBet: Boolean(decision.donkBet),
      checkBack: Boolean(decision.checkBack),
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player, amountToCall(player));
  }

  function registerProfiles() {
    const continuation = window.AiRangeContinuation;
    if (!continuation?.supportedNames || typeof AI_ROSTER === "undefined") return false;
    for (const name of continuation.supportedNames) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (!profile) continue;
      Object.assign(profile, {
        postflopStrategyVersion: VERSION,
        rangeContinuation: true,
        rangeAdvantageAware: true,
        cbetAware: true,
        delayedCbetAware: true,
        barrelAware: true,
        probeAware: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].postflopStrategyVersion = VERSION;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    const continuation = window.AiRangeContinuation;
    if (window.__aiCharacterStrategyV13Installed) return true;
    if (!continuation?.version || typeof botAction !== "function") return false;

    const previousBotAction = botAction;
    window.__aiCharacterStrategyV13PreviousBotAction = previousBotAction;
    botAction = function botActionWithRangeContinuation(player) {
      if (!continuation.supports(player?.name) || (state?.board?.length || 0) === 0) {
        return previousBotAction(player);
      }
      try {
        const decision = chooseDecision(player);
        if (!decision || decision.action === "fallback") return previousBotAction(player);
        return executeDecision(player, decision);
      } catch (error) {
        console.warn("AI strategy V1.3 fallback", player?.name, error);
        return previousBotAction(player);
      }
    };
    window.__aiCharacterStrategyV13Installed = true;
    return true;
  }

  function refresh() {
    window.AiActionMemory?.refresh?.();
    const profilesReady = registerProfiles();
    const installed = installDecisionLayer();
    window.FairSpecialBosses?.refresh?.();
    if ((profilesReady && installed) || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return profilesReady && installed;
  }

  window.AiCharacterStrategiesV13 = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicPositions: true,
      publicActions: true,
      publicBetSizes: true,
      publicHeroStatistics: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    chooseDecision,
    enhanceDecision,
    refresh,
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  window.setTimeout(refresh, 700);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
