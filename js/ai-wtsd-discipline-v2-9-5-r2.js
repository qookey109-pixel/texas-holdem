// AI V2.9.5 recovery R2: tighten surviving late-street calls for Foxy, Leo and Wolf
// while making the smallest Wolf-only preflop participation recovery needed by the
// formal 25,000-hand gate. All inputs remain public-information-only.
(() => {
  "use strict";

  if (window.AiWtsdDisciplineV295R2?.version) return;

  const VERSION = "2.9.5-r2";
  const TARGETS = Object.freeze({
    Foxy: Object.freeze({
      turnPriceEdge: 0.15,
      riverPriceEdge: 0.22,
      turnEvPot: 0.04,
      riverEvPot: 0.08,
      strongValueFloor: 0.73,
      strongValueMargin: 0.19,
      marginalValuePremium: 0.045,
      multiwayStep: 0.014,
    }),
    Leo: Object.freeze({
      turnPriceEdge: 0.17,
      riverPriceEdge: 0.25,
      turnEvPot: 0.055,
      riverEvPot: 0.095,
      strongValueFloor: 0.76,
      strongValueMargin: 0.22,
      marginalValuePremium: 0.055,
      multiwayStep: 0.016,
    }),
    Wolf: Object.freeze({
      turnPriceEdge: 0.22,
      riverPriceEdge: 0.34,
      turnEvPot: 0.085,
      riverEvPot: 0.14,
      strongValueFloor: 0.80,
      strongValueMargin: 0.27,
      marginalValuePremium: 0.080,
      multiwayStep: 0.020,
    }),
  });
  const WOLF_PREFLOP = Object.freeze({
    openFloor: 0.425,
    callFloor: 0.515,
    raiseFloor: 0.57,
    reraiseFloor: 0.68,
    lateDiscount: 0.045,
    multiwayStep: 0.012,
  });
  const LATE_POSITIONS = Object.freeze(["BTN", "CO", "HJ"]);
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

  let installTimer = 0;
  let attempts = 0;
  let tierApi = null;
  let originalOpeningApi = null;
  let wrappedBotAction = null;
  let lateEvidence = createLateEvidence();
  let wolfEvidence = createWolfEvidence();

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function currentStreet() {
    const count = state?.board?.length || 0;
    return count >= 5 ? "river" : count === 4 ? "turn" : count >= 3 ? "flop" : "preflop";
  }

  function liveOpponents(player) {
    return Math.max(1, (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded && !candidate.eliminated
    )).length);
  }

  function createLateRoleEvidence() {
    return {
      inspectedCalls: 0,
      disciplinedFolds: 0,
      protectedStrongValue: 0,
      equityPriceFolds: 0,
      callEvFolds: 0,
    };
  }

  function createLateEvidence() {
    return {
      version: VERSION,
      inspectedCalls: 0,
      disciplinedFolds: 0,
      roles: Object.fromEntries(Object.keys(TARGETS).map(name => [name, createLateRoleEvidence()])),
    };
  }

  function createWolfEvidence() {
    return {
      targetedDecisions: 0,
      v295Decisions: 0,
      adjustedDecisions: 0,
      fallbackDecisions: 0,
      publicInformationFailures: 0,
      adjustments: {},
    };
  }

  function tightenLateDecision(player, source) {
    const guard = TARGETS[player?.name];
    if (!guard || !source || source.action !== "call") return source;

    const street = currentStreet();
    if (street !== "turn" && street !== "river") return source;

    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    if (needed <= 0) return source;

    const pot = Math.max(1, Number(state?.pot) || 1);
    const opponents = liveOpponents(player);
    const potOdds = needed / Math.max(1, pot + needed);
    const equity = clamp(source.equityProxy ?? source.equity, 0.001, 0.999);
    const callEv = Number(source.callEv);
    const priceEdge = street === "river" ? guard.riverPriceEdge : guard.turnPriceEdge;
    const evPot = street === "river" ? guard.riverEvPot : guard.turnEvPot;
    const multiwayPremium = Math.max(0, opponents - 1) * guard.multiwayStep;
    const baseEquityFloor = clamp(potOdds + priceEdge + multiwayPremium, 0.05, 0.95);
    const marginalValuePremium = source.valueReady ? guard.marginalValuePremium : 0;
    const equityFloor = clamp(baseEquityFloor + marginalValuePremium, 0.05, 0.95);
    const evFloor = pot * evPot;
    const strongValueFloor = clamp(
      Math.max(guard.strongValueFloor, baseEquityFloor + guard.strongValueMargin),
      0.10,
      0.98,
    );
    const protectedStrongValue = Boolean(source.valueReady && equity >= strongValueFloor);
    const roleEvidence = lateEvidence.roles[player.name];

    lateEvidence.inspectedCalls += 1;
    roleEvidence.inspectedCalls += 1;

    if (protectedStrongValue) {
      roleEvidence.protectedStrongValue += 1;
      return {
        ...source,
        v295R2EquityFloor: equityFloor,
        v295R2EvFloor: evFloor,
        v295R2StrongValueFloor: strongValueFloor,
        v295R2ProtectedStrongValue: true,
        publicInformationOnly: true,
      };
    }

    const callEvFailed = Number.isFinite(callEv) && callEv < evFloor;
    const equityFailed = equity < equityFloor;
    if (!callEvFailed && !equityFailed) {
      return {
        ...source,
        v295R2EquityFloor: equityFloor,
        v295R2EvFloor: evFloor,
        v295R2StrongValueFloor: strongValueFloor,
        v295R2ProtectedStrongValue: false,
        publicInformationOnly: true,
      };
    }

    lateEvidence.disciplinedFolds += 1;
    roleEvidence.disciplinedFolds += 1;
    if (callEvFailed) roleEvidence.callEvFolds += 1;
    else roleEvidence.equityPriceFolds += 1;

    return {
      ...source,
      action: "fold",
      raiseBy: 0,
      sizeFraction: 0,
      bluffing: false,
      reason: street === "river"
        ? "V2.9.5 R2 河牌收緊邊緣攤牌支付"
        : "V2.9.5 R2 轉牌收緊低報酬追擊",
      v295R2Adjustment: callEvFailed
        ? `${street}-call-ev-discipline-r2`
        : `${street}-equity-price-discipline-r2`,
      v295R2EquityFloor: equityFloor,
      v295R2EvFloor: evFloor,
      v295R2StrongValueFloor: strongValueFloor,
      v295R2ProtectedStrongValue: false,
      publicInformationOnly: true,
    };
  }

  function wolfContext(player, options = {}) {
    const bigBlind = Math.max(1, Number(options.bigBlind)
      || (typeof currentBigBlind === "function" ? currentBigBlind() : 20));
    const needed = Math.max(0, Number.isFinite(Number(options.needed))
      ? Number(options.needed)
      : (typeof amountToCall === "function" ? amountToCall(player) : 0));
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
      street: options.street || currentStreet(),
      bigBlind,
      needed,
      currentBet,
      playerBet,
      stack,
      opponents,
      position,
      potOdds: needed / Math.max(1, (Number(options.pot) || Number(state?.pot) || 1) + needed),
      stackRisk: needed / stack,
    };
  }

  function calibrateWolfPreflopDecision(player, source, options = {}) {
    if (player?.name !== "Wolf" || !source || (options.street || currentStreet()) !== "preflop") return source;

    const context = wolfContext(player, { ...options, street: "preflop" });
    const late = LATE_POSITIONS.includes(context.position);
    const multiwayPremium = Math.max(0, context.opponents - 1) * WOLF_PREFLOP.multiwayStep;
    const facingRaise = context.currentBet >= context.bigBlind * 2.5
      || context.needed >= context.bigBlind * 2;
    const facingReraise = context.needed >= context.bigBlind * 6
      || context.stackRisk >= 0.17
      || (facingRaise
        && context.playerBet > context.bigBlind
        && context.currentBet >= Math.max(context.bigBlind * 5, context.playerBet * 1.8));
    const positionDiscount = late && !facingRaise ? WOLF_PREFLOP.lateDiscount : 0;
    const openFloor = clamp(WOLF_PREFLOP.openFloor + multiwayPremium - positionDiscount, 0.2, 0.9);
    const callFloor = clamp(Math.max(
      WOLF_PREFLOP.callFloor + multiwayPremium - positionDiscount * 0.45,
      context.potOdds + 0.012 + multiwayPremium * 0.35,
    ), 0.2, 0.94);
    const raiseBase = facingReraise
      ? WOLF_PREFLOP.reraiseFloor
      : facingRaise
        ? WOLF_PREFLOP.raiseFloor
        : WOLF_PREFLOP.openFloor;
    const raiseFloor = clamp(raiseBase + multiwayPremium - positionDiscount, 0.2, 0.96);
    const equity = clamp(source.equityProxy ?? source.equity, 0.001, 0.999);
    const decision = { ...source };

    Object.assign(decision, {
      strategyVersion: "2.9.5",
      decisionChainVersion: "2.9.5",
      v295OpenFloor: openFloor,
      v295CallFloor: callFloor,
      v295RaiseFloor: raiseFloor,
      v295FacingRaise: facingRaise,
      v295FacingReraise: facingReraise,
      v295R2WolfEntryRecovery: true,
      publicInformationOnly: true,
    });

    if (decision.action === "call" && context.needed > 0 && equity < callFloor) {
      Object.assign(decision, {
        action: "fold",
        raiseBy: 0,
        sizeFraction: 0,
        bluffing: false,
        reason: "V2.9.5 R2 Wolf 仍拒絕低於微調後底線的翻牌前跟注",
        v295Adjustment: facingReraise
          ? "opening-reraise-fold"
          : facingRaise
            ? "opening-raise-fold"
            : "opening-call-floor",
      });
      return decision;
    }

    if (decision.action === "raise" && equity < raiseFloor) {
      if (context.needed <= context.bigBlind && equity >= callFloor) {
        Object.assign(decision, {
          action: context.needed > 0 ? "call" : "check",
          raiseBy: 0,
          sizeFraction: 0,
          bluffing: false,
          reason: "V2.9.5 R2 Wolf 以小幅放寬的公開牌力底線保留邊緣進池",
          v295Adjustment: "wolf-marginal-entry-recovery-r2",
        });
        return decision;
      }
      Object.assign(decision, {
        action: "fold",
        raiseBy: 0,
        sizeFraction: 0,
        bluffing: false,
        reason: "V2.9.5 R2 Wolf 取消牌力不足的高成本主動進池",
        v295Adjustment: facingRaise ? "opening-weak-reraise-fold" : "opening-weak-open-fold",
      });
      return decision;
    }

    decision.v295Adjustment ||= "none";
    return decision;
  }

  function performWolf(player, decision) {
    const target = window.AiTierStrategyV28?.targetRatings?.[player?.name] || {};
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyVersion: "2.9.5",
      decisionChainVersion: "2.9.5",
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
      v295R2WolfEntryRecovery: decision.v295R2WolfEntryRecovery === true,
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

  function recordWolfDecision(decision) {
    wolfEvidence.targetedDecisions += 1;
    wolfEvidence.v295Decisions += 1;
    if (decision?.publicInformationOnly !== true) wolfEvidence.publicInformationFailures += 1;
    const adjustment = String(decision?.v295Adjustment || "none");
    if (adjustment !== "none") {
      wolfEvidence.adjustedDecisions += 1;
      wolfEvidence.adjustments[adjustment] = (wolfEvidence.adjustments[adjustment] || 0) + 1;
    }
  }

  function mergedOpeningEvidence() {
    const base = originalOpeningApi?.runtimeEvidence?.() || {
      version: "2.9.5",
      observerActive: true,
      totalTargetedDecisions: 0,
      totalV295Decisions: 0,
      totalAdjustedDecisions: 0,
      fallbackDecisions: 0,
      publicInformationFailures: 0,
      roles: {},
    };
    const baseWolf = base.roles?.Wolf || createWolfEvidence();
    const mergedWolf = {
      targetedDecisions: (baseWolf.targetedDecisions || 0) + wolfEvidence.targetedDecisions,
      v295Decisions: (baseWolf.v295Decisions || 0) + wolfEvidence.v295Decisions,
      adjustedDecisions: (baseWolf.adjustedDecisions || 0) + wolfEvidence.adjustedDecisions,
      fallbackDecisions: (baseWolf.fallbackDecisions || 0) + wolfEvidence.fallbackDecisions,
      publicInformationFailures: (baseWolf.publicInformationFailures || 0) + wolfEvidence.publicInformationFailures,
      adjustments: { ...(baseWolf.adjustments || {}) },
    };
    for (const [key, value] of Object.entries(wolfEvidence.adjustments)) {
      mergedWolf.adjustments[key] = (mergedWolf.adjustments[key] || 0) + value;
    }
    return {
      ...base,
      totalTargetedDecisions: (base.totalTargetedDecisions || 0) + wolfEvidence.targetedDecisions,
      totalV295Decisions: (base.totalV295Decisions || 0) + wolfEvidence.v295Decisions,
      totalAdjustedDecisions: (base.totalAdjustedDecisions || 0) + wolfEvidence.adjustedDecisions,
      fallbackDecisions: (base.fallbackDecisions || 0) + wolfEvidence.fallbackDecisions,
      publicInformationFailures: (base.publicInformationFailures || 0) + wolfEvidence.publicInformationFailures,
      roles: { ...(base.roles || {}), Wolf: mergedWolf },
    };
  }

  function installTierWrapper() {
    const current = window.AiTierStrategyV28;
    if (!current?.version || typeof current.chooseOpeningDecision !== "function") return false;
    if (!current.__aiWtsdDisciplineV295R1) return false;
    if (current.__aiWtsdDisciplineV295R2) {
      tierApi = current;
      return true;
    }

    const previousChoose = current.chooseOpeningDecision.bind(current);
    tierApi = Object.freeze({
      ...current,
      __aiWtsdDisciplineV295R2: true,
      __previousAiTierStrategyV28R2: current,
      chooseOpeningDecision(player) {
        return tightenLateDecision(player, previousChoose(player));
      },
    });
    window.AiTierStrategyV28 = tierApi;
    return true;
  }

  function installOpeningWrapper() {
    if (typeof botAction !== "function") return false;
    if (botAction.__aiWtsdDisciplineV295R2Wrapper) {
      wrappedBotAction = botAction;
      return true;
    }
    if (!botAction.__aiOpeningBalanceV295Wrapper || !window.AiOpeningBalanceV295?.version) return false;

    originalOpeningApi ||= window.AiOpeningBalanceV295;
    const previous = botAction;
    wrappedBotAction = function botActionWithWtsdDisciplineV295R2(player) {
      if (player?.name !== "Wolf") return previous.apply(this, arguments);
      try {
        const source = window.AiTierStrategyV28?.chooseOpeningDecision?.(player);
        if (!source || source.action === "fallback") return previous.apply(this, arguments);
        const decision = currentStreet() === "preflop"
          ? calibrateWolfPreflopDecision(player, source)
          : originalOpeningApi.calibrateDecision(player, source);
        recordWolfDecision(decision);
        return performWolf(player, decision);
      } catch (error) {
        console.warn("AI V2.9.5 R2 Wolf fallback", error);
        return previous.apply(this, arguments);
      }
    };
    wrappedBotAction.__aiOpeningBalanceV295Wrapper = true;
    wrappedBotAction.__aiWtsdDisciplineV295R2Wrapper = true;
    // Preserve the existing compatibility check that V2.9.5 directly exposes
    // the V2.9.4 wrapper as its predecessor.
    wrappedBotAction.__previousBotAction = previous.__previousBotAction || previous;
    wrappedBotAction.__previousV295BotAction = previous;
    botAction = wrappedBotAction;

    const originalApi = originalOpeningApi;
    window.AiOpeningBalanceV295 = Object.freeze({
      ...originalApi,
      __aiWtsdDisciplineV295R2: true,
      r2WolfPreflopGuard: WOLF_PREFLOP,
      resetRuntimeEvidence() {
        const result = originalApi.resetRuntimeEvidence?.();
        wolfEvidence = createWolfEvidence();
        return result;
      },
      runtimeEvidence: mergedOpeningEvidence,
    });
    return true;
  }

  function refresh() {
    const tierInstalled = installTierWrapper();
    const openingInstalled = tierInstalled && installOpeningWrapper();
    const installed = tierInstalled && openingInstalled;
    document.documentElement.dataset.aiWtsdDisciplineV295R2 = installed ? "ready" : "loading";
    attempts += 1;
    if ((installed || attempts >= 600) && installTimer) {
      clearInterval(installTimer);
      installTimer = 0;
    }
    return installed;
  }

  window.AiWtsdDisciplineV295R2 = Object.freeze({
    version: VERSION,
    targetNames: Object.keys(TARGETS),
    guards: TARGETS,
    wolfPreflopGuard: WOLF_PREFLOP,
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    tightenLateDecision,
    calibrateWolfPreflopDecision,
    refresh,
    resetEvidence() {
      lateEvidence = createLateEvidence();
      wolfEvidence = createWolfEvidence();
      return { late: JSON.parse(JSON.stringify(lateEvidence)), wolf: JSON.parse(JSON.stringify(wolfEvidence)) };
    },
    evidence() {
      return { late: JSON.parse(JSON.stringify(lateEvidence)), wolf: JSON.parse(JSON.stringify(wolfEvidence)) };
    },
  });

  document.documentElement.dataset.aiWtsdDisciplineV295R2 = "loading";
  setTimeout(() => {
    if (!refresh() && !installTimer) installTimer = setInterval(refresh, 25);
  }, 1_250);
})();
