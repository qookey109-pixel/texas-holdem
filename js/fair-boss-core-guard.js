// Hard safety boundary for Oracle and Chronos before the full fair strategy is ready.
(() => {
  "use strict";

  if (window.FairBossCoreGuard?.version) return;

  const VERSION = "1.0.0";
  const SPECIAL_BOSS_NAMES = new Set(["Oracle", "Chronos"]);
  let observer = null;
  let frame = 0;
  let installTimer = 0;

  function fairBossMeta() {
    return {
      Oracle: {
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
      },
      Chronos: {
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
      },
    };
  }

  function fairBossDialogue() {
    return {
      Oracle: {
        join: ["我不需要偷看；你公開過的牌與每一次選擇，已經留下範圍。"],
        raise: ["你的歷史攤牌正在縮小目前範圍。", "這個尺寸，是針對你過去公開的選擇。"],
        allin: ["公開資訊已足夠，我願意承擔這條線。"],
        call: ["價格與推估範圍吻合，我跟。"],
        check: ["先保留範圍，看看你如何暴露下一步。"],
        fold: ["公開資訊不支持繼續投入。"],
        playerFold: ["這次棄牌也會成為下一次推估的樣本。"],
        win: ["公開線索累積起來，比偷看答案更有價值。"],
        lose: ["新的公開結果已加入模型。"],
        flop: ["翻牌讓範圍開始收斂。"],
        turn: ["轉牌更新了價值與詐唬比例。"],
        river: ["所有公開資訊已完整，現在只剩決策品質。"],
      },
      Chronos: {
        join: ["我會模擬所有合理未來，但不會偷看真正答案。"],
        raise: ["範圍模擬完成，這是目前最高 EV 的尺寸。", "公開樣本已更新，重新解算完成。"],
        allin: ["在目前可見資訊下，這條線的期望值最高。"],
        call: ["底池賠率允許我繼續。"],
        check: ["保留選項，等待下一個公開節點。"],
        fold: ["目前 EV 不足，停止投入。"],
        playerFold: ["你的選擇改變了之後的範圍權重。"],
        win: ["這是機率與價格的結果，不是預知。"],
        lose: ["結果偏離樣本均值，模型會重新校準。"],
        flop: ["第一個公開節點已納入模擬。"],
        turn: ["第二個公開節點已重新計算。"],
        river: ["所有公開資訊已完整，現在只剩決策品質。"],
      },
    };
  }

  function sanitizeData() {
    if (
      typeof AI_ROSTER === "undefined"
      || typeof AI_PROFILE_META === "undefined"
      || typeof DIALOGUE_BANK === "undefined"
    ) return false;

    const metas = fairBossMeta();
    const dialogues = fairBossDialogue();

    for (const name of SPECIAL_BOSS_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) {
        delete profile.omniscient;
        delete profile.usesHiddenInformation;
        Object.assign(profile, {
          style: name === "Oracle" ? "Range Oracle" : "EV Solver",
          fairPlay: true,
          playerModeling: true,
          publicInformationOnly: true,
          publicShowdownMemory: true,
          rangeInference: true,
          tierStars: 7,
          tierLabel: "特殊 BOSS",
        });
      }
      AI_PROFILE_META[name] = metas[name];
      DIALOGUE_BANK[name] = dialogues[name];
    }

    if (window.AiTierBossSystem) {
      window.AiTierBossSystem.projectedBoard = () => [...(state?.board || [])];
    }

    document.documentElement.dataset.fairBossCoreGuard = "ready";
    return true;
  }

  function patchPresentation() {
    const banner = document.querySelector("#specialBossArrivalBanner");
    if (banner && /全知規則|完整牌面走勢|偷看|預知/.test(banner.textContent || "")) {
      const copy = banner.querySelector("div > span");
      if (copy) {
        copy.textContent = "公平七星模式：只使用公開行動、曾攤牌樣本與機率範圍推理。";
      }
    }
  }

  function installDecisionFallback() {
    if (typeof botAction !== "function") return false;
    if (window.__fairSpecialBossDecisionInstalled) return true;
    if (botAction === window.__fairBossCoreFallbackWrapper) return true;

    const tierWrappedBotAction = botAction;
    const safeBaseBotAction = window.__aiTierBossOriginalBotAction
      || window.__fairBossSafeBaseBotAction
      || tierWrappedBotAction;

    const guardedBotAction = function botActionWithFairBossFallback(player) {
      if (SPECIAL_BOSS_NAMES.has(player?.name)) return safeBaseBotAction(player);
      return tierWrappedBotAction(player);
    };

    window.__fairBossCoreFallbackInstalled = true;
    window.__fairBossSafeBaseBotAction = safeBaseBotAction;
    window.__fairBossCoreFallbackWrapper = guardedBotAction;
    botAction = guardedBotAction;
    return true;
  }

  function installStyles() {
    if (document.querySelector("#fairBossCoreGuardStyles")) return;
    const style = document.createElement("style");
    style.id = "fairBossCoreGuardStyles";
    style.textContent = `
      .seat.special-oracle .ai-tier-seat-badge span,
      #aiProfilePanel.special-oracle-profile .ai-tier-profile-banner > span,
      .seat.special-chronos .ai-tier-seat-badge span,
      #aiProfilePanel.special-chronos-profile .ai-tier-profile-banner > span {
        font-size: 0 !important;
      }
      .seat.special-oracle .ai-tier-seat-badge span::after,
      #aiProfilePanel.special-oracle-profile .ai-tier-profile-banner > span::after {
        content: "RANGE ORACLE";
        font-size: .56rem;
      }
      .seat.special-chronos .ai-tier-seat-badge span::after,
      #aiProfilePanel.special-chronos-profile .ai-tier-profile-banner > span::after {
        content: "EV CHRONOS";
        font-size: .56rem;
      }
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    if (!window.AiTierBossSystem?.version) return false;
    sanitizeData();
    installDecisionFallback();
    patchPresentation();
    installStyles();
    window.FairSpecialBosses?.refresh?.();
    return true;
  }

  function scheduleRefresh() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }

  function boot() {
    if (!refresh()) return false;
    if (!observer) {
      observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    window.clearInterval(installTimer);
    installTimer = 0;
    return true;
  }

  window.FairBossCoreGuard = {
    version: VERSION,
    specialNames: [...SPECIAL_BOSS_NAMES],
    fairInformationPolicy: Object.freeze({
      ownCards: true,
      publicBoard: true,
      publicActions: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    refresh,
  };

  if (!boot()) {
    installTimer = window.setInterval(() => {
      boot();
    }, 25);
  }
})();
