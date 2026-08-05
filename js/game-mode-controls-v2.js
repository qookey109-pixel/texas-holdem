// Unified game-mode controls: normal-by-default tournament entry and non-disruptive Gemini shutdown.
(() => {
  "use strict";

  if (window.GameModeControlsV2?.version) return;

  const TOURNAMENT_STORAGE_KEY = "texasHoldemGameModeV1";
  const BOSS_NAME = "Gemini";
  const NORMAL_MODE = "normal";
  const TOURNAMENT_MODE = "tournament";
  const DECISION_PATH = "/v1/decision";
  const OBSERVED_CONTROL_SELECTOR = [
    "#settingsMenuPanel",
    "#tournamentModeButton",
    "#geminiBossButton",
    "#aiProfilePanel",
    "#geminiInstantStopButton",
  ].join(",");
  const OBSERVED_CONTROL_ROOT_SELECTOR = "#settingsMenuPanel,#aiProfilePanel";

  let syncScheduled = false;
  let observer = null;
  let activeDecisionControllers = new Set();

  function removeLegacyTournamentPreference() {
    try {
      localStorage.removeItem(TOURNAMENT_STORAGE_KEY);
    } catch (_) {
      // Normal mode remains the in-memory default.
    }
  }

  function forceNormalModeOnPageLoad() {
    removeLegacyTournamentPreference();
    if (!window.TournamentMode?.setMode) return;
    window.TournamentMode.setMode(NORMAL_MODE, {
      restart: false,
      persist: false,
    });
  }

  function stopLegacyVisibleEntry() {
    window.TournamentModeVisibleEntry?.stop?.();
    document.querySelector("#tournamentModeVisibleEntryStyles")?.remove();
  }

  function openSettingsMenu() {
    const settingsButton = document.querySelector("#settingsMenuButton")
      || [...document.querySelectorAll("button")].find(button => /設定/.test(button.textContent || ""));
    const panel = document.querySelector("#settingsMenuPanel");
    if (panel && !panel.hidden) return true;
    settingsButton?.click();
    return Boolean(document.querySelector("#settingsMenuPanel"));
  }

  function setTournamentMode(nextMode) {
    if (!window.TournamentMode?.setMode) return false;
    const mode = nextMode === TOURNAMENT_MODE ? TOURNAMENT_MODE : NORMAL_MODE;
    removeLegacyTournamentPreference();
    window.TournamentMode.setMode(mode, {
      restart: true,
      persist: false,
    });
    removeLegacyTournamentPreference();
    scheduleSync();
    return true;
  }

  function installTournamentButton() {
    const panel = document.querySelector("#settingsMenuPanel");
    const existing = document.querySelector("#tournamentModeButton");
    if (!panel || !existing) return false;

    let button = existing;
    if (button.dataset.gameModeControlsV2 !== "true") {
      const replacement = button.cloneNode(true);
      replacement.dataset.gameModeControlsV2 = "true";
      button.replaceWith(replacement);
      button = replacement;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const active = Boolean(window.TournamentMode?.isActive?.());
        setTournamentMode(active ? NORMAL_MODE : TOURNAMENT_MODE);
      });
    }

    button.hidden = false;
    button.className = "ghost-button topbar-settings-item";
    button.classList.remove("tournament-mode-side-entry", "tournament-mode-floating-entry", "tool-button");
    button.removeAttribute("style");
    if (button.parentElement !== panel) panel.appendChild(button);

    const active = Boolean(window.TournamentMode?.isActive?.());
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "🏆 結束淘汰賽" : "🏆 淘汰賽模式";
    button.title = active ? "結束目前淘汰賽並回到一般模式" : "開始永久淘汰賽";
    return true;
  }

  function installDecisionAbortBridge() {
    if (window.__gameModeDecisionFetchWrapped) return;
    window.__gameModeDecisionFetchWrapped = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = function fetchWithGameModeAbort(input, init = {}) {
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (!url.includes(DECISION_PATH)) return originalFetch(input, init);

      const controller = new AbortController();
      const upstreamSignal = init.signal;
      const forwardAbort = () => controller.abort();

      if (upstreamSignal) {
        if (upstreamSignal.aborted) controller.abort();
        else upstreamSignal.addEventListener("abort", forwardAbort, { once: true });
      }

      activeDecisionControllers.add(controller);
      return originalFetch(input, {
        ...init,
        signal: controller.signal,
      }).finally(() => {
        activeDecisionControllers.delete(controller);
        upstreamSignal?.removeEventListener?.("abort", forwardAbort);
      });
    };
  }

  function abortActiveGeminiDecisions() {
    const count = activeDecisionControllers.size;
    activeDecisionControllers.forEach(controller => controller.abort());
    activeDecisionControllers.clear();
    return count;
  }

  function replacementProfileForSeats(seats, geminiIndex) {
    const usedNames = new Set(
      seats
        .filter((_, index) => index !== geminiIndex)
        .map(seat => seat?.profile?.name)
        .filter(Boolean),
    );
    return AI_ROSTER.find(profile => profile.name !== BOSS_NAME && !usedNames.has(profile.name)) || null;
  }

  function installGeminiRetirementGuard() {
    if (window.__geminiRetirementGuardInstalled || typeof buildNextAiSeats !== "function") return;
    window.__geminiRetirementGuardInstalled = true;

    const originalBuildNextAiSeats = buildNextAiSeats;
    buildNextAiSeats = function buildNextAiSeatsWithGeminiRetirement(previousPlayers) {
      const seats = originalBuildNextAiSeats(previousPlayers);
      if (
        !state.geminiRetireAfterHand
        || state.geminiBossMode
        || window.TournamentMode?.isActive?.()
      ) {
        return seats;
      }

      const geminiIndex = seats.findIndex(seat => seat?.profile?.name === BOSS_NAME);
      if (geminiIndex >= 0) {
        const replacementProfile = replacementProfileForSeats(seats, geminiIndex);
        if (replacementProfile) {
          const retiredSeat = seats[geminiIndex];
          seats[geminiIndex] = {
            ...retiredSeat,
            profile: replacementProfile,
            replaced: null,
            bossArrival: false,
          };
        }
      }

      state.geminiRetireAfterHand = false;
      return seats;
    };
  }

  function clearGeminiConnectionErrorSoon() {
    window.setTimeout(() => {
      const connection = window.GeminiFinalBoss?.connection;
      if (!connection || window.GeminiFinalBoss?.isBossMode?.()) return;
      Object.assign(connection, {
        connected: false,
        mode: "local-fallback",
        lastError: "",
      });
      window.GeminiFinalBoss?.refresh?.();
    }, 120);
  }

  function disableGeminiWithoutRestart() {
    const bossOnTable = state.players?.some(player => player.name === BOSS_NAME);
    state.geminiRetireAfterHand = Boolean(bossOnTable);

    const pending = abortActiveGeminiDecisions();
    if (pending > 0) window.GeminiAsyncBettingLoop?.cancelPending?.();

    window.GeminiFinalBoss?.disable?.({
      restart: false,
      persist: true,
    });

    const message = bossOnTable
      ? "Gemini 挑戰已關閉：本手改由本地 AI 完成，下一手離桌。"
      : "Gemini 挑戰已關閉。";
    log?.(`⏹ ${message}`);
    announce?.("Gemini 挑戰已關閉");

    if (pending > 0) {
      window.setTimeout(() => {
        if (!state.handOver) continueBetting();
      }, 140);
    }

    clearGeminiConnectionErrorSoon();
    scheduleSync();
    return true;
  }

  function installGeminiButton() {
    const panel = document.querySelector("#settingsMenuPanel");
    const existing = document.querySelector("#geminiBossButton");
    if (!panel || !existing) return false;

    let button = existing;
    if (button.dataset.gameModeControlsV2 !== "true") {
      const replacement = button.cloneNode(true);
      replacement.dataset.gameModeControlsV2 = "true";
      button.replaceWith(replacement);
      button = replacement;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.TournamentMode?.isActive?.()) {
          announce?.("淘汰賽中 Gemini 會依候補順序最後登場");
          return;
        }
        if (window.GeminiFinalBoss?.isBossMode?.()) {
          disableGeminiWithoutRestart();
        } else {
          window.GeminiFinalBoss?.enable?.({ restart: true, persist: true });
          scheduleSync();
        }
      });
    }

    button.className = "ghost-button topbar-settings-item";
    if (button.parentElement !== panel) panel.appendChild(button);
    const active = Boolean(window.GeminiFinalBoss?.isBossMode?.());
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "⏹ 結束 Gemini 挑戰" : "👑 挑戰 Gemini";
    button.title = active ? "不中斷本手牌，立即停止 Gemini 後端" : "重新開局並讓 Gemini 進入牌桌";
    return true;
  }

  function installGeminiProfileStopButton() {
    const profile = document.querySelector("#aiProfilePanel.is-gemini-final-boss-profile");
    const shouldShow = Boolean(profile && !profile.hidden && window.GeminiFinalBoss?.isBossMode?.());
    let button = document.querySelector("#geminiInstantStopButton");

    if (!shouldShow) {
      button?.remove();
      return false;
    }

    if (!button) {
      button = document.createElement("button");
      button.id = "geminiInstantStopButton";
      button.type = "button";
      button.className = "ghost-button gemini-instant-stop-button";
      button.textContent = "⏹ 結束 Gemini 挑戰";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        disableGeminiWithoutRestart();
      });
      profile.appendChild(button);
    }
    return true;
  }

  function installStyles() {
    if (document.querySelector("#gameModeControlsV2Styles")) return;
    const style = document.createElement("style");
    style.id = "gameModeControlsV2Styles";
    style.textContent = `
      #settingsMenuPanel #tournamentModeButton,
      #settingsMenuPanel #geminiBossButton {
        position: static !important;
        width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
        transform: none !important;
      }
      .gemini-instant-stop-button {
        width: 100%;
        min-height: 38px;
        margin-top: 10px;
        border-color: rgba(255,120,111,.42);
        background: rgba(105,35,39,.32);
        color: #ffd2ce;
      }
      .gemini-instant-stop-button:hover:not(:disabled) {
        border-color: rgba(255,120,111,.68);
      }
    `;
    document.head.appendChild(style);
  }

  function syncUi() {
    stopLegacyVisibleEntry();
    installStyles();
    installTournamentButton();
    installGeminiButton();
    installGeminiProfileStopButton();
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncUi();
    });
  }

  function nodeTouchesObservedControls(node) {
    if (!(node instanceof Element)) return false;
    return node.matches(OBSERVED_CONTROL_SELECTOR)
      || Boolean(node.querySelector(OBSERVED_CONTROL_SELECTOR));
  }

  function mutationsTouchObservedControls(records) {
    return records.some(record => {
      const target = record.target;
      if (
        target instanceof Element
        && (target.matches(OBSERVED_CONTROL_ROOT_SELECTOR)
          || Boolean(target.closest(OBSERVED_CONTROL_ROOT_SELECTOR)))
      ) {
        return true;
      }
      return [...record.addedNodes, ...record.removedNodes].some(nodeTouchesObservedControls);
    });
  }

  installDecisionAbortBridge();
  installGeminiRetirementGuard();
  forceNormalModeOnPageLoad();
  syncUi();

  observer = new MutationObserver(records => {
    if (mutationsTouchObservedControls(records)) scheduleSync();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleSync, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleSync();
  });

  window.GameModeControlsV2 = {
    version: "2.0.0",
    setTournamentMode,
    disableGeminiWithoutRestart,
    openSettingsMenu,
    abortActiveGeminiDecisions,
    refresh: syncUi,
  };
})();
