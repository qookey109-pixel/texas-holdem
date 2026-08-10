(() => {
  "use strict";

  if (window.LongSessionTransitionUiPrototypeV1?.version === "0.1.0") return;

  const ROOT_ID = "long-session-transition-ui-v1-root";
  const STYLE_ID = "long-session-transition-ui-v1-style";
  const actionLog = [];

  const formatChips = value => Math.round(Number(value) || 0).toLocaleString("en-US");

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        background: rgba(1, 5, 9, 0.78);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ROOT_ID}[hidden] { display: none !important; }
      #${ROOT_ID} .ls-card {
        width: min(520px, 100%);
        max-height: min(720px, calc(100dvh - 32px));
        overflow: auto;
        box-sizing: border-box;
        border: 1px solid rgba(245, 196, 85, 0.52);
        border-radius: 22px;
        padding: 22px;
        color: #f5f1e8;
        background:
          radial-gradient(circle at 85% 10%, rgba(229, 177, 57, 0.16), transparent 30%),
          linear-gradient(160deg, rgba(18, 32, 38, 0.98), rgba(7, 15, 20, 0.99));
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.58);
      }
      #${ROOT_ID} .ls-eyebrow {
        margin: 0 0 7px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.16em;
        color: #e5b139;
        text-transform: uppercase;
      }
      #${ROOT_ID} .ls-title {
        margin: 0;
        font-size: clamp(24px, 5vw, 32px);
        line-height: 1.12;
        color: #fff9e9;
      }
      #${ROOT_ID} .ls-subtitle {
        margin: 10px 0 0;
        color: #b9c8ca;
        line-height: 1.55;
        font-size: 14px;
      }
      #${ROOT_ID} .ls-route {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 10px;
        align-items: center;
        margin: 20px 0 16px;
      }
      #${ROOT_ID} .ls-stake {
        border: 1px solid rgba(255,255,255,.11);
        border-radius: 15px;
        padding: 13px;
        background: rgba(255,255,255,.045);
      }
      #${ROOT_ID} .ls-stake small {
        display: block;
        margin-bottom: 4px;
        color: #91a3a6;
        font-size: 11px;
        font-weight: 700;
      }
      #${ROOT_ID} .ls-stake strong {
        display: block;
        font-size: 21px;
        color: #fff;
      }
      #${ROOT_ID} .ls-arrow {
        color: #e5b139;
        font-size: 20px;
        font-weight: 900;
      }
      #${ROOT_ID} .ls-ledger {
        display: grid;
        gap: 9px;
        padding: 14px;
        border-radius: 16px;
        background: rgba(0,0,0,.23);
        border: 1px solid rgba(255,255,255,.08);
      }
      #${ROOT_ID} .ls-row {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: baseline;
        font-size: 14px;
      }
      #${ROOT_ID} .ls-row span { color: #a9b9bb; }
      #${ROOT_ID} .ls-row strong { color: #fff; text-align: right; }
      #${ROOT_ID} .ls-row.ls-total {
        margin-top: 3px;
        padding-top: 11px;
        border-top: 1px solid rgba(255,255,255,.1);
      }
      #${ROOT_ID} .ls-row.ls-total strong { color: #f3c65f; font-size: 18px; }
      #${ROOT_ID} .ls-note {
        margin: 14px 0 0;
        padding: 12px 13px;
        border-radius: 13px;
        background: rgba(78, 165, 135, .10);
        border: 1px solid rgba(92, 190, 155, .22);
        color: #c5ded6;
        line-height: 1.5;
        font-size: 13px;
      }
      #${ROOT_ID} .ls-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 18px;
      }
      #${ROOT_ID} button {
        min-height: 48px;
        border-radius: 13px;
        border: 1px solid transparent;
        padding: 11px 14px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      #${ROOT_ID} .ls-primary {
        background: linear-gradient(180deg, #f3ca65, #d7a83a);
        color: #101419;
        box-shadow: 0 7px 22px rgba(215,168,58,.2);
      }
      #${ROOT_ID} .ls-secondary {
        background: rgba(255,255,255,.06);
        border-color: rgba(255,255,255,.14);
        color: #e8eeee;
      }
      #${ROOT_ID} button:focus-visible {
        outline: 3px solid #75c9ff;
        outline-offset: 3px;
      }
      #${ROOT_ID} .ls-footnote {
        margin: 11px 0 0;
        text-align: center;
        color: #77898c;
        font-size: 11px;
      }
      @media (max-width: 520px) {
        #${ROOT_ID} { padding: 10px; align-items: end; }
        #${ROOT_ID} .ls-card {
          width: 100%;
          max-height: calc(100dvh - 10px);
          border-radius: 20px 20px 12px 12px;
          padding: 18px;
        }
        #${ROOT_ID} .ls-route { gap: 7px; }
        #${ROOT_ID} .ls-stake { padding: 11px; }
        #${ROOT_ID} .ls-stake strong { font-size: 18px; }
        #${ROOT_ID} .ls-actions { grid-template-columns: 1fr; }
        #${ROOT_ID} .ls-primary { order: -1; }
      }
      @media (orientation: landscape) and (max-height: 460px) {
        #${ROOT_ID} {
          padding: 8px;
          align-items: center;
        }
        #${ROOT_ID} .ls-card {
          width: min(760px, 100%);
          max-height: calc(100dvh - 16px);
          overflow: hidden;
          border-radius: 16px;
          padding: 10px 14px;
        }
        #${ROOT_ID} .ls-eyebrow {
          margin-bottom: 2px;
          font-size: 9px;
          letter-spacing: .13em;
        }
        #${ROOT_ID} .ls-title {
          font-size: 20px;
          line-height: 1.08;
        }
        #${ROOT_ID} .ls-subtitle {
          margin-top: 3px;
          font-size: 11px;
          line-height: 1.3;
        }
        #${ROOT_ID} .ls-route {
          margin: 7px 0;
          gap: 7px;
        }
        #${ROOT_ID} .ls-stake {
          border-radius: 10px;
          padding: 6px 9px;
        }
        #${ROOT_ID} .ls-stake small {
          margin-bottom: 2px;
          font-size: 9px;
        }
        #${ROOT_ID} .ls-stake strong { font-size: 15px; }
        #${ROOT_ID} .ls-arrow { font-size: 14px; }
        #${ROOT_ID} .ls-ledger {
          grid-template-columns: 1fr 1fr;
          gap: 4px 16px;
          padding: 8px 10px;
          border-radius: 10px;
        }
        #${ROOT_ID} .ls-row {
          gap: 8px;
          font-size: 11px;
        }
        #${ROOT_ID} .ls-row.ls-total {
          margin-top: 0;
          padding-top: 0;
          border-top: 0;
        }
        #${ROOT_ID} .ls-row.ls-total strong { font-size: 14px; }
        #${ROOT_ID} .ls-note {
          margin-top: 7px;
          padding: 6px 9px;
          border-radius: 9px;
          font-size: 10.5px;
          line-height: 1.3;
        }
        #${ROOT_ID} .ls-actions {
          margin-top: 7px;
          gap: 8px;
          grid-template-columns: 1fr 1fr;
        }
        #${ROOT_ID} button {
          min-height: 44px;
          padding: 6px 10px;
          border-radius: 10px;
        }
        #${ROOT_ID} .ls-primary { order: initial; }
        #${ROOT_ID} .ls-footnote { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeModel(input = {}) {
    const transition = ["move-up", "reentry", "session-ended"].includes(input.transition)
      ? input.transition
      : "move-up";
    const currentTable = input.currentTable || { key: "table-1", smallBlind: 10, bigBlind: 20, entry: 2000 };
    const nextTable = input.nextTable || currentTable;
    const totalWealth = Math.max(0, Number(input.totalWealth) || 0);
    const tableEntry = transition === "session-ended" ? 0 : Math.max(0, Number(nextTable.entry) || 0);
    const bankrollAfter = transition === "session-ended"
      ? totalWealth
      : Math.max(0, Number(input.bankrollAfter ?? (totalWealth - tableEntry)) || 0);
    const aiEntry = transition === "session-ended" ? 0 : Math.max(0, Number(input.aiEntry ?? tableEntry) || 0);
    return Object.freeze({ transition, currentTable, nextTable, totalWealth, tableEntry, bankrollAfter, aiEntry });
  }

  function titleFor(model) {
    if (model.transition === "reentry") return "重新買入，繼續挑戰";
    if (model.transition === "session-ended") return "Long Session 本輪結束";
    return "解鎖更高級別牌桌";
  }

  function subtitleFor(model) {
    if (model.transition === "reentry") return "你已離桌，但資金庫足夠重新以標準 100BB 回到同級別牌桌。";
    if (model.transition === "session-ended") return "目前資產不足以支付這個級別的標準買入；已贏得或剩餘的資產不會被隱藏扣除。";
    return "升桌不會沒收你贏到的籌碼。新牌桌只帶標準 100BB，其餘保留在資金庫。";
  }

  function primaryLabel(model) {
    if (model.transition === "reentry") return `重新買入 ${model.nextTable.smallBlind}/${model.nextTable.bigBlind}`;
    if (model.transition === "session-ended") return "返回模式選擇";
    return `升級到 ${model.nextTable.smallBlind}/${model.nextTable.bigBlind}`;
  }

  function secondaryLabel(model) {
    if (model.transition === "reentry") return "暫不重新買入";
    if (model.transition === "session-ended") return "查看本輪資產";
    return `留在 ${model.currentTable.smallBlind}/${model.currentTable.bigBlind}`;
  }

  function destroy() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function render(input, { onAction } = {}) {
    destroy();
    ensureStyles();
    const model = normalizeModel(input);
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.transition = model.transition;
    root.innerHTML = `
      <section class="ls-card" role="dialog" aria-modal="true" aria-labelledby="ls-transition-title" aria-describedby="ls-transition-subtitle">
        <p class="ls-eyebrow">Long Session · Stakes Ladder</p>
        <h2 class="ls-title" id="ls-transition-title">${titleFor(model)}</h2>
        <p class="ls-subtitle" id="ls-transition-subtitle">${subtitleFor(model)}</p>
        ${model.transition === "session-ended" ? "" : `
          <div class="ls-route" aria-label="牌桌級別變化">
            <div class="ls-stake">
              <small>${model.transition === "reentry" ? "目前級別" : "目前牌桌"}</small>
              <strong>${model.currentTable.smallBlind}/${model.currentTable.bigBlind}</strong>
            </div>
            <div class="ls-arrow" aria-hidden="true">→</div>
            <div class="ls-stake">
              <small>${model.transition === "reentry" ? "重新入桌" : "新牌桌"}</small>
              <strong>${model.nextTable.smallBlind}/${model.nextTable.bigBlind}</strong>
            </div>
          </div>
        `}
        <div class="ls-ledger" aria-label="資產分配明細">
          <div class="ls-row ls-total"><span>你的總資產</span><strong data-ls-total>${formatChips(model.totalWealth)}</strong></div>
          ${model.transition === "session-ended" ? `
            <div class="ls-row"><span>目前保留資產</span><strong data-ls-bankroll>${formatChips(model.bankrollAfter)}</strong></div>
          ` : `
            <div class="ls-row"><span>${model.transition === "reentry" ? "重新買入" : "新牌桌買入"}</span><strong data-ls-entry>${formatChips(model.tableEntry)} · 100BB</strong></div>
            <div class="ls-row"><span>留在資金庫</span><strong data-ls-bankroll>${formatChips(model.bankrollAfter)}</strong></div>
            <div class="ls-row"><span>新入桌 AI</span><strong data-ls-ai>${formatChips(model.aiEntry)} / 位 · 100BB</strong></div>
          `}
        </div>
        <p class="ls-note">${model.transition === "session-ended"
          ? "這是明確的資金門檻，不會根據你的底牌、牌堆或未來公共牌偷偷調整。"
          : "所有新入桌玩家都使用相同的標準深度；不會因為 Hero 贏很多就偷偷替 AI 加籌碼。"}</p>
        <div class="ls-actions">
          <button type="button" class="ls-secondary" data-ls-action="secondary">${secondaryLabel(model)}</button>
          <button type="button" class="ls-primary" data-ls-action="primary">${primaryLabel(model)}</button>
        </div>
        <p class="ls-footnote">Prototype only · 不會修改目前牌局</p>
      </section>
    `;

    const emit = action => {
      const event = Object.freeze({ action, transition: model.transition, at: Date.now() });
      actionLog.push(event);
      root.dataset.lastAction = action;
      if (typeof onAction === "function") onAction(event);
    };
    root.querySelector('[data-ls-action="primary"]').addEventListener("click", () => emit("primary"));
    root.querySelector('[data-ls-action="secondary"]').addEventListener("click", () => emit("secondary"));
    document.body.appendChild(root);
    requestAnimationFrame(() => root.querySelector('[data-ls-action="primary"]')?.focus({ preventScroll: true }));
    return Object.freeze({ ...model });
  }

  function snapshot() {
    const root = document.getElementById(ROOT_ID);
    return Object.freeze({
      mounted: Boolean(root),
      transition: root?.dataset.transition || null,
      lastAction: root?.dataset.lastAction || null,
      actionLog: actionLog.map(entry => ({ ...entry })),
    });
  }

  const api = Object.freeze({
    version: "0.1.0",
    scope: "test-only-ui",
    render,
    destroy,
    snapshot,
  });

  Object.defineProperty(window, "LongSessionTransitionUiPrototypeV1", {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})();
