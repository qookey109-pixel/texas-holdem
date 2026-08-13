import { expect, test } from "@playwright/test";
import { summarizeLongSessionPacing } from "../support/long-session-pacing-metrics-v1.js";

async function loadLongSession(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionModeV1?.isInstalled?.() === true),
    { timeout: 12_000 },
  ).toBe(true);
}

async function runDesignPath(page, { bankroll = 0, tableStack = 2_000, endings }) {
  return page.evaluate(({ bankroll: initialBankroll, tableStack: initialStack, endings: heroEndings }) => {
    const api = window.LongSessionModeV1;
    let session = api.createSession({ tableIndex: 0, bankroll: initialBankroll, tableStack: initialStack });
    const hands = [];

    for (let index = 0; index < heroEndings.length; index += 1) {
      if (session.status !== "active") break;
      const table = api.tables[session.tableIndex];
      const before = { ...session };
      const heroStack = heroEndings[index];
      const completedHand = {
        gameMode: "normal",
        handOver: true,
        handNumber: index + 1,
        heroPresent: true,
        heroStack,
        opponentStacks: Array.from({ length: 6 }, () => table.entry),
      };
      const envelope = api.propose({ completedHand, inputSession: session });
      if (envelope.status !== "proposed") throw new Error(`Path hand ${index + 1} was blocked: ${envelope.reason}`);
      const action = envelope.proposal.transition === "stay" ? "auto" : "primary";
      const committed = api.commit(envelope, action);
      hands.push({
        handNumber: index + 1,
        tableIndex: before.tableIndex,
        targetTableIndex: committed.session.tableIndex,
        bigBlind: table.big,
        startStack: before.tableStack,
        endStack: heroStack,
        bankrollBefore: before.bankroll,
        transition: envelope.proposal.transition,
      });
      session = committed.session;
    }

    return {
      tables: api.tables.map(table => ({ ...table })),
      hands,
      finalSession: { ...session },
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
      normalLevels: [1, 6, 11, 16, 21].map(hand => {
        const level = blindLevelForHand(hand);
        return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
      }),
      active: api.isActive(),
    };
  }, { bankroll, tableStack, endings });
}

test("Long Session pacing metrics frame a complete ladder path as design evidence only", async ({ page }) => {
  await loadLongSession(page);

  const before = await page.evaluate(() => ({
    config: { ...window.ReplacementStackBalance.normalConfig },
    levels: [1, 6, 11, 16, 21].map(hand => {
      const level = blindLevelForHand(hand);
      return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
    }),
  }));

  const path = await runDesignPath(page, {
    endings: [4_500, 9_600, 21_000, 41_000, 45_000],
  });
  const report = summarizeLongSessionPacing(path);

  expect(report).toMatchObject({
    version: "1.0.0",
    evidenceKind: "deterministic-design-path",
    interpretation: "design-pacing-only",
    notNormalBugEvidence: true,
    hands: 5,
    bustFrequency: 0,
    reentryFrequency: 0,
    progression: {
      moveUps: 4,
      highestTableIndex: 4,
      completionRatio: 1,
      reachedFinalTable: true,
      sessionEnds: 0,
    },
    fairnessBoundary: {
      publicCompletedHandStateOnly: true,
      hiddenCardsRequired: false,
      futureDeckRequired: false,
    },
  });
  expect(report.heroBb100).toBeGreaterThan(0);
  expect(report.activeStackRisk.meanExposedWealthRatio).toBeGreaterThan(0);
  expect(report.activeStackRisk.meanExposedWealthRatio).toBeLessThanOrEqual(1);
  expect(report.activeStackRisk.maxExposedWealthRatio).toBe(1);
  expect(report.activeStackRisk.minStartBb).toBe(100);
  expect(report.activeStackRisk.sub50BbHandRate).toBe(0);
  expect(path.finalSession.tableIndex).toBe(4);
  expect(path.active).toBe(false);
  expect(path.normalConfig).toEqual(before.config);
  expect(path.normalLevels).toEqual(before.levels);
});

test("Long Session pacing metrics expose bust, re-entry and session-end frequency without changing Normal", async ({ page }) => {
  await loadLongSession(page);

  const before = await page.evaluate(() => ({
    config: { ...window.ReplacementStackBalance.normalConfig },
    levels: [1, 6, 11, 16, 21].map(hand => {
      const level = blindLevelForHand(hand);
      return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
    }),
  }));

  const path = await runDesignPath(page, {
    bankroll: 2_500,
    endings: [0, 1_500, 0],
  });
  const report = summarizeLongSessionPacing(path);

  expect(report.interpretation).toBe("design-pacing-only");
  expect(report.notNormalBugEvidence).toBe(true);
  expect(report.hands).toBe(3);
  expect(report.bustFrequency).toBeCloseTo(2 / 3, 6);
  expect(report.reentryFrequency).toBeCloseTo(1 / 3, 6);
  expect(report.progression).toEqual({
    moveUps: 0,
    highestTableIndex: 0,
    completionRatio: 0,
    reachedFinalTable: false,
    sessionEnds: 1,
  });
  expect(report.heroBb100).toBeLessThan(0);
  expect(report.activeStackRisk.meanExposedWealthRatio).toBeGreaterThan(0);
  expect(report.activeStackRisk.maxExposedWealthRatio).toBeLessThan(1);
  expect(path.finalSession.status).toBe("ended");
  expect(path.active).toBe(false);
  expect(path.normalConfig).toEqual(before.config);
  expect(path.normalLevels).toEqual(before.levels);
});
