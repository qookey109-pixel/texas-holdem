import { expect, test } from "@playwright/test";

async function loadLongSession(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionModeV1?.isInstalled?.() === true),
    { timeout: 12_000 },
  ).toBe(true);
}

test("Long Session deterministic transition stress conserves wealth across 2,000 cases", async ({ page }) => {
  await loadLongSession(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionModeV1;
    const before = {
      config: { ...window.ReplacementStackBalance.normalConfig },
      levels: [1, 6, 11, 16, 21].map(hand => {
        const level = blindLevelForHand(hand);
        return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
      }),
    };
    const counts = {
      stay: 0,
      moveUp: 0,
      reentry: 0,
      ended: 0,
      primary: 0,
      secondary: 0,
      auto: 0,
    };

    for (let index = 0; index < 2_000; index += 1) {
      const tableIndex = index % api.tables.length;
      const table = api.tables[tableIndex];
      const next = api.tables[tableIndex + 1] || null;
      const kind = index % 5;
      let bankroll = 0;
      let heroStack = Math.max(1, Math.floor(table.entry * 0.6));
      let expectedTransition = "stay";

      if (kind === 1 && next) {
        heroStack = next.entry + (index % 17);
        expectedTransition = "move-up";
      } else if (kind === 2) {
        heroStack = 0;
        bankroll = table.entry + (index % 19);
        expectedTransition = "reentry";
      } else if (kind === 3) {
        heroStack = 0;
        bankroll = Math.max(0, table.entry - 1);
        expectedTransition = "session-ended";
      } else if (kind === 4) {
        heroStack = Math.floor(table.entry * 0.5);
        bankroll = Math.floor(table.entry * 0.25);
      }

      const inputSession = api.createSession({
        tableIndex,
        bankroll,
        tableStack: table.entry,
      });
      const completedHand = {
        gameMode: "normal",
        handOver: true,
        handNumber: index + 1,
        heroPresent: true,
        heroStack,
        opponentStacks: Array.from({ length: 6 }, () => table.entry),
      };
      const envelope = api.propose({ completedHand, inputSession });
      if (envelope.status !== "proposed") {
        throw new Error(`Stress case ${index} was not proposed: ${envelope.reason}`);
      }
      if (envelope.proposal.transition !== expectedTransition) {
        throw new Error(`Stress case ${index} expected ${expectedTransition}, got ${envelope.proposal.transition}`);
      }
      if (envelope.proposal.proposedTotalWealth !== envelope.proposal.observedTotalWealth) {
        throw new Error(`Stress case ${index} drifted before commit`);
      }

      let action = "auto";
      if (expectedTransition === "move-up") action = index % 2 === 0 ? "secondary" : "primary";
      if (expectedTransition === "reentry") action = index % 2 === 0 ? "primary" : "secondary";
      if (expectedTransition === "session-ended") action = "primary";
      const committed = api.commit(envelope, action);
      if (committed.session.totalWealth !== envelope.proposal.observedTotalWealth) {
        throw new Error(`Stress case ${index} drifted after commit`);
      }
      if (committed.session.bankroll < 0 || committed.session.tableStack < 0) {
        throw new Error(`Stress case ${index} produced negative chips`);
      }

      if (expectedTransition === "stay") counts.stay += 1;
      if (expectedTransition === "move-up") {
        counts.moveUp += 1;
        if (envelope.proposal.targetTable.entry / envelope.proposal.targetTable.big !== 100) {
          throw new Error(`Stress case ${index} target was not 100BB`);
        }
        const expectedTableIndex = action === "primary" ? tableIndex + 1 : tableIndex;
        if (committed.session.tableIndex !== expectedTableIndex) {
          throw new Error(`Stress case ${index} committed to wrong table`);
        }
      }
      if (expectedTransition === "reentry") {
        counts.reentry += 1;
        if (action === "primary" && committed.session.tableStack / table.big !== 100) {
          throw new Error(`Stress case ${index} re-entry was not 100BB`);
        }
      }
      if (expectedTransition === "session-ended") counts.ended += 1;
      counts[action] += 1;
    }

    const after = {
      config: { ...window.ReplacementStackBalance.normalConfig },
      levels: [1, 6, 11, 16, 21].map(hand => {
        const level = blindLevelForHand(hand);
        return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
      }),
      active: api.isActive(),
      session: api.snapshot().session,
    };
    return { before, after, counts };
  });

  expect(result.counts.stay).toBeGreaterThan(500);
  expect(result.counts.moveUp).toBeGreaterThan(250);
  expect(result.counts.reentry).toBe(400);
  expect(result.counts.ended).toBe(400);
  expect(result.counts.primary).toBeGreaterThan(400);
  expect(result.counts.secondary).toBeGreaterThan(100);
  expect(result.counts.auto).toBeGreaterThan(500);
  expect(result.after.active).toBe(false);
  expect(result.after.session).toBeNull();
  expect(result.after.config).toEqual(result.before.config);
  expect(result.after.levels).toEqual(result.before.levels);
});

test("Long Session wrapper lifecycle survives 100 enable-disable cycles without ownership leaks", async ({ page }) => {
  await loadLongSession(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionModeV1;
    const normalLevels = [1, 6, 11, 16, 21].map(hand => {
      const level = blindLevelForHand(hand);
      return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
    });
    const normalConfig = { ...window.ReplacementStackBalance.normalConfig };
    const initialMode = state.gameMode || "normal";

    for (let cycle = 0; cycle < 100; cycle += 1) {
      api.enableNow({ restart: false });
      const longLevel = blindLevelForHand(11);
      if (!api.isActive() || longLevel.small !== 10 || longLevel.big !== 20 || longLevel.buyIn !== 2000 || longLevel.longSession !== true) {
        throw new Error(`Long Session failed to own blind schedule on cycle ${cycle}`);
      }
      api.disableNow({ restart: false });
      const restored = blindLevelForHand(11);
      if (api.isActive() || restored.small !== 50 || restored.big !== 100 || restored.buyIn !== 7000 || restored.longSession === true) {
        throw new Error(`Normal blind schedule failed to restore on cycle ${cycle}`);
      }
    }

    const mobileGrids = document.querySelectorAll(".mobile-v1-settings-grid").length;
    return {
      active: api.isActive(),
      snapshot: api.snapshot(),
      currentMode: state.gameMode || "normal",
      normalConfigAfter: { ...window.ReplacementStackBalance.normalConfig },
      normalLevelsAfter: [1, 6, 11, 16, 21].map(hand => {
        const level = blindLevelForHand(hand);
        return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
      }),
      buttonCount: document.querySelectorAll("#longSessionModeButton").length,
      mobileGrids,
      mobileButtonCount: document.querySelectorAll("[data-long-session-mobile-toggle]").length,
      decisionCount: document.querySelectorAll("#longSessionDecisionRoot").length,
      bodyOwnsMode: document.body.classList.contains("is-long-session-mode"),
      normalConfig,
      normalLevels,
      initialMode,
    };
  });

  expect(result.active).toBe(false);
  expect(result.snapshot.session).toBeNull();
  expect(result.snapshot.decision).toBeNull();
  expect(result.currentMode).toBe(result.initialMode);
  expect(result.normalConfigAfter).toEqual(result.normalConfig);
  expect(result.normalLevelsAfter).toEqual(result.normalLevels);
  expect(result.buttonCount).toBe(1);
  expect(result.mobileButtonCount).toBe(result.mobileGrids);
  expect(result.decisionCount).toBe(0);
  expect(result.bodyOwnsMode).toBe(false);
});
