import { expect, test } from "@playwright/test";

test.describe("AI V2.1 postflop texture decision integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.AiBoardTextureEngineV1?.version || "")).toBe("1.0.1");
    await expect.poll(() => page.evaluate(() => window.AiPostflopTexturePolicyV1?.version || "")).toBe("1.0.0");
  });

  test("allows more low-cost bluff pressure on a dry heads-up board", async ({ page }) => {
    const result = await page.evaluate(() => {
      const texture = window.AiBoardTextureEngineV1.analyze([
        { value: 14, suit: "s" },
        { value: 7, suit: "d" },
        { value: 2, suit: "c" },
      ]);
      return window.AiPostflopTexturePolicyV1.adjust({
        texture,
        strength: 0.38,
        drawPotential: 0,
        activeOpponents: 1,
        amountToCall: 0,
      });
    });

    expect(result.tags).toContain("dry-policy");
    expect(result.bluffMultiplier).toBeGreaterThan(1);
    expect(result.aggressionMultiplier).toBeGreaterThan(1);
  });

  test("reduces unsupported bluffing on a wet dynamic board", async ({ page }) => {
    const result = await page.evaluate(() => {
      const texture = window.AiBoardTextureEngineV1.analyze([
        { value: 11, suit: "s" },
        { value: 10, suit: "s" },
        { value: 9, suit: "d" },
      ]);
      return window.AiPostflopTexturePolicyV1.adjust({
        texture,
        strength: 0.4,
        drawPotential: 0,
        activeOpponents: 1,
        amountToCall: 80,
      });
    });

    expect(result.tags).toContain("dynamic-policy");
    expect(result.bluffMultiplier).toBeLessThan(1);
    expect(result.aggressionMultiplier).toBeLessThan(1);
    expect(result.callMarginDelta).toBeLessThan(0);
  });

  test("adds protection pressure for strong made hands on wet boards", async ({ page }) => {
    const result = await page.evaluate(() => {
      const texture = window.AiBoardTextureEngineV1.analyze([
        { value: 8, suit: "h" },
        { value: 7, suit: "h" },
        { value: 6, suit: "h" },
      ]);
      return window.AiPostflopTexturePolicyV1.adjust({
        texture,
        strength: 0.82,
        drawPotential: 0,
        activeOpponents: 1,
        amountToCall: 0,
      });
    });

    expect(result.protectionPressure).toBeGreaterThan(0);
    expect(result.strengthDelta).toBeGreaterThan(0);
    expect(result.aggressionMultiplier).toBeGreaterThan(1);
  });

  test("tightens bluffing and aggression further in multiway pots", async ({ page }) => {
    const values = await page.evaluate(() => {
      const texture = window.AiBoardTextureEngineV1.analyze([
        { value: 11, suit: "s" },
        { value: 10, suit: "s" },
        { value: 9, suit: "d" },
      ]);
      const base = {
        texture,
        strength: 0.45,
        drawPotential: 0.1,
        amountToCall: 40,
      };
      return {
        headsUp: window.AiPostflopTexturePolicyV1.adjust({ ...base, activeOpponents: 1 }),
        multiway: window.AiPostflopTexturePolicyV1.adjust({ ...base, activeOpponents: 4 }),
      };
    });

    expect(values.multiway.tags).toContain("multiway-policy");
    expect(values.multiway.bluffMultiplier).toBeLessThan(values.headsUp.bluffMultiplier);
    expect(values.multiway.aggressionMultiplier).toBeLessThan(values.headsUp.aggressionMultiplier);
    expect(values.multiway.callMarginDelta).toBeLessThan(values.headsUp.callMarginDelta);
  });

  test("uses only public board and caller-supplied decision context", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalState = window.state;
      window.state = new Proxy({}, {
        get() {
          throw new Error("Texture policy must not read global game state");
        },
      });
      try {
        const texture = window.AiBoardTextureEngineV1.analyze([
          { value: 13, suit: "c" },
          { value: 13, suit: "d" },
          { value: 4, suit: "s" },
        ]);
        return {
          adjustment: window.AiPostflopTexturePolicyV1.adjust({
            texture,
            strength: 0.7,
            drawPotential: 0,
            activeOpponents: 2,
            amountToCall: 20,
          }),
          policy: window.AiPostflopTexturePolicyV1.fairInformationPolicy,
        };
      } finally {
        window.state = originalState;
      }
    });

    expect(result.adjustment.publicInformationOnly).toBe(true);
    expect(result.policy.publicBoard).toBe(true);
    expect(result.policy.publicActions).toBe(true);
    expect(result.policy.hiddenOpponentCards).toBe(false);
    expect(result.policy.actualDeckOrder).toBe(false);
    expect(result.policy.futureBoardAnswer).toBe(false);
    expect(result.policy.predeterminedWinner).toBe(false);
  });
});
