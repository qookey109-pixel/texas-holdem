import { expect, test } from "@playwright/test";

test.describe("AI V2.7 tiered multiway equity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => (
      window.AiTieredMultiwayEquityV27?.version || ""
    ))).toBe("2.7.0");
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.dataset.aiTieredMultiwayEquity || ""
    ))).toBe("ready");
  });

  test("only middle and elite tiers are supported with bounded sample counts", async ({ page }) => {
    const result = await page.evaluate(() => {
      const api = window.AiTieredMultiwayEquityV27;
      return {
        version: api.version,
        supported: {
          Ace: api.supports("Ace"),
          Unit9: api.supports("Unit-9"),
          Leo: api.supports("Leo"),
          Oracle: api.supports("Oracle"),
          Gemini: api.supports("Gemini"),
        },
        tiers: {
          Ace: api.tierFor("Ace"),
          Unit9: api.tierFor("Unit-9"),
        },
        samples: {
          middleFlopShort: api.samplesFor("middle", "flop", 2),
          middleRiverLarge: api.samplesFor("middle", "river", 6),
          eliteFlopShort: api.samplesFor("elite", "flop", 2),
          eliteRiverShort: api.samplesFor("elite", "river", 2),
          eliteTurnLarge: api.samplesFor("elite", "turn", 6),
        },
        policy: api.fairInformationPolicy,
      };
    });

    expect(result.version).toBe("2.7.0");
    expect(result.supported).toEqual({
      Ace: true,
      Unit9: true,
      Leo: false,
      Oracle: false,
      Gemini: false,
    });
    expect(result.tiers).toEqual({ Ace: "middle", Unit9: "elite" });
    expect(result.samples).toEqual({
      middleFlopShort: 72,
      middleRiverLarge: 80,
      eliteFlopShort: 144,
      eliteRiverShort: 240,
      eliteTurnLarge: 112,
    });
    expect(result.samples.middleFlopShort).toBeLessThan(result.samples.eliteFlopShort);
    expect(result.samples.eliteRiverShort).toBeLessThan(360);
    expect(result.policy.hiddenOpponentCards).toBe(false);
    expect(result.policy.actualDeckOrder).toBe(false);
    expect(result.policy.futureBoardAnswer).toBe(false);
  });

  test("same public state is deterministic and never reads opponent cards or actual deck order", async ({ page }) => {
    const result = await page.evaluate(() => {
      const original = {
        players: state.players,
        board: state.board,
        pot: state.pot,
        currentBet: state.currentBet,
        handNumber: state.handNumber,
        deckDescriptor: Object.getOwnPropertyDescriptor(state, "deck"),
      };
      const actor = {
        name: "Unit-9",
        position: 1,
        cards: [{ value: 14, suit: "s" }, { value: 12, suit: "s" }],
        stack: 1800,
        bet: 80,
        folded: false,
        lastAction: "call",
      };
      const publicOpponent = (name, position, action) => {
        const opponent = {
          name,
          position,
          stack: 1600,
          bet: 80,
          totalContribution: 140,
          folded: false,
          lastAction: action,
        };
        Object.defineProperty(opponent, "cards", {
          configurable: true,
          get() {
            throw new Error("hidden opponent cards were read");
          },
        });
        return opponent;
      };

      try {
        state.players = [
          actor,
          publicOpponent("Owl", 0, "raise"),
          publicOpponent("Ace", 2, "call"),
          publicOpponent("Momo", 3, "call"),
        ];
        state.board = [
          { value: 12, suit: "h" },
          { value: 8, suit: "d" },
          { value: 4, suit: "c" },
          { value: 2, suit: "s" },
        ];
        state.pot = 520;
        state.currentBet = 80;
        state.handNumber = 17;
        Object.defineProperty(state, "deck", {
          configurable: true,
          get() {
            throw new Error("actual state.deck was read");
          },
          set() {},
        });

        const first = window.AiTieredMultiwayEquityV27.estimate(actor, { baseEquity: 0.61 });
        const second = window.AiTieredMultiwayEquityV27.estimate(actor, { baseEquity: 0.61 });
        return { first, second };
      } finally {
        state.players = original.players;
        state.board = original.board;
        state.pot = original.pot;
        state.currentBet = original.currentBet;
        state.handNumber = original.handNumber;
        if (original.deckDescriptor) Object.defineProperty(state, "deck", original.deckDescriptor);
      }
    });

    expect(result.first.applied).toBe(true);
    expect(result.first.method).toBe("joint-multiway-monte-carlo");
    expect(result.first.opponentCount).toBe(3);
    expect(result.first.samples).toBe(152);
    expect(result.first.seed).toBe(result.second.seed);
    expect(result.first.rawEquity).toBe(result.second.rawEquity);
    expect(result.first.equity).toBe(result.second.equity);
    expect(result.first.raiseCalledEquity).toBe(result.second.raiseCalledEquity);
  });

  test("stronger holdings retain more equity and additional opponents reduce realization", async ({ page }) => {
    const result = await page.evaluate(() => {
      const original = {
        players: state.players,
        board: state.board,
        pot: state.pot,
        currentBet: state.currentBet,
        handNumber: state.handNumber,
      };
      const actor = {
        name: "Unit-9",
        position: 1,
        cards: [],
        stack: 2000,
        bet: 60,
        folded: false,
        lastAction: "call",
      };
      const opponents = Array.from({ length: 5 }, (_, index) => ({
        name: index === 0 ? "Owl" : `Public-${index}`,
        position: index + 2,
        stack: 1800,
        bet: 60,
        folded: false,
        lastAction: index === 0 ? "raise" : "call",
      }));

      try {
        state.board = [
          { value: 13, suit: "h" },
          { value: 13, suit: "d" },
          { value: 7, suit: "c" },
          { value: 4, suit: "s" },
          { value: 2, suit: "h" },
        ];
        state.pot = 480;
        state.currentBet = 60;
        state.handNumber = 21;

        actor.cards = [{ value: 14, suit: "s" }, { value: 14, suit: "c" }];
        state.players = [actor, ...opponents.slice(0, 2)];
        const strongTwo = window.AiTieredMultiwayEquityV27.estimate(actor, {
          baseEquity: 0.72,
          rangeModel: false,
        });

        state.players = [actor, ...opponents];
        const strongFive = window.AiTieredMultiwayEquityV27.estimate(actor, {
          baseEquity: 0.72,
          rangeModel: false,
        });

        actor.cards = [{ value: 8, suit: "s" }, { value: 6, suit: "s" }];
        state.players = [actor, ...opponents.slice(0, 2)];
        const weakTwo = window.AiTieredMultiwayEquityV27.estimate(actor, {
          baseEquity: 0.36,
          rangeModel: false,
        });

        return { strongTwo, strongFive, weakTwo };
      } finally {
        state.players = original.players;
        state.board = original.board;
        state.pot = original.pot;
        state.currentBet = original.currentBet;
        state.handNumber = original.handNumber;
      }
    });

    expect(result.strongTwo.applied).toBe(true);
    expect(result.strongFive.applied).toBe(true);
    expect(result.weakTwo.applied).toBe(true);
    expect(result.strongTwo.rawEquity).toBeGreaterThan(result.weakTwo.rawEquity);
    expect(result.strongTwo.rawEquity).toBeGreaterThan(result.strongFive.rawEquity);
    expect(result.strongTwo.samples).toBe(240);
    expect(result.strongFive.samples).toBe(144);
  });

  test("negative multiway call equity tightens a middle-tier call without creating a new raise", async ({ page }) => {
    const result = await page.evaluate(() => {
      const original = {
        players: state.players,
        board: state.board,
        pot: state.pot,
        currentBet: state.currentBet,
        handNumber: state.handNumber,
      };
      const actor = {
        name: "Dodo",
        position: 1,
        cards: [{ value: 8, suit: "s" }, { value: 6, suit: "s" }],
        stack: 1200,
        bet: 0,
        folded: false,
        lastAction: "check",
      };

      try {
        state.players = [
          actor,
          { name: "Owl", isHuman: true, position: 0, stack: 1200, bet: 120, folded: false, lastAction: "raise" },
          { name: "Ace", position: 2, stack: 1200, bet: 120, folded: false, lastAction: "call" },
          { name: "Momo", position: 3, stack: 1200, bet: 120, folded: false, lastAction: "call" },
        ];
        state.board = [
          { value: 13, suit: "h" },
          { value: 13, suit: "d" },
          { value: 7, suit: "c" },
          { value: 4, suit: "s" },
          { value: 2, suit: "h" },
        ];
        state.pot = 120;
        state.currentBet = 120;
        state.handNumber = 22;

        const decision = {
          action: "call",
          raiseBy: 0,
          sizeFraction: 0,
          callScore: 0.04,
          raiseScore: -0.2,
          bluffing: false,
          valueReady: false,
          rangeDecisionIntegrated: true,
          equityProxy: 0.42,
          candidates: [],
          context: {
            name: "Dodo",
            street: "river",
            needed: 120,
            pot: 120,
            potOdds: 0.5,
            equityProxy: 0.42,
            drawPotential: 0,
          },
        };
        return window.AiTieredMultiwayEquityV27.enhanceDecision(actor, decision, {
          rangeModel: false,
        });
      } finally {
        state.players = original.players;
        state.board = original.board;
        state.pot = original.pot;
        state.currentBet = original.currentBet;
        state.handNumber = original.handNumber;
      }
    });

    expect(result.tieredMultiwayEquityIntegrated).toBe(true);
    expect(result.tieredMultiwayEquityTier).toBe("middle");
    expect(result.action).toBe("fold");
    expect(result.raiseBy).toBe(0);
    expect(result.tieredEquityAdjustment).toBe("multiway-tighten-negative-call");
    expect(result.tieredMultiwayEquityResult.equityAdjustment).toBeGreaterThanOrEqual(-0.065);
  });

  test("the existing EV entry point receives V2.7 equity before repricing candidates", async ({ page }) => {
    const result = await page.evaluate(() => {
      const original = {
        players: state.players,
        board: state.board,
        pot: state.pot,
        currentBet: state.currentBet,
        handNumber: state.handNumber,
      };
      const actor = {
        name: "Nova",
        position: 1,
        cards: [{ value: 12, suit: "s" }, { value: 12, suit: "c" }],
        stack: 1800,
        bet: 60,
        folded: false,
        lastAction: "call",
      };

      try {
        state.players = [
          actor,
          { name: "Owl", isHuman: true, position: 0, stack: 1600, bet: 120, folded: false, lastAction: "raise" },
          { name: "Ace", position: 2, stack: 1700, bet: 120, folded: false, lastAction: "call" },
          { name: "Momo", position: 3, stack: 1500, bet: 120, folded: false, lastAction: "call" },
        ];
        state.board = [
          { value: 12, suit: "h" },
          { value: 9, suit: "d" },
          { value: 4, suit: "c" },
          { value: 2, suit: "s" },
        ];
        state.pot = 620;
        state.currentBet = 120;
        state.handNumber = 23;

        const decision = {
          action: "raise",
          raiseBy: 300,
          sizeFraction: 0.5,
          reason: "test",
          callScore: 0.2,
          raiseScore: 0.3,
          bluffing: false,
          valueReady: true,
          rangeDecisionIntegrated: true,
          rangeDecisionTier: "elite",
          equityProxy: 0.72,
          candidates: [
            { fraction: 0.5, raiseBy: 300, foldEquity: 0.24, calledBy: 2, ev: 1 },
            { fraction: 0.75, raiseBy: 460, foldEquity: 0.31, calledBy: 1, ev: 2 },
          ],
          context: {
            name: "Nova",
            street: "turn",
            needed: 60,
            pot: 620,
            potOdds: 60 / 680,
            equityProxy: 0.72,
            drawPotential: 0,
          },
        };
        return window.AiEvAccountingV1.repriceStrategyDecision(decision);
      } finally {
        state.players = original.players;
        state.board = original.board;
        state.pot = original.pot;
        state.currentBet = original.currentBet;
        state.handNumber = original.handNumber;
      }
    });

    expect(result.tieredMultiwayEquityIntegrated).toBe(true);
    expect(result.tieredMultiwayEquityVersion).toBe("2.7.0");
    expect(result.evAccountingVersion).toBeTruthy();
    expect(result.candidates.length).toBe(2);
    expect(result.candidates.every(candidate => candidate.tieredRaiseCalledEquity)).toBe(true);
    expect(result.candidates.every(candidate => Number.isFinite(candidate.ev))).toBe(true);
    expect(result.context.legacyEquityProxy).toBe(0.72);
    expect(result.context.tieredMultiwayOpponentCount).toBe(3);
  });
});