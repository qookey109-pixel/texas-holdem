// AI V2.9.2: evidence-driven calibration for Boss negative-EV calls and opening-tier overcalling.
(() => {
  "use strict";

  if (window.AiEvidenceCalibrationV292?.version) return;

  const VERSION = "2.9.2";
  const OPENING_NAMES = Object.freeze(["Pao", "Shark"]);
  const BOSS_NAMES = Object.freeze(["Oracle", "Chronos"]);
  const NEGATIVE_EV_BIG_BLIND_FRACTION = 0.04;
  const PREFLOP_FLOORS = Object.freeze({
    Pao: Object.freeze({ base: 0.46, raised: 0.52, heavy: 0.58, risk: 0.18 }),
    Shark: Object.freeze({ base: 0.48, raised: 0.55, heavy: 0.62, risk: 0.16 }),
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

  function streetKey(boardCount = 0) {
    const count = Math.max(0, Number(boardCount) || 0);
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function negativeEvThreshold(bigBlind) {
    return -Math.max(0.01, Math.max(1, Number(bigBlind) || 1) * NEGATIVE_EV_BIG_BLIND_FRACTION);
  }

  function openingPreflopFloor(name, needed, bigBlind, stack) {
    const config = PREFLOP_FLOORS[name];
    if (!config) return 0;
    const blind = Math.max(1, Number(bigBlind) || 1);
    const call = Math.max(0, Number(needed) || 0);
    const remainingStack = Math.max(1, Number(stack) || 1);
    const pressureBb = call / blind;
    const riskFraction = call / remainingStack;
    if (pressureBb >= 8 || riskFraction >= config.risk) return config.heavy;
    if (pressureBb >= 4) return config.raised;
    return config.base;
  }

  function evaluateBossCalibration(input = {}) {
    const name = String(input.name || "");
    const action = String(input.action || "").toLowerCase();
    const needed = Math.max(0, Number(input.needed) || 0);
    const callEv = Number(input.callEv);
    const threshold = negativeEvThreshold(input.bigBlind);
    const fold = BOSS_NAMES.includes(name)
      && action === "call"
      && needed > 0
      && Number.isFinite(callEv)
      && callEv < threshold;
    return Object.freeze({
      fold,
      code: fold ? "boss-negative-ev-call-stop" : "",
      reason: fold ? "V2.9.2 Boss 實證負 EV 跟注停損" : "",
      threshold: round(threshold),
    });
  }

  function evaluateOpeningCalibration(input = {}) {
    const name = String(input.name || "");
    const action = String(input.action || "").toLowerCase();
    const needed = Math.max(0, Number(input.needed) || 0);
    const bigBlind = Math.max(1, Number(input.bigBlind) || 1);
    const callEv = Number(input.callEv);
    const equity = clamp(input.equityProxy, 0, 1);
    const street = String(input.street || "preflop").toLowerCase();
    const threshold = negativeEvThreshold(bigBlind);

    if (!OPENING_NAMES.includes(name) || action !== "call" || needed <= 0) {
      return Object.freeze({ fold: false, code: "", reason: "", threshold: round(threshold), floor: 0 });
    }

    if (Number.isFinite(callEv) && callEv < threshold) {
      const lateStreet = street === "turn" || street === "river";
      return Object.freeze({
        fold: true,
        code: lateStreet ? "opening-late-street-negative-ev-stop" : "opening-negative-ev-call-stop",
        reason: lateStreet
          ? "V2.9.2 初階轉河牌負 EV 停損"
          : "V2.9.2 初階停止實證負 EV 跟注",
        threshold: round(threshold),
        floor: 0,
      });
    }

    if (street === "preflop") {
      const floor = openingPreflopFloor(name, needed, bigBlind, input.stack);
      if (equity < floor) {
        return Object.freeze({
          fold: true,
          code: "opening-preflop-absolute-floor",
          reason: `V2.9.2 ${name} 翻牌前絕對牌力底線`,
          threshold: round(threshold),
          floor: round(floor),
        });
      }
      return Object.freeze({ fold: false, code: "", reason: "", threshold: round(threshold), floor: round(floor) });
    }

    return Object.freeze({ fold: false, code: "", reason: "", threshold: round(threshold), floor: 0 });
  }

  function applyCalibration(player, decision) {
    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 1);
    const boardCount = typeof state !== "undefined" ? state?.board?.length || 0 : 0;
    const street = streetKey(boardCount);
    const base = { ...decision };
    let result = null;

    if (BOSS_NAMES.includes(player?.name)) {
      result = evaluateBossCalibration({
        name: player.name,
        action: base.action,
        needed,
        bigBlind,
        callEv: base.callEv,
      });
    } else if (OPENING_NAMES.includes(player?.name)) {
      result = evaluateOpeningCalibration({
        name: player.name,
        action: base.action,
        needed,
        bigBlind,
        stack: player.stack,
        street,
        equityProxy: base.equityProxy,
        callEv: base.callEv,
      });
    }

    if (result?.fold) {
      Object.assign(base, {
        action: "fold",
        raiseBy: 0,
        sizeFraction: 0,
        bluffing: false,
        reason: result.reason,
        v292Adjustment: result.code,
        v292Threshold: result.threshold,
        v292Floor: result.floor || 0,
      });
    }

    base.strategyVersion = VERSION;
    base.decisionChainVersion = VERSION;
    base.publicInformationOnly = true;
    return base;
  }

  function perform(player, decision) {
    player.status = "Thinking...";
    const target = window.AiTierStrategyV28?.targetRatings?.[player.name] || {};
    player.lastStrategyDecision = {
      strategyVersion: VERSION,
      decisionChainVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      raiseBy: Number(decision.raiseBy) || 0,
      sizeFraction: Number(decision.sizeFraction) || 0,
      tier: decision.tier || target.tier || "",
      targetScore10: Number(decision.targetScore10 ?? target.score10) || 0,
      equityProxy: Number(decision.equityProxy ?? decision.equity) || 0,
      potOdds: Number(decision.potOdds) || 0,
      callEv: Number(decision.callEv) || 0,
      v292Adjustment: decision.v292Adjustment || "",
      v292Threshold: Number(decision.v292Threshold) || 0,
      v292Floor: Number(decision.v292Floor) || 0,
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

  function install() {
    if (typeof botAction !== "function") return false;
    if (wrappedBotAction === botAction) return true;
    const previous = botAction;
    wrappedBotAction = function botActionWithEvidenceCalibrationV292(player) {
      try {
        const api = window.AiTierStrategyV28;
        if (OPENING_NAMES.includes(player?.name)) {
          const decision = api?.chooseOpeningDecision?.(player);
          if (decision && decision.action !== "fallback") return perform(player, applyCalibration(player, decision));
        }
        if (BOSS_NAMES.includes(player?.name)) {
          const decision = api?.chooseBossDecision?.(player);
          if (decision && decision.action !== "fallback") return perform(player, applyCalibration(player, decision));
        }
      } catch (error) {
        console.warn("AI V2.9.2 evidence calibration fallback", player?.name, error);
      }
      return previous.apply(this, arguments);
    };
    wrappedBotAction.__aiEvidenceCalibrationV292Wrapper = true;
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
    const installed = ready() && install();
    document.documentElement.dataset.aiEvidenceCalibrationV292 = installed ? "ready" : "loading";
    attempts += 1;
    if ((installed || attempts >= 360) && timer) {
      clearInterval(timer);
      timer = 0;
    }
    return installed;
  }

  window.AiEvidenceCalibrationV292 = Object.freeze({
    version: VERSION,
    sourceEvidence: Object.freeze({
      completedHands: 25_000,
      shards: 50,
      heroProfiles: 5,
      oracleNegativeEvCallRate: 0.033685,
      chronosNegativeEvCallRate: 0.033784,
      promotionThreshold: 0.03,
    }),
    openingNames: [...OPENING_NAMES],
    bossNames: [...BOSS_NAMES],
    negativeEvBigBlindFraction: NEGATIVE_EV_BIG_BLIND_FRACTION,
    preflopFloors: PREFLOP_FLOORS,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicBetSizes: true,
      publicStacks: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    evaluateBossCalibration,
    evaluateOpeningCalibration,
    applyCalibration,
    refresh,
  });

  document.documentElement.dataset.aiEvidenceCalibrationV292 = "loading";
  setTimeout(() => {
    if (!refresh() && !timer) timer = setInterval(refresh, 25);
  }, 700);
})();
