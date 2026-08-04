import { expect, test } from "@playwright/test";

test.describe("Boss public range-conditioned equity V1", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.BossPublicRangeModelV1?.version || "")).toBe("1.0.0");
    await expect.poll(() => page.evaluate(() => window.BossEquityEngineV1?.version || "")).toBe("1.1.0");
    await expect.poll(() => page.evaluate(() => window.BossEquityIntegrationV1?.version || "")).toBe("1.1.0");
  });

  test("large river aggression creates a polarized range with a non-zero bluff tail", async ({ page }) => {
    const result = await page.evaluate(() => {
      const deck = createDeck();
      const board = [
        { value: 14, suit: "clubs" },
        { value: 13, suit: "clubs" },
        { value: 8, suit: "spades" },
        { value: 4, suit: "diamonds" },
        { value: 2, suit: "hearts" },
      ];
      const model = window.BossPublicRangeModelV1;
      const records = model.buildComboRecords(deck.filter(card => !board.some(known => model.cardKey(known) === model.cardKey(card))), board);
      const aggressive = {
        street: "river",
        rangeStrength: 0.67,
        rangeWidth: 0.35,
        nutDensity: 0.28,
        aggressiveThisStreet: true,
        callingLine: false,
        latestAction: "raise",
        latestSizeFraction: 0.75,
      };
      const checked = {
        ...aggressive,
        rangeStrength: 0.42,
        rangeWidth: 0.62,
        aggressiveThisStreet: false,
        latestAction: "check",
        latestSizeFraction: 0,
      };
      return {
        aggressive: model.distributionSummary(records, aggressive),
        checked: model.distributionSummary(records, checked),
      };
    });

    expect(result.aggressive.averagePercentile).toBeGreaterThan(result.checked.averagePercentile);
    expect(result.aggressive.topQuartileMass).toBeGreaterThan(result.checked.topQuartileMass);
    expect(result.aggressive.bottomQuartileMass).toBeGreaterThan(0.01);
    expect(result.aggressive.raiseContinueMass).toBeGreaterThan(0.05);
    expect(result.aggressive.raiseContinueMass).toBeLessThan(0.95);
    expect(result.aggressive.publicInformationOnly).toBe(true);
  });

  test("river top pair calls the betting range but does not value-raise its stronger continue range", async ({ page }) => {
    const result = await page.evaluate(() => {
      const snapshot = {
        board: state.board,
        players: state.players,
        pot: state.pot,
        currentBet: state.currentBet,
        dealerIndex: state.dealerIndex,
      };
      const boss = {
        name: "Oracle",
        cards: [{ value: 14, suit: "hearts" }, { value: 9, suit: "diamonds" }],
        stack: 1200,
        bet: 0,
        folded: false,
        raiseLocked: false,
      };
      const opponent = {
        name: "Owl",
        isHuman: true,
        stack: 1000,
        bet: 110,
        folded: false,
        lastAction: "raise",
      };
      state.board = [
        { value: 14, suit: "clubs" },
        { value: 13, suit: "clubs" },
        { value: 8, suit: "spades" },
        { value: 4, suit: "diamonds" },
        { value: 2, suit: "hearts" },
      ];
      state.players = [boss, opponent];
      state.pot = 220;
      state.currentBet = 110;
      state.dealerIndex = 1;
      const conditioned = window.BossEquityEngineV1.estimate(boss, {
        board: state.board,
        opponentCount: 1,
        raisePressure: 0.65,
      });
      const uniform = window.BossEquityEngineV1.estimate(boss, {
        board: state.board,
        opponentCount: 1,
        rangeModel: false,
      });
      const decision = window.BossEquityIntegrationV1.decide(boss);
      Object.assign(state, snapshot);
      return { conditioned, uniform, decision };
    });

    expect(result.conditioned.method).toBe("exact-river-heads-up");
    expect(result.conditioned.combinations).toBe(990);
    expect(result.conditioned.rangeConditioned).toBe(true);
    expect(result.conditioned.rangeModelVersion).toBe("1.0.0");
    expect(result.uniform.rangeConditioned).toBe(false);
    expect(result.conditioned.equity).toBeLessThan(result.uniform.equity);
    expect(result.conditioned.equity).toBeLessThan(0.8);
    expect(result.conditioned.unweightedEquity).toBeCloseTo(result.uniform.equity, 10);
    expect(result.conditioned.raiseCalledEquity).toBeLessThan(result.conditioned.equity);
    expect(result.conditioned.rangeFoldEquity).toBeGreaterThan(0.05);
    expect(result.conditioned.rangeFoldEquity).toBeLessThan(0.95);
    expect(result.decision.action).toBe("call");
    expect(result.decision.raiseCalledEquity).toBeLessThan(result.decision.equity);
    expect(result.decision.raiseValue).toBe(false);
    expect(result.decision.raiseBy).toBe(0);
  });

  test("joint weighted sampling is reproducible and keeps all opponents in one deal", async ({ page }) => {
    const result = await page.evaluate(() => {
      function randomFactory(seed) {
        let value = seed >>> 0;
        return () => {
          value = (value * 1664525 + 1013904223) >>> 0;
          return value / 4294967296;
        };
      }
      const snapshot = { board: state.board, players: state.players, pot: state.pot, currentBet: state.currentBet };
      const boss = {
        name: "Chronos",
        cards: [{ value: 14, suit: "hearts" }, { value: 14, suit: "clubs" }],
        stack: 1200,
        bet: 0,
        folded: false,
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
      const options = { board: state.board, opponentCount: 3, samples: 96, raisePressure: 0.7 };
      const first = window.BossEquityEngineV1.estimate(boss, { ...options, random: randomFactory(2026) });
      const second = window.BossEquityEngineV1.estimate(boss, { ...options, random: randomFactory(2026) });
      Object.assign(state, snapshot);
      return { first, second };
    });

    expect(result.first.method).toBe("joint-multiway-monte-carlo");
    expect(result.first.opponentCount).toBe(3);
    expect(result.first.samples).toBe(96);
    expect(result.first.rangeConditioned).toBe(true);
    expect(result.first.rangeSummaries).toHaveLength(3);
    expect(result.first.equity).toBe(result.second.equity);
    expect(result.first.raiseCalledEquity).toBe(result.second.raiseCalledEquity);
    expect(result.first.rangeFoldEquity).toBe(result.second.rangeFoldEquity);
    expect(result.first.raiseCalledEquity).toBeGreaterThanOrEqual(0);
    expect(result.first.raiseCalledEquity).toBeLessThanOrEqual(1);
  });

  test("public range profiles never inspect hidden opponent cards", async ({ page }) => {
    const result = await page.evaluate(() => {
      const snapshot = { board: state.board, players: state.players, pot: state.pot, currentBet: state.currentBet };
      let hiddenRead = false;
      const boss = {
        name: "Oracle",
        cards: [{ value: 14, suit: "spades" }, { value: 13, suit: "hearts" }],
        stack: 1000,
        bet: 0,
        folded: false,
      };
      const opponent = {
        name: "Owl",
        isHuman: true,
        stack: 1000,
        bet: 60,
        folded: false,
        lastAction: "raise",
      };
      Object.defineProperty(opponent, "cards", {
        configurable: true,
        get() {
          hiddenRead = true;
          throw new Error("hidden cards must not be read");
        },
      });
      state.board = [
        { value: 10, suit: "clubs" },
        { value: 7, suit: "diamonds" },
        { value: 2, suit: "hearts" },
      ];
      state.players = [boss, opponent];
      state.pot = 120;
      state.currentBet = 60;
      const estimate = window.BossEquityEngineV1.estimate(boss, {
        board: state.board,
        opponentCount: 1,
        samples: 64,
        random: (() => {
          let seed = 17;
          return () => {
            seed = (seed * 48271) % 2147483647;
            return seed / 2147483647;
          };
        })(),
      });
      Object.assign(state, snapshot);
      return { hiddenRead, estimate };
    });

    expect(result.hiddenRead).toBe(false);
    expect(result.estimate.rangeConditioned).toBe(true);
    expect(result.estimate.samples).toBe(64);
  });
});
