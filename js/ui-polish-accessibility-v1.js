// Low-risk presentation and accessibility polish for the existing poker UI.
(() => {
  "use strict";

  if (window.UiPolishAccessibilityV1?.version) return;

  const VERSION = "1.0.0";
  const BET_CONTROLS_VERSION = "4.0.0";
  const CLOSE_MS = 150;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const numberFormatter = new Intl.NumberFormat("zh-TW");
  const QUICK_BET_CONFIG = {
    third: { label: "33%", ratio: 1 / 3 },
    half: { label: "50%", ratio: 1 / 2 },
    threeQuarter: { label: "75%", ratio: 3 / 4 },
    pot: { label: "Pot", ratio: 1 },
  };
  let quickBetStateInstalled = false;
  let overlayCloseInstalled = false;
  let betRenderWrapped = false;
  let selectedQuickBetMode = null;

  function formatAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? numberFormatter.format(Math.max(0, Math.round(amount))) : "—";
  }

  function installStyles() {
    if (document.getElementById("uiPolishAccessibilityStylesV1")) return;

    const style = document.createElement("style");
    style.id = "uiPolishAccessibilityStylesV1";
    style.textContent = `
      .controls.bet-controls-v2 {
        transition: filter 180ms ease, opacity 180ms ease;
      }
      .controls.bet-controls-v2 > button {
        position: relative;
        overflow: hidden;
        letter-spacing: .01em;
      }
      .controls.bet-controls-v2 > button::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(180deg, rgba(255,255,255,.13), transparent 52%);
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease;
      }
      .table.is-human-turn .controls.bet-controls-v2 > button:not(:disabled)::after {
        opacity: 1;
      }
      .table.is-human-turn .controls.bet-controls-v2 #raiseButton:not(:disabled) {
        box-shadow:
          0 12px 26px rgba(219,161,56,.32),
          0 0 0 2px rgba(233,188,101,.13),
          0 0 24px rgba(233,188,101,.17),
          inset 0 1px 0 rgba(255,255,255,.38);
      }
      .table.is-human-turn .controls.bet-controls-v2 #callButton:not(:disabled) {
        box-shadow:
          0 12px 24px rgba(47,157,115,.28),
          0 0 18px rgba(105,215,165,.12),
          inset 0 1px 0 rgba(255,255,255,.42);
      }
      .controls.bet-controls-v2 #foldButton {
        border-color: rgba(255,142,136,.34);
      }
      .controls.bet-controls-v2 #allInButton {
        border-color: rgba(255,155,96,.72) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(255,218,166,.25), transparent 56%),
          linear-gradient(180deg, #db642d 0%, #b9341e 54%, #711b1b 100%) !important;
        box-shadow:
          0 0 0 1px rgba(255,125,68,.18),
          0 12px 25px rgba(139,34,25,.4),
          0 0 18px rgba(230,74,30,.13) !important;
      }
      .controls.bet-controls-v2 #allInButton:hover:not(:disabled) {
        box-shadow:
          0 0 0 1px rgba(255,209,174,.34),
          0 17px 31px rgba(139,34,25,.48),
          0 0 28px rgba(230,74,30,.22) !important;
      }
      .controls.bet-controls-v2 .raise-control {
        transition: border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
      }
      .table.is-human-turn .controls.bet-controls-v2 .raise-control {
        border-color: rgba(233,188,101,.24);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 0 16px rgba(233,188,101,.07);
      }
      .controls.bet-controls-v2 .range-shell {
        min-height: 30px;
        padding: 0 3px;
      }
      .controls.bet-controls-v2 input[type="range"] {
        height: 28px;
      }
      .controls.bet-controls-v2 .quick-bets button {
        display: grid;
        place-content: center;
        gap: 2px;
        line-height: 1.02;
      }
      .quick-bet-label {
        font-size: .69rem;
        font-weight: 950;
      }
      .quick-bet-amount {
        color: var(--gold);
        font-size: .6rem;
        font-weight: 950;
        font-variant-numeric: tabular-nums;
      }
      .quick-bets button.is-selected,
      .quick-bets button[aria-pressed="true"] {
        border-color: rgba(233,188,101,.88) !important;
        background:
          linear-gradient(180deg, rgba(233,188,101,.25), rgba(233,188,101,.09)),
          rgba(5,12,17,.52) !important;
        color: var(--ink) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.18),
          0 0 0 2px rgba(233,188,101,.15),
          0 0 18px rgba(233,188,101,.17) !important;
      }

      @media (min-width: 1181px), (min-width: 901px) and (min-height: 651px) {
        .controls.bet-controls-v2 {
          width: clamp(390px, 28.5vw, 460px);
          row-gap: 7px;
        }
        .controls.bet-controls-v2 > button {
          min-height: 42px;
          font-size: .84rem;
        }
        .controls.bet-controls-v2 .raise-control {
          grid-column: 1 / -1;
          grid-template-columns: auto minmax(0, 1fr) minmax(66px, auto);
          min-height: 42px;
          gap: 8px;
          padding: 5px 9px;
        }
        .controls.bet-controls-v2 .raise-caption {
          display: block;
          color: var(--muted);
          font-size: .65rem;
          font-weight: 900;
          white-space: nowrap;
        }
        .controls.bet-controls-v2 .raise-control strong {
          min-width: 66px;
          padding-inline: 8px;
          font-size: .76rem;
          font-variant-numeric: tabular-nums;
        }
        .controls.bet-controls-v2 .quick-bets {
          grid-column: 1 / -1;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .controls.bet-controls-v2 .quick-bets button {
          min-height: 36px;
        }
      }

      @media (orientation: landscape) and (max-width: 1180px) and (max-height: 650px) {
        .controls.bet-controls-v2 .quick-bets {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 3px;
        }
        .controls.bet-controls-v2 .quick-bets button {
          min-width: 0;
        }
        .quick-bet-label {
          font-size: .58rem;
        }
        .quick-bet-amount {
          display: none;
        }
        .controls.bet-controls-v2 input[type="range"] {
          height: 26px;
        }
      }

      .tutorial-overlay:not([hidden]):not(.ui-polish-closing),
      .session-summary-overlay:not([hidden]):not(.ui-polish-closing) {
        animation: uiPolishOverlayIn 170ms ease-out both;
      }
      .tutorial-overlay:not([hidden]):not(.ui-polish-closing) .tutorial-modal,
      .session-summary-overlay:not([hidden]):not(.ui-polish-closing) .session-summary-modal {
        animation: uiPolishModalIn 190ms cubic-bezier(.2,.78,.2,1) both;
      }
      .tutorial-overlay.ui-polish-closing,
      .session-summary-overlay.ui-polish-closing {
        animation: uiPolishOverlayOut ${CLOSE_MS}ms ease-in both;
        pointer-events: none;
      }
      .tutorial-overlay.ui-polish-closing .tutorial-modal,
      .session-summary-overlay.ui-polish-closing .session-summary-modal {
        animation: uiPolishModalOut ${CLOSE_MS}ms ease-in both;
      }

      .arena [data-layout-key] {
        transition:
          outline-color 160ms ease,
          box-shadow 160ms ease,
          filter 160ms ease,
          opacity 160ms ease;
      }
      .arena.layout-edit-mode [data-layout-key] {
        animation: uiPolishLayoutEditIn 170ms ease-out both;
      }

      @keyframes uiPolishOverlayIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes uiPolishOverlayOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes uiPolishModalIn {
        from { opacity: 0; transform: translateY(7px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes uiPolishModalOut {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(4px) scale(.992); }
      }
      @keyframes uiPolishLayoutEditIn {
        from { filter: brightness(.94); }
        to { filter: brightness(1); }
      }

      @media (prefers-reduced-motion: reduce) {
        .arena *,
        .arena *::before,
        .arena *::after,
        .tutorial-overlay,
        .tutorial-overlay *,
        .tutorial-overlay *::before,
        .tutorial-overlay *::after,
        .session-summary-overlay,
        .session-summary-overlay *,
        .session-summary-overlay *::before,
        .session-summary-overlay *::after,
        .layout-editor-panel,
        .layout-editor-panel *,
        .layout-editor-panel *::before,
        .layout-editor-panel *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .01ms !important;
          transition-delay: 0ms !important;
          scroll-behavior: auto !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function heroPlayer() {
    return typeof human === "function" ? human() : window.state?.players?.[0] || null;
  }

  function ensureQuickBetButtons() {
    const group = document.querySelector(".quick-bets");
    if (!group) return null;

    group.querySelector('button[data-bet="twoThirds"]')?.remove();
    if (!group.querySelector('button[data-bet="threeQuarter"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.bet = "threeQuarter";
      button.textContent = "75% Pot";
      group.insertBefore(button, group.querySelector('button[data-bet="pot"]') || null);
    }
    return group;
  }

  function effectiveTargetForRaiseBy(hero, raiseBy) {
    const selectedTarget = Math.max(0, Number(state.currentBet || 0) + raiseBy);
    const requestedContribution = Math.max(0, selectedTarget - Number(hero.bet || 0));
    const paidContribution = Math.min(Math.max(0, Number(hero.stack || 0)), requestedContribution);
    return Number(hero.bet || 0) + paidContribution;
  }

  function bettingSnapshot() {
    const hero = heroPlayer();
    if (!hero || typeof amountToCall !== "function" || typeof minimumRaiseBy !== "function") return null;

    const callAmount = Math.max(0, amountToCall(hero));
    const minimumBy = Math.max(0, minimumRaiseBy());
    const availableRaise = Math.max(0, Number(hero.stack || 0) - callAmount);
    const maximumBy = Math.max(minimumBy, Math.floor(availableRaise / 10) * 10);
    const canRaise = !hero.raiseLocked && availableRaise >= minimumBy;
    const rawSelectedBy = Number(document.querySelector("#raiseAmount")?.value || minimumBy);
    const selectedBy = canRaise
      ? Math.min(maximumBy, Math.max(minimumBy, rawSelectedBy))
      : minimumBy;
    const effectiveTarget = effectiveTargetForRaiseBy(hero, selectedBy);
    const canAct = Boolean(!state.handOver && state.waitingForHuman && state.currentActorIndex === 0 && !hero.folded && !hero.allIn);

    return { hero, callAmount, minimumBy, maximumBy, selectedBy, effectiveTarget, canAct, canRaise };
  }

  function quickBetDetails(mode, snapshot) {
    const config = QUICK_BET_CONFIG[mode];
    if (!config || !snapshot) return null;
    const potSized = Number(state.pot || 0) * config.ratio;
    const desiredBy = Math.max(snapshot.minimumBy, Math.round(potSized / 10) * 10);
    const raiseBy = Math.min(snapshot.maximumBy, desiredBy);
    return { mode, raiseBy, target: effectiveTargetForRaiseBy(snapshot.hero, raiseBy) };
  }

  function setQuickBetSelection(selectedButton = null) {
    document.querySelectorAll(".quick-bets button[data-bet]").forEach(button => {
      const selected = button === selectedButton;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function applyQuickBet(mode) {
    const snapshot = bettingSnapshot();
    const details = quickBetDetails(mode, snapshot);
    const slider = document.querySelector("#raiseAmount");
    if (!snapshot?.canRaise || !details || !slider) return;
    slider.value = String(details.raiseBy);
    if (typeof syncRaiseControl === "function") syncRaiseControl();
  }

  function updateBetControls() {
    const controls = document.querySelector(".controls");
    const group = ensureQuickBetButtons();
    const snapshot = bettingSnapshot();
    if (!controls || !group || !snapshot) return;

    controls.classList.add("bet-controls-v2");
    controls.toggleAttribute("data-can-act", snapshot.canAct);

    const callButton = document.querySelector("#callButton");
    const raiseButton = document.querySelector("#raiseButton");
    const allInButton = document.querySelector("#allInButton");
    const raiseCaption = document.querySelector(".raise-caption");
    const slider = document.querySelector("#raiseAmount");
    const raiseValue = document.querySelector("#raiseAmountValue");

    if (callButton) {
      callButton.textContent = snapshot.callAmount > 0 ? `跟注 ${formatAmount(snapshot.callAmount)}` : "過牌";
      callButton.setAttribute("aria-label", callButton.textContent);
    }
    if (raiseButton) {
      raiseButton.textContent = `加注至 ${formatAmount(snapshot.effectiveTarget)}`;
      raiseButton.setAttribute("aria-label", raiseButton.textContent);
    }
    if (allInButton) {
      allInButton.textContent = snapshot.hero.stack > 0 ? `All-in · ${formatAmount(snapshot.hero.stack)}` : "All-in";
      allInButton.setAttribute("aria-label", allInButton.textContent);
    }
    if (raiseCaption) raiseCaption.textContent = "加注至";
    if (slider) {
      slider.setAttribute("aria-label", `加注至 ${formatAmount(snapshot.effectiveTarget)}`);
      slider.setAttribute("aria-valuetext", formatAmount(snapshot.effectiveTarget));
      slider.title = `加注至 ${formatAmount(snapshot.effectiveTarget)}`;
    }
    if (raiseValue) raiseValue.textContent = snapshot.canRaise ? formatAmount(snapshot.effectiveTarget) : "—";

    const detailsByMode = {};
    group.querySelectorAll("button[data-bet]").forEach(button => {
      const mode = button.dataset.bet;
      const config = QUICK_BET_CONFIG[mode];
      const details = quickBetDetails(mode, snapshot);
      if (!config || !details) return;
      detailsByMode[mode] = details;
      button.dataset.target = String(details.target);
      button.setAttribute("aria-label", `${config.label} Pot，加注至 ${formatAmount(details.target)}`);
      button.innerHTML = `<span class="quick-bet-label">${config.label}</span><strong class="quick-bet-amount">至 ${formatAmount(details.target)}</strong>`;
    });

    const selectedDetails = selectedQuickBetMode ? detailsByMode[selectedQuickBetMode] : null;
    if (!snapshot.canAct || !selectedDetails || selectedDetails.raiseBy !== snapshot.selectedBy) {
      selectedQuickBetMode = null;
    }
    setQuickBetSelection(selectedQuickBetMode ? group.querySelector(`button[data-bet="${selectedQuickBetMode}"]`) : null);
  }

  function scheduleBetControlsUpdate() {
    queueMicrotask(updateBetControls);
  }

  function installQuickBetState() {
    if (quickBetStateInstalled) return;
    const group = ensureQuickBetButtons();
    const slider = document.querySelector("#raiseAmount");
    if (!group) return;

    quickBetStateInstalled = true;
    setQuickBetSelection();

    // Capture phase keeps the legacy quick-bet handler from applying a second
    // slider value. Selecting a quick size never executes a poker action.
    group.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("button[data-bet]") : null;
      if (!button || button.disabled || !QUICK_BET_CONFIG[button.dataset.bet]) return;
      event.stopPropagation();
      selectedQuickBetMode = button.dataset.bet;
      applyQuickBet(selectedQuickBetMode);
      scheduleBetControlsUpdate();
    }, true);

    slider?.addEventListener("input", () => {
      selectedQuickBetMode = null;
      setQuickBetSelection();
      scheduleBetControlsUpdate();
    });

    ["#foldButton", "#callButton", "#raiseButton", "#allInButton", "#newHandButton"].forEach(selector => {
      document.querySelector(selector)?.addEventListener("click", () => {
        selectedQuickBetMode = null;
        setQuickBetSelection();
        scheduleBetControlsUpdate();
      });
    });

    if (!betRenderWrapped && typeof window.render === "function") {
      betRenderWrapped = true;
      const originalRender = window.render;
      window.render = function renderWithBetControlsV2(...args) {
        const result = originalRender.apply(this, args);
        updateBetControls();
        return result;
      };
    }

    updateBetControls();
  }

  function installTutorialSemantics() {
    const button = document.querySelector("#tutorialButton");
    if (button && !button.hasAttribute("aria-pressed")) button.setAttribute("aria-pressed", "false");
  }

  function installLayoutLabels() {
    const autoButton = document.querySelector("#autoLayoutButton");
    if (!autoButton) return;
    autoButton.textContent = "📐 套用官方版面";
    autoButton.title = "套用目前官方預設位置；不會清除已儲存的自訂版面";
    autoButton.setAttribute("aria-label", "套用官方版面");
  }

  function animateClose(overlay, finish) {
    if (!overlay || overlay.hidden || reducedMotion.matches) {
      finish();
      return;
    }
    if (overlay.classList.contains("ui-polish-closing")) return;

    overlay.classList.add("ui-polish-closing");
    window.setTimeout(() => {
      try {
        finish();
      } finally {
        overlay.classList.remove("ui-polish-closing");
      }
    }, CLOSE_MS);
  }

  function consumeCloseEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function installOverlayClosePolish() {
    if (overlayCloseInstalled) return;
    if (typeof window.closeTutorial !== "function" || typeof window.closeSessionSummaryAndRestart !== "function") return;

    overlayCloseInstalled = true;
    const closeTutorialNow = window.closeTutorial;
    const closeSummaryNow = window.closeSessionSummaryAndRestart;

    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const tutorialOverlay = document.querySelector("#tutorialOverlay");
      if (tutorialOverlay && !tutorialOverlay.hidden) {
        const tutorialClose = target.closest("#tutorialCloseButton");
        if (tutorialClose || target === tutorialOverlay) {
          consumeCloseEvent(event);
          animateClose(tutorialOverlay, () => closeTutorialNow());
          return;
        }
      }

      const summaryOverlay = document.querySelector("#sessionSummaryOverlay");
      if (summaryOverlay && !summaryOverlay.hidden) {
        const summaryClose = target.closest("#sessionSummaryClose,[data-session-restart]");
        if (summaryClose || target === summaryOverlay) {
          consumeCloseEvent(event);
          animateClose(summaryOverlay, () => closeSummaryNow());
        }
      }
    }, true);

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      const tutorialOverlay = document.querySelector("#tutorialOverlay");
      if (tutorialOverlay && !tutorialOverlay.hidden) {
        consumeCloseEvent(event);
        animateClose(tutorialOverlay, () => closeTutorialNow());
        return;
      }

      const summaryOverlay = document.querySelector("#sessionSummaryOverlay");
      if (summaryOverlay && !summaryOverlay.hidden) {
        consumeCloseEvent(event);
        animateClose(summaryOverlay, () => closeSummaryNow());
      }
    }, true);
  }

  function install() {
    installStyles();
    installTutorialSemantics();
    installQuickBetState();
    installLayoutLabels();
    installOverlayClosePolish();
  }

  window.BetInfoUI = {
    version: BET_CONTROLS_VERSION,
    refresh: updateBetControls,
    snapshot: bettingSnapshot,
    quickTargets() {
      const snapshot = bettingSnapshot();
      if (!snapshot) return {};
      return Object.fromEntries(Object.keys(QUICK_BET_CONFIG).map(mode => [mode, quickBetDetails(mode, snapshot)]));
    },
  };

  window.UiPolishAccessibilityV1 = Object.freeze({
    version: VERSION,
    install,
    setQuickBetSelection,
    isReducedMotion: () => reducedMotion.matches,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
