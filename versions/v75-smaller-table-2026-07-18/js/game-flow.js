// Hand flow and betting engine

function aiProfile(name) {
  return AI_ROSTER.find(profile => profile.name === name);
}

function buildNextAiSeats(previousPlayers) {
  const buyIn = currentBuyIn();
  if (!previousPlayers.length) {
    return AI_ROSTER.slice(0, TABLE_AI_COUNT).map(profile => ({
      profile,
      stack: buyIn,
      wins: 0,
      emotion: "calm",
      streak: 0,
      replaced: null,
    }));
  }

  const previousAi = previousPlayers.slice(1, TABLE_AI_COUNT + 1);
  const survivingNames = new Set(previousAi.filter(player => player.stack > 0).map(player => player.name));
  const previousNames = new Set(previousAi.map(player => player.name));
  const reserveQueue = [
    ...AI_ROSTER.filter(profile => !survivingNames.has(profile.name) && !previousNames.has(profile.name)),
    ...AI_ROSTER.filter(profile => !survivingNames.has(profile.name) && previousNames.has(profile.name)),
  ];
  const usedNames = new Set(survivingNames);

  return Array.from({ length: TABLE_AI_COUNT }, (_, index) => {
    const previous = previousAi[index];
    const retainedProfile = previous?.stack > 0 ? aiProfile(previous.name) : null;
    if (retainedProfile) {
      return {
        profile: retainedProfile,
        stack: previous.stack,
        wins: previous.wins || 0,
        emotion: previous.emotion || "calm",
        streak: previous.streak || 0,
        replaced: null,
      };
    }

    const replacementIndex = reserveQueue.findIndex(profile => !usedNames.has(profile.name));
    const profile = replacementIndex >= 0
      ? reserveQueue.splice(replacementIndex, 1)[0]
      : AI_ROSTER.find(candidate => !usedNames.has(candidate.name)) || AI_ROSTER[index];
    usedNames.add(profile.name);
    return {
      profile,
      stack: buyIn,
      wins: 0,
      emotion: "fresh",
      streak: 0,
      replaced: previous || null,
    };
  });
}

function aiEmotionMeta(emotion) {
  return {
    fresh: { label: "新來", detail: "剛坐下", aggression: 1.02, bluff: 1.02, patience: 1 },
    calm: { label: "冷靜", detail: "正常發揮", aggression: 1, bluff: 1, patience: 1 },
    confident: { label: "自信", detail: "手感不錯", aggression: 1.08, bluff: 1.06, patience: 0.97 },
    tilted: { label: "上頭", detail: "想討回來", aggression: 1.16, bluff: 1.18, patience: 0.9 },
    cautious: { label: "龜縮", detail: "先保命", aggression: 0.88, bluff: 0.82, patience: 1.1 },
  }[emotion] || { label: "冷靜", detail: "正常發揮", aggression: 1, bluff: 1, patience: 1 };
}

function startHand() {
  Audio.cleanup();
  clearAutoNewHandTimer();
  clearDialogueTimers();

  state.handNumber += 1;
  const previousPlayers = state.players;
  const previousBlindLevel = state.blindLevel;
  state.blindLevel = blindLevelForHand(state.handNumber);
  const seatCount = TABLE_AI_COUNT + 1;
  state.dealerIndex = (state.handNumber - 1) % seatCount;
  const humanWasBusted = Boolean(previousPlayers[0] && previousPlayers[0].stack <= 0);
  const buyIn = currentBuyIn();
  const smallBlind = currentSmallBlind();
  const bigBlind = currentBigBlind();
  const humanStack = previousPlayers[0]?.stack > 0 ? previousPlayers[0].stack : buyIn;
  const nextAiSeats = buildNextAiSeats(previousPlayers);
  state.deck = shuffle(createDeck());
  state.board = [];
  state.pot = 0;
  state.currentBet = 0;
  state.street = "翻牌前";
  state.handOver = false;
  state.winners = [];
  state.waitingForHuman = false;
  state.potDelta = 0;
  state.actionPulse = null;
  state.winAmount = 0;
  state.streetDialogueCount = 0;
  state.currentActorIndex = 0;
  state.lastAggressor = null;
  state.lastRaiseSize = bigBlind;
  state.heroCurrentHand = createHeroHandTracker();
  markCardsForMotion();
  state.coach.lastBoardKey = "";
  state.coach.previousWinRate = null;
  state.coach.lastWinRate = null;
  state.coach.analysisCache = { key: "", data: null };
  if (els.showdownBanner) els.showdownBanner.classList.remove("is-visible");

  state.players = [
    { name: "Owl", isHuman: true, emoji: "🦉", cards: [state.deck.pop(), state.deck.pop()],
      stack: humanStack, bet: 0, totalContribution: 0, folded: false, allIn: false, hasActed: false, raiseLocked: false, status: "等待行動", position: 0,
      wins: (previousPlayers[0]?.wins || 0), dialogue: "", dialogueTone: "", lastDialogueAt: 0 },
    ...nextAiSeats.map(({ profile, stack, wins, replaced, emotion, streak }, i) => ({
      ...profile, isHuman: false, cards: [state.deck.pop(), state.deck.pop()],
      stack, bet: 0, totalContribution: 0, folded: false, allIn: false, hasActed: false, raiseLocked: false,
      status: replaced ? "新加入" : "準備行動", position: i + 1,
      wins, emotion, streak, dialogue: "", dialogueTone: "", lastDialogueAt: 0,
    })),
  ];

  state.players.forEach((_, i) => setTimeout(() => !state.isMuted && Audio.deal(), i * 120));
  const smallBlindPlayer = state.players[(state.dealerIndex + 1) % state.players.length];
  const bigBlindPlayer = state.players[(state.dealerIndex + 2) % state.players.length];
  postBlind(smallBlindPlayer, smallBlind, "小盲");
  postBlind(bigBlindPlayer, bigBlind, "大盲");
  state.currentBet = Math.max(smallBlindPlayer.bet, bigBlindPlayer.bet);
  state.lastRaiseSize = bigBlind;
  state.lastAggressor = bigBlindPlayer.position;
  if (humanWasBusted) {
    log(`🦉 Owl 籌碼歸零，重新買入 ${buyIn}。`);
  }
  if (previousBlindLevel && previousBlindLevel.level !== state.blindLevel.level) {
    log(`盲注升級：第 ${state.blindLevel.level} 級，盲注 ${smallBlind} / ${bigBlind}，新買入 ${buyIn}。`);
    announce(`盲注升級 ${smallBlind} / ${bigBlind}`);
  }
  const replacements = nextAiSeats
    .map((seat, index) => ({ ...seat, player: state.players[index + 1] }))
    .filter(seat => seat.replaced);
  replacements.forEach(({ replaced, player }) => {
    log(`${replaced.emoji} ${replaced.name} 籌碼歸零，淘汰離桌。${player.emoji} ${player.name} 帶入 ${buyIn} 加入牌桌。`);
  });
  if (replacements[0]) say(replacements[0].player, "join", { force: true });
  log(`🃏 新牌局開始，盲注 ${smallBlind} / ${bigBlind}。`);
  if (!previousBlindLevel || previousBlindLevel.level === state.blindLevel.level) announce("新牌局開始");
  beginBettingRound((state.dealerIndex + 3) % state.players.length);
  continueBetting();
}

function postBlind(player, amount, label) {
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  player.bet += paid;
  player.totalContribution += paid;
  state.pot += paid;
  pulsePot(paid);
  if (player.stack === 0) player.allIn = true;
  player.status = label + " " + paid;
  player.lastAction = label;
}

function activePlayers() { return state.players.filter(p => !p.folded); }
function human() { return state.players[0]; }
function amountToCall(player) { return Math.max(0, state.currentBet - player.bet); }
function minimumRaiseBy() { return state.currentBet === 0 ? currentBigBlind() : Math.max(currentBigBlind(), state.lastRaiseSize); }
function minRaiseTo() { return state.currentBet + minimumRaiseBy(); }

function playerAction(action) {
  const player = human();
  if (state.handOver || !state.waitingForHuman || state.currentActorIndex !== 0 || player.folded || player.allIn) return;
  state.waitingForHuman = false;

  if (action === "fold") {
    recordHeroAction("fold");
    player.folded = true;
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = "棄牌";
    player.lastAction = "fold";
    !state.isMuted && Audio.fold();
    logAction(player, "Fold");
    announceAction("FOLD", "fold");
    tableTalk("playerFold", { chance: 0.78 });
  }

  if (action === "call") {
    const callAmount = amountToCall(player);
    callAmount === 0 ? !state.isMuted && Audio.check() : !state.isMuted && Audio.chip();
    recordHeroAction(callAmount === 0 ? "check" : "call", callAmount);
    callPlayer(player);
  }

  if (action === "raise") {
    syncRaiseControl();
    const raiseBy = Number(els.raiseAmount.value);
    const beforeContribution = player.bet;
    raisePlayer(player, raiseBy);
    recordHeroAction(player.allIn ? "allin" : "raise", player.bet - beforeContribution);
    !state.isMuted && Audio.raise();
    logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
    announceAction(player.allIn ? "ALL-IN" : "RAISE", player.allIn ? "allin" : "raise");
    tableTalk(player.allIn ? "humanAllin" : "humanRaise", { chance: 0.82 });
  }

  if (action === "allin") {
    if (player.raiseLocked && player.stack > amountToCall(player)) {
      state.waitingForHuman = true;
      render();
      return;
    }
    const previousBet = state.currentBet;
    const beforeContribution = player.bet;
    pay(player, player.stack);
    recordHeroAction("allin", player.bet - beforeContribution);
    player.hasActed = true;
    const isRaise = applyBetIncrease(player, previousBet);
    player.status = "ALL-IN " + player.bet;
    player.lastAction = "allin";
    !state.isMuted && Audio.raise();
    logAction(player, isRaise ? "All-in Raise" : "All-in", player.bet);
    announceAction("ALL-IN", "allin");
    tableTalk("humanAllin", { force: true });
  }

  continueBetting();
}

function callPlayer(player) {
  const paid = pay(player, amountToCall(player));
  player.hasActed = true;
  player.raiseLocked = false;
  player.status = player.allIn && paid > 0 ? "ALL-IN " + player.bet : (paid === 0 ? "過牌" : "跟注 " + paid);
  player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
  logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
  announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
}

function raisePlayer(player, raiseBy) {
  const previousBet = state.currentBet;
  const legalRaiseBy = Math.max(minimumRaiseBy(), raiseBy);
  const targetBet = state.currentBet + legalRaiseBy;
  const contribution = Math.max(0, targetBet - player.bet);
  pay(player, contribution);
  player.hasActed = true;
  applyBetIncrease(player, previousBet);
  player.status = player.allIn ? "ALL-IN " + player.bet : "加注到 " + player.bet;
  player.lastAction = player.allIn ? "allin" : "raise";
}

function applyBetIncrease(player, previousBet) {
  if (player.bet <= previousBet) {
    player.raiseLocked = false;
    return false;
  }

  const raiseSize = player.bet - previousBet;
  const fullRaise = player.bet >= previousBet + state.lastRaiseSize;
  state.currentBet = player.bet;

  if (fullRaise) {
    state.lastRaiseSize = Math.max(MIN_RAISE, raiseSize);
    state.lastAggressor = player.position;
    for (const other of state.players) {
      other.raiseLocked = false;
      if (!other.folded && !other.allIn && other !== player) {
        other.hasActed = false;
        if (other.status !== "棄牌") other.status = other.isHuman ? "等待行動" : "準備行動";
      }
    }
  } else {
    for (const other of state.players) {
      if (!other.folded && !other.allIn && other !== player && other.hasActed && other.bet < state.currentBet) {
        other.raiseLocked = true;
      }
    }
  }

  player.hasActed = true;
  player.raiseLocked = false;
  return fullRaise;
}

function pay(player, amount) {
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  player.bet += paid;
  player.totalContribution += paid;
  state.pot += paid;
  if (paid > 0) {
    pulsePot(paid);
    animateChips(player, paid);
  }
  if (player.stack === 0) player.allIn = true;
  return paid;
}

function beginBettingRound(firstIndex) {
  state.players.forEach(player => {
    player.hasActed = player.folded || player.allIn;
    player.raiseLocked = false;
    if (!player.folded && !player.allIn) player.status = player.isHuman ? "等待行動" : "準備行動";
  });
  state.currentActorIndex = nextPendingActor(firstIndex - 1);
}

function nextPendingActor(startIndex) {
  const count = state.players.length;
  for (let offset = 1; offset <= count; offset++) {
    const index = (startIndex + offset + count) % count;
    const player = state.players[index];
    if (needsAction(player)) return index;
  }
  return -1;
}

function needsAction(player) {
  return Boolean(player && !player.folded && !player.allIn && (!player.hasActed || player.bet < state.currentBet));
}

function isBettingRoundComplete() {
  const actionable = state.players.filter(player => !player.folded && !player.allIn);
  if (!actionable.length) return true;
  return actionable.every(player => player.hasActed && player.bet >= state.currentBet);
}

function shouldRunOutAllIn() {
  const active = activePlayers();
  if (active.length <= 1) return false;
  const notAllIn = active.filter(player => !player.allIn);
  if (notAllIn.length > 1) return false;
  return active.every(player => player.allIn || player.bet >= state.currentBet);
}

function markCardsForMotion(duration = CARD_MOTION_MS) {
  state.cardMotionUntil = Date.now() + duration;
}

function shouldAnimateCards() {
  return Date.now() < state.cardMotionUntil;
}

function promptHumanAction(player) {
  const callAmount = amountToCall(player);
  player.status = callAmount > 0 ? "需跟注 " + callAmount : "等待行動";
  state.waitingForHuman = true;
  announce(callAmount > 0 ? "輪到你：跟注 " + callAmount : "輪到你");
}

function continueBetting() {
  let guard = 0;
  state.waitingForHuman = false;

  while (!state.handOver && guard < 140) {
    if (finishByFoldIfNeeded()) break;
    if (shouldRunOutAllIn()) {
      runOutAllInBoard();
      break;
    }
    if (isBettingRoundComplete()) {
      advanceStreet();
      guard += 1;
      continue;
    }

    if (state.currentActorIndex < 0 || !needsAction(state.players[state.currentActorIndex])) {
      state.currentActorIndex = nextPendingActor(state.currentActorIndex);
    }

    const actor = state.players[state.currentActorIndex];
    if (!actor) break;
    if (actor.isHuman) {
      promptHumanAction(actor);
      break;
    }

    botAction(actor);
    state.currentActorIndex = nextPendingActor(actor.position);
    guard += 1;
  }

  if (!state.handOver && guard >= 140) {
    log("系統：下注輪推進中止，請開新牌局。");
    state.waitingForHuman = !human().folded && !human().allIn;
  }

  render();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finishByFoldIfNeeded() {
  const c = activePlayers();
  if (c.length === 1) {
    awardPot([c[0]], c[0].emoji + " " + c[0].name + " 贏得底池 " + state.pot + "！");
    return true;
  }
  return false;
}

function advanceStreet() {
  state.actionPulse = null;
  for (const p of state.players) {
    p.bet = 0;
    p.hasActed = p.folded || p.allIn;
    p.raiseLocked = false;
    if (!p.folded) p.status = p.isHuman ? "等待行動" : "準備下一輪";
  }
  state.currentBet = 0;
  state.lastAggressor = null;
  state.lastRaiseSize = currentBigBlind();

  if (state.board.length === 0) {
    state.streetDialogueCount = 0;
    state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    state.street = "翻牌";
    markCardsForMotion();
    !state.isMuted && Audio.streetDeal();
    log("翻牌發出。");
    announce("翻牌");
    tableTalk("flop", { chance: 0.82 });
    beginBettingRound((state.dealerIndex + 1) % state.players.length);
    return;
  }
  if (state.board.length === 3) {
    state.streetDialogueCount = 0;
    state.board.push(state.deck.pop());
    state.street = "轉牌";
    markCardsForMotion();
    !state.isMuted && Audio.deal();
    log("轉牌發出。");
    announce("轉牌");
    tableTalk("turn", { chance: 0.55 });
    beginBettingRound((state.dealerIndex + 1) % state.players.length);
    return;
  }
  if (state.board.length === 4) {
    state.streetDialogueCount = 0;
    state.board.push(state.deck.pop());
    state.street = "河牌";
    markCardsForMotion();
    !state.isMuted && Audio.deal();
    log("河牌發出。");
    announce("河牌");
    tableTalk("river", { chance: 0.9 });
    beginBettingRound((state.dealerIndex + 1) % state.players.length);
    return;
  }
  showdown();
}

function runOutAllInBoard() {
  if (activePlayers().length <= 1) return;
  state.currentBet = 0;
  state.players.forEach(player => { player.bet = 0; });
  markCardsForMotion(CARD_MOTION_MS + 260);

  while (state.board.length < 5) {
    if (state.board.length === 0) {
      state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
      state.street = "翻牌";
      log("All-in runout：翻牌發出。");
      continue;
    }
    if (state.board.length === 3) {
      state.board.push(state.deck.pop());
      state.street = "轉牌";
      log("All-in runout：轉牌發出。");
      continue;
    }
    if (state.board.length === 4) {
      state.board.push(state.deck.pop());
      state.street = "河牌";
      log("All-in runout：河牌發出。");
    }
  }
  showdown();
}
