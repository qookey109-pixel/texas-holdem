// Reversible decision-area clarity trial: action color separation and coach margin context.
(() => {
  "use strict";

  if (window.DecisionUiTrial?.version) return;

  const SAFETY_MARGIN_PP = 5;
  let syncScheduled = false;

  function clampPercentage(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function normalizeAction(value) {
    const action = String(value || "").trim().toLowerCase();
    if (["fold", "棄牌"].includes(action)) return "fold";
    if (["call", "跟注"].includes(action)) return "call";
    if (["check", "過牌"].includes(action)) return "check";
    if (["raise", "加注"].includes(action)) return "raise";
    if (["all-in", "allin", "全下"].includes(action)) return "allin";
    return action;
  }

  function explainCoach({ winRate, potOdds, action } = {}) {
    const win = clampPercentage(winRate);
    const odds = clampPercentage(potOdds);
    const normalizedAction = normalizeAction(action);
    if (win === null || odds === null || !normalizedAction) return null;

    const edge = win - odds;
    const edgeLabel = `${edge >= 0 ? "+" : ""}${edge} PP`;

    if (normalizedAction === "fold") {
      if (edge < 0) {
        return {
          tone: "clear",
          title: `價格不足 ${edgeLabel}`,
          text: "估計勝率低於 Pot Odds，棄牌與目前數字一致。",
          edge,
        };
      }
      if (edge < SAFETY_MARGIN_PP) {
        return {
          tone: "caution",
          title: `安全邊際 ${edgeLabel}`,
          text: `勝率雖略高於 Pot Odds，但未達 ${SAFETY_MARGIN_PP} PP 保守緩衝；估算誤差可能吃掉優勢。`,
          edge,
        };
      }
      return {
        tone: "review",
        title: `數字優勢 ${edgeLabel}`,
        text: "目前數字偏向可繼續；若教練仍建議棄牌，代表另考慮籌碼壓力、多人池或後續街風險。",
        edge,
      };
    }

    if (["call", "check"].includes(normalizedAction)) {
      return {
        tone: edge >= 0 ? "clear" : "caution",
        title: `${edge >= 0 ? "價格優勢" : "價格缺口"} ${edgeLabel}`,
        text: edge >= 0
          ? "估計勝率高於 Pot Odds，繼續遊戲在目前價格下有數字支持。"
          : "估計勝率低於 Pot Odds，繼續遊戲需要額外的隱含賠率或策略理由。",
        edge,
      };
    }

    return {
      tone: "neutral",
      title: `勝率差 ${edgeLabel}`,
      text: "加注與 All-in 還需同時考慮棄牌率、下注尺寸與有效籌碼，不能只用 Pot Odds 判定。",
      edge,
    };
  }

  function installStyles() {
    if (document.querySelector("#decisionUiTrialStyles")) return;

    const style = document.createElement("style");
    style.id = "decisionUiTrialStyles";
    style.textContent = `
      #foldButton {
        border-color: rgba(177,116,116,.5) !important;
        background:
          linear-gradient(180deg, rgba(144,79,82,.88), rgba(82,49,54,.94)) !important;
        color: rgba(255,240,240,.92) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.12),
          0 8px 16px rgba(0,0,0,.18) !important;
      }
      #allInButton {
        border-color: rgba(200,145,255,.72) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(244,218,255,.23), transparent 56%),
          linear-gradient(180deg, #8d4bc0 0%, #673196 54%, #3d1d62 100%) !important;
        color: #fff7ff !important;
        box-shadow:
          0 0 0 1px rgba(211,158,255,.16),
          0 12px 25px rgba(63,29,98,.38),
          0 0 18px rgba(153,82,211,.15) !important;
      }
      #allInButton:hover:not(:disabled) {
        box-shadow:
          0 0 0 1px rgba(239,211,255,.34),
          0 17px 31px rgba(63,29,98,.46),
          0 0 28px rgba(178,101,232,.24) !important;
      }

      .controls .quick-bets {
        gap: 8px !important;
      }
      .controls .quick-bets button {
        min-height: 40px !important;
        padding-inline: 7px !important;
      }

      .coach-margin-note {
        display: grid;
        gap: 3px;
        margin-top: 8px;
        padding: 7px 8px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 7px;
        background: rgba(255,255,255,.04);
      }
      .coach-margin-note strong {
        color: var(--gold);
        font-size: .65rem;
      }
      .coach-margin-note span {
        color: rgba(236,244,240,.78);
        font-size: .61rem;
        line-height: 1.42;
      }
      .coach-margin-note[data-tone="caution"] {
        border-left: 3px solid rgba(233,188,101,.78);
      }
      .coach-margin-note[data-tone="review"] {
        border-left: 3px solid rgba(210,141,255,.78);
      }
      .coach-margin-note[data-tone="clear"] {
        border-left: 3px solid rgba(112,216,201,.78);
      }

      @media (max-width: 900px) {
        .controls .quick-bets {
          gap: 5px !important;
        }
        .controls .quick-bets button {
          min-height: 38px !important;
          padding-inline: 4px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function nearestPercentageContainer(element) {
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      if (/\d{1,3}\s*%/.test(current.textContent || "")) return current;
    }
    return null;
  }

  function percentageNearLabel(panel, labelPattern) {
    const elements = Array.from(panel.querySelectorAll("*"));
    const labelElement = elements.find(element => labelPattern.test(element.textContent?.trim() || ""));
    if (!labelElement) return null;

    const container = nearestPercentageContainer(labelElement);
    const match = container?.textContent?.match(/(\d{1,3})\s*%/);
    return match ? clampPercentage(match[1]) : null;
  }

  function findCoachAction(panel) {
    const actionPattern = /^(Fold|Call|Check|Raise|All-in|棄牌|跟注|過牌|加注|全下)$/i;
    return Array.from(panel.querySelectorAll("*")).find(element => actionPattern.test(element.textContent?.trim() || "")) || null;
  }

  function syncCoachMargin() {
    const panel = document.querySelector("#coachPanel");
    if (!panel) return false;

    const existing = panel.querySelector("#coachMarginNote");
    const actionElement = findCoachAction(panel);
    const action = actionElement?.textContent?.trim() || "";
    const winRate = percentageNearLabel(panel, /^勝率分析$|^勝率$/);
    const potOdds = percentageNearLabel(panel, /Pot Odds/i);
    const explanation = explainCoach({ winRate, potOdds, action });

    if (!explanation || !actionElement) {
      if (existing) existing.remove();
      return false;
    }

    let note = existing;
    if (!note) {
      note = document.createElement("div");
      note.id = "coachMarginNote";
      note.className = "coach-margin-note";
      note.setAttribute("aria-live", "polite");
    }

    const markup = `<strong>${explanation.title}</strong><span>${explanation.text}</span>`;
    if (note.dataset.tone !== explanation.tone) note.dataset.tone = explanation.tone;
    if (note.innerHTML !== markup) note.innerHTML = markup;

    const target = actionElement.closest(".coach-card") || actionElement.parentElement?.parentElement || actionElement.parentElement;
    if (target && note.parentElement !== target) target.appendChild(note);
    return true;
  }

  function sync() {
    installStyles();
    return { coachNoteVisible: syncCoachMargin() };
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    queueMicrotask(() => {
      syncScheduled = false;
      sync();
    });
  }

  installStyles();

  if (typeof window.render === "function") {
    const originalRender = window.render;
    window.render = function renderWithDecisionUiTrial(...args) {
      const result = originalRender.apply(this, args);
      scheduleSync();
      return result;
    };
  }

  if (typeof window.renderCoach === "function") {
    const originalRenderCoach = window.renderCoach;
    window.renderCoach = function renderCoachWithMarginContext(...args) {
      const result = originalRenderCoach.apply(this, args);
      scheduleSync();
      return result;
    };
  }

  const observer = new MutationObserver(scheduleSync);
  const coachPanel = document.querySelector("#coachPanel");
  if (coachPanel) observer.observe(coachPanel, { childList: true, subtree: true, characterData: true });

  sync();

  window.DecisionUiTrial = {
    version: "1.2.0",
    safetyMarginPP: SAFETY_MARGIN_PP,
    refresh: sync,
    explainCoach,
  };
})();