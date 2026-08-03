// Tiered AI presentation, stronger elite decisions, and two omniscient special bosses.
(() => {
  "use strict";

  if (window.AiTierBossSystem?.version) return;

  const VERSION = "1.0.0";
  const TOURNAMENT_TOTAL = 19;
  const GEMINI = "Gemini";
  const OPENING_NAMES = ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"];
  const MIDDLE_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"];
  const ELITE_NAMES = ["Nova", "Unit-9", "Merlin", "Vlad"];
  const SPECIAL_NAMES = ["Oracle", "Chronos"];

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
    Oracle: { theme: "oracle", badge: "OMNISCIENT EYE", title: "全域預言者", tier: "特殊 BOSS", stars: 7 },
    Chronos: { theme: "chronos", badge: "TIMELINE LOCK", title: "時間裁決者", tier: "特殊 BOSS", stars: 7 },
  });

  const SPECIAL_PROFILES = Object.freeze({
    Oracle: {
      name: "Oracle",
      emoji: "🔮",
      style: "Future Sight",
      bluffRate: 0.3,
      aggression: 0.9,
      patience: 0.96,
      isSpecialBoss: true,
      omniscient: true,
      tierStars: 7,
    },
    Chronos: {
      name: "Chronos",
      emoji: "⏳",
      style: "Timeline Control",
      bluffRate: 0.24,
      aggression: 0.93,
      patience: 0.98,
      isSpecialBoss: true,
      omniscient: true,
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

  let observer = null;
  let frame = 0;
  let tournamentPoll = 0;
  let arrivalTimer = 0;
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

  function starText(stars) {
    const count = clampValue(Number(stars) || 1, 1, 7);
    return `${"★".repeat(count)}${"☆".repeat(7 - count)}`;
  }

  function upsertProfile(profile) {
    const existingIndex = AI_ROSTER.findIndex(candidate => candidate?.name === profile.name);
    if (existingIndex >= 0) {
      Object.assign(AI_ROSTER[existingIndex], profile);
      return AI_ROSTER[existingIndex];
    }

    const geminiIndex = AI_ROSTER.findIndex(candidate => candidate?.name === GEMINI);
    if (geminiIndex >= 0) AI_ROSTER.splice(geminiIndex, 0, { ...profile });
    else AI_ROSTER.push({ ...profile });
    return profile;
  }

  function registerBossData() {
    upsertProfile(SPECIAL_PROFILES.Oracle);
    upsertProfile(SPECIAL_PROFILES.Chronos);

    AI_PROFILE_META.Oracle = {
      title: "全域預言者",
      danger: "全知級",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "特殊規則：Oracle 會讀取所有未公開底牌、尚未發出的公共牌順序，以及玩家累積打法習慣，再選擇最有利的下注線。",
      traits: [
        "知道完整五張公共牌最後會如何展開",
        "看得到目前牌桌所有未公開底牌",
        "會依玩家棄牌、跟注與加注習慣調整詐唬和價值下注",
      ],
    };

    AI_PROFILE_META.Chronos = {
      title: "時間裁決者",
      danger: "全知級",
      tierLabel: "特殊 BOSS",
      stars: 7,
      summary: "特殊規則：Chronos 會預先計算完整牌局時間線，知道攤牌結果與玩家長期傾向，並用近乎零失誤的尺寸控制底池。",
      traits: [
        "提前知道翻牌、轉牌與河牌的完整走勢",
        "精確比較所有仍在牌局中的最終牌型",
        "利用玩家的跟注與 All-in 習慣選擇陷阱或最大價值",
      ],
    };

    DIALOGUE_BANK.Oracle = {
      join: ["你看到的是現在；我看到的是整條牌局。"],
      raise: ["未來已經翻開，這個價格只是結果的一部分。", "你的下一個選擇，我已經看過了。"],
      allin: ["所有分支都已收斂。All-in。", "結局沒有改變的空間了。"],
      call: ["這條時間線值得繼續。"],
      check: ["先讓命運按原本的方向前進。"],
      fold: ["這條分支沒有勝率，我不會浪費籌碼。"],
      playerFold: ["你避開的只是其中一條路。"],
      win: ["預言不是猜測，是已經發生過的答案。"],
      lose: ["有趣，行動改變了價值，但沒有改變我看到的牌。"],
      flop: ["三張牌只是你開始理解的地方。"],
      turn: ["轉牌符合預言。"],
      river: ["最後一張，與我最初看到的一樣。"],
    };

    DIALOGUE_BANK.Chronos = {
      join: ["時間線已鎖定。從現在開始，每個錯誤都會被保留。"],
      raise: ["我只是把你未來會付出的籌碼提前收走。", "這個尺寸能讓所有時間線都對我有利。"],
      allin: ["倒數結束。所有籌碼進入同一個結局。", "時間停止，All-in。"],
      call: ["繼續吧，結果仍在我的控制範圍。"],
      check: ["這一秒先留給你。"],
      fold: ["這段時間線不值得保存。"],
      playerFold: ["你節省了籌碼，卻沒有逃離下一次判決。"],
      win: ["你的習慣讓結局變得非常準時。"],
      lose: ["時間線偏移，正在重新校準。"],
      flop: ["第一個節點已確認。"],
      turn: ["第二個節點已鎖定。"],
      river: ["終點抵達，誤差歸零。"],
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
      const rootClass = isSpecial ? "is-special-boss-character" : "is-mid-tier-character";
      const themeClass = `${isSpecial ? "special" : "mid"}-${presentation.theme}`;
      seat.classList.add(rootClass, themeClass);
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
      if (label.textContent !== tier.label) label.textContent = tier.label;
    }

    if (!presentation) {
      oldBanner?.remove();
      return;
    }

    const isSpecial = SPECIAL_NAMES.includes(selected.name);
    const rootClass = `${isSpecial ? "is-special-boss-character" : "is-mid-tier-character"}-profile`;
    const themeClass = `${isSpecial ? "special" : "mid"}-${presentation.theme}-profile`;
    panel.classList.add(rootClass, themeClass);

    let banner = oldBanner;
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "ai-tier-profile-banner";
      panel.querySelector(".ai-profile-hero")?.insertAdjacentElement("afterend", banner);
    }
    const html = `<span>${presentation.badge}</span><strong>${presentation.title}</strong><em>${presentation.tier}</em>`;
    if (banner.innerHTML !== html) banner.innerHTML = html;
  }

  function arrivalPalette(name) {
    return name === "Chronos"
      ? ["255,203,72", "105,181,255", "61,39,12"]
      : ["236,114,255", "91,235,255", "46,15,70"];
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
      const [accent, secondary, deep] = arrivalPalette(player.name);
      banner.style.setProperty("--arrival-accent", accent);
      banner.style.setProperty("--arrival-secondary", secondary);
      banner.style.setProperty("--arrival-deep", deep);
      banner.innerHTML = `<span class="special-boss-arrival-avatar">${player.emoji}</span><div><p>${presentation.badge} · 7 / 7 星</p><h3>${player.name}｜${presentation.title}</h3><span>全知規則啟動：完整牌面走勢與玩家習慣已被讀取。</span></div>`;
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

  function projectedBoard() {
    const board = [...(state?.board || [])];
    const needed = Math.max(0, 5 - board.length);
    if (!needed) return board;
    const future = (state?.deck || []).slice(-needed).reverse();
    return [...board, ...future];
  }

  function resultPower(result) {
    if (!result) return 0;
    const kickerPower = (result.tiebreakers || []).reduce(
      (sum, value, index) => sum + (Number(value) || 0) / (15 * (10 ** (index + 1))),
      0,
    );
    return clampValue((result.score + kickerPower) / 9, 0, 1);
  }

  function bestOpponentResult(player, board) {
    const results = (state?.players || [])
      .filter(candidate => candidate !== player && !candidate.folded && Array.isArray(candidate.cards) && candidate.cards.length === 2)
      .map(candidate => evaluateBestHand([...candidate.cards, ...board]));
    return results.sort(compareResults).at(-1) || null;
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
    say(player, player.allIn ? "allin" : "raise", {
      force: player.allIn,
      chance: 0.42,
    });
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
    const strength = estimateStrength(player);
    const needed = amountToCall(player);
    const potOdds = needed / Math.max(1, state.pot + needed);
    const bigBlind = Math.max(1, currentBigBlind());
    const stackInBigBlinds = player.stack / bigBlind;
    const positionBonus = { BTN: 0.09, CO: 0.07, HJ: 0.045, MP: 0.025, UTG: -0.025, SB: -0.015, BB: 0 }[positionLabel(player)] || 0;
    const emotion = aiEmotionMeta(player.emotion);
    const habits = heroHabits();

    let futureComparison = null;
    let futurePower = strength;
    if (isSpecial) {
      const board = projectedBoard();
      const ownResult = evaluateBestHand([...player.cards, ...board]);
      const opponentResult = bestOpponentResult(player, board);
      futureComparison = opponentResult ? compareResults(ownResult, opponentResult) : 1;
      futurePower = resultPower(ownResult);
    }

    const variance = isSpecial
      ? 0
      : (player.name === "Unit-9" ? (Math.random() - 0.5) * 0.018 : (Math.random() - 0.5) * 0.055);
    let effectiveStrength = strength + positionBonus + variance;

    if (isSpecial) {
      effectiveStrength = futurePower
        + (futureComparison > 0 ? 0.2 : (futureComparison === 0 ? 0.05 : -0.24));
    } else if (player.name === "Vlad" && habits.sample >= 3) {
      effectiveStrength += habits.foldRate * 0.05 + habits.callRate * 0.025;
    } else if (player.name === "Nova") {
      effectiveStrength += state.board.length >= 4 ? 0.045 : 0.015;
    } else if (player.name === "Merlin") {
      effectiveStrength += state.board.length === 4 ? 0.055 : 0.015;
    }

    effectiveStrength = clampValue(effectiveStrength, 0, 1.25);

    const aggression = clampValue(player.aggression * emotion.aggression + (isSpecial ? 0.08 : 0.035), 0, 0.99);
    const patience = clampValue(player.patience * emotion.patience + (isSpecial ? 0.02 : 0), 0.2, 0.995);
    const availableRaise = Math.max(0, player.stack - needed);
    const minimumRaise = minimumRaiseBy();
    const canRaise = !player.raiseLocked && availableRaise >= minimumRaise;
    const capRatio = isSpecial ? 0.52 : 0.4;
    const maxNormalRaiseBy = Math.floor(Math.min(
      player.stack * capRatio,
      Math.max(0, availableRaise - bigBlind),
    ) / 10) * 10;
    const canMakeNormalRaise = canRaise && maxNormalRaiseBy >= minimumRaise;

    const habitReadReady = habits.sample >= 3;
    const exploitFold = habitReadReady && habits.foldRate >= 0.38;
    const exploitCall = habitReadReady && habits.callRate >= 0.38;
    const bluffChance = clampValue(
      player.bluffRate * emotion.bluff
      + (exploitFold ? (isSpecial ? 0.22 : 0.08) : 0)
      - (exploitCall ? 0.08 : 0),
      0,
      isSpecial ? 0.62 : 0.46,
    );
    const isBluffing = canMakeNormalRaise
      && stackInBigBlinds > 16
      && needed <= player.stack * 0.13
      && Math.random() < bluffChance;

    const futureAhead = isSpecial && futureComparison > 0;
    const futureTied = isSpecial && futureComparison === 0;
    const futureBehind = isSpecial && futureComparison < 0;
    const strongValue = isSpecial
      ? futureAhead
      : effectiveStrength > (state.board.length >= 3 ? 0.57 : 0.72);
    const monsterValue = isSpecial
      ? futureAhead && futurePower >= 0.54
      : effectiveStrength > (state.board.length >= 3 ? 0.76 : 0.88);

    if (needed > 0) {
      const eliteCallThreshold = potOdds - (isSpecial ? 0.13 : 0.085) - (1 - patience) * 0.04;
      const shouldCall = isSpecial
        ? (futureAhead || futureTied || effectiveStrength >= eliteCallThreshold)
        : effectiveStrength >= eliteCallThreshold;

      if ((futureBehind && !isBluffing) || (!isSpecial && !shouldCall && !isBluffing)) {
        performFold(player);
        return;
      }
    }

    const trapProfile = player.name === "Merlin" || player.name === "Chronos";
    const trapChance = trapProfile && strongValue
      ? (player.name === "Chronos" ? 0.34 : 0.27)
      : 0;
    const isTrapping = needed === 0 && Math.random() < trapChance;
    const shortStackJam = canRaise
      && stackInBigBlinds <= (isSpecial ? 14 : 11)
      && strongValue
      && Math.random() < aggression * (isSpecial ? 0.88 : 0.66);
    const pressureJam = canRaise
      && monsterValue
      && needed >= bigBlind
      && player.stack <= Math.max(state.pot * 1.35, bigBlind * 18)
      && Math.random() < aggression * (isSpecial ? 0.48 : 0.32);
    const shouldJam = shortStackJam || pressureJam;
    const shouldRaise = !isTrapping && (
      shouldJam
      || (canMakeNormalRaise
        && (strongValue || isBluffing)
        && Math.random() < aggression)
    );

    if (shouldRaise) {
      const callHeavyFactor = exploitCall && strongValue ? 0.9 : 0.66;
      const foldHeavyFactor = exploitFold && isBluffing ? 0.48 : callHeavyFactor;
      const profileFactor = player.name === "Oracle" ? 0.74 : (player.name === "Chronos" ? 0.82 : foldHeavyFactor);
      const desiredRaiseBy = Math.floor(Math.max(
        minimumRaise,
        Math.min(maxNormalRaiseBy || availableRaise, state.pot * profileFactor + bigBlind * 2),
      ) / 10) * 10;
      const raiseBy = shouldJam
        ? availableRaise
        : Math.min(maxNormalRaiseBy, Math.max(minimumRaise, desiredRaiseBy));
      performRaise(player, raiseBy);
      return;
    }

    performCall(player, needed);
  }

  function installDecisionLayer() {
    if (window.__aiTierBossDecisionInstalled) return true;
    if (typeof botAction !== "function") return false;

    window.__aiTierBossDecisionInstalled = true;
    const originalBotAction = botAction;
    window.__aiTierBossOriginalBotAction = originalBotAction;

    botAction = function botActionWithTiers(player) {
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
      const ready = installDecisionLayer() && installTournamentExtension();
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
    tierForName,
    projectedBoard,
    heroHabits,
    ensureSpecialBossQueue,
    refresh,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
