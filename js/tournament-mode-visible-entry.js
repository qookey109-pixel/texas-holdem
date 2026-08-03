// Compatibility loader plus visible challenge-mode entry beside the beginner tutorial.
(() => {
  "use strict";

  if (window.TournamentModeVisibleEntry?.version === "3.2.0") return;

  const NORMAL_MODE = "normal";
  const TOURNAMENT_MODE = "tournament";
  let observer = null;
  let syncScheduled = false;

  function loadUnifiedControls() {
    if (window.GameModeControlsV2?.version) {
      window.GameModeControlsV2.refresh?.();
      return true;
    }

    if (document.querySelector('script[data-game-mode-controls-v2]')) return false;

    const script = document.createElement("script");
    script.src = "js/game-mode-controls-v2.js?v=normal-default-gemini-instant-off-v1";
    script.async = false;
    script.dataset.gameModeControlsV2 = "true";
    script.addEventListener("load", scheduleSync, { once: true });
    document.body.appendChild(script);
    return true;
  }

  function loadTournamentCloudSave() {
    if (window.TournamentCloudSave?.version) {
      window.TournamentCloudSave.refresh?.();
      return true;
    }
    if (document.querySelector('script[data-tournament-cloud-save]')) return false;

    const script = document.createElement("script");
    script.src = "js/tournament-cloud-save.js?v=tournament-cloud-save-v1";
    script.async = false;
    script.dataset.tournamentCloudSave = "true";
    script.addEventListener("load", scheduleSync, { once: true });
    document.body.appendChild(script);
    return true;
  }

  function applyDefaultAutoNewHand() {
    const root = document.documentElement;
    if (root.dataset.defaultAutoNewHandApplied === "true") return true;
    if (typeof state !== "object") return false;

    root.dataset.defaultAutoNewHandApplied = "true";
    state.autoNewHand = true;

    if (typeof render === "function" && state.players?.length) {
      render();
    }
    return true;
  }

  function installStyles() {
    if (document.querySelector("#challengeModeTopbarStyles")) return;

    const style = document.createElement("style");
    style.id = "challengeModeTopbarStyles";
    style.textContent = `
      #settingsMenuPanel #tournamentModeButton {
        display: none !important;
      }
      #challengeModeButton {
        white-space: nowrap;
      }
      #challengeModeButton[aria-pressed="true"] {
        border-color: rgba(240,194,94,.62);
        background:
          linear-gradient(90deg, rgba(135,80,28,.34), rgba(106,44,37,.28)),
          rgba(8,15,25,.72);
        color: #ffe5a3;
        box-shadow: 0 0 18px rgba(240,194,94,.18);
      }
      .game-mode-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        margin: 0;
        padding: 3px 9px;
        border: 1px solid rgba(112,216,201,.28);
        border-radius: 999px;
        background: rgba(42,112,102,.18);
        color: #a9e8df;
        font-size: .64rem;
        font-weight: 950;
        letter-spacing: .04em;
        white-space: nowrap;
      }
      .game-mode-label[data-mode="challenge"] {
        border-color: rgba(240,194,94,.48);
        background: rgba(111,67,25,.3);
        color: #ffe2a0;
        box-shadow: 0 0 14px rgba(240,194,94,.12);
      }
      :root[data-theme="light"] .game-mode-label {
        border-color: rgba(31,121,109,.24);
        background: rgba(69,163,150,.12);
        color: #1d6a60;
      }
      :root[data-theme="light"] .game-mode-label[data-mode="challenge"] {
        border-color: rgba(139,91,25,.3);
        background: rgba(234,196,128,.26);
        color: #684210;
      }
      @media (max-width: 760px) {
        #challengeModeButton {
          font-size: .66rem;
          padding-inline: 9px;
        }
        .game-mode-label {
          font-size: .58rem;
          padding-inline: 7px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setMode(nextMode) {
    const mode = nextMode === TOURNAMENT_MODE ? TOURNAMENT_MODE : NORMAL_MODE;
    if (window.GameModeControlsV2?.setTournamentMode) {
      window.GameModeControlsV2.setTournamentMode(mode);
    } else {
      window.TournamentMode?.setMode?.(mode, {
        restart: true,
        persist: false,
      });
    }
    scheduleSync();
  }

  function mountChallengeButton() {
    const tutorialButton = document.querySelector("#tutorialButton");
    const topbar = document.querySelector(".top-bar-actions");
    if (!tutorialButton || !topbar) return false;

    let button = document.querySelector("#challengeModeButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "challengeModeButton";
      button.type = "button";
      button.className = "ghost-button tool-button challenge-mode-button";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const active = Boolean(window.TournamentMode?.isActive?.());
        setMode(active ? NORMAL_MODE : TOURNAMENT_MODE);
      });
    }

    if (button.parentElement !== topbar || tutorialButton.nextElementSibling !== button) {
      tutorialButton.insertAdjacentElement("afterend", button);
    }

    const active = Boolean(window.TournamentMode?.isActive?.());
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "🏆 結束挑戰賽" : "🏆 挑戰賽模式";
    button.title = active ? "結束挑戰賽並回到一般模式" : "開始永久淘汰挑戰賽";
    return true;
  }

  function mountModeLabel() {
    const handNumber = document.querySelector("#handNumber");
    if (!handNumber) return false;

    let label = document.querySelector("#gameModeLabel");
    if (!label) {
      label = document.createElement("p");
      label.id = "gameModeLabel";
      label.className = "game-mode-label";
      label.setAttribute("aria-live", "polite");
    }

    if (handNumber.nextElementSibling !== label) {
      handNumber.insertAdjacentElement("afterend", label);
    }

    const active = Boolean(window.TournamentMode?.isActive?.());
    label.dataset.mode = active ? "challenge" : "normal";
    label.textContent = active ? "挑戰賽模式" : "一般模式";
    return true;
  }

  function syncUi() {
    applyDefaultAutoNewHand();
    installStyles();
    loadUnifiedControls();
    loadTournamentCloudSave();
    mountChallengeButton();
    mountModeLabel();
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncUi();
    });
  }

  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleSync();
  });

  window.TournamentModeVisibleEntry = {
    version: "3.2.0",
    refresh: syncUi,
    stop() {
      observer?.disconnect();
      observer = null;
    },
  };

  syncUi();
})();
