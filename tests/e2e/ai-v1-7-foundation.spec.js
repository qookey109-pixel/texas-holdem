import { expect, test } from "@playwright/test";

function card(value, suit) {
  return { value, suit };
}

test.describe("AI V1.7 foundation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => typeof estimateStrength)).toBe("function");
  });

  test("pocket pairs increase continuously without tier jumps", async ({ page }) => {
    const scores = await page.evaluate(() => {
      const originalBoard = state.board;
      state.board = [];
      const score = value => estimateStrength({ cards: [{ value, suit: "spades" }, { value, suit: "hearts" }] });
      const result = [6, 7, 8, 9, 10, 11].map(value => score(value));
      state.board = originalBoard;
      return result;
    });

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeGreaterThan(scores[index - 1]);
      expect(scores[index] - scores[index - 1]).toBeLessThan(0.04);
    }
  });

  test("suited broadways and offsuit AK remain premium relative to small pairs", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalBoard = state.board;
      state.board = [];
      const strength = cards => estimateStrength({ cards });
      const output = {
        ajs: strength([{ value: 14, suit: "spades" }, { value: 11, suit: "spades" }]),
        ats: strength([{ value: 14, suit: "spades" }, { value: 10, suit: "spades" }]),
        kjs: strength([{ value: 13, suit: "hearts" }, { value: 11, suit: "hearts" }]),
        ako: strength([{ value: 14, suit: "spades" }, { value: 13, suit: "hearts" }]),
        pair22: strength([{ value: 2, suit: "spades" }, { value: 2, suit: "hearts" }]),
      };
      state.board = originalBoard;
      return output;
    });

    expect(result.ajs).toBeGreaterThan(0.86);
    expect(result.ats).toBeGreaterThan(0.82);
    expect(result.kjs).toBeGreaterThan(0.8);
    expect(result.ako).toBeGreaterThan(result.pair22);
  });

  test("postflop estimate distinguishes kicker quality and multiway pressure", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalBoard = state.board;
      const originalPlayers = state.players;
      state.board = [
        { value: 14, suit: "hearts" },
        { value: 7, suit: "diamonds" },
        { value: 2, suit: "clubs" },
      ];
      const strong = { cards: [{ value: 14, suit: "spades" }, { value: 13, suit: "clubs" }] };
      const weak = { cards: [{ value: 14, suit: "clubs" }, { value: 9, suit: "spades" }] };
      state.players = [strong, { folded: false }, { folded: true }];
      const headsUp = estimateStrength(strong);
      const weakKicker = estimateStrength(weak);
      state.players = [strong, { folded: false }, { folded: false }, { folded: false }];
      const multiway = estimateStrength(strong);
      state.board = originalBoard;
      state.players = originalPlayers;
      return { headsUp, weakKicker, multiway };
    });

    expect(result.headsUp).toBeGreaterThan(result.weakKicker);
    expect(result.multiway).toBeLessThan(result.headsUp);
  });

  test("beginner sizing pool is pot-relative and independent of hand strength", async ({ page }) => {
    const fractions = await page.evaluate(() => {
      const originalRandom = Math.random;
      const values = [0, 0.5, 0.999].map(value => {
        Math.random = () => value;
        return beginnerRaiseFraction();
      });
      Math.random = originalRandom;
      return values;
    });

    expect(fractions).toEqual([0.45, 0.7, 1]);
  });
});
