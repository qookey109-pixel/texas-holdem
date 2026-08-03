// Fair special-boss strategy: public information, own cards, and historical player habits only.
(() => {
  "use strict";

  if (window.FairSpecialBosses?.version) return;

  const VERSION = "1.0.0";
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  let installTimer = 0;
  let lastDecision = null;

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function heroHabits() {
    const stats = state?.heroStyle || {};
    const hands = Math.max(1, Number(stats.hands) || 0);
    return {
      sample: Number(stats.hands) || 0,
      foldRate: (Number(stats.folds) || 0) / hands,
      callRate: (Number(stats.calls) || 0) / hands,
      raiseRate: (Number(stats.raises) || 0) / hands,
      allInRate: (Number(stats.allIns) || 0) / hands,
      vpipRate: (Number(stats.vpip) || 0) / hands,
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
      activePlayers: (state?.players || []).filter(candidate => !candidate.folded).length,
      habits,
      texture,
    };
  }

  function chooseDecision(player) {
    const context = publicContext(player);
    const habits = context.habits;
    const texture = context.texture;
    const strength = clampValue(estimateStrength(player), 0, 1);
    const bigBlind = Math.max(1, currentBigBlind());
    const needed = context.needed;
    const potOdds = needed / Math.max(1, context.pot + needed);
    const stackBb = context.stack / bigBlind;
    const positionBonus = { BTN: 0.07, CO: 0.055, HJ: 0.035, MP: 0.015, UTG: -0.025, SB: -0.015, BB: 0 }[context.position] || 0;
    const sampleWeight = clampValue(habits.sample / 20, 0, 1);
    const foldExploit = (habits.foldRate - 0.3) * 0.24 * sampleWeight;
    const callPenalty = Math.max(0, habits.callRate - 0.36) * 0.18 * sampleWeight;
    const multiwayPenalty = Math.max(0, context.activePlayers - 2) * 0.035;
    const wetBoardPenalty = (texture.flushPressure ? 0.025 : 0) + texture.connectedness * 0.025;
    const calibratedStrength = clampValue(
      strength + positionBonus - multiwayPenalty - wetBoardPenalty,
      0,
      1,
    );

    const foldEquity = clampValue(0.24 + foldExploit - callPenalty, 0.08, 0.62);
    const callEv = calibratedStrength * (context.pot + needed) - (1 - calibratedStrength) * needed;
    const minRaise = minimumRaiseBy();
    const availableRaise = Math.max(0, context.stack - needed);
    const canRaise = !player.raiseLocked && availableRaise >= minRaise;
    const raiseCost = Math.min(
      availableRaise,
      Math.max(minRaise, Math.round((context.pot * (player.name === "Chronos" ? 0.72 : 0.62) + bigBlind) / 10) * 10),
    );
    const raiseEv = canRaise
      ? foldEquity * context.pot
        + (1 - foldEquity) * (
          calibratedStrength * (context.pot + needed + raiseCost)
          - (1 - calibratedStrength) * (needed + raiseCost)
        )
      : Number.NEGATIVE_INFINITY;

    const bluffFrequency = clampValue(
      (player.name === "Oracle" ? 0.18 : 0.14)
      + foldExploit
      - callPenalty,
      0.04,
      0.34,
    );
    const mixedBluff = canRaise
      && calibratedStrength < 0.46
      && needed <= context.stack * 0.12
      && stackBb > 18
      && Math.random() < bluffFrequency;
    const strongValue = calibratedStrength >= (state.board.length >= 3 ? 0.59 : 0.74);
    const premiumValue = calibratedStrength >= (state.board.length >= 3 ? 0.77 : 0.88);
    const trap = needed === 0
      && strongValue
      && player.name === "Chronos"
      && Math.random() < 0.22;
    const jam = canRaise
      && premiumValue
      && stackBb <= 12
      && Math.random() < 0.72;

    let action = "call";
    let raiseBy = 0;
    if (needed > 0 && callEv < 0 && !mixedBluff) {
      action = "fold";
    } else if (!trap && canRaise && (jam || mixedBluff || (strongValue && raiseEv > callEv))) {
      action = "raise";
      raiseBy = jam ? availableRaise : Math.min(availableRaise, Math.max(minRaise, raiseCost));
    }

    lastDecision = {
      actor: player.name,
      action,
      raiseBy,
      strength: calibratedStrength,
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
      }
    }

    AI_PROFILE_META.Oracle = {
      title: "全域讀牌者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Oracle 會讀取本次遊戲的公開行動紀錄與玩家習慣，用範圍推理、Fold Equity 和混合策略持續調整。",
      traits: [
        "依玩家棄牌、跟注、加注與 All-in 習慣調整策略",
        "只使用公開牌面、自己的底牌與已公開行動",
        "不讀取玩家隱藏底牌、牌堆順序或未來公共牌",
      ],
    };

    AI_PROFILE_META.Chronos = {
      title: "時間解算者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Chronos 會結合長期與近期紀錄，在每一街重新估算範圍、EV、底池賠率與下注尺寸。",
      traits: [
        "每一街重新評估 Call、Raise、Fold 與 All-in 的價值",
        "以混合策略避免被固定規則破解",
        "只使用合法可見資訊，不預知任何未發出的牌",
      ],
    };

    DIALOGUE_BANK.Oracle = {
      ...DIALOGUE_BANK.Oracle,
      join: ["我不需要看你的牌；你的每一次選擇都會留下範圍。"],
      raise: ["你的下注習慣已經縮小了範圍。", "這個尺寸，是針對你過去的選擇。"],
      river: ["最後一張只揭露牌面，不會替你隱藏習慣。"],
    };
    DIALOGUE_BANK.Chronos = {
      ...DIALOGUE_BANK.Chronos,
      join: ["我記得你之前的每個決定，但未來仍由牌桌決定。"],
      raise: ["重新解算完成，這是目前最難回應的尺寸。", "你的近期頻率，讓這條線更有價值。"],
      river: ["資訊完整了，現在只剩決策品質。"],
    };
  }

  function patchPresentationText() {
    const banner = document.querySelector("#specialBossArrivalBanner");
    if (banner && /全知規則|完整牌面走勢/.test(banner.textContent || "")) {
      const copy = banner.querySelector("div > span");
      if (copy) copy.textContent = "大師模式啟動：公開紀錄、玩家習慣與即時範圍正在重新計算。";
    }
  }

  function install() {
    if (typeof botAction !== "function" || !window.AiTierBossSystem?.version) return false;
    patchData();

    if (!window.__fairSpecialBossDecisionInstalled) {
      window.__fairSpecialBossDecisionInstalled = true;
      const previousBotAction = botAction;
      botAction = function botActionWithFairSpecialBosses(player) {
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
    heroHabits,
    boardTexture,
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
