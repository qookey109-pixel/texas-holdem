// Clear betting guidance and quick-bet targets for the human action controls.
(() => {
  "use strict";

  if (window.BetInfoUI?.version || typeof window.render !== "function") return;

  const QUICK_BET_CONFIG = {
    third: { label: "1/3", ratio: 1 / 3 },
    half: { label: "1/2", ratio: 1 / 2 },
    twoThirds: { label: "2/3", ratio: 2 / 3 },
    pot: { label: "Pot", ratio: 1 },
  };
  const numberFormatter = new Intl.NumberFormat("zh-TW");
  let selectedQuickBetMode = null;

  function formatAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? numberFormatter.format(Math.max(0, Math.round(amount))) : "—";
  }

  function heroPlayer() {
    return typeof human === "function" ? human() : state.players?.[0] || null;
  }

  function removeLegacySummary() {
    document.querySelector("#betInfoSummary")?.remove();
  }

  function ensureQuickBetButtons() {
    const quickBets = document.querySelector(".quick-bets");
    if (!quickBets) return null;

    if (!quickBets.querySelector('button[data-bet="twoThirds"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.bet = "twoThirds";
      button.textContent = "2/3 Pot";
      const potButton = quickBets.querySelector('button[data-bet="pot"]');
      quickBets.insertBefore(button, potButton || null);
    }

    return quickBets;
  }

  function installStyles() {
    if (document.querySelector("#betInfoStyles")) return;
    const style = document.createElement("style");
    style.id = "betInfoStyles";
    style.textContent = `
      .quick-bets button {
        display: grid;
        place-content: center;
        gap: 2px;
        line-height: 1.02;
      }
      .quick-bet-label {
        font-size: .69rem;
        font-weight: 920;
      }
      .quick-bet-amount {
        color: var(--gold);
        font-size: .6rem;
        font-weight: 950;
        font-variant-numeric: tabular-nums;
      }
      .quick-bets button.is-selected {
        border-color: rgba(233,188,101,.88) !important;
        background:
          linear-gradient(180deg, rgba(233,188,101,.25), rgba(233,188,101,.09)),
          rgba(5,12,17,.52) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.18),
          0 0 0 2px rgba(233,188,101,.15),
          0 0 18px rgba(233,188,101,.17) !important;
      }
      #allInButton {
        border-color: rgba(255,155,96,.72) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(255,218,166,.25), transparent 56%),
          linear-gradient(180deg, #db642d 0%, #b9341e 54%, #711b1b 100%) !important;
        box-shadow:
          0 0 0 1px rgba(255,125,68,.18),
          0 12px 25px rgba(139,34,25,.4),
          0 0 18px rgba(230,74,30,.13) !important;
      }
      #allInButton:hover:not(:disabled) {
        box-shadow:
          0 0 0 1px rgba(255,209,174,.34),
          0 17px 31px rgba(139,34,25,.48),
          0 0 28px rgba(230,74,30,.22) !important;
      }
      @media (min-width: 901px) {
        .controls {
          width: clamp(380px, 27.5vw, 440px);
          row-gap: 7px;
        }
        .controls > button {
          min-height: 42px;
          font-size: .86rem;
        }
        .controls .raise-control {
          grid-column: 1 / -1;
          grid-template-columns: auto minmax(0, 1fr) minmax(62px, auto);
          min-height: 38px;
          gap: 8px;
          padding: 5px 8px;
        }
        .controls .raise-caption {
          display: block;
          color: var(--muted);
          font-size: .65rem;
          font-weight: 900;
          white-space: nowrap;
        }
        .controls .raise-control strong {
          min-width: 62px;
          padding-inline: 8px;
          font-size: .76rem;
          font-variant-numeric: tabular-nums;
        }
        .controls .quick-bets {
          grid-column: 1 / -1;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .controls .quick-bets button {
          min-height: 34px;
        }
      }
      @media (max-width: 900px) {
        .controls .quick-bets {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 3px;
        }
        .quick-bet-label {
          font-size: .58rem;
        }
        .quick-bet-amount {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function effectiveTargetForRaiseBy(hero, raiseBy) {
    const selectedTarget = Math.max(0, Number(state.currentBet || 0) + raiseBy);
    const requestedContribution = Math.max(0, selectedTarget - Number(hero.bet || 0));
    const paidContribution = Math.min(Math.max(0, Number(hero.stack || 0)), requestedContribution);
    return Number(hero.bet || 0) + paidContribution;
  }

  function bettingSnapshot() {
    const hero = heroPlayer();
    if (!hero) return null;

    const callAmount = typeof amountToCall === "function" ? Math.max(0, amountToCall(hero)) : 0;
    const minimumBy = typeof minimumRaiseBy === "function" ? Math.max(0, minimumRaiseBy()) : 0;
    const availableRaise = Math.max(0, Number(hero.stack || 0) - callAmount);
    const maxRaiseBy = Math.max(minimumBy, Math.floor(availableRaise / 10) * 10);
    const canRaise = !hero.raiseLocked && availableRaise >= minimumBy;
    const rawSelectedBy = Number(document.querySelector("#raiseAmount")?.value || minimumBy);
    const selectedBy = canRaise
      ? Math.min(maxRaiseBy, Math.max(minimumBy, rawSelectedBy))
      : minimumBy;
    const minimumTo = Math.max(0, Number(state.currentBet || 0) + minimumBy);
    const effectiveTarget = effectiveTargetForRaiseBy(hero, selectedBy);
    const requestedContribution = Math.max(0, effectiveTarget - Number(hero.bet || 0));
    const remaining = Math.max(0, Number(hero.stack || 0) - requestedContribution);
    const potAfter = Math.max(0, Number(state.pot || 0) + requestedContribution);
    const canAct = Boolean(!state.handOver && state.waitingForHuman && state.currentActorIndex === 0 && !hero.folded && !hero.allIn);

    return {
      hero,
      callAmount,
      minimumBy,
      maximumBy: maxRaiseBy,
      selectedBy,
      minimumTo,
      effectiveTarget,
      remaining,
      potAfter,
      canAct,
      canRaise,
    };
  }

  function quickBetDetails(mode, snapshot) {
    const config = QUICK_BET_CONFIG[mode];
    if (!config) return null;

    const potSized = Number(state.pot || 0) * config.ratio;
    const desiredBy = Math.max(snapshot.minimumBy, Math.round(potSized / 10) * 10);
    const raiseBy = Math.min(snapshot.maximumBy, desiredBy);
    return {
      mode,
      raiseBy,
      target: effectiveTargetForRaiseBy(snapshot.hero, raiseBy),
    };
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  }

  function applyQuickBet(mode) {
    const snapshot = bettingSnapshot();
    const details = snapshot ? quickBetDetails(mode, snapshot) : null;
    const raiseAmount = document.querySelector("#raiseAmount");
    if (!snapshot?.canRaise || !details || !raiseAmount) return;

    raiseAmount.value = String(details.raiseBy);
    if (typeof syncRaiseControl === "function") syncRaiseControl();
  }

  function updateQuickBetButtons(snapshot) {
    ensureQuickBetButtons();
    const detailsByMode = {};
    document.querySelectorAll(".quick-bets button[data-bet]").forEach(button => {
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

    document.querySelectorAll(".quick-bets button[data-bet]").forEach(button => {
      const selected = button.dataset.bet === selectedQuickBetMode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    return detailsByMode;
  }

  function updateBetInfo() {
    removeLegacySummary();
    ensureQuickBetButtons();
    const snapshot = bettingSnapshot();
    if (!snapshot) return;

    const callButton = document.querySelector("#callButton");
    const raiseButton = document.querySelector("#raiseButton");
    const allInButton = document.querySelector("#allInButton");
    const raiseAmount = document.querySelector("#raiseAmount");
    const raiseCaption = document.querySelector(".raise-caption");

    if (callButton) callButton.textContent = snapshot.callAmount > 0 ? `跟注 ${formatAmount(snapshot.callAmount)}` : "過牌";
    if (raiseButton) raiseButton.textContent = `加注至 ${formatAmount(snapshot.effectiveTarget)}`;
    if (allInButton) allInButton.textContent = snapshot.hero.stack > 0 ? `All-in ${formatAmount(snapshot.hero.stack)}` : "All-in";
    if (raiseCaption) raiseCaption.textContent = "加注至";
    if (raiseAmount) {
      raiseAmount.setAttribute("aria-label", `加注至 ${formatAmount(snapshot.effectiveTarget)}`);
      raiseAmount.setAttribute("aria-valuetext", formatAmount(snapshot.effectiveTarget));
      raiseAmount.title = `加注至 ${formatAmount(snapshot.effectiveTarget)}`;
    }

    setText("#raiseAmountValue", snapshot.canRaise ? formatAmount(snapshot.effectiveTarget) : "—");
    updateQuickBetButtons(snapshot);
  }

  function scheduleUpdate() {
    queueMicrotask(updateBetInfo);
  }

  const originalRender = window.render;
  window.render = function renderWithBetInfo(...args) {
    const result = originalRender.apply(this, args);
    updateBetInfo();
    return result;
  };

  installStyles();
  removeLegacySummary();
  const quickBets = ensureQuickBetButtons();
  document.querySelector("#raiseAmount")?.addEventListener("input", () => {
    selectedQuickBetMode = null;
    scheduleUpdate();
  });
  quickBets?.addEventListener("click", event => {
    const button = event.target.closest("button[data-bet]");
    if (!button || !QUICK_BET_CONFIG[button.dataset.bet]) return;
    selectedQuickBetMode = button.dataset.bet;
    applyQuickBet(selectedQuickBetMode);
    scheduleUpdate();
  });
  document.querySelector(".controls")?.addEventListener("click", scheduleUpdate);
  updateBetInfo();

  window.BetInfoUI = {
    version: "3.1.0",
    refresh: updateBetInfo,
    snapshot: bettingSnapshot,
    quickTargets() {
      const snapshot = bettingSnapshot();
      if (!snapshot) return {};
      return Object.fromEntries(
        Object.keys(QUICK_BET_CONFIG).map(mode => [mode, quickBetDetails(mode, snapshot)]),
      );
    },
  };
})();