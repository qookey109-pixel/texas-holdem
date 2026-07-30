// Beginner guide rendering
function tutorialCardClass(card) {
  return /[♥♦]/.test(card) ? " is-red" : "";
}

function tutorialMiniCards(cards) {
  return cards.map(card => `<span class="tutorial-mini-card${tutorialCardClass(card)}">${escapeHtml(card)}</span>`).join("");
}

function tutorialRankCards(cards) {
  return `<div class="tutorial-card-list">${cards.map(card => `<span class="tutorial-rank-card${tutorialCardClass(card)}">${escapeHtml(card)}</span>`).join("")}</div>`;
}

function tutorialTableDiagram(extra = "") {
  return `
    <div class="tutorial-poker-table">
      <div class="tutorial-seat top">AI</div>
      <div class="tutorial-seat left-top">AI</div>
      <div class="tutorial-seat left-bottom">AI</div>
      <div class="tutorial-seat is-player bottom">YOU</div>
      <div class="tutorial-seat right-bottom">AI</div>
      <div class="tutorial-seat right-top">AI</div>
      <div class="tutorial-pot">POT <span class="tutorial-chip is-gold"></span><span class="tutorial-chip"></span><span class="tutorial-chip is-blue"></span></div>
      <div class="tutorial-board">${tutorialMiniCards(["A♠", "K♥", "7♣", "4♦", "2♠"])}</div>
      <div class="tutorial-hole-cards">${tutorialMiniCards(["Q♠", "Q♥"])}</div>
      ${extra}
    </div>`;
}

function tutorialVisual(pageKey) {
  if (pageKey === "flow") {
    return `
      <div class="tutorial-visual-card">
        <div class="tutorial-visual-title">一手牌流程</div>
        <div class="tutorial-flow">
          <div class="tutorial-street"><b>翻牌前</b><div class="tutorial-mini-board">${tutorialMiniCards(["A♠", "K♥"])}</div><small>先看底牌</small></div>
          <div class="tutorial-street"><b>翻牌</b><div class="tutorial-mini-board">${tutorialMiniCards(["A♠", "K♥", "7♣"])}</div><small>發 3 張</small></div>
          <div class="tutorial-street"><b>轉牌</b><div class="tutorial-mini-board">${tutorialMiniCards(["4♦"])}</div><small>第 4 張</small></div>
          <div class="tutorial-street"><b>河牌</b><div class="tutorial-mini-board">${tutorialMiniCards(["2♠"])}</div><small>第 5 張</small></div>
          <div class="tutorial-street"><b>攤牌</b><div class="tutorial-mini-board">${tutorialMiniCards(["Q♠", "Q♥"])}</div><small>比大小</small></div>
        </div>
      </div>
      <div class="tutorial-callouts">
        <div class="tutorial-callout"><strong>每階段都能行動</strong><span>你可以過牌、跟注、加注或棄牌。</span></div>
        <div class="tutorial-callout"><strong>最後比 5 張</strong><span>從能使用的牌中選出最強 5 張。</span></div>
      </div>`;
  }

  if (pageKey === "positions") {
    return `
      <div class="tutorial-visual-card">
        <div class="tutorial-visual-title">6 人桌位置示意</div>
        ${tutorialTableDiagram('<div class="tutorial-dealer btn">BTN</div><div class="tutorial-dealer sb">SB</div><div class="tutorial-dealer bb">BB</div>')}
      </div>
      <div class="tutorial-callouts">
        <div class="tutorial-callout"><strong>BTN 最有資訊</strong><span>翻牌後通常較晚行動。</span></div>
        <div class="tutorial-callout"><strong>SB / BB 先付盲注</strong><span>莊家位置每局往下一位移動。</span></div>
      </div>`;
  }

  if (pageKey === "betting") {
    return `
      <div class="tutorial-visual-card">
        <div class="tutorial-visual-title">操作按鈕示意</div>
        <div class="tutorial-bet-actions">
          <div class="tutorial-bet"><b>過牌</b><span>不下注，換下一位</span></div>
          <div class="tutorial-bet"><b>跟注</b><span>補到目前注額</span></div>
          <div class="tutorial-bet is-raise"><b>加注</b><span>把目前注額提高</span></div>
          <div class="tutorial-bet is-fold"><b>棄牌</b><span>放棄這一手</span></div>
          <div class="tutorial-bet is-allin"><b>All-in</b><span>投入全部籌碼</span></div>
        </div>
      </div>
      <div class="tutorial-callouts">
        <div class="tutorial-callout"><strong>沒人下注</strong><span>可以過牌，或主動下注。</span></div>
        <div class="tutorial-callout"><strong>已經有人下注</strong><span>選擇跟注、加注或棄牌。</span></div>
      </div>`;
  }

  if (pageKey === "allin") {
    return `
      <div class="tutorial-visual-card">
        <div class="tutorial-visual-title">主池與邊池示意</div>
        <div class="tutorial-sidepot">
          <div class="tutorial-stack-list">
            ${[
              ["A", "18", "1,500"],
              ["B", "38", "4,500"],
              ["C", "78", "11,500"],
              ["D", "92", "13,500"],
            ].map(row => `<div class="tutorial-stack-row"><b>${row[0]}</b><div class="tutorial-bar"><i style="width:${row[1]}%"></i></div><span>${row[2]}</span></div>`).join("")}
          </div>
          <div class="tutorial-pots">
            <div class="tutorial-pot-card"><div><b>主池</b><span>A、B、C、D 都能贏</span></div><div class="tutorial-pot-chips"><span class="tutorial-chip is-gold"></span><span class="tutorial-chip is-gold"></span><span class="tutorial-chip is-gold"></span></div></div>
            <div class="tutorial-pot-card"><div><b>邊池 1</b><span>只有 B、C、D 能贏</span></div><div class="tutorial-pot-chips"><span class="tutorial-chip"></span><span class="tutorial-chip"></span></div></div>
            <div class="tutorial-pot-card"><div><b>邊池 2</b><span>只有 C、D 能贏</span></div><div class="tutorial-pot-chips"><span class="tutorial-chip is-blue"></span><span class="tutorial-chip is-blue"></span></div></div>
          </div>
        </div>
      </div>
      <div class="tutorial-callouts">
        <div class="tutorial-callout"><strong>短籌碼玩家</strong><span>只能贏自己有投入的池子。</span></div>
        <div class="tutorial-callout"><strong>多出的下注</strong><span>深籌碼多投的部分會進邊池。</span></div>
      </div>`;
  }

  if (pageKey === "hands") {
    return `
      <div class="tutorial-visual-card tutorial-hand-card">
        <div class="tutorial-visual-title">牌型由大到小</div>
        <div class="tutorial-hand-ladder">
          ${tutorialPages.hands.rows.map(row => `
            <div class="tutorial-hand-rank">
              <span>${escapeHtml(row[0])}</span>
              <div class="tutorial-hand-copy">
                <b>${escapeHtml(row[1])}</b>
                <small>${escapeHtml(row[2])}</small>
              </div>
              ${tutorialRankCards(row[3])}
            </div>`).join("")}
        </div>
      </div>
      <div class="tutorial-callouts">
        <div class="tutorial-callout"><strong>先看牌型等級</strong><span>數字越小，牌型越強。</span></div>
        <div class="tutorial-callout"><strong>同牌型再比點數</strong><span>還相同才比較踢腳牌。</span></div>
      </div>`;
  }

  const title = pageKey === "terms" ? "牌桌名詞位置" : "牌桌構成";
  return `
    <div class="tutorial-visual-card">
      <div class="tutorial-visual-title">${title}</div>
      ${tutorialTableDiagram()}
    </div>
    <div class="tutorial-callouts">
      <div class="tutorial-callout"><strong>底牌</strong><span>下方兩張，只給你自己看。</span></div>
      <div class="tutorial-callout"><strong>公共牌與底池</strong><span>中央的牌大家共用；籌碼由贏家拿走。</span></div>
    </div>`;
}

function renderTutorialItems(page) {
  if (page.type === "hands") {
    return "";
  }

  return `<div class="tutorial-grid two">${page.items.slice(0, 4).map((item, index) => `
    <article class="tutorial-info">
      <div class="tutorial-badge">${index + 1}</div>
      <div>
        <h4>${escapeHtml(item[0])}</h4>
        <p>${escapeHtml(item[1])}</p>
        <span class="tutorial-tag">${escapeHtml(item[2])}</span>
      </div>
    </article>`).join("")}</div>`;
}

function renderTutorialTable(rows, title) {
  return `
    <div class="tutorial-tip">
      <strong>${escapeHtml(title)}</strong>
      <table class="tutorial-table">
        <tbody>${rows.map(row => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderTutorialNav() {
  if (!els.tutorialNav) return;
  els.tutorialNav.innerHTML = tutorialOrder.map(key => {
    const page = tutorialPages[key];
    return `
      <button class="${key === state.tutorial.activePage ? "is-active" : ""}" type="button" data-tutorial-page="${key}">
        <span class="tutorial-nav-index">${page.index}</span>
        <span><strong>${escapeHtml(page.nav)}</strong><small>${escapeHtml(page.sub)}</small></span>
      </button>`;
  }).join("");
}

function renderTutorial(pageKey = state.tutorial.activePage) {
  if (!els.tutorialContent) return;
  const page = tutorialPages[pageKey] || tutorialPages.start;
  state.tutorial.activePage = pageKey;
  renderTutorialNav();

  const body = renderTutorialItems(page);

  els.tutorialContent.innerHTML = `
    <div class="tutorial-title-row">
      <div>
        <h3>${escapeHtml(page.title)}</h3>
        <p>${escapeHtml(page.desc)}</p>
      </div>
      <div class="tutorial-pill">${escapeHtml(page.badge)}</div>
    </div>
    <div class="tutorial-visual-panel">${tutorialVisual(pageKey)}</div>
    ${body}
  `;
}

function openTutorial(pageKey = state.tutorial.activePage) {
  if (!els.tutorialOverlay) return;
  renderTutorial(pageKey);
  els.tutorialOverlay.hidden = false;
  document.body.classList.add("tutorial-open");
  els.tutorialButton?.setAttribute("aria-pressed", "true");
}

function closeTutorial() {
  if (!els.tutorialOverlay) return;
  els.tutorialOverlay.hidden = true;
  document.body.classList.remove("tutorial-open");
  els.tutorialButton?.setAttribute("aria-pressed", "false");
}
