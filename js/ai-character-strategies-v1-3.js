// V1.3 difficulty layer: street-specific player modeling and adaptive exploitation.
(() => {
  "use strict";

  if (window.AiCharacterStrategiesV13?.version) return;

  const VERSION = "1.3.0";
  const SUPPORTED_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"];
  const ADAPTATION_WEIGHT = Object.freeze({
    Ace: 1.12,
    Momo: 0.96,
    Nori: 0.72,
    Bruno: 0.62,
    Dodo: 0.74,
    Viper: 0.92,
    Nova: 1.02,
    "Unit-9": 1.1,
    Merlin: 0.94,
    Vlad: 1.24,
  });
  const PRESSURE_NAMES = new Set(["Ace", "Momo", "Nori", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"]);
  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function roundToChip(value) {
    return Math.max(0, Math.round((Number(value) || 0) / 10) * 10);
  }

  function currentStreet() {
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function candidateBySize(decision, predicate, fallback = "best") {
    const candidates = [...(decision?.candidates || [])].filter(predicate);
    if (candidates.length) return candidates.sort((left, right) => right.ev - left.ev)[0];
    const all = [...(decision?.candidates || [])];
    if (!all.length) return null;
    if (fallback === "largest") return all.sort((left, right) => right.fraction - left.fraction)[0];
    if (fallback === "smallest") return all.sort((left, right) => left.fraction - right.fraction)[0];
    return all.sort((left, right) => right.ev - left.ev)[0];
  }

  function forcePostflopRaise(decision, candidate, reason) {
    if (!candidate || candidate.raiseBy <= 0) return false;
    decision.action = "raise";
    decision.raiseBy = candidate.raiseBy;
    decision.sizeFraction = candidate.fraction;
    decision.reason = reason;
    return true;
  }

  function continueWithoutRaise(decision, context, reason, allowCall = true) {
    decision.action = context.needed > 0 && !allowCall ? "fold" : "call";
    decision.raiseBy = 0;
    decision.sizeFraction = 0;
    decision.reason = reason;
    decision.blockerBluff = false;
    return decision;
  }

  function legalPreflopRaiseBy(player, context, desiredRaiseBy) {
    const available = Math.max(0, (Number(player?.stack) || 0) - (Number(context?.needed) || 0));
    const minimum = Math.max(Number(context?.bigBlind) || 1, typeof minimumRaiseBy === "function" ? minimumRaiseBy() : 0);
    if (available < minimum) return 0;
    return Math.min(available, Math.max(minimum, roundToChip(desiredRaiseBy)));
  }

  function scalePreflopRaise(player, decision, multiplier, reason) {
    const context = decision.context || {};
    const raiseBy = legalPreflopRaiseBy(player, context, (Number(decision.raiseBy) || 0) * multiplier);
    if (raiseBy <= 0) return false;
    decision.action = "raise";
    decision.raiseBy = raiseBy;
    decision.reason = reason;
    return true;
  }

  function exploitReadiness(player, profile) {
    const weight = ADAPTATION_WEIGHT[player?.name] || 0.8;
    return clamp(
      0.16
      + profile.confidence * 0.32 * weight
      + profile.pressureConfidence * 0.38 * weight
      + profile.checkedPressureConfidence * 0.18 * weight,
      0.16,
      0.82,
    );
  }

  function enhancePreflopDecision(player, decision, profile, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const context = decision.context || {};
    const hand = decision.hand || {};
    const thresholds = decision.thresholds || {};
    const tendencies = profile.tendencies || {};
    const readiness = exploitReadiness(player, profile);
    const canRaise = !player?.raiseLocked && Math.max(0, (Number(player?.stack) || 0) - (Number(context.needed) || 0)) >= Math.max(1, Number(context.bigBlind) || 1);
    const latestRaiseByHero = Boolean(context.latestRaise?.isHuman);
    const blocker = Boolean(hand.aceBlocker || hand.kingBlocker);
    const nearThreeBet = Number(hand.score) >= (Number(thresholds.threeBet) || 0.77) - 0.12;

    if (
      tendencies.overfoldToPressure
      && latestRaiseByHero
      && canRaise
      && ["fold", "call"].includes(decision.action)
      && blocker
      && nearThreeBet
      && PRESSURE_NAMES.has(player.name)
      && random() < readiness
    ) {
      const target = Math.max((Number(context.currentBet) || Number(context.bigBlind) || 1) * 3.25, (Number(context.bigBlind) || 1) * 8);
      const raiseBy = legalPreflopRaiseBy(player, context, target - (Number(context.currentBet) || 0));
      if (raiseBy > 0) {
        decision.action = "raise";
        decision.raiseBy = raiseBy;
        decision.stage = context.callersAfterOpen > 0 ? "adaptive-squeeze" : "adaptive-three-bet";
        decision.reason = `${player.name} 針對翻牌前過度棄牌擴張阻擋牌反加`;
        decision.bluff = Number(hand.score) < (Number(thresholds.threeBet) || 0.77);
        decision.squeeze = context.callersAfterOpen > 0;
        decision.exploitApplied = "preflop-overfold";
      }
    }

    if (tendencies.looseOpener && latestRaiseByHero && canRaise && decision.action === "call" && Number(hand.score) >= (Number(thresholds.threeBet) || 0.77) - 0.065) {
      const target = Math.max((Number(context.currentBet) || 1) * 3.15, (Number(context.bigBlind) || 1) * 8);
      const raiseBy = legalPreflopRaiseBy(player, context, target - (Number(context.currentBet) || 0));
      if (raiseBy > 0 && random() < readiness * 0.85) {
        decision.action = "raise";
        decision.raiseBy = raiseBy;
        decision.stage = "adaptive-value-three-bet";
        decision.reason = `${player.name} 針對過寬開池擴張價值 3-bet`;
        decision.exploitApplied = "loose-opener";
      }
    }

    if (tendencies.stickyCaller && decision.action === "raise") {
      const likelyBluff = Boolean(decision.bluff) || Number(hand.score) < (Number(thresholds.threeBet) || 0.77) - 0.035;
      if (likelyBluff) {
        const canContinue = Number(hand.score) >= (Number(thresholds.call) || 0.54) && Number(context.potOdds) <= 0.3;
        decision.action = canContinue ? "call" : "fold";
        decision.raiseBy = 0;
        decision.reason = `${player.name} 對黏性玩家收斂翻牌前詐唬反加`;
        decision.bluff = false;
        decision.exploitApplied = "preflop-sticky-suppress-bluff";
      } else {
        scalePreflopRaise(player, decision, 1.14, `${player.name} 對黏性玩家放大翻牌前價值尺寸`);
        decision.exploitApplied = "preflop-sticky-value";
      }
    }

    if (tendencies.frequentThreeBettor && decision.stage?.includes("four-bet") && decision.action === "raise" && Number(hand.score) >= (Number(thresholds.fourBet) || 0.9) - 0.025) {
      scalePreflopRaise(player, decision, 1.08, `${player.name} 針對高頻 3-bet 強化頂端 4-bet`);
      decision.exploitApplied = "frequent-three-bettor";
    }

    return decision;
  }

  function enhancePostflopDecision(player, decision, profile, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const context = decision.context || {};
    const analysis = decision.rangeAnalysis || context.rangeAnalysis || {};
    const tendencies = profile.tendencies || {};
    const readiness = exploitReadiness(player, profile);
    const mediumStrength = Number(context.equityProxy) >= 0.42 && Number(context.equityProxy) < 0.68;
    const safePressure = Number(context.activeOpponents || 1) <= 2
      && Number(context.needed || 0) <= Number(context.pot || 1) * 0.42
      && (Number(context.equityProxy) >= 0.32 || Number(context.drawPotential) >= 0.045 || context.texture?.dry);

    if (tendencies.stickyCaller) {
      if (decision.blockerBluff || (decision.bluffing && !decision.valueReady)) {
        const allowCall = Number(context.needed || 0) === 0 || Number(decision.callScore || -1) >= -0.01;
        continueWithoutRaise(decision, context, `${player.name} 對黏性玩家取消低成功率詐唬`, allowCall);
        decision.bluffing = false;
        decision.exploitApplied = "sticky-suppress-bluff";
      } else if (decision.valueReady && context.canRaise && decision.action === "raise") {
        const candidate = candidateBySize(decision, item => item.fraction >= 0.72, "largest");
        if (forcePostflopRaise(decision, candidate, `${player.name} 對黏性玩家放大價值尺寸`)) {
          decision.exploitApplied = "sticky-value-size";
        }
      }
    }

    if (
      (tendencies.overfoldToPressure || tendencies.checkFoldLeak || tendencies.passive)
      && PRESSURE_NAMES.has(player.name)
      && context.canRaise
      && safePressure
      && !tendencies.checkRaiseThreat
      && !decision.valueReady
      && random() < readiness
    ) {
      const candidate = candidateBySize(
        decision,
        item => item.fraction >= (tendencies.checkFoldLeak ? 0.45 : 0.58),
        tendencies.overfoldToPressure ? "largest" : "best",
      );
      const label = tendencies.checkFoldLeak
        ? "過牌後棄牌漏洞"
        : tendencies.overfoldToPressure
          ? "面對壓力過度棄牌"
          : "被動公開路線";
      if (forcePostflopRaise(decision, candidate, `${player.name} 針對${label}主動施壓`)) {
        decision.bluffing = true;
        decision.exploitApplied = tendencies.checkFoldLeak ? "check-fold-leak" : "overfold-pressure";
      }
    }

    if (tendencies.checkRaiseThreat && context.needed === 0 && decision.action === "raise" && !decision.valueReady && mediumStrength) {
      continueWithoutRaise(decision, context, `${player.name} 對高頻 Check-Raise 玩家保留中等攤牌價值`, true);
      decision.bluffing = false;
      decision.exploitApplied = "check-raise-counter";
    }

    if (tendencies.aggressive) {
      const bluffCatcher = analysis.riverClass === "bluff-catcher" || analysis.riverClass === "showdown";
      if (
        decision.action === "fold"
        && Number(context.needed || 0) > 0
        && Number(context.needed || 0) <= Number(context.pot || 1) * 0.43
        && (bluffCatcher || Number(context.equityProxy) >= Number(context.potOdds || 0) + 0.065)
        && ["Dodo", "Viper", "Unit-9", "Vlad"].includes(player.name)
      ) {
        decision.action = "call";
        decision.raiseBy = 0;
        decision.sizeFraction = 0;
        decision.reason = `${player.name} 針對高侵略頻率擴張 Bluff Catch`;
        decision.exploitApplied = "aggressive-bluff-catch";
      } else if (
        context.needed === 0
        && decision.valueReady
        && Number(context.equityProxy) >= 0.72
        && ["Viper", "Merlin", "Vlad"].includes(player.name)
        && random() < readiness * 0.52
      ) {
        continueWithoutRaise(decision, context, `${player.name} 針對高侵略玩家保留誘捕線`, true);
        decision.exploitApplied = "aggressive-trap";
      }
    }

    if (
      tendencies.largeSizeHeavy
      && Number(context.needed || 0) >= Number(context.pot || 1) * 0.72
      && Number(context.equityProxy) < 0.57
      && !decision.valueReady
      && analysis.riverClass !== "bluff-catcher"
    ) {
      continueWithoutRaise(decision, context, `${player.name} 對高頻大尺寸收緊邊緣繼續範圍`, false);
      decision.exploitApplied = "large-size-tighten";
    }

    if (
      tendencies.smallSizeHeavy
      && decision.action === "fold"
      && Number(context.needed || 0) > 0
      && Number(context.needed || 0) <= Number(context.pot || 1) * 0.28
      && Number(context.equityProxy) >= 0.39
    ) {
      decision.action = "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 針對高頻小尺寸擴張防守`;
      decision.exploitApplied = "small-size-defense";
    }

    if (currentStreet() === "river" && tendencies.stickyCaller && decision.blockerBluff) {
      continueWithoutRaise(decision, context, `${player.name} 河牌對跟注站取消阻擋牌詐唬`, Number(decision.callScore || -1) >= 0);
      decision.bluffing = false;
      decision.exploitApplied = "river-station";
    }

    return decision;
  }

  function enhanceDecision(player, decision, options = {}) {
    if (!decision || decision.action === "fallback") return decision;
    const street = decision.context?.street || currentStreet();
    const position = decision.context?.position || (typeof positionLabel === "function" ? positionLabel(player) : "--");
    const profile = window.AiPlayerModel?.exploitProfile?.(street, position) || {
      confidence: 0,
      pressureConfidence: 0,
      checkedPressureConfidence: 0,
      tendencies: {},
    };

    if (street === "preflop") enhancePreflopDecision(player, decision, profile, options);
    else enhancePostflopDecision(player, decision, profile, options);

    decision.strategyVersion = VERSION;
    decision.adaptivePlayerModel = true;
    decision.playerExploitProfile = profile;
    return decision;
  }

  function chooseDecision(player, options = {}) {
    if (!SUPPORTED_NAMES.includes(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    const baseDecision = currentStreet() === "preflop"
      ? window.AiCharacterStrategiesV12?.chooseDecision?.(player, options)
      : window.AiCharacterStrategiesV11?.chooseDecision?.(player, options);
    if (!baseDecision) return { action: "fallback", strategyVersion: VERSION };
    return enhanceDecision(player, baseDecision, options);
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
      street: decision.context?.street || currentStreet(),
      stage: decision.stage || "postflop",
      raiseBy: decision.raiseBy || 0,
      sizeFraction: decision.sizeFraction || 0,
      exploitApplied: decision.exploitApplied || "",
      modelConfidence: decision.playerExploitProfile?.confidence || 0,
      pressureConfidence: decision.playerExploitProfile?.pressureConfidence || 0,
      fairPublicModel: true,
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player, amountToCall(player));
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const name of SUPPORTED_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (!profile) continue;
      Object.assign(profile, {
        adaptiveStrategyVersion: VERSION,
        adaptivePlayerModel: true,
        streetSpecificExploits: true,
        positionSpecificReads: true,
        publicSizeTellAware: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].adaptiveStrategyVersion = VERSION;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    if (window.__aiCharacterStrategyV13Installed) return true;
    if (!window.AiPlayerModel?.version || !window.AiCharacterStrategiesV12?.version || typeof botAction !== "function") return false;

    const previousBotAction = botAction;
    window.__aiCharacterStrategyV13PreviousBotAction = previousBotAction;
    botAction = function botActionWithAdaptivePlayerModel(player) {
      if (!SUPPORTED_NAMES.includes(player?.name)) return previousBotAction(player);
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
    window.AiPlayerModel?.refresh?.();
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
    supportedNames: [...SUPPORTED_NAMES],
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicPositions: true,
      publicBetSizes: true,
      publicHeroStatistics: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    supports: name => SUPPORTED_NAMES.includes(name),
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
