import { expect, test } from "@playwright/test";

async function loadPrototype(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.() === true),
    { timeout: 10_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.EconomyFoldDefenseV1?.status?.().installed === true),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    window.__longSessionProductionRefs = {
      blindLevelForHand,
      currentBuyIn,
      startHand,
      calculateNormalReplacementPlan: window.ReplacementStackBalance.calculateNormalReplacementPlan,
    };
    window.__longSessionProductionSnapshot = {
      levels: [1, 6, 11, 16, 21, 250].map(hand => ({ hand, ...blindLevelForHand(hand) })),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
      normalDataset: document.documentElement.dataset.normalEconomy || "",
    };
  });

  await page.addScriptTag({ url: "/tests/support/long-session-stakes-ladder-v1.js" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionStakesLadderPrototypeV1?.version || ""),
  ).toBe("0.1.0");
}

function expectCleanSnapshot(snapshot) {
  expect(snapshot.bankroll).toBeGreaterThanOrEqual(0);
  expect(snapshot.tableStack).toBeGreaterThanOrEqual(0);
  expect(snapshot.totalWealth).toBe(snapshot.bankroll + snapshot.tableStack);
  expect(snapshot.entryBb).toBe(100);
  expect(snapshot.currentDepthBb).toBe(snapshot.tableStack / snapshot.bigBlind);
}

test("test-only prototype leaves default Normal runtime and economy untouched", async ({ page }) => {
  await loadPrototype(page);

  const result = await page.evaluate(() => ({
    version: window.LongSessionStakesLadderPrototypeV1.version,
    scope: window.LongSessionStakesLadderPrototypeV1.scope,
    depths: window.LongSessionStakesLadderPrototypeV1.validateTableDepths(),
    tables: window.LongSessionStakesLadderPrototypeV1.tables.map(table => ({ ...table })),
    identity: {
      blindLevelForHand: blindLevelForHand === window.__longSessionProductionRefs.blindLevelForHand,
      currentBuyIn: currentBuyIn === window.__longSessionProductionRefs.currentBuyIn,
      startHand: startHand === window.__longSessionProductionRefs.startHand,
      normalPlan:
        window.ReplacementStackBalance.calculateNormalReplacementPlan
        === window.__longSessionProductionRefs.calculateNormalReplacementPlan,
    },
    before: window.__longSessionProductionSnapshot,
    after: {
      levels: [1, 6, 11, 16, 21, 250].map(hand => ({ hand, ...blindLevelForHand(hand) })),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
      normalDataset: document.documentElement.dataset.normalEconomy || "",
    },
  }));

  expect(result.version).toBe("0.1.0");
  expect(result.scope).toBe("test-only");
  expect(result.depths).toEqual([100, 100, 100, 100, 100]);
  expect(result.tables).toEqual([
    { index: 0, key: "table-1", smallBlind: 10, bigBlind: 20, entry: 2000 },
    { index: 1, key: "table-2", smallBlind: 20, bigBlind: 40, entry: 4000 },
    { index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 },
    { index: 3, key: "table-4", smallBlind: 100, bigBlind: 200, entry: 20000 },
    { index: 4, key: "table-5", smallBlind: 200, bigBlind: 400, entry: 40000 },
  ]);
  expect(result.identity).toEqual({
    blindLevelForHand: true,
    currentBuyIn: true,
    startHand: true,
    normalPlan: true,
  });
  expect(result.after).toEqual(result.before);
});

test("stakes ladder cashes out wealth and re-enters each higher table at exactly 100BB", async ({ page }) => {
  await loadPrototype(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionStakesLadderPrototypeV1;
    const session = api.createSession({ initialWealth: 2000 });
    const snapshots = [session.snapshot()];
    const transitions = [];

    const playAndMove = (delta, nextTableIndex) => {
      session.beginHand();
      session.applyHandDelta(delta);
      session.endHand();
      const move = session.moveToTable(nextTableIndex);
      transitions.push(move);
      snapshots.push(session.snapshot());
    };

    playAndMove(4000, 1);
    playAndMove(12000, 2);
    playAndMove(22000, 3);
    playAndMove(60000, 4);

    return { snapshots, transitions };
  });

  result.snapshots.forEach(expectCleanSnapshot);
  expect(result.snapshots.map(snapshot => ({
    table: snapshot.tableIndex,
    bankroll: snapshot.bankroll,
    tableStack: snapshot.tableStack,
    total: snapshot.totalWealth,
    entryBb: snapshot.entryBb,
  }))).toEqual([
    { table: 0, bankroll: 0, tableStack: 2000, total: 2000, entryBb: 100 },
    { table: 1, bankroll: 2000, tableStack: 4000, total: 6000, entryBb: 100 },
    { table: 2, bankroll: 8000, tableStack: 10000, total: 18000, entryBb: 100 },
    { table: 3, bankroll: 20000, tableStack: 20000, total: 40000, entryBb: 100 },
    { table: 4, bankroll: 60000, tableStack: 40000, total: 100000, entryBb: 100 },
  ]);

  expect(result.transitions).toHaveLength(4);
  result.transitions.forEach(transition => {
    expect(transition.type).toBe("move-up");
    expect(transition.beforeWealth).toBe(transition.afterWealth);
    expect(transition.entryBb).toBe(100);
  });
});

test("table moves reject mid-hand, skipped-table, and insufficient-bankroll transitions without mutation", async ({ page }) => {
  await loadPrototype(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionStakesLadderPrototypeV1;
    const captureError = callback => {
      try {
        callback();
        return "";
      } catch (error) {
        return String(error?.message || error);
      }
    };

    const midHand = api.createSession({ initialWealth: 6000 });
    midHand.beginHand();
    const midBefore = midHand.snapshot();
    const midError = captureError(() => midHand.moveToTable(1));
    const midAfter = midHand.snapshot();
    midHand.endHand();

    const skipped = api.createSession({ initialWealth: 50000 });
    const skippedBefore = skipped.snapshot();
    const skippedError = captureError(() => skipped.moveToTable(2));
    const skippedAfter = skipped.snapshot();

    const poor = api.createSession({ initialWealth: 2000 });
    const poorBefore = poor.snapshot();
    const poorError = captureError(() => poor.moveToTable(1));
    const poorAfter = poor.snapshot();

    return {
      midError, midBefore, midAfter,
      skippedError, skippedBefore, skippedAfter,
      poorError, poorBefore, poorAfter,
    };
  });

  expect(result.midError).toContain("between hands");
  expect(result.midAfter).toEqual(result.midBefore);
  expect(result.skippedError).toContain("exactly one table upward");
  expect(result.skippedAfter).toEqual(result.skippedBefore);
  expect(result.poorError).toContain("Need 4000 total chips");
  expect(result.poorAfter).toEqual(result.poorBefore);
});

test("bust re-entry consumes bankroll only and conserves total wealth at the same 100BB table depth", async ({ page }) => {
  await loadPrototype(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionStakesLadderPrototypeV1;
    const funded = api.createSession({ initialWealth: 10000, tableIndex: 1 });
    funded.beginHand();
    funded.applyHandDelta(-4000);
    funded.endHand();
    const busted = funded.snapshot();
    const canReenter = funded.canReenterCurrentTable();
    const reentry = funded.reenterCurrentTable();
    const after = funded.snapshot();

    const unfunded = api.createSession({ initialWealth: 4000, tableIndex: 1 });
    unfunded.beginHand();
    unfunded.applyHandDelta(-4000);
    unfunded.endHand();
    const unfundedBefore = unfunded.snapshot();
    let unfundedError = "";
    try {
      unfunded.reenterCurrentTable();
    } catch (error) {
      unfundedError = String(error?.message || error);
    }
    const unfundedAfter = unfunded.snapshot();

    return {
      busted,
      canReenter,
      reentry,
      after,
      unfundedBefore,
      unfundedError,
      unfundedAfter,
    };
  });

  expectCleanSnapshot(result.busted);
  expect(result.busted).toMatchObject({ bankroll: 6000, tableStack: 0, totalWealth: 6000, tableIndex: 1 });
  expect(result.canReenter).toBe(true);
  expect(result.reentry).toMatchObject({
    type: "reentry",
    beforeWealth: 6000,
    afterWealth: 6000,
    entry: 4000,
    entryBb: 100,
  });
  expectCleanSnapshot(result.after);
  expect(result.after).toMatchObject({ bankroll: 2000, tableStack: 4000, totalWealth: 6000, tableIndex: 1 });

  expect(result.unfundedBefore).toMatchObject({ bankroll: 0, tableStack: 0, totalWealth: 0 });
  expect(result.unfundedError).toContain("Need 4000 bankroll chips");
  expect(result.unfundedAfter).toEqual(result.unfundedBefore);
});

test("deterministic accounting stress keeps all ladder and transition invariants clean", async ({ page }) => {
  await loadPrototype(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionStakesLadderPrototypeV1;
    let seed = 0x1832026;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let handCount = 0;
    let moveCount = 0;
    let reentryCount = 0;
    let sessionCount = 0;
    let invariantChecks = 0;
    const failures = [];

    const checkSnapshot = snapshot => {
      invariantChecks += 1;
      if (snapshot.bankroll < 0) failures.push("negative-bankroll");
      if (snapshot.tableStack < 0) failures.push("negative-table-stack");
      if (snapshot.totalWealth !== snapshot.bankroll + snapshot.tableStack) failures.push("wealth-sum-drift");
      if (snapshot.entryBb !== 100) failures.push("entry-depth-drift");
      if (snapshot.currentDepthBb !== snapshot.tableStack / snapshot.bigBlind) failures.push("current-depth-drift");
      for (const transition of snapshot.transitions) {
        if (transition.beforeWealth !== transition.afterWealth) failures.push("transition-wealth-drift");
        if (transition.entryBb !== 100) failures.push("transition-depth-drift");
      }
    };

    for (let sessionIndex = 0; sessionIndex < 160; sessionIndex += 1) {
      sessionCount += 1;
      const session = api.createSession({ initialWealth: 500000 });
      checkSnapshot(session.snapshot());

      for (let handIndex = 0; handIndex < 80; handIndex += 1) {
        const before = session.snapshot();
        if (before.tableStack <= 0) {
          if (session.canReenterCurrentTable()) {
            const transition = session.reenterCurrentTable();
            reentryCount += 1;
            if (transition.beforeWealth !== transition.afterWealth) failures.push("reentry-wealth-drift");
            if (transition.entryBb !== 100) failures.push("reentry-depth-drift");
            checkSnapshot(session.snapshot());
          } else {
            break;
          }
        }

        const open = session.beginHand();
        checkSnapshot(open);
        const active = session.snapshot();
        const forceBust = random() < 0.025;
        const swingBase = Math.max(active.entry, active.bigBlind * 20);
        const rawDelta = forceBust
          ? -active.tableStack
          : Math.round((random() * 1.30 - 0.45) * swingBase);
        const delta = Math.max(-active.tableStack, rawDelta);
        session.applyHandDelta(delta);
        const handResult = session.endHand();
        handCount += 1;
        checkSnapshot(handResult.snapshot);

        const afterHand = session.snapshot();
        if (
          afterHand.tableStack > 0
          && afterHand.tableIndex < api.tables.length - 1
          && random() < 0.18
          && session.canMoveToTable(afterHand.tableIndex + 1)
        ) {
          const transition = session.moveToNextTable();
          moveCount += 1;
          if (transition.beforeWealth !== transition.afterWealth) failures.push("move-wealth-drift");
          if (transition.entryBb !== 100) failures.push("move-depth-drift");
          checkSnapshot(session.snapshot());
        }
      }
    }

    return {
      sessionCount,
      handCount,
      moveCount,
      reentryCount,
      invariantChecks,
      failures,
      depths: api.validateTableDepths(),
    };
  });

  expect(result.sessionCount).toBe(160);
  expect(result.handCount).toBeGreaterThanOrEqual(10_000);
  expect(result.invariantChecks).toBeGreaterThan(result.handCount * 2);
  expect(result.moveCount).toBeGreaterThan(0);
  expect(result.reentryCount).toBeGreaterThan(0);
  expect(result.depths).toEqual([100, 100, 100, 100, 100]);
  expect(result.failures).toEqual([]);
});
