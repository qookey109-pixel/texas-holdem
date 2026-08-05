// AI V2.4: integrate public combo-range weights into elite decisions.
(() => {
  "use strict";

  if (window.AiRangeDecisionIntegrationV24?.version) return;

  const VERSION = "2.4.0";
  const ELITE_NAMES = Object.freeze(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const CHARACTER_CONFIG = Object.freeze({
    Nova: Object.freeze({ defense: 0.48, bluffCatch: 0.12, bluffDiscipline: 0.58, cappedPressure: 0.34 }),
    "Unit-9": Object.freeze({ defense: 0.62, bluffCatch: 0.16, bluffDiscipline: 0.72, cappedPressure: 0.28 }),
    Merlin: Object.freeze({ defense: 0.54, bluffCatch: 0.13, bluffDiscipline: 0.64, cappedPressure: 0.3 }),
    Vlad: Object.freeze({ defense: 0.58, bluffCatch: 0.18, bluffDiscipline: 0.66, cappedPressure: 0.38 }),
  });

  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function currentStreet() {
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function publicCardSnapshot(card) {
    return card ? { value: Number(card.value) || 0, suit: String(card.suit || "") } : null;
  }

  function publicOpponentSnapshot(candidate) {
    if (!candidate) return null;
    return {
      name: String(candidate.name || ""),
      isHuman: Boolean(candidate.isHuman),
      bet: Math.max(0, Number(candidate.bet) || 0),
      stack: Math.max(0, Number(candidate.stack) || 0),
      lastAction: String(candidate.lastAction || ""),
      positionLabel: String(candidate.positionLabel || (
        typeof positionLabel === "function" ? positionLabel(candidate) : "--"
      ) || "--"),
    };
  }

  function activePublicOpponents(player, options = {}) {
    const source = Array.isArray(options.publicOpponents)
      ? options.publicOpponents
      : (state?.players || []).filter(candidate => candidate && candidate !== player && !candidate.folded);
    return source.map(publicOpponentSnapshot).filter(candidate => candidate?.name);
  }

  function diagnosticFor(actor, street, options = {}) {
    if (options.rangeDiagnostic) return options.rangeDiagnostic;
    try {
      return window.AiRangeHistoryFilterV1?.analyzeActor?.(actor, {
        history: options.history || null,
        street,
      }) || null;
    } catch (_) {
      return null;
    }
  }

  function publicPressureScore(candidate, street, options = {}) {
    const diagnostic = diagnosticFor(candidate.name, street, options) || {};
    const actionPressure = ["raise", "allin", "allin-raise"].some(value => candidate.lastAction.includes(value)) ? 0.18 : 0;
    return (
      (candidate.isHuman ? 0.22 : 0)
      + candidate.bet * 0.0001
      + actionPressure
      + clamp(diagnostic.rangeStrength, 0, 1) * 0.28
      + clamp(diagnostic.confidence, 0, 1) * 0.12
      + Math.max(0, Number(diagnostic.aggressiveActions) || 0) * 0.035
    );
  }

  function selectPrimaryOpponent(player, decision = {}, options = {}) {
    if (options.targetActor) return publicOpponentSnapshot(options.targetActor);
    const opponents = activePublicOpponents(player, options);
    if (!opponents.length) return null;
    const hero = opponents.find(candidate => candidate.isHuman);
    if (hero) return hero;
    const street = decision.context?.street || currentStreet();
    return opponents.sort((left, right) => (
      publicPressureScore(right, street, options) - publicPressureScore(left, street, options)
    ))[0];
  }

  function rangeProfile(player, decision = {}, options = {}) {
    const target = selectPrimaryOpponent(player, decision, options);
    if (!target) return null;
    const context = decision.context || {};
    const street = context.street || currentStreet();
    const diagnostic = diagnosticFor(target.name, street, options) || {
      actor: target.name,
      targetStreet: street,
      positionLabel: target.positionLabel,
      rangeWidth: 1,
      rangeStrength: 0.48,
      nutDensity: 0.055,
      valueDensity: 0.13,
      bluffDensity: 0.18,
      confidence: 0.08,
      aggressiveActions: 0,
      calls: 0,
      publicInformationOnly: true,
      decisionIntegrated: false,
      events: [],
    };

    let weighted = options.weightedRange || null;
    if (!weighted) {
      try {
        weighted = window.AiRangeWeightV1?.analyze?.(target.name, {
          ownCards: (player?.cards || []).map(publicCardSnapshot).filter(Boolean),
          board: (state?.board || []).map(publicCardSnapshot).filter(Boolean),
          street,
          positionLabel: target.positionLabel,
          history: options.history || null,
          rangeDiagnostic: diagnostic,
          topN: 12,
        }) || null;
      } catch (_) {
        weighted = null;
      }
    }

    if (!weighted) return null;
    return {
      target,
      street,
      diagnostic,
      weighted,
      publicInformationOnly: true,
    };
  }

  function rangeSignals(profile) {
    const diagnostic = profile?.diagnostic || {};
    const weighted = profile?.weighted || {};
    const confidence = clamp(diagnostic.confidence ?? 0.08, 0.05, 0.985);
    const width = clamp(diagnostic.rangeWidth ?? weighted.rangeWidth ?? 1, 0.01, 1);
    const weightedStrength = clamp(weighted.weightedPreflopStrength ?? diagnostic.rangeStrength ?? 0.48, 0.04, 0.99);
    const diagnosticStrength = clamp(diagnostic.rangeStrength ?? weightedStrength, 0.12, 0.99);
    const combinedStrength = weightedStrength * 0.62 + diagnosticStrength * 0.38;
    const narrowness = 1 - width;
    const nutDensity = clamp(diagnostic.nutDensity ?? 0.055, 0, 0.8);
    const bluffDensity = clamp(diagnostic.bluffDensity ?? 0.18, 0, 0.48);
    const aggressiveActions = Math.max(0, Number(diagnostic.aggressiveActions) || 0);
    const calls = Math.max(0, Number(diagnostic.calls) || 0);

    const strengthPressure = (combinedStrength - 0.48)
      * (0.35 + confidence * 0.65)
      * (0.72 + narrowness * 0.28);
    const nutPressure = Math.max(0, nutDensity - 0.055) * confidence * 0.72;
    const aggressionPressure = Math.min(0.055, aggressiveActions * 0.018 * confidence);
    const rangePressure = clamp(strengthPressure + nutPressure + aggressionPressure, -0.1, 0.22);
    const bluffSignal = clamp(bluffDensity * confidence, 0, 0.42);
    const cappedSignal = clamp(
      Math.max(0, 0.5 - combinedStrength) * 0.68
      + width * 0.1
      + calls * 0.022
      - aggressiveActions * 0.03,
      0,
      0.24,
    );

    return {
      confidence: round(confidence),
      rangeWidth: round(width),
      weightedStrength: round(weightedStrength),
      diagnosticStrength: round(diagnosticStrength),
      combinedStrength: round(combinedStrength),
      nutDensity: round(nutDensity),
      bluffDensity: round(bluffDensity),
      aggressiveActions,
      calls,
      rangePressure: round(rangePressure),
      bluffSignal: round(bluffSignal),
      cappedSignal: round(cappedSignal),
    };
  }

  function bestCandidate(decision) {
    return [...(decision?.candidates || [])]
      .filter(candidate => Number(candidate?.raiseBy) > 0)
      .sort((left, right) => Number(right.ev) - Number(left.ev))[0] || null;
  }

  function applyRangeDecision(player, decision, profile) {
    if (!decision || decision.action === "fallback" || !profile) return decision;
    const config = CHARACTER_CONFIG[player?.name];
    if (!config) return decision;

    const context = decision.context || {};
    const signals = rangeSignals(profile);
    const originalAction = decision.action;
    const originalCallScore = Number(decision.callScore) || 0;
    const originalRaiseScore = Number(decision.raiseScore) || 0;
    const needed = Math.max(0, Number(context.needed) || 0);
    const potOdds = clamp(context.potOdds, 0, 1);
    const equityProxy = clamp(context.equityProxy ?? decision.equityProxy, 0, 1);
    const drawPotential = clamp(context.drawPotential, 0, 1);
    const valueReady = Boolean(decision.valueReady);
    const bluffing = Boolean(decision.bluffing || decision.blockerBluff);

    const callAdjustment = clamp(
      -signals.rangePressure * config.defense
      + signals.bluffSignal * config.bluffCatch
      + signals.cappedSignal * 0.055,
      -0.16,
      0.08,
    );
    let raiseAdjustment = 0;
    if (valueReady) {
      raiseAdjustment = Math.max(0, signals.rangePressure) * 0.035;
    } else if (bluffing) {
      raiseAdjustment = -Math.max(0, signals.rangePressure) * config.bluffDiscipline
        + signals.cappedSignal * config.cappedPressure;
    } else {
      raiseAdjustment = -Math.max(0, signals.rangePressure) * 0.18
        + signals.cappedSignal * 0.05;
    }
    raiseAdjustment = clamp(raiseAdjustment, -0.17, 0.09);

    decision.callScore = originalCallScore + callAdjustment;
    decision.raiseScore = originalRaiseScore + raiseAdjustment;

    if (
      needed > 0
      && !valueReady
      && decision.callScore < -0.035
      && !(drawPotential >= 0.12 && decision.callScore >= -0.085)
    ) {
      decision.action = "fold";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依公開加權範圍放棄負期望邊緣跟注`;
      decision.rangeAdjustment = "tighten-marginal-call";
      decision.bluffing = false;
    } else if (
      originalAction === "raise"
      && bluffing
      && !valueReady
      && decision.raiseScore <= Math.max(decision.callScore, 0.045)
    ) {
      decision.action = needed > 0 && decision.callScore < -0.035 ? "fold" : "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 面對強加權範圍取消低成功率詐唬`;
      decision.rangeAdjustment = "suppress-range-bluff";
      decision.bluffing = false;
    } else if (
      originalAction === "fold"
      && needed > 0
      && decision.callScore >= 0.025
      && equityProxy >= potOdds + 0.025
      && (signals.rangePressure <= 0.025 || signals.bluffSignal >= 0.11)
    ) {
      decision.action = "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依公開範圍中的詐唬密度執行 Bluff Catch`;
      decision.rangeAdjustment = "range-bluff-catch";
    } else if (
      decision.action === "call"
      && needed === 0
      && valueReady
      && context.canRaise
      && decision.raiseScore > Math.max(decision.callScore, 0.075)
    ) {
      const candidate = bestCandidate(decision);
      if (candidate) {
        decision.action = "raise";
        decision.raiseBy = Number(candidate.raiseBy) || 0;
        decision.sizeFraction = Number(candidate.fraction) || 0;
        decision.reason = `${player.name} 對可持續的公開範圍採取價值下注`;
        decision.rangeAdjustment = "range-value-capture";
      }
    }

    decision.rangeDecisionIntegrated = true;
    decision.rangeDecisionVersion = VERSION;
    decision.rangeTarget = profile.target?.name || "";
    decision.rangeTargetStreet = profile.street;
    decision.rangeWeightVersion = profile.weighted?.version || "";
    decision.rangeHistoryVersion = profile.diagnostic?.version || "";
    decision.rangeSignals = signals;
    decision.rangeScoreAdjustments = {
      call: round(callAdjustment),
      raise: round(raiseAdjustment),
      originalCallScore: round(originalCallScore),
      originalRaiseScore: round(originalRaiseScore),
      adjustedCallScore: round(decision.callScore),
      adjustedRaiseScore: round(decision.raiseScore),
    };
    decision.publicInformationOnly = true;
    return decision;
  }

  function enhanceDecision(player, decision, options = {}) {
    if (!ELITE_NAMES.includes(player?.name)) return decision;
    const profile = rangeProfile(player, decision, options);
    return applyRangeDecision(player, decision, profile);
  }

  function chooseDecision(player, options = {}) {
    if (!ELITE_NAMES.includes(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    const baseDecision = options.baseDecision
      || window.AiCharacterStrategiesV15?.chooseDecision?.(player, options);
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

  function performCall(player) {
    const needed = Math.max(0, amountToCall(player));
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
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: 0.2 });
  }

  function executeDecision(player, decision) {
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyId: decision.strategyId || player.strategyId || "",
      strategyVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      street: decision.context?.street || currentStreet(),
      raiseBy: decision.raiseBy || 0,
      sizeFraction: decision.sizeFraction || 0,
      multiwayAdjustment: decision.multiwayAdjustment || "",
      rangeAdjustment: decision.rangeAdjustment || "",
      rangeTarget: decision.rangeTarget || "",
      rangePressure: decision.rangeSignals?.rangePressure || 0,
      weightedRangeStrength: decision.rangeSignals?.weightedStrength || 0,
      rangeDecisionIntegrated: true,
      fairPublicRanges: true,
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player);
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const name of ELITE_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) Object.assign(profile, {
        rangeDecisionIntegrated: true,
        rangeDecisionVersion: VERSION,
        comboRangeAware: true,
        publicInformationOnly: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].rangeDecisionVersion = VERSION;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    if (window.__aiRangeDecisionV24Installed) return true;
    if (
      !window.AiCharacterStrategiesV15?.version
      || !window.AiRangeWeightV1?.version
      || !window.AiRangeHistoryFilterV1?.version
      || typeof botAction !== "function"
    ) return false;

    const previousBotAction = botAction;
    botAction = function botActionWithRangeWeights(player) {
      if (!ELITE_NAMES.includes(player?.name)) return previousBotAction.apply(this, arguments);
      try {
        const decision = chooseDecision(player);
        if (!decision || decision.action === "fallback") return previousBotAction.apply(this, arguments);
        return executeDecision(player, decision);
      } catch (error) {
        console.warn("AI V2.4 range decision fallback", player?.name, error);
        return previousBotAction.apply(this, arguments);
      }
    };
    window.__aiRangeDecisionV24Installed = true;
    return true;
  }

  function refresh() {
    const profilesReady = registerProfiles();
    const installed = installDecisionLayer();
    if ((profilesReady && installed) || installAttempts >= 240) {
      if (installTimer) window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    document.documentElement.dataset.aiRangeDecision = installed ? "ready" : "loading";
    return profilesReady && installed;
  }

  window.AiRangeDecisionIntegrationV24 = {
    version: VERSION,
    eliteNames: [...ELITE_NAMES],
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActionHistory: true,
      publicPositions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    supports: name => ELITE_NAMES.includes(name),
    selectPrimaryOpponent,
    rangeProfile,
    rangeSignals,
    applyRangeDecision,
    enhanceDecision,
    chooseDecision,
    refresh,
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
