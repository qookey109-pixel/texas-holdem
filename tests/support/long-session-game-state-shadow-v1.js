(() => {
  "use strict";

  if (window.LongSessionGameStateShadowV1?.version === "0.1.0") return;

  const TABLE_AI_COUNT = 6;
  const TABLES = Object.freeze([
    Object.freeze({ index: 0, key: "table-1", smallBlind: 10, bigBlind: 20, entry: 2000 }),
    Object.freeze({ index: 1, key: "table-2", smallBlind: 20, bigBlind: 40, entry: 4000 }),
    Object.freeze({ index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 }),
    Object.freeze({ index: 3, key: "table-4", smallBlind: 100, bigBlind: 200, entry: 20000 }),
    Object.freeze({ index: 4, key: "table-5", smallBlind: 200, bigBlind: 400, entry: 40000 }),
  ]);

  function finiteChipAmount(value, label) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError(`${label} must be a finite amount >= 0`);
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
    return {
      index: table.index,
      key: table.key,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
      entry: table.entry,
      entryBb: table.entry / table.bigBlind,
    };
  }

  function captureCompletedHandPublicState(runtimeState) {
    if (!runtimeState || typeof runtimeState !== "object") {
      throw new TypeError("runtimeState must be an object");
    }

    const players = Array.isArray(runtimeState.players) ? runtimeState.players : [];
    const hero = players.find(player => player?.isHuman) || players[0] || null;
    const opponents = players.filter(player => player && player !== hero && !player.isHuman);
    const blindLevel = runtimeState.blindLevel || {};

    return Object.freeze({
      gameMode: runtimeState.gameMode === "tournament" ? "tournament" : "normal",
      handOver: runtimeState.handOver === true,
      handNumber: Math.max(0, Number(runtimeState.handNumber) || 0),
      heroPresent: Boolean(hero),
      heroStack: hero ? finiteChipAmount(hero.stack, "hero stack") : 0,
      opponentStacks: Object.freeze(opponents.map(player => finiteChipAmount(player.stack, "opponent stack"))),
      productionBlind: Object.freeze({
        level: Math.max(0, Number(blindLevel.level) || 0),
        smallBlind: Math.max(0, Number(blindLevel.small) || 0),
        bigBlind: Math.max(0, Number(blindLevel.big) || 0),
        buyIn: Math.max(0, Number(blindLevel.buyIn) || 0),
      }),
    });
  }

  function createShadowSession({ tableIndex = 0, bankroll = 0 } = {}) {
    const table = tableAt(tableIndex);
    return Object.freeze({
      version: 1,
      tableIndex: table.index,
      bankroll: finiteChipAmount(bankroll, "bankroll"),
    });
  }

  function createFreshAiSeatProposal(table, roster = []) {
    if (!Array.isArray(roster)) throw new TypeError("roster must be an array");
    const profiles = roster
      .filter(profile => profile && profile.name && profile.name !== "Gemini")
      .slice(0, TABLE_AI_COUNT);
    if (profiles.length !== TABLE_AI_COUNT) {
      throw new Error(`Need ${TABLE_AI_COUNT} ordinary AI profiles for a fresh table`);
    }

    return Object.freeze(profiles.map((profile, index) => Object.freeze({
      position: index + 1,
      name: String(profile.name),
      stack: table.entry,
      stackBb: table.entry / table.bigBlind,
      source: "declared-standard-entry",
    })));
  }

  function proposalResult(status, reason, observed, session, proposal = null) {
    return Object.freeze({
      status,
      reason,
      observed,
      inputSession: Object.freeze({ ...session }),
      proposal,
    });
  }

  function proposeNextHand({ enabled = false, completedHand, session, roster = [] } = {}) {
    if (!completedHand || typeof completedHand !== "object") {
      throw new TypeError("completedHand is required");
    }
    if (!session || typeof session !== "object") throw new TypeError("session is required");

    const currentTable = tableAt(session.tableIndex);
    const bankroll = finiteChipAmount(session.bankroll, "bankroll");
    const frozenSession = Object.freeze({ tableIndex: currentTable.index, bankroll });

    if (!enabled) {
      return proposalResult("disabled", "long-session-off", completedHand, frozenSession);
    }
    if (completedHand.gameMode !== "normal") {
      return proposalResult("blocked", "non-normal-mode", completedHand, frozenSession);
    }
    if (completedHand.handOver !== true) {
      return proposalResult("blocked", "hand-still-active", completedHand, frozenSession);
    }
    if (!completedHand.heroPresent) {
      return proposalResult("blocked", "hero-missing", completedHand, frozenSession);
    }

    const heroStack = finiteChipAmount(completedHand.heroStack, "hero stack");
    const totalWealth = bankroll + heroStack;
    let nextTable = currentTable;
    let nextBankroll = bankroll;
    let nextTableStack = heroStack;
    let transition = "stay";

    if (heroStack <= 0) {
      if (bankroll < currentTable.entry) {
        const proposal = Object.freeze({
          transition: "session-ended",
          reason: "insufficient-bankroll-for-reentry",
          table: cloneTable(currentTable),
          bankroll,
          tableStack: 0,
          totalWealth,
          aiSeats: Object.freeze([]),
        });
        return proposalResult("proposed", "session-ended", completedHand, frozenSession, proposal);
      }
      transition = "reentry";
      nextTableStack = currentTable.entry;
      nextBankroll = bankroll - currentTable.entry;
    } else if (currentTable.index < TABLES.length - 1) {
      const candidate = tableAt(currentTable.index + 1);
      if (totalWealth >= candidate.entry) {
        transition = "move-up";
        nextTable = candidate;
        nextTableStack = candidate.entry;
        nextBankroll = totalWealth - candidate.entry;
      }
    }

    const nextTotalWealth = nextBankroll + nextTableStack;
    if (nextTotalWealth !== totalWealth) {
      throw new Error(`Wealth conservation failure: ${totalWealth} -> ${nextTotalWealth}`);
    }

    const freshTable = transition === "move-up" || transition === "reentry";
    const aiSeats = freshTable
      ? createFreshAiSeatProposal(nextTable, roster)
      : Object.freeze([]);

    const proposal = Object.freeze({
      transition,
      reason: transition === "move-up"
        ? "next-table-entry-funded"
        : transition === "reentry"
          ? "bankroll-reentry-funded"
          : "remain-at-current-table",
      table: cloneTable(nextTable),
      bankroll: nextBankroll,
      tableStack: nextTableStack,
      totalWealth: nextTotalWealth,
      aiSeats,
      publicInputs: Object.freeze({
        handNumber: completedHand.handNumber,
        heroStack,
        opponentStacks: Object.freeze([...(completedHand.opponentStacks || [])]),
      }),
    });

    return proposalResult("proposed", proposal.reason, completedHand, frozenSession, proposal);
  }

  const api = Object.freeze({
    version: "0.1.0",
    scope: "test-only-shadow",
    tables: TABLES,
    tableAt,
    captureCompletedHandPublicState,
    createShadowSession,
    createFreshAiSeatProposal,
    proposeNextHand,
  });

  Object.defineProperty(window, "LongSessionGameStateShadowV1", {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})();
