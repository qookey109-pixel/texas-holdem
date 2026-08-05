// AI V2.6: bounded public range intelligence for middle-tier characters.
(() => {
  "use strict";

  if (window.AiMiddleRangeDecisionV26?.version) return;

  const VERSION = "2.6.0";
  const MIDDLE_NAMES = Object.freeze(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const CHARACTER_CONFIG = Object.freeze({
    Ace: Object.freeze({ defense: 0.34, bluffCatch: 0.08, bluffDiscipline: 0.34, cappedPressure: 0.15, minConfidence: 0.3 }),
    Momo: Object.freeze({ defense: 0.26, bluffCatch: 0.11, bluffDiscipline: 0.24, cappedPressure: 0.23, minConfidence: 0.28 }),
    Nori: Object.freeze({ defense: 0.42, bluffCatch: 0.06, bluffDiscipline: 0.38, cappedPressure: 0.12, minConfidence: 0.34 }),
    Bruno: Object.freeze({ defense: 0.36, bluffCatch: 0.05, bluffDiscipline: 0.44, cappedPressure: 0.1, minConfidence: 0.32 }),
    Dodo: Object.freeze({ defense: 0.48, bluffCatch: 0.04, bluffDiscipline: 0.5, cappedPressure: 0.08, minConfidence: 0.38 }),
    Viper: Object.freeze({ defense: 0.32, bluffCatch: 0.1, bluffDiscipline: 0.3, cappedPressure: 0.2, minConfidence: 0.3 }),
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

  function currentStreet(decision = null) {
    if (decision?.context?.street) return String(decision.context.street);
    const count = typeof state === "object" ? (state?.board?.length || 0) : 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function evidenceFor(signals, config) {
    const confidenceEvidence = clamp(
      (Number(signals?.confidence || 0) - config.minConfidence) / Math.max(0.01, 1 - config.minConfidence),
      0,
      1,
    );
    const actionCount = Math.max(0, Number(signals?.aggressiveActions) || 0)
      + Math.max(0, Number(signals?.calls) || 0);
    const actionEvidence = clamp(actionCount / 4, 0, 1) * 0.65;
    return clamp(Math.max(confidenceEvidence, actionEvidence), 0, 1);
  }

  function applyMiddleRangeDecision(player, decision, profile) {
    if (!decision || decision.action === "fallback" || !profile) return decision;
    const config = CHARACTER_CONFIG[player?.name];
    if (!config) return decision;
    if ((profile.street || currentStreet(decision)) === "preflop") return decision;

    const signals = window.AiRangeDecisionIntegrationV24?.rangeSignals?.(profile);
    if (!signals) return decision;
    const evidence = evidenceFor(signals, config);
    if (evidence < 0.18) {
      decision.middleRangeDecisionIntegrated = false;
      decision.middleRangeDecisionVersion = VERSION;
      decision.middleRangeDecisionSkipped = "insufficient-public-sample";
      decision.middleRangeEvidence = round(evidence);
      return decision;
    }

    const originalAction = decision.action;
    const originalCallScore = Number(decision.callScore) || 0;
    const originalRaiseScore = Number(decision.raiseScore) || 0;
    const context = decision.context || {};
    const needed = Math.max(0, Number(context.needed) || 0);
    const potOdds = clamp(context.potOdds, 0, 1);
    const equityProxy = clamp(context.equityProxy ?? decision.equityProxy, 0, 1);
    const drawPotential = clamp(context.drawPotential, 0, 1);
    const valueReady = Boolean(decision.valueReady);
    const bluffing = Boolean(decision.bluffing || decision.blockerBluff);
    const pressureScale = 0.45 + evidence * 0.55;
    const appliedPressure = clamp(Number(signals.rangePressure) * pressureScale, -0.09, 0.21);

    const callAdjustment = clamp(
      -appliedPressure * config.defense
      + Number(signals.bluffSignal) * config.bluffCatch * evidence
      + Number(signals.cappedSignal) * 0.025 * evidence,
      -0.075,
      0.035,
    );

    let raiseAdjustment = 0;
    if (valueReady) {
      raiseAdjustment = Math.max(0, appliedPressure) * 0.012;
    } else if (bluffing) {
      raiseAdjustment = -Math.max(0, appliedPressure) * config.bluffDiscipline
        + Number(signals.cappedSignal) * config.cappedPressure * evidence;
    } else {
      raiseAdjustment = -Math.max(0, appliedPressure) * 0.08
        + Number(signals.cappedSignal) * 0.025 * evidence;
    }
    raiseAdjustment = clamp(raiseAdjustment, -0.085, 0.045);

    decision.callScore = originalCallScore + callAdjustment;
    decision.raiseScore = originalRaiseScore + raiseAdjustment;

    if (
      needed > 0
      && !valueReady
      && decision.callScore < -0.025
      && !(drawPotential >= 0.13 && decision.callScore >= -0.07)
    ) {
      decision.action = "fold";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依公開範圍收緊大額邊緣跟注`;
      decision.rangeAdjustment = "middle-tighten-marginal-call";
      decision.bluffing = false;
    } else if (
      originalAction === "raise"
      && bluffing
      && !valueReady
      && decision.raiseScore <= Math.max(decision.callScore, 0.035)
    ) {
      decision.action = needed > 0 && decision.callScore < -0.025 ? "fold" : "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依公開範圍取消低品質施壓`;
      decision.rangeAdjustment = "middle-suppress-range-bluff";
      decision.bluffing = false;
    } else if (
      originalAction === "fold"
      && needed > 0
      && evidence >= 0.55
      && decision.callScore >= 0.035
      && equityProxy >= potOdds + 0.04
      && (appliedPressure <= -0.015 || Number(signals.bluffSignal) >= 0.16)
    ) {
      decision.action = "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依足夠公開樣本執行保守 Bluff Catch`;
      decision.rangeAdjustment = "middle-range-bluff-catch";
    }

    decision.middleRangeDecisionIntegrated = true;
    decision.middleRangeDecisionVersion = VERSION;
    decision.middleRangeEvidence = round(evidence);
    decision.rangeDecisionIntegrated = true;
    decision.rangeDecisionTier = "middle";
    decision.rangeTarget = profile.target?.name || "";
    decision.rangeTargetStreet = profile.street || currentStreet(decision);
    decision.rangeWeightVersion = profile.weighted?.version || "";
    decision.rangeHistoryVersion = profile.diagnostic?.version || "";
    decision.middleRangeSignals = {
      ...signals,
      evidence: round(evidence),
      appliedPressure: round(appliedPressure),
    };
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
    if (!MIDDLE_NAMES.includes(player?.name)) return decision;
    if (!window.AiRangeDecisionIntegrationV24?.rangeProfile) return decision;
    const profile = options.rangeProfile
      || window.AiRangeDecisionIntegrationV24.rangeProfile(player, decision, options);
    return applyMiddleRangeDecision(player, decision, profile);
  }

  function chooseDecision(player, options = {}) {
    if (!MIDDLE_NAMES.includes(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    const baseDecision = options.baseDecision
      || window.AiCharacterStrategiesV15?.chooseDecision?.(player, options);
    if (!baseDecision) return { action: "fallback", strategyVersion: VERSION };
    return enhanceDecision(player, baseDecision, options);
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const name of MIDDLE_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) Object.assign(profile, {
        boundedRangeAware: true,
        middleRangeDecisionVersion: VERSION,
        publicInformationOnly: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].middleRangeDecisionVersion = VERSION;
      }
    }
    return true;
  }

  function refresh() {
    const dependenciesReady = Boolean(
      window.AiRangeDecisionIntegrationV24?.version
      && window.AiCharacterStrategiesV15?.version
    );
    const profilesReady = registerProfiles();
    const ready = dependenciesReady && profilesReady;
    document.documentElement.dataset.aiMiddleRangeDecision = ready ? "ready" : "loading";
    if ((ready || installAttempts >= 240) && installTimer) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return ready;
  }

  window.AiMiddleRangeDecisionV26 = Object.freeze({
    version: VERSION,
    middleNames: [...MIDDLE_NAMES],
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
    supports: name => MIDDLE_NAMES.includes(name),
    evidenceFor,
    applyMiddleRangeDecision,
    enhanceDecision,
    chooseDecision,
    refresh,
  });

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();