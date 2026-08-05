// AI V2.5 decision-chain bridge: preserve net EV, role calibration, and SPR after board intelligence.
(() => {
  "use strict";

  if (window.AiMidEliteDecisionChainV25?.version) return;

  const VERSION = "2.5.1";
  const MIDDLE_NAMES = Object.freeze(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE_NAMES = Object.freeze(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const SUPPORTED_NAMES = Object.freeze([...MIDDLE_NAMES, ...ELITE_NAMES]);
  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function currentStreet(decision = null) {
    if (decision?.context?.street) return String(decision.context.street);
    const count = typeof state === "object" ? (state?.board?.length || 0) : 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function baseDecisionFor(player, options = {}) {
    if (options.baseDecision) return options.baseDecision;
    if (ELITE_NAMES.includes(player?.name) && window.AiRangeDecisionIntegrationV24?.chooseDecision) {
      return window.AiRangeDecisionIntegrationV24.chooseDecision(player, options);
    }
    return window.AiCharacterStrategiesV15?.chooseDecision?.(player, options) || null;
  }

  function applyNetEv(player, decision) {
    if (!decision || decision.action === "fallback") return decision;
    try {
      return window.AiEvAccountingV1?.repriceStrategyDecision?.(decision) || decision;
    } catch (_) {
      return decision;
    }
  }

  function applyRoleCalibration(player, decision) {
    if (!decision || decision.action === "fallback") return decision;
    try {
      return window.AiRoleStrengthBalanceV1?.calibrateStrategyDecision?.(player, decision) || decision;
    } catch (_) {
      return decision;
    }
  }

  function selectedCandidate(decision) {
    if (decision?.action !== "raise" || !(Number(decision.raiseBy) > 0)) return null;
    const target = Number(decision.raiseBy) || 0;
    return [...(decision.candidates || [])]
      .filter(candidate => Number(candidate?.raiseBy) > 0)
      .sort((left, right) => (
        Math.abs(Number(left.raiseBy) - target) - Math.abs(Number(right.raiseBy) - target)
      ))[0] || null;
  }

  function guardNetEv(decision) {
    if (!decision || decision.action !== "raise" || !decision.evAccountingVersion) return decision;
    const candidate = selectedCandidate(decision);
    if (!candidate || !Number.isFinite(Number(candidate.ev))) return decision;
    const callEv = Number.isFinite(Number(decision.callEv)) ? Number(decision.callEv) : 0;
    if (Number(candidate.ev) > Math.max(0, callEv)) return decision;

    const needed = Math.max(0, Number(decision.context?.needed) || 0);
    decision.action = needed > 0 && callEv < 0 ? "fold" : "call";
    decision.raiseBy = 0;
    decision.sizeFraction = 0;
    decision.reason = needed > 0 && callEv < 0
      ? "V2.5 淨 EV 安全閘停止負期望投入"
      : "V2.5 淨 EV 安全閘保留跟注／過牌線";
    decision.decisionChainAdjustment = "net-ev-guard";
    decision.bluffing = false;
    return decision;
  }

  function publicSprContext(player, decision, options = {}) {
    if (options.sprContext) return options.sprContext;
    try {
      return window.AiEffectiveStackSprV1?.effectiveStackContext?.(player, {
        pot: decision?.context?.pot,
        needed: decision?.context?.needed,
        bigBlind: decision?.context?.bigBlind,
        opponents: options.opponents,
      }) || null;
    } catch (_) {
      return null;
    }
  }

  function applySprGuard(player, decision, options = {}) {
    if (!decision || decision.action === "fallback" || options.skipSpr) return decision;
    const spr = publicSprContext(player, decision, options);
    if (!spr) return decision;

    decision.context = {
      ...(decision.context || {}),
      ...spr,
      spr: Number(spr.effectiveSpr) || Number(decision.context?.spr) || 0,
    };
    decision.effectiveStackSprVersion = window.AiEffectiveStackSprV1?.version || "";

    const equity = clamp(decision.context?.equityProxy ?? decision.equityProxy, 0, 1);
    const draw = clamp(decision.context?.drawPotential, 0, 1);
    const needed = Math.max(0, Number(decision.context?.needed) || 0);
    if (
      spr.sprBand === "deep"
      && decision.action === "raise"
      && !decision.valueReady
      && equity < 0.58
    ) {
      decision.action = "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = "V2.5 深 SPR 保留邊緣牌與聽牌實現率";
      decision.decisionChainAdjustment = "deep-spr-pot-control";
    }
    if (
      spr.sprBand === "shallow"
      && decision.action === "raise"
      && decision.bluffing
      && !decision.valueReady
      && draw < 0.09
    ) {
      decision.action = needed > 0 ? "fold" : "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = "V2.5 淺 SPR 取消低實現率純詐唬";
      decision.decisionChainAdjustment = "shallow-spr-suppress-air";
      decision.bluffing = false;
    }
    return decision;
  }

  function composeDecision(player, options = {}) {
    if (!SUPPORTED_NAMES.includes(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    let decision = baseDecisionFor(player, options);
    if (!decision || decision.action === "fallback") return decision || { action: "fallback", strategyVersion: VERSION };

    decision = applyNetEv(player, decision);
    decision = applyRoleCalibration(player, decision);
    decision = window.AiBoardIntelligenceV25?.applyBoardIntelligence?.(player, decision, options) || decision;
    decision = guardNetEv(decision);
    decision = applySprGuard(player, decision, options);
    decision.decisionChainVersion = VERSION;
    decision.decisionChainIntegrated = true;
    decision.decisionChainOrder = ["range/multiway", "net-ev", "role", "board/blocker", "spr"];
    decision.publicInformationOnly = true;
    return decision;
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
      street: decision.context?.street || currentStreet(decision),
      raiseBy: decision.raiseBy || 0,
      sizeFraction: decision.sizeFraction || 0,
      decisionChainAdjustment: decision.decisionChainAdjustment || "",
      boardAdjustment: decision.boardAdjustment || "",
      boardClass: decision.boardTexture?.className || "",
      blockerQuality: decision.blockerProfile?.bluffQuality || 0,
      rangeAdjustment: decision.rangeAdjustment || "",
      evAccountingVersion: decision.evAccountingVersion || "",
      effectiveStackSprVersion: decision.effectiveStackSprVersion || "",
      roleStrengthRating: decision.roleStrength?.rating || 0,
      decisionChainIntegrated: true,
      aiStrengthStartsAtMiddle: true,
      publicInformationOnly: true,
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player);
  }

  function installDecisionLayer() {
    if (window.__aiMidEliteDecisionChainV25Installed) return true;
    if (
      !window.AiBoardIntelligenceV25?.version
      || !window.AiEvAccountingV1?.version
      || !window.AiEffectiveStackSprV1?.version
      || !window.AiRoleStrengthBalanceV1?.version
      || typeof botAction !== "function"
    ) return false;

    const previousBotAction = botAction;
    botAction = function botActionWithCompleteMidEliteChain(player) {
      if (!SUPPORTED_NAMES.includes(player?.name)) return previousBotAction.apply(this, arguments);
      if ((state?.board?.length || 0) < 3) return previousBotAction.apply(this, arguments);
      try {
        const decision = composeDecision(player);
        if (!decision || decision.action === "fallback") return previousBotAction.apply(this, arguments);
        return executeDecision(player, decision);
      } catch (error) {
        console.warn("AI V2.5 complete decision chain fallback", player?.name, error);
        return previousBotAction.apply(this, arguments);
      }
    };
    window.__aiMidEliteDecisionChainV25Installed = true;
    return true;
  }

  function refresh() {
    const installed = installDecisionLayer();
    if (installed || installAttempts >= 240) {
      if (installTimer) window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    document.documentElement.dataset.aiMidEliteDecisionChain = installed ? "ready" : "loading";
    return installed;
  }

  window.AiMidEliteDecisionChainV25 = Object.freeze({
    version: VERSION,
    middleNames: [...MIDDLE_NAMES],
    eliteNames: [...ELITE_NAMES],
    supportedNames: [...SUPPORTED_NAMES],
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
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
    applyNetEv,
    applyRoleCalibration,
    guardNetEv,
    applySprGuard,
    composeDecision,
    refresh,
  });

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
