// Move the single-hand review into Poker Coach and give it an independent saved toggle.
(() => {
  "use strict";

  if (window.CoachHandReviewIntegration?.version) return;

  const VERSION = "1.0.1";
  const STORAGE_KEY = "texasHoldemCoachHandReviewEnabledV1";
  let installed = false;
  let observer = null;
  let syncFrame = 0;
  let originalRenderCoach = null;

  function readEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch (error) {
      return true;
    }
  }

  function saveEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch (error) {
      // The setting remains active for this session when storage is unavailable.
    }
  }

  function reviewEnabled() {
    return state?.coach?.review !== false;
  }

  function ensureStyles() {
    if (document.querySelector("#coachHandReviewIntegrationStyles")) return;

    const style = document.createElement("style");
    style.id = "coachHandReviewIntegrationStyles";
    style.textContent = `
      .coach-review-card {
        min-width: 0;
      }
      .coach-review-card[hidden] {
        display: none !important;
      }
      .coach-review-card .coach-card-title strong {
        color: var(--cyan);
        font-size: .66rem;
      }
      #coachReviewMount {
        min-width: 0;
      }
      #coachReviewMount .hand-review-panel {
        width: 100%;
        max-height: min(360px, 46vh);
        margin: 8px 0 0;
        border-color: rgba(112,216,201,.2);
        background:
          linear-gradient(180deg, rgba(112,216,201,.075), rgba(255,255,255,.018)),
          rgba(4,11,16,.48);
        box-sizing: border-box;
      }
      #coachReviewMount .hand-review-title p {
        display: none;
      }
      #coachReviewMount .hand-review-title h3 {
        font-size: .78rem;
      }
      #coachReviewMount .hand-review-cards,
      #coachReviewMount .hand-review-summary-grid {
        grid-template-columns: 1fr;
      }
      #coachReviewMount .hand-review-decisions li {
        grid-template-columns: 42px minmax(0, 1fr);
      }
      #coachReviewMount .hand-review-decisions li em {
        grid-column: 2;
      }
      #coachReviewMount .hand-review-opponent {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      #coachReviewMount .hand-review-opponent em {
        grid-column: 1 / -1;
      }
      .coach-review-placeholder {
        margin: 8px 0 0;
        padding: 8px 9px;
        border: 1px dashed rgba(112,216,201,.2);
        border-radius: 8px;
        color: var(--muted);
        background: rgba(255,255,255,.025);
        font-size: .63rem;
        line-height: 1.45;
      }
      .coach-review-placeholder[hidden] {
        display: none !important;
      }
      html body .side-rail.is-layout-editor-active .coach-review-card {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureToggle() {
    const toggles = document.querySelector("#coachPanel .coach-toggles");
    if (!toggles) return null;

    let input = document.querySelector("#coachReviewToggle");
    if (!input) {
      const label = document.createElement("label");
      label.dataset.coachReviewToggleLabel = "true";
      input = document.createElement("input");
      input.id = "coachReviewToggle";
      input.type = "checkbox";
      input.checked = reviewEnabled();
      label.append(input, document.createTextNode(" 牌局復盤"));
      toggles.appendChild(label);

      input.addEventListener("change", () => {
        setEnabled(input.checked, { persist: true, revealLatest: true });
      });
    }

    if (typeof els === "object" && els) els.coachReviewToggle = input;
    return input;
  }

  function ensureReviewCard() {
    const content = document.querySelector("#coachContent");
    if (!content) return null;

    let card = document.querySelector("#coachReviewCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "coachReviewCard";
      card.className = "coach-card coach-review-card";
      card.dataset.coachCard = "review";
      card.innerHTML = `
        <div class="coach-card-title">
          <span>牌局復盤</span>
          <strong id="coachReviewState">等待結算</strong>
        </div>
        <div id="coachReviewMount"></div>
        <p id="coachReviewPlaceholder" class="coach-review-placeholder">完成一手牌後，上一手的底牌、公共牌、關鍵動作與評級會顯示在這裡。</p>`;
      content.appendChild(card);
    }

    if (typeof els === "object" && els) {
      els.coachReviewCard = card;
      els.coachReviewMount = card.querySelector("#coachReviewMount");
    }
    return card;
  }

  function moveReviewPanel() {
    const card = ensureReviewCard();
    const mount = card?.querySelector("#coachReviewMount");
    const panel = document.querySelector("#handReviewPanel");
    if (!mount || !panel) return false;
    if (panel.matches('[data-coach-card="review"]')) {
      panel.removeAttribute("data-coach-card");
    }
    if (panel.parentElement !== mount) mount.appendChild(panel);
    panel.setAttribute("aria-label", "撲克教練－上一手牌局復盤");
    return true;
  }

  function syncPlaceholder() {
    const card = document.querySelector("#coachReviewCard");
    const panel = document.querySelector("#handReviewPanel");
    const placeholder = card?.querySelector("#coachReviewPlaceholder");
    const stateLabel = card?.querySelector("#coachReviewState");
    const latest = window.HandReview?.latest?.() || null;
    if (!placeholder || !stateLabel) return;

    if (!latest) {
      stateLabel.textContent = "等待結算";
      placeholder.textContent = "完成一手牌後，上一手的底牌、公共牌、關鍵動作與評級會顯示在這裡。";
      placeholder.hidden = false;
      return;
    }

    stateLabel.textContent = `第 ${latest.handNumber} 局`;
    if (panel?.hidden) {
      placeholder.textContent = "上一手復盤目前已收起。關閉再開啟「牌局復盤」即可重新顯示。";
      placeholder.hidden = false;
    } else {
      placeholder.hidden = true;
    }
  }

  function syncCoachPresentation() {
    if (!state?.coach) return false;
    ensureStyles();
    const input = ensureToggle();
    const card = ensureReviewCard();
    moveReviewPanel();

    const masterEnabled = state.coach.enabled !== false;
    const enabled = reviewEnabled();
    const hasAnyModule = Boolean(state.coach.odds || state.coach.advice || enabled);
    const content = document.querySelector("#coachContent");
    const panel = document.querySelector("#coachPanel");

    if (input && input.checked !== enabled) input.checked = enabled;
    if (card) card.hidden = !masterEnabled || !enabled;
    if (content) content.hidden = !masterEnabled || !hasAnyModule;
    panel?.classList.toggle("is-empty", masterEnabled && !hasAnyModule);
    syncPlaceholder();
    return true;
  }

  function scheduleSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      syncCoachPresentation();
    });
  }

  function setEnabled(enabled, { persist = true, revealLatest = false } = {}) {
    const next = Boolean(enabled);
    state.coach.review = next;
    if (persist) saveEnabled(next);

    if (!next) {
      window.HandReview?.hide?.();
    } else if (revealLatest && window.HandReview?.latest?.()) {
      window.HandReview.showLatest();
    }

    syncCoachPresentation();
    return next;
  }

  function wrapRenderCoach() {
    if (window.__coachHandReviewRenderWrapped) return;
    if (typeof window.renderCoach !== "function") return;
    window.__coachHandReviewRenderWrapped = true;
    originalRenderCoach = window.renderCoach;
    window.renderCoach = function renderCoachWithHandReview(...args) {
      const result = originalRenderCoach.apply(this, args);
      syncCoachPresentation();
      return result;
    };
  }

  function installObserver() {
    observer?.disconnect();
    const target = document.querySelector(".side-rail") || document.body;
    observer = new MutationObserver(scheduleSync);
    observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  function install() {
    if (installed) return true;
    if (
      typeof state === "undefined"
      || typeof els === "undefined"
      || !window.HandReview?.version
      || typeof window.renderCoach !== "function"
    ) {
      return false;
    }

    installed = true;
    state.coach.review = readEnabled();
    ensureStyles();
    ensureToggle();
    ensureReviewCard();
    moveReviewPanel();
    wrapRenderCoach();
    installObserver();
    syncCoachPresentation();
    return true;
  }

  window.CoachHandReviewIntegration = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    install,
    refresh: syncCoachPresentation,
    isEnabled: reviewEnabled,
    setEnabled,
  };

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 80) window.clearInterval(timer);
    }, 50);
  }
})();
