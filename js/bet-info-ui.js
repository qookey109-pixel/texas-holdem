// Bet Controls V2: clearer action hierarchy and quick-bet targets without changing betting legality.
(() => {
  "use strict";

  if (window.BetInfoUI?.version || typeof window.render !== "function") return;

  const QUICK_BET_CONFIG = {
    third: { label: "33%", ratio: 1 / 3 },
    half: { label: "50%", ratio: 1 / 2 },
    threeQuarter: { label: "75%", ratio: 3 / 4 },
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

  function ensureQuickBetButtons() {
    const quickBets = document.querySelector(".quick-bets");
    if (!quickBets) return null;

    quickBets.querySelector('button[data-bet="twoThirds"]')?.remove();

    if (!quickBets.querySelector('button[data-bet="threeQuarter"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.bet = "threeQuarter";
      button.textContent = "75% Pot";
      const potButton = quickBets.querySelector('button[data-bet="pot"]');
      quickBets.insertBefore(button, potButton || null);
    }

    return quickBets;
  }

  function installStyles() {
    if (document.querySelector("#betControlsV2Styles")) return;
    const style = document.createElement("style");
    style.id = "betControlsV2Styles";
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
      .table.is-human-turn .controls.bet-controls-v2 .raise-control:has(input:not(:disabled)) {
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
      .controls.bet-controls-v2 .quick-bets button.is-selected {
        border-color: rgba(233,188,101,.88) !important;
        background:
          linear-gradient(180deg, rgba(233,188,101,.25), rgba(233,188,101,.09)),
          rgba(5,12,17,.52) !important;
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
    const maximumBy = Math.max(minimumBy, Math.floor(availableRaise / 10) * 10);
    const canRaise = !hero.raiseLocked && availableRaise >= minimumBy;
    const rawSelectedBy = Number(document.querySelector("#raiseAmount")?.value || minimumBy);
    const selectedBy = canRaise
      ? Math.min(maximumBy, Math.max(minimumBy, rawSelectedBy))
      : minimumBy;
    const effectiveTarget = effectiveTargetForRaiseBy(hero, selectedBy);
    const canAct = Boolean(!state.handOver && state.waitingForHuman && state.currentActorIndex === 0 && !hero.folded && !hero.allIn);

    return {
      hero,
      callAmount,
      minimumBy,
      maximumBy,
      selectedBy,
      effectiveTarget,
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
    const controls = document.querySelector(".controls");
    ensureQuickBetButtons();
    const snapshot = bettingSnapshot();
    if (!snapshot) return;

    controls?.classList.add("bet-controls-v2");
    controls?.toggleAttribute("data-can-act", snapshot.canAct);

    const callButton = document.querySelector("#callButton");
    const raiseButton = document.querySelector("#raiseButton");
    const allInButton = document.querySelector("#allInButton");
    const raiseAmount = document.querySelector("#raiseAmount");
    const raiseCaption = document.querySelector(".raise-caption");

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
    if (raiseAmount) {
      raiseAmount.setAttribute("aria-label", `加注至 ${formatAmount(snapshot.effectiveTarget)}`);
      raiseAmount.setAttribute("aria-valuetext", formatAmount(snapshot.effectiveTarget));
      raiseAmount.title = `加注至 ${formatAmount(snapshot.effectiveTarget)}`;
    }

    const raiseValue = document.querySelector("#raiseAmountValue");
    if (raiseValue) raiseValue.textContent = snapshot.canRaise ? formatAmount(snapshot.effectiveTarget) : "—";
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
  const quickBets = ensureQuickBetButtons();
  document.querySelector(".controls")?.classList.add("bet-controls-v2");
  document.querySelector("#raiseAmount")?.addEventListener("input", () => {
    selectedQuickBetMode = null;
    scheduleUpdate();
  });
  quickBets?.addEventListener("click", event => {
    const button = event.target.closest("button[data-bet]");
    if (!button || !QUICK_BET_CONFIG[button.dataset.bet]) return;

    // Bet Controls V2 owns quick-bet slider selection. Prevent the legacy
    // quick-bet listener from applying a second value to the same click.
    event.stopImmediatePropagation();
    selectedQuickBetMode = button.dataset.bet;
    applyQuickBet(selectedQuickBetMode);
    scheduleUpdate();
  });
  document.querySelector(".controls")?.addEventListener("click", scheduleUpdate);
  updateBetInfo();

  window.BetInfoUI = {
    version: "4.0.0",
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