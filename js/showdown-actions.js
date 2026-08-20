// Showdown settlement, betting controls, and action effects

function showdown() {
  const pots = buildPots();
  const winningPlayers = new Map();
  const awardsByPosition = new Map();
  const messages = [];
  let totalAwarded = 0;
  let heroAwarded = 0;
  const totalPot = state.pot;

  pots.forEach((pot, index) => {
    const contenders = pot.eligiblePlayerIds
      .map(id => state.players[id])
      .filter(Boolean)
      .map(player => ({
        player,
        result: evaluateBestHand([...player.cards, ...state.board])
      }));

    contenders.sort((a, b) => compareResults(b.result, a.result));
    const best = contenders[0];
    const winners = contenders.filter(e => compareResults(e.result, best.result) === 0);
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;
    const potLabel = pots.length > 1 ? (index === 0 ? "主池" : "邊池 " + index) : "底池";

    winners.forEach((entry, winnerIndex) => {
      const amount = share + (winnerIndex < remainder ? 1 : 0);
      entry.player.stack += amount;
      winningPlayers.set(entry.player.position, entry.player);
      awardsByPosition.set(
        entry.player.position,
        (awardsByPosition.get(entry.player.position) || 0) + amount,
      );
      totalAwarded += amount;
      if (entry.player.isHuman) heroAwarded += amount;
    });

    const names = winners.map(entry => `${entry.player.emoji} ${entry.player.name}`).join("、");
    messages.push(`${names} 以${best.result.name}${winners.length > 1 ? "平分" : "贏得"}${potLabel} ${pot.amount}。`);
  });

  finishShowdown([...winningPlayers.values()], totalAwarded, messages, {
    heroAwarded,
    potSize: totalPot,
    awardsByPosition,
  });
}

function awardPot(winners, message) {
  const player = winners[0];
  const won = state.pot;
  player.stack += state.pot;
  player.wins = (player.wins || 0) + 1;
  state.pot = 0;
  state.handOver = true;
  state.street = "結算";
  state.winners = winners.map(w => w.name);
  state.waitingForHuman = false;
  state.actionPulse = "win";
  state.winAmount = won;
  const heroWon = winners.some(winner => winner.isHuman);
  completeHeroStyleHand({ showdown: false, won: heroWon, potSize: won, wonAmount: heroWon ? won : 0 });
  for (const seat of state.players) {
    if (!seat.folded) {
      seat.status = getVisibleHandRank(seat);
    }
  }
  if (player.isHuman) {
    tableTalk("lose", { chance: 0.82 });
  } else {
    say(player, "win", { force: true });
  }
  updateAiEmotions(winners);
  !state.isMuted && Audio.win();
  showWinBanner(winners, won);
  animateWinChips(player, won);
  log(message);
  logScoreboard();
  render();

  if (maybeShowSessionSummary()) return;
  scheduleAutoNewHand();
}

function buildPots() {
  const levels = [...new Set(state.players
    .map(player => player.totalContribution || 0)
    .filter(amount => amount > 0))]
    .sort((a, b) => a - b);
  const pots = [];
  let previous = 0;

  for (const level of levels) {
    const contributors = state.players.filter(player => (player.totalContribution || 0) >= level);
    const amount = (level - previous) * contributors.length;
    const eligiblePlayerIds = contributors
      .filter(player => !player.folded)
      .map(player => player.position);

    if (amount > 0 && eligiblePlayerIds.length) {
      pots.push({ amount, eligiblePlayerIds });
    }
    previous = level;
  }

  if (!pots.length && state.pot > 0) {
    pots.push({ amount: state.pot, eligiblePlayerIds: activePlayers().map(player => player.position) });
  }

  return pots;
}

function finishShowdown(winners, won, messages, {
  heroAwarded = 0,
  potSize = won,
  awardsByPosition = null,
} = {}) {
  winners.forEach(player => {
    player.wins = (player.wins || 0) + 1;
  });
  state.pot = 0;
  state.handOver = true;
  state.street = "結算";
  state.winners = winners.map(player => player.name);
  state.waitingForHuman = false;
  state.actionPulse = "win";
  state.winAmount = won;
  completeHeroStyleHand({ showdown: true, won: heroAwarded > 0, potSize, wonAmount: heroAwarded });
  for (const seat of state.players) {
    if (!seat.folded) {
      seat.status = getVisibleHandRank(seat);
    }
  }

  const talker = winners.find(player => !player.isHuman);
  if (talker) {
    say(talker, "win", { force: true });
  } else {
    tableTalk("lose", { chance: 0.82 });
  }
  updateAiEmotions(winners);

  !state.isMuted && Audio.win();
  showWinBanner(winners, won, awardsByPosition);
  winners.forEach(player => {
    const awarded = awardsByPosition instanceof Map
      ? (awardsByPosition.get(player.position) || 0)
      : Math.floor(won / Math.max(1, winners.length));
    if (awarded > 0) animateWinChips(player, awarded);
  });
  messages.forEach(message => log(message));
  logScoreboard();
  render();

  if (maybeShowSessionSummary()) return;
  scheduleAutoNewHand();
}

function updateAiEmotions(winners) {
  const winnerPositions = new Set(winners.map(player => player.position));

  for (const player of state.players) {
    if (player.isHuman) continue;

    if (winnerPositions.has(player.position)) {
      player.streak = Math.max(1, (player.streak || 0) + 1);
      player.emotion = player.streak >= 2 ? "confident" : "calm";
      if (player.streak === 2) say(player, "confident", { chance: 0.5 });
      continue;
    }

    player.streak = Math.min(-1, (player.streak || 0) - 1);
    if (player.streak <= -2) {
      player.emotion = player.lastAction === "fold" ? "cautious" : "tilted";
      if (player.streak === -2) say(player, player.emotion, { chance: 0.42 });
    } else if (player.emotion === "fresh") {
      player.emotion = "calm";
    }
  }
}

function getVisibleHandRank(player) {
  if (state.board.length < 3) return player.folded ? "棄牌" : "贏得底池";
  return evaluateBestHand([...player.cards, ...state.board]).name;
}

function syncRaiseControl() {
  const player = human();
  if (!player) return;

  const callAmount = amountToCall(player);
  const availableRaise = Math.max(0, player.stack - callAmount);
  const minRaiseBy = minimumRaiseBy();
  const maxRaise = Math.max(minRaiseBy, Math.floor(availableRaise / 10) * 10);
  const canRaise = !player.raiseLocked && availableRaise >= minRaiseBy;

  els.raiseAmount.min = minRaiseBy;
  els.raiseAmount.max = maxRaise;
  els.raiseAmount.disabled = !canRaise;

  if (!canRaise) {
    els.raiseAmount.value = minRaiseBy;
  } else {
    const current = Number(els.raiseAmount.value);
    els.raiseAmount.value = Math.min(maxRaise, Math.max(minRaiseBy, current));
  }

  els.raiseAmountValue.textContent = canRaise ? els.raiseAmount.value : "—";
  return { canRaise, callAmount };
}

function setQuickBet(mode) {
  const player = human();
  if (!player || player.folded || player.allIn || state.handOver) return;

  const callAmount = amountToCall(player);
  const availableRaise = Math.max(0, player.stack - callAmount);
  if (mode === "allin") {
    els.raiseAmount.value = Math.max(minimumRaiseBy(), Math.floor(availableRaise / 10) * 10);
    syncRaiseControl();
    playerAction("allin");
    return;
  }

  const potSized = {
    third: state.pot / 3,
    half: state.pot / 2,
    pot: state.pot,
  }[mode] || minimumRaiseBy();
  const raiseBy = Math.max(minimumRaiseBy(), Math.round(potSized / 10) * 10);
  els.raiseAmount.value = Math.min(availableRaise, raiseBy);
  syncRaiseControl();
}

function pulsePot(amount) {
  if (!amount) return;
  state.potDelta = amount;
  window.clearTimeout(pulsePot.timer);
  pulsePot.timer = window.setTimeout(() => {
    state.potDelta = 0;
    render();
  }, 850);
}

function chipMotionPoint(element) {
  if (!els.fxLayer || !element) return null;
  const layerRect = els.fxLayer.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (!layerRect.width || !layerRect.height || (!rect.width && !rect.height)) return null;

  return {
    x: rect.left - layerRect.left + rect.width / 2,
    y: rect.top - layerRect.top + rect.height / 2,
  };
}

function firstChipMotionPoint(candidates) {
  for (const element of candidates) {
    const point = chipMotionPoint(element);
    if (point) return point;
  }
  return null;
}

function chipMotionPointForPlayer(player) {
  if (!player) return null;
  if (player.isHuman) {
    return firstChipMotionPoint([
      els.playerStackChips,
      els.heroTableStack,
      els.playerPanel,
    ]);
  }

  const seat = els.opponents?.querySelector(`.seat[data-profile-position="${player.position}"]`);
  return firstChipMotionPoint([
    seat?.querySelector(".mini-chip-stack"),
    seat?.querySelector(".seat-meta"),
    seat?.querySelector(".seat-identity"),
    seat,
  ]);
}

function resolveChipMotionGeometry(player) {
  const playerPoint = chipMotionPointForPlayer(player);
  const potPoint = chipMotionPoint(els.potChip);
  if (!playerPoint || !potPoint) return null;
  return { player: playerPoint, pot: potPoint };
}

function playLiveChipMotion(chip, from, to, {
  duration,
  delay,
  revealOffset,
  fromOffsetX = 0,
  fromOffsetY = 0,
  toOffsetX = 0,
  toOffsetY = 0,
  startScale = 0.72,
  endScale = 0.6,
} = {}) {
  if (!chip || typeof chip.animate !== "function") return false;

  const travelX = to.x - from.x;
  const travelY = to.y - from.y;
  const startTransform = `translate(calc(-50% + ${fromOffsetX}px), calc(-50% + ${fromOffsetY}px)) scale(${startScale})`;
  const endTransform = `translate(calc(-50% + ${travelX + toOffsetX}px), calc(-50% + ${travelY + toOffsetY}px)) scale(${endScale})`;

  chip.dataset.motionGeometry = "live";
  chip.style.left = `${from.x}px`;
  chip.style.top = `${from.y}px`;
  chip.style.animation = "none";
  chip.animate([
    { opacity: 0, transform: startTransform, offset: 0 },
    { opacity: 1, transform: startTransform, offset: revealOffset },
    { opacity: 0, transform: endTransform, offset: 1 },
  ], {
    duration,
    delay,
    easing: "ease",
    fill: "both",
  });
  return true;
}

function animateChips(player, amount) {
  if (!els.fxLayer || !amount) return;
  const source = player.isHuman ? "from-human" : `from-seat-${Math.max(1, player.position)}`;
  const geometry = resolveChipMotionGeometry(player);
  const chipCount = Math.min(7, Math.max(2, Math.ceil(amount / 120)));
  const chipColors = ["chip-gold", "chip-red", "chip-cyan", "chip-blue"];

  for (let i = 0; i < chipCount; i++) {
    const chip = document.createElement("span");
    const spread = i - (chipCount - 1) / 2;
    const delay = i * 38;
    const jitterX = spread * 8;
    const jitterY = (i % 2 ? -1 : 1) * 7;
    const potSpreadX = spread * 3;
    chip.className = `flying-chip ${source} ${chipColors[i % chipColors.length]}`;
    chip.dataset.amount = String(amount);
    chip.dataset.playerPosition = String(player.position);
    chip.textContent = i === 0 ? "+" + amount : "";

    if (geometry && typeof chip.animate === "function") {
      els.fxLayer.appendChild(chip);
      playLiveChipMotion(chip, geometry.player, geometry.pot, {
        duration: 820,
        delay,
        revealOffset: 0.18,
        fromOffsetX: jitterX,
        fromOffsetY: jitterY,
        toOffsetX: potSpreadX,
        startScale: 0.78,
        endScale: 0.55,
      });
    } else {
      chip.style.animationDelay = `${delay}ms`;
      chip.style.setProperty("--chip-jitter-x", `${jitterX}px`);
      chip.style.setProperty("--chip-jitter-y", `${jitterY}px`);
      chip.style.setProperty("--chip-pot-x", `${potSpreadX}px`);
      els.fxLayer.appendChild(chip);
    }

    window.setTimeout(() => chip.remove(), 980 + delay);
  }
}

function animateWinChips(player, amount) {
  if (!els.fxLayer || !amount) return;
  const target = player.isHuman ? "to-human" : `to-seat-${Math.max(1, player.position)}`;
  const geometry = resolveChipMotionGeometry(player);
  const chipCount = Math.min(14, Math.max(7, Math.ceil(amount / 180)));
  const chipColors = ["chip-gold", "chip-red", "chip-cyan", "chip-blue"];

  for (let i = 0; i < chipCount; i++) {
    const chip = document.createElement("span");
    const spread = i - (chipCount - 1) / 2;
    const delay = i * 42;
    const jitterX = spread * 7;
    const jitterY = (i % 3 - 1) * 9;
    chip.className = `win-chip ${target} ${chipColors[i % chipColors.length]}`;
    chip.dataset.amount = String(amount);
    chip.dataset.playerPosition = String(player.position);

    if (geometry && typeof chip.animate === "function") {
      els.fxLayer.appendChild(chip);
      playLiveChipMotion(chip, geometry.pot, geometry.player, {
        duration: 1050,
        delay,
        revealOffset: 0.15,
        toOffsetX: jitterX,
        toOffsetY: jitterY,
        startScale: 0.6,
        endScale: 0.9,
      });
    } else {
      chip.style.animationDelay = `${delay}ms`;
      chip.style.setProperty("--win-jitter-x", `${jitterX}px`);
      chip.style.setProperty("--win-jitter-y", `${jitterY}px`);
      els.fxLayer.appendChild(chip);
    }

    window.setTimeout(() => chip.remove(), 1300 + delay);
  }
}

function showWinBanner(winners, amount, awardsByPosition = null) {
  if (!els.showdownBanner || !winners.length) return;
  const label = winners.map(player => `${player.emoji} ${player.name}`).join("、");
  const hasExactBreakdown = winners.length > 1 && awardsByPosition instanceof Map;
  const detail = hasExactBreakdown
    ? winners.map(player => {
      const awarded = awardsByPosition.get(player.position) || 0;
      return `${player.name}：${getVisibleHandRank(player)} +${awarded}`;
    }).join(" ｜ ")
    : `${getVisibleHandRank(winners[0])} · +${amount}`;
  const titleNode = document.createElement("span");
  const labelNode = document.createElement("strong");
  const detailNode = document.createElement("em");
  titleNode.textContent = hasExactBreakdown ? "WINNERS" : "WINNER";
  labelNode.textContent = label;
  detailNode.textContent = detail;
  els.showdownBanner.replaceChildren(titleNode, labelNode, detailNode);
  els.showdownBanner.classList.remove("is-visible");
  void els.showdownBanner.offsetWidth;
  els.showdownBanner.classList.add("is-visible");
  window.clearTimeout(showWinBanner.timer);
  showWinBanner.timer = window.setTimeout(() => {
    els.showdownBanner.classList.remove("is-visible");
  }, 2400);
}

function announceAction(label, type = "call") {
  state.actionPulse = type;
  announce(label);
  window.clearTimeout(announceAction.timer);
  announceAction.timer = window.setTimeout(() => {
    if (state.actionPulse === type) {
      state.actionPulse = null;
      render();
    }
  }, 900);
}

function playerLabel(player) {
  return player.name;
}

function playerLogIcon(player) {
  return player.emoji || "";
}

function actionLogLabel(action) {
  const labels = {
    Fold: "棄牌",
    Check: "過牌",
    Call: "跟注",
    Raise: "加注",
    "All-in": "All-in",
    "All-in Call": "All-in 跟注",
    "All-in Raise": "All-in 加注",
  };
  return labels[action] || action;
}

function logAction(player, action, amount = 0, note = "") {
  const value = amount ? " " + amount : "";
  const suffix = note ? " (" + note + ")" : "";
  log(`${playerLogIcon(player)} ${playerLabel(player)} ${actionLogLabel(action)}${value}${suffix}`);
}

function streetLabel() {
  return STREET_LABELS[state.street] || state.street.toUpperCase();
}

function compactSeatStatus(status) {
  if (!status) return "";
  if (status.includes("Thinking")) return "思考";
  if (status.startsWith("小盲")) return status.replace("小盲", "SB");
  if (status.startsWith("大盲")) return status.replace("大盲", "BB");
  if (status.startsWith("加注到")) return status.replace("加注到", "加注");
  if (status.startsWith("需跟注")) return status.replace("需跟注", "補");
  if (status.startsWith("ALL-IN")) return status.replace("ALL-IN", "All-in");
  return status;
}

function seatActionMeta(player) {
  const status = player?.status || "";
  const amount = status.match(/\d+/)?.[0] || "";
  if (!player || status.includes("Thinking")) return { type: "thinking", label: "思考", amount: "" };
  if (player.folded || status === "棄牌") return { type: "fold", label: "棄牌", amount: "" };
  if (status.startsWith("ALL-IN")) return { type: "allin", label: "All-in", amount: amount || player.bet || "" };
  if (status.startsWith("加注")) return { type: "raise", label: "加注", amount };
  if (status.startsWith("跟注")) return { type: "call", label: "跟注", amount };
  if (status.startsWith("小盲")) return { type: "blind", label: "小盲", amount };
  if (status.startsWith("大盲")) return { type: "blind", label: "大盲", amount };
  if (status.startsWith("需跟注")) return { type: "pending", label: "待跟", amount };
  if (status.startsWith("贏得")) return { type: "win", label: "勝利", amount: "" };
  if (status.startsWith("準備下一輪")) return { type: "ready", label: "下一輪", amount: "" };
  if (status === "過牌") return { type: "check", label: "過牌", amount: "" };
  if (status === "等待行動") return { type: "waiting", label: "待行動", amount: "" };
  if (status === "準備行動") return { type: "ready", label: "準備", amount: "" };
  return { type: "neutral", label: compactSeatStatus(status), amount: "" };
}

function scheduleAutoNewHand() {
  clearAutoNewHandTimer();
  if (!state.autoNewHand) return;
  state.autoNewHandTimer = window.setTimeout(startHand, AUTO_NEW_HAND_DELAY);
}

function clearAutoNewHandTimer() {
  if (!state.autoNewHandTimer) return;
  window.clearTimeout(state.autoNewHandTimer);
  state.autoNewHandTimer = null;
}

function logScoreboard() {
  const standings = [...state.players]
    .sort((a, b) => b.stack - a.stack)
    .map(p => `${p.name} ${p.stack}`)
    .join(" · ");
  log("籌碼排行：" + standings);
}