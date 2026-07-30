// AI decision logic
function botAction(player) {
  player.status = "Thinking...";

  const strength = estimateStrength(player);
  const needed = amountToCall(player);
  const potOdds = needed / Math.max(1, state.pot + needed);
  const eff = strength + (Math.random() - 0.5) * 0.1;
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
  const adjustedStrength = eff + positionBonus;
  const shouldCall = needed === 0 || adjustedStrength + (1 - patience) * 0.08 > potOdds - 0.05;
  const availableRaise = Math.max(0, player.stack - needed);
  const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
  const canRaiseWithoutJamming = canRaise && availableRaise >= minimumRaiseBy() + bigBlind;
  const maxNormalRaiseBy = Math.floor(Math.min(
    player.stack * NORMAL_RAISE_STACK_CAP,
    availableRaise - bigBlind,
  ) / 10) * 10;
  const canMakeNormalRaise = canRaiseWithoutJamming && maxNormalRaiseBy >= minimumRaiseBy();
  const premiumHand = adjustedStrength > (state.board.length >= 3 ? 0.62 : 0.84);
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
    const desiredRaiseBy = Math.floor((minimumRaiseBy() + 20 + (isBluffing ? 0.35 : strength) * 100) / 10) * 10;
    const raiseBy = shouldJam
      ? availableRaise
      : Math.min(maxNormalRaiseBy, Math.max(minimumRaiseBy(), desiredRaiseBy));
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

function estimateStrength(player) {
  if (state.board.length >= 3) {
    return evaluateBestHand([...player.cards, ...state.board]).score / 9;
  }

  const [a, b] = [...player.cards].sort((x, y) => y.value - x.value);
  let score = 0;

  if (a.value === b.value) {
    score = 0.5 + (a.value / 14) * 0.3;
    if (a.value >= 11) score += 0.2;
    else if (a.value >= 7) score += 0.1;
  }
  else if (a.suit === b.suit) {
    score = 0.3 + (a.value / 14) * 0.15 + (b.value / 14) * 0.1;
    if (Math.abs(a.value - b.value) <= 1) score += 0.15;
    else if (Math.abs(a.value - b.value) <= 2) score += 0.08;
  }
  else if (Math.abs(a.value - b.value) <= 1) {
    score = 0.25 + (a.value / 14) * 0.12;
    if (a.value >= 12) score += 0.1;
  }
  else {
    score = (a.value / 14) * 0.18 + (b.value / 14) * 0.1;
    if (a.value >= 12) score += 0.08;
  }

  if (a.suit === b.suit && a.value >= 12 && b.value >= 11) {
    score += 0.1;
  }

  return Math.min(1, score);
}
