// V1.5 difficulty layer: multiway pot discipline and public opponent range distribution.
(() => {
  "use strict";

  if (window.AiCharacterStrategiesV15?.version) return;

  const VERSION = "1.5.0";
  const SUPPORTED_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"];
  const PRESSURE_CHARACTERS = new Set(["Ace", "Momo", "Nori", "Nova", "Unit-9", "Merlin", "Vlad"]);
  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function currentStreet() {
    return window.AiMultiwayRangeModel?.currentStreet?.()
      || ((state?.board?.length || 0) >= 5 ? "river" : (state?.board?.length === 4 ? "turn" : ((state?.board?.length || 0) >= 3 ? "flop" : "preflop")));
  }

  function candidateBySize(decision, predicate, fallback = "best") {
    const candidates = [...(decision?.candidates || [])].filter(candidate => (
      candidate
      && Number(candidate.raiseBy) > 0
      && predicate(candidate)
    ));
    if (candidates.length) return candidates.sort((left, right) => Number(right.ev) - Number(left.ev))[0];
    const all = [...(decision?.candidates || [])].filter(candidate => Number(candidate?.raiseBy) > 0);
    if (!all.length) return null;
    if (fallback === "largest") return all.sort((left, right) => Number(right.fraction) - Number(left.fraction))[0];
    if (fallback === "smallest") return all.sort((left, right) => Number(left.fraction) - Number(right.fraction))[0];
    return all.sort((left, right) => Number(right.ev) - Number(left.ev))[0];
  }

  function passiveDecision(decision, context, reason, allowCall = true) {
    const needed = Math.max(0, Number(context?.needed) || 0);
    decision.action = needed > 0 && !allowCall ? "fold" : "call";
    decision.raiseBy = 0;
    decision.sizeFraction = 0;
    decision.reason = reason;
    decision.bluffing = false;
    decision.blockerBluff = false;
    return decision;
  }

  function forceRaise(decision, candidate, reason) {
    if (!candidate || Number(candidate.raiseBy) <= 0) return false;
    decision.action = "raise";
    decision.raiseBy = Number(candidate.raiseBy) || 0;
    decision.sizeFraction = Number(candidate.fraction) || 0;
    decision.reason = reason;
    return true;
  }

  function legalPreflopRaiseBy(player, context, desiredRaiseBy) {
    const needed = Math.max(0, Number(context?.needed) || 0);
    const available = Math.max(0, (Number(player?.stack) || 0) - needed);
    const bigBlind = Math.max(1, Number(context?.bigBlind) || (typeof currentBigBlind === "function" ? currentBigBlind() : 1));
    const minimum = Math.max(bigBlind, typeof minimumRaiseBy === "function" ? minimumRaiseBy() : bigBlind);
    if (available < minimum) return 0;
    const rounded = Math.max(minimum, Math.round((Number(desiredRaiseBy) || 0) / 10) * 10);
    return Math.min(available, rounded);
  }

  function enhancePreflopDecision(player, decision, analysis) {
    const context = decision.context || {};
    const hand = decision.hand || {};
    const thresholds = decision.thresholds || {};
    const score = Number(hand.score) || 0;
    const callThreshold = Number(thresholds.call) || 0.54;
    const threeBetThreshold = Number(thresholds.threeBet) || 0.77;
    const callers = Math.max(0, Number(context.callersAfterOpen) || 0);
    const facingRaise = Math.max(0, Number(context.raises) || 0) >= 1;
    const playableMultiway = Boolean(
      hand.pair
      || hand.suitedConnector
      || (hand.suited && Number(hand.broadwayCount) >= 1)
      || score >= threeBetThreshold - 0.03
    );
    const premium = score >= Math.max(0.8, threeBetThreshold + 0.045);
    const coldCallPenalty = Math.max(0, analysis.opponentCount - 1) * 0.025
      + analysis.aggressiveOpponents * 0.025
      + analysis.rangePressure * 0.035;

    if (
      decision.squeeze
      && decision.bluff
      && (analysis.opponentCount >= 3 || analysis.strongestRange >= 0.7 || analysis.aggressiveOpponents >= 2)
    ) {
      const canCall = playableMultiway
        && score >= callThreshold + coldCallPenalty
        && Number(context.potOdds) <= 0.28;
      passiveDecision(
        decision,
        context,
        `${player.name} 面對多人強範圍取消邊緣 Squeeze 詐唬`,
        canCall,
      );
      decision.multiwayAdjustment = "suppress-squeeze-bluff";
      return decision;
    }

    if (decision.action === "call" && facingRaise && callers >= 1 && !premium) {
      const required = callThreshold + coldCallPenalty;
      if (score < required || (!playableMultiway && score < required + 0.055)) {
        passiveDecision(decision, context, `${player.name} 面對多人公開範圍收緊 Cold Call`, false);
        decision.multiwayAdjustment = "tighten-cold-call";
        return decision;
      }
    }

    if (
      decision.action === "call"
      && Math.max(0, Number(context.raises) || 0) >= 2
      && analysis.opponentCount >= 2
      && !premium
      && score < (Number(thresholds.fourBet) || 0.9) - 0.07
    ) {
      passiveDecision(decision, context, `${player.name} 面對多人再加注範圍放棄邊緣繼續`, false);
      decision.multiwayAdjustment = "tighten-versus-multiple-raises";
      return decision;
    }

    if (
      decision.action === "raise"
      && !decision.bluff
      && ["squeeze", "three-bet", "adaptive-value-three-bet"].includes(decision.stage)
      && score >= threeBetThreshold
    ) {
      const multiplier = 1 + Math.min(0.2, callers * 0.045 + Math.max(0, analysis.opponentCount - 1) * 0.025);
      const scaled = legalPreflopRaiseBy(player, context, (Number(decision.raiseBy) || 0) * multiplier);
      if (scaled > 0) {
        decision.raiseBy = scaled;
        decision.reason = `${player.name} 對多人跟注範圍放大價值反加`;
        decision.multiwayAdjustment = "value-isolation-size";
      }
    }

    return decision;
  }

  function enhancePostflopDecision(player, decision, analysis, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const context = decision.context || {};
    const publicAnalysis = decision.rangeAnalysis || context.rangeAnalysis || {};
    const equity = clamp(context.equityProxy, 0, 1);
    const draw = clamp(context.drawPotential, 0, 1);
    const needed = Math.max(0, Number(context.needed) || 0);
    const pot = Math.max(1, Number(context.pot) || 1);
    const betRatio = needed / pot;
    const wetness = clamp(context.texture?.wetness, 0, 1);
    const riverClass = publicAnalysis.riverClass || "not-river";
    const blockerScore = clamp(publicAnalysis.blockers?.bluffScore, 0, 1);
    const thickValue = riverClass === "thick-value" || equity >= analysis.strongValueThreshold;
    const thinValue = riverClass === "thin-value"
      || (decision.valueReady && equity < analysis.thinValueThreshold);
    const strongDraw = draw >= 0.115 || publicAnalysis.draws?.openEnded || publicAnalysis.draws?.flushDraw;
    const pureBluff = !decision.valueReady
      && draw < 0.075
      && Boolean(decision.bluffing || decision.blockerBluff);
    const marginalShowdown = ["showdown", "bluff-catcher"].includes(riverClass)
      || (equity >= 0.42 && equity < analysis.thinValueThreshold);

    if (
      pureBluff
      && (
        analysis.bluffSuccessModifier < 0.66
        || analysis.opponentCount >= 3
        || analysis.aggressiveOpponents >= 1
        || analysis.callingOpponents >= 2
      )
    ) {
      const canCall = needed === 0
        || (Number(decision.callScore) >= 0.025 && equity >= Number(context.potOdds) + 0.08);
      passiveDecision(decision, context, `${player.name} 在多人底池取消低成功率純詐唬`, canCall);
      decision.multiwayAdjustment = "suppress-pure-bluff";
      return decision;
    }

    if (
      currentStreet() === "river"
      && decision.blockerBluff
      && !decision.valueReady
      && !(
        analysis.opponentCount === 2
        && analysis.aggressiveOpponents === 0
        && analysis.bluffSuccessModifier >= 0.58
        && blockerScore >= 0.55
      )
    ) {
      const canCall = needed === 0 || equity >= Number(context.potOdds) + 0.1;
      passiveDecision(decision, context, `${player.name} 在多人河牌取消不足頻率的 Blocker Bluff`, canCall);
      decision.multiwayAdjustment = "suppress-river-blocker-bluff";
      return decision;
    }

    if (decision.bluffing && !decision.valueReady && !pureBluff) {
      const semiBluffQualified = strongDraw
        && equity >= analysis.requiredShowdownStrength - 0.16
        && analysis.aggressiveOpponents <= 1
        && analysis.bluffSuccessModifier >= 0.34;
      if (!semiBluffQualified) {
        const canCall = needed === 0
          || (Number(decision.callScore) >= 0.015 && equity >= Number(context.potOdds) + 0.055);
        passiveDecision(decision, context, `${player.name} 在多人底池收斂弱聽牌半詐唬`, canCall);
        decision.multiwayAdjustment = "suppress-weak-semi-bluff";
        return decision;
      }

      if (decision.action === "raise") {
        const controlled = candidateBySize(decision, candidate => (
          Number(candidate.fraction) >= 0.32 && Number(candidate.fraction) <= 0.66
        ), "smallest");
        if (forceRaise(decision, controlled, `${player.name} 以強聽牌採用受控多人半詐唬尺寸`)) {
          decision.multiwayAdjustment = "controlled-semi-bluff-size";
        }
      }
    }

    if (decision.action === "raise" && thinValue && !thickValue) {
      const allowCall = needed === 0
        || equity >= Math.max(Number(context.potOdds) + 0.095, analysis.requiredShowdownStrength - 0.08);
      passiveDecision(decision, context, `${player.name} 在多人範圍前保留薄價值與攤牌價值`, allowCall);
      decision.multiwayAdjustment = "protect-thin-value";
      return decision;
    }

    if (
      decision.action === "raise"
      && marginalShowdown
      && !decision.valueReady
      && analysis.rangePressure >= 0.58
      && !strongDraw
    ) {
      passiveDecision(decision, context, `${player.name} 在多人高壓範圍前控制中等牌底池`, true);
      decision.multiwayAdjustment = "multiway-pot-control";
      return decision;
    }

    if (thickValue && context.canRaise) {
      const preferred = wetness >= 0.42 || analysis.callingOpponents >= 2
        ? candidateBySize(decision, candidate => (
          Number(candidate.fraction) >= 0.58 && Number(candidate.fraction) <= 0.96
        ), "largest")
        : candidateBySize(decision, candidate => (
          Number(candidate.fraction) >= 0.45 && Number(candidate.fraction) <= 0.82
        ), "best");
      if (preferred && (decision.action !== "raise" || Math.abs(Number(decision.sizeFraction) - Number(preferred.fraction)) > 0.04)) {
        if (forceRaise(decision, preferred, `${player.name} 對多人公開範圍採用厚價值尺寸`)) {
          decision.multiwayAdjustment = "multiway-thick-value";
        }
      }
    }

    if (
      decision.action === "call"
      && needed > 0
      && !thickValue
      && betRatio >= 0.5
    ) {
      const required = Math.max(
        Number(context.potOdds) + 0.065 + analysis.rangePressure * 0.07,
        analysis.requiredShowdownStrength - 0.025,
      );
      const multiAggressorRisk = analysis.aggressiveOpponents >= 2 ? 0.045 : 0;
      if (equity < required + multiAggressorRisk) {
        passiveDecision(decision, context, `${player.name} 對多人強範圍與大尺寸放棄邊緣跟注`, false);
        decision.multiwayAdjustment = "fold-marginal-versus-large-size";
        return decision;
      }
    }

    const outOfPosition = !["BTN", "CO"].includes(String(context.position || ""));
    if (
      needed === 0
      && outOfPosition
      && decision.action === "raise"
      && !thickValue
      && marginalShowdown
      && analysis.rangePressure >= 0.55
    ) {
      passiveDecision(decision, context, `${player.name} 在多人底池位置不利時增加過牌控制`, true);
      decision.multiwayAdjustment = "out-of-position-control";
      return decision;
    }

    if (
      PRESSURE_CHARACTERS.has(player.name)
      && decision.action === "call"
      && needed === 0
      && strongDraw
      && analysis.opponentCount === 2
      && analysis.rangePressure <= 0.52
      && analysis.bluffSuccessModifier >= 0.5
      && context.canRaise
      && random() < 0.16
    ) {
      const candidate = candidateBySize(decision, item => Number(item.fraction) >= 0.38 && Number(item.fraction) <= 0.62, "smallest");
      if (forceRaise(decision, candidate, `${player.name} 利用範圍優勢保留低頻多人強聽牌施壓`)) {
        decision.bluffing = true;
        decision.multiwayAdjustment = "selective-strong-draw-pressure";
      }
    }

    return decision;
  }

  function enhanceDecision(player, decision, options = {}) {
    if (!decision || decision.action === "fallback") return decision;
    const context = decision.context || {};
    const analysis = options.multiwayAnalysis
      || window.AiMultiwayRangeModel?.analyze?.(player, context)
      || { opponentCount: 0, multiway: false, profiles: [] };

    decision.multiwayRangeAnalysis = analysis;
    decision.multiwayOpponentRanges = true;
    decision.strategyVersion = VERSION;

    if (!analysis.multiway) return decision;
    if ((context.street || currentStreet()) === "preflop") enhancePreflopDecision(player, decision, analysis, options);
    else enhancePostflopDecision(player, decision, analysis, options);
    return decision;
  }

  function chooseDecision(player, options = {}) {
    if (!SUPPORTED_NAMES.includes(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    const baseDecision = window.AiCharacterStrategiesV13?.chooseDecision?.(player, options);
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
    const analysis = decision.multiwayRangeAnalysis || {};
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
      multiwayAdjustment: decision.multiwayAdjustment || "",
      opponentCount: analysis.opponentCount || 0,
      rangePressure: analysis.rangePressure || 0,
      strongestRange: analysis.strongestRange || 0,
      aggressiveOpponents: analysis.aggressiveOpponents || 0,
      fairPublicRanges: true,
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
        multiwayStrategyVersion: VERSION,
        multiwayRangeAware: true,
        opponentRangeDistribution: true,
        multiwayBluffDiscipline: true,
        multiwayValueSizing: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].multiwayStrategyVersion = VERSION;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    if (window.__aiCharacterStrategyV15Installed) return true;
    if (!window.AiMultiwayRangeModel?.version || !window.AiCharacterStrategiesV13?.version || typeof botAction !== "function") return false;

    const previousBotAction = botAction;
    window.__aiCharacterStrategyV15PreviousBotAction = previousBotAction;
    botAction = function botActionWithMultiwayRanges(player) {
      if (!SUPPORTED_NAMES.includes(player?.name)) return previousBotAction(player);
      try {
        const decision = chooseDecision(player);
        if (!decision || decision.action === "fallback") return previousBotAction(player);
        return executeDecision(player, decision);
      } catch (error) {
        console.warn("AI strategy V1.5 fallback", player?.name, error);
        return previousBotAction(player);
      }
    };
    window.__aiCharacterStrategyV15Installed = true;
    return true;
  }

  function refresh() {
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

  window.AiCharacterStrategiesV15 = {
    version: VERSION,
    supportedNames: [...SUPPORTED_NAMES],
    fairInformationPolicy: Object.freeze({
      ownHoleCardsThroughExistingStrengthProxy: true,
      publicBoard: true,
      publicPlayers: true,
      publicPositions: true,
      publicActions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
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
