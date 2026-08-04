// Compatibility loader for stable presentation and optional feature modules.
(() => {
  "use strict";

  const SPECIAL_BOSS_NAMES = new Set(["Oracle", "Chronos"]);
  let fairGuardFrame = 0;
  let fairGuardObserver = null;

  function loadOnce(selector, src, dataKey) {
    const existing = document.querySelector(selector);
    if (existing) return existing;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset[dataKey] = "true";
    document.body.appendChild(script);
    return script;
  }

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

  function sanitizeFairBossData() {
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

  function patchFairPresentation() {
    const banner = document.querySelector("#specialBossArrivalBanner");
    if (banner && /全知規則|完整牌面走勢|偷看|預知/.test(banner.textContent || "")) {
      const copy = banner.querySelector("div > span");
      if (copy) {
        copy.textContent = "公平七星模式：只使用公開行動、曾攤牌樣本與機率範圍推理。";
      }
    }
  }

  function installFairDecisionFallback() {
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

  function scheduleFairGuard() {
    if (fairGuardFrame) return;
    fairGuardFrame = requestAnimationFrame(() => {
      fairGuardFrame = 0;
      sanitizeFairBossData();
      patchFairPresentation();
      window.FairSpecialBosses?.refresh?.();
    });
  }

  function installFairBossCoreGuard() {
    if (!window.AiTierBossSystem?.version) return false;
    sanitizeFairBossData();
    installFairDecisionFallback();
    patchFairPresentation();

    if (!document.querySelector("#fairBossCoreGuardStyles")) {
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

    if (!fairGuardObserver) {
      fairGuardObserver = new MutationObserver(scheduleFairGuard);
      fairGuardObserver.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    scheduleFairGuard();
    return true;
  }

  loadOnce(
    'script[data-elite-character-presentation-v2]',
    "js/elite-character-presentation-v2.js?v=elite-roster-v2",
    "eliteCharacterPresentationV2",
  );
  loadOnce(
    'script[data-elite-character-progress-fix]',
    "js/elite-character-progress-fix.js?v=nineteen-roster-v1",
    "eliteCharacterProgressFix",
  );
  const tierScript = loadOnce(
    'script[data-ai-tier-boss-system]',
    "js/ai-tier-boss-system.js?v=tier-boss-fair-guard-v2",
    "aiTierBossSystem",
  );
  tierScript?.addEventListener("load", installFairBossCoreGuard, { once: true });
  installFairBossCoreGuard();

  loadOnce(
    'script[data-ai-action-memory]',
    "js/ai-action-memory-v1.js?v=multi-street-ai-v1-1",
    "aiActionMemory",
  );
  loadOnce(
    'script[data-ai-range-tools]',
    "js/ai-range-tools-v1.js?v=multi-street-ai-v1-1",
    "aiRangeTools",
  );
  loadOnce(
    'script[data-ai-character-strategies]',
    "js/ai-character-strategies-v1.js?v=independent-ai-v1",
    "aiCharacterStrategies",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-1]',
    "js/ai-character-strategies-v1-1.js?v=multi-street-ai-v1-1",
    "aiCharacterStrategiesV11",
  );
  loadOnce(
    'script[data-ai-preflop-range-engine]',
    "js/ai-preflop-range-engine-v1.js?v=preflop-range-ai-v1-2",
    "aiPreflopRangeEngine",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-2]',
    "js/ai-character-strategies-v1-2.js?v=preflop-range-ai-v1-2",
    "aiCharacterStrategiesV12",
  );
  loadOnce(
    'script[data-ai-player-model]',
    "js/ai-player-model-v1.js?v=adaptive-player-model-v1-3",
    "aiPlayerModel",
  );
  loadOnce(
    'script[data-ai-player-model-memory]',
    "js/ai-player-model-memory-v1.js?v=long-term-ai-memory-v1-4",
    "aiPlayerModelMemory",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-3]',
    "js/ai-character-strategies-v1-3.js?v=adaptive-player-model-v1-3",
    "aiCharacterStrategiesV13",
  );
  loadOnce(
    'script[data-ai-multiway-range-model]',
    "js/ai-multiway-range-model-v1.js?v=multiway-range-ai-v1-5",
    "aiMultiwayRangeModel",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-5]',
    "js/ai-character-strategies-v1-5.js?v=multiway-range-ai-v1-5",
    "aiCharacterStrategiesV15",
  );
  const fairScript = loadOnce(
    'script[data-fair-special-bosses]',
    "js/fair-special-bosses.js?v=public-showdown-range-v2",
    "fairSpecialBosses",
  );
  fairScript?.addEventListener("load", () => {
    sanitizeFairBossData();
    window.FairSpecialBosses?.refresh?.();
    scheduleFairGuard();
  }, { once: true });

  loadOnce(
    'script[data-ai-provider-legacy-worker-migration]',
    "js/ai-provider-legacy-worker-migration.js?v=custom-ai-provider-v1",
    "aiProviderLegacyWorkerMigration",
  );
  loadOnce(
    'script[data-ai-provider-client]',
    "js/ai-provider-client-v1.js?v=custom-ai-provider-v1",
    "aiProviderClient",
  );
})();
