// Keep turn and action notices in a dedicated HUD beside the player panel.
(() => {
  "use strict";

  if (window.TableStatusDock?.version) return;

  const VERSION = "1.0.0";
  const TURN_COPY_PATTERN = /(輪到你|你的回合|等待你的動作|請選擇動作)/;
  let observer = null;
  let refreshFrame = 0;

  function installStyles() {
    if (document.querySelector("#tableStatusDockStyles")) return;

    const style = document.createElement("style");
    style.id = "tableStatusDockStyles";
    style.textContent = `
      .player-panel {
        overflow: visible !important;
      }

      #tableStatusDock {
        position: absolute;
        z-index: 16;
        left: 50%;
        bottom: calc(100% + 10px);
        display: grid;
        justify-items: center;
        gap: 6px;
        width: max-content;
        max-width: min(300px, 30vw);
        transform: translateX(-50%);
        pointer-events: none;
      }

      #tableStatusDock .action-toast,
      #tableStatusDock .turn-marker {
        position: relative !important;
        inset: auto !important;
        left: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        margin: 0 !important;
        transform: none !important;
        white-space: nowrap;
        pointer-events: none;
      }

      #tableStatusDock .action-toast {
        min-width: 128px;
        max-width: min(280px, 28vw);
        padding: 7px 13px;
        font-size: .72rem;
        line-height: 1.1;
        opacity: 0;
      }

      #tableStatusDock .action-toast.is-visible {
        animation: tableStatusToastPop 1250ms ease both !important;
      }

      #tableStatusDock .action-toast.is-duplicate-turn {
        display: none !important;
      }

      #tableStatusDock .turn-marker {
        z-index: 1;
        padding: 5px 11px;
        font-size: .72rem;
      }

      #tableStatusDock .turn-marker.is-visible {
        display: inline-flex;
        animation: tableStatusTurnPulse 950ms ease-in-out infinite alternate !important;
      }

      @keyframes tableStatusToastPop {
        0% { opacity: 0; transform: translateY(5px) scale(.94); }
        14%, 76% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-3px) scale(.98); }
      }

      @keyframes tableStatusTurnPulse {
        from {
          opacity: .82;
          transform: translateY(0);
          box-shadow: 0 0 16px rgba(112,216,201,.12);
        }
        to {
          opacity: 1;
          transform: translateY(-2px);
          box-shadow: 0 0 26px rgba(112,216,201,.28);
        }
      }

      @media (max-width: 1100px) {
        #tableStatusDock {
          bottom: calc(100% + 7px);
          max-width: min(240px, 34vw);
          gap: 4px;
        }
        #tableStatusDock .action-toast,
        #tableStatusDock .turn-marker {
          font-size: .66rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #tableStatusDock .action-toast.is-visible,
        #tableStatusDock .turn-marker.is-visible {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDock() {
    const playerPanel = document.querySelector(".player-panel");
    const actionToast = document.querySelector("#actionToast");
    const turnMarker = document.querySelector("#playerTurnMarker");
    if (!playerPanel || !actionToast || !turnMarker) return null;

    let dock = document.querySelector("#tableStatusDock");
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "tableStatusDock";
      dock.className = "table-status-dock";
      dock.setAttribute("aria-label", "牌局提示");
      playerPanel.appendChild(dock);
    } else if (dock.parentElement !== playerPanel) {
      playerPanel.appendChild(dock);
    }

    if (actionToast.parentElement !== dock) dock.appendChild(actionToast);
    if (turnMarker.parentElement !== dock) dock.appendChild(turnMarker);
    return dock;
  }

  function syncDuplicateTurnNotice() {
    const actionToast = document.querySelector("#actionToast");
    const turnMarker = document.querySelector("#playerTurnMarker");
    if (!actionToast || !turnMarker) return;

    const markerVisible = turnMarker.classList.contains("is-visible");
    const toastVisible = actionToast.classList.contains("is-visible");
    const duplicate = markerVisible
      && toastVisible
      && TURN_COPY_PATTERN.test(actionToast.textContent || "");

    actionToast.classList.toggle("is-duplicate-turn", duplicate);
  }

  function refresh() {
    installStyles();
    const dock = ensureDock();
    if (!dock) return false;
    syncDuplicateTurnNotice();
    document.documentElement.dataset.tableStatusDock = "ready";
    return true;
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  function observeNotices() {
    observer?.disconnect();
    const actionToast = document.querySelector("#actionToast");
    const turnMarker = document.querySelector("#playerTurnMarker");
    if (!actionToast || !turnMarker) return;

    observer = new MutationObserver(scheduleRefresh);
    observer.observe(actionToast, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeFilter: ["class"],
    });
    observer.observe(turnMarker, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeFilter: ["class"],
    });
  }

  function install() {
    if (!refresh()) return;
    observeNotices();
    window.addEventListener("resize", scheduleRefresh, { passive: true });
  }

  window.TableStatusDock = {
    version: VERSION,
    refresh,
    isInstalled() {
      const dock = document.querySelector("#tableStatusDock");
      return Boolean(
        dock
        && dock.parentElement?.classList.contains("player-panel")
        && dock.contains(document.querySelector("#actionToast"))
        && dock.contains(document.querySelector("#playerTurnMarker")),
      );
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
