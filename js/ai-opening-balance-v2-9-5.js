// AI V2.9.5: recover Toto preflop participation and tighten late-street calls.
(() => {
  "use strict";

  if (window.AiOpeningBalanceV295?.version) return;

  const VERSION = "2.9.5";
  const TARGET_NAMES = Object.freeze(["Toto", "Foxy", "Leo", "Wolf"]);
  const LATE_POSITIONS = Object.freeze(["BTN", "CO", "HJ"]);
  const GUARDS = Object.freeze({
    Toto: Object.freeze({
      openFloor: 0.49,
      callFloor: 0.485,
      facingRaiseCallPremium: 0.035,
      raiseFloor: 0.66,
      reraiseFloor: 0.72,
      lateDiscount: 0.035,
      multiwayStep: 0.005,
      bluffFloor: 1,
      turnPriceEdge: 0.026,
      riverPriceEdge: 0.038,
      turnEvPot: 0.002,
      riverEvPot: 0.008,
      strongValueFloor: 0.56,
      strongValueMargin: 0.09,
      lateMultiwayStep: 0.004,
    }),
    Foxy: Object.freeze({
      openFloor: 0.40,
      callFloor: 0.48,
      facingRaiseCallPremium: 0,
      raiseFloor: 0.54,
      reraiseFloor: 0.66,
      lateDiscount: 0.065,
      multiwayStep: 0.010,
      bluffFloor: 0.40,
      turnPriceEdge: 0.038,
      riverPriceEdge: 0.058,
      turnEvPot: 0.008,
      riverEvPot: 0.018,
      strongValueFloor: 0.58,
      strongValueMargin: 0.10,
      lateMultiwayStep: 0.006,
    }),
    Leo: Object.freeze({
      openFloor: 0.41,
      callFloor: 0.49,
      facingRaiseCallPremium: 0,
      raiseFloor: 0.53,
      reraiseFloor: 0.65,
      lateDiscount: 0.055,
      multiwayStep: 0.011,
      bluffFloor: 0.43,
      turnPriceEdge: 0.045,
      riverPriceEdge: 0.068,
      turnEvPot: 0.010,
      riverEvPot: 0.022,
      strongValueFloor: 0.60,
      strongValueMargin: 0.11,
      lateMultiwayStep: 0.007,
    }),
    Wolf: Object.freeze({
      openFloor: 0.415,
      callFloor: 0.52,
      facingRaiseCallPremium: 0,
      raiseFloor: 0.57,
      reraiseFloor: 0.68,
      lateDiscount: 0.045,
      multiwayStep: 0.012,
      bluffFloor: 0.48,
      turnPriceEdge: 0.060,
      riverPriceEdge: 0.090,
      turnEvPot: 0.018,
      riverEvPot: 0.035,
      strongValueFloor: 0.63,
      strongValueMargin: 0.13,
      lateMultiwayStep: 0.010,
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
      v295Decisions: 0,
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
      totalV295Decisions: 0,
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

    runtimeEvidence.totalV295Decisions += 1;
    role.v295Decisions += 1;
    const adjustment = String(decision.v295Adjustment || "none");
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
    decision.v295Adjustment = adjustment;
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
      guard.callFloor
        + multiwayPremium
        + (facingRaise ? guard.facingRaiseCallPremium : 0)
        - positionDiscount * 0.45,
      context.potOdds + 0.012 + multiwayPremium * 0.35,
    ), 0.2, 0.94);
    const raiseBase = facingReraise
      ? guard.reraiseFloor
      : facingRaise
        ? guard.raiseFloor
        : guard.openFloor;
    const raiseFloor = clamp(
      raiseBase + multiwayPremium - positionDiscount,
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
      v295OpenFloor: round(thresholds.openFloor),
      v295CallFloor: round(thresholds.callFloor),
      v295RaiseFloor: round(thresholds.raiseFloor),
      v295FacingRaise: thresholds.facingRaise,
      v295FacingReraise: thresholds.facingReraise,
      v295ProtectedBluff: thresholds.protectedBluff,
    });

    if (decision.action === "call" && context.needed > 0 && thresholds.equity < thresholds.callFloor) {
      return foldDecision(
        decision,
        thresholds.facingRaise
          ? "V2.9.5 面對翻牌前壓力拒絕弱跟注"
          : "V2.9.5 進池牌力低於角色底線",
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
          player.name === "Toto"
            ? "V2.9.5 Toto 以合理價格保留邊緣進池"
            : "V2.9.5 弱邊緣牌取消高成本加注",
          player.name === "Toto" ? "toto-marginal-entry-rescue" : "opening-raise-to-passive",
        );
      }
      return foldDecision(
        decision,
        thresholds.facingRaise
          ? "V2.9.5 面對加注拒絕低權益再施壓"
          : "V2.9.5 取消牌力不足的主動進池",
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
    const lateStreet = context.street === "turn" || context.street === "river";
    if (!lateStreet) return markDecision(decision);

    const multiwayPremium = Math.max(0, context.opponents - 1) * guard.lateMultiwayStep;
    const priceEdge = context.street === "river"
      ? guard.riverPriceEdge
      : guard.turnPriceEdge;
    const equityFloor = clamp(context.potOdds + priceEdge + multiwayPremium, 0.04, 0.92);
    const evFloor = context.pot * (
      context.street === "river" ? guard.riverEvPot : guard.turnEvPot
    );
    const strongValueFloor = clamp(
      Math.max(guard.strongValueFloor, equityFloor + guard.strongValueMargin),
      0.10,
      0.96,
    );
    const protectedStrongValue = Boolean(decision.valueReady && equity >= strongValueFloor);

    Object.assign(decision, {
      v295PostflopEvFloor: round(evFloor),
      v295PostflopEquityFloor: round(equityFloor),
      v295StrongValueFloor: round(strongValueFloor),
      v295ProtectedStrongValue: protectedStrongValue,
    });

    if (protectedStrongValue) return markDecision(decision);

    if (Number.isFinite(callEv) && callEv < evFloor) {
      return foldDecision(
        decision,
        context.street === "river"
          ? "V2.9.5 河牌停止低報酬支付"
          : "V2.9.5 轉牌停止低報酬追擊",
        `${context.street}-call-ev-discipline`,
      );
    }

    if (equity < equityFloor) {
      return foldDecision(
        decision,
        `V2.9.5 ${context.street === "river" ? "河牌" : "轉牌"}公開牌力不足以支付目前價格`,
        `${context.street}-equity-price-discipline`,
      );
    }

    return markDecision(decision);
  }

  function calibrateDecision(player, decision, options = {}) {
    if (!decision || !TARGET_NAMES.includes(player?.name)) return decision;
    if (decision.action === "fallback") return decision;
    const context = decisionContext(player, options);
    decision.v295Context = {
      street: context.street,
      bigBlind: context.bigBlind,
      needed: context.needed,
      pot: context.pot,
      opponents: context.opponents,
      position: context.position,
    };
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
      v295Adjustment: decision.v295Adjustment || "none",
      v295OpenFloor: decision.v295OpenFloor ?? 0,
      v295CallFloor: decision.v295CallFloor ?? 0,
      v295RaiseFloor: decision.v295RaiseFloor ?? 0,
      v295PostflopEvFloor: decision.v295PostflopEvFloor ?? 0,
      v295PostflopEquityFloor: decision.v295PostflopEquityFloor ?? 0,
      v295ProtectedStrongValue: decision.v295ProtectedStrongValue === true,
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
    if (botAction?.__aiOpeningBalanceV295Wrapper) {
      wrappedBotAction = botAction;
      return true;
    }
    if (!botAction?.__aiOpeningBalanceV294Wrapper) return false;

    const previous = botAction;
    wrappedBotAction = function botActionWithOpeningBalanceV295(player) {
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
        console.warn("AI V2.9.5 opening balance fallback", player?.name, error);
      }
      if (targeted) recordDecision(player, null, { fallback: true });
      return previous.apply(this, arguments);
    };
    wrappedBotAction.__aiOpeningBalanceV295Wrapper = true;
    wrappedBotAction.__previousBotAction = previous;
    botAction = wrappedBotAction;
    return true;
  }

  function ready() {
    return Boolean(
      window.AiOpeningBalanceV294?.version
      && document.documentElement.dataset.aiOpeningBalanceV294 === "ready"
      && typeof botAction === "function"
      && (botAction?.__aiOpeningBalanceV294Wrapper || botAction?.__aiOpeningBalanceV295Wrapper)
    );
  }

  function refresh() {
    registerProfiles();
    const installed = ready() && install();
    document.documentElement.dataset.aiOpeningBalanceV295 = installed ? "ready" : "loading";
    installAttempts += 1;
    if ((installed || installAttempts >= 600) && installTimer) {
      clearInterval(installTimer);
      installTimer = 0;
    }
    return installed;
  }

  window.AiOpeningBalanceV295 = Object.freeze({
    version: VERSION,
    targetNames: [...TARGET_NAMES],
    guards: GUARDS,
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    calibrateDecision,
    resetRuntimeEvidence,
    runtimeEvidence: runtimeEvidenceSnapshot,
    refresh,
  });

  document.documentElement.dataset.aiOpeningBalanceV295 = "loading";
  setTimeout(() => {
    if (!refresh() && !installTimer) installTimer = setInterval(refresh, 25);
  }, 900);
})();
