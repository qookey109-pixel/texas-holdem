// Fair seven-star special bosses: public information, revealed showdowns, and probabilistic range inference only.
(() => {
  "use strict";

  if (window.FairSpecialBosses?.version === "2.0.0") return;

  const VERSION = "2.0.0";
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  const SHOWDOWN_STORAGE_KEY = "texasHoldemPublicShowdownModelV2";
  const MAX_SHOWDOWN_SAMPLES = 40;
  const RANGE_KEYS = ["premium", "strong", "medium", "speculative", "bluff"];
  const BASE_RANGE = Object.freeze({
    premium: 0.08,
    strong: 0.17,
    medium: 0.28,
    speculative: 0.27,
    bluff: 0.2,
  });

  let installTimer = 0;
  let lastDecision = null;
  let showdownRecorderInstalled = false;
  let lastRecordedShowdownKey = "";

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cardKey(card) {
    return `${Number(card?.value) || 0}${card?.suit || ""}`;
  }

  function normalizeRange(range) {
    const normalized = {};
    let total = 0;
    for (const key of RANGE_KEYS) {
      normalized[key] = Math.max(0.005, Number(range?.[key]) || 0);
      total += normalized[key];
    }
    for (const key of RANGE_KEYS) normalized[key] /= total;
    return normalized;
  }

  function heroHabits() {
    const stats = state?.heroStyle || {};
    const hands = Math.max(1, Number(stats.hands) || 0);
    const model = readPublicShowdownModel();
    return {
      sample: Number(stats.hands) || 0,
      foldRate: (Number(stats.folds) || 0) / hands,
      callRate: (Number(stats.calls) || 0) / hands,
      raiseRate: (Number(stats.raises) || 0) / hands,
      allInRate: (Number(stats.allIns) || 0) / hands,
      vpipRate: (Number(stats.vpip) || 0) / hands,
      showdownRate: (Number(stats.showdowns) || 0) / hands,
      publicShowdowns: model.samples.length,
    };
  }

  function boardTexture() {
    const board = state?.board || [];
    const suits = new Map();
    const values = board.map(card => Number(card.value)).sort((a, b) => a - b);
    board.forEach(card => suits.set(card.suit, (suits.get(card.suit) || 0) + 1));
    const maxSuit = Math.max(0, ...suits.values());
    let connected = 0;
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] - values[index - 1] <= 2) connected += 1;
    }
    return {
      cards: board.length,
      paired: new Set(values).size < values.length,
      flushPressure: maxSuit >= 3,
      connectedness: values.length > 1 ? connected / (values.length - 1) : 0,
    };
  }

  function emptyPublicShowdownModel() {
    return {
      schemaVersion: 2,
      samples: [],
      updatedAt: 0,
    };
  }

  function sanitizeShowdownSample(sample) {
    if (!sample || !Array.isArray(sample.cards) || sample.cards.length !== 2) return null;
    const cards = sample.cards.map(card => ({
      value: Number(card?.value) || 0,
      suit: String(card?.suit || ""),
    }));
    if (cards.some(card => card.value < 2 || card.value > 14 || !card.suit)) return null;
    return {
      handNumber: Math.max(0, Number(sample.handNumber) || 0),
      cards,
      bucket: RANGE_KEYS.includes(sample.bucket) ? sample.bucket : holeBucket(cards),
      raised: Boolean(sample.raised),
      allIn: Boolean(sample.allIn),
      called: Boolean(sample.called),
      checked: Boolean(sample.checked),
      position: String(sample.position || ""),
      recordedAt: Math.max(0, Number(sample.recordedAt) || 0),
    };
  }

  function readPublicShowdownModel() {
    try {
      const raw = localStorage.getItem(SHOWDOWN_STORAGE_KEY);
      if (!raw) return emptyPublicShowdownModel();
      const parsed = JSON.parse(raw);
      const samples = Array.isArray(parsed?.samples)
        ? parsed.samples.map(sanitizeShowdownSample).filter(Boolean).slice(-MAX_SHOWDOWN_SAMPLES)
        : [];
      return {
        schemaVersion: 2,
        samples,
        updatedAt: Math.max(0, Number(parsed?.updatedAt) || 0),
      };
    } catch (error) {
      return emptyPublicShowdownModel();
    }
  }

  function savePublicShowdownModel(model) {
    const safeModel = {
      schemaVersion: 2,
      samples: (model?.samples || []).map(sanitizeShowdownSample).filter(Boolean).slice(-MAX_SHOWDOWN_SAMPLES),
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(SHOWDOWN_STORAGE_KEY, JSON.stringify(safeModel));
    } catch (error) {
      // The current session can continue when browser storage is unavailable.
    }
    return safeModel;
  }

  function resetPublicShowdownModel() {
    try {
      localStorage.removeItem(SHOWDOWN_STORAGE_KEY);
    } catch (error) {
      // Nothing to clear when storage is unavailable.
    }
    lastRecordedShowdownKey = "";
    return emptyPublicShowdownModel();
  }

  function holeBucket(cards) {
    if (!Array.isArray(cards) || cards.length !== 2) return "medium";
    const [high, low] = [...cards].sort((left, right) => Number(right.value) - Number(left.value));
    const pair = high.value === low.value;
    const suited = high.suit === low.suit;
    const gap = Math.abs(Number(high.value) - Number(low.value));

    if ((pair && high.value >= 10) || (high.value === 14 && low.value >= 12)) return "premium";
    if ((pair && high.value >= 6) || (high.value >= 12 && low.value >= 10) || (suited && high.value >= 12 && low.value >= 9)) return "strong";
    if (pair || (high.value >= 10 && low.value >= 8) || (suited && gap <= 2)) return "medium";
    if (suited || gap <= 2 || high.value >= 11) return "speculative";
    return "bluff";
  }

  function recordPublicShowdown() {
    if (!state?.handOver || state?.board?.length !== 5) return false;
    const hero = state?.players?.find(candidate => candidate?.isHuman) || null;
    if (!hero || hero.folded || !Array.isArray(hero.cards) || hero.cards.length !== 2) return false;

    const key = `${state.handNumber}:${hero.cards.map(cardKey).join("-")}:${state.board.map(cardKey).join("-")}`;
    if (key === lastRecordedShowdownKey) return false;
    lastRecordedShowdownKey = key;

    const tracker = state.heroCurrentHand || {};
    const sample = sanitizeShowdownSample({
      handNumber: state.handNumber,
      cards: hero.cards,
      bucket: holeBucket(hero.cards),
      raised: tracker.raised,
      allIn: tracker.allIn,
      called: tracker.called,
      checked: tracker.checked,
      position: typeof positionLabel === "function" ? positionLabel(hero) : "",
      recordedAt: Date.now(),
    });
    if (!sample) return false;

    const model = readPublicShowdownModel();
    model.samples.push(sample);
    savePublicShowdownModel(model);
    return true;
  }

  function installShowdownRecorder() {
    if (showdownRecorderInstalled) return true;
    if (typeof finishShowdown !== "function") return false;
    showdownRecorderInstalled = true;
    const originalFinishShowdown = finishShowdown;
    finishShowdown = function finishShowdownWithPublicRangeMemory(...args) {
      const result = originalFinishShowdown.apply(this, args);
      recordPublicShowdown();
      return result;
    };
    return true;
  }

  function historicalRangePrior() {
    const model = readPublicShowdownModel();
    if (!model.samples.length) return normalizeRange(BASE_RANGE);
    const counts = Object.fromEntries(RANGE_KEYS.map(key => [key, 1]));
    for (const sample of model.samples) counts[sample.bucket] += 1;
    return normalizeRange(counts);
  }

  function inferHeroRange() {
    const habits = heroHabits();
    const tracker = state?.heroCurrentHand || {};
    const hero = state?.players?.find(candidate => candidate?.isHuman) || null;
    const historical = historicalRangePrior();
    const historyWeight = Math.min(0.34, habits.publicShowdowns * 0.025);
    const range = {};
    for (const key of RANGE_KEYS) {
      range[key] = BASE_RANGE[key] * (1 - historyWeight) + historical[key] * historyWeight;
    }

    if (tracker.raised) {
      range.premium += 0.1;
      range.strong += 0.11;
      range.medium -= 0.08;
      range.speculative -= 0.06;
      range.bluff += habits.raiseRate >= 0.38 ? 0.035 : 0;
    }
    if (tracker.allIn) {
      range.premium += 0.18;
      range.strong += 0.12;
      range.medium -= 0.12;
      range.speculative -= 0.1;
      range.bluff += habits.allInRate >= 0.18 ? 0.06 : 0;
    }
    if (tracker.called) {
      range.medium += 0.08;
      range.speculative += 0.07;
      range.premium -= 0.04;
      range.bluff -= 0.025;
    }
    if (tracker.checked && !tracker.raised) {
      range.medium += 0.04;
      range.bluff += 0.045;
      range.premium -= 0.035;
    }

    const contributionBb = (Number(hero?.totalContribution) || 0) / Math.max(1, currentBigBlind());
    if (contributionBb >= 6) {
      range.premium += 0.07;
      range.strong += 0.08;
      range.bluff += habits.raiseRate >= 0.4 ? 0.035 : 0;
    }
    if (habits.foldRate >= 0.45) range.bluff -= 0.025;
    if (habits.callRate >= 0.45) {
      range.medium += 0.035;
      range.speculative += 0.03;
    }
    return normalizeRange(range);
  }

  function fairBeliefDeck(player) {
    const known = new Set([
      ...(player?.cards || []),
      ...(state?.board || []),
    ].map(cardKey));
    return createDeck().filter(card => !known.has(cardKey(card)));
  }

  function sampleDistinct(cards, count) {
    const pool = [...cards];
    const output = [];
    const limit = Math.min(Math.max(0, count), pool.length);
    for (let index = 0; index < limit; index += 1) {
      const choice = index + Math.floor(Math.random() * (pool.length - index));
      [pool[index], pool[choice]] = [pool[choice], pool[index]];
      output.push(pool[index]);
    }
    return output;
  }

  function estimateFairEquity(player, { samples = 84 } = {}) {
    if (!player || !Array.isArray(player.cards) || player.cards.length !== 2) return 0.5;
    const board = [...(state?.board || [])];
    const futureCount = Math.max(0, 5 - board.length);
    const beliefDeck = fairBeliefDeck(player);
    const inferredRange = inferHeroRange();
    const iterations = Math.max(24, Math.min(140, Number(samples) || 84));
    let weightedWins = 0;
    let totalWeight = 0;

    for (let index = 0; index < iterations; index += 1) {
      const sampled = sampleDistinct(beliefDeck, 2 + futureCount);
      if (sampled.length < 2 + futureCount) continue;
      const opponentCards = sampled.slice(0, 2);
      const finalBoard = [...board, ...sampled.slice(2)];
      const ownResult = evaluateBestHand([...player.cards, ...finalBoard]);
      const opponentResult = evaluateBestHand([...opponentCards, ...finalBoard]);
      const bucket = holeBucket(opponentCards);
      const weight = clampValue(inferredRange[bucket] / BASE_RANGE[bucket], 0.2, 5);
      const comparison = compareResults(ownResult, opponentResult);
      weightedWins += weight * (comparison > 0 ? 1 : (comparison === 0 ? 0.5 : 0));
      totalWeight += weight;
    }

    const headsUpEquity = totalWeight > 0 ? weightedWins / totalWeight : clampValue(estimateStrength(player), 0, 1);
    const activeOpponents = Math.max(
      1,
      (state?.players || []).filter(candidate => candidate !== player && !candidate.folded).length,
    );
    return clampValue(headsUpEquity - Math.max(0, activeOpponents - 1) * 0.045, 0.02, 0.98);
  }

  function publicContext(player) {
    const habits = heroHabits();
    const texture = boardTexture();
    const hero = state?.players?.find(candidate => candidate?.isHuman) || null;
    return {
      actor: player?.name || "",
      street: state?.street || "",
      board: (state?.board || []).map(card => ({ value: card.value, suit: card.suit })),
      pot: Number(state?.pot) || 0,
      currentBet: Number(state?.currentBet) || 0,
      needed: typeof amountToCall === "function" ? amountToCall(player) : 0,
      position: typeof positionLabel === "function" ? positionLabel(player) : "",
      stack: Number(player?.stack) || 0,
      ownCards: (player?.cards || []).map(card => ({ value: card.value, suit: card.suit })),
      heroLastAction: hero?.lastAction || "",
      heroPublicStatus: hero?.status || "",
      heroContribution: Number(hero?.totalContribution) || 0,
      activePlayers: (state?.players || []).filter(candidate => !candidate.folded).length,
      habits,
      texture,
      inferredRange: inferHeroRange(),
      publicShowdownSamples: habits.publicShowdowns,
    };
  }

  function chooseDecision(player) {
    const context = publicContext(player);
    const habits = context.habits;
    const texture = context.texture;
    const sampleCount = player.name === "Chronos" ? 116 : 96;
    const equity = estimateFairEquity(player, { samples: sampleCount });
    const bigBlind = Math.max(1, currentBigBlind());
    const needed = context.needed;
    const potOdds = needed / Math.max(1, context.pot + needed);
    const stackBb = context.stack / bigBlind;
    const positionBonus = { BTN: 0.04, CO: 0.03, HJ: 0.018, MP: 0.008, UTG: -0.018, SB: -0.01, BB: 0 }[context.position] || 0;
    const multiwayPenalty = Math.max(0, context.activePlayers - 2) * 0.025;
    const wetBoardPenalty = (texture.flushPressure ? 0.012 : 0) + texture.connectedness * 0.012;
    const calibratedEquity = clampValue(equity + positionBonus - multiwayPenalty - wetBoardPenalty, 0.01, 0.99);

    const sampleWeight = clampValue(habits.sample / 20, 0, 1);
    const foldExploit = (habits.foldRate - 0.3) * 0.24 * sampleWeight;
    const callPenalty = Math.max(0, habits.callRate - 0.36) * 0.18 * sampleWeight;
    let foldEquity = clampValue(0.24 + foldExploit - callPenalty, 0.08, 0.62);
    if (player.name === "Chronos") foldEquity = foldEquity * 0.7 + 0.1;

    const callEv = calibratedEquity * (context.pot + needed) - (1 - calibratedEquity) * needed;
    const minRaise = minimumRaiseBy();
    const availableRaise = Math.max(0, context.stack - needed);
    const canRaise = !player.raiseLocked && availableRaise >= minRaise;
    const raiseFactor = player.name === "Chronos" ? 0.72 : 0.62;
    const raiseCost = Math.min(
      availableRaise,
      Math.max(minRaise, Math.round((context.pot * raiseFactor + bigBlind) / 10) * 10),
    );
    const raiseEv = canRaise
      ? foldEquity * context.pot
        + (1 - foldEquity) * (
          calibratedEquity * (context.pot + needed + raiseCost)
          - (1 - calibratedEquity) * (needed + raiseCost)
        )
      : Number.NEGATIVE_INFINITY;

    const inferredWeakness = context.inferredRange.bluff + context.inferredRange.speculative * 0.4;
    const bluffFrequency = clampValue(
      (player.name === "Oracle" ? 0.17 : 0.12)
      + foldExploit
      - callPenalty
      + inferredWeakness * 0.06,
      0.04,
      player.name === "Oracle" ? 0.36 : 0.28,
    );
    const mixedBluff = canRaise
      && calibratedEquity < 0.46
      && needed <= context.stack * 0.12
      && stackBb > 18
      && Math.random() < bluffFrequency;
    const strongValue = calibratedEquity >= (state.board.length >= 3 ? 0.57 : 0.7);
    const premiumValue = calibratedEquity >= (state.board.length >= 3 ? 0.74 : 0.84);
    const trap = needed === 0
      && strongValue
      && player.name === "Chronos"
      && Math.random() < 0.2;
    const jam = canRaise
      && premiumValue
      && stackBb <= 13
      && Math.random() < 0.72;

    let action = "call";
    let raiseBy = 0;
    if (needed > 0 && callEv < -(bigBlind * 0.08) && !mixedBluff) {
      action = "fold";
    } else if (!trap && canRaise && (jam || mixedBluff || (strongValue && raiseEv > callEv))) {
      action = "raise";
      raiseBy = jam ? availableRaise : Math.min(availableRaise, Math.max(minRaise, raiseCost));
    }

    lastDecision = {
      actor: player.name,
      action,
      raiseBy,
      equity: calibratedEquity,
      potOdds,
      foldEquity,
      callEv,
      raiseEv,
      context,
    };
    return lastDecision;
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
    say(player, "fold", { chance: 0.22 });
  }

  function performRaise(player, raiseBy) {
    raisePlayer(player, raiseBy);
    if (!state.isMuted) Audio.raise();
    logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
    announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
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
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: 0.2 });
  }

  function fairBossAction(player) {
    player.status = "Thinking...";
    const decision = chooseDecision(player);
    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise") return performRaise(player, decision.raiseBy);
    return performCall(player, amountToCall(player));
  }

  function patchData() {
    for (const name of SPECIAL_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      if (profile) {
        delete profile.omniscient;
        profile.fairPlay = true;
        profile.playerModeling = true;
        profile.publicInformationOnly = true;
        profile.publicShowdownMemory = true;
        profile.rangeInference = true;
        profile.tierStars = 7;
      }
    }

    AI_PROFILE_META.Oracle = {
      title: "全域讀牌者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Oracle 會記住曾攤牌公開的手牌，結合本次公開行動與玩家習慣，持續推估未攤牌範圍並尋找可剝削弱點。",
      traits: [
        "用曾公開的攤牌樣本修正價值牌、跟注牌與詐唬比例",
        "依棄牌、跟注、加注、All-in 與下注投入推估目前範圍",
        "不讀取目前隱藏底牌、實際牌堆順序或未來公共牌",
      ],
    };

    AI_PROFILE_META.Chronos = {
      title: "時間解算者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Chronos 以曾公開攤牌建立範圍先驗，每一街模擬大量可能手牌與未來牌面，再比較 EV、底池賠率與混合策略。",
      traits: [
        "只從未知牌池隨機模擬可能結果，不讀取真正牌堆",
        "每一街重新評估 Call、Raise、Fold 與 All-in 的價值",
        "預測勝率與最可能結果，但不預知任何確定答案",
      ],
    };

    DIALOGUE_BANK.Oracle = {
      ...DIALOGUE_BANK.Oracle,
      join: ["我不需要偷看；你公開過的牌與每一次選擇，已經留下範圍。"],
      raise: ["你的歷史攤牌正在縮小目前範圍。", "這個尺寸，是針對你過去公開的選擇。"],
      river: ["河牌只揭露最後資訊，真正的線索早已留在歷史裡。"],
    };
    DIALOGUE_BANK.Chronos = {
      ...DIALOGUE_BANK.Chronos,
      join: ["我會模擬所有合理未來，但不會偷看真正答案。"],
      raise: ["範圍模擬完成，這是目前最高 EV 的尺寸。", "公開樣本已更新，重新解算完成。"],
      river: ["所有公開資訊已完整，現在只剩決策品質。"],
    };
  }

  function patchPresentationText() {
    const banner = document.querySelector("#specialBossArrivalBanner");
    if (banner && /全知規則|完整牌面走勢|公開紀錄、玩家習慣/.test(banner.textContent || "")) {
      const copy = banner.querySelector("div > span");
      if (copy) copy.textContent = "七星大師模式：公開攤牌、玩家習慣與即時手牌範圍正在重新計算。";
    }
  }

  function install() {
    if (typeof botAction !== "function" || !window.AiTierBossSystem?.version) return false;
    patchData();
    installShowdownRecorder();

    if (window.__fairSpecialBossDecisionVersion !== VERSION) {
      const previousBotAction = window.__fairSpecialBossOriginalBotAction || botAction;
      window.__fairSpecialBossOriginalBotAction = previousBotAction;
      window.__fairSpecialBossDecisionInstalled = true;
      window.__fairSpecialBossDecisionVersion = VERSION;
      botAction = function botActionWithFairSpecialBossesV2(player) {
        if (SPECIAL_NAMES.has(player?.name)) return fairBossAction(player);
        return previousBotAction(player);
      };
    }

    window.AiTierBossSystem.projectedBoard = () => [...(state?.board || [])];
    window.AiTierBossSystem.heroHabits = heroHabits;
    patchPresentationText();
    document.documentElement.dataset.fairSpecialBosses = "ready";
    return true;
  }

  window.FairSpecialBosses = {
    version: VERSION,
    specialNames: [...SPECIAL_NAMES],
    fairInformationPolicy: Object.freeze({
      ownCards: true,
      publicBoard: true,
      publicActions: true,
      revealedShowdowns: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      probabilisticPrediction: true,
    }),
    heroHabits,
    boardTexture,
    holeBucket,
    publicShowdownModel: readPublicShowdownModel,
    recordPublicShowdown,
    resetPublicShowdownModel,
    inferHeroRange,
    estimateFairEquity,
    publicContext,
    chooseDecision,
    getLastDecision: () => lastDecision,
    refresh: () => {
      patchData();
      patchPresentationText();
      return install();
    },
  };

  const observer = new MutationObserver(() => {
    patchData();
    patchPresentationText();
  });

  function boot() {
    if (install()) {
      observer.observe(document.body, { childList: true, subtree: true });
      return;
    }
    window.clearInterval(installTimer);
    installTimer = window.setInterval(() => {
      if (!install()) return;
      window.clearInterval(installTimer);
      installTimer = 0;
      observer.observe(document.body, { childList: true, subtree: true });
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
