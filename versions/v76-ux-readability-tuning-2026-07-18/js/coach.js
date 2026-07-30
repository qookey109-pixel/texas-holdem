// Poker coach analysis
function coachBoardKey() {
  return state.board.length ? state.board.map(cardKey).join("|") : "preflop";
}

function coachCardsKey(cards = []) {
  return cards.map(cardKey).join("|");
}

function coachAnalysisKey(player) {
  if (!player) return "no-player";
  const opponentState = state.players
    .filter(p => !p.isHuman)
    .map(p => `${p.name}:${p.folded ? 1 : 0}:${p.allIn ? 1 : 0}`)
    .join(",");

  return [
    state.handNumber,
    state.street,
    coachCardsKey(player.cards),
    coachBoardKey(),
    state.handOver ? 1 : 0,
    player.folded ? 1 : 0,
    player.bet,
    player.stack,
    state.pot,
    state.currentBet,
    opponentState,
  ].join(";");
}

function calculateOuts(player) {
  if (!player || player.folded || state.board.length < 3 || state.board.length >= 5) return 0;
  const known = new Set([...player.cards, ...state.board].map(cardKey));
  const current = evaluateBestHand([...player.cards, ...state.board]);
  return createDeck()
    .filter(card => !known.has(cardKey(card)))
    .reduce((count, card) => {
      const next = evaluateBestHand([...player.cards, ...state.board, card]);
      return count + (next.score > current.score ? 1 : 0);
    }, 0);
}

function calculatePotOdds(player) {
  if (!player || player.folded || state.handOver) return 0;
  const callAmount = amountToCall(player);
  if (callAmount <= 0) return 0;
  return (callAmount / Math.max(1, state.pot + callAmount)) * 100;
}

function estimateHeroWinRate(outsOverride = null) {
  const player = human();
  if (!player || player.folded) return 0;
  const opponents = activePlayers().filter(p => !p.isHuman).length;
  if (opponents === 0 && activePlayers().includes(player)) return 100;

  if (state.board.length < 3) {
    const preflop = estimateStrength(player);
    return Math.round(clamp((0.24 + preflop * 0.64 - opponents * 0.025) * 100, 7, 84));
  }

  const result = evaluateBestHand([...player.cards, ...state.board]);
  const outs = outsOverride ?? calculateOuts(player);
  const cardsToCome = 5 - state.board.length;
  const madeHandBase = [24, 42, 58, 68, 73, 78, 88, 94, 98, 99];
  const drawBoost = cardsToCome >= 2 ? outs * 2.5 : (cardsToCome === 1 ? outs * 1.25 : 0);
  const topCardBoost = result.tiebreakers[0] ? (result.tiebreakers[0] - 10) * 1.1 : 0;
  const opponentPressure = Math.min(24, opponents * 3.4);
  return Math.round(clamp(madeHandBase[result.score] + drawBoost + topCardBoost - opponentPressure, 2, 99));
}

function getCoachAnalysis(player) {
  const key = coachAnalysisKey(player);
  const cached = state.coach.analysisCache;
  if (cached?.key === key && cached.data) return cached.data;

  const outs = calculateOuts(player);
  const data = {
    winRate: estimateHeroWinRate(outs),
    outs,
    potOdds: calculatePotOdds(player),
  };
  state.coach.analysisCache = { key, data };
  return data;
}

function updateCoachTrend(winRate) {
  const key = coachBoardKey();
  if (state.coach.lastBoardKey !== key) {
    state.coach.previousWinRate = state.coach.lastWinRate;
    state.coach.lastWinRate = winRate;
    state.coach.lastBoardKey = key;
  } else if (state.coach.lastWinRate == null) {
    state.coach.lastWinRate = winRate;
  }

  if (state.coach.previousWinRate == null) {
    return state.board.length ? "新街道估算" : "翻牌前估算";
  }

  const diff = Math.round(state.coach.lastWinRate - state.coach.previousWinRate);
  if (Math.abs(diff) < 1) return "勝率持平";
  return diff > 0 ? "勝率 +" + diff + "%" : "勝率 " + diff + "%";
}

function coachStarsFor(edge) {
  const count = clamp(Math.round(2 + Math.abs(edge) / 12), 1, 5);
  return "★".repeat(count) + "☆".repeat(5 - count);
}

function buildCoachAdvice(winRate, potOdds, outs) {
  const player = human();
  if (!player) return { action: "--", stars: "☆☆☆☆☆", text: "等待新牌局開始。" };
  if (player.folded) {
    return { action: "觀察", stars: "★★☆☆☆", text: "你已經棄牌。現在最值得看的是誰在壓力下繼續下注，下一手可以記住這些節奏。" };
  }
  if (state.handOver) {
    const result = state.board.length >= 3 ? evaluateBestHand([...player.cards, ...state.board]).name : "未攤牌";
    const won = state.winners.includes(player.name);
    return {
      action: won ? "Review" : "復盤",
      stars: won ? "★★★★☆" : "★★★☆☆",
      text: won ? `這手以 ${result} 收下結果。下一步可以回看哪一次下注讓對手付出最多。` : `這手最後是 ${result}。先看 Pot Odds 和下注壓力，找出是否有太貴的跟注。`,
    };
  }

  const callAmount = amountToCall(player);
  const availableRaise = Math.max(0, player.stack - callAmount);
  const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
  const canAct = state.waitingForHuman && state.currentActorIndex === 0;
  const edge = winRate - potOdds;

  if (!canAct) {
    return {
      action: "觀察",
      stars: "★★★☆☆",
      text: `目前估計勝率 ${winRate}%。先看對手下注大小，若面對大注，Pot Odds 會是關鍵。`,
    };
  }

  if (callAmount > 0) {
    if (edge < 8 && outs < 8) {
      return {
        action: "Fold",
        stars: coachStarsFor(edge),
        text: `跟注 ${callAmount} 需要約 ${Math.round(potOdds)}% 勝率；目前估計 ${winRate}%，Outs ${outs}。這價格偏貴，Fold 比較乾淨。`,
      };
    }
    if (edge >= 24 && canRaise) {
      return {
        action: "Raise",
        stars: coachStarsFor(edge),
        text: `目前勝率 ${winRate}% 明顯高於 Pot Odds ${Math.round(potOdds)}%。可以加注拿價值，也讓聽牌對手付費。`,
      };
    }
    return {
      action: "Call",
      stars: coachStarsFor(edge),
      text: `跟注 ${callAmount} 的價格可接受。估計勝率 ${winRate}%、Pot Odds ${Math.round(potOdds)}%、Outs ${outs}，先跟住比較穩。`,
    };
  }

  if (winRate >= 67 && canRaise) {
    return {
      action: "Raise",
      stars: "★★★★☆",
      text: `不用補注，但目前牌力偏強。可以主動加注，把弱牌和聽牌的價格拉高。`,
    };
  }

  return {
    action: "Check",
    stars: "★★★☆☆",
    text: `現在可以免費看下一張。估計勝率 ${winRate}%，沒有必要硬把底池做大。`,
  };
}

function renderCoach() {
  if (!els.coachPanel || !state.players.length) return;
  const coach = state.coach;
  els.coachEnabled.checked = coach.enabled;
  els.coachOddsToggle.checked = coach.odds;
  els.coachAdviceToggle.checked = coach.advice;
  if (els.coachToggleText) els.coachToggleText.textContent = coach.enabled ? "ON" : "OFF";
  const hasAnyCoachModule = coach.odds || coach.advice;
  els.coachPanel.classList.toggle("is-disabled", !coach.enabled);
  els.coachPanel.classList.toggle("is-empty", coach.enabled && !hasAnyCoachModule);
  els.coachContent.hidden = !coach.enabled || !hasAnyCoachModule;
  if (!coach.enabled) return;

  els.coachOddsCard.hidden = !coach.odds;
  els.coachAdviceCard.hidden = !coach.advice;
  if (!hasAnyCoachModule) return;

  const player = human();
  const { winRate, outs, potOdds } = getCoachAnalysis(player);
  const trend = updateCoachTrend(winRate);
  const advice = buildCoachAdvice(winRate, potOdds, outs);

  els.coachWinRate.textContent = winRate + "%";
  els.coachWinMeter.style.width = winRate + "%";
  els.coachOuts.textContent = outs;
  els.coachPotOdds.textContent = Math.round(potOdds) + "%";
  els.coachTrend.textContent = trend;

  els.coachBestAction.textContent = advice.action;
  els.coachStars.textContent = advice.stars;
  els.coachAdviceText.innerHTML = formatCoachAdviceText(advice.text);
}

function formatCoachAdviceText(text) {
  const escaped = escapeHtml(text || "");
  const sentences = escaped.match(/[^。；]+[。；]?/g) || [escaped];
  return sentences
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .map(sentence => `<span class="coach-sentence">${highlightCoachKeywords(sentence)}</span>`)
    .join("");
}

function highlightCoachKeywords(text) {
  return text.replace(
    /(\d+(?:\.\d+)?%?|Pot Odds|Outs|Fold|Call|Raise|Check|All-in|勝率|跟注|加注|棄牌|底池|免費|價格偏貴|可接受|牌力偏強|壓力|聽牌)/g,
    '<strong class="coach-key">$1</strong>'
  );
}
