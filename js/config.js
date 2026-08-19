// Game configuration
window.GEMINI_BACKEND_ENDPOINT ||= "https://texas-holdem-gemini.q-oo109.workers.dev";

const STARTING_STACK = 2000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_RAISE = 20;
const HANDS_PER_BLIND_LEVEL = 5;
const BLIND_LEVELS = [
  { level: 1, small: 10, big: 20, buyIn: 2000 },
  { level: 2, small: 20, big: 40, buyIn: 4500 },
  { level: 3, small: 50, big: 100, buyIn: 7000 },
  { level: 4, small: 100, big: 200, buyIn: 10000 },
  { level: 5, small: 200, big: 400, buyIn: 15000 },
];
const SHORT_STACK_JAM_BB = 10;
const NORMAL_RAISE_STACK_CAP = 0.32;
const AUTO_NEW_HAND_DELAY = 3000;
const MAX_LOG_ENTRIES = 36;
const DIALOGUE_DISPLAY_MS = 3300;
const DIALOGUE_COOLDOWN_MS = 6500;
const MAX_DIALOGUE_PER_STREET = 3;
const CARD_MOTION_MS = 620;
const THEME_STORAGE_KEY = "texasHoldemTheme";
const LAYOUT_STORAGE_KEY = "texasHoldemTableLayoutV4";
const LAYOUT_PANEL_STORAGE_KEY = "texasHoldemLayoutPanelPositionV2";
const LAYOUT_ARROW_STORAGE_KEY = "texasHoldemDialogueArrowsV2";
const LAYOUT_PREFERENCE_KEY = "texasHoldemLayoutPreferenceV2";
const HERO_STYLE_STORAGE_KEY = "texasHoldemHeroStyleStatsV1";
const DEFAULT_LAYOUT = {
  seat1: { left: 2.29, top: 73.63 },
  seat2: { left: 1.5, top: 18 },
  seat3: { left: 29.25, top: 2.5 },
  seat4: { left: 55.04, top: 2.39 },
  seat5: { left: 80.16, top: 14.55 },
  seat6: { left: 82.05, top: 62.81 },
  seatCards1: { left: 23.38, top: 57.02 },
  seatCards2: { left: 23, top: 38.5 },
  seatCards3: { left: 38.59, top: 26.36 },
  seatCards4: { left: 60.94, top: 26.61 },
  seatCards5: { left: 76.3, top: 35.69 },
  seatCards6: { left: 76.42, top: 54.77 },
  dialogue1: { left: 10.87, top: 67.62 },
  dialogue2: { left: 9, top: 34 },
  dialogue3: { left: 36.91, top: 19.16 },
  dialogue4: { left: 63.5, top: 19.5 },
  dialogue5: { left: 89.19, top: 32.6 },
  dialogue6: { left: 92.35, top: 57.17 },
  board: { left: 50, top: 46.55 },
  pot: { left: 50, top: 32.5 },
  stage: { left: 50, top: 37.5 },
  hero: { left: 50, top: 88 },
  heroCards: { left: 50, top: 64.57 },
  heroPanel: { left: 50, top: 90.46 },
  heroStack: { left: 33.28, top: 90.48 },
  actions: { left: 81.6, top: 89.13 },
};
const DEFAULT_DIALOGUE_ARROWS = {
  dialogue1: "down",
  dialogue2: "up",
  dialogue3: "up",
  dialogue4: "up",
  dialogue5: "up",
  dialogue6: "down",
};
const DIALOGUE_ARROW_DIRECTIONS = new Set(["up", "down", "left", "right"]);
const CENTERED_LAYOUT_KEYS = new Set([
  "board",
  "pot",
  "stage",
  "hero",
  "heroCards",
  "heroPanel",
  "heroStack",
  "actions",
  "seatCards1",
  "seatCards2",
  "seatCards3",
  "seatCards4",
  "seatCards5",
  "seatCards6",
  "dialogue1",
  "dialogue2",
  "dialogue3",
  "dialogue4",
  "dialogue5",
  "dialogue6",
]);
const LAYOUT_SNAP_POINTS = [25, 50, 75];
const LAYOUT_SNAP_THRESHOLD = 0.8;
const LAYOUT_NUDGE_STEP = 0.5;
const LAYOUT_NUDGE_FAST_STEP = 2;
const DEFAULT_LAYOUT_PANEL = { left: null, top: 14 };
const STREET_LABELS = {
  "翻牌前": "PREFLOP",
  "翻牌": "FLOP",
  "轉牌": "TURN",
  "河牌": "RIVER",
  "結算": "SHOWDOWN",
};

function blindLevelForHand(handNumber) {
  const index = Math.min(
    BLIND_LEVELS.length - 1,
    Math.max(0, Math.floor((Math.max(1, handNumber) - 1) / HANDS_PER_BLIND_LEVEL))
  );
  return BLIND_LEVELS[index];
}

function currentBlindLevel() {
  return state?.blindLevel || blindLevelForHand(state?.handNumber || 1);
}

function currentSmallBlind() {
  return currentBlindLevel().small;
}

function currentBigBlind() {
  return currentBlindLevel().big;
}

function currentBuyIn() {
  return currentBlindLevel().buyIn;
}

document.addEventListener("DOMContentLoaded", () => {
  const AUTHORITY_WAIT_TIMEOUT_MS = 8000;
  const AUTHORITY_DISCOVERY_TIMEOUT_MS = 30000;

  const reportAuthorityFailure = (label, error) => {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    document.documentElement.dataset.configAuthorityState = "failed";
    document.documentElement.dataset.configAuthorityFailure = label;
    console.error(`[config] Critical authority failure: ${label}: ${message}`);

    let notice = document.querySelector("#configAuthorityFailure");
    if (!notice) {
      notice = document.createElement("section");
      notice.id = "configAuthorityFailure";
      notice.setAttribute("role", "alert");
      notice.setAttribute("aria-live", "assertive");
      notice.style.cssText = [
        "position:fixed",
        "z-index:10001",
        "left:50%",
        "top:78px",
        "transform:translateX(-50%)",
        "width:min(620px,calc(100% - 28px))",
        "padding:12px 14px",
        "border:1px solid rgba(255,158,89,.7)",
        "border-radius:12px",
        "background:rgba(72,34,12,.97)",
        "color:#fff",
        "box-shadow:0 16px 40px rgba(0,0,0,.4)",
        "font:600 14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      ].join(";");
      document.body.appendChild(notice);
    }
    notice.textContent = `核心執行模組載入失敗（${label}）。請重新整理頁面後再繼續。`;
  };

  const verifyAuthorityEventually = ({
    label,
    datasetKey,
    check,
    startWhen,
    failureSelector,
  }) => {
    const root = document.documentElement;
    root.dataset[datasetKey] = "loading";
    const discoveryDeadline = Date.now() + AUTHORITY_DISCOVERY_TIMEOUT_MS;
    let readinessDeadline = startWhen ? 0 : Date.now() + AUTHORITY_WAIT_TIMEOUT_MS;
    let timer = 0;
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      root.dataset[datasetKey] = "failed";
      reportAuthorityFailure(label, error);
      if (timer) window.clearInterval(timer);
    };

    if (failureSelector) {
      document.querySelector(failureSelector)?.addEventListener("error", () => {
        fail(new Error("terminal authority script failed to load"));
      }, { once: true });
    }

    const verify = () => {
      if (settled) return true;
      try {
        if (check()) {
          settled = true;
          root.dataset[datasetKey] = "ready";
          if (
            root.dataset.aiRuntimeAuthority === "ready"
            && root.dataset.replacementStackAuthority === "ready"
          ) {
            root.dataset.configAuthorityState = "ready";
          }
          if (timer) window.clearInterval(timer);
          return true;
        }
      } catch (error) {
        fail(error);
        return true;
      }

      if (!readinessDeadline && startWhen?.()) {
        readinessDeadline = Date.now() + AUTHORITY_WAIT_TIMEOUT_MS;
      }
      if (readinessDeadline && Date.now() >= readinessDeadline) {
        fail(new Error("authority readiness timeout"));
        return true;
      }
      if (!readinessDeadline && Date.now() >= discoveryDeadline) {
        fail(new Error("terminal authority discovery timeout"));
        return true;
      }
      return false;
    };

    if (!verify()) timer = window.setInterval(verify, 50);
  };

  const loadTrackedScript = ({
    selector,
    src,
    dataAttribute,
    label,
    critical = false,
    authority,
    onLoad,
  }) => {
    const existing = document.querySelector(selector);
    const handleLoaded = script => {
      if (script) script.dataset.loadState = "loaded";
      onLoad?.();
      if (authority) verifyAuthorityEventually(authority);
    };

    if (existing) {
      if (existing.dataset.loadState === "failed") {
        const error = new Error(`${label} previously failed to load`);
        if (critical) reportAuthorityFailure(label, error);
        else console.warn(`[config] Optional script unavailable: ${src}`, error);
        return existing;
      }
      if (authority) verifyAuthorityEventually(authority);
      onLoad?.();
      return existing;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(dataAttribute, "true");
    script.dataset.loadState = "loading";
    script.addEventListener("load", () => handleLoaded(script), { once: true });
    script.addEventListener("error", () => {
      script.dataset.loadState = "failed";
      const error = new Error(`${label} failed to load`);
      if (authority) document.documentElement.dataset[authority.datasetKey] = "failed";
      if (critical) reportAuthorityFailure(label, error);
      else console.warn(`[config] Optional script failed to load: ${src}`);
    }, { once: true });
    document.body.appendChild(script);
    return script;
  };

  const installTournamentNewHandGuard = () => {
    if (document.documentElement.dataset.tournamentNewHandGuard === "true") return;
    document.documentElement.dataset.tournamentNewHandGuard = "true";

    document.addEventListener("click", event => {
      if (!window.TournamentMode?.isActive?.()) return;
      const button = event.target.closest("#newHandButton");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startHand();
    }, true);
  };

  const loadTournamentGeminiBridge = () => loadTrackedScript({
    selector: 'script[data-tournament-gemini-bridge]',
    src: "js/tournament-gemini-bridge.js?v=secure-final-boss-v1",
    dataAttribute: "data-tournament-gemini-bridge",
    label: "Tournament Gemini bridge",
  });

  const loadTournamentVisibleEntry = () => loadTrackedScript({
    selector: 'script[data-tournament-visible-entry]',
    src: "js/tournament-mode-visible-entry.js?v=visible-entry-v1",
    dataAttribute: "data-tournament-visible-entry",
    label: "Tournament visible entry",
  });

  const loadReplacementStackBalance = () => loadTrackedScript({
    selector: 'script[data-replacement-stack-balance]',
    src: "js/replacement-stack-balance.js?v=table-average-v1",
    dataAttribute: "data-replacement-stack-balance",
    label: "Replacement stack authority",
    critical: true,
    authority: {
      label: "Replacement stack authority",
      datasetKey: "replacementStackAuthority",
      check: () => Boolean(
        window.ReplacementStackBalance?.version === "2.1.0"
        && window.ReplacementStackBalance?.isInstalled?.() === true
      ),
    },
  });

  const loadTableStatusDock = () => loadTrackedScript({
    selector: 'script[data-table-status-dock]',
    src: "js/table-status-dock.js?v=board-safe-v1",
    dataAttribute: "data-table-status-dock",
    label: "Table status dock",
  });

  const loadEliteCharacterPresentation = () => loadTrackedScript({
    selector: 'script[data-elite-character-presentation]',
    src: "js/elite-character-presentation.js?v=tiered-multiway-equity-v2-7",
    dataAttribute: "data-elite-character-presentation",
    label: "AI V2.9.5 authority chain",
    critical: true,
    authority: {
      label: "AI V2.9.5 authority chain",
      datasetKey: "aiRuntimeAuthority",
      startWhen: () => window.AiActionDispatcherV1?.version === "1.0.0",
      failureSelector: 'script[data-ai-action-dispatcher-v1]',
      check: () => Boolean(
        window.AiOpeningBalanceV295?.version === "2.9.5"
        && document.documentElement.dataset.aiOpeningBalanceV295 === "ready"
        && window.AiActionDispatcherV1?.version === "1.0.0"
        && document.documentElement.dataset.aiActionDispatcherV1 === "ready"
        && typeof window.AiActionDispatcherV1?.dispatch === "function"
      ),
    },
  });

  const loadCoachHandReviewIntegration = () => loadTrackedScript({
    selector: 'script[data-coach-hand-review-integration]',
    src: "js/coach-hand-review-integration.js?v=coach-review-v1",
    dataAttribute: "data-coach-hand-review-integration",
    label: "Coach hand-review integration",
  });

  const installGoogleAuthTopbarPlacement = () => {
    if (document.documentElement.dataset.googleAuthTopbarPlacement === "true") return;
    document.documentElement.dataset.googleAuthTopbarPlacement = "true";

    if (!document.querySelector("#googleAuthTopbarPlacementStyles")) {
      const style = document.createElement("style");
      style.id = "googleAuthTopbarPlacementStyles";
      style.textContent = `
        .top-bar-actions > #authAccountButton {
          width: auto !important;
          min-width: 96px !important;
          max-width: 156px;
          min-height: 34px;
          padding: 0 8px !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 0 1 auto;
        }
        .top-bar-actions > #authAccountButton .auth-account-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .top-bar-actions > #authAccountButton[data-auth-state="signed-in"] {
          border-color: rgba(112,216,201,.5);
          background: rgba(112,216,201,.1);
        }
        @media (max-width: 1180px) {
          .top-bar-actions > #authAccountButton {
            width: 38px !important;
            min-width: 38px !important;
            max-width: 38px;
            padding: 0 5px !important;
          }
          .top-bar-actions > #authAccountButton .auth-account-label {
            display: none;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const placeButton = () => {
      const actions = document.querySelector(".top-bar-actions");
      const button = document.querySelector("#authAccountButton");
      const settingsButton = document.querySelector("#settingsMenuButton");
      if (!actions || !button || !settingsButton) return false;

      button.classList.remove("topbar-settings-item");
      button.classList.add("tool-button", "auth-account-topbar-button");
      button.dataset.authPlacement = "topbar";
      button.setAttribute("aria-label", "玩家帳號與 Google 登入");
      button.title = "玩家帳號與 Google 登入";

      if (button.parentElement !== actions || button.previousElementSibling !== settingsButton) {
        settingsButton.insertAdjacentElement("afterend", button);
      }

      const overlay = document.querySelector("#authAccountOverlay");
      if (overlay && overlay.dataset.topbarFocusGuard !== "true") {
        overlay.dataset.topbarFocusGuard = "true";
        const focusObserver = new MutationObserver(() => {
          if (overlay.hidden) window.setTimeout(() => button.focus({ preventScroll: true }), 0);
        });
        focusObserver.observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
      }
      return true;
    };

    if (placeButton()) return;
    const observer = new MutationObserver(() => {
      if (!placeButton()) return;
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  };

  const loadGoogleAuth = () => loadTrackedScript({
    selector: 'script[data-google-auth]',
    src: "js/auth-entry-v2.js?v=auth-entry-safari-runtime-v3",
    dataAttribute: "data-google-auth",
    label: "Google auth entry",
    onLoad: installGoogleAuthTopbarPlacement,
  });

  document.documentElement.dataset.configAuthorityState = "loading";
  loadEliteCharacterPresentation();
  loadTableStatusDock();
  loadTournamentVisibleEntry();
  loadCoachHandReviewIntegration();
  loadGoogleAuth();
  installGoogleAuthTopbarPlacement();

  if (!document.querySelector('script[data-tournament-mode]')) {
    loadTrackedScript({
      selector: 'script[data-tournament-mode]',
      src: "js/tournament-mode.js?v=elimination-mode-v1",
      dataAttribute: "data-tournament-mode",
      label: "Tournament mode",
      onLoad: () => {
        installTournamentNewHandGuard();
        loadTournamentGeminiBridge();
        loadReplacementStackBalance();
        window.TournamentModeVisibleEntry?.refresh?.();
      },
    });
  } else if (window.TournamentMode?.version) {
    installTournamentNewHandGuard();
    loadTournamentGeminiBridge();
    loadReplacementStackBalance();
    window.TournamentModeVisibleEntry?.refresh?.();
  } else {
    loadReplacementStackBalance();
  }

  loadTrackedScript({
    selector: 'script[data-ai-profile-position]',
    src: "js/ai-profile-position.js?v=nearby-seat-v1",
    dataAttribute: "data-ai-profile-position",
    label: "AI profile position",
  });

  loadTrackedScript({
    selector: 'script[data-accessibility-focus]',
    src: "js/accessibility-focus.js?v=desktop-a11y-v2",
    dataAttribute: "data-accessibility-focus",
    label: "Accessibility focus",
  });
}, { once: true });