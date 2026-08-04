import { expect, test } from "@playwright/test";

test.describe("Fair Boss equity engine V1", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.BossPublicRangeModelV1?.version || "")).toBe("1.0.0");
    await expect.poll(() => page.evaluate(() => window.BossEquityEngineV1?.version || "")).toBe("1.1.0");
  });

  test("river heads-up enumerates all 990 unknown opponent combinations", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalPlayers = state.players;
      const player = {
        name: "Oracle",
        cards: [
          { value: 10, suit: "hearts" },
          { value: 9, suit: "hearts" },
        ],
      };
      const opponent = { name: "Owl", folded: false, bet: 0, lastAction: "check" };
      state.players = [player, opponent];
      const board = [
        { value: 14, suit: "hearts" },
        { value: 13, suit: "hearts" },
        { value: 12, suit: "hearts" },
        { value: 11, suit: "hearts" },
        { value: 2, suit: "clubs" },
      ];
      const estimate = window.BossEquityEngineV1.estimate(player, { board, opponentCount: 1 });
      state.players = originalPlayers;
      return estimate;
    });

    expect(result.method).toBe("exact-river-heads-up");
    expect(result.combinations).toBe(990);
    expect(result.equity).toBe(1);
    expect(result.unweightedEquity).toBe(1);
    expect(result.rangeConditioned).toBe(true);
    expect(result.rangeModelVersion).toBe("1.0.0");
  });

  test("multiway simulation evaluates all opponents jointly", async ({ page }) => {
    const result = await page.evaluate(() => {
      let seed = 91;
      const random = () => {
        seed = (seed * 48271) % 2147483647;
        return seed / 2147483647;
      };
      const originalPlayers = state.players;
      const player = {
        name: "Chronos",
        cards: [
          { value: 10, suit: "hearts" },
          { value: 9, suit: "hearts" },
        ],
      };
      state.players = [
        player,
        { name: "Owl", folded: false, bet: 20, lastAction: "raise" },
        { name: "Ace", folded: false, bet: 20, lastAction: "call" },
        { name: "Momo", folded: false, bet: 20, lastAction: "call" },
      ];
      const board = [
        { value: 14, suit: "hearts" },
        { value: 13, suit: "hearts" },
        { value: 12, suit: "hearts" },
        { value: 11, suit: "hearts" },
        { value: 2, suit: "clubs" },
      ];
      const estimate = window.BossEquityEngineV1.estimate(player, {
        board,
        opponentCount: 3,
        samples: 120,
        random,
      });
      state.players = originalPlayers;
      return estimate;
    });

    expect(result.method).toBe("joint-multiway-monte-carlo");
    expect(result.opponentCount).toBe(3);
    expect(result.samples).toBe(120);
    expect(result.equity).toBe(1);
    expect(result.rangeConditioned).toBe(true);
    expect(result.rangeSummaries).toHaveLength(3);
  });

  test("active opponent count uses only public non-folded seats", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalPlayers = state.players;
      const boss = { name: "Oracle", cards: [{ value: 14, suit: "spades" }, { value: 14, suit: "clubs" }] };
      state.players = [boss, { folded: false }, { folded: true }, { folded: false }];
      const count = window.BossEquityEngineV1.activeOpponentCount(boss);
      state.players = originalPlayers;
      return count;
    });
    expect(result).toBe(2);
  });

  test("fair policy excludes hidden cards, deck order and future answers", async ({ page }) => {
    const policy = await page.evaluate(() => window.BossEquityEngineV1.fairInformationPolicy);
    expect(policy.ownHoleCards).toBe(true);
    expect(policy.publicBoard).toBe(true);
    expect(policy.publicActivePlayerCount).toBe(true);
    expect(policy.publicActions).toBe(true);
    expect(policy.publicBetSizes).toBe(true);
    expect(policy.hiddenOpponentCards).toBe(false);
    expect(policy.actualDeckOrder).toBe(false);
    expect(policy.futureBoardAnswer).toBe(false);
    expect(policy.predeterminedWinner).toBe(false);
  });
});
