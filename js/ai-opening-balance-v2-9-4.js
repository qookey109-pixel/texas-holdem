// AI V2.9.4: evidence-backed opening balance and late-street call discipline.
(() => {
  "use strict";

  if (window.AiOpeningBalanceV294?.version) return;

  const VERSION = "2.9.4";
  const TARGET_NAMES = Object.freeze(["Toto", "Foxy", "Leo", "Wolf"]);
  const LATE_POSITIONS = Object.freeze(["BTN", "CO", "HJ"]);
  const GUARDS = Object.freeze({
    Toto: Object.freeze({
      openFloor: 0.49,
      callFloor: 0.54,
      raiseFloor: 0.66,
      reraiseFloor: 0.72,
      lateDiscount: 0.025,
      multiwayStep: 0.012,
      priceEdge: 0.012,
      bluffFloor: 1,
      turnEvPot: -0.004,
      riverEvPot: 0.002,
    }),
    Foxy: Object.freeze({
      openFloor: 0.43,
      callFloor: 0.50,
      raiseFloor: 0.56,
      reraiseFloor: 0.67,
      lateDiscount: 0.065,
      multiwayStep: 0.011,
      priceEdge: 0.018,
      bluffFloor: 0.40,
      turnEvPot: 0,
      riverEvPot: 0.007,
    }),
    Leo: Object.freeze({
      openFloor: 0.44,
      callFloor: 0.51,
      raiseFloor: 0.55,
      reraiseFloor: 0.66,
      lateDiscount: 0.055,
      multiwayStep: 0.012,
      priceEdge: 0.016,
      bluffFloor: 0.43,
      turnEvPot: 0.002,
      riverEvPot: 0.009,
    }),
    Wolf: Object.freeze({
      openFloor: 0.47,
      callFloor: 0.55,
      raiseFloor: 0.60,
      reraiseFloor: 0.70,
      lateDiscount: 0.04,
      multiwayStep: 0.014,
      priceEdge: 0.02,
      bluffFloor: 0.48,
      turnEvPot: 0.004,
      riverEvPot: 0.012,
    }),
  });
  const FAIR_INFORMATION_POLICY = Object.freeze({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    publicBetSizes: true,
    publicStacks: true,
    publicPosition: true,
    hiddenOpponentCards: false,
    opponentCardInspection: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });

  let wrappedBotAction = null;
  let installTimer = 0;
  let installAttempts = 0;
  let runtimeEvidence = createRuntimeEvidence();

  function createRoleEvidence() {
    return {
      targetedDecisions: 0,
      v294Decisions: 0,
      adjustedDecisions: 0,
      fallbackDecisions: 0,
      publicInformationFailures: 0,
      adjustments: {},
    };
  }

  function createRuntimeEvidence() {
    return {
      version: VERSION,
      observerActive: true,
      totalTargetedDecisions: 0,
      totalV294Decisions: 0,
      totalAdjustedDecisions: 0,
      fallbackDecisions: 0,
      publicInformationFailures: 0,
      roles: Object.fromEntries(TARGET_NAMES.map(name => [name, createRoleEvidence()])),
    };
  }

  function resetRuntimeEvidence() {
    runtimeEvidence = createRuntimeEvidence();
    return runtimeEvidenceSnapshot();
  }

  function runtimeEvidenceSnapshot() {
    return JSON.parse(JSON.stringify(runtimeEvidence));
  }

  function recordDecision(player, decision, { fallback = false } = {}) {
    const name = player?.name;
    if (!TARGET_NAMES.includes(name)) return;
    const role = runtimeEvidence.roles[name];
    runtimeEvidence.totalTargetedDecisions += 1;
    role.targetedDecisions += 1;

    if (fallback || decision?.strategyVersion !== VERSION) {
      runtimeEvidence.fallbackDecisions += 1;
      role.fallbackDecisions += 1;
      return;
    }

    runtimeEvidence.totalV294Decisions += 1;
    role.v294Decisions += 1;
    const adjustment = String(decision.v294Adjustment || "none");
    if (adjustment !== "none") {
      runtimeEvidence.totalAdjustedDecisions += 1;
      role.adjustedDecisions += 1;
      role.adjustments[adjustment] = (role.adjustments[adjustment] || 0) + 1;
    }
    if (decision.publicInformationOnly !== true) {
      runtimeEvidence.publicInformationFailures += 1;
      role.publicInformationFailures += 1;
    }
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function streetFromState() {
    const count = state?.board?.length || 0;
    return count >= 5 ? "river" : count === 4 ? "turn" : count >= 3 ? "flop" : "preflop";
  }

  function liveOpponents(player) {
    return Math.max(1, (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded && !candidate.eliminated
    )).length);
  }

  function decisionContext(player, options = {}) {
    const bigBlind = Math.max(1, Number(options.bigBlind)
      || (typeof currentBigBlind === "function" ? currentBigBlind() : 20));
    const needed = Math.max(0, Number.isFinite(Number(options.needed))
      ? Number(options.needed)
      : (typeof amountToCall === "function" ? amountToCall(player) : 0));
    const pot = Math.max(1, Number(options.pot) || Number(state?.pot) || 1);
    const currentBet = Math.max(0, Number.isFinite(Number(options.currentBet))
      ? Number(options.currentBet)
      : Number(state?.currentBet) || 0);
    const playerBet = Math.max(0, Number.isFinite(Number(options.playerBet))
      ? Number(options.playerBet)
      : Number(player?.bet) || 0);
    const stack = Math.max(1, Number.isFinite(Number(options.stack))
      ? Number(options.stack)
      : Number(player?.stack) || 1);
    const opponents = Math.max(1, Number(options.opponents) || liveOpponents(player));
    const position = options.position
      || (typeof positionLabel === "function" ? positionLabel(player) : "--");
    return {
      street: options.street || streetFromState(),
      bigBlind,
      needed,
      pot,
      currentBet,
      playerBet,
      stack,
      opponents,
      position,
      potOdds: needed / Math.max(1, pot + needed),
      stackRisk: needed / stack,
    };
  }

  function markDecision(decision, adjustment = "none") {
    decision.strategyVersion = VERSION;
    decision.decisionChainVersion = VERSION;
    decision.v294Adjustment = adjustment;
    decision.publicInformationOnly = true;
    return decision;
  }

  function foldDecision(decision, reason, adjustment) {
    Object.assign(decision, {
      action: "fold",
      raiseBy: 0,
      sizeFraction: 0,
      bluffing: false,
      reason,
    });
    return markDecision(decision, adjustment);
  }

  function passiveDecision(decision, context, reason, adjustment) {
    Object.assign(decision, {
      action: context.needed > 0 ? "call" : "check",
      raiseBy: 0,
      sizeFraction: 0,
      bluffing: false,
      reason,
    });
    return markDecision(decision, adjustment);
  }

  function preflopThresholds(player, decision, context) {
    const guard = GUARDS[player.name];
    const late = LATE_POSITIONS.includes(context.position);
    const multiwayPremium = Math.max(0, context.opponents - 1) * guard.multiwayStep;
    const facingRaise = context.currentBet >= context.bigBlind * 2.5
      || context.needed >= context.bigBlind * 2;
    const facingReraise = context.needed >= context.bigBlind * 6
      || context.stackRisk >= 0.17
      || (facingRaise
        && context.playerBet > context.bigBlind
        && context.currentBet >= Math.max(context.bigBlind * 5, context.playerBet * 1.8));
    const positionDiscount = late && !facingRaise ? guard.lateDiscount : 0;
    const openFloor = clamp(guard.openFloor + multiwayPremium - positionDiscount, 0.2, 0.9);
    const callFloor = clamp(Math.max(
      guard.callFloor + multiwayPremium - positionDiscount * 0.45,
      context.potOdds + guard.priceEdge + multiwayPremium * 0.4,
    ), 0.2, 0.94);
    const raiseFloor = clamp(
      (facingReraise ? guard.reraiseFloor : facingRaise ? guard.raiseFloor : openFloor)
      + multiwayPremium
      - positionDiscount,
      0.2,
      0.96,
    );
    const equity = clamp(decision.equityProxy ?? decision.equity, 0.001, 0.999);
    const protectedBluff = Boolean(
      decision.bluffing
      && late
      && !facingRaise
      && context.needed <= context.bigBlind
      && equity >= guard.bluffFloor
      && context.opponents <= 4,
    );
    return {
      equity,
      late,
      facingRaise,
      facingReraise,
      openFloor,
      callFloor,
      raiseFloor,
      protectedBluff,
    };
  }

  function calibratePreflop(player, decision, context) {
    const thresholds = preflopThresholds(player, decision, context);
    Object.assign(decision, {
      v294OpenFloor: round(thresholds.openFloor),
      v294CallFloor: round(thresholds.callFloor),
      v294RaiseFloor: round(thresholds.raiseFloor),
      v294FacingRaise: thresholds.facingRaise,
      v294FacingReraise: thresholds.facingReraise,
      v294ProtectedBluff: thresholds.protectedBluff,
    });

    if (decision.action === "call" && context.needed > 0 && thresholds.equity < thresholds.callFloor) {
      return foldDecision(
        decision,
        thresholds.facingRaise
          ? "V2.9.4 面對翻牌前壓力收緊弱跟注"
          : "V2.9.4 初階進池牌力低於角色底線",
        thresholds.facingReraise
          ? "opening-reraise-fold"
          : thresholds.facingRaise
            ? "opening-raise-fold"
            : "opening-call-floor",
      );
    }

    if (decision.action === "raise" && thresholds.equity < thresholds.raiseFloor && !thresholds.protectedBluff) {
      if (context.needed <= context.bigBlind && thresholds.equity >= thresholds.callFloor) {
        return passiveDecision(
          decision,
          context,
          "V2.9.4 弱邊緣牌取消高成本加注",
          "opening-raise-to-passive",
        );
      }
      return foldDecision(
        decision,
        thresholds.facingRaise
          ? "V2.9.4 面對加注拒絕低權益再施壓"
          : "V2.9.4 取消牌力不足的主動進池",
        thresholds.facingRaise ? "opening-weak-reraise-fold" : "opening-weak-open-fold",
      );
    }

    return markDecision(decision);
  }

  function calibratePostflop(player, decision, context) {
    if (decision.action !== "call" || context.needed <= 0) return markDecision(decision);
    const guard = GUARDS[player.name];
    const equity = clamp(decision.equityProxy ?? decision.equity, 0.001, 0.999);
    const callEv = Number(decision.callEv);
    const streetBuffer = context.street === "river"
      ? context.pot * guard.riverEvPot
      : context.street === "turn"
        ? context.pot * guard.turnEvPot
        : -context.bigBlind * (player.name === "Toto" ? 0.05 : 0.025);
    const equityFloor = clamp(context.potOdds + guard.priceEdge * (
      context.street === "river" ? 1.15 : context.street === "turn" ? 0.75 : 0.35
    ), 0.04, 0.92);
    decision.v294PostflopEvFloor = round(streetBuffer);
    decision.v294PostflopEquityFloor = round(equityFloor);

    if (Number.isFinite(callEv) && callEv < streetBuffer && !decision.valueReady) {
      return foldDecision(
        decision,
        context.street === "river"
          ? "V2.9.4 河牌停止低品質支付"
          : context.street === "turn"
            ? "V2.9.4 轉牌停止負期望追擊"
            : "V2.9.4 翻牌控制明顯負期望跟注",
        `${context.street}-call-ev-discipline`,
      );
    }

    if (!Number.isFinite(callEv) && equity < equityFloor && !decision.valueReady) {
      return foldDecision(
        decision,
        "V2.9.4 公開牌力不足以支付目前價格",
        `${context.street}-equity-price-discipline`,
      );
    }

    return markDecision(decision);
  }

  function calibrateDecision(player, decision, options = {}) {
    if (!decision || !TARGET_NAMES.includes(player?.name)) return decision;
    if (decision.action === "fallback") return decision;
    const context = decisionContext(player, options);
    Object.assign(decision, {
      v294Context: {
        street: context.street,
        bigBlind: context.bigBlind,
        needed: context.needed,
        pot: context.pot,
        opponents: context.opponents,
        position: context.position,
      },
    });
    return context.street === "preflop"
      ? calibratePreflop(player, decision, context)
      : calibratePostflop(player, decision, context);
  }

  function perform(player, decision) {
    const target = window.AiTierStrategyV28?.targetRatings?.[player?.name] || {};
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyVersion: VERSION,
      decisionChainVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      raiseBy: Number(decision.raiseBy) || 0,
      sizeFraction: Number(decision.sizeFraction) || 0,
      tier: "opening",
      targetScore10: Number(target.score10) || Number(decision.targetScore10) || 0,
      equityProxy: decision.equityProxy ?? decision.equity ?? 0,
      potOdds: decision.potOdds ?? 0,
      callEv: Number(decision.callEv) || 0,
      v294Adjustment: decision.v294Adjustment || "none",
      v294OpenFloor: decision.v294OpenFloor ?? 0,
      v294CallFloor: decision.v294CallFloor ?? 0,
      v294RaiseFloor: decision.v294RaiseFloor ?? 0,
      v294PostflopEvFloor: decision.v294PostflopEvFloor ?? 0,
      publicInformationOnly: true,
    };

    if (decision.action === "fold") {
      Object.assign(player, {
        folded: true,
        hasActed: true,
        raiseLocked: false,
        status: "棄牌",
        lastAction: "fold",
      });
      if (!state.isMuted) Audio.fold();
      logAction(player, "Fold");
      announceAction("FOLD", "fold");
      say(player, "fold", { chance: 0.22 });
      return;
    }

    if (decision.action === "raise" && Number(decision.raiseBy) > 0) {
      raisePlayer(player, decision.raiseBy);
      if (!state.isMuted) Audio.raise();
      logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
      announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
      say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.4 });
      return;
    }

    const paid = pay(player, Math.max(0, amountToCall(player)));
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

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const entity of [...AI_ROSTER, ...(state?.players || [])]) {
      if (!entity || entity.isHuman || !TARGET_NAMES.includes(entity.name)) continue;
      entity.aiOpeningBalanceVersion = VERSION;
      entity.publicInformationOnly = true;
    }
    return true;
  }

  function install() {
    if (typeof botAction !== "function") return false;
    if (wrappedBotAction === botAction) return true;
    const previous = botAction;
    wrappedBotAction = function botActionWithOpeningBalanceV294(player) {
      const targeted = TARGET_NAMES.includes(player?.name);
      try {
        if (targeted) {
          const source = window.AiTierStrategyV28?.chooseOpeningDecision?.(player);
          if (source && source.action !== "fallback") {
            const decision = calibrateDecision(player, source);
            recordDecision(player, decision);
            return perform(player, decision);
          }
        }
      } catch (error) {
        console.warn("AI V2.9.4 opening balance fallback", player?.name, error);
      }
      if (targeted) recordDecision(player, null, { fallback: true });
      return previous.apply(this, arguments);
    };
    wrappedBotAction.__aiOpeningBalanceV294Wrapper = true;
    wrappedBotAction.__previousBotAction = previous;
    botAction = wrappedBotAction;
    return true;
  }

  function ready() {
    return Boolean(
      window.AiTierStrategyV28?.version
      && window.AiTierStrategyV292?.version
      && document.documentElement.dataset.aiTierStrategyV292 === "ready"
      && typeof botAction === "function"
    );
  }

  function refresh() {
    registerProfiles();
    const installed = ready() && install();
    document.documentElement.dataset.aiOpeningBalanceV294 = installed ? "ready" : "loading";
    installAttempts += 1;
    if ((installed || installAttempts >= 360) && installTimer) {
      clearInterval(installTimer);
      installTimer = 0;
    }
    return installed;
  }

  window.AiOpeningBalanceV294 = Object.freeze({
    version: VERSION,
    targetNames: [...TARGET_NAMES],
    guards: GUARDS,
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    calibrateDecision,
    resetRuntimeEvidence,
    runtimeEvidence: runtimeEvidenceSnapshot,
    refresh,
  });

  document.documentElement.dataset.aiOpeningBalanceV294 = "loading";
  setTimeout(() => {
    if (!refresh() && !installTimer) installTimer = setInterval(refresh, 25);
  }, 760);
})();
