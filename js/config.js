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
const LAYOUT_STORAGE_KEY = "texasHoldemTableLayoutV3";
const LAYOUT_PANEL_STORAGE_KEY = "texasHoldemLayoutPanelPositionV1";
const LAYOUT_ARROW_STORAGE_KEY = "texasHoldemDialogueArrowsV1";
const HERO_STYLE_STORAGE_KEY = "texasHoldemHeroStyleStatsV1";
const DEFAULT_LAYOUT = {
  seat1: { left: 4, top: 53 },
  seat2: { left: 7.2, top: 25.5 },
  seat3: { left: 27, top: 7 },
  seat4: { left: 60.5, top: 7 },
  seat5: { left: 79.5, top: 25.5 },
  seat6: { left: 82, top: 53 },
  seatCards1: { left: 14, top: 63 },
  seatCards2: { left: 16, top: 39 },
  seatCards3: { left: 36, top: 20 },
  seatCards4: { left: 64, top: 20 },
  seatCards5: { left: 84, top: 39 },
  seatCards6: { left: 84, top: 63 },
  dialogue1: { left: 22, top: 48 },
  dialogue2: { left: 19, top: 24 },
  dialogue3: { left: 33, top: 18 },
  dialogue4: { left: 66, top: 18 },
  dialogue5: { left: 78, top: 24 },
  dialogue6: { left: 78, top: 48 },
  board: { left: 50, top: 53 },
  pot: { left: 50, top: 35 },
  stage: { left: 50, top: 43 },
  hero: { left: 50, top: 88 },
  heroCards: { left: 43, top: 88 },
  heroPanel: { left: 61, top: 88 },
  heroStack: { left: 50, top: 70 },
  actions: { left: 82, top: 80 },
};
const DEFAULT_DIALOGUE_ARROWS = {
  dialogue1: "left",
  dialogue2: "left",
  dialogue3: "up",
  dialogue4: "up",
  dialogue5: "right",
  dialogue6: "right",
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

  const loadTournamentGeminiBridge = () => {
    if (document.querySelector('script[data-tournament-gemini-bridge]')) return;
    const bridgeScript = document.createElement("script");
    bridgeScript.src = "js/tournament-gemini-bridge.js?v=secure-final-boss-v1";
    bridgeScript.async = false;
    bridgeScript.dataset.tournamentGeminiBridge = "true";
    document.body.appendChild(bridgeScript);
  };

  const loadTournamentVisibleEntry = () => {
    if (document.querySelector('script[data-tournament-visible-entry]')) return;
    const visibilityScript = document.createElement("script");
    visibilityScript.src = "js/tournament-mode-visible-entry.js?v=visible-entry-v1";
    visibilityScript.async = false;
    visibilityScript.dataset.tournamentVisibleEntry = "true";
    document.body.appendChild(visibilityScript);
  };

  const loadReplacementStackBalance = () => {
    if (document.querySelector('script[data-replacement-stack-balance]')) return;
    const balanceScript = document.createElement("script");
    balanceScript.src = "js/replacement-stack-balance.js?v=table-average-v1";
    balanceScript.async = false;
    balanceScript.dataset.replacementStackBalance = "true";
    document.body.appendChild(balanceScript);
  };

  const loadTableStatusDock = () => {
    if (document.querySelector('script[data-table-status-dock]')) return;
    const statusScript = document.createElement("script");
    statusScript.src = "js/table-status-dock.js?v=board-safe-v1";
    statusScript.async = false;
    statusScript.dataset.tableStatusDock = "true";
    document.body.appendChild(statusScript);
  };

  const loadEliteCharacterPresentation = () => {
    if (document.querySelector('script[data-elite-character-presentation]')) return;
    const characterScript = document.createElement("script");
    characterScript.src = "js/elite-character-presentation.js?v=tiered-multiway-equity-v2-7";
    characterScript.async = false;
    characterScript.dataset.eliteCharacterPresentation = "true";
    document.body.appendChild(characterScript);
  };

  const loadCoachHandReviewIntegration = () => {
    if (document.querySelector('script[data-coach-hand-review-integration]')) return;
    const reviewScript = document.createElement("script");
    reviewScript.src = "js/coach-hand-review-integration.js?v=coach-review-v1";
    reviewScript.async = false;
    reviewScript.dataset.coachHandReviewIntegration = "true";
    document.body.appendChild(reviewScript);
  };

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

  const loadGoogleAuth = () => {
    if (document.querySelector('script[data-google-auth]')) {
      installGoogleAuthTopbarPlacement();
      return;
    }
    const authScript = document.createElement("script");
    authScript.src = "js/auth-entry-v2.js?v=auth-entry-video-crop-v2";
    authScript.async = false;
    authScript.dataset.googleAuth = "true";
    authScript.addEventListener("load", installGoogleAuthTopbarPlacement, { once: true });
    document.body.appendChild(authScript);
    installGoogleAuthTopbarPlacement();
  };

  loadEliteCharacterPresentation();
  loadTableStatusDock();
  loadTournamentVisibleEntry();
  loadCoachHandReviewIntegration();
  loadGoogleAuth();

  if (!document.querySelector('script[data-tournament-mode]')) {
    const tournamentScript = document.createElement("script");
    tournamentScript.src = "js/tournament-mode.js?v=elimination-mode-v1";
    tournamentScript.async = false;
    tournamentScript.dataset.tournamentMode = "true";
    tournamentScript.addEventListener("load", () => {
      installTournamentNewHandGuard();
      loadTournamentGeminiBridge();
      loadReplacementStackBalance();
      window.TournamentModeVisibleEntry?.refresh?.();
    }, { once: true });
    document.body.appendChild(tournamentScript);
  } else if (window.TournamentMode?.version) {
    installTournamentNewHandGuard();
    loadTournamentGeminiBridge();
    loadReplacementStackBalance();
    window.TournamentModeVisibleEntry?.refresh?.();
  } else {
    loadReplacementStackBalance();
  }

  if (!document.querySelector('script[data-ai-profile-position]')) {
    const profileScript = document.createElement("script");
    profileScript.src = "js/ai-profile-position.js?v=nearby-seat-v1";
    profileScript.async = false;
    profileScript.dataset.aiProfilePosition = "true";
    document.body.appendChild(profileScript);
  }

  if (!document.querySelector('script[data-accessibility-focus]')) {
    const accessibilityScript = document.createElement("script");
    accessibilityScript.src = "js/accessibility-focus.js?v=desktop-a11y-v2";
    accessibilityScript.async = false;
    accessibilityScript.dataset.accessibilityFocus = "true";
    document.body.appendChild(accessibilityScript);
  }
}, { once: true });