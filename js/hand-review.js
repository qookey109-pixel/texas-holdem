// Compact single-hand review shown above the hand history.
(() => {
  "use strict";

  if (window.HandReview?.version) return;

  const ACTION_LABELS = Object.freeze({
    fold: "棄牌",
    check: "過牌",
    call: "跟注",
    raise: "加注",
    allin: "All-in",
  });

  const ACTION_NOTES = Object.freeze({
    fold: "保守收手",
    check: "控制底池",
    call: "跟注觀察",
    raise: "主動施壓",
    allin: "高風險決策",
  });

  let currentHand = null;
  let latestReview = null;

  function heroPlayer() {
    return typeof human === "function" ? human() : state.players?.[0] || null;
  }

  function cloneCard(card) {
    if (!card) return null;
    return {
      label: card.label,
      value: card.value,
      suit: card.suit,
      suitSymbol: card.suitSymbol,
    };
  }

  function cardText(card) {
    return card ? `${card.label}${card.suitSymbol || ""}` : "--";
  }

  function beginCurrentHand({ startingStack } = {}) {
    const hero = heroPlayer();
    const fallbackStack = Number(hero?.stack || 0);
    currentHand = {
      handNumber: Number(state.handNumber || 0),
      startingStack: Number.isFinite(Number(startingStack)) ? Number(startingStack) : fallbackStack,
      heroCards: (hero?.cards || []).map(cloneCard),
      actions: [],
    };
    return currentHand;
  }

  function recordAction(action, amount = 0) {
    if (!currentHand || currentHand.handNumber !== state.handNumber) beginCurrentHand();
    currentHand.actions.push({
      street: state.street || "翻牌前",
      action,
      amount: Math.max(0, Number(amount) || 0),
      potBefore: Math.max(0, Number(state.pot) || 0),
    });
  }

  function reviewScore({ heroWon, net, actions, showdown }) {
    let score = 70;
    if (heroWon) score += 10;
    if (net > 0) score += 5;
    if (net < 0) score -= 5;
    if (showdown) score += 2;
    if (actions.some(action => action.action === "raise")) score += 4;
    if (actions.some(action => action.action === "allin")) score += heroWon ? 3 : -9;
    if (!actions.length) score -= 2;
    return Math.max(50, Math.min(96, score));
  }

  function gradeFor(score) {
    if (score >= 90) return "A";
    if (score >= 82) return "B+";
    if (score >= 72) return "B";
    if (score >= 64) return "C+";
    return "C";
  }

  function finalHandName(hero, board, heroWon, showdown) {
    if (hero?.folded) return "棄牌";
    if (board.length >= 3 && hero?.cards?.length === 2 && typeof evaluateBestHand === "function") {
      return evaluateBestHand([...hero.cards, ...board]).name;
    }
    if (heroWon && !showdown) return "未攤牌獲勝";
    return showdown ? "攤牌" : "未攤牌結束";
  }

  function buildReview({ showdown, winners = [], potSize = 0, heroAwarded = 0 }) {
    const hero = heroPlayer();
    if (!hero) return null;
    if (!currentHand || currentHand.handNumber !== state.handNumber) beginCurrentHand();

    const heroWon = winners.some(player => player?.isHuman || player?.name === hero.name);
    const board = (state.board || []).map(cloneCard);
    const endingStack = Number(hero.stack || 0);
    const net = endingStack - Number(currentHand.startingStack || 0);
    const actions = currentHand.actions.map(action => ({ ...action }));
    const score = reviewScore({ heroWon, net, actions, showdown });
    const opponents = showdown
      ? (state.players || [])
          .filter(player => !player.isHuman && !player.folded)
          .map(player => ({
            name: player.name,
            emoji: player.emoji,
            cards: (player.cards || []).map(cloneCard),
            hand: board.length >= 3 && typeof evaluateBestHand === "function"
              ? evaluateBestHand([...player.cards, ...state.board]).name
              : "攤牌",
          }))
      : [];

    return {
      handNumber: state.handNumber,
      showdown: Boolean(showdown),
      heroWon,
      heroCards: (hero.cards || currentHand.heroCards || []).map(cloneCard),
      board,
      finalHand: finalHandName(hero, board, heroWon, showdown),
      startingStack: currentHand.startingStack,
      endingStack,
      net,
      potSize: Math.max(0, Number(potSize) || 0),
      heroAwarded: Math.max(0, Number(heroAwarded) || 0),
      actions,
      opponents,
      score,
      grade: gradeFor(score),
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function actionLine(action) {
    const label = ACTION_LABELS[action.action] || action.action;
    const amount = action.amount > 0 ? ` ${action.amount}` : "";
    const note = ACTION_NOTES[action.action] || "記錄決策";
    return `
      <li>
        <span>${escapeHtml(action.street)}</span>
        <strong>${escapeHtml(label + amount)}</strong>
        <em>${escapeHtml(note)}</em>
      </li>`;
  }

  function opponentMarkup(review) {
    if (!review.showdown) {
      return '<p class="hand-review-privacy">未進入攤牌，對手底牌不公開。</p>';
    }
    if (!review.opponents.length) {
      return '<p class="hand-review-privacy">本手沒有其他有效攤牌玩家。</p>';
    }
    return review.opponents.map(opponent => `
      <div class="hand-review-opponent" data-review-opponent>
        <strong>${escapeHtml(`${opponent.emoji || ""} ${opponent.name}`.trim())}</strong>
        <span>${opponent.cards.map(cardText).map(escapeHtml).join(" ")}</span>
        <em>${escapeHtml(opponent.hand)}</em>
      </div>`).join("");
  }

  function ensurePanel() {
    let panel = document.querySelector("#handReviewPanel");
    if (panel) return panel;

    const history = document.querySelector("#historyPanel");
    const gameLog = document.querySelector("#gameLog");
    if (!history || !gameLog) return null;

    panel = document.createElement("section");
    panel.id = "handReviewPanel";
    panel.className = "hand-review-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "上一手牌局覆盤");
    history.insertBefore(panel, gameLog);

    panel.addEventListener("click", event => {
      if (event.target.closest("[data-hand-review-close]")) {
        panel.hidden = true;
        return;
      }
      if (event.target.closest("[data-hand-review-toggle]")) {
        panel.classList.toggle("is-collapsed");
        const collapsed = panel.classList.contains("is-collapsed");
        const button = panel.querySelector("[data-hand-review-toggle]");
        if (button) button.textContent = collapsed ? "展開" : "收合";
      }
    });

    return panel;
  }

  function installStyles() {
    if (document.querySelector("#handReviewStyles")) return;
    const style = document.createElement("style");
    style.id = "handReviewStyles";
    style.textContent = `
      .hand-review-panel {
        flex: 0 0 auto;
        max-height: min(320px, 42vh);
        margin: 0 0 8px;
        padding: 9px;
        overflow: auto;
        border: 1px solid rgba(112,216,201,.28);
        border-radius: 9px;
        background:
          linear-gradient(180deg, rgba(112,216,201,.095), rgba(255,255,255,.025)),
          rgba(5,12,17,.66);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      }
      .hand-review-panel[hidden] { display: none !important; }
      .hand-review-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .hand-review-title p,
      .hand-review-title h3 { margin: 0; }
      .hand-review-title p {
        color: var(--cyan);
        font-size: .58rem;
        font-weight: 900;
        text-transform: uppercase;
      }
      .hand-review-title h3 {
        margin-top: 2px;
        color: var(--gold);
        font-size: .9rem;
      }
      .hand-review-actions { display: flex; gap: 5px; }
      .hand-review-actions button {
        min-width: 0;
        min-height: 26px;
        padding: 3px 7px;
        border-radius: 7px;
        background: rgba(255,255,255,.07);
        color: var(--ink);
        box-shadow: none;
        font-size: .62rem;
      }
      .hand-review-body { display: grid; gap: 8px; margin-top: 8px; }
      .hand-review-panel.is-collapsed .hand-review-body { display: none; }
      .hand-review-result {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 7px;
        padding: 7px 8px;
        border-radius: 7px;
        background: rgba(255,255,255,.055);
      }
      .hand-review-result > strong { color: var(--gold); font-size: 1rem; }
      .hand-review-result > span { color: var(--ink); font-size: .72rem; font-weight: 850; }
      .hand-review-result > em { color: var(--cyan); font-size: .68rem; font-style: normal; font-weight: 900; }
      .hand-review-cards,
      .hand-review-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }
      .hand-review-cards div,
      .hand-review-summary-grid div {
        padding: 6px 7px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 7px;
        background: rgba(255,255,255,.035);
      }
      .hand-review-cards span,
      .hand-review-summary-grid span {
        display: block;
        color: var(--muted);
        font-size: .58rem;
        font-weight: 800;
      }
      .hand-review-cards strong,
      .hand-review-summary-grid strong {
        display: block;
        margin-top: 3px;
        color: var(--ink);
        font-size: .72rem;
      }
      .hand-review-decisions h4,
      .hand-review-opponents h4 { margin: 0 0 5px; color: var(--gold); font-size: .7rem; }
      .hand-review-decisions ol { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      .hand-review-decisions li {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        align-items: center;
        gap: 5px;
        padding: 5px 6px;
        border-radius: 6px;
        background: rgba(255,255,255,.035);
        font-size: .62rem;
      }
      .hand-review-decisions li span { color: var(--muted); }
      .hand-review-decisions li strong { color: var(--ink); }
      .hand-review-decisions li em { color: var(--cyan); font-style: normal; }
      .hand-review-empty,
      .hand-review-privacy { margin: 0; color: var(--muted); font-size: .64rem; line-height: 1.4; }
      .hand-review-opponent {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 6px;
        padding: 5px 6px;
        border-radius: 6px;
        background: rgba(255,255,255,.035);
        font-size: .62rem;
      }
      .hand-review-opponent + .hand-review-opponent { margin-top: 4px; }
      .hand-review-opponent strong { color: var(--ink); }
      .hand-review-opponent span { color: var(--gold); font-weight: 900; }
      .hand-review-opponent em { color: var(--cyan); font-style: normal; }
      .hand-review-note { margin: 0; color: rgba(172,192,186,.72); font-size: .56rem; line-height: 1.35; }
      html body .side-rail.is-layout-editor-active #handReviewPanel { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function renderReview(review) {
    const panel = ensurePanel();
    if (!panel || !review) return;

    const netLabel = review.net > 0 ? `+${review.net}` : String(review.net);
    const resultLabel = review.heroWon ? `贏得 ${review.heroAwarded}` : (review.net < 0 ? `損失 ${Math.abs(review.net)}` : "籌碼持平");
    const actions = review.actions.length
      ? review.actions.map(actionLine).join("")
      : '<li class="hand-review-empty">本手沒有記錄到玩家操作。</li>';

    panel.classList.remove("is-collapsed");
    panel.innerHTML = `
      <div class="hand-review-head">
        <div class="hand-review-title">
          <p>Last Hand Review</p>
          <h3>第 ${review.handNumber} 局 · 本手覆盤</h3>
        </div>
        <div class="hand-review-actions">
          <button type="button" data-hand-review-toggle>收合</button>
          <button type="button" data-hand-review-close aria-label="關閉本手覆盤">×</button>
        </div>
      </div>
      <div class="hand-review-body">
        <div class="hand-review-result">
          <strong>${escapeHtml(netLabel)}</strong>
          <span>${escapeHtml(resultLabel)} · ${review.showdown ? "攤牌" : "未攤牌"}</span>
          <em>${escapeHtml(review.grade)}</em>
        </div>
        <div class="hand-review-cards">
          <div><span>你的底牌</span><strong>${review.heroCards.map(cardText).map(escapeHtml).join(" ")}</strong></div>
          <div><span>最終牌型</span><strong>${escapeHtml(review.finalHand)}</strong></div>
          <div><span>公共牌</span><strong>${review.board.length ? review.board.map(cardText).map(escapeHtml).join(" ") : "尚無公共牌"}</strong></div>
          <div><span>本手底池</span><strong>${review.potSize}</strong></div>
        </div>
        <section class="hand-review-decisions">
          <h4>你的關鍵動作</h4>
          <ol>${actions}</ol>
        </section>
        <section class="hand-review-opponents" id="handReviewOpponents">
          <h4>對手資訊</h4>
          ${opponentMarkup(review)}
        </section>
        <div class="hand-review-summary-grid">
          <div><span>起始籌碼</span><strong>${review.startingStack}</strong></div>
          <div><span>結束籌碼</span><strong>${review.endingStack}</strong></div>
          <div><span>節奏分數</span><strong>${review.score}</strong></div>
          <div><span>本手評級</span><strong>${escapeHtml(review.grade)}</strong></div>
        </div>
        <p class="hand-review-note">評級依本手結果與行動節奏產生，屬入門提示，不是完整 GTO 判定。未攤牌時絕不公開對手底牌。</p>
      </div>`;
    panel.hidden = false;
  }

  function publishReview(context) {
    latestReview = buildReview(context);
    renderReview(latestReview);
    return latestReview;
  }

  function hideReview() {
    const panel = document.querySelector("#handReviewPanel");
    if (panel) panel.hidden = true;
  }

  function clearReview() {
    currentHand = null;
    latestReview = null;
    hideReview();
  }

  function installWrappers() {
    const originalStartHand = window.startHand;
    if (typeof originalStartHand === "function") {
      window.startHand = function startHandWithReview(...args) {
        const previousHero = heroPlayer();
        const fallbackBuyIn = typeof currentBuyIn === "function" ? currentBuyIn() : (window.STARTING_STACK || 0);
        const startingStack = previousHero?.stack > 0 ? previousHero.stack : fallbackBuyIn;
        const result = originalStartHand.apply(this, args);
        beginCurrentHand({ startingStack });
        return result;
      };
    }

    const originalRecordHeroAction = window.recordHeroAction;
    if (typeof originalRecordHeroAction === "function") {
      window.recordHeroAction = function recordHeroActionWithReview(action, amount = 0) {
        const result = originalRecordHeroAction.apply(this, arguments);
        recordAction(action, amount);
        return result;
      };
    }

    const originalAwardPot = window.awardPot;
    if (typeof originalAwardPot === "function") {
      window.awardPot = function awardPotWithReview(winners, message) {
        const potSize = Number(state.pot || 0);
        const result = originalAwardPot.apply(this, arguments);
        const heroAwarded = winners?.some(player => player?.isHuman) ? potSize : 0;
        publishReview({ showdown: false, winners, potSize, heroAwarded });
        return result;
      };
    }

    const originalFinishShowdown = window.finishShowdown;
    if (typeof originalFinishShowdown === "function") {
      window.finishShowdown = function finishShowdownWithReview(winners, won, messages, options = {}) {
        const result = originalFinishShowdown.apply(this, arguments);
        publishReview({
          showdown: true,
          winners,
          potSize: options.potSize ?? won,
          heroAwarded: options.heroAwarded ?? 0,
        });
        return result;
      };
    }

    const originalResetGameSession = window.resetGameSession;
    if (typeof originalResetGameSession === "function") {
      window.resetGameSession = function resetGameSessionWithReview(...args) {
        const result = originalResetGameSession.apply(this, args);
        clearReview();
        return result;
      };
    }
  }

  installStyles();
  ensurePanel();
  installWrappers();

  window.HandReview = {
    version: "1.0.0",
    beginCurrentHand,
    recordAction,
    publishReview,
    latest: () => latestReview,
    showLatest: () => renderReview(latestReview),
    hide: hideReview,
    clear: clearReview,
  };
})();
