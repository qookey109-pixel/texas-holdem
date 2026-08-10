(() => {
  "use strict";

  if (window.LongSessionOrchestrationPrototypeV1?.version === "0.1.0") return;

  const ROOT_ID = "long-session-orchestration-v1-root";
  const TABLES = Object.freeze([
    Object.freeze({ index: 0, key: "table-1", smallBlind: 10, bigBlind: 20, entry: 2000 }),
    Object.freeze({ index: 1, key: "table-2", smallBlind: 20, bigBlind: 40, entry: 4000 }),
    Object.freeze({ index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 }),
    Object.freeze({ index: 3, key: "table-4", smallBlind: 100, bigBlind: 200, entry: 20000 }),
    Object.freeze({ index: 4, key: "table-5", smallBlind: 200, bigBlind: 400, entry: 40000 }),
  ]);
  const TABLE_AI_COUNT = 6;
  let proposalSequence = 0;
  let lastUiSelection = null;

  function finiteChips(value, label) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError(`${label} must be a finite chip amount >= 0`);
    }
    return amount;
  }

  function tableAt(index) {
    const numericIndex = Number(index);
    const table = TABLES[numericIndex];
    if (!table || table.index !== numericIndex) throw new RangeError(`Unknown table index: ${index}`);
    if (table.entry / table.bigBlind !== 100) throw new Error(`Entry depth drift for ${table.key}`);
    return table;
  }

  function cloneTable(table) {
    return Object.freeze({
      index: table.index,
      key: table.key,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
      entry: table.entry,
      entryBb: table.entry / table.bigBlind,
    });
  }

  function createSession({ tableIndex = 0, bankroll = 0, tableStack } = {}) {
    const table = tableAt(tableIndex);
    const stack = tableStack == null ? table.entry : finiteChips(tableStack, "tableStack");
    return Object.freeze({
      version: 1,
      status: "active",
      tableIndex: table.index,
      bankroll: finiteChips(bankroll, "bankroll"),
      tableStack: stack,
      totalWealth: finiteChips(bankroll, "bankroll") + stack,
    });
  }

  function captureCompletedHandPublicState(runtimeState) {
    if (!runtimeState || typeof runtimeState !== "object") throw new TypeError("runtimeState must be an object");
    const players = Array.isArray(runtimeState.players) ? runtimeState.players : [];
    const hero = players.find(player => player?.isHuman) || players[0] || null;
    const opponents = players.filter(player => player && player !== hero && !player.isHuman);
    const blind = runtimeState.blindLevel || {};
    return Object.freeze({
      gameMode: runtimeState.gameMode === "tournament" ? "tournament" : "normal",
      handOver: runtimeState.handOver === true,
      handNumber: Math.max(0, Number(runtimeState.handNumber) || 0),
      heroPresent: Boolean(hero),
      heroStack: hero ? finiteChips(hero.stack, "heroStack") : 0,
      opponentStacks: Object.freeze(opponents.map(player => finiteChips(player.stack, "opponentStack"))),
      productionBlind: Object.freeze({
        level: Math.max(0, Number(blind.level) || 0),
        smallBlind: Math.max(0, Number(blind.small) || 0),
        bigBlind: Math.max(0, Number(blind.big) || 0),
        buyIn: Math.max(0, Number(blind.buyIn) || 0),
      }),
    });
  }

  function ordinaryRoster(roster) {
    if (!Array.isArray(roster)) throw new TypeError("roster must be an array");
    const profiles = roster.filter(profile => profile?.name && profile.name !== "Gemini").slice(0, TABLE_AI_COUNT);
    if (profiles.length !== TABLE_AI_COUNT) throw new Error(`Need ${TABLE_AI_COUNT} ordinary AI profiles`);
    return profiles;
  }

  function freshAiSeats(table, roster) {
    return Object.freeze(ordinaryRoster(roster).map((profile, index) => Object.freeze({
      position: index + 1,
      name: String(profile.name),
      stack: table.entry,
      stackBb: table.entry / table.bigBlind,
      source: "declared-standard-entry",
    })));
  }

  function proposalEnvelope(status, reason, completedHand, session, proposal = null) {
    return Object.freeze({
      status,
      reason,
      completedHand,
      inputSession: Object.freeze({ ...session }),
      proposal,
    });
  }

  function propose({ enabled = false, completedHand, session, roster = [] } = {}) {
    if (!completedHand || typeof completedHand !== "object") throw new TypeError("completedHand is required");
    if (!session || typeof session !== "object") throw new TypeError("session is required");
    const currentTable = tableAt(session.tableIndex);
    const bankroll = finiteChips(session.bankroll, "bankroll");
    const inputSession = createSession({
      tableIndex: currentTable.index,
      bankroll,
      tableStack: finiteChips(session.tableStack, "tableStack"),
    });

    if (!enabled) return proposalEnvelope("disabled", "long-session-off", completedHand, inputSession);
    if (completedHand.gameMode !== "normal") return proposalEnvelope("blocked", "non-normal-mode", completedHand, inputSession);
    if (completedHand.handOver !== true) return proposalEnvelope("blocked", "hand-still-active", completedHand, inputSession);
    if (!completedHand.heroPresent) return proposalEnvelope("blocked", "hero-missing", completedHand, inputSession);

    const heroStack = finiteChips(completedHand.heroStack, "heroStack");
    const observedTotalWealth = bankroll + heroStack;
    let transition = "stay";
    let targetTable = currentTable;
    let nextBankroll = bankroll;
    let nextTableStack = heroStack;
    let aiSeats = Object.freeze([]);

    if (heroStack <= 0) {
      if (bankroll >= currentTable.entry) {
        transition = "reentry";
        nextBankroll = bankroll - currentTable.entry;
        nextTableStack = currentTable.entry;
        aiSeats = freshAiSeats(currentTable, roster);
      } else {
        transition = "session-ended";
        nextBankroll = bankroll;
        nextTableStack = 0;
      }
    } else if (currentTable.index < TABLES.length - 1) {
      const candidate = tableAt(currentTable.index + 1);
      if (observedTotalWealth >= candidate.entry) {
        transition = "move-up";
        targetTable = candidate;
        nextBankroll = observedTotalWealth - candidate.entry;
        nextTableStack = candidate.entry;
        aiSeats = freshAiSeats(candidate, roster);
      }
    }

    const proposedTotalWealth = nextBankroll + nextTableStack;
    if (proposedTotalWealth !== observedTotalWealth) {
      throw new Error(`Wealth conservation failure: ${observedTotalWealth} -> ${proposedTotalWealth}`);
    }

    proposalSequence += 1;
    const proposal = Object.freeze({
      id: `ls-orch-${proposalSequence}`,
      transition,
      reason: transition === "move-up"
        ? "next-table-entry-funded"
        : transition === "reentry"
          ? "bankroll-reentry-funded"
          : transition === "session-ended"
            ? "insufficient-bankroll-for-reentry"
            : "remain-at-current-table",
      currentTable: cloneTable(currentTable),
      targetTable: cloneTable(targetTable),
      inputBankroll: bankroll,
      observedHeroStack: heroStack,
      observedTotalWealth,
      proposedBankroll: nextBankroll,
      proposedTableStack: nextTableStack,
      proposedTotalWealth,
      aiSeats,
      publicInputs: Object.freeze({
        handNumber: completedHand.handNumber,
        heroStack,
        opponentStacks: Object.freeze([...(completedHand.opponentStacks || [])]),
      }),
    });
    return proposalEnvelope("proposed", proposal.reason, completedHand, inputSession, proposal);
  }

  function toUiModel(envelope) {
    if (!envelope?.proposal) return null;
    const proposal = envelope.proposal;
    if (proposal.transition === "stay") return null;
    return Object.freeze({
      proposalId: proposal.id,
      transition: proposal.transition,
      currentStake: `${proposal.currentTable.smallBlind}/${proposal.currentTable.bigBlind}`,
      targetStake: `${proposal.targetTable.smallBlind}/${proposal.targetTable.bigBlind}`,
      totalWealth: proposal.observedTotalWealth,
      tableEntry: proposal.transition === "session-ended" ? 0 : proposal.proposedTableStack,
      bankrollAfter: proposal.proposedBankroll,
      aiEntry: proposal.aiSeats[0]?.stack || 0,
      entryBb: proposal.transition === "session-ended" ? 0 : proposal.targetTable.entryBb,
      primaryLabel: proposal.transition === "move-up"
        ? `升級到 ${proposal.targetTable.smallBlind}/${proposal.targetTable.bigBlind}`
        : proposal.transition === "reentry"
          ? `重新買入 ${proposal.targetTable.smallBlind}/${proposal.targetTable.bigBlind}`
          : "結束 Long Session",
      secondaryLabel: proposal.transition === "move-up"
        ? `留在 ${proposal.currentTable.smallBlind}/${proposal.currentTable.bigBlind}`
        : proposal.transition === "reentry"
          ? "暫不重新買入"
          : "查看保留資產",
    });
  }

  function commit(envelope, action = "primary") {
    if (!envelope?.proposal) throw new TypeError("proposal envelope is required");
    if (action !== "primary" && action !== "secondary" && action !== "auto") {
      throw new RangeError(`Unknown action: ${action}`);
    }
    const proposal = envelope.proposal;
    const input = envelope.inputSession;

    if (proposal.transition === "stay") {
      if (action !== "auto" && action !== "primary") throw new RangeError("Stay proposals only support auto/primary commit");
      return Object.freeze({
        action,
        transition: "stay",
        status: "active",
        session: createSession({
          tableIndex: proposal.currentTable.index,
          bankroll: proposal.inputBankroll,
          tableStack: proposal.observedHeroStack,
        }),
      });
    }

    if (proposal.transition === "move-up" && action === "secondary") {
      return Object.freeze({
        action,
        transition: "stay",
        status: "active",
        session: createSession({
          tableIndex: proposal.currentTable.index,
          bankroll: proposal.inputBankroll,
          tableStack: proposal.observedHeroStack,
        }),
      });
    }

    if (proposal.transition === "reentry" && action === "secondary") {
      return Object.freeze({
        action,
        transition: "paused",
        status: "paused",
        session: Object.freeze({
          version: 1,
          status: "paused",
          tableIndex: proposal.currentTable.index,
          bankroll: proposal.inputBankroll,
          tableStack: 0,
          totalWealth: proposal.inputBankroll,
        }),
      });
    }

    if (proposal.transition === "session-ended") {
      return Object.freeze({
        action,
        transition: "session-ended",
        status: "ended",
        session: Object.freeze({
          version: 1,
          status: "ended",
          tableIndex: proposal.currentTable.index,
          bankroll: proposal.inputBankroll,
          tableStack: 0,
          totalWealth: proposal.inputBankroll,
        }),
      });
    }

    if (action === "auto") throw new RangeError(`${proposal.transition} requires an explicit decision`);
    const nextSession = createSession({
      tableIndex: proposal.targetTable.index,
      bankroll: proposal.proposedBankroll,
      tableStack: proposal.proposedTableStack,
    });
    if (nextSession.totalWealth !== proposal.observedTotalWealth) {
      throw new Error("Committed session wealth drift");
    }
    return Object.freeze({
      action,
      transition: proposal.transition,
      status: "active",
      session: nextSession,
    });
  }

  function destroyUi() {
    document.getElementById(ROOT_ID)?.remove();
    lastUiSelection = null;
  }

  function renderDecision(envelope) {
    destroyUi();
    const model = toUiModel(envelope);
    if (!model) return null;
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.proposalId = model.proposalId;
    root.dataset.transition = model.transition;
    root.style.cssText = "position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:rgba(0,0,0,.55);font-family:system-ui,sans-serif";
    root.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="ls-orch-title" style="width:min(520px,92vw);padding:18px;border:1px solid #d7a83a;border-radius:16px;background:#0d181d;color:#f6f2e8">
        <h2 id="ls-orch-title" style="margin:0 0 10px;font-size:24px">${model.transition === "move-up" ? "Long Session 升桌" : model.transition === "reentry" ? "Long Session 重新買入" : "Long Session 結束"}</h2>
        <div data-orch-stakes>${model.currentStake}${model.transition === "move-up" ? ` → ${model.targetStake}` : ""}</div>
        <div data-orch-total>總資產 ${model.totalWealth}</div>
        <div data-orch-entry>入桌 ${model.tableEntry}${model.entryBb ? ` · ${model.entryBb}BB` : ""}</div>
        <div data-orch-bankroll>資金庫 ${model.bankrollAfter}</div>
        <div data-orch-ai>AI 入桌 ${model.aiEntry}${model.aiEntry ? " · 100BB" : ""}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <button type="button" data-orch-action="secondary" style="min-height:44px">${model.secondaryLabel}</button>
          <button type="button" data-orch-action="primary" style="min-height:44px">${model.primaryLabel}</button>
        </div>
      </section>
    `;
    const select = action => {
      lastUiSelection = Object.freeze({ action, proposalId: model.proposalId, commit: commit(envelope, action) });
      root.dataset.lastAction = action;
    };
    root.querySelector('[data-orch-action="primary"]').addEventListener("click", () => select("primary"));
    root.querySelector('[data-orch-action="secondary"]').addEventListener("click", () => select("secondary"));
    document.body.appendChild(root);
    root.querySelector('[data-orch-action="primary"]')?.focus({ preventScroll: true });
    return model;
  }

  function uiSnapshot() {
    const root = document.getElementById(ROOT_ID);
    return Object.freeze({
      mounted: Boolean(root),
      proposalId: root?.dataset.proposalId || null,
      transition: root?.dataset.transition || null,
      lastAction: root?.dataset.lastAction || null,
      selection: lastUiSelection,
    });
  }

  const api = Object.freeze({
    version: "0.1.0",
    scope: "test-only-orchestration",
    tables: TABLES,
    tableAt,
    createSession,
    captureCompletedHandPublicState,
    propose,
    toUiModel,
    commit,
    renderDecision,
    destroyUi,
    uiSnapshot,
  });

  Object.defineProperty(window, "LongSessionOrchestrationPrototypeV1", {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})();
