// Fair special-boss strategy: public history, range inference, Monte Carlo equity, and mixed EV decisions.
(() => {
  "use strict";

  if (window.FairSpecialBossStrategy?.version) return;

  const VERSION = "1.0.0";
  const SPECIAL_NAMES = Object.freeze(["Oracle", "Chronos"]);
  const FORBIDDEN_INFORMATION = Object.freeze([
    "opponent-hole-cards",
    "deck-order",
    "future-board",
    "precomputed-result",
  ]);

  const FAIR_META = Object.freeze({
    Oracle: Object.freeze({
      title: "全域讀牌者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Oracle 只使用已公開的牌面、下注行動、曾攤牌資訊與玩家累積習慣，建立動態範圍並選擇最具剝削價值的下注線。",
      traits: Object.freeze([
        "依玩家棄牌、跟注與加注頻率調整策略",
        "利用公開下注尺寸推測範圍強弱，不讀取隱藏底牌",
        "用獨立隨機模擬估算勝率，不讀取牌堆或未來公共牌",
      ]),
    }),
    Chronos: Object.freeze({
      title: "範圍解算者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Chronos 以範圍對範圍、底池賠率、有效籌碼與混合策略即時評估局面；資訊不足時採取難以被反向剝削的均衡基準。",
      traits: Object.freeze([
        "每一街根據公開資訊重新估算範圍與 EV",
        "在接近等值的行動間使用混合策略",
        "記住玩家長期與近期傾向，但不知道任何未公開卡牌",
      ]),
    }),
  });

  const FAIR_DIALOGUE = Object.freeze({
    Oracle: Object.freeze({
      join: ["我讀的是你的選擇，不是牌堆。讓我看看你留下了多少習慣。"],
      raise: ["你的下注紀錄讓這個尺寸更有價值。", "我不需要看你的牌，也能縮小你的範圍。"],
      allin: ["公開資訊已經足夠。All-in。", "這不是預言，是你每一步留下的證據。"],
      call: ["價格與範圍吻合，繼續。"],
      check: ["我保留整個範圍，不急著暴露答案。"],
      fold: ["這條線的 EV 不值得投入。"],
      playerFold: ["你的棄牌頻率又留下了一筆資料。"],
      win: ["我贏的是範圍與習慣，不是偷看的牌。"],
      lose: ["樣本更新。下一次模型會更準。"],
      flop: ["牌面公開，範圍開始收斂。"],
      turn: ["轉牌改變的是權重，不是已知答案。"],
      river: ["最後一街，只剩價格與故事能接受檢驗。"],
    }),
    Chronos: Object.freeze({
      join: ["開始解算。所有未知牌都保持未知。"],
      raise: ["這個尺寸讓你的整體範圍最難防守。", "我在比較 EV，不是在讀取結果。"],
      allin: ["有效籌碼與範圍已對齊。All-in。", "混合策略在這裡選擇最大壓力。"],
      call: ["底池賠率允許這個防守頻率。"],
      check: ["過牌也是範圍的一部分。"],
      fold: ["負 EV 分支已移除。"],
      playerFold: ["你的防守頻率低於這個尺寸需要的門檻。"],
      win: ["範圍、價格、位置，三項已收斂。"],
      lose: ["結果有波動，策略不因單次結果崩解。"],
      flop: ["翻牌後重新計算範圍。"],
      turn: ["轉牌節點已重新解算。"],
      river: ["河牌沒有未來資訊，只剩最終 EV。"],
    }),
  });

  let originalBotAction = null;
  let originalAiProfileMeta = null;
  let observer = null;
  let installTimer = 0;
  let visualFrame = 0;
  let lastDecisionAudit = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cardId(card) {
    return `${Number(card?.value) || 0}${card?.suit || ""}`;
  }

  function publicPlayerModel() {
    const stats = state?.heroStyle || {};
    const sample = Math.max(0, Number(stats.hands) || 0);
    const divisor = Math.max(1, sample);
    const hero = typeof human === "function" ? human() : state?.players?.[0];
    const tracker = state?.heroCurrentHand || {};
    const pot = Math.max(1, Number(state?.pot) || 0);
    const currentContribution = Math.max(0, Number(hero?.totalContribution) || 0);

    return {
      sample,
      confidence: clamp(sample / 12, 0, 1),
      vpipRate: (Number(stats.vpip) || 0) / divisor,
      raiseRate: (Number(stats.raises) || 0) / divisor,
      callRate: (Number(stats.calls) || 0) / divisor,
      checkRate: (Number(stats.checks) || 0) / divisor,
      foldRate: (Number(stats.folds) || 0) / divisor,
      allInRate: (Number(stats.allIns) || 0) / divisor,
      showdownRate: (Number(stats.showdowns) || 0) / divisor,
      winRate: (Number(stats.wins) || 0) / divisor,
      currentAction: String(hero?.lastAction || "none"),
      currentStreet: String(state?.street || "翻牌前"),
      currentPosition: hero && typeof positionLabel === "function" ? positionLabel(hero) : "",
      currentBetRatio: clamp((Number(hero?.bet) || 0) / pot, 0, 4),
      contributionRatio: clamp(currentContribution / pot, 0, 4),
      currentHand: {
        raised: Boolean(tracker.raised),
        called: Boolean(tracker.called),
        checked: Boolean(tracker.checked),
        allIn: Boolean(tracker.allIn),
      },
    };
  }

  function preflopQuality(cards) {
    if (!Array.isArray(cards) || cards.length !== 2) return 0.35;
    const [high, low] = [...cards].sort((a, b) => b.value - a.value);
    const pair = high.value === low.value;
    const suited = high.suit === low.suit;
    const gap = Math.abs(high.value - low.value);
    let quality = (high.value / 14) * 0.42 + (low.value / 14) * 0.2;
    if (pair) quality += 0.24 + (high.value / 14) * 0.12;
    if (suited) quality += 0.08;
    if (gap <= 1) quality += 0.09;
    else if (gap === 2) quality += 0.045;
    if (high.value >= 12 && low.value >= 10) quality += 0.08;
    return clamp(quality, 0.05, 1);
  }

  function heroRangeWeight(cards, model) {
    const quality = preflopQuality(cards);
    const action = model.currentAction;
    const confidence = model.confidence;
    let weight = 0.38 + quality * 0.5;

    if (["raise", "allin"].includes(action) || model.currentHand.raised || model.currentHand.allIn) {
      weight = 0.12 + quality * (0.76 - model.raiseRate * confidence * 0.22);
      weight += model.raiseRate * confidence * 0.2;
    } else if (action === "call" || model.currentHand.called) {
      weight = 0.28 + quality * 0.5 + model.callRate * confidence * 0.14;
    } else if (action === "check" || model.currentHand.checked) {
      weight = 0.55 + quality * 0.2;
    }

    if (model.vpipRate > 0.62) weight += (1 - quality) * 0.12 * confidence;
    if (model.allInRate > 0.18 && action === "allin") weight += quality * 0.14;
    return clamp(weight, 0.04, 0.98);
  }

  function takeRandom(pool) {
    const index = Math.floor(Math.random() * pool.length);
    return pool.splice(index, 1)[0];
  }

  function drawRandomHand(pool) {
    return [takeRandom(pool), takeRandom(pool)];
  }

  function drawHeroRangeHand(pool, model) {
    let fallback = null;
    for (let attempt = 0; attempt < 7 && pool.length >= 2; attempt += 1) {
      const first = takeRandom(pool);
      const second = takeRandom(pool);
      const candidate = [first, second];
      fallback ||= candidate;
      if (Math.random() <= heroRangeWeight(candidate, model)) return candidate;
      pool.push(first, second);
    }
    return fallback || drawRandomHand(pool);
  }

  function fairEquity(player, { iterations } = {}) {
    const ownCards = Array.isArray(player?.cards) ? player.cards : [];
    const board = Array.isArray(state?.board) ? state.board : [];
    if (ownCards.length !== 2) return 0.5;

    const known = new Set([...ownCards, ...board].map(cardId));
    const unknownTemplate = createDeck().filter(card => !known.has(cardId(card)));
    const opponents = (state?.players || []).filter(candidate => candidate !== player && !candidate.folded);
    if (!opponents.length) return 1;

    const model = publicPlayerModel();
    const runCount = Math.max(24, Math.min(120, Number(iterations) || (player.name === "Chronos" ? 72 : 60)));
    let equityTotal = 0;

    for (let simulation = 0; simulation < runCount; simulation += 1) {
      const pool = [...unknownTemplate];
      const sampledHands = opponents.map(opponent => (
        opponent.isHuman ? drawHeroRangeHand(pool, model) : drawRandomHand(pool)
      ));
      const futureBoard = [...board];
      while (futureBoard.length < 5) futureBoard.push(takeRandom(pool));

      const ownResult = evaluateBestHand([...ownCards, ...futureBoard]);
      const opponentResults = sampledHands.map(cards => evaluateBestHand([...cards, ...futureBoard]));
      const comparisons = opponentResults.map(result => compareResults(ownResult, result));
      if (comparisons.every(value => value > 0)) equityTotal += 1;
      else if (comparisons.every(value => value >= 0)) {
        const ties = comparisons.filter(value => value === 0).length;
        equityTotal += 1 / (ties + 1);
      }
    }

    lastDecisionAudit = {
      boss: player.name,
      simulations: runCount,
      knownCards: ownCards.length + board.length,
      sampledOpponents: opponents.length,
      readsDeck: false,
      readsOpponentCards: false,
      readsFutureBoard: false,
      forbiddenInformation: [...FORBIDDEN_INFORMATION],
    };
    return clamp(equityTotal / runCount, 0, 1);
  }

  function boardTexture() {
    const board = Array.isArray(state?.board) ? state.board : [];
    if (board.length < 3) return { wetness: 0.2, paired: false, flushPressure: 0, connectedness: 0 };
    const suitCounts = new Map();
    const valueCounts = new Map();
    for (const card of board) {
      suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
      valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
    }
    const maxSuit = Math.max(...suitCounts.values());
    const values = [...new Set(board.map(card => card.value))].sort((a, b) => a - b);
    let closeLinks = 0;
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] - values[index - 1] <= 2) closeLinks += 1;
    }
    const paired = [...valueCounts.values()].some(count => count >= 2);
    const flushPressure = maxSuit >= 4 ? 1 : (maxSuit === 3 ? 0.65 : 0.2);
    const connectedness = clamp(closeLinks / Math.max(1, values.length - 1), 0, 1);
    return {
      paired,
      flushPressure,
      connectedness,
      wetness: clamp(flushPressure * 0.48 + connectedness * 0.42 + (paired ? 0.1 : 0), 0, 1),
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
    } else if (!state.isMuted) Audio.chip();
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: paid === 0 ? 0.14 : 0.2 });
  }

  function raiseCandidates(player, needed) {
    const bigBlind = Math.max(1, currentBigBlind());
    const availableRaise = Math.max(0, player.stack - needed);
    const minimum = minimumRaiseBy();
    if (player.raiseLocked || availableRaise < minimum) return [];
    const maximum = Math.floor(Math.min(player.stack * 0.58, Math.max(0, availableRaise - bigBlind)) / 10) * 10;
    if (maximum < minimum) return [availableRaise];
    const pot = Math.max(bigBlind * 2, state.pot);
    return [...new Set([
      minimum,
      Math.round((pot * 0.5) / 10) * 10,
      Math.round((pot * 0.75) / 10) * 10,
      Math.round((pot * 1.05) / 10) * 10,
    ].map(value => clamp(value, minimum, maximum)))].sort((a, b) => a - b);
  }

  function evaluateActions(player) {
    const equity = fairEquity(player);
    const model = publicPlayerModel();
    const texture = boardTexture();
    const needed = amountToCall(player);
    const pot = Math.max(1, state.pot);
    const potOdds = needed / Math.max(1, pot + needed);
    const isOracle = player.name === "Oracle";
    const confidence = model.confidence;
    const activeCount = Math.max(1, (state.players || []).filter(candidate => !candidate.folded).length - 1);
    const multiwayPenalty = Math.max(0, activeCount - 1) * 0.018;
    const adjustedEquity = clamp(equity - multiwayPenalty, 0, 1);

    let foldEquity = 0.16 + model.foldRate * 0.46 * confidence - model.callRate * 0.18 * confidence;
    if (model.currentAction === "check") foldEquity += 0.08;
    if (["raise", "allin"].includes(model.currentAction)) foldEquity -= 0.13;
    foldEquity -= texture.wetness * 0.08;
    if (isOracle) foldEquity += (model.foldRate - 0.35) * 0.22 * confidence;
    foldEquity = clamp(foldEquity, 0.04, 0.72);

    const actions = [{ type: "fold", ev: needed > 0 ? 0 : -Infinity }];
    const callEv = needed === 0
      ? adjustedEquity * pot * 0.06
      : adjustedEquity * (pot + needed) - (1 - adjustedEquity) * needed;
    actions.push({ type: needed === 0 ? "check" : "call", ev: callEv });

    for (const raiseBy of raiseCandidates(player, needed)) {
      const risk = Math.min(player.stack, needed + raiseBy);
      const calledExtra = Math.min(raiseBy, Math.max(0, (human()?.stack || 0)));
      let valueEquity = adjustedEquity;
      if (isOracle && model.callRate > 0.42 && adjustedEquity > 0.56) valueEquity += 0.025 * confidence;
      const calledEv = valueEquity * (pot + risk + calledExtra) - (1 - valueEquity) * risk;
      let ev = foldEquity * pot + (1 - foldEquity) * calledEv;
      const sizeRatio = risk / pot;
      if (texture.wetness > 0.72 && adjustedEquity < 0.48 && sizeRatio > 0.8) ev -= pot * 0.08;
      if (isOracle && model.foldRate > 0.45 && adjustedEquity < 0.48) ev += pot * 0.06 * confidence;
      actions.push({ type: "raise", raiseBy, ev });
    }

    actions.sort((a, b) => b.ev - a.ev);
    return { actions, equity: adjustedEquity, model, texture, potOdds, needed, pot };
  }

  function chooseMixedAction(player, analysis) {
    const [best, second] = analysis.actions;
    if (!second || !Number.isFinite(second.ev)) return best;
    const closeness = Math.abs(best.ev - second.ev) / Math.max(1, analysis.pot);
    if (player.name === "Chronos" && closeness <= 0.1) {
      return Math.random() < 0.68 ? best : second;
    }
    if (player.name === "Oracle" && closeness <= 0.055) {
      return Math.random() < 0.86 ? best : second;
    }
    return best;
  }

  function fairBossAction(player) {
    player.status = "Thinking...";
    const analysis = evaluateActions(player);
    let choice = chooseMixedAction(player, analysis);

    if (analysis.needed > 0 && analysis.equity < analysis.potOdds - 0.08 && choice.type !== "raise") {
      choice = { type: "fold", ev: 0 };
    }

    lastDecisionAudit = {
      ...lastDecisionAudit,
      boss: player.name,
      equity: analysis.equity,
      potOdds: analysis.potOdds,
      chosenAction: choice.type,
      chosenRaiseBy: choice.raiseBy || 0,
      publicModelSample: analysis.model.sample,
      publicModelConfidence: analysis.model.confidence,
    };

    if (choice.type === "fold") return performFold(player);
    if (choice.type === "raise") return performRaise(player, choice.raiseBy);
    return performCall(player, analysis.needed);
  }

  function lockFairDataProperty(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: () => {},
      });
    } catch (error) {
      target[key] = value;
    }
  }

  function applyFairData() {
    if (typeof AI_ROSTER === "undefined" || typeof AI_PROFILE_META === "undefined" || typeof DIALOGUE_BANK === "undefined") return false;

    for (const name of SPECIAL_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) {
        profile.style = name === "Oracle" ? "Player Model" : "Range Solver";
        profile.fairPlay = true;
        profile.strategyModel = name === "Oracle" ? "exploitative-public-history" : "balanced-range-ev";
        lockFairDataProperty(profile, "omniscient", false);
        lockFairDataProperty(profile, "usesHiddenInformation", false);
      }
      lockFairDataProperty(AI_PROFILE_META, name, FAIR_META[name]);
      lockFairDataProperty(DIALOGUE_BANK, name, FAIR_DIALOGUE[name]);
    }
    return true;
  }

  function installProfileMetaOverride() {
    if (window.__fairSpecialBossMetaInstalled || typeof aiProfileMeta !== "function") return;
    window.__fairSpecialBossMetaInstalled = true;
    originalAiProfileMeta = aiProfileMeta;
    aiProfileMeta = function fairBossProfileMeta(player) {
      return FAIR_META[player?.name] || originalAiProfileMeta(player);
    };
  }

  function installDecisionOverride() {
    if (window.__fairSpecialBossDecisionInstalled || typeof botAction !== "function" || !window.AiTierBossSystem?.version) return false;
    window.__fairSpecialBossDecisionInstalled = true;
    originalBotAction = botAction;
    botAction = function botActionWithFairSpecialBosses(player) {
      if (SPECIAL_NAMES.includes(player?.name)) return fairBossAction(player);
      return originalBotAction(player);
    };
    return true;
  }

  function installVisualOverrides() {
    if (document.querySelector("#fairSpecialBossStyles")) return;
    const style = document.createElement("style");
    style.id = "fairSpecialBossStyles";
    style.textContent = `
      .seat.special-oracle .ai-tier-seat-badge span,
      #aiProfilePanel.special-oracle-profile .ai-tier-profile-banner span,
      .seat.special-chronos .ai-tier-seat-badge span,
      #aiProfilePanel.special-chronos-profile .ai-tier-profile-banner span { font-size:0 !important; }
      .seat.special-oracle .ai-tier-seat-badge span::after,
      #aiProfilePanel.special-oracle-profile .ai-tier-profile-banner span::after { content:"PLAYER READER"; font-size:.54rem; }
      .seat.special-chronos .ai-tier-seat-badge span::after,
      #aiProfilePanel.special-chronos-profile .ai-tier-profile-banner span::after { content:"RANGE SOLVER"; font-size:.54rem; }
      .special-boss-arrival > div > span { font-size:0 !important; }
      .special-boss-arrival > div > span::after {
        content:"公平七星策略：公開牌面、歷史行動、玩家習慣、範圍推理與 EV 解算。";
        font-size:.65rem; line-height:1.35;
      }
    `;
    document.head.appendChild(style);
  }

  function syncVisibleCopy() {
    const panel = document.querySelector("#aiProfilePanel");
    const selected = state?.players?.find(player => !player.isHuman && player.position === state.selectedProfilePosition);
    if (panel && selected && SPECIAL_NAMES.includes(selected.name) && !panel.hidden) {
      const meta = FAIR_META[selected.name];
      const summary = panel.querySelector(".ai-profile-summary");
      if (summary && summary.textContent !== meta.summary) summary.textContent = meta.summary;
      const list = panel.querySelector(".ai-profile-traits");
      const html = meta.traits.map(trait => `<li>${escapeHtml(trait)}</li>`).join("");
      if (list && list.innerHTML !== html) list.innerHTML = html;
      const styleTag = panel.querySelector(".ai-profile-tags span:nth-child(2)");
      if (styleTag) styleTag.textContent = selected.style;
    }
    document.documentElement.dataset.specialBossFairPlay = "true";
  }

  function scheduleVisualSync() {
    if (visualFrame) return;
    visualFrame = requestAnimationFrame(() => {
      visualFrame = 0;
      applyFairData();
      syncVisibleCopy();
    });
  }

  function removeCheatingApi() {
    if (!window.AiTierBossSystem) return;
    try { delete window.AiTierBossSystem.projectedBoard; } catch (error) { window.AiTierBossSystem.projectedBoard = undefined; }
    Object.assign(window.AiTierBossSystem, {
      fairPlay: true,
      specialBossStrategy: "public-history-range-ev",
      usesHiddenInformation: false,
      publicPlayerModel,
      fairEquity,
      fairnessAudit: () => ({
        fairPlay: true,
        usesHiddenInformation: false,
        readsDeck: false,
        readsOpponentCards: false,
        readsFutureBoard: false,
        forbiddenInformation: [...FORBIDDEN_INFORMATION],
        lastDecision: lastDecisionAudit ? { ...lastDecisionAudit } : null,
      }),
    });
  }

  function install() {
    applyFairData();
    installVisualOverrides();
    installProfileMetaOverride();
    const ready = installDecisionOverride();
    removeCheatingApi();
    syncVisibleCopy();

    if (!observer && document.body) {
      observer = new MutationObserver(scheduleVisualSync);
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    }

    if (ready) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return ready;
  }

  window.FairSpecialBossStrategy = {
    version: VERSION,
    specialNames: [...SPECIAL_NAMES],
    publicPlayerModel,
    fairEquity,
    evaluateActions,
    fairnessAudit: () => ({
      fairPlay: true,
      usesHiddenInformation: false,
      readsDeck: false,
      readsOpponentCards: false,
      readsFutureBoard: false,
      forbiddenInformation: [...FORBIDDEN_INFORMATION],
      lastDecision: lastDecisionAudit ? { ...lastDecisionAudit } : null,
    }),
    refresh: install,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  installTimer = window.setInterval(install, 80);
})();
