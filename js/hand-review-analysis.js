// Beginner-friendly decision analysis for the single-hand review panel.
(() => {
  "use strict";

  if (!window.HandReview || window.HandReviewAnalysis?.version) return;

  const QUALITY = Object.freeze({
    excellent: { label: "很好", min: 86 },
    good: { label: "良好", min: 76 },
    fair: { label: "合理", min: 66 },
    risky: { label: "風險偏高", min: 54 },
    weak: { label: "值得檢討", min: 0 },
  });
  const VISIBLE_HAND_STRENGTH = Object.freeze([
    0.24,
    0.38,
    0.5,
    0.58,
    0.66,
    0.75,
    0.84,
    0.91,
    0.97,
    0.99,
  ]);

  let actionContexts = [];
  let pendingActionContext = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function heroPlayer() {
    return typeof human === "function" ? human() : state.players?.[0] || null;
  }

  function currentBigBlindValue() {
    return Math.max(1, Number(typeof currentBigBlind === "function" ? currentBigBlind() : 20) || 20);
  }

  function knownStrength(player) {
    if (!player?.cards?.length) return 0.5;
    if (state.board?.length >= 3 && typeof evaluateBestHand === "function") {
      const result = evaluateBestHand([...player.cards, ...state.board]);
      const categoryStrength = VISIBLE_HAND_STRENGTH[result?.score];
      return clamp(Number(categoryStrength ?? 0.5), 0, 1);
    }
    if (typeof estimateStrength === "function") {
      return clamp(Number(estimateStrength(player)) || 0, 0, 1);
    }
    return 0.5;
  }

  function captureContext(action) {
    const hero = heroPlayer();
    if (!hero) return null;

    const potBefore = Math.max(0, Number(state.pot) || 0);
    const callAmount = Math.max(0, Number(typeof amountToCall === "function" ? amountToCall(hero) : 0) || 0);
    const stackBefore = Math.max(0, Number(hero.stack) || 0);
    const bigBlind = currentBigBlindValue();

    return {
      handNumber: Number(state.handNumber || 0),
      street: state.street || "翻牌前",
      action,
      potBefore,
      callAmount,
      stackBefore,
      heroBetBefore: Math.max(0, Number(hero.bet) || 0),
      currentBetBefore: Math.max(0, Number(state.currentBet) || 0),
      strength: knownStrength(hero),
      potOdds: callAmount / Math.max(1, potBefore + callAmount),
      callShare: callAmount / Math.max(1, stackBefore),
      stackInBigBlinds: stackBefore / bigBlind,
      boardCount: Array.isArray(state.board) ? state.board.length : 0,
    };
  }

  function qualityFor(score) {
    return Object.entries(QUALITY).find(([, meta]) => score >= meta.min)
      || ["weak", QUALITY.weak];
  }

  function analyzeDecision(context, recordedAction) {
    const action = recordedAction.action;
    const amount = Math.max(0, Number(recordedAction.amount) || 0);
    const strength = clamp(Number(context?.strength) || 0, 0, 1);
    const potOdds = clamp(Number(context?.potOdds) || 0, 0, 1);
    const callShare = clamp(Number(context?.callShare) || 0, 0, 1);
    const stackInBigBlinds = Math.max(0, Number(context?.stackInBigBlinds) || 0);
    const potBefore = Math.max(0, Number(context?.potBefore) || 0);
    const amountToPot = amount / Math.max(1, potBefore);
    let score = 72;
    let note = "這個選擇大致合理。";

    if (action === "check") {
      if ((context?.callAmount || 0) > 0) {
        score = 48;
        note = "面對下注時不能直接過牌，請確認操作流程。";
      } else if (strength >= 0.7 && potBefore >= currentBigBlindValue() * 3) {
        score = 72;
        note = "牌力不差，過牌能控制底池，也可考慮主動取價值。";
      } else {
        score = 84;
        note = "不用補注時控制底池，節奏穩健。";
      }
    }

    if (action === "fold") {
      if ((context?.callAmount || 0) === 0) {
        score = 52;
        note = "沒有下注壓力時棄牌偏保守。";
      } else if (callShare >= 0.28 || strength + 0.04 < potOdds) {
        score = 88;
        note = "面對高成本或價格不利，及時止損。";
      } else if (strength >= potOdds + 0.18) {
        score = 56;
        note = "已知牌力高於跟注價格，這次棄牌可能太緊。";
      } else {
        score = 74;
        note = "保守收手可以接受，但仍有繼續遊戲空間。";
      }
    }

    if (action === "call") {
      if ((context?.callAmount || 0) === 0) {
        score = 82;
        note = "不需要補注，實際上等同過牌。";
      } else if (strength >= potOdds + 0.12 && callShare <= 0.22) {
        score = 88;
        note = "牌力與價格配合良好，跟注成本合理。";
      } else if (callShare >= 0.35 && strength < potOdds + 0.08) {
        score = 52;
        note = "這次跟注佔籌碼太高，已知牌力不足以抵抗風險。";
      } else if (strength + 0.04 >= potOdds) {
        score = 74;
        note = "接近合理價格，但要注意後續街的壓力。";
      } else {
        score = 59;
        note = "已知牌力低於目前跟注價格，容易被持續施壓。";
      }
    }

    if (action === "raise") {
      if (strength >= 0.72) {
        score = 91;
        note = "強牌主動加注，能建立底池並取得價值。";
      } else if (strength >= 0.52 && amountToPot <= 1.1) {
        score = 82;
        note = "牌力與尺寸協調，主動施壓合理。";
      } else if (strength < 0.34 && amountToPot > 0.8) {
        score = 56;
        note = "牌力偏弱且尺寸偏大，這次施壓較依賴對手棄牌。";
      } else {
        score = 70;
        note = "有主動性，但尺寸與牌力仍需保持平衡。";
      }
    }

    if (action === "allin") {
      if (strength >= 0.78) {
        score = 92;
        note = "已知牌力很強，All-in 有明確價值。";
      } else if (stackInBigBlinds <= 10 && strength >= 0.5) {
        score = 86;
        note = "短碼局面下集中籌碼，策略上可以接受。";
      } else if (callShare >= 0.42 && strength + 0.04 >= potOdds) {
        score = 76;
        note = "面對高壓時一次投入，合理但波動很大。";
      } else if (strength < 0.42 && stackInBigBlinds > 12) {
        score = 46;
        note = "籌碼仍深且已知牌力不足，All-in 風險過高。";
      } else {
        score = 61;
        note = "可以理解，但仍缺乏足夠牌力或短碼理由。";
      }
    }

    score = Math.round(clamp(score, 40, 96));
    const [qualityKey, qualityMeta] = qualityFor(score);
    return { score, qualityKey, qualityLabel: qualityMeta.label, note };
  }

  function gradeFor(score) {
    if (score >= 90) return "A";
    if (score >= 84) return "B+";
    if (score >= 76) return "B";
    if (score >= 68) return "C+";
    if (score >= 58) return "C";
    return "D";
  }

  function overallSummary(analyses) {
    if (!analyses.length) return "本手沒有足夠的玩家操作可供分析。";
    const weakest = analyses.reduce((lowest, item) => item.score < lowest.score ? item : lowest, analyses[0]);
    const average = analyses.reduce((sum, item) => sum + item.score, 0) / analyses.length;
    if (average >= 84) return "整體節奏穩健，下注尺寸與已知牌力大致一致。";
    if (average >= 72) return `整體表現合理；最需要留意的是「${weakest.qualityLabel}」的那一步。`;
    return `本手波動偏高，優先檢討：${weakest.note}`;
  }

  function ensureStyles() {
    if (document.querySelector("#handReviewDecisionStyles")) return;
    const style = document.createElement("style");
    style.id = "handReviewDecisionStyles";
    style.textContent = `
      .hand-review-decision-summary {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 7px;
        align-items: start;
        padding: 7px 8px;
        border: 1px solid rgba(233,188,101,.18);
        border-radius: 7px;
        background: rgba(233,188,101,.06);
      }
      .hand-review-decision-summary strong {
        color: var(--gold);
        font-size: .68rem;
        white-space: nowrap;
      }
      .hand-review-decision-summary span {
        color: rgba(236,244,240,.82);
        font-size: .64rem;
        line-height: 1.45;
      }
      .hand-review-decisions li {
        border-left: 3px solid transparent;
      }
      .hand-review-decisions li[data-decision-quality="excellent"],
      .hand-review-decisions li[data-decision-quality="good"] {
        border-left-color: rgba(112,216,201,.78);
      }
      .hand-review-decisions li[data-decision-quality="fair"] {
        border-left-color: rgba(233,188,101,.72);
      }
      .hand-review-decisions li[data-decision-quality="risky"],
      .hand-review-decisions li[data-decision-quality="weak"] {
        border-left-color: rgba(255,112,86,.78);
      }
      .hand-review-decisions li em {
        max-width: 118px;
        text-align: right;
        white-space: normal;
        line-height: 1.25;
      }
      .hand-review-quality {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        margin-left: 4px;
        padding: 2px 5px;
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        color: var(--gold);
        font-size: .56rem;
        font-weight: 900;
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceLatestReview() {
    const review = window.HandReview?.latest?.();
    const panel = document.querySelector("#handReviewPanel");
    if (!review || !panel || panel.hidden) return;

    const analyses = review.actions.map((action, index) => {
      const context = actionContexts[index] || captureContext(action.action) || {};
      return analyzeDecision(context, action);
    });
    const average = analyses.length
      ? Math.round(analyses.reduce((sum, item) => sum + item.score, 0) / analyses.length)
      : 65;
    review.score = average;
    review.grade = gradeFor(average);
    review.decisionAnalyses = analyses;

    const resultGrade = panel.querySelector(".hand-review-result > em");
    if (resultGrade) resultGrade.textContent = review.grade;
    const summaryValues = panel.querySelectorAll(".hand-review-summary-grid strong");
    if (summaryValues[2]) summaryValues[2].textContent = String(review.score);
    if (summaryValues[3]) summaryValues[3].textContent = review.grade;

    const body = panel.querySelector(".hand-review-body");
    const decisions = panel.querySelector(".hand-review-decisions");
    if (body && decisions) {
      let summary = panel.querySelector(".hand-review-decision-summary");
      if (!summary) {
        summary = document.createElement("div");
        summary.className = "hand-review-decision-summary";
        decisions.before(summary);
      }
      summary.innerHTML = `<strong>教練總結</strong><span>${overallSummary(analyses)}</span>`;
    }

    panel.querySelectorAll(".hand-review-decisions li:not(.hand-review-empty)").forEach((row, index) => {
      const analysis = analyses[index];
      if (!analysis) return;
      row.dataset.decisionQuality = analysis.qualityKey;
      const note = row.querySelector("em");
      if (note) note.textContent = analysis.note;
      const actionLabel = row.querySelector("strong");
      if (actionLabel) {
        actionLabel.querySelector(".hand-review-quality")?.remove();
        const badge = document.createElement("span");
        badge.className = "hand-review-quality";
        badge.textContent = analysis.qualityLabel;
        actionLabel.appendChild(badge);
      }
    });

    const disclaimer = panel.querySelector(".hand-review-note");
    if (disclaimer) {
      disclaimer.textContent = "評價依當時可見牌力、底池價格、跟注成本與籌碼深度產生，屬入門決策提示，不是完整 GTO 判定；未攤牌時絕不公開對手底牌。";
    }
  }

  function resetContexts() {
    actionContexts = [];
    pendingActionContext = null;
  }

  function installWrappers() {
    const originalPlayerAction = window.playerAction;
    if (typeof originalPlayerAction === "function") {
      window.playerAction = function playerActionWithReviewAnalysis(action, ...args) {
        pendingActionContext = captureContext(action);
        try {
          return originalPlayerAction.call(this, action, ...args);
        } finally {
          pendingActionContext = null;
        }
      };
    }

    const originalRecordHeroAction = window.recordHeroAction;
    if (typeof originalRecordHeroAction === "function") {
      window.recordHeroAction = function recordHeroActionWithDecisionContext(action, amount = 0) {
        const context = pendingActionContext || captureContext(action);
        const result = originalRecordHeroAction.apply(this, arguments);
        if (context && context.handNumber === state.handNumber) {
          actionContexts.push({ ...context, action, amount: Math.max(0, Number(amount) || 0) });
        }
        return result;
      };
    }

    const originalStartHand = window.startHand;
    if (typeof originalStartHand === "function") {
      window.startHand = function startHandWithDecisionReset(...args) {
        resetContexts();
        return originalStartHand.apply(this, args);
      };
    }

    const originalBeginCurrentHand = window.HandReview.beginCurrentHand;
    if (typeof originalBeginCurrentHand === "function") {
      window.HandReview.beginCurrentHand = function beginCurrentHandWithDecisionReset(...args) {
        resetContexts();
        return originalBeginCurrentHand.apply(this, args);
      };
    }

    const originalAwardPot = window.awardPot;
    if (typeof originalAwardPot === "function") {
      window.awardPot = function awardPotWithDecisionAnalysis(...args) {
        const result = originalAwardPot.apply(this, args);
        enhanceLatestReview();
        return result;
      };
    }

    const originalFinishShowdown = window.finishShowdown;
    if (typeof originalFinishShowdown === "function") {
      window.finishShowdown = function finishShowdownWithDecisionAnalysis(...args) {
        const result = originalFinishShowdown.apply(this, args);
        enhanceLatestReview();
        return result;
      };
    }
  }

  ensureStyles();
  installWrappers();

  window.HandReviewAnalysis = {
    version: "2.0.0",
    refresh: enhanceLatestReview,
    reset: resetContexts,
    contexts: () => actionContexts.map(item => ({ ...item })),
  };
})();
