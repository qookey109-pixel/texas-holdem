// AI V2.9.2: evidence-calibrated Boss call discipline and opening-roster defense.
(() => {
  "use strict";
  if (window.AiTierStrategyV292?.version) return;

  const VERSION = "2.9.2";
  const CALIBRATED_OPENING = Object.freeze(["Pao", "Shark"]);
  const SPECIAL = Object.freeze(["Oracle", "Chronos"]);
  const NEGATIVE_EV_BIG_BLIND_FRACTION = 0.04;
  const OPENING_GUARDS = Object.freeze({
    Pao: Object.freeze({
      openFloor: 0.46,
      raiseFloor: 0.52,
      reraiseFloor: 0.58,
      stackRisk: 0.18,
      priceEdge: 0.005,
      multiwayStep: 0.008,
      riverBuffer: 0.004,
    }),
    Shark: Object.freeze({
      openFloor: 0.48,
      raiseFloor: 0.55,
      reraiseFloor: 0.62,
      stackRisk: 0.16,
      priceEdge: 0.012,
      multiwayStep: 0.01,
      riverBuffer: 0.007,
    }),
  });
  let wrappedBotAction = null;
  let timer = 0;
  let attempts = 0;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function liveStreet() {
    const count = state?.board?.length || 0;
    return count >= 5 ? "river" : count === 4 ? "turn" : count >= 3 ? "flop" : "preflop";
  }

  function liveBigBlind() {
    return Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 20);
  }

  function liveNeeded(player) {
    return Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
  }

  function liveOpponents(player) {
    return Math.max(1, (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded && !candidate.eliminated
    )).length);
  }

  function contextFor(player, options = {}) {
    const bigBlind = Math.max(1, Number(options.bigBlind) || liveBigBlind());
    const needed = Math.max(0, Number.isFinite(Number(options.needed)) ? Number(options.needed) : liveNeeded(player));
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
    const street = options.street || liveStreet();
    const position = options.position || (typeof positionLabel === "function" ? positionLabel(player) : "--");
    return { bigBlind, needed, pot, currentBet, playerBet, stack, opponents, street, position };
  }

  function negativeEvBoundary(bigBlind) {
    return -Math.max(0.01, Math.max(1, Number(bigBlind) || 1) * NEGATIVE_EV_BIG_BLIND_FRACTION);
  }

  function foldDecision(decision, reason, adjustment) {
    Object.assign(decision, {
      action: "fold",
      raiseBy: 0,
      sizeFraction: 0,
      bluffing: false,
      reason,
      strategyVersion: VERSION,
      decisionChainVersion: VERSION,
      v292Adjustment: adjustment,
      publicInformationOnly: true,
    });
    return decision;
  }

  function markDecision(decision, adjustment = "none") {
    decision.strategyVersion = VERSION;
    decision.decisionChainVersion = VERSION;
    decision.v292Adjustment = adjustment;
    decision.publicInformationOnly = true;
    return decision;
  }

  function calibrateOpeningDecision(player, decision, options = {}) {
    if (!decision || !CALIBRATED_OPENING.includes(player?.name)) return decision;
    const guard = OPENING_GUARDS[player.name];
    const context = contextFor(player, options);
    const equity = clamp(decision.equityProxy ?? decision.equity);
    const potOdds = clamp(decision.potOdds ?? (context.needed / Math.max(1, context.pot + context.needed)));
    const callEv = Number(decision.callEv);
    const hasCallEv = Number.isFinite(callEv);
    const pressureBb = context.needed / context.bigBlind;
    const stackRisk = context.needed / context.stack;
    const facingRaise = context.street === "preflop"
      && (context.currentBet >= context.bigBlind * 2.5 || pressureBb >= 4);
    const facingReraise = context.street === "preflop"
      && (pressureBb >= 8
        || stackRisk >= guard.stackRisk
        || (facingRaise
          && context.playerBet > context.bigBlind
          && context.currentBet >= Math.max(context.bigBlind * 5, context.playerBet * 1.8)));
    const absoluteFloor = facingReraise
      ? guard.reraiseFloor
      : facingRaise
        ? guard.raiseFloor
        : guard.openFloor;
    const multiwayPremium = Math.max(0, context.opponents - 1) * guard.multiwayStep;
    const priceFloor = potOdds + guard.priceEdge + multiwayPremium * 0.6;
    const requiredEquity = clamp(Math.max(absoluteFloor + multiwayPremium, priceFloor), 0.08, 0.92);
    const telemetryBoundary = negativeEvBoundary(context.bigBlind);

    decision.v292RequiredEquity = round(requiredEquity);
    decision.v292FacingRaise = facingRaise;
    decision.v292FacingReraise = facingReraise;
    decision.v292StackRisk = round(stackRisk);
    decision.v292NegativeEvBoundary = round(telemetryBoundary);

    if (decision.action !== "call" || context.needed <= 0) return markDecision(decision);

    if (hasCallEv && callEv < telemetryBoundary) {
      return foldDecision(decision, "V2.9.2 初階實證閘停止負期望跟注", "opening-negative-ev-guard");
    }

    if (context.street === "preflop" && equity < requiredEquity) {
      return foldDecision(
        decision,
        facingReraise
          ? "V2.9.2 初階面對高壓再加注提高防守門檻"
          : facingRaise
            ? "V2.9.2 初階面對加注收緊跟注範圍"
            : "V2.9.2 初階翻牌前牌力低於實證底線",
        facingReraise ? "opening-reraise-discipline" : facingRaise ? "opening-raise-discipline" : "opening-range-floor",
      );
    }

    if ((context.street === "turn" || context.street === "river") && hasCallEv && callEv < 0) {
      return foldDecision(
        decision,
        context.street === "river"
          ? "V2.9.2 初階河牌停止負期望支付"
          : "V2.9.2 初階轉牌停止負期望追擊",
        context.street === "river" ? "opening-river-negative-ev-stop" : "opening-turn-negative-ev-stop",
      );
    }

    if (
      context.street === "river"
      && !decision.valueReady
      && hasCallEv
      && callEv < context.pot * guard.riverBuffer
    ) {
      return foldDecision(decision, "V2.9.2 初階河牌要求正期望安全邊際", "opening-river-discipline");
    }

    return markDecision(decision);
  }

  function calibrateBossDecision(player, decision, options = {}) {
    if (!decision || !SPECIAL.includes(player?.name)) return decision;
    const context = contextFor(player, options);
    const callEv = Number(decision.callEv);
    const telemetryBoundary = negativeEvBoundary(context.bigBlind);
    decision.v292NegativeEvBoundary = round(telemetryBoundary);

    if (
      decision.action === "call"
      && context.needed > 0
      && Number.isFinite(callEv)
      && callEv < telemetryBoundary
    ) {
      return foldDecision(
        decision,
        "V2.9.2 Boss 實證閘拒絕遙測定義的負 EV 跟注",
        "boss-negative-ev-discipline",
      );
    }

    return markDecision(decision);
  }

  function perform(player, decision) {
    const targets = window.AiTierStrategyV28?.targetRatings || {};
    const target = targets[player?.name] || {};
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyVersion: VERSION,
      decisionChainVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      raiseBy: Number(decision.raiseBy) || 0,
      sizeFraction: Number(decision.sizeFraction) || 0,
      tier: decision.tier || target.tier || "",
      targetScore10: Number(target.score10) || Number(decision.targetScore10) || 0,
      equityProxy: decision.equityProxy ?? decision.equity ?? 0,
      potOdds: decision.potOdds ?? 0,
      callEv: Number(decision.callEv) || 0,
      v28Adjustment: decision.v28Adjustment || "",
      v292Adjustment: decision.v292Adjustment || "",
      v292RequiredEquity: decision.v292RequiredEquity ?? 0,
      v292NegativeEvBoundary: decision.v292NegativeEvBoundary ?? 0,
      v292StackRisk: decision.v292StackRisk ?? 0,
      publicInformationOnly: true,
    };
    if (decision.equityResult) player.lastStrategyDecision.bossEquity = { ...decision.equityResult };

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
      say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
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
      if (!entity || entity.isHuman || (!CALIBRATED_OPENING.includes(entity.name) && !SPECIAL.includes(entity.name))) continue;
      entity.aiTierCalibrationVersion = VERSION;
      entity.publicInformationOnly = true;
      if (SPECIAL.includes(entity.name)) {
        delete entity.omniscient;
        entity.fairPlay = true;
        entity.rangeInference = true;
      }
    }
    return true;
  }

  function install() {
    if (typeof botAction !== "function") return false;
    if (wrappedBotAction === botAction) return true;
    const previous = botAction;
    wrappedBotAction = function botActionWithEvidenceCalibrationV292(player) {
      try {
        const api = window.AiTierStrategyV28;
        if (CALIBRATED_OPENING.includes(player?.name)) {
          const decision = api?.chooseOpeningDecision?.(player);
          if (decision && decision.action !== "fallback") return perform(player, calibrateOpeningDecision(player, decision));
        }
        if (SPECIAL.includes(player?.name)) {
          const decision = api?.chooseBossDecision?.(player);
          if (decision && decision.action !== "fallback") return perform(player, calibrateBossDecision(player, decision));
        }
      } catch (error) {
        console.warn("AI V2.9.2 evidence calibration fallback", player?.name, error);
      }
      return previous.apply(this, arguments);
    };
    wrappedBotAction.__aiTierStrategyV292Wrapper = true;
    wrappedBotAction.__previousBotAction = previous;
    botAction = wrappedBotAction;
    return true;
  }

  function ready() {
    return Boolean(
      window.AiTierStrategyV28?.version
      && document.documentElement.dataset.aiTierStrategyV28 === "ready"
      && typeof botAction === "function"
    );
  }

  function refresh() {
    registerProfiles();
    const installed = ready() && install();
    document.documentElement.dataset.aiTierStrategyV292 = installed ? "ready" : "loading";
    attempts += 1;
    if ((installed || attempts >= 360) && timer) {
      clearInterval(timer);
      timer = 0;
    }
    return installed;
  }

  window.AiTierStrategyV292 = Object.freeze({
    version: VERSION,
    calibratedOpeningNames: [...CALIBRATED_OPENING],
    specialNames: [...SPECIAL],
    openingGuards: OPENING_GUARDS,
    negativeEvBigBlindFraction: NEGATIVE_EV_BIG_BLIND_FRACTION,
    evidence: Object.freeze({
      sourceRunId: 31072973185,
      completedHands: 25_000,
      shards: 50,
      heroProfiles: 5,
      promotionThreshold: 0.03,
      oracleNegativeEvCallRate: 0.033685,
      chronosNegativeEvCallRate: 0.033784,
      paoVpIp: 0.825,
      paoBb100: -192.98,
      sharkVpIp: 0.658,
      sharkBb100: -139.24,
    }),
    fairInformationPolicy: window.AiTierStrategyV28?.fairInformationPolicy || Object.freeze({
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    calibrateOpeningDecision,
    calibrateBossDecision,
    refresh,
  });

  registerProfiles();
  document.documentElement.dataset.aiTierStrategyV292 = "loading";
  // V2.8 installs after the bounded V2.7 refreshes. Wait until V2.8 is stable,
  // then capture it lexically so no mutable legacy wrapper can form a cycle.
  setTimeout(() => {
    if (!refresh() && !timer) timer = setInterval(refresh, 25);
  }, 680);
})();
