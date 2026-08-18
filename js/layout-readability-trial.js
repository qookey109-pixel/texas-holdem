// Layout readability polish. Positioning belongs exclusively to Layout V4.
(() => {
  "use strict";

  const VERSION = "1.2.0";
  const TRIAL_ID = "readability-v2";
  const POSITION_AUTHORITY = "layout-v4";

  if (
    window.LayoutReadabilityTrial?.version === VERSION
    && window.LayoutReadabilityTrial?.positionAuthority === POSITION_AUTHORITY
  ) return;

  function installStyles() {
    document.querySelector("#layoutReadabilityTrialStyles")?.remove();

    const style = document.createElement("style");
    style.id = "layoutReadabilityTrialStyles";
    style.textContent = `
      html[data-layout-trial="${TRIAL_ID}"] .seat-status {
        max-width: 74px;
        min-height: 21px;
        padding: 3px 7px;
        font-size: .64rem;
        line-height: 1.05;
      }

      html[data-layout-trial="${TRIAL_ID}"] body .seat-header .seat-status {
        min-height: 21px !important;
      }

      html[data-layout-trial="${TRIAL_ID}"] .seat-status strong {
        font-size: .72rem;
      }

      html[data-layout-trial="${TRIAL_ID}"] .seat-status.is-thinking {
        width: 64px;
        min-width: 64px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-meter {
        height: 10px;
        border-color: rgba(255,255,255,.18);
        background: rgba(255,255,255,.075);
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-meter span {
        background: linear-gradient(90deg, #ff625e 0%, #f4c95f 48%, #61e3b6 100%);
        box-shadow:
          0 0 10px rgba(244,201,95,.24),
          0 0 16px rgba(97,227,182,.18);
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-panel,
      html[data-layout-trial="${TRIAL_ID}"] .log-panel {
        padding: 12px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-header,
      html[data-layout-trial="${TRIAL_ID}"] .log-header {
        min-height: 32px;
        margin-bottom: 10px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-content {
        gap: 10px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-card {
        padding: 12px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-card-title {
        margin-bottom: 9px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .coach-stats {
        margin-top: 8px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .game-log {
        gap: 6px;
        scrollbar-gutter: stable;
      }

      html[data-layout-trial="${TRIAL_ID}"] .log-entry {
        min-height: 30px;
        padding-block: 7px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .pot-chip {
        gap: 8px;
      }

      html[data-layout-trial="${TRIAL_ID}"] .pot-chip strong {
        font-size: clamp(1.55rem, 2.3vw, 2rem);
      }

      @media (min-width: 901px) {
        html[data-layout-trial="${TRIAL_ID}"] .side-rail {
          gap: 12px;
          padding-left: 12px;
          border-left: 1px solid rgba(112,216,201,.12);
        }

        html[data-layout-trial="${TRIAL_ID}"] .controls {
          row-gap: 9px;
        }

        html[data-layout-trial="${TRIAL_ID}"] .controls .raise-control {
          margin-top: 1px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            0 7px 16px rgba(0,0,0,.12);
        }

        html[data-layout-trial="${TRIAL_ID}"] .controls .quick-bets {
          padding-top: 3px;
          border-top: 1px solid rgba(255,255,255,.09);
        }

        html[data-layout-trial="${TRIAL_ID}"] .player-cards {
          filter:
            drop-shadow(0 14px 22px rgba(0,0,0,.3))
            drop-shadow(0 0 14px rgba(112,216,201,.08));
        }
      }

      @media (max-width: 900px) {
        html[data-layout-trial="${TRIAL_ID}"] .seat-status {
          max-width: 66px;
          min-height: 18px;
          padding: 2px 5px;
          font-size: .56rem;
        }

        html[data-layout-trial="${TRIAL_ID}"] .seat-status strong {
          font-size: .62rem;
        }

        html[data-layout-trial="${TRIAL_ID}"] .coach-panel,
        html[data-layout-trial="${TRIAL_ID}"] .log-panel {
          padding: 9px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function layoutState() {
    if (typeof state !== "undefined") return state;
    return window.state || null;
  }

  function savedCustomHeroCards() {
    try {
      if (localStorage.getItem("texasHoldemLayoutPreferenceV2") !== "custom") return null;
      const layout = JSON.parse(localStorage.getItem("texasHoldemTableLayoutV4") || "null");
      const item = layout?.heroCards;
      const left = Number(item?.left);
      const top = Number(item?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return { left, top };
    } catch (_) {
      return null;
    }
  }

  function authoritativeHeroCards() {
    const custom = savedCustomHeroCards();
    if (custom) return { ...custom, mode: "custom" };

    const official = window.OfficialLayoutPreset?.layout?.heroCards;
    const left = Number(official?.left);
    const top = Number(official?.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      return { left, top, mode: "official" };
    }

    const fallback = typeof DEFAULT_LAYOUT !== "undefined" ? DEFAULT_LAYOUT.heroCards : null;
    const fallbackLeft = Number(fallback?.left);
    const fallbackTop = Number(fallback?.top);
    if (Number.isFinite(fallbackLeft) && Number.isFinite(fallbackTop)) {
      return { left: fallbackLeft, top: fallbackTop, mode: "default" };
    }
    return null;
  }

  function restoreLayoutAuthority() {
    const gameState = layoutState();
    const item = authoritativeHeroCards();
    if (!gameState?.layout?.items?.heroCards || !item) return false;

    gameState.layout.items.heroCards = { left: item.left, top: item.top };
    if (typeof applyLayoutKey === "function") {
      applyLayoutKey("heroCards");
    } else if (typeof applyLayout === "function") {
      applyLayout();
    }

    delete document.documentElement.dataset.layoutTrialHeroLifted;
    document.documentElement.dataset.layoutReadabilityPositionAuthority = POSITION_AUTHORITY;
    return true;
  }

  function refresh() {
    installStyles();
    restoreLayoutAuthority();
    return snapshot();
  }

  function scheduleRefresh() {
    requestAnimationFrame(() => requestAnimationFrame(refresh));
  }

  function snapshot() {
    const item = layoutState()?.layout?.items?.heroCards;
    const authority = authoritativeHeroCards();
    return {
      trial: document.documentElement.dataset.layoutTrial || "",
      heroCardsLifted: false,
      heroCardsTop: Number(item?.top),
      liftPixels: 0,
      positionAuthority: POSITION_AUTHORITY,
      authorityMode: authority?.mode || "unknown",
    };
  }

  document.documentElement.dataset.layoutTrial = TRIAL_ID;
  installStyles();
  scheduleRefresh();

  window.LayoutReadabilityTrial = {
    version: VERSION,
    positionAuthority: POSITION_AUTHORITY,
    refresh,
    restoreLayoutAuthority,
    snapshot,
  };
})();