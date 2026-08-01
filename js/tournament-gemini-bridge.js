// Ensure a naturally arriving tournament Gemini uses the secure backend from its first action.
(() => {
  "use strict";

  if (window.TournamentGeminiBridge?.version) return;
  if (typeof botAction !== "function") return;

  const BOSS_NAME = "Gemini";
  const backendAwareBotAction = botAction;
  let ownsTemporaryBossMode = false;
  let syncTimer = null;
  let observer = null;

  function tournamentActive() {
    return Boolean(window.TournamentMode?.isActive?.());
  }

  function geminiAtTable() {
    return Boolean(
      tournamentActive()
      && Array.isArray(state?.players)
      && state.players.some(player => player?.name === BOSS_NAME && player.stack > 0),
    );
  }

  function enableTemporaryBossMode() {
    if (!tournamentActive()) return false;
    if (window.GeminiFinalBoss?.isBossMode?.()) return true;

    window.GeminiFinalBoss?.enable?.({
      restart: false,
      persist: false,
    });
    ownsTemporaryBossMode = true;
    return Boolean(window.GeminiFinalBoss?.isBossMode?.());
  }

  function releaseTemporaryBossMode() {
    if (!ownsTemporaryBossMode) return false;

    window.GeminiFinalBoss?.disable?.({
      restart: false,
      persist: false,
    });
    ownsTemporaryBossMode = false;
    return true;
  }

  function sync() {
    if (geminiAtTable()) {
      enableTemporaryBossMode();
      return true;
    }

    if (!tournamentActive() || !geminiAtTable()) {
      releaseTemporaryBossMode();
    }
    return false;
  }

  botAction = function botActionWithTournamentGeminiBridge(player) {
    if (
      tournamentActive()
      && player?.name === BOSS_NAME
    ) {
      // GeminiBackendClient checks boss mode before choosing the Worker.
      // Enable it synchronously so even Gemini's first tournament action uses the backend.
      enableTemporaryBossMode();
    }

    return backendAwareBotAction(player);
  };

  observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  syncTimer = window.setInterval(sync, 400);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync();
  });

  sync();

  window.TournamentGeminiBridge = {
    version: "1.0.0",
    sync,
    isTemporaryBossMode: () => ownsTemporaryBossMode,
    stop() {
      window.clearInterval(syncTimer);
      observer?.disconnect();
      releaseTemporaryBossMode();
    },
  };
})();
