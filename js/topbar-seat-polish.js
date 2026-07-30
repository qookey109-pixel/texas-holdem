// Compact top-bar settings and visually attach each street bet to its player card.
(() => {
  "use strict";

  if (window.TopbarSeatPolish?.version) return;

  const SETTINGS_CONTROL_IDS = Object.freeze([
    "muteButton",
    "bgmButton",
    "audioVolumeButton",
    "themeButton",
    "cardStyleButton",
    "layoutButton",
  ]);

  let observer = null;
  let actionsObserver = null;
  let refreshScheduled = false;

  function installStyles() {
    if (document.querySelector("#topbarSeatPolishStyles")) return;

    const style = document.createElement("style");
    style.id = "topbarSeatPolishStyles";
    style.textContent = `
      .topbar-settings {
        position: relative;
        flex: 0 0 auto;
      }
      .topbar-settings-toggle {
        min-width: 84px !important;
      }
      .topbar-settings-toggle[aria-expanded="true"] {
        border-color: rgba(233,188,101,.48);
        background:
          linear-gradient(180deg, rgba(233,188,101,.16), rgba(255,255,255,.035)),
          rgba(5,13,16,.72);
        color: var(--gold);
      }
      .topbar-settings-panel {
        position: absolute;
        z-index: 70;
        top: calc(100% + 7px);
        right: 0;
        display: grid;
        gap: 6px;
        width: 188px;
        padding: 9px;
        border: 1px solid rgba(233,188,101,.28);
        border-radius: 11px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.1), rgba(255,255,255,.025)),
          rgba(5,12,17,.96);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.1),
          0 18px 38px rgba(0,0,0,.4);
        backdrop-filter: blur(16px) saturate(125%);
      }
      .topbar-settings-panel[hidden] {
        display: none !important;
      }
      .topbar-settings-title {
        margin: 0 2px 2px;
        color: var(--muted);
        font-size: .61rem;
        font-weight: 900;
        letter-spacing: .04em;
      }
      .topbar-settings-panel .ghost-button {
        width: 100%;
        min-width: 0 !important;
        min-height: 38px;
        justify-content: flex-start;
        padding-inline: 11px !important;
        text-align: left;
      }

      .seat.has-street-bet {
        gap: 0;
      }
      .seat.has-street-bet .seat-header {
        border-radius: 10px 10px 6px 6px;
      }
      .seat.has-street-bet .seat-street-bet {
        width: calc(100% - 18px);
        min-width: 0;
        min-height: 23px;
        margin: -1px 9px 0;
        padding: 3px 8px 4px;
        border-top: 0;
        border-radius: 0 0 8px 8px;
        background:
          linear-gradient(180deg, rgba(233,188,101,.13), rgba(233,188,101,.055)),
          rgba(5,13,16,.58);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 6px 12px rgba(0,0,0,.13);
      }
      .seat.has-street-bet .seat-street-bet span {
        color: rgba(233,188,101,.82);
      }
      .seat.has-street-bet .seat-street-bet strong {
        font-size: .75rem;
      }

      @media (max-width: 1120px) {
        .top-bar-actions {
          gap: 5px;
        }
        .top-bar-actions > .ghost-button,
        .topbar-settings-toggle {
          min-width: 78px !important;
          padding-inline: 7px !important;
        }
      }

      @media (max-width: 900px) {
        .topbar-settings-panel {
          width: 174px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function closeSettings() {
    const button = document.querySelector("#settingsMenuButton");
    const panel = document.querySelector("#settingsMenuPanel");
    if (!button || !panel) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function toggleSettings() {
    const button = document.querySelector("#settingsMenuButton");
    const panel = document.querySelector("#settingsMenuPanel");
    if (!button || !panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
  }

  function mountSettingsMenu() {
    const actions = document.querySelector(".top-bar-actions");
    const tutorialButton = document.querySelector("#tutorialButton");
    const muteButton = document.querySelector("#muteButton");
    const themeButton = document.querySelector("#themeButton");
    const layoutButton = document.querySelector("#layoutButton");
    if (!actions || !tutorialButton || !muteButton || !themeButton || !layoutButton) return false;

    let wrapper = document.querySelector("#topbarSettings");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "topbarSettings";
      wrapper.className = "topbar-settings";
      wrapper.innerHTML = `
        <button id="settingsMenuButton" class="ghost-button tool-button topbar-settings-toggle" type="button" aria-expanded="false" aria-controls="settingsMenuPanel">⚙ 設定</button>
        <div id="settingsMenuPanel" class="topbar-settings-panel" hidden>
          <p class="topbar-settings-title">顯示與牌桌設定</p>
        </div>`;
      actions.insertBefore(wrapper, tutorialButton);
      wrapper.querySelector("#settingsMenuButton")?.addEventListener("click", event => {
        event.stopPropagation();
        toggleSettings();
      });
    }

    const panel = wrapper.querySelector("#settingsMenuPanel");
    if (!panel) return false;

    SETTINGS_CONTROL_IDS
      .map(id => document.getElementById(id))
      .filter(Boolean)
      .forEach(button => {
        button.classList.add("topbar-settings-item");
        if (button.parentElement !== panel) panel.appendChild(button);
      });

    return true;
  }

  function syncSeatBets() {
    document.querySelectorAll(".seat").forEach(seat => {
      seat.classList.toggle("has-street-bet", Boolean(seat.querySelector(":scope > .seat-street-bet")));
    });
  }

  function refresh() {
    installStyles();
    const menuMounted = mountSettingsMenu();
    syncSeatBets();
    return {
      menuMounted,
      streetBetCount: document.querySelectorAll(".seat.has-street-bet").length,
    };
  }

  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(() => {
      refreshScheduled = false;
      refresh();
    });
  }

  function observeTopbarActions() {
    const actions = document.querySelector(".top-bar-actions");
    if (!actions) return;
    actionsObserver?.disconnect();
    actionsObserver = new MutationObserver(scheduleRefresh);
    actionsObserver.observe(actions, { childList: true });
  }

  installStyles();
  refresh();
  observeTopbarActions();

  document.addEventListener("click", event => {
    if (!event.target.closest("#topbarSettings")) closeSettings();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSettings();
  });
  document.querySelector("#settingsMenuPanel")?.addEventListener("click", event => {
    if (event.target.closest("#audioVolumeButton")) return;
    if (event.target.closest("button")) closeSettings();
  });

  const opponents = document.querySelector("#opponents");
  if (opponents) {
    observer = new MutationObserver(syncSeatBets);
    observer.observe(opponents, { childList: true, subtree: true });
  }

  window.TopbarSeatPolish = {
    version: "1.1.0",
    refresh,
    closeSettings,
  };
})();
