import { expect, test } from "@playwright/test";

test.describe("AI V2.9.3 middle and elite preflop recovery", () => {
  test("delegates preflop to the existing position and range chain", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiMidElitePreflopRecoveryV293?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.3");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiMidElitePreflopRecoveryV293 || ""),
      { timeout: 15_000 },
    ).toBe("ready");

    const result = await page.evaluate(() => {
      const previous = {
        board: state.board,
        street: state.street,
      };
      const middle = {
        name: "Nori",
        stack: 1800,
        bet: 20,
        raiseLocked: false,
        cards: [
          { value: 14, suit: "spades" },
          { value: 14, suit: "hearts" },
        ],
      };
      const elite = {
        ...middle,
        name: "Nova",
      };

      try {
        state.board = [];
        state.street = "翻牌前";
        const middleDecision = window.AiMidEliteDecisionChainV27.composeDecision(middle);
        const eliteDecision = window.AiMidEliteDecisionChainV27.composeDecision(elite);
        const openingDelegates = window.AiMidElitePreflopRecoveryV293.shouldDelegate({
          ...middle,
          name: "Shark",
        });

        state.board = [
          { value: 13, suit: "diamonds" },
          { value: 9, suit: "spades" },
          { value: 6, suit: "clubs" },
        ];
        state.street = "翻牌";

        return {
          chainPatched: Boolean(
            window.AiMidEliteDecisionChainV27?.__aiMidElitePreflopRecoveryV293Patched,
          ),
          middleDecision,
          eliteDecision,
          openingDelegates,
          postflopDelegates: window.AiMidElitePreflopRecoveryV293.shouldDelegate(middle),
          hiddenCardsAllowed: window.AiMidElitePreflopRecoveryV293
            .fairInformationPolicy.hiddenOpponentCards,
          futureBoardAllowed: window.AiMidElitePreflopRecoveryV293
            .fairInformationPolicy.futureBoardAnswer,
        };
      } finally {
        state.board = previous.board;
        state.street = previous.street;
      }
    });

    expect(result.chainPatched).toBe(true);
    expect(result.middleDecision).toMatchObject({
      action: "fallback",
      reason: "v2-9-3-preflop-delegate",
      tier: "middle",
      preflopRecoveryVersion: "2.9.3",
      publicInformationOnly: true,
    });
    expect(result.eliteDecision).toMatchObject({
      action: "fallback",
      reason: "v2-9-3-preflop-delegate",
      tier: "elite",
      preflopRecoveryVersion: "2.9.3",
      publicInformationOnly: true,
    });
    expect(result.openingDelegates).toBe(false);
    expect(result.postflopDelegates).toBe(false);
    expect(result.hiddenCardsAllowed).toBe(false);
    expect(result.futureBoardAllowed).toBe(false);
  });
});
