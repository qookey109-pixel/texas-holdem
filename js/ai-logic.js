// AI decision logic
const AI_STRENGTH_MODEL_VERSION = "1.7.0";

function clampAiValue(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function aiActiveOpponentCount(player) {
  return Math.max(1, (state?.players || []).filter(candidate => candidate !== player && !candidate?.folded).length);
}

function aiDrawPotential(player) {
  if (!player?.cards?.length || (state?.board?.length || 0) < 3 || (state?.board?.length || 0) >= 5) return 0;
  const cards = [...player.cards, ...(state.board || [])];
  const suitCounts = new Map();
  for (const card of cards) suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  const flushDraw = [...suitCounts.values()].some(count => count === 4);

  const ranks = [...new Set(cards.map(card => Number(card.value) || 0))].sort((left, right) => left - right);
  if (ranks.includes(14)) ranks.unshift(1);
  let straightDraw = 0;
  for (let low = 1; low <= 10; low += 1) {
    const hits = ranks.filter(rank => rank >= low && rank <= low + 4).length;
    if (hits >= 4) straightDraw = Math.max(straightDraw, 0.1);
    else if (hits === 3) straightDraw = Math.max(straightDraw, 0.04);
  }
  return clampAiValue((flushDraw ? 0.12 : 0) + straightDraw, 0, 0.2);
}

function estimatePreflopStrength(player) {
  const [highCard, lowCard] = [...(player?.cards || [])].sort((left, right) => Number(right.value) - Number(left.value));
  if (!highCard || !lowCard) return 0;

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

  return clampAiValue(score, 0.12, 0.995);
}

function estimatePostflopStrength(player) {
  if (!player?.cards?.length) return 0;
  const result = evaluateBestHand([...player.cards, ...(state?.board || [])]);
  const category = Number(result?.score) || 0;
  const top = Number(result?.tiebreakers?.[0]) || 0;
  const kicker = Number(result?.tiebreakers?.[1]) || 0;
  const categoryBase = [0.2, 0.43, 0.62, 0.71, 0.78, 0.83, 0.9, 0.96, 0.99][category] || 0.2;
  const kickerBonus = (top / 14) * 0.055 + (kicker / 14) * 0.018;
  const drawBonus = aiDrawPotential(player);
  const multiwayPenalty = Math.max(0, aiActiveOpponentCount(player) - 1) * 0.018;
  return clampAiValue(categoryBase + kickerBonus + drawBonus - multiwayPenalty, 0.03, 0.995);
}

function estimateStrength(player) {
  return (state?.board?.length || 0) >= 3
    ? estimatePostflopStrength(player)
    : estimatePreflopStrength(player);
}

function beginnerRaiseFraction() {
  const pool = [0.45, 0.7, 1.0];
  return pool[Math.floor(Math.random() * pool.length)] || pool[0];
}

function botAction(player) {
  player.status = "Thinking...";

  const strength = estimateStrength(player);
  const needed = amountToCall(player);
  const pot = Math.max(1, Number(state.pot) || 0);
  const potOdds = needed / Math.max(1, pot + needed);
  const noise = (Math.random() - 0.5) * 0.08;
  const positionBonus = { BTN: 0.08, CO: 0.06, HJ: 0.04, MP: 0.02, UTG: -0.03, SB: -0.02, BB: 0 }[positionLabel(player)] || 0;
  const emotion = aiEmotionMeta(player.emotion);
  const bluffRate = Math.min(0.42, player.bluffRate * emotion.bluff);
  const aggression = Math.min(0.95, player.aggression * emotion.aggression);
  const patience = Math.min(0.98, player.patience * emotion.patience);
  const bigBlind = currentBigBlind();
  const stackInBigBlinds = player.stack / bigBlind;
  const isBluffing = stackInBigBlinds > 20
    && needed <= player.stack * 0.12
    && Math.random() < bluffRate;
  const adjustedStrength = clampAiValue(strength + noise + positionBonus, 0, 1);
  const shouldCall = needed === 0 || adjustedStrength + (1 - patience) * 0.08 > potOdds - 0.05;
  const availableRaise = Math.max(0, player.stack - needed);
  const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
  const canRaiseWithoutJamming = canRaise && availableRaise >= minimumRaiseBy() + bigBlind;
  const maxNormalRaiseBy = Math.floor(Math.min(
    player.stack * NORMAL_RAISE_STACK_CAP,
    availableRaise - bigBlind,
  ) / 10) * 10;
  const canMakeNormalRaise = canRaiseWithoutJamming && maxNormalRaiseBy >= minimumRaiseBy();
  const premiumHand = adjustedStrength > (state.board.length >= 3 ? 0.67 : 0.84);
  const shortStackJam = stackInBigBlinds <= SHORT_STACK_JAM_BB
    && adjustedStrength > Math.max(0.56, potOdds + 0.2)
    && Math.random() < aggression * 0.62;
  const premiumJam = stackInBigBlinds <= 18
    && premiumHand
    && needed >= bigBlind
    && Math.random() < aggression * 0.28;
  const shouldJam = canRaise && (shortStackJam || premiumJam);
  const shouldRaise = shouldJam || (canMakeNormalRaise
    && (adjustedStrength > 0.64 || isBluffing)
    && Math.random() < aggression);

  player.lastStrengthEstimate = {
    version: AI_STRENGTH_MODEL_VERSION,
    strength,
    adjustedStrength,
    potOdds,
    activeOpponents: aiActiveOpponentCount(player),
    emotion: {
      aggression: Number(emotion.aggression) || 1,
      bluff: Number(emotion.bluff) || 1,
      patience: Number(emotion.patience) || 1,
    },
  };

  if (needed > 0 && !shouldCall && !isBluffing) {
    player.folded = true;
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = "棄牌";
    player.lastAction = "fold";
    !state.isMuted && Audio.fold();
    logAction(player, "Fold");
    announceAction("FOLD", "fold");
    say(player, "fold", { chance: 0.22 });
    return;
  }

  if (shouldRaise) {
    const fraction = beginnerRaiseFraction();
    const desiredRaiseBy = Math.floor(Math.max(minimumRaiseBy(), pot * fraction) / 10) * 10;
    const raiseBy = shouldJam
      ? availableRaise
      : Math.min(maxNormalRaiseBy, Math.max(minimumRaiseBy(), desiredRaiseBy));
    player.lastStrengthEstimate.raiseFraction = shouldJam ? availableRaise / pot : fraction;
    raisePlayer(player, raiseBy);
    !state.isMuted && Audio.raise();
    logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
    announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    say(player, player.allIn ? "allin" : "raise", {
      force: player.allIn,
      chance: 0.38,
    });
    return;
  }

  const paid = pay(player, needed);
  player.hasActed = true;
  player.raiseLocked = false;
  player.status = player.allIn && paid > 0 ? "ALL-IN " + player.bet : (paid === 0 ? "過牌" : "跟注 " + paid);
  paid === 0 ? !state.isMuted && Audio.check() : !state.isMuted && Audio.chip();
  player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
  logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
  announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
  say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), {
    chance: player.allIn && paid > 0 ? 0.28 : (paid === 0 ? 0.14 : 0.18),
  });
}
