(() => {
  "use strict";

  if (window.LongSessionStakesLadderPrototypeV1?.version === "0.1.0") return;

  const TABLES = Object.freeze([
    Object.freeze({ index: 0, key: "table-1", smallBlind: 10, bigBlind: 20, entry: 2000 }),
    Object.freeze({ index: 1, key: "table-2", smallBlind: 20, bigBlind: 40, entry: 4000 }),
    Object.freeze({ index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 }),
    Object.freeze({ index: 3, key: "table-4", smallBlind: 100, bigBlind: 200, entry: 20000 }),
    Object.freeze({ index: 4, key: "table-5", smallBlind: 200, bigBlind: 400, entry: 40000 }),
  ]);

  function finiteChipAmount(value, label, { allowNegative = false } = {}) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) throw new TypeError(`${label} must be finite`);
    if (!allowNegative && amount < 0) throw new RangeError(`${label} must be >= 0`);
    return amount;
  }

  function tableAt(index) {
    const safeIndex = Number(index);
    const table = TABLES[safeIndex];
    if (!table || table.index !== safeIndex) throw new RangeError(`Unknown table index: ${index}`);
    return table;
  }

  function assertStandardDepth(table) {
    const entryBb = table.entry / table.bigBlind;
    if (entryBb !== 100) throw new Error(`Table ${table.key} entry depth drifted to ${entryBb}BB`);
    return entryBb;
  }

  function createSession({ initialWealth = TABLES[0].entry, tableIndex = 0 } = {}) {
    const table = tableAt(tableIndex);
    const wealth = finiteChipAmount(initialWealth, "initialWealth");
    if (wealth < table.entry) {
      throw new RangeError(`Need ${table.entry} chips to enter ${table.key}`);
    }

    let bankroll = wealth - table.entry;
    let tableStack = table.entry;
    let currentTableIndex = table.index;
    let handOpen = false;
    let handStartStack = null;
    const transitions = [];

    function currentTable() {
      return tableAt(currentTableIndex);
    }

    function totalWealth() {
      return bankroll + tableStack;
    }

    function snapshot() {
      const current = currentTable();
      return {
        bankroll,
        tableStack,
        totalWealth: totalWealth(),
        tableIndex: currentTableIndex,
        tableKey: current.key,
        smallBlind: current.smallBlind,
        bigBlind: current.bigBlind,
        entry: current.entry,
        entryBb: assertStandardDepth(current),
        currentDepthBb: tableStack / current.bigBlind,
        handOpen,
        transitions: transitions.map(transition => ({ ...transition })),
      };
    }

    function beginHand() {
      if (handOpen) throw new Error("A hand is already open");
      if (tableStack <= 0) throw new Error("Cannot begin a hand with zero table stack");
      handOpen = true;
      handStartStack = tableStack;
      return snapshot();
    }

    function applyHandDelta(delta) {
      if (!handOpen) throw new Error("Hand delta requires an open hand");
      const change = finiteChipAmount(delta, "delta", { allowNegative: true });
      const nextStack = tableStack + change;
      if (nextStack < 0) throw new RangeError("Hand delta cannot make table stack negative");
      tableStack = nextStack;
      return snapshot();
    }

    function endHand() {
      if (!handOpen) throw new Error("No open hand to end");
      const result = tableStack - handStartStack;
      handOpen = false;
      handStartStack = null;
      return { result, snapshot: snapshot() };
    }

    function canMoveToTable(nextTableIndex) {
      if (handOpen) return false;
      const next = tableAt(nextTableIndex);
      if (next.index !== currentTableIndex + 1) return false;
      return totalWealth() >= next.entry;
    }

    function moveToTable(nextTableIndex) {
      if (handOpen) throw new Error("Table moves are only allowed between hands");
      const next = tableAt(nextTableIndex);
      if (next.index !== currentTableIndex + 1) {
        throw new RangeError("Long Session progression must move exactly one table upward");
      }

      const beforeWealth = totalWealth();
      if (beforeWealth < next.entry) {
        throw new RangeError(`Need ${next.entry} total chips to enter ${next.key}`);
      }

      bankroll = beforeWealth - next.entry;
      tableStack = next.entry;
      const previousTableIndex = currentTableIndex;
      currentTableIndex = next.index;
      const afterWealth = totalWealth();
      if (afterWealth !== beforeWealth) throw new Error("Table move violated wealth conservation");

      const transition = {
        type: "move-up",
        fromTableIndex: previousTableIndex,
        toTableIndex: currentTableIndex,
        beforeWealth,
        afterWealth,
        entry: next.entry,
        entryBb: assertStandardDepth(next),
      };
      transitions.push(transition);
      return { ...transition, snapshot: snapshot() };
    }

    function moveToNextTable() {
      if (currentTableIndex >= TABLES.length - 1) throw new RangeError("Already at highest prototype table");
      return moveToTable(currentTableIndex + 1);
    }

    function canReenterCurrentTable() {
      if (handOpen || tableStack !== 0) return false;
      return bankroll >= currentTable().entry;
    }

    function reenterCurrentTable() {
      if (handOpen) throw new Error("Re-entry is only allowed between hands");
      if (tableStack !== 0) throw new Error("Re-entry requires a busted table stack");
      const current = currentTable();
      const beforeWealth = totalWealth();
      if (bankroll < current.entry) {
        throw new RangeError(`Need ${current.entry} bankroll chips to re-enter ${current.key}`);
      }

      bankroll -= current.entry;
      tableStack = current.entry;
      const afterWealth = totalWealth();
      if (afterWealth !== beforeWealth) throw new Error("Re-entry violated wealth conservation");

      const transition = {
        type: "reentry",
        fromTableIndex: currentTableIndex,
        toTableIndex: currentTableIndex,
        beforeWealth,
        afterWealth,
        entry: current.entry,
        entryBb: assertStandardDepth(current),
      };
      transitions.push(transition);
      return { ...transition, snapshot: snapshot() };
    }

    return Object.freeze({
      snapshot,
      beginHand,
      applyHandDelta,
      endHand,
      canMoveToTable,
      moveToTable,
      moveToNextTable,
      canReenterCurrentTable,
      reenterCurrentTable,
    });
  }

  const api = Object.freeze({
    version: "0.1.0",
    scope: "test-only",
    tables: TABLES,
    tableAt,
    createSession,
    validateTableDepths: () => TABLES.map(assertStandardDepth),
  });

  Object.defineProperty(window, "LongSessionStakesLadderPrototypeV1", {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})();
