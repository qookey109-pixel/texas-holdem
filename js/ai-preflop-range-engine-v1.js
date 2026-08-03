// Public-information preflop range engine for middle and elite AI characters.
(() => {
  "use strict";

  if (window.AiPreflopRangeEngine?.version) return;

  const VERSION = "1.0.0";
  const SUPPORTED_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"];
  const POSITION_OPEN_THRESHOLDS = Object.freeze({
    UTG: 0.68,
    MP: 0.61,
    HJ: 0.56,
    CO: 0.50,
    BTN: 0.43,
    SB: 0.51,
    BB: 0.54,
  });
  const CHARACTER_ADJUSTMENTS = Object.freeze({
    Ace: { open: -0.015, call: 0.015, threeBet: -0.015, fourBet: 0, bluff3Bet: 0.10, squeeze: 0.08, openSize: 2.45 },
    Momo: { open: -0.09, call: -0.025, threeBet: -0.085, fourBet: -0.055, bluff3Bet: 0.27, squeeze: 0.25, openSize: 2.75 },
    Nori: { open: -0.025, call: -0.015, threeBet: -0.025, fourBet: -0.015, bluff3Bet: 0.13, squeeze: 0.12, openSize: 2.35 },
    Bruno: { open: 0.075, call: 0.045, threeBet: 0.045, fourBet: 0.03, bluff3Bet: 0.025, squeeze: 0.03, openSize: 2.75 },
    Dodo: { open: 0.035, call: -0.055, threeBet: 0.065, fourBet: 0.055, bluff3Bet: 0.025, squeeze: 0.025, openSize: 2.25 },
    Viper: { open: -0.005, call: -0.005, threeBet: -0.015, fourBet: -0.005, bluff3Bet: 0.12, squeeze: 0.11, openSize: 2.4 },
    Nova: { open: -0.075, call: -0.035, threeBet: -0.065, fourBet: -0.035, bluff3Bet: 0.23, squeeze: 0.21, openSize: 2.6 },
    "Unit-9": { open: -0.035, call: -0.025, threeBet: -0.045, fourBet: -0.035, bluff3Bet: 0.15, squeeze: 0.15, openSize: 2.35 },
    Merlin: { open: -0.045, call: -0.02, threeBet: -0.035, fourBet: -0.02, bluff3Bet: 0.17, squeeze: 0.16, openSize: 2.4 },
    Vlad: { open: -0.055, call: -0.035, threeBet: -0.055, fourBet: -0.035, bluff3Bet: 0.19, squeeze: 0.18, openSize: 2.5 },
  });

  const FAIR_INFORMATION_POLICY = Object.freeze({
    ownHoleCards: true,
    publicPosition: true,
    publicActions: true,
    publicBetSizes: true,
    publicHeroStatistics: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function roundToChip(value) {
    return Math.max(0, Math.round((Number(value) || 0) / 10) * 10);
  }

  function rankLabel(value) {
    return ({ 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" })[value] || String(value || "?");
  }

  function sortedCards(player) {
    return [...(player?.cards || [])].sort((left, right) => Number(right.value) - Number(left.value));
  }

  function classifyHand(player) {
    const [highCard, lowCard] = sortedCards(player);
    if (!highCard || !lowCard) {
      return {
        code: "--",
        score: 0,
        pair: false,
        suited: false,
        gap: 99,
        aceBlocker: false,
        kingBlocker: false,
        suitedConnector: false,
        broadwayCount: 0,
      };
    }

    const high = Number(highCard.value) || 0;
    const low = Number(lowCard.value) || 0;
    const pair = high === low;
    const suited = highCard.suit === lowCard.suit;
    const gap = Math.max(0, high - low - 1);
    const broadwayCount = [high, low].filter(value => value >= 10).length;
    let score = 0;

    if (pair) {
      score = 0.58 + (high / 14) * 0.38;
      if (high >= 10) score += 0.025;
    } else {
      score = (high / 14) * 0.43 + (low / 14) * 0.24;
      if (suited) score += 0.09;
      if (gap === 0) score += 0.09;
      else if (gap === 1) score += 0.055;
      else if (gap === 2) score += 0.025;
      else if (gap >= 4) score -= 0.04;
      score += broadwayCount * 0.04;
      if (high === 14) score += 0.05;
      if (broadwayCount === 2) score += 0.07;
    }

    score = clamp(score, 0.12, 0.995);
    return {
      code: `${rankLabel(high)}${rankLabel(low)}${pair ? "" : (suited ? "s" : "o")}`,
      score,
      pair,
      suited,
      gap,
      aceBlocker: high === 14 && low >= 5,
      kingBlocker: high === 13 && low >= 9,
      suitedConnector: suited && gap <= 1 && high <= 12,
      broadwayCount,
      high,
      low,
    };
  }

  function publicHeroModel() {
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
    };
  }

  function actionContext(player) {
    const actions = window.AiActionMemory?.actions?.("preflop") || [];
    const raises = actions.filter(event => ["raise", "allin-raise"].includes(event.action));
    const calls = actions.filter(event => event.action === "call");
    const firstRaiseSequence = raises[0]?.sequence ?? Infinity;
    const limpers = calls.filter(event => event.sequence < firstRaiseSequence);
    const callersAfterOpen = calls.filter(event => event.sequence > firstRaiseSequence);
    const latestRaise = raises.at(-1) || null;
    const heroActions = actions.filter(event => event.isHuman);
    const needed = Math.max(0, amountToCall(player));
    const bigBlind = Math.max(1, currentBigBlind());
    const position = positionLabel(player);

    return {
      actions: actions.map(event => ({
        sequence: event.sequence,
        actor: event.actor,
        isHuman: event.isHuman,
        action: event.action,
        amount: event.amount,
        bet: event.bet,
      })),
      raises: raises.length,
      calls: calls.length,
      limpers: limpers.length,
      callersAfterOpen: callersAfterOpen.length,
      latestRaise: latestRaise ? {
        actor: latestRaise.actor,
        isHuman: latestRaise.isHuman,
        amount: latestRaise.amount,
        bet: latestRaise.bet,
      } : null,
      heroActions: heroActions.length,
      needed,
      currentBet: Math.max(0, Number(state?.currentBet) || 0),
      pot: Math.max(1, Number(state?.pot) || 0),
      bigBlind,
      position,
      stack: Math.max(0, Number(player?.stack) || 0),
      stackInBigBlinds: Math.max(0, Number(player?.stack) || 0) / bigBlind,
      potOdds: needed / Math.max(1, (Number(state?.pot) || 0) + needed),
      hero: publicHeroModel(),
    };
  }

  function positionThreshold(position) {
    return POSITION_OPEN_THRESHOLDS[position] ?? 0.57;
  }

  function characterConfig(name) {
    return CHARACTER_ADJUSTMENTS[name] || CHARACTER_ADJUSTMENTS.Nori;
  }

  function opponentPressure(context) {
    if (!context.raises) return 0;
    let pressure = context.raises * 0.11;
    if (context.latestRaise?.isHuman && context.hero.sample >= 4) {
      pressure += clamp((0.34 - context.hero.raiseRate) * 0.18, -0.04, 0.07);
    }
    pressure += context.callersAfterOpen * 0.025;
    return clamp(pressure, 0.08, 0.36);
  }

  function thresholds(player, hand, context) {
    const config = characterConfig(player?.name);
    const latePosition = ["CO", "BTN"].includes(context.position);
    const blind = ["SB", "BB"].includes(context.position);
    const heroTooTight = context.hero.sample >= 5 && context.hero.foldRate >= 0.44;
    const heroTooLoose = context.hero.sample >= 5 && context.hero.callRate >= 0.42;
    const stackAdjustment = context.stackInBigBlinds <= 18 ? -0.025 : (context.stackInBigBlinds >= 70 ? 0.015 : 0);

    return {
      open: clamp(positionThreshold(context.position) + config.open + stackAdjustment - (heroTooTight && latePosition ? 0.035 : 0), 0.32, 0.82),
      call: clamp(0.54 + config.call + opponentPressure(context) * 0.16 - (blind ? 0.075 : 0) - (context.potOdds <= 0.24 ? 0.035 : 0), 0.36, 0.78),
      threeBet: clamp(0.77 + config.threeBet + opponentPressure(context) * 0.12 - (latePosition ? 0.025 : 0), 0.58, 0.9),
      fourBet: clamp(0.90 + config.fourBet + opponentPressure(context) * 0.08, 0.78, 0.97),
      squeeze: clamp(0.72 + config.threeBet - context.callersAfterOpen * 0.025, 0.56, 0.86),
      jam: clamp((context.stackInBigBlinds <= 10 ? 0.67 : 0.84) + (heroTooLoose ? -0.025 : 0), 0.62, 0.91),
      bluff3Bet: config.bluff3Bet,
      squeezeRate: config.squeeze,
      openSize: config.openSize,
      handScore: hand.score,
    };
  }

  function availableRaise(player, context) {
    return Math.max(0, (Number(player?.stack) || 0) - context.needed);
  }

  function legalRaiseBy(player, context, desiredRaiseBy) {
    const available = availableRaise(player, context);
    const minimum = Math.max(context.bigBlind, minimumRaiseBy());
    if (available < minimum) return 0;
    return Math.min(available, Math.max(minimum, roundToChip(desiredRaiseBy)));
  }

  function openRaiseBy(player, context, thresholdsValue) {
    const total = context.bigBlind * thresholdsValue.openSize + context.limpers * context.bigBlind;
    return legalRaiseBy(player, context, total - context.currentBet);
  }

  function threeBetRaiseBy(player, context, squeeze = false) {
    const inPosition = ["CO", "BTN"].includes(context.position);
    const multiplier = squeeze ? 4.1 : (inPosition ? 3.05 : 3.55);
    const targetTotal = Math.max(context.bigBlind * 7, context.currentBet * multiplier + context.callersAfterOpen * context.bigBlind);
    return legalRaiseBy(player, context, targetTotal - context.currentBet);
  }

  function fourBetRaiseBy(player, context) {
    const targetTotal = Math.max(context.bigBlind * 15, context.currentBet * 2.25);
    return legalRaiseBy(player, context, targetTotal - context.currentBet);
  }

  function shouldBluffThreeBet(player, hand, context, thresholdsValue, random) {
    const config = characterConfig(player?.name);
    const blockerCandidate = hand.aceBlocker || hand.kingBlocker;
    const playableCandidate = hand.suitedConnector && ["CO", "BTN", "SB", "BB"].includes(context.position);
    const foldExploit = context.hero.sample >= 5 && context.hero.foldRate >= 0.42;
    const chance = clamp(thresholdsValue.bluff3Bet + (foldExploit ? 0.07 : 0), 0, 0.4);
    return (blockerCandidate || playableCandidate)
      && hand.score >= 0.43
      && hand.score < thresholdsValue.threeBet
      && random() < chance * (config.bluff3Bet > 0.2 ? 1 : 0.8);
  }

  function decision(action, reason, stage, hand, context, thresholdsValue, raiseBy = 0, extra = {}) {
    return {
      action,
      reason,
      stage,
      raiseBy,
      hand,
      thresholds: thresholdsValue,
      context,
      preflopRange: true,
      strategyVersion: "1.2.0",
      ...extra,
    };
  }

  function chooseDecision(player, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const hand = classifyHand(player);
    const context = actionContext(player);
    const threshold = thresholds(player, hand, context);
    const canRaise = !player?.raiseLocked && availableRaise(player, context) >= Math.max(context.bigBlind, minimumRaiseBy());
    const unopened = context.raises === 0;
    const facingOpen = context.raises === 1;
    const facingThreeBetOrMore = context.raises >= 2;

    if (!SUPPORTED_NAMES.includes(player?.name) || (state?.board?.length || 0) > 0) {
      return decision("fallback", "非翻牌前獨立範圍節點", "fallback", hand, context, threshold);
    }

    if (facingThreeBetOrMore) {
      if (canRaise && context.stackInBigBlinds <= 24 && hand.score >= threshold.jam) {
        return decision("raise", "短碼面對再加注的價值 All-in", "four-bet-jam", hand, context, threshold, availableRaise(player, context), { allInIntent: true });
      }
      if (canRaise && hand.score >= threshold.fourBet) {
        return decision("raise", "頂端範圍 4-bet", "four-bet", hand, context, threshold, fourBetRaiseBy(player, context));
      }
      if (hand.score >= threshold.fourBet - 0.095 && context.potOdds <= 0.31) {
        return decision("call", "強範圍承受 3-bet", "call-three-bet", hand, context, threshold);
      }
      return decision("fold", "面對 3-bet／4-bet 壓力收窄範圍", "fold-to-reraise", hand, context, threshold);
    }

    if (facingOpen) {
      const squeeze = context.callersAfterOpen >= 1;
      const squeezeBluff = squeeze
        && (hand.aceBlocker || hand.suitedConnector)
        && hand.score >= threshold.squeeze - 0.13
        && random() < threshold.squeezeRate;
      if (canRaise && squeeze && (hand.score >= threshold.squeeze || squeezeBluff)) {
        return decision("raise", hand.score >= threshold.squeeze ? "多人底池價值 Squeeze" : "阻擋牌／可玩性 Squeeze", "squeeze", hand, context, threshold, threeBetRaiseBy(player, context, true), { squeeze: true, bluff: hand.score < threshold.squeeze });
      }
      const bluffThreeBet = shouldBluffThreeBet(player, hand, context, threshold, random);
      if (canRaise && (hand.score >= threshold.threeBet || bluffThreeBet)) {
        return decision("raise", hand.score >= threshold.threeBet ? "位置化價值 3-bet" : "阻擋牌混合 3-bet", "three-bet", hand, context, threshold, threeBetRaiseBy(player, context), { bluff: bluffThreeBet });
      }
      if (hand.score >= threshold.call) {
        return decision("call", ["SB", "BB"].includes(context.position) ? "盲位依價格防守" : "位置與牌力允許跟注開池", "defend-open", hand, context, threshold);
      }
      return decision("fold", "不在面對開池的防守範圍", "fold-to-open", hand, context, threshold);
    }

    if (unopened) {
      const lateSteal = ["CO", "BTN", "SB"].includes(context.position)
        && (hand.aceBlocker || hand.suitedConnector)
        && hand.score >= threshold.open - 0.09
        && random() < clamp(characterConfig(player?.name).bluff3Bet + 0.12, 0.12, 0.42);
      if (canRaise && (hand.score >= threshold.open || lateSteal)) {
        return decision("raise", hand.score >= threshold.open ? "依位置開池" : "後位混合偷盲", "open-raise", hand, context, threshold, openRaiseBy(player, context, threshold), { steal: lateSteal });
      }
      if (context.position === "BB" && context.needed === 0) {
        return decision("call", "大盲免費看牌", "check-big-blind", hand, context, threshold);
      }
      if (context.position === "SB" && context.needed <= context.bigBlind * 0.5 && hand.score >= threshold.open - 0.11) {
        return decision("call", "小盲選擇性補齊", "complete-small-blind", hand, context, threshold);
      }
      return decision(context.needed > 0 ? "fold" : "call", context.needed > 0 ? "不在位置開池範圍" : "無需投入時過牌", "decline-open", hand, context, threshold);
    }

    return decision("fallback", "翻牌前範圍引擎回退", "fallback", hand, context, threshold);
  }

  window.AiPreflopRangeEngine = {
    version: VERSION,
    supportedNames: [...SUPPORTED_NAMES],
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    supports(name) {
      return SUPPORTED_NAMES.includes(name);
    },
    classifyHand,
    actionContext,
    thresholds,
    chooseDecision,
  };
})();
