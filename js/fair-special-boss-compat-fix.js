// Compatibility repair for fair special-boss data shared with the legacy tier presentation.
(() => {
  "use strict";

  if (window.FairSpecialBossCompatFix?.version) return;

  const VERSION = "1.0.0";
  const NAMES = ["Oracle", "Chronos"];
  const PROFILE_VALUES = {
    Oracle: {
      style: "Player Model",
      fairPlay: true,
      strategyModel: "exploitative-public-history",
      omniscient: false,
      usesHiddenInformation: false,
    },
    Chronos: {
      style: "Range Solver",
      fairPlay: true,
      strategyModel: "balanced-range-ev",
      omniscient: false,
      usesHiddenInformation: false,
    },
  };
  const META = {
    Oracle: {
      title: "全域讀牌者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Oracle 只使用已公開的牌面、下注行動、曾攤牌資訊與玩家累積習慣，建立動態範圍並選擇最具剝削價值的下注線。",
      traits: [
        "依玩家棄牌、跟注與加注頻率調整策略",
        "利用公開下注尺寸推測範圍強弱，不讀取隱藏底牌",
        "以獨立隨機模擬估算勝率，不讀取牌堆或未來公共牌",
      ],
    },
    Chronos: {
      title: "範圍解算者",
      danger: "七星大師",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "Chronos 以範圍對範圍、底池賠率、有效籌碼與混合策略即時評估局面；資訊不足時採取難以被反向剝削的均衡基準。",
      traits: [
        "每一街根據公開資訊重新估算範圍與 EV",
        "在接近等值的行動間使用混合策略",
        "記住玩家長期與近期傾向，但不知道任何未公開卡牌",
      ],
    },
  };

  let timer = 0;

  function writableValue(target, key, value) {
    if (!target) return;
    try { delete target[key]; } catch (error) {}
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    } catch (error) {
      target[key] = value;
    }
  }

  function repair() {
    if (
      typeof AI_ROSTER === "undefined"
      || typeof AI_PROFILE_META === "undefined"
      || !window.FairSpecialBossStrategy?.version
    ) return false;

    for (const name of NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (profile) {
        for (const [key, value] of Object.entries(PROFILE_VALUES[name])) {
          writableValue(profile, key, value);
        }
      }
      writableValue(AI_PROFILE_META, name, {
        ...META[name],
        traits: [...META[name].traits],
      });
    }

    if (window.AiTierBossSystem) {
      window.AiTierBossSystem.fairPlay = true;
      window.AiTierBossSystem.usesHiddenInformation = false;
    }
    document.documentElement.dataset.specialBossFairPlay = "true";
    return true;
  }

  window.FairSpecialBossCompatFix = {
    version: VERSION,
    repair,
  };

  repair();
  timer = window.setInterval(repair, 250);
  window.addEventListener("pagehide", () => {
    window.clearInterval(timer);
    timer = 0;
  }, { once: true });
})();
