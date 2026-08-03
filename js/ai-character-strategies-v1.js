// Independent public-information strategies for middle and elite AI characters.
(() => {
  "use strict";

  if (window.AiCharacterStrategies?.version) return;

  const VERSION = "1.0.0";
  const MIDDLE_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"];
  const ELITE_NAMES = ["Nova", "Unit-9", "Merlin", "Vlad"];
  const SUPPORTED_NAMES = [...MIDDLE_NAMES, ...ELITE_NAMES];
  const POSITION_BONUS = Object.freeze({ BTN: 0.07, CO: 0.055, HJ: 0.035, MP: 0.015, UTG: -0.035, SB: -0.02, BB: 0 });
  const STREET_INDEX = Object.freeze({ preflop: 0, flop: 1, turn: 2, river: 3 });

  const STRATEGIES = Object.freeze({
    Ace: {
      id: "ace-weak-line-sniper",
      title: "弱線狙擊",
      family: "precision",
      valueThreshold: 0.62,
      callMargin: 0.015,
      bluffRate: 0.12,
      aggression: 0.66,
      trapRate: 0.08,
      foldPressure: 0.08,
      sizes: [0.42, 0.62, 0.82],
    },
    Momo: {
      id: "momo-polar-chaos",
      title: "極化亂流",
      family: "polarized",
      valueThreshold: 0.56,
      callMargin: -0.015,
      bluffRate: 0.27,
      aggression: 0.9,
      trapRate: 0.04,
      foldPressure: 0.12,
      sizes: [0.35, 0.75, 1.15],
    },
    Nori: {
      id: "nori-frequency-balance",
      title: "頻率平衡",
      family: "balanced",
      valueThreshold: 0.59,
      callMargin: 0.025,
      bluffRate: 0.16,
      aggression: 0.67,
      trapRate: 0.11,
      foldPressure: 0.05,
      sizes: [0.33, 0.5, 0.75],
    },
    Bruno: {
      id: "bruno-heavy-value",
      title: "厚重價值",
      family: "value",
      valueThreshold: 0.68,
      callMargin: 0.05,
      bluffRate: 0.035,
      aggression: 0.58,
      trapRate: 0.09,
      foldPressure: 0.01,
      sizes: [0.58, 0.82, 1.0],
    },
    Dodo: {
      id: "dodo-pot-control",
      title: "底池控制",
      family: "control",
      valueThreshold: 0.65,
      callMargin: 0.075,
      bluffRate: 0.055,
      aggression: 0.46,
      trapRate: 0.05,
      foldPressure: 0.015,
      sizes: [0.33, 0.46, 0.62],
    },
    Viper: {
      id: "viper-check-raise-trap",
      title: "過牌反加陷阱",
      family: "trap",
      valueThreshold: 0.61,
      callMargin: 0.035,
      bluffRate: 0.15,
      aggression: 0.72,
      trapRate: 0.34,
      foldPressure: 0.06,
      sizes: [0.45, 0.72, 0.95],
    },
    Nova: {
      id: "nova-irregular-pressure",
      title: "非典型壓力",
      family: "irregular",
      valueThreshold: 0.57,
      callMargin: 0.025,
      bluffRate: 0.22,
      aggression: 0.82,
      trapRate: 0.12,
      foldPressure: 0.09,
      sizes: [0.28, 0.66, 1.18],
    },
    "Unit-9": {
      id: "unit9-public-ev",
      title: "公開資訊 EV",
      family: "solver",
      valueThreshold: 0.585,
      callMargin: 0.045,
      bluffRate: 0.13,
      aggression: 0.73,
      trapRate: 0.1,
      foldPressure: 0.055,
      sizes: [0.33, 0.5, 0.75, 1.0],
    },
    Merlin: {
      id: "merlin-delayed-pressure",
      title: "延遲施壓",
      family: "delayed",
      valueThreshold: 0.6,
      callMargin: 0.035,
      bluffRate: 0.2,
      aggression: 0.76,
      trapRate: 0.25,
      foldPressure: 0.07,
      sizes: [0.38, 0.68, 0.92],
    },
    Vlad: {
      id: "vlad-adaptive-exploit",
      title: "玩家習慣剝削",
      family: "exploit",
      valueThreshold: 0.59,
      callMargin: 0.03,
      bluffRate: 0.17,
      aggression: 0.78,
      trapRate: 0.19,
      foldPressure: 0.08,
      sizes: [0.42, 0.7, 1.0],
    },
  });

  const FAIR_INFORMATION_POLICY = Object.freeze({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    publicHeroStatistics: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function roundToChip(value) {
    return Math.max(0, Math.floor((Number(value) || 0) / 10) * 10);
  }

  function cardSnapshot(card) {
    return card ? { value: Number(card.value) || 0, suit: card.suit || "" } : null;
  }

  function streetKey() {
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function heroPublicModel() {
    const hero = (state?.players || []).find(candidate => candidate?.isHuman) || state?.players?.[0] || null;
    const stats = state?.heroStyle || {};
    const sample = Math.max(0, Number(stats.hands) || 0);
    const hands = Math.max(1, sample);
    return {
      sample,
      foldRate: (Number(stats.folds) || 0) / hands,
      callRate: (Number(stats.calls) || 0) / hands,
      raiseRate: (Number(stats.raises) || 0) / hands,
      allInRate: (Number(stats.allIns) || 0) / hands,
      vpipRate: (Number(stats.vpip) || 0) / hands,
      lastAction: hero?.lastAction || "",
      bet: Number(hero?.bet) || 0,
      folded: Boolean(hero?.folded),
    };
  }

  function boardTexture(board = state?.board || []) {
    const cards = Array.isArray(board) ? board : [];
    const suits = new Map();
    const ranks = new Map();
    for (const card of cards) {
      suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
      ranks.set(card.value, (ranks.get(card.value) || 0) + 1);
    }

    const suitCounts = [...suits.values()];
    const rankCounts = [...ranks.values()];
    const uniqueRanks = [...new Set(cards.map(card => Number(card.value) || 0))].sort((a, b) => a - b);
    if (uniqueRanks.includes(14)) uniqueRanks.unshift(1);

    let connectedWindows = 0;
    for (let start = 0; start <= uniqueRanks.length - 3; start += 1) {
      if (uniqueRanks[start + 2] - uniqueRanks[start] <= 4) connectedWindows += 1;
    }

    const paired = rankCounts.some(count => count >= 2);
    const monotone = cards.length >= 3 && suitCounts.some(count => count >= 3);
    const twoTone = cards.length >= 3 && suitCounts.some(count => count === 2);
    const highCards = cards.filter(card => Number(card.value) >= 11).length;
    const wetness = clampValue(
      connectedWindows * 0.16 + (monotone ? 0.35 : 0) + (twoTone ? 0.14 : 0) + (paired ? 0.08 : 0),
      0,
      1,
    );

    return {
      paired,
      monotone,
      twoTone,
      connected: connectedWindows > 0,
      highCards,
      wetness,
      dry: wetness < 0.24,
    };
  }

  function drawPotential(player) {
    if (!player?.cards?.length || (state?.board?.length || 0) < 3 || (state?.board?.length || 0) >= 5) return 0;
    const cards = [...player.cards, ...(state.board || [])];
    const suits = new Map();
    for (const card of cards) suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
    const flushDraw = [...suits.values()].some(count => count === 4);

    const ranks = [...new Set(cards.map(card => Number(card.value) || 0))].sort((a, b) => a - b);
    if (ranks.includes(14)) ranks.unshift(1);
    let straightDraw = 0;
    for (let low = 1; low <= 10; low += 1) {
      const hits = ranks.filter(rank => rank >= low && rank <= low + 4).length;
      if (hits >= 4) straightDraw = Math.max(straightDraw, 0.1);
      else if (hits === 3) straightDraw = Math.max(straightDraw, 0.045);
    }

    return clampValue((flushDraw ? 0.13 : 0) + straightDraw, 0, 0.2);
  }

  function madeHandStrength(player) {
    if (!player?.cards?.length) return 0;
    if ((state?.board?.length || 0) < 3) return clampValue(estimateStrength(player) + 0.035, 0.03, 0.97);

    const result = evaluateBestHand([...player.cards, ...(state.board || [])]);
    const top = Number(result?.tiebreakers?.[0]) || 0;
    const kicker = Number(result?.tiebreakers?.[1]) || 0;
    const categoryBase = [0.2, 0.43, 0.62, 0.71, 0.78, 0.83, 0.9, 0.96, 0.99][Number(result?.score) || 0] || 0.2;
    const kickerBonus = (top / 14) * 0.055 + (kicker / 14) * 0.018;
    return clampValue(categoryBase + kickerBonus, 0.03, 0.995);
  }

  function publicContext(player) {
    const strategy = STRATEGIES[player?.name];
    const hero = heroPublicModel();
    const texture = boardTexture();
    const needed = Math.max(0, amountToCall(player));
    const pot = Math.max(1, Number(state?.pot) || 0);
    const bigBlind = Math.max(1, currentBigBlind());
    const availableRaise = Math.max(0, (Number(player?.stack) || 0) - needed);
    const minimumRaise = Math.max(bigBlind, minimumRaiseBy());
    const normalCap = roundToChip(Math.min(
      availableRaise,
      Math.max(0, (Number(player?.stack) || 0) * (strategy?.family === "polarized" ? 0.72 : 0.56)),
    ));
    const maxRaise = normalCap >= minimumRaise ? normalCap : 0;
    const position = positionLabel(player);
    const baseStrength = madeHandStrength(player);
    const draw = drawPotential(player);
    const activeOpponents = (state?.players || []).filter(candidate => candidate !== player && !candidate?.folded).length;
    const street = streetKey();
    const streetIndex = STREET_INDEX[street];
    const positionBonus = POSITION_BONUS[position] || 0;
    const multiwayPenalty = Math.max(0, activeOpponents - 1) * 0.018;
    const equityProxy = clampValue(baseStrength + draw + positionBonus - multiwayPenalty, 0.02, 0.99);

    return {
      name: player?.name || "",
      strategyId: strategy?.id || "",
      ownCards: (player?.cards || []).map(cardSnapshot).filter(Boolean),
      board: (state?.board || []).map(cardSnapshot).filter(Boolean),
      street,
      streetIndex,
      position,
      needed,
      pot,
      potOdds: needed / Math.max(1, pot + needed),
      bigBlind,
      stack: Number(player?.stack) || 0,
      stackInBigBlinds: (Number(player?.stack) || 0) / bigBlind,
      spr: (Number(player?.stack) || 0) / Math.max(1, pot + needed),
      availableRaise,
      minimumRaise,
      maxRaise,
      canRaise: !player?.raiseLocked && maxRaise >= minimumRaise,
      activeOpponents,
      baseStrength,
      drawPotential: draw,
      equityProxy,
      texture,
      hero,
    };
  }

  function strategyPlan(player, context, random) {
    const strategy = STRATEGIES[player.name];
    const current = player.aiStrategyPlan;
    if (current?.handNumber === state.handNumber && current?.strategyId === strategy.id) return current;

    let line = "control";
    if (context.equityProxy >= strategy.valueThreshold + 0.12) line = "value";
    else if (context.drawPotential >= 0.09) line = "semi-bluff";
    else if (random() < strategy.bluffRate) line = "pressure";

    if (strategy.family === "trap" && line === "value") line = "trap";
    if (strategy.family === "delayed" && context.street === "flop" && line === "pressure") line = "delay";
    if (strategy.family === "value" && line === "pressure") line = "control";

    const plan = {
      handNumber: state.handNumber,
      strategyId: strategy.id,
      line,
      createdStreet: context.street,
      preferredSize: strategy.sizes[Math.floor(random() * strategy.sizes.length)] || strategy.sizes[0],
    };
    player.aiStrategyPlan = plan;
    return plan;
  }

  function styleAdjustments(player, context, strategy, plan, random) {
    let raiseBias = 0;
    let callBias = 0;
    let bluffBonus = 0;
    let trapBonus = 0;
    let sizeBias = 0;

    switch (player.name) {
      case "Ace":
        if (["check", "call"].includes(context.hero.lastAction)) raiseBias += 0.12;
        if (context.hero.sample >= 4 && context.hero.foldRate >= 0.38) bluffBonus += 0.09;
        if (context.texture.dry) raiseBias += 0.045;
        break;
      case "Momo":
        raiseBias += (random() - 0.38) * 0.24;
        bluffBonus += 0.1;
        sizeBias += random() < 0.36 ? 0.3 : 0;
        break;
      case "Nori":
        callBias += 0.025;
        if (Math.abs(context.equityProxy - strategy.valueThreshold) <= 0.07) raiseBias += (random() - 0.5) * 0.08;
        break;
      case "Bruno":
        if (context.equityProxy >= strategy.valueThreshold) raiseBias += 0.12;
        else raiseBias -= 0.11;
        callBias += context.equityProxy >= 0.48 ? 0.05 : 0;
        break;
      case "Dodo":
        callBias += context.needed <= context.pot * 0.35 ? 0.08 : 0;
        raiseBias -= context.texture.wetness * 0.04;
        break;
      case "Viper":
        trapBonus += context.needed === 0 && context.equityProxy >= strategy.valueThreshold ? 0.18 : 0;
        if (context.hero.lastAction === "raise" && context.equityProxy >= 0.66) raiseBias += 0.16;
        break;
      case "Nova":
        raiseBias += context.streetIndex >= 2 ? 0.1 : 0.025;
        sizeBias += random() < 0.45 ? 0.28 : -0.08;
        break;
      case "Unit-9":
        callBias += 0.045;
        raiseBias += context.drawPotential >= 0.09 ? 0.04 : 0;
        break;
      case "Merlin":
        if (context.street === "turn") raiseBias += 0.15;
        if (context.street === "flop" && context.needed === 0) trapBonus += 0.12;
        if (plan.line === "delay" && context.streetIndex >= 2) raiseBias += 0.17;
        break;
      case "Vlad":
        if (context.hero.sample >= 4) {
          if (context.hero.foldRate >= 0.4) bluffBonus += 0.13;
          if (context.hero.callRate >= 0.42 && context.equityProxy >= strategy.valueThreshold) {
            raiseBias += 0.11;
            sizeBias += 0.2;
          }
          if (context.hero.raiseRate >= 0.38 && context.equityProxy < 0.48) callBias -= 0.08;
        }
        break;
      default:
        break;
    }

    return { raiseBias, callBias, bluffBonus, trapBonus, sizeBias };
  }

  function foldEquity(context, strategy, fraction, adjustments) {
    const observedFold = context.hero.sample >= 4 ? context.hero.foldRate : 0.31;
    const sizePressure = clampValue((fraction - 0.35) * 0.16, -0.03, 0.16);
    const multiwayPenalty = Math.max(0, context.activeOpponents - 1) * 0.07;
    return clampValue(
      observedFold
      + strategy.foldPressure
      + adjustments.bluffBonus
      + sizePressure
      - context.hero.callRate * 0.07
      - multiwayPenalty,
      0.06,
      0.78,
    );
  }

  function raiseCandidates(context, strategy, adjustments) {
    if (!context.canRaise) return [];
    return strategy.sizes.map((baseFraction, index) => {
      const fraction = clampValue(baseFraction + adjustments.sizeBias * (index === strategy.sizes.length - 1 ? 1 : 0.35), 0.25, 1.35);
      const desired = roundToChip(Math.max(context.minimumRaise, context.pot * fraction));
      const raiseBy = Math.min(context.maxRaise, Math.max(context.minimumRaise, desired));
      const foldEq = foldEquity(context, strategy, fraction, adjustments);
      const totalRisk = context.needed + raiseBy;
      const calledPot = context.pot + context.needed + totalRisk;
      const showdownEv = context.equityProxy * calledPot - (1 - context.equityProxy) * totalRisk;
      const ev = foldEq * context.pot + (1 - foldEq) * showdownEv;
      return { index, fraction, raiseBy, foldEquity: foldEq, ev };
    }).filter(candidate => candidate.raiseBy >= context.minimumRaise);
  }

  function chooseDecision(player, options = {}) {
    const strategy = STRATEGIES[player?.name];
    if (!strategy) return { action: "fallback", strategyId: "" };

    const random = typeof options.random === "function" ? options.random : Math.random;
    const context = publicContext(player);
    const plan = strategyPlan(player, context, random);
    const adjustments = styleAdjustments(player, context, strategy, plan, random);
    const emotion = typeof aiEmotionMeta === "function" ? aiEmotionMeta(player.emotion) : { aggression: 1, bluff: 1, patience: 1 };
    const bluffChance = clampValue(
      strategy.bluffRate * (Number(emotion.bluff) || 1)
      + adjustments.bluffBonus
      + (plan.line === "pressure" ? 0.08 : 0)
      + (plan.line === "semi-bluff" ? 0.07 : 0),
      0,
      player.name === "Momo" ? 0.52 : 0.38,
    );
    const bluffing = context.canRaise
      && context.stackInBigBlinds > 14
      && context.needed <= context.stack * 0.16
      && (plan.line === "semi-bluff" || random() < bluffChance);
    const valueReady = context.equityProxy >= strategy.valueThreshold;
    const callScore = (context.equityProxy - context.potOdds)
      + strategy.callMargin
      + adjustments.callBias
      - context.texture.wetness * Math.max(0, 0.5 - context.equityProxy) * 0.08;
    const raiseCandidatesList = raiseCandidates(context, strategy, adjustments);
    const bestRaise = raiseCandidatesList.sort((left, right) => right.ev - left.ev)[0] || null;
    const normalizedRaiseEv = bestRaise ? bestRaise.ev / Math.max(1, context.pot + context.stack * 0.25) : -1;
    let raiseScore = normalizedRaiseEv
      + strategy.aggression * (Number(emotion.aggression) || 1) * 0.11
      + adjustments.raiseBias
      + (valueReady ? 0.09 : 0)
      + (bluffing ? 0.075 : 0)
      + (plan.line === "value" ? 0.065 : 0)
      + (plan.line === "semi-bluff" ? 0.05 : 0);

    const trapChance = clampValue(strategy.trapRate + adjustments.trapBonus, 0, 0.62);
    const shouldTrap = context.needed === 0
      && context.equityProxy >= strategy.valueThreshold + 0.06
      && random() < trapChance;
    if (shouldTrap) raiseScore -= 0.32;

    if (strategy.family === "solver" && bestRaise) {
      raiseScore = normalizedRaiseEv + adjustments.raiseBias + (valueReady || bluffing ? 0.05 : -0.03);
    }

    const shortStackJam = context.canRaise
      && context.stackInBigBlinds <= 10
      && context.equityProxy >= 0.67
      && random() < strategy.aggression * 0.72;
    const momoPressureJam = player.name === "Momo"
      && context.canRaise
      && context.stackInBigBlinds <= 16
      && (valueReady || context.drawPotential >= 0.12)
      && random() < 0.18;

    let action = "call";
    let reason = "價格與牌力允許繼續";
    let raiseBy = 0;
    let sizeFraction = 0;

    if (context.needed > 0 && callScore < -0.035 && !bluffing && !valueReady) {
      action = "fold";
      reason = "公開資訊下的跟注 EV 不足";
    } else if ((shortStackJam || momoPressureJam) && context.availableRaise >= context.minimumRaise) {
      action = "raise";
      raiseBy = context.availableRaise;
      sizeFraction = context.availableRaise / Math.max(1, context.pot);
      reason = shortStackJam ? "短碼價值推進" : "極化壓力推進";
    } else if (bestRaise && !shouldTrap && (raiseScore > Math.max(callScore, 0.035)) && (valueReady || bluffing)) {
      action = "raise";
      raiseBy = bestRaise.raiseBy;
      sizeFraction = bestRaise.fraction;
      reason = valueReady ? "獨立價值下注線" : "獨立詐唬／半詐唬線";
    } else if (context.needed > 0 && callScore < -0.08) {
      action = "fold";
      reason = "風險高於可接受價格";
    } else if (context.needed === 0 && shouldTrap) {
      action = "call";
      reason = "保留強牌的陷阱線";
    }

    return {
      action,
      raiseBy,
      sizeFraction,
      reason,
      strategyId: strategy.id,
      strategyTitle: strategy.title,
      plan: { ...plan },
      equityProxy: context.equityProxy,
      potOdds: context.potOdds,
      callScore,
      raiseScore,
      bluffing,
      valueReady,
      context,
      candidates: raiseCandidatesList,
    };
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
    say(player, player.allIn ? "allin" : "raise", {
      force: player.allIn,
      chance: 0.4,
    });
  }

  function performCall(player, needed) {
    const paid = pay(player, needed);
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : (paid === 0 ? "過牌" : `跟注 ${paid}`);
    if (paid === 0) {
      if (!state.isMuted) Audio.check();
    } else if (!state.isMuted) {
      Audio.chip();
    }
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
      strategyId: decision.strategyId,
      action: decision.action,
      reason: decision.reason,
      sizeFraction: decision.sizeFraction,
      equityProxy: decision.equityProxy,
      potOdds: decision.potOdds,
      plan: decision.plan?.line || "",
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player, amountToCall(player));
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined" || typeof AI_PROFILE_META === "undefined") return false;
    for (const name of SUPPORTED_NAMES) {
      const strategy = STRATEGIES[name];
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) Object.assign(profile, {
        independentStrategy: true,
        strategyId: strategy.id,
        strategyTitle: strategy.title,
        strategyVersion: VERSION,
        publicInformationOnly: true,
      });
      if (AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].strategyId = strategy.id;
        AI_PROFILE_META[name].strategyTitle = strategy.title;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    if (window.__aiCharacterStrategyDecisionInstalled) return true;
    if (typeof botAction !== "function") return false;

    const previousBotAction = botAction;
    window.__aiCharacterStrategyPreviousBotAction = previousBotAction;
    botAction = function botActionWithIndependentCharacters(player) {
      if (!SUPPORTED_NAMES.includes(player?.name)) return previousBotAction(player);
      try {
        return executeDecision(player, chooseDecision(player));
      } catch (error) {
        console.warn("Independent AI strategy fallback", player?.name, error);
        return previousBotAction(player);
      }
    };
    window.__aiCharacterStrategyDecisionInstalled = true;
    return true;
  }

  function refresh() {
    const profilesReady = registerProfiles();
    const decisionsReady = installDecisionLayer();
    return profilesReady && decisionsReady;
  }

  window.AiCharacterStrategies = {
    version: VERSION,
    middleNames: [...MIDDLE_NAMES],
    eliteNames: [...ELITE_NAMES],
    supportedNames: [...SUPPORTED_NAMES],
    strategies: STRATEGIES,
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    supports(name) {
      return SUPPORTED_NAMES.includes(name);
    },
    boardTexture,
    publicContext,
    chooseDecision,
    refresh,
  };

  refresh();
  window.setTimeout(refresh, 0);
})();
