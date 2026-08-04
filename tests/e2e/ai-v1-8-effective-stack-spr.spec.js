import { expect, test } from "@playwright/test";

test.describe("AI V1.8 effective stack and SPR", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.AiEffectiveStackSprV1?.version || "")).toBe("1.0.0");
  });

  test("effective stack uses the shorter public contestable stack", async ({ page }) => {
    const result = await page.evaluate(() => {
      const actor = { name: "Ace", stack: 900, bet: 100, folded: false };
      const shortOpponent = { name: "Owl", stack: 200, bet: 100, folded: false };
      return window.AiEffectiveStackSprV1.effectiveStackContext(actor, {
        pot: 400,
        needed: 0,
        bigBlind: 20,
        opponents: [shortOpponent],
      });
    });

    expect(result.effectiveTotal).toBe(300);
    expect(result.effectiveBehind).toBe(200);
    expect(result.effectiveStackInBigBlinds).toBe(10);
    expect(result.effectiveSpr).toBeCloseTo(0.5, 8);
    expect(result.sprBand).toBe("shallow");
  });

  test("a deep opponent produces a deep SPR band", async ({ page }) => {
    const result = await page.evaluate(() => {
      const actor = { name: "Vlad", stack: 2000, bet: 0, folded: false };
      const opponent = { name: "Owl", stack: 1800, bet: 0, folded: false };
      return window.AiEffectiveStackSprV1.effectiveStackContext(actor, {
        pot: 150,
        needed: 0,
        bigBlind: 20,
        opponents: [opponent],
      });
    });

    expect(result.effectiveBehind).toBe(1800);
    expect(result.effectiveSpr).toBe(12);
    expect(result.sprBand).toBe("deep");
  });

  test("blind and multiway factors affect baseline but not exploit adjustment", async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = { name: "Unit-9" };
      const profile = {
        observedHands: 8,
        jamHands: 6,
        weightedJamRate: 0.74,
        consecutiveJams: 4,
      };
      const headsUp = {
        effectiveRiskInBigBlinds: 14,
        potOdds: 0.38,
        blindVsBlind: false,
        otherContenders: 0,
      };
      const blindMultiway = {
        ...headsUp,
        blindVsBlind: true,
        otherContenders: 2,
      };
      return {
        baselineHeadsUp: window.AiEffectiveStackSprV1.environmentBaseline(player, headsUp),
        baselineBlindMultiway: window.AiEffectiveStackSprV1.environmentBaseline(player, blindMultiway),
        adjustmentHeadsUp: window.AiEffectiveStackSprV1.exploitAdjustment(player, profile),
        adjustmentBlindMultiway: window.AiEffectiveStackSprV1.exploitAdjustment(player, profile),
      };
    });

    expect(result.baselineBlindMultiway).not.toBe(result.baselineHeadsUp);
    expect(result.adjustmentBlindMultiway).toBe(result.adjustmentHeadsUp);
  });

  test("unified All-in plan exposes effective stack and one adjustment chain", async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = { name: "Unit-9", stack: 500, bet: 0, cards: [{ value: 14, suit: "spades" }, { value: 10, suit: "hearts" }] };
      const hero = { name: "Owl", isHuman: true, stack: 0, bet: 300, folded: false };
      const context = {
        needed: 300,
        bigBlind: 20,
        pot: 420,
        potOdds: 300 / 720,
        riskInBigBlinds: 15,
        activePlayers: 2,
        otherContenders: 0,
        headsUp: true,
        blindVsBlind: false,
        playerPosition: "BTN",
        heroPosition: "BB",
      };
      const originalPlayers = state.players;
      state.players = [hero, player];
      const decision = window.AiEffectiveStackSprV1.planDefense(player, {
        context,
        profile: { observedHands: 8, jamHands: 6, weightedJamRate: 0.8, consecutiveJams: 4 },
        hand: { code: "ATo", score: 0.7 },
        random: () => 0,
      });
      state.players = originalPlayers;
      return decision;
    });

    expect(result.singleAdjustmentChain).toBe(true);
    expect(result.context.effectiveBehind).toBe(300);
    expect(result.context.effectiveRiskInBigBlinds).toBe(15);
    expect(result.adjustment).toBeGreaterThan(0);
    expect(result.adjustedThreshold).toBeLessThan(result.baselineThreshold);
  });

  test("strategy entrypoint is patched with public effective SPR", async ({ page }) => {
    const status = await page.evaluate(() => ({
      patched: Boolean(window.AiCharacterStrategies?.__effectiveStackSprPatched),
      version: window.AiCharacterStrategies?.effectiveStackSprVersion || "",
      dataset: document.documentElement.dataset.aiEffectiveStackSpr || "",
      hiddenCards: window.AiEffectiveStackSprV1.fairInformationPolicy.hiddenOpponentCards,
    }));

    expect(status.patched).toBe(true);
    expect(status.version).toBe("1.0.0");
    expect(status.dataset).toBe("ready");
    expect(status.hiddenCards).toBe(false);
  });
});
