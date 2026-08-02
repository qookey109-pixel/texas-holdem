// Compatibility loader for the unified game-mode controls.
(() => {
  "use strict";

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
    script.addEventListener("load", () => {
      window.GameModeControlsV2?.refresh?.();
    }, { once: true });
    document.body.appendChild(script);
    return true;
  }

  window.TournamentModeVisibleEntry = {
    version: "2.0.0",
    refresh: loadUnifiedControls,
    stop() {},
  };

  loadUnifiedControls();
})();
