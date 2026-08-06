import { expect, test } from "@playwright/test";

test.describe("AI V2.9.3 middle and elite preflop recovery", () => {
  test("restores a public preflop strength proxy before the V2.8 EV guard", async ({ page }) => {
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
      const player = {
        name: "Nori",
        stack: 1800,
        bet: 20,
        raiseLocked: false,
        cards: [
          { value: 14, suit: "spades" },
          { value: 14, suit: "hearts" },
        ],
      };
      const baseDecision = {
        action: "call",
        raiseBy: 0,
        sizeFraction: 0,
        hand: { score: 0.84, pair: true },
        valueReady: true,
        bluffing: false,
        context: {
          street: "preflop",
          pot: 120,
          needed: 20,
          drawPotential: 0,
          spr: 8,
        },
        candidates: [],
      };

      const recovered = window.AiMidElitePreflopRecoveryV293.recoverDecision(
        player,
        baseDecision,
      );
      const enhanced = window.AiTierStrategyV28.enhanceTierDecision(
        player,
        recovered,
        { random: () => 0.5 },
      );
      const postflop = window.AiMidElitePreflopRecoveryV293.recoverDecision(
        player,
        {
          action: "call",
          equityProxy: 0.47,
          context: { street: "turn", equityProxy: 0.47 },
        },
      );

      return {
        chainPatched: Boolean(
          window.AiMidEliteDecisionChainV27?.__aiMidElitePreflopRecoveryV293Patched,
        ),
        proxy: recovered.equityProxy,
        contextProxy: recovered.context.equityProxy,
        source: recovered.preflopEquityProxySource,
        recoveryVersion: recovered.preflopRecoveryVersion,
        action: enhanced.action,
        adjustment: enhanced.v28Adjustment || "",
        publicInformationOnly: enhanced.publicInformationOnly,
        postflopProxy: postflop.equityProxy,
        hiddenCardsAllowed: window.AiMidElitePreflopRecoveryV293
          .fairInformationPolicy.hiddenOpponentCards,
        futureBoardAllowed: window.AiMidElitePreflopRecoveryV293
          .fairInformationPolicy.futureBoardAnswer,
      };
    });

    expect(result.chainPatched).toBe(true);
    expect(result.proxy).toBeCloseTo(0.84, 6);
    expect(result.contextProxy).toBeCloseTo(0.84, 6);
    expect(result.source).toBe("decision");
    expect(result.recoveryVersion).toBe("2.9.3");
    expect(result.action).toBe("call");
    expect(result.adjustment).not.toBe("negative-call-guard");
    expect(result.publicInformationOnly).toBe(true);
    expect(result.postflopProxy).toBeCloseTo(0.47, 6);
    expect(result.hiddenCardsAllowed).toBe(false);
    expect(result.futureBoardAllowed).toBe(false);
  });
});
