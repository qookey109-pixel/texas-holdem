import { expect, test } from "@playwright/test";

test.describe("Boss equity integration V1", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.BossEquityIntegrationV1?.version || "")).toBe("1.1.0");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.bossEquityIntegration || "")).toBe("ready");
  });

  test("heads-up river decisions use exact public-range enumeration", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalBoard = state.board;
      const originalPlayers = state.players;
      const originalPot = state.pot;
      const originalBet = state.currentBet;
      const boss = {
        name: "Oracle",
        cards: [{ value: 14, suit: "spades" }, { value: 13, suit: "spades" }],
        stack: 1000,
        bet: 0,
        folded: false,
        raiseLocked: true,
      };
      const hero = {
        name: "Owl",
        isHuman: true,
        stack: 1000,
        bet: 0,
        folded: false,
        lastAction: "check",
      };
      state.board = [
        { value: 12, suit: "spades" },
        { value: 11, suit: "spades" },
        { value: 10, suit: "spades" },
        { value: 2, suit: "hearts" },
        { value: 3, suit: "clubs" },
      ];
      state.players = [boss, hero];
      state.pot = 100;
      state.currentBet = 0;
      const estimate = window.BossEquityIntegrationV1.estimate(boss);
      const decision = window.BossEquityIntegrationV1.decide(boss);
      state.board = originalBoard;
      state.players = originalPlayers;
      state.pot = originalPot;
      state.currentBet = originalBet;
      return { estimate, decision };
    });

    expect(result.estimate.method).toBe("exact-river-heads-up");
    expect(result.estimate.combinations).toBe(990);
    expect(result.estimate.equity).toBe(1);
    expect(result.estimate.rangeConditioned).toBe(true);
    expect(result.decision.equityMethod).toBe("exact-river-heads-up");
    expect(result.decision.equityEngine).toBe("1.1.0");
    expect(result.decision.equityEngineVersion).toBe("1.1.0");
    expect(result.decision.rangeModelVersion).toBe("1.0.0");
    expect(result.decision.rangeSummaries).toHaveLength(1);
  });

  test("multiway decisions use joint range-weighted simulation without fixed penalty", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalBoard = state.board;
      const originalPlayers = state.players;
      const originalPot = state.pot;
      const originalBet = state.currentBet;
      const boss = {
        name: "Chronos",
        cards: [{ value: 14, suit: "hearts" }, { value: 14, suit: "clubs" }],
        stack: 1200,
        bet: 0,
        folded: false,
        raiseLocked: true,
      };
      state.board = [
        { value: 9, suit: "spades" },
        { value: 7, suit: "diamonds" },
        { value: 2, suit: "clubs" },
      ];
      state.players = [
        boss,
        { name: "Owl", isHuman: true, stack: 1000, bet: 40, folded: false, lastAction: "raise" },
        { name: "Ace", stack: 1000, bet: 40, folded: false, lastAction: "call" },
        { name: "Momo", stack: 1000, bet: 40, folded: false, lastAction: "call" },
      ];
      state.pot = 180;
      state.currentBet = 40;
      const estimate = window.BossEquityIntegrationV1.estimate(boss);
      state.board = originalBoard;
      state.players = originalPlayers;
      state.pot = originalPot;
      state.currentBet = originalBet;
      return estimate;
    });

    expect(result.method).toBe("joint-multiway-monte-carlo");
    expect(result.opponentCount).toBe(3);
    expect(result.samples).toBe(480);
    expect(result.equity).toBeGreaterThanOrEqual(0);
    expect(result.equity).toBeLessThanOrEqual(1);
    expect(result.rangeConditioned).toBe(true);
    expect(result.rangeSummaries).toHaveLength(3);
  });

  test("engine failures fall back to the existing fair Boss strategy", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalEngine = window.BossEquityEngineV1;
      const originalBoard = state.board;
      const originalPlayers = state.players;
      const boss = {
        name: "Oracle",
        cards: [{ value: 14, suit: "spades" }, { value: 13, suit: "hearts" }],
        stack: 1000,
        bet: 0,
        folded: false,
        raiseLocked: true,
      };
      state.board = [];
      state.players = [boss, { name: "Owl", isHuman: true, stack: 1000, bet: 0, folded: false }];
      window.BossEquityEngineV1 = { version: "broken", activeOpponentCount: () => 1, estimate: () => { throw new Error("forced failure"); } };
      const decision = window.BossEquityIntegrationV1.decide(boss);
      window.BossEquityEngineV1 = originalEngine;
      state.board = originalBoard;
      state.players = originalPlayers;
      return decision;
    });

    expect(result.equityEngine).toBe("legacy-fallback");
    expect(result.equityEngineError).toContain("forced failure");
    expect(["fold", "call", "raise"]).toContain(result.action);
  });

  test("integration preserves the public-information fairness boundary", async ({ page }) => {
    const policy = await page.evaluate(() => window.BossEquityIntegrationV1.fairInformationPolicy);
    expect(policy.ownHoleCards).toBe(true);
    expect(policy.publicBoard).toBe(true);
    expect(policy.publicActiveSeats).toBe(true);
    expect(policy.publicActions).toBe(true);
    expect(policy.publicBetSizes).toBe(true);
    expect(policy.hiddenOpponentCards).toBe(false);
    expect(policy.actualDeckOrder).toBe(false);
    expect(policy.futureBoardAnswer).toBe(false);
    expect(policy.predeterminedWinner).toBe(false);
  });
});
