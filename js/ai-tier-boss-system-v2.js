// Fair tiered AI presentation, stronger elite decisions, and two special bosses.
(() => {
  "use strict";

  if (window.AiTierBossSystem?.version === "2.0.0") return;

  const VERSION = "2.0.0";
  const TOURNAMENT_TOTAL = 19;
  const GEMINI = "Gemini";
  const OPENING_NAMES = ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"];
  const MIDDLE_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"];
  const ELITE_NAMES = ["Nova", "Unit-9", "Merlin", "Vlad"];
  const SPECIAL_NAMES = ["Oracle", "Chronos"];
  const SHOWDOWN_STORAGE_KEY = "texasHoldemPublicShowdownModelV1";

  const TIER_STARS = Object.freeze({
    opening: 2,
    middle: 4,
    elite: 6,
    special: 7,
    gemini: 7,
  });

  const PRESENTATIONS = Object.freeze({
    Ace: { theme: "ace", badge: "SKY SNIPER", title: "空中狙擊手", tier: "中階 AI", stars: 4 },
    Momo: { theme: "momo", badge: "CHAOS DRIVE", title: "亂流製造機", tier: "中階 AI", stars: 4 },
    Nori: { theme: "nori", badge: "BALANCE CORE", title: "平衡派貓手", tier: "中階 AI", stars: 4 },
    Bruno: { theme: "bruno", badge: "IRON ROCK", title: "重拳岩石", tier: "中階 AI", stars: 4 },
    Dodo: { theme: "dodo", badge: "SAFE GUARD", title: "保命玩家", tier: "中階 AI", stars: 4 },
    Viper: { theme: "viper", badge: "VENOM TRAP", title: "陷阱術士", tier: "中階 AI", stars: 4 },
    Oracle: { theme: "oracle", badge: "RANGE ORACLE", title: "全域讀牌者", tier: "特殊 BOSS", stars: 7 },
    Chronos: { theme: "chronos", badge: "EQUILIBRIUM CORE", title: "時間解算者", tier: "特殊 BOSS", stars: 7 },
  });

  const SPECIAL_PROFILES = Object.freeze({
    Oracle: {
      name: "Oracle",
      emoji: "🔮",
      style: "Exploit Master",
      bluffRate: 0.27,
      aggression: 0.9,
      patience: 0.96,
      isSpecialBoss: true,
      fairInformation: true,
      rangeInference: true,
      tierStars: 7,
    },
    Chronos: {
      name: "Chronos",
      emoji: "⏳",
      style: "Equilibrium Solver",
      bluffRate: 0.22,
      aggression: 0.91,
      patience: 0.98,
      isSpecialBoss: true,
      fairInformation: true,
      rangeInference: true,
      tierStars: 7,
    },
  });

  const ELITE_BOOSTS = Object.freeze({
    Nova: { bluffRate: 0.25, aggression: 0.86, patience: 0.72 },
    "Unit-9": { bluffRate: 0.12, aggression: 0.79, patience: 0.96 },
    Merlin: { bluffRate: 0.23, aggression: 0.78, patience: 0.9 },
    Vlad: { bluffRate: 0.24, aggression: 0.82, patience: 0.92 },
  });

  const OWN_SEAT_CLASSES = [
    "is-mid-tier-character",
    "mid-ace",
    "mid-momo",
    "mid-nori",
    "mid-bruno",
    "mid-dodo",
    "mid-viper",
    "is-special-boss-character",
    "special-oracle",
    "special-chronos",
  ];
  const OWN_PROFILE_CLASSES = OWN_SEAT_CLASSES.map(name => `${name}-profile`);
  const RANGE_KEYS = ["premium", "strong", "medium", "speculative", "bluff"];
  const BASE_BUCKET_RATE = Object.freeze({
    premium: 0.08,
    strong: 0.17,
    medium: 0.28,
    speculative: 0.27,
    bluff: 0.2,
  });

  let observer = null;
  let frame = 0;
  let tournamentPoll = 0;
  let arrivalTimer = 0;
  let showdownRecorderInstalled = false;
  let lastRecordedShowdownKey = "";
  const shownArrivals = new Set();

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function tierForName(name) {
    if (SPECIAL_NAMES.includes(name)) return { key: "special", label: "特殊 BOSS", stars: TIER_STARS.special };
    if (name === GEMINI) return { key: "gemini", label: "FINAL BOSS", stars: TIER_STARS.gemini };
    if (ELITE_NAMES.includes(name)) return { key: "elite", label: "高階 AI", stars: TIER_STARS.elite };
    if (MIDDLE_NAMES.includes(name)) return { key: "middle", label: "中階 AI", stars: TIER_STARS.middle };
    return { key: "opening", label: "初階 AI", stars: TIER_STARS.opening };
  }

  function upsertProfile(profile) {
    const existingIndex = AI_ROSTER.findIndex(candidate => candidate?.name === profile.name);
    if (existingIndex >= 0) {
      Object.assign(AI_ROSTER[existingIndex], profile);
      delete AI_ROSTER[existingIndex].omniscient;
      return AI_ROSTER[existingIndex];
    }

    const geminiIndex = AI_ROSTER.findIndex(candidate => candidate?.name === GEMINI);
    const next = { ...profile };
    if (geminiIndex >= 0) AI_ROSTER.splice(geminiIndex, 0, next);
    else AI_ROSTER.push(next);
    return next;
  }

  function registerBossData() {
    upsertProfile(SPECIAL_PROFILES.Oracle);
    upsertProfile(SPECIAL_PROFILES.Chronos);

    AI_PROFILE_META.Oracle = {
      title: "全域讀牌者",
      danger: "大師級",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "只使用自己的底牌、公開牌面、公開行動與曾攤牌資料，持續推估你的可能手牌範圍並攻擊長期習慣。",
      traits: [
        "根據位置、下注尺寸與行動順序更新你的手牌範圍",
        "記住曾經公開攤牌的牌，修正你價值下注與詐唬的傾向",
        "不讀取目前隱藏底牌、牌堆順序或未來公共牌",
      ],
    };

    AI_PROFILE_META.Chronos = {
      title: "時間解算者",
      danger: "大師級",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "以公平資訊進行範圍對範圍估算、底池賠率、Fold Equity 與混合策略決策，降低可被反向剝削的漏洞。",
      traits: [
        "每一街重新計算 Call、Raise、All-in 的近似 EV",
        "樣本不足時採用均衡基準，樣本足夠後才有限度調整",
        "不讀取任何對手未公開底牌、牌堆或預定結果",
      ],
    };

    DIALOGUE_BANK.Oracle = {
      join: ["我不需要看你的牌；你的選擇已經留下足夠線索。"],
      raise: ["你的範圍正在縮小，這個尺寸會讓它更難承受。", "過去的下注習慣，正在替我定價。"],
      allin: ["公開資訊已經足夠。All-in。", "這不是預言，是你一路留下的證據。"],
      call: ["價格合理，範圍推理繼續。"],
      check: ["我先保留整個範圍。"],
      fold: ["這條線的期望值不值得支付。"],
      playerFold: ["你的棄牌頻率又多了一筆樣本。"],
      win: ["不是看見底牌，是讀懂了行動。"],
      lose: ["新樣本已記錄，模型會更新。"],
      flop: ["翻牌公開，範圍開始重新加權。"],
      turn: ["轉牌讓部分組合失去可能。"],
      river: ["河牌到了，現在只剩價值與詐唬的比例。"],
    };

    DIALOGUE_BANK.Chronos = {
      join: ["解算開始。所有未公開資訊都只會以機率存在。"],
      raise: ["Raise EV 高於 Call EV。", "這個尺寸讓你的回應區間最不舒服。"],
      allin: ["有效籌碼與範圍權重已收斂。All-in。", "這是混合策略中的高壓分支。"],
      call: ["底池賠率允許繼續。"],
      check: ["這個節點保留過牌範圍。"],
      fold: ["負期望值分支已移除。"],
      playerFold: ["Fold Equity 已更新。"],
      win: ["長期策略不依賴單次結果。"],
      lose: ["結果偏離，但決策模型保持公平。"],
      flop: ["翻牌節點重新解算。"],
      turn: ["轉牌節點重新解算。"],
      river: ["河牌節點：價值與詐唬重新配比。"],
    };
  }

  function applyTierData() {
    for (const profile of AI_ROSTER) {
      const tier = tierForName(profile.name);
      profile.aiTier = tier.key;
      profile.tierStars = tier.stars;
      profile.tierLabel = tier.label;
      const meta = AI_PROFILE_META[profile.name];
      if (meta) {
        meta.tierLabel = tier.label;
        meta.stars = tier.stars;
      }
    }

    for (const [name, boost] of Object.entries(ELITE_BOOSTS)) {
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      if (!profile) continue;
      Object.assign(profile, boost, {
        isElite: true,
        advancedDecision: true,
        fairInformation: true,
        aiTier: "elite",
        tierStars: 6,
        tierLabel: "高階 AI",
      });
      if (AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].danger = name === "Unit-9" ? "極高精度" : "極危險";
        AI_PROFILE_META[name].tierLabel = "高階 AI";
        AI_PROFILE_META[name].stars = 6;
      }
    }

    const gemini = AI_ROSTER.find(profile => profile.name === GEMINI);
    if (gemini) {
      gemini.aiTier = "gemini";
      gemini.tierStars = 7;
      gemini.tierLabel = "FINAL BOSS";
      if (AI_PROFILE_META[GEMINI]) {
        AI_PROFILE_META[GEMINI].tierLabel = "FINAL BOSS";
        AI_PROFILE_META[GEMINI].stars = 7;
      }
    }
  }

  function registerData() {
    if (
      typeof AI_ROSTER === "undefined"
      || typeof AI_PROFILE_META === "undefined"
      || typeof DIALOGUE_BANK === "undefined"
    ) return false;
    registerBossData();
    applyTierData();
    return true;
  }

  function installStyles() {
    if (document.querySelector("#aiTierBossSystemStyles")) return;
    const style = document.createElement("style");
    style.id = "aiTierBossSystemStyles";
    style.textContent = `
      .seat.is-mid-tier-character,
      #aiProfilePanel.is-mid-tier-character-profile {
        --tier-accent:83,170,255; --tier-secondary:255,196,92; --tier-deep:17,33,53;
      }
      .seat.mid-ace, #aiProfilePanel.mid-ace-profile { --tier-accent:88,170,255; --tier-secondary:182,224,255; --tier-deep:14,34,66; }
      .seat.mid-momo, #aiProfilePanel.mid-momo-profile { --tier-accent:255,132,72; --tier-secondary:255,213,82; --tier-deep:68,27,13; }
      .seat.mid-nori, #aiProfilePanel.mid-nori-profile { --tier-accent:75,214,184; --tier-secondary:142,238,255; --tier-deep:10,52,50; }
      .seat.mid-bruno, #aiProfilePanel.mid-bruno-profile { --tier-accent:213,153,79; --tier-secondary:255,218,137; --tier-deep:57,35,18; }
      .seat.mid-dodo, #aiProfilePanel.mid-dodo-profile { --tier-accent:116,205,103; --tier-secondary:220,246,134; --tier-deep:27,55,26; }
      .seat.mid-viper, #aiProfilePanel.mid-viper-profile { --tier-accent:91,220,137; --tier-secondary:187,112,255; --tier-deep:19,52,34; }
      .seat.is-mid-tier-character { filter:drop-shadow(0 10px 20px rgba(0,0,0,.24)) drop-shadow(0 0 13px rgba(var(--tier-accent),.2)); }
      .seat.is-mid-tier-character .seat-header {
        border-color:rgba(var(--tier-accent),.62) !important;
        background:radial-gradient(circle at 15% 0%, rgba(var(--tier-secondary),.13), transparent 43%), linear-gradient(145deg, rgba(var(--tier-deep),.94), rgba(8,19,27,.92)) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.17), 0 10px 22px rgba(0,0,0,.24), 0 0 20px rgba(var(--tier-accent),.2) !important;
      }
      .seat.is-special-boss-character,
      #aiProfilePanel.is-special-boss-character-profile {
        --tier-accent:255,212,77; --tier-secondary:207,108,255; --tier-deep:47,20,68;
      }
      .seat.special-oracle, #aiProfilePanel.special-oracle-profile { --tier-accent:236,114,255; --tier-secondary:91,235,255; --tier-deep:46,15,70; }
      .seat.special-chronos, #aiProfilePanel.special-chronos-profile { --tier-accent:255,203,72; --tier-secondary:105,181,255; --tier-deep:61,39,12; }
      .seat.is-special-boss-character {
        isolation:isolate;
        filter:drop-shadow(0 15px 28px rgba(0,0,0,.34)) drop-shadow(0 0 28px rgba(var(--tier-accent),.42));
      }
      .seat.is-special-boss-character .seat-header {
        border:1px solid rgba(var(--tier-accent),.9) !important;
        background:radial-gradient(circle at 12% 0%, rgba(var(--tier-secondary),.25), transparent 42%), radial-gradient(circle at 96% 100%, rgba(var(--tier-accent),.28), transparent 54%), linear-gradient(145deg, rgba(var(--tier-deep),.98), rgba(5,12,22,.96)) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.24), 0 0 0 1px rgba(var(--tier-secondary),.18), 0 14px 30px rgba(0,0,0,.34), 0 0 36px rgba(var(--tier-accent),.4) !important;
        animation:specialBossTierPulse 1.35s ease-in-out infinite alternate;
      }
      .seat.is-special-boss-character .player-emoji { text-shadow:0 0 10px rgba(var(--tier-accent),.95), 0 0 22px rgba(var(--tier-secondary),.56); }
      .ai-tier-seat-badge {
        position:absolute; z-index:10; left:50%; top:-17px; transform:translateX(-50%);
        display:flex; align-items:center; gap:6px; min-height:22px; padding:3px 9px;
        border:1px solid rgba(var(--tier-accent),.72); border-radius:999px;
        background:linear-gradient(90deg, rgba(var(--tier-deep),.98), rgba(var(--tier-secondary),.2)), rgba(5,14,22,.96);
        color:#fff; white-space:nowrap; box-shadow:0 7px 17px rgba(0,0,0,.3), 0 0 18px rgba(var(--tier-accent),.28); pointer-events:none;
      }
      .ai-tier-seat-badge span { font-size:.52rem; font-weight:1000; letter-spacing:.07em; }
      .ai-tier-seat-badge small { color:rgb(var(--tier-accent)); font-size:.46rem; letter-spacing:-.02em; }
      #aiProfilePanel.is-mid-tier-character-profile,
      #aiProfilePanel.is-special-boss-character-profile {
        border-color:rgba(var(--tier-accent),.58) !important;
        background:radial-gradient(circle at 14% 0%, rgba(var(--tier-secondary),.16), transparent 42%), radial-gradient(circle at 96% 96%, rgba(var(--tier-accent),.2), transparent 54%), linear-gradient(155deg, rgba(var(--tier-deep),.97), rgba(5,15,24,.95)) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 22px 48px rgba(0,0,0,.4), 0 0 30px rgba(var(--tier-accent),.23) !important;
      }
      .ai-tier-profile-banner {
        display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:8px;
        margin:0 0 10px; padding:7px 9px; border:1px solid rgba(var(--tier-accent),.34); border-radius:9px; background:rgba(var(--tier-deep),.53);
      }
      .ai-tier-profile-banner span { color:rgb(var(--tier-secondary)); font-size:.56rem; font-weight:1000; letter-spacing:.08em; }
      .ai-tier-profile-banner strong { color:#fff; font-size:.72rem; }
      .ai-tier-profile-banner em { color:rgba(235,245,244,.76); font-size:.55rem; font-style:normal; font-weight:900; }
      .ai-tier-label { border-color:rgba(255,206,91,.38) !important; color:#ffe29b !important; font-weight:950 !important; }
      .ai-tier-stars { display:inline-flex; align-items:center; gap:0; min-width:104px; justify-content:flex-end; font-size:0 !important; letter-spacing:0; }
      .ai-tier-stars b, .ai-tier-stars i { font-size:.78rem; font-style:normal; letter-spacing:.015em; }
      .ai-tier-stars b { color:#ffd45d; text-shadow:0 0 8px rgba(255,204,71,.54); }
      .ai-tier-stars i { color:rgba(190,204,210,.33); }
      .special-boss-arrival {
        position:absolute; z-index:36; left:50%; top:18px; width:min(420px, calc(100% - 34px));
        display:grid; grid-template-columns:50px minmax(0,1fr); align-items:center; gap:11px; padding:11px 15px;
        border:1px solid rgba(var(--arrival-accent),.72); border-radius:15px;
        background:radial-gradient(circle at 10% 0%, rgba(var(--arrival-secondary),.23), transparent 43%), linear-gradient(135deg, rgba(var(--arrival-deep),.98), rgba(3,10,18,.97));
        color:#fff; box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 18px 40px rgba(0,0,0,.42), 0 0 38px rgba(var(--arrival-accent),.38);
        opacity:0; transform:translate(-50%,-10px) scale(.96); pointer-events:none;
      }
      .special-boss-arrival.is-visible { animation:specialBossArrival 2.8s ease both; }
      .special-boss-arrival-avatar { display:grid; place-items:center; width:48px; height:48px; border:1px solid rgba(var(--arrival-accent),.64); border-radius:13px; background:rgba(255,255,255,.08); font-size:1.7rem; box-shadow:0 0 23px rgba(var(--arrival-accent),.38); }
      .special-boss-arrival p, .special-boss-arrival h3, .special-boss-arrival span { margin:0; }
      .special-boss-arrival p { color:rgb(var(--arrival-secondary)); font-size:.58rem; font-weight:1000; letter-spacing:.1em; }
      .special-boss-arrival h3 { margin-top:2px; font-size:.98rem; }
      .special-boss-arrival span { display:block; margin-top:3px; color:rgba(235,242,244,.8); font-size:.65rem; line-height:1.35; }
      @keyframes specialBossTierPulse { from { filter:brightness(.96); } to { filter:brightness(1.12); } }
      @keyframes specialBossArrival { 0% { opacity:0; transform:translate(-50%,-10px) scale(.96); } 12%,80% { opacity:1; transform:translate(-50%,0) scale(1); } 100% { opacity:0; transform:translate(-50%,-5px) scale(.985); } }
      @media (prefers-reduced-motion:reduce) {
        .seat.is-special-boss-character .seat-header { animation:none !important; }
        .special-boss-arrival.is-visible { animation:none !important; opacity:1; transform:translate(-50%,0); }
      }
    `;
    document.head.appendChild(style);
  }

  function presentationFor(name) {
    return PRESENTATIONS[name] || null;
  }

  function syncSeatVisuals() {
    document.querySelectorAll(".seat[data-profile-position]").forEach(seat => {
      OWN_SEAT_CLASSES.forEach(name => seat.classList.remove(name));
      const position = Number(seat.dataset.profilePosition);
      const player = state?.players?.find(candidate => candidate.position === position);
      const presentation = presentationFor(player?.name);
      const badge = seat.querySelector(".ai-tier-seat-badge");

      if (!player || !presentation) {
        badge?.remove();
        delete seat.dataset.aiTier;
        delete seat.dataset.aiStars;
        return;
      }

      const isSpecial = SPECIAL_NAMES.includes(player.name);
      seat.classList.add(
        isSpecial ? "is-special-boss-character" : "is-mid-tier-character",
        `${isSpecial ? "special" : "mid"}-${presentation.theme}`,
      );
      seat.dataset.aiTier = isSpecial ? "special" : "middle";
      seat.dataset.aiStars = String(presentation.stars);

      let nextBadge = badge;
      if (!nextBadge) {
        nextBadge = document.createElement("span");
        nextBadge.className = "ai-tier-seat-badge";
        seat.appendChild(nextBadge);
      }
      const html = `<span>${presentation.badge}</span><small>${"★".repeat(presentation.stars)}</small>`;
      if (nextBadge.innerHTML !== html) nextBadge.innerHTML = html;
      nextBadge.title = `${presentation.tier} · ${presentation.stars} / 7 星`;
    });
  }

  function syncProfileVisuals() {
    const panel = document.querySelector("#aiProfilePanel");
    if (!panel) return;
    OWN_PROFILE_CLASSES.forEach(name => panel.classList.remove(name));

    const selected = state?.players?.find(player => !player.isHuman && player.position === state.selectedProfilePosition);
    const oldBanner = panel.querySelector(".ai-tier-profile-banner");
    if (!selected || panel.hidden) {
      oldBanner?.remove();
      return;
    }

    const tier = tierForName(selected.name);
    const presentation = presentationFor(selected.name);
    panel.dataset.aiTier = tier.key;
    panel.dataset.aiStars = String(tier.stars);

    const starNode = panel.querySelector(".ai-profile-title span");
    if (starNode) {
      starNode.className = "ai-tier-stars";
      const html = `<b>${"★".repeat(tier.stars)}</b><i>${"☆".repeat(7 - tier.stars)}</i>`;
      if (starNode.innerHTML !== html) starNode.innerHTML = html;
      starNode.setAttribute("aria-label", `難度 ${tier.stars} / 7 星`);
      starNode.title = `${tier.label} · 難度 ${tier.stars} / 7 星`;
    }

    const tags = panel.querySelector(".ai-profile-tags");
    if (tags) {
      let label = tags.querySelector(".ai-tier-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "ai-tier-label";
        tags.appendChild(label);
      }
      label.textContent = tier.label;
    }

    if (!presentation) {
      oldBanner?.remove();
      return;
    }

    const isSpecial = SPECIAL_NAMES.includes(selected.name);
    panel.classList.add(
      `${isSpecial ? "is-special-boss-character" : "is-mid-tier-character"}-profile`,
      `${isSpecial ? "special" : "mid"}-${presentation.theme}-profile`,
    );

    let banner = oldBanner;
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "ai-tier-profile-banner";
      panel.querySelector(".ai-profile-hero")?.insertAdjacentElement("afterend", banner);
    }
    banner.innerHTML = `<span>${presentation.badge}</span><strong>${presentation.title}</strong><em>${presentation.tier}</em>`;
  }

  function ensureArrivalBanner() {
    const arena = document.querySelector("#arena");
    if (!arena) return null;
    let banner = document.querySelector("#specialBossArrivalBanner");
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = "specialBossArrivalBanner";
      banner.className = "special-boss-arrival";
      banner.setAttribute("aria-live", "assertive");
      arena.appendChild(banner);
    }
    return banner;
  }

  function syncSpecialArrivals() {
    for (const player of state?.players || []) {
      if (!SPECIAL_NAMES.includes(player.name) || player.status !== "新加入") continue;
      const key = `${state.handNumber || 0}:${player.name}`;
      if (shownArrivals.has(key)) continue;
      shownArrivals.add(key);
      const presentation = PRESENTATIONS[player.name];
      const banner = ensureArrivalBanner();
      if (!presentation || !banner) continue;
      const palette = player.name === "Chronos"
        ? ["255,203,72", "105,181,255", "61,39,12"]
        : ["236,114,255", "91,235,255", "46,15,70"];
      banner.style.setProperty("--arrival-accent", palette[0]);
      banner.style.setProperty("--arrival-secondary", palette[1]);
      banner.style.setProperty("--arrival-deep", palette[2]);
      banner.innerHTML = `<span class="special-boss-arrival-avatar">${player.emoji}</span><div><p>${presentation.badge} · 7 / 7 星</p><h3>${player.name}｜${presentation.title}</h3><span>公平讀牌啟動：公開行動、攤牌紀錄與玩家習慣已納入範圍模型。</span></div>`;
      banner.classList.remove("is-visible");
      void banner.offsetWidth;
      banner.classList.add("is-visible");
      window.clearTimeout(arrivalTimer);
      const duration = window.GameSpeedController?.scaleDelay?.(2850, {
        category: "presentation",
        actorName: player.name,
      }) || 2850;
      arrivalTimer = window.setTimeout(() => banner.classList.remove("is-visible"), duration);
    }
  }

  function emptyShowdownModel() {
    return {
      samples: 0,
      premium: 0,
      strong: 0,
      medium: 0,
      speculative: 0,
      bluff: 0,
      aggressive: 0,
      passive: 0,
      lastUpdated: 0,
    };
  }

  function readPublicShowdownModel() {
    try {
      const raw = localStorage.getItem(SHOWDOWN_STORAGE_KEY);
      if (!raw) return emptyShowdownModel();
      return { ...emptyShowdownModel(), ...JSON.parse(raw) };
    } catch (error) {
      return emptyShowdownModel();
    }
  }

  function savePublicShowdownModel(model) {
    try {
      localStorage.setItem(SHOWDOWN_STORAGE_KEY, JSON.stringify(model));
    } catch (error) {
      // Session analysis remains available when storage is unavailable.
    }
  }

  function holeBucket(cards) {
    if (!Array.isArray(cards) || cards.length !== 2) return "medium";
    const [a, b] = [...cards].sort((left, right) => right.value - left.value);
    const pair = a.value === b.value;
    const suited = a.suit === b.suit;
    const gap = Math.abs(a.value - b.value);
    if ((pair && a.value >= 10) || (a.value === 14 && b.value >= 12)) return "premium";
    if ((pair && a.value >= 6) || (a.value >= 12 && b.value >= 10) || (suited && a.value >= 12 && b.value >= 9)) return "strong";
    if (pair || (a.value >= 10 && b.value >= 8) || (suited && gap <= 2)) return "medium";
    if (suited || gap <= 2 || a.value >= 11) return "speculative";
    return "bluff";
  }

  function recordPublicShowdown() {
    if (!state?.handOver || state.board?.length !== 5) return false;
    const hero = typeof human === "function" ? human() : state.players?.find(player => player.isHuman);
    if (!hero || hero.folded || !Array.isArray(hero.cards) || hero.cards.length !== 2) return false;
    const key = `${state.handNumber}:${hero.cards.map(card => `${card.value}${card.suit}`).join("-")}:${state.board.map(card => `${card.value}${card.suit}`).join("-")}`;
    if (key === lastRecordedShowdownKey) return false;
    lastRecordedShowdownKey = key;

    const model = readPublicShowdownModel();
    if (model.samples >= 60) {
      for (const name of [...RANGE_KEYS, "aggressive", "passive"]) {
        model[name] = Math.round((Number(model[name]) || 0) * 0.85);
      }
      model.samples = RANGE_KEYS.reduce((sum, name) => sum + (Number(model[name]) || 0), 0);
    }

    const bucket = holeBucket(hero.cards);
    model.samples += 1;
    model[bucket] = (Number(model[bucket]) || 0) + 1;
    const aggressive = Boolean(state.heroCurrentHand?.raised || state.heroCurrentHand?.allIn);
    model[aggressive ? "aggressive" : "passive"] += 1;
    model.lastUpdated = Date.now();
    savePublicShowdownModel(model);
    return true;
  }

  function installShowdownRecorder() {
    if (showdownRecorderInstalled) return true;
    if (typeof finishShowdown !== "function") return false;
    showdownRecorderInstalled = true;
    const originalFinishShowdown = finishShowdown;
    finishShowdown = function finishShowdownWithPublicModel(...args) {
      const result = originalFinishShowdown.apply(this, args);
      recordPublicShowdown();
      return result;
    };
    return true;
  }

  function heroHabits() {
    const stats = state?.heroStyle || {};
    const hands = Math.max(1, Number(stats.hands) || 0);
    const showdowns = readPublicShowdownModel();
    return {
      sample: Number(stats.hands) || 0,
      foldRate: (Number(stats.folds) || 0) / hands,
      callRate: (Number(stats.calls) || 0) / hands,
      raiseRate: (Number(stats.raises) || 0) / hands,
      allInRate: (Number(stats.allIns) || 0) / hands,
      vpipRate: (Number(stats.vpip) || 0) / hands,
      showdownRate: (Number(stats.showdowns) || 0) / hands,
      publicShowdowns: Number(showdowns.samples) || 0,
    };
  }

  function normalizeRange(range) {
    const safe = {};
    let total = 0;
    for (const key of RANGE_KEYS) {
      safe[key] = Math.max(0.01, Number(range[key]) || 0);
      total += safe[key];
    }
    for (const key of RANGE_KEYS) safe[key] /= total;
    return safe;
  }

  function inferHeroRange() {
    const habits = heroHabits();
    const showdowns = readPublicShowdownModel();
    const tracker = state?.heroCurrentHand || {};
    const hero = typeof human === "function" ? human() : state?.players?.find(player => player.isHuman);
    const range = {
      premium: 0.1,
      strong: 0.22,
      medium: 0.31,
      speculative: 0.22,
      bluff: 0.15,
    };

    if (tracker.raised) {
      range.premium += 0.08;
      range.strong += 0.1;
      range.bluff += habits.raiseRate >= 0.38 ? 0.05 : 0;
      range.medium -= 0.08;
      range.speculative -= 0.05;
    }
    if (tracker.allIn) {
      range.premium += 0.16;
      range.strong += 0.11;
      range.bluff += habits.allInRate >= 0.18 ? 0.08 : 0;
      range.medium -= 0.12;
      range.speculative -= 0.08;
    }
    if (tracker.called) {
      range.medium += 0.08;
      range.speculative += 0.07;
      range.premium -= 0.04;
      range.bluff -= 0.03;
    }
    if (tracker.checked && !tracker.raised) {
      range.medium += 0.04;
      range.bluff += 0.05;
      range.premium -= 0.04;
    }

    if ((hero?.totalContribution || 0) >= Math.max(1, currentBigBlind()) * 6) {
      range.premium += 0.06;
      range.strong += 0.07;
      range.bluff += habits.raiseRate > 0.4 ? 0.04 : 0;
    }

    if (showdowns.samples >= 3) {
      const sample = Math.max(1, showdowns.samples);
      const influence = Math.min(0.2, sample * 0.012);
      for (const key of RANGE_KEYS) {
        const observed = (Number(showdowns[key]) || 0) / sample;
        range[key] = range[key] * (1 - influence) + observed * influence;
      }
    }

    if (habits.foldRate >= 0.45) range.bluff -= 0.03;
    if (habits.callRate >= 0.45) {
      range.medium += 0.04;
      range.speculative += 0.03;
    }
    return normalizeRange(range);
  }

  function cardKey(card) {
    return `${card.value}${card.suit}`;
  }

  function fairBeliefDeck(player) {
    const known = new Set([
      ...(player?.cards || []),
      ...(state?.board || []),
    ].map(cardKey));
    return createDeck().filter(card => !known.has(cardKey(card)));
  }

  function sampleDistinct(cards, count) {
    const indexes = new Set();
    const output = [];
    const limit = Math.min(count, cards.length);
    while (output.length < limit) {
      const index = Math.floor(Math.random() * cards.length);
      if (indexes.has(index)) continue;
      indexes.add(index);
      output.push(cards[index]);
    }
    return output;
  }

  function estimateFairEquity(player, { samples = 72 } = {}) {
    if (!player || !Array.isArray(player.cards) || player.cards.length !== 2) return 0.5;
    const board = [...(state?.board || [])];
    const futureCount = Math.max(0, 5 - board.length);
    const deck = fairBeliefDeck(player);
    const range = inferHeroRange();
    let weightedWins = 0;
    let totalWeight = 0;
    const iterations = Math.max(16, Math.min(120, Number(samples) || 72));

    for (let index = 0; index < iterations; index += 1) {
      const sample = sampleDistinct(deck, 2 + futureCount);
      if (sample.length < 2 + futureCount) continue;
      const opponentCards = sample.slice(0, 2);
      const finalBoard = [...board, ...sample.slice(2)];
      const ownResult = evaluateBestHand([...player.cards, ...finalBoard]);
      const opponentResult = evaluateBestHand([...opponentCards, ...finalBoard]);
      const bucket = holeBucket(opponentCards);
      const weight = clampValue(range[bucket] / BASE_BUCKET_RATE[bucket], 0.18, 5.5);
      const comparison = compareResults(ownResult, opponentResult);
      weightedWins += weight * (comparison > 0 ? 1 : (comparison === 0 ? 0.5 : 0));
      totalWeight += weight;
    }

    const headsUpEquity = totalWeight > 0 ? weightedWins / totalWeight : estimateStrength(player);
    const activeOpponents = Math.max(1, (state?.players || []).filter(candidate => candidate !== player && !candidate.folded).length);
    const multiwayPenalty = Math.max(0, activeOpponents - 1) * 0.045;
    return clampValue(headsUpEquity - multiwayPenalty, 0.02, 0.98);
  }

  function fairInformationSnapshot(player) {
    return {
      actor: player?.name || "",
      ownCards: (player?.cards || []).map(cardKey),
      publicBoard: (state?.board || []).map(cardKey),
      pot: Number(state?.pot) || 0,
      currentBet: Number(state?.currentBet) || 0,
      position: typeof positionLabel === "function" ? positionLabel(player) : "",
      heroPublicAction: {
        lastAction: human()?.lastAction || "",
        bet: Number(human()?.bet) || 0,
        contribution: Number(human()?.totalContribution) || 0,
      },
      habits: heroHabits(),
      inferredRange: inferHeroRange(),
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
    } else if (!state.isMuted) {
      Audio.chip();
    }
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), {
      chance: player.allIn && paid > 0 ? 0.3 : (paid === 0 ? 0.14 : 0.2),
    });
  }

  function advancedBotAction(player) {
    player.status = "Thinking...";
    const isSpecial = SPECIAL_NAMES.includes(player.name);
    const needed = amountToCall(player);
    const pot = Math.max(1, Number(state.pot) || 0);
    const potOdds = needed / Math.max(1, pot + needed);
    const bigBlind = Math.max(1, currentBigBlind());
    const stackInBigBlinds = player.stack / bigBlind;
    const habits = heroHabits();
    const emotion = aiEmotionMeta(player.emotion);
    const samples = isSpecial ? (player.name === "Chronos" ? 96 : 84) : (player.name === "Unit-9" ? 54 : 42);
    const equity = estimateFairEquity(player, { samples });
    const positionBonus = { BTN: 0.035, CO: 0.025, HJ: 0.015, MP: 0.008, UTG: -0.02, SB: -0.012, BB: 0 }[positionLabel(player)] || 0;
    const adjustedEquity = clampValue(equity + positionBonus, 0.01, 0.99);
    const aggression = clampValue(player.aggression * emotion.aggression + (isSpecial ? 0.055 : 0.025), 0.2, 0.99);
    const patience = clampValue(player.patience * emotion.patience, 0.2, 0.995);
    const availableRaise = Math.max(0, player.stack - needed);
    const minimumRaise = minimumRaiseBy();
    const canRaise = !player.raiseLocked && availableRaise >= minimumRaise;
    const maxNormalRaiseBy = Math.floor(Math.min(
      player.stack * (isSpecial ? 0.5 : 0.4),
      Math.max(0, availableRaise - bigBlind),
    ) / 10) * 10;
    const canMakeNormalRaise = canRaise && maxNormalRaiseBy >= minimumRaise;

    let foldEquity = 0.16 + habits.foldRate * 0.48 - habits.callRate * 0.16;
    if (player.name === "Oracle" && habits.sample >= 3) {
      foldEquity += habits.raiseRate >= 0.38 ? -0.04 : 0.05;
    }
    if (player.name === "Chronos") {
      foldEquity = foldEquity * 0.65 + 0.12;
    }
    foldEquity = clampValue(foldEquity, 0.08, 0.62);

    const range = inferHeroRange();
    const rangeWeakness = range.bluff + range.speculative * 0.45;
    const bluffChance = clampValue(
      player.bluffRate * emotion.bluff + foldEquity * 0.24 + rangeWeakness * 0.08,
      0.04,
      isSpecial ? 0.42 : 0.3,
    );
    const isBluffing = canMakeNormalRaise
      && stackInBigBlinds > 16
      && needed <= player.stack * 0.14
      && Math.random() < bluffChance;

    const callEv = adjustedEquity * (pot + needed) - (1 - adjustedEquity) * needed;
    const targetFactor = player.name === "Chronos" ? 0.72 : (player.name === "Oracle" ? 0.64 : 0.58);
    const desiredRaiseBy = Math.floor(Math.max(
      minimumRaise,
      Math.min(maxNormalRaiseBy || availableRaise, pot * targetFactor + bigBlind * 2),
    ) / 10) * 10;
    const raiseRisk = Math.min(player.stack, needed + desiredRaiseBy);
    const raiseEv = foldEquity * pot
      + (1 - foldEquity) * (adjustedEquity * (pot + raiseRisk) - (1 - adjustedEquity) * raiseRisk);

    const valueThreshold = isSpecial ? 0.55 : 0.59;
    const monsterThreshold = isSpecial ? 0.72 : 0.77;
    const strongValue = adjustedEquity >= valueThreshold;
    const monsterValue = adjustedEquity >= monsterThreshold;
    const shouldFold = needed > 0
      && callEv < -(bigBlind * (isSpecial ? 0.12 : 0.04))
      && !isBluffing;

    if (shouldFold) {
      performFold(player);
      return;
    }

    const trapChance = (player.name === "Merlin" || player.name === "Chronos") && strongValue
      ? (player.name === "Chronos" ? 0.24 : 0.2)
      : 0;
    const isTrapping = needed === 0 && Math.random() < trapChance;
    const shortStackJam = canRaise
      && stackInBigBlinds <= (isSpecial ? 13 : 10)
      && adjustedEquity >= (isSpecial ? 0.58 : 0.62)
      && Math.random() < aggression * 0.78;
    const pressureJam = canRaise
      && monsterValue
      && needed >= bigBlind
      && player.stack <= Math.max(pot * 1.25, bigBlind * 16)
      && Math.random() < aggression * (isSpecial ? 0.42 : 0.28);
    const shouldJam = shortStackJam || pressureJam;

    const mixedRaiseBias = player.name === "Chronos"
      ? (strongValue ? 0.76 : 0.32)
      : aggression;
    const shouldRaise = !isTrapping && canRaise && (
      shouldJam
      || (canMakeNormalRaise
        && (raiseEv > callEv + bigBlind * 0.08 || strongValue || isBluffing)
        && Math.random() < mixedRaiseBias)
    );

    if (shouldRaise) {
      performRaise(player, shouldJam
        ? availableRaise
        : Math.min(maxNormalRaiseBy, Math.max(minimumRaise, desiredRaiseBy)));
      return;
    }

    performCall(player, needed);
  }

  function installDecisionLayer() {
    if (window.__aiTierBossDecisionVersion === VERSION) return true;
    if (typeof botAction !== "function") return false;
    const originalBotAction = window.__aiTierBossOriginalBotAction || botAction;
    window.__aiTierBossOriginalBotAction = originalBotAction;
    window.__aiTierBossDecisionInstalled = true;
    window.__aiTierBossDecisionVersion = VERSION;
    botAction = function botActionWithFairTiers(player) {
      if (SPECIAL_NAMES.includes(player?.name) || ELITE_NAMES.includes(player?.name)) {
        return advancedBotAction(player);
      }
      return originalBotAction(player);
    };
    return true;
  }

  function ensureSpecialBossQueue() {
    if (!window.TournamentMode?.isActive?.()) return false;
    const tournament = state?.tournament;
    if (!tournament || !Array.isArray(tournament.queue)) return false;
    const available = SPECIAL_NAMES.filter(name => (
      !tournament.appeared?.includes(name)
      && !tournament.eliminated?.includes(name)
    ));
    const nextQueue = tournament.queue.filter(name => !SPECIAL_NAMES.includes(name));
    const geminiIndex = nextQueue.indexOf(GEMINI);
    const insertAt = geminiIndex >= 0 ? geminiIndex : nextQueue.length;
    nextQueue.splice(insertAt, 0, ...available);
    if (nextQueue.join("|") === tournament.queue.join("|")) return false;
    tournament.queue = nextQueue;
    return true;
  }

  function syncTournamentText() {
    if (window.EliteCharacterPresentation) {
      window.EliteCharacterPresentation.totalTournamentAi = TOURNAMENT_TOTAL;
    }
    window.EliteCharacterProgressFix?.refresh?.();
    const summary = document.querySelector("#sessionSummaryContent");
    if (!summary) return;
    const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const next = String(node.textContent)
        .replace(/全部 (?:16|17) 位 AI/g, `全部 ${TOURNAMENT_TOTAL} 位 AI`)
        .replace(/\/ (?:16|17)/g, `/ ${TOURNAMENT_TOTAL}`)
        .replace(/(?:16|17) 位 AI/g, `${TOURNAMENT_TOTAL} 位 AI`);
      if (next !== node.textContent) node.textContent = next;
    }
  }

  function installTournamentExtension() {
    if (!window.TournamentMode?.version) return false;
    if (window.__aiTierBossTournamentExtensionInstalled) return true;
    window.__aiTierBossTournamentExtensionInstalled = true;
    const originalReset = resetGameSession;
    resetGameSession = function resetGameSessionWithSpecialBosses(...args) {
      const result = originalReset.apply(this, args);
      ensureSpecialBossQueue();
      return result;
    };
    const originalSetMode = window.TournamentMode.setMode.bind(window.TournamentMode);
    window.TournamentMode.setMode = function setModeWithSpecialBosses(...args) {
      const result = originalSetMode(...args);
      ensureSpecialBossQueue();
      scheduleRefresh();
      return result;
    };
    if (!window.__aiTierBossLogWrapped && typeof log === "function") {
      window.__aiTierBossLogWrapped = true;
      const originalLog = log;
      log = function logWithNineteenAi(message, ...args) {
        const patched = String(message).replace(
          /淘汰賽開始：(?:16|17) 位 AI/g,
          `淘汰賽開始：${TOURNAMENT_TOTAL} 位 AI`,
        );
        return originalLog.call(this, patched, ...args);
      };
    }
    ensureSpecialBossQueue();
    return true;
  }

  function refresh() {
    if (!registerData()) return false;
    installStyles();
    installDecisionLayer();
    installShowdownRecorder();
    installTournamentExtension();
    ensureSpecialBossQueue();
    syncSeatVisuals();
    syncProfileVisuals();
    syncSpecialArrivals();
    syncTournamentText();
    document.documentElement.dataset.aiTierBossSystem = "ready";
    return true;
  }

  function scheduleRefresh() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }

  function install() {
    refresh();
    observer?.disconnect();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    window.clearInterval(tournamentPoll);
    tournamentPoll = window.setInterval(() => {
      const ready = installDecisionLayer() && installShowdownRecorder() && installTournamentExtension();
      if (ready) {
        window.clearInterval(tournamentPoll);
        tournamentPoll = 0;
        scheduleRefresh();
      }
    }, 80);
  }

  window.AiTierBossSystem = {
    version: VERSION,
    totalTournamentAi: TOURNAMENT_TOTAL,
    openingNames: [...OPENING_NAMES],
    middleNames: [...MIDDLE_NAMES],
    eliteNames: [...ELITE_NAMES],
    specialNames: [...SPECIAL_NAMES],
    fairInformationPolicy: Object.freeze({
      ownCards: true,
      publicBoard: true,
      publicActions: true,
      publicShowdowns: true,
      hiddenOpponentCards: false,
      deckOrder: false,
      futureBoard: false,
      predeterminedResult: false,
    }),
    tierForName,
    heroHabits,
    inferHeroRange,
    estimateFairEquity,
    fairInformationSnapshot,
    publicShowdownModel: readPublicShowdownModel,
    recordPublicShowdown,
    ensureSpecialBossQueue,
    refresh,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
