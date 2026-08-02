// Stable elite-character presentation, Vlad registration, and tournament extension.
(() => {
  "use strict";

  if (window.EliteCharacterPresentation?.version) return;
  if (
    typeof AI_ROSTER === "undefined"
    || typeof AI_PROFILE_META === "undefined"
    || typeof DIALOGUE_BANK === "undefined"
  ) return;

  const VERSION = "2.0.0";
  const VLAD = "Vlad";
  const GEMINI = "Gemini";
  const TOURNAMENT_TOTAL = 17;
  const THEME_CLASSES = ["elite-nova", "elite-unit9", "elite-merlin", "elite-vlad"];
  const PROFILE_CLASSES = THEME_CLASSES.map(name => `${name}-profile`);

  const CHARACTERS = Object.freeze({
    Nova: {
      theme: "nova",
      badge: "ALIEN MIND",
      title: "外星讀心者",
      tier: "ELITE",
      entrance: "未知訊號已鎖定牌桌。",
    },
    "Unit-9": {
      theme: "unit9",
      badge: "SOLVER CORE",
      title: "機器解算者",
      tier: "ELITE",
      entrance: "解算核心上線，開始重建你的範圍。",
    },
    Merlin: {
      theme: "merlin",
      badge: "ARCANE PLAYER",
      title: "牌桌魔法師",
      tier: "ELITE",
      entrance: "牌面已進入魔法師的劇本。",
    },
    Vlad: {
      theme: "vlad",
      badge: "NIGHT HUNTER",
      title: "午夜獵手",
      tier: "ELITE BOSS",
      entrance: "午夜獵手甦醒，弱點將被逐一放大。",
    },
    Gemini: {
      theme: "gemini",
      badge: "FINAL BOSS",
      title: "終局雙生者",
      tier: "FINAL BOSS",
      entrance: "終局協議已啟動。",
    },
  });

  const VLAD_PROFILE = Object.freeze({
    name: VLAD,
    emoji: "🧛",
    style: "Night Trap",
    bluffRate: 0.19,
    aggression: 0.68,
    patience: 0.81,
    isElite: true,
    eliteTheme: "vlad",
  });

  let observer = null;
  let refreshFrame = 0;
  let tournamentPoll = 0;
  let arrivalTimer = 0;
  const shownArrivals = new Set();

  function registerVlad() {
    const existing = AI_ROSTER.findIndex(profile => profile?.name === VLAD);
    if (existing >= 0) {
      Object.assign(AI_ROSTER[existing], VLAD_PROFILE);
    } else {
      const geminiIndex = AI_ROSTER.findIndex(profile => profile?.name === GEMINI);
      if (geminiIndex >= 0) AI_ROSTER.splice(geminiIndex, 0, { ...VLAD_PROFILE });
      else AI_ROSTER.push({ ...VLAD_PROFILE });
    }

    AI_PROFILE_META[VLAD] = {
      title: "午夜獵手",
      danger: "極危險",
      summary: "擅長慢打強牌、觀察恐懼並在河牌放大壓力。你越急著結束牌局，他越容易找到破口。",
      traits: [
        "強牌常先隱藏，後街才突然升高壓力",
        "會攻擊過度保守與下注尺寸不穩定的玩家",
        "河牌詐唬與價值下注刻意使用相似外觀",
      ],
    };

    DIALOGUE_BANK[VLAD] = {
      join: ["夜色正好。讓我看看誰先露出弱點。"],
      raise: ["你的心跳變快了。再多付一點吧。", "這個價格，足夠讓恐懼開始說話。"],
      allin: ["午夜已到。把所有籌碼交給命運。", "最後一滴耐心也用完了。All-in。"],
      call: ["我聞到了猶豫。繼續。", "這個價格，值得看你下一步。"],
      check: ["我先讓黑夜保持安靜。"],
      fold: ["這份獵物沒有價值。"],
      playerFold: ["逃得很快，但恐懼還留在桌上。"],
      win: ["夜晚總會收回它應得的東西。", "你不是輸給牌，是輸給了自己的恐懼。"],
      lose: ["有趣。你比看起來更難獵殺。"],
      flop: ["第一道傷口已經出現。"],
      turn: ["轉牌讓氣味更清楚了。"],
      river: ["最後一張，現在沒有地方可以躲。"],
      confident: ["獵物的路線已經固定。"],
      tilted: ["黑夜也會失手，但不會兩次。"],
      cautious: ["先藏進陰影，再等一次呼吸。"],
    };
  }

  function installStyles() {
    if (document.querySelector("#eliteCharacterPresentationV2Styles")) return;
    const style = document.createElement("style");
    style.id = "eliteCharacterPresentationV2Styles";
    style.textContent = `
      .seat.is-elite-character {
        --elite-accent: 175,135,255;
        --elite-secondary: 83,220,213;
        --elite-deep: 22,20,53;
        isolation: isolate;
        filter: drop-shadow(0 13px 25px rgba(0,0,0,.28)) drop-shadow(0 0 18px rgba(var(--elite-accent),.24));
      }
      .seat.elite-nova, #aiProfilePanel.elite-nova-profile { --elite-accent:165,120,255; --elite-secondary:75,225,198; --elite-deep:24,20,63; }
      .seat.elite-unit9, #aiProfilePanel.elite-unit9-profile { --elite-accent:70,216,231; --elite-secondary:123,168,255; --elite-deep:8,31,43; }
      .seat.elite-merlin, #aiProfilePanel.elite-merlin-profile { --elite-accent:205,139,255; --elite-secondary:244,199,91; --elite-deep:46,20,62; }
      .seat.elite-vlad, #aiProfilePanel.elite-vlad-profile { --elite-accent:235,75,98; --elite-secondary:150,60,211; --elite-deep:53,9,25; }
      .seat.is-elite-character .seat-header {
        border-color: rgba(var(--elite-accent),.72) !important;
        background:
          radial-gradient(circle at 14% 0%, rgba(var(--elite-secondary),.18), transparent 44%),
          radial-gradient(circle at 95% 100%, rgba(var(--elite-accent),.24), transparent 52%),
          linear-gradient(145deg, rgba(var(--elite-deep),.97), rgba(7,17,25,.94)) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 0 0 1px rgba(var(--elite-secondary),.11), 0 12px 26px rgba(0,0,0,.28), 0 0 25px rgba(var(--elite-accent),.25) !important;
        animation: eliteCharacterPulseV2 1.9s ease-in-out infinite alternate;
      }
      .seat.is-elite-character .player-emoji {
        text-shadow: 0 0 9px rgba(var(--elite-accent),.85), 0 0 17px rgba(var(--elite-secondary),.45);
      }
      .seat.is-elite-character .seat-status {
        border-color: rgba(var(--elite-accent),.34) !important;
        background: rgba(var(--elite-deep),.52) !important;
      }
      .elite-character-badge {
        position:absolute; z-index:9; left:50%; top:-15px;
        display:inline-flex; align-items:center; justify-content:center;
        min-height:20px; padding:3px 9px;
        border:1px solid rgba(var(--elite-accent),.72); border-radius:999px;
        background:linear-gradient(90deg, rgba(var(--elite-deep),.98), rgba(var(--elite-secondary),.27)), rgba(5,14,22,.96);
        color:#fff; font-size:.54rem; font-weight:1000; letter-spacing:.08em; white-space:nowrap;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 7px 16px rgba(0,0,0,.28), 0 0 17px rgba(var(--elite-accent),.3);
        transform:translateX(-50%); pointer-events:none;
      }
      #aiProfilePanel.is-elite-character-profile {
        --elite-accent:175,135,255; --elite-secondary:83,220,213; --elite-deep:22,20,53;
        border-color:rgba(var(--elite-accent),.56) !important;
        background:radial-gradient(circle at 14% 0%, rgba(var(--elite-secondary),.17), transparent 40%), radial-gradient(circle at 96% 96%, rgba(var(--elite-accent),.23), transparent 52%), linear-gradient(155deg, rgba(var(--elite-deep),.97), rgba(5,15,24,.95)) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.19), 0 22px 48px rgba(0,0,0,.4), 0 0 34px rgba(var(--elite-accent),.23) !important;
      }
      .elite-profile-banner {
        display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:8px;
        margin:0 0 10px; padding:7px 9px;
        border:1px solid rgba(var(--elite-accent),.3); border-radius:9px; background:rgba(var(--elite-deep),.5);
      }
      .elite-profile-banner span { color:rgb(var(--elite-secondary)); font-size:.57rem; font-weight:1000; letter-spacing:.08em; }
      .elite-profile-banner strong { color:#fff; font-size:.72rem; }
      .elite-profile-banner em { color:rgba(235,245,244,.72); font-size:.55rem; font-style:normal; font-weight:900; }
      .elite-arrival-banner {
        position:absolute; z-index:34; left:50%; top:18px;
        display:grid; grid-template-columns:46px minmax(0,1fr); align-items:center; gap:10px;
        width:min(370px, calc(100% - 36px)); padding:10px 14px;
        border:1px solid rgba(var(--arrival-accent),.56); border-radius:14px;
        background:radial-gradient(circle at 12% 0%, rgba(var(--arrival-secondary),.18), transparent 45%), linear-gradient(135deg, rgba(var(--arrival-deep),.97), rgba(4,13,20,.96));
        color:#fff; box-shadow:inset 0 1px 0 rgba(255,255,255,.2), 0 16px 36px rgba(0,0,0,.36), 0 0 30px rgba(var(--arrival-accent),.26);
        opacity:0; transform:translate(-50%,-8px) scale(.97); pointer-events:none;
      }
      .elite-arrival-banner.is-visible { animation:eliteArrivalV2 2.3s ease both; }
      .elite-arrival-avatar {
        display:grid; place-items:center; width:44px; height:44px;
        border:1px solid rgba(var(--arrival-accent),.5); border-radius:12px;
        background:rgba(255,255,255,.07); font-size:1.55rem; box-shadow:0 0 19px rgba(var(--arrival-accent),.25);
      }
      .elite-arrival-copy { min-width:0; }
      .elite-arrival-copy p, .elite-arrival-copy h3, .elite-arrival-copy span { margin:0; }
      .elite-arrival-copy p { color:rgb(var(--arrival-secondary)); font-size:.57rem; font-weight:1000; letter-spacing:.1em; }
      .elite-arrival-copy h3 { margin-top:2px; font-size:.92rem; }
      .elite-arrival-copy span { display:block; margin-top:2px; color:rgba(229,239,238,.78); font-size:.64rem; line-height:1.3; }
      @keyframes eliteCharacterPulseV2 {
        from { box-shadow:inset 0 1px 0 rgba(255,255,255,.17), 0 0 0 1px rgba(var(--elite-secondary),.09), 0 12px 26px rgba(0,0,0,.28), 0 0 18px rgba(var(--elite-accent),.18); }
        to { box-shadow:inset 0 1px 0 rgba(255,255,255,.23), 0 0 0 1px rgba(var(--elite-secondary),.18), 0 12px 26px rgba(0,0,0,.28), 0 0 34px rgba(var(--elite-accent),.38); }
      }
      @keyframes eliteArrivalV2 {
        0% { opacity:0; transform:translate(-50%,-9px) scale(.96); }
        12%,78% { opacity:1; transform:translate(-50%,0) scale(1); }
        100% { opacity:0; transform:translate(-50%,-4px) scale(.985); }
      }
      @media (prefers-reduced-motion:reduce) {
        .seat.is-elite-character .seat-header { animation:none !important; }
        .elite-arrival-banner.is-visible { animation:none !important; opacity:1; transform:translate(-50%,0); }
      }
    `;
    document.head.appendChild(style);
  }

  function characterFor(player) {
    return player ? CHARACTERS[player.name] || null : null;
  }

  function syncSeatVisuals() {
    document.querySelectorAll(".seat[data-profile-position]").forEach(seat => {
      const position = Number(seat.dataset.profilePosition);
      const player = state?.players?.find(candidate => candidate.position === position);
      const character = characterFor(player);
      const shared = Boolean(character && player.name !== GEMINI);
      const desiredTheme = shared ? `elite-${character.theme}` : "";

      seat.classList.toggle("is-elite-character", shared);
      THEME_CLASSES.forEach(name => seat.classList.toggle(name, name === desiredTheme));

      let badge = seat.querySelector(".elite-character-badge");
      if (!shared) {
        badge?.remove();
        delete seat.dataset.eliteCharacter;
        return;
      }

      seat.dataset.eliteCharacter = player.name;
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "elite-character-badge";
        seat.appendChild(badge);
      }
      if (badge.textContent !== character.badge) badge.textContent = character.badge;
    });
  }

  function syncProfileVisuals() {
    const panel = document.querySelector("#aiProfilePanel");
    if (!panel) return;
    const selected = state?.players?.find(
      player => !player.isHuman && player.position === state.selectedProfilePosition,
    );
    const character = characterFor(selected);
    const shared = Boolean(character && selected.name !== GEMINI && !panel.hidden);
    const desiredClass = shared ? `elite-${character.theme}-profile` : "";

    panel.classList.toggle("is-elite-character-profile", shared);
    PROFILE_CLASSES.forEach(name => panel.classList.toggle(name, name === desiredClass));

    let banner = panel.querySelector(".elite-profile-banner");
    if (!shared) {
      banner?.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement("div");
      banner.className = "elite-profile-banner";
      panel.querySelector(".ai-profile-hero")?.insertAdjacentElement("afterend", banner);
    }
    const html = `<span>${character.badge}</span><strong>${character.title}</strong><em>${character.tier}</em>`;
    if (banner.innerHTML !== html) banner.innerHTML = html;
  }

  function palette(theme) {
    return {
      nova: ["165,120,255", "75,225,198", "24,20,63"],
      unit9: ["70,216,231", "123,168,255", "8,31,43"],
      merlin: ["205,139,255", "244,199,91", "46,20,62"],
      vlad: ["235,75,98", "150,60,211", "53,9,25"],
    }[theme] || ["175,135,255", "83,220,213", "22,20,53"];
  }

  function ensureArrivalBanner() {
    const arena = document.querySelector("#arena");
    if (!arena) return null;
    let banner = document.querySelector("#eliteArrivalBanner");
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = "eliteArrivalBanner";
      banner.className = "elite-arrival-banner";
      banner.setAttribute("aria-live", "polite");
      arena.appendChild(banner);
    }
    return banner;
  }

  function showArrival(player, character) {
    if (!player || !character || player.name === GEMINI) return;
    const key = `${state?.handNumber || 0}:${player.name}`;
    if (shownArrivals.has(key)) return;
    shownArrivals.add(key);

    const banner = ensureArrivalBanner();
    if (!banner) return;
    const [accent, secondary, deep] = palette(character.theme);
    banner.style.setProperty("--arrival-accent", accent);
    banner.style.setProperty("--arrival-secondary", secondary);
    banner.style.setProperty("--arrival-deep", deep);
    banner.innerHTML = `<span class="elite-arrival-avatar">${player.emoji}</span><div class="elite-arrival-copy"><p>${character.badge} · ${character.tier}</p><h3>${player.name}｜${character.title}</h3><span>${character.entrance}</span></div>`;
    banner.classList.remove("is-visible");
    void banner.offsetWidth;
    banner.classList.add("is-visible");

    window.clearTimeout(arrivalTimer);
    const duration = window.GameSpeedController?.scaleDelay?.(2350, {
      category: "presentation",
      actorName: player.name,
    }) || 2350;
    arrivalTimer = window.setTimeout(() => banner.classList.remove("is-visible"), duration);
  }

  function syncArrivals() {
    for (const player of state?.players || []) {
      const character = characterFor(player);
      if (character && player.status === "新加入") showArrival(player, character);
    }
  }

  function ensureVladTournamentQueue() {
    if (!window.TournamentMode?.isActive?.()) return false;
    const tournament = state?.tournament;
    if (!tournament) return false;
    if (tournament.appeared?.includes(VLAD)) return false;
    if (tournament.eliminated?.includes(VLAD)) return false;
    if (tournament.queue?.includes(VLAD)) return false;

    const finalIndex = tournament.queue.indexOf(GEMINI);
    if (finalIndex >= 0) tournament.queue.splice(finalIndex, 0, VLAD);
    else tournament.queue.push(VLAD);
    return true;
  }

  function syncTournamentCountUi() {
    if (!window.TournamentMode?.isActive?.()) return;
    const defeated = state?.tournament?.eliminated?.length || 0;
    const badge = document.querySelector("#tournamentProgressBadge");
    const value = badge?.querySelector("strong");
    const progress = `${defeated} / ${TOURNAMENT_TOTAL}`;
    if (value && value.textContent !== progress) value.textContent = progress;
    if (badge) badge.title = `已永久淘汰 ${defeated} 位；剩餘 ${Math.max(0, TOURNAMENT_TOTAL - defeated)} 位`;

    const summary = document.querySelector("#sessionSummaryContent");
    if (!summary) return;
    const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const next = node.textContent
        .replace(/全部 16 位 AI/g, `全部 ${TOURNAMENT_TOTAL} 位 AI`)
        .replace(/\/ 16/g, `/ ${TOURNAMENT_TOTAL}`)
        .replace(/16 位 AI/g, `${TOURNAMENT_TOTAL} 位 AI`);
      if (next !== node.textContent) node.textContent = next;
    }
  }

  function installTournamentExtension() {
    if (!window.TournamentMode?.version) return false;
    if (window.__eliteTournamentExtensionV2Installed) return true;
    window.__eliteTournamentExtensionV2Installed = true;

    const originalReset = resetGameSession;
    resetGameSession = function resetGameSessionWithVlad(...args) {
      const result = originalReset.apply(this, args);
      ensureVladTournamentQueue();
      return result;
    };

    const originalSetMode = window.TournamentMode.setMode.bind(window.TournamentMode);
    window.TournamentMode.setMode = function setModeWithVlad(...args) {
      const result = originalSetMode(...args);
      ensureVladTournamentQueue();
      scheduleRefresh();
      return result;
    };

    if (!window.__eliteTournamentLogV2Wrapped && typeof log === "function") {
      window.__eliteTournamentLogV2Wrapped = true;
      const originalLog = log;
      log = function logWithEliteTotal(message, ...args) {
        const patched = String(message).replace(
          "淘汰賽開始：16 位 AI",
          `淘汰賽開始：${TOURNAMENT_TOTAL} 位 AI`,
        );
        return originalLog.call(this, patched, ...args);
      };
    }

    ensureVladTournamentQueue();
    return true;
  }

  function refresh() {
    registerVlad();
    installStyles();
    installTournamentExtension();
    ensureVladTournamentQueue();
    syncSeatVisuals();
    syncProfileVisuals();
    syncArrivals();
    syncTournamentCountUi();
    document.documentElement.dataset.eliteCharacterPresentation = "ready";
    return true;
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  function install() {
    registerVlad();
    installStyles();
    refresh();

    observer?.disconnect();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });

    window.clearInterval(tournamentPoll);
    tournamentPoll = window.setInterval(() => {
      if (installTournamentExtension()) {
        window.clearInterval(tournamentPoll);
        tournamentPoll = 0;
        scheduleRefresh();
      }
    }, 60);
  }

  window.EliteCharacterPresentation = {
    version: VERSION,
    characters: CHARACTERS,
    totalTournamentAi: TOURNAMENT_TOTAL,
    registerVlad,
    ensureVladTournamentQueue,
    refresh,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
