// Keep the tournament-mode control visible instead of letting the crowded top bar hide it.
(() => {
  "use strict";

  if (window.TournamentModeVisibleEntry?.version) return;

  const NARROW_QUERY = "(max-width: 1100px)";
  let observer = null;
  let resizeTimer = null;

  function installStyles() {
    if (document.querySelector("#tournamentModeVisibleEntryStyles")) return;

    const style = document.createElement("style");
    style.id = "tournamentModeVisibleEntryStyles";
    style.textContent = `
      #tournamentModeButton.tournament-mode-side-entry {
        grid-column: 1 / -1;
        width: 100%;
        min-width: 0;
        min-height: 42px;
        margin: 0 0 8px;
        border-color: rgba(240,194,94,.46);
        background:
          linear-gradient(90deg, rgba(135,80,28,.26), rgba(106,44,37,.2)),
          rgba(8,15,25,.82);
        color: #ffe5a3;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 10px 22px rgba(0,0,0,.2);
      }
      #tournamentModeButton.tournament-mode-floating-entry {
        position: fixed;
        z-index: 340;
        right: max(12px, env(safe-area-inset-right));
        bottom: max(12px, env(safe-area-inset-bottom));
        width: auto;
        min-width: 150px;
        min-height: 44px;
        margin: 0;
        border-color: rgba(240,194,94,.58);
        background:
          linear-gradient(90deg, rgba(135,80,28,.88), rgba(106,44,37,.84)),
          rgba(8,15,25,.96);
        color: #fff0bd;
        box-shadow: 0 14px 34px rgba(0,0,0,.42), 0 0 24px rgba(240,194,94,.14);
      }
      :root[data-theme="light"] #tournamentModeButton.tournament-mode-side-entry,
      :root[data-theme="light"] #tournamentModeButton.tournament-mode-floating-entry {
        border-color: rgba(139,91,25,.36);
        background: linear-gradient(90deg, rgba(255,242,207,.96), rgba(244,221,181,.96));
        color: #684210;
      }
    `;
    document.head.appendChild(style);
  }

  function placeButton() {
    const button = document.querySelector("#tournamentModeButton");
    if (!button) return false;

    installStyles();
    button.hidden = false;

    const narrow = window.matchMedia(NARROW_QUERY).matches;
    const sideRail = document.querySelector(".side-rail");

    if (!narrow && sideRail) {
      button.classList.add("tournament-mode-side-entry");
      button.classList.remove("tournament-mode-floating-entry", "tool-button", "topbar-settings-item");
      if (button.parentElement !== sideRail || sideRail.firstElementChild !== button) {
        sideRail.insertBefore(button, sideRail.firstElementChild);
      }
      return true;
    }

    button.classList.add("tournament-mode-floating-entry");
    button.classList.remove("tournament-mode-side-entry", "tool-button", "topbar-settings-item");
    if (button.parentElement !== document.body) document.body.appendChild(button);
    return true;
  }

  function schedulePlacement() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(placeButton, 40);
  }

  observer = new MutationObserver(placeButton);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedulePlacement, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) placeButton();
  });

  placeButton();

  window.TournamentModeVisibleEntry = {
    version: "1.0.0",
    refresh: placeButton,
    stop() {
      observer?.disconnect();
      window.removeEventListener("resize", schedulePlacement);
      window.clearTimeout(resizeTimer);
    },
  };
})();
