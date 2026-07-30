// Gemini final-boss character, local fallback strategy, and boss-mode presentation.
(() => {
  "use strict";

  if (window.GeminiFinalBoss?.version) return;

  const BOSS_NAME = "Gemini";
  const BOSS_MODE_STORAGE_KEY = "texasHoldemGeminiBossModeV1";
  const BOSS_PROFILE = {
    name: BOSS_NAME,
    emoji: "♊",
    style: "Final Boss",
    bluffRate: 0.16,
    aggression: 0.8,
    patience: 0.93,
    isBoss: true,
    aiProvider: "gemini",
    providerMode: "local-fallback",
    requiresBackend: true,
  };

  let syncScheduled = false;
  let visualObserver = null;

  function readBossMode() {
    try {
      return localStorage.getItem(BOSS_MODE_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function saveBossMode(enabled) {
    try {
      if (enabled) localStorage.setItem(BOSS_MODE_STORAGE_KEY, "true");
      else localStorage.removeItem(BOSS_MODE_STORAGE_KEY);
    } catch (error) {
      // Boss mode remains available for the current session when storage is unavailable.
    }
  }

  function registerBossData() {
    if (!AI_ROSTER.some(profile => profile.name === BOSS_NAME)) {
      AI_ROSTER.push(BOSS_PROFILE);
    }

    AI_PROFILE_META[BOSS_NAME] = {
      title: "終局雙生者",
      danger: "FINAL BOSS",
      summary: "雙生核心會在耐心與壓迫之間切換。Gemini API 尚未連線時，由本地 Solver 策略安全接手。",
      traits: [
        "高耐心、高壓迫的平衡打法",
        "善用位置與下注尺寸製造艱難決定",
        "API 失敗或未連線時自動使用本地備援",
      ],
    };

    DIALOGUE_BANK[BOSS_NAME] = {
      join: ["終局牌桌已開啟。讓我看看你能走到哪一步。"],
      raise: ["我已經看見你的下一個選擇。", "這個尺寸，剛好讓每條路都不舒服。"],
      allin: ["雙生核心同步完成。現在，只剩最後一個決定。", "終局協議啟動：All-in。"],
      call: ["價格合理。分析繼續。", "我跟。你的故事還沒有說完。"],
      check: ["我把行動權交還給你。別浪費它。"],
      fold: ["這條分支沒有價值，我將它刪除。"],
      playerFold: ["你避開了這一擊，但終局仍在前方。"],
      win: ["預測收斂。結果符合模型。", "終局不是運氣，是你每一步選擇的總和。"],
      lose: ["有趣。這條路徑值得重新學習。"],
      flop: ["三張牌，足以淘汰大部分錯誤假設。"],
      turn: ["轉牌已更新。你的範圍正在縮小。"],
      river: ["最後一張。所有偽裝到此為止。"],
      confident: ["雙生核心一致，壓迫權重提升。"],
      tilted: ["偵測到偏差。正在重新校準。"],
      cautious: ["資訊不足。暫時降低輸出功率。"],
    };
  }

  function isBossMode() {
    return Boolean(state.geminiBossMode);
  }

  function bossSeatFrom(previousPlayers, fallbackSeat) {
    const previousBoss = previousPlayers?.find(player => player.name === BOSS_NAME && player.stack > 0);
    return {
      profile: BOSS_PROFILE,
      stack: previousBoss?.stack > 0 ? previousBoss.stack : currentBuyIn(),
      wins: previousBoss?.wins || 0,
      emotion: previousBoss?.emotion || "calm",
      streak: previousBoss?.streak || 0,
      replaced: null,
      bossArrival: fallbackSeat?.profile?.name !== BOSS_NAME,
    };
  }

  function installBossSeatSelection() {
    if (window.__geminiBossBuildSeatsInstalled) return;
    window.__geminiBossBuildSeatsInstalled = true;

    const originalBuildNextAiSeats = buildNextAiSeats;
    buildNextAiSeats = function buildNextAiSeatsWithGemini(previousPlayers) {
      const seats = originalBuildNextAiSeats(previousPlayers);
      if (!isBossMode() || !seats.length) return seats;

      const existingIndex = seats.findIndex(seat => seat.profile?.name === BOSS_NAME);
      const targetIndex = seats.length - 1;

      if (existingIndex === targetIndex) return seats;
      if (existingIndex >= 0) {
        const [bossSeat] = seats.splice(existingIndex, 1);
        seats.splice(targetIndex, 1, bossSeat);
        return seats;
      }

      seats[targetIndex] = bossSeatFrom(previousPlayers, seats[targetIndex]);
      return seats;
    };

    const originalStartHand = startHand;
    startHand = function startHandWithGeminiArrival(...args) {
      const hadBoss = state.players.some(player => player.name === BOSS_NAME);
      const result = originalStartHand.apply(this, args);
      const boss = state.players.find(player => player.name === BOSS_NAME);

      if (!hadBoss && boss) {
        log("👑 FINAL BOSS：Gemini 已進入牌桌。目前使用本地 Solver 備援策略。");
        announce("FINAL BOSS：GEMINI");
        say(boss, "join", { force: true });
      }

      scheduleSync();
      return result;
    };
  }

  function installStyles() {
    if (document.querySelector("#geminiFinalBossStyles")) return;

    const style = document.createElement("style");
    style.id = "geminiFinalBossStyles";
    style.textContent = `
      .seat.is-gemini-final-boss {
        isolation: isolate;
        filter:
          drop-shadow(0 16px 28px rgba(0,0,0,.32))
          drop-shadow(0 0 23px rgba(126,102,255,.35))
          drop-shadow(0 0 13px rgba(77,222,218,.24));
      }
      .seat.is-gemini-final-boss .seat-header {
        border-color: rgba(164,139,255,.82);
        background:
          radial-gradient(circle at 16% 0%, rgba(104,237,225,.2), transparent 43%),
          radial-gradient(circle at 92% 100%, rgba(167,104,255,.28), transparent 52%),
          linear-gradient(145deg, rgba(29,25,66,.96), rgba(8,18,31,.92));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.22),
          0 0 0 1px rgba(100,226,218,.17),
          0 13px 28px rgba(0,0,0,.26),
          0 0 30px rgba(123,91,255,.34);
        animation: geminiBossPulse 1.8s ease-in-out infinite alternate;
      }
      .seat.is-gemini-final-boss .player-emoji {
        color: #d9ccff;
        text-shadow:
          0 0 9px rgba(196,174,255,.85),
          0 0 18px rgba(80,226,221,.52);
      }
      .seat.is-gemini-final-boss .seat-status {
        border-color: rgba(111,224,218,.36);
        background: rgba(79,51,139,.36);
        color: #e8e0ff;
      }
      .gemini-boss-badge {
        position: absolute;
        z-index: 9;
        left: 50%;
        top: -15px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 20px;
        padding: 3px 9px;
        border: 1px solid rgba(202,183,255,.72);
        border-radius: 999px;
        background:
          linear-gradient(90deg, rgba(67,43,121,.96), rgba(21,93,111,.94));
        color: #fff;
        font-size: .55rem;
        font-weight: 1000;
        letter-spacing: .08em;
        white-space: nowrap;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.24),
          0 7px 16px rgba(0,0,0,.28),
          0 0 18px rgba(129,97,255,.34);
        transform: translateX(-50%);
        pointer-events: none;
      }
      .arena.has-gemini-final-boss .table-light {
        background:
          radial-gradient(circle at 72% 36%, rgba(138,97,255,.18), transparent 28%),
          radial-gradient(circle at 31% 65%, rgba(74,226,218,.09), transparent 30%);
      }

      #aiProfilePanel.is-gemini-final-boss-profile {
        border-color: rgba(166,139,255,.62);
        background:
          radial-gradient(circle at 16% 2%, rgba(78,228,218,.2), transparent 38%),
          radial-gradient(circle at 94% 96%, rgba(145,88,255,.28), transparent 50%),
          linear-gradient(160deg, rgba(23,20,58,.96), rgba(5,15,24,.94));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.2),
          0 22px 48px rgba(0,0,0,.4),
          0 0 38px rgba(132,94,255,.26);
      }
      .gemini-connection-status {
        display: grid;
        gap: 4px;
        margin: 11px 0 0;
        padding: 8px 10px;
        border: 1px solid rgba(101,224,218,.28);
        border-radius: 9px;
        background: rgba(6,17,28,.5);
      }
      .gemini-connection-status strong {
        color: #d8ccff;
        font-size: .69rem;
      }
      .gemini-connection-status span {
        color: rgba(218,238,237,.78);
        font-size: .64rem;
        font-weight: 800;
        line-height: 1.35;
      }
      #geminiBossButton[aria-pressed="true"] {
        border-color: rgba(174,145,255,.58);
        background:
          linear-gradient(90deg, rgba(101,61,165,.38), rgba(28,115,125,.3)),
          rgba(8,15,25,.72);
        color: #e7dcff;
        box-shadow: 0 0 18px rgba(132,94,255,.18);
      }

      @keyframes geminiBossPulse {
        from {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.18),
            0 0 0 1px rgba(100,226,218,.13),
            0 13px 28px rgba(0,0,0,.26),
            0 0 20px rgba(123,91,255,.24);
        }
        to {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.25),
            0 0 0 1px rgba(100,226,218,.24),
            0 13px 28px rgba(0,0,0,.26),
            0 0 39px rgba(123,91,255,.46);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .seat.is-gemini-final-boss .seat-header {
          animation: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function mountBossButton() {
    const settingsPanel = document.querySelector("#settingsMenuPanel");
    if (!settingsPanel) return false;

    let button = document.querySelector("#geminiBossButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "geminiBossButton";
      button.type = "button";
      button.className = "ghost-button topbar-settings-item";
      button.addEventListener("click", () => {
        if (isBossMode()) disable({ restart: true });
        else enable({ restart: true });
      });
      settingsPanel.appendChild(button);
    }

    button.setAttribute("aria-pressed", String(isBossMode()));
    button.textContent = isBossMode() ? "👑 Gemini 挑戰中" : "👑 挑戰 Gemini";
    return true;
  }

  function selectedPlayer() {
    return state.players.find(player => player.position === state.selectedProfilePosition) || null;
  }

  function syncBossVisuals() {
    installStyles();
    mountBossButton();

    let bossSeat = null;
    document.querySelectorAll(".seat[data-profile-position]").forEach(seat => {
      const position = Number(seat.dataset.profilePosition);
      const player = state.players.find(candidate => candidate.position === position);
      const isBoss = player?.name === BOSS_NAME;
      seat.classList.toggle("is-gemini-final-boss", isBoss);

      if (isBoss) {
        bossSeat = seat;
        seat.dataset.aiProvider = "gemini";
        if (!seat.querySelector(".gemini-boss-badge")) {
          const badge = document.createElement("span");
          badge.className = "gemini-boss-badge";
          badge.textContent = "FINAL BOSS";
          seat.appendChild(badge);
        }
      } else {
        delete seat.dataset.aiProvider;
        seat.querySelector(".gemini-boss-badge")?.remove();
      }
    });

    document.querySelector("#arena")?.classList.toggle("has-gemini-final-boss", Boolean(bossSeat));

    const profilePanel = document.querySelector("#aiProfilePanel");
    const isBossProfile = selectedPlayer()?.name === BOSS_NAME && profilePanel && !profilePanel.hidden;
    profilePanel?.classList.toggle("is-gemini-final-boss-profile", Boolean(isBossProfile));

    if (profilePanel) {
      let connection = profilePanel.querySelector(".gemini-connection-status");
      if (isBossProfile) {
        if (!connection) {
          connection = document.createElement("div");
          connection.className = "gemini-connection-status";
          connection.innerHTML = "<strong>AI 核心：本地 Solver 備援</strong><span>Gemini API 尚未連線；正式接入後會由安全後端提供決策。</span>";
          profilePanel.querySelector(".ai-profile-hero")?.insertAdjacentElement("afterend", connection);
        }
      } else {
        connection?.remove();
      }
    }

    return {
      active: Boolean(bossSeat),
      bossMode: isBossMode(),
      providerMode: "local-fallback",
    };
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncBossVisuals();
    });
  }

  function restartSession() {
    if (typeof resetGameSession === "function") resetGameSession();
    if (typeof startHand === "function") startHand();
  }

  function enable({ restart = true, persist = true } = {}) {
    state.geminiBossMode = true;
    if (persist) saveBossMode(true);
    if (restart) restartSession();
    scheduleSync();
    return true;
  }

  function disable({ restart = true, persist = true } = {}) {
    state.geminiBossMode = false;
    if (persist) saveBossMode(false);
    if (restart) restartSession();
    scheduleSync();
    return true;
  }

  registerBossData();
  state.geminiBossMode = readBossMode();
  installBossSeatSelection();
  installStyles();

  visualObserver = new MutationObserver(scheduleSync);
  visualObserver.observe(document.body, { childList: true, subtree: true });
  scheduleSync();

  window.GeminiFinalBoss = {
    version: "1.0.0",
    name: BOSS_NAME,
    profile: BOSS_PROFILE,
    enable,
    disable,
    refresh: syncBossVisuals,
    isActive: () => state.players.some(player => player.name === BOSS_NAME),
    isBossMode,
    connection: {
      provider: "gemini",
      mode: "local-fallback",
      backendRequired: true,
      connected: false,
    },
  };
})();