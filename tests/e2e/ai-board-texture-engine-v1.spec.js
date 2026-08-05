import { expect, test } from "@playwright/test";

test.describe("AI V2.1 board texture foundation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await page.addScriptTag({ path: "js/ai-board-texture-engine-v1.js" });
    await expect.poll(() => page.evaluate(() => window.AiBoardTextureEngineV1?.version || "")).toBe("1.0.1");
  });

  test("classifies A-7-2 rainbow as dry and static", async ({ page }) => {
    const result = await page.evaluate(() => window.AiBoardTextureEngineV1.analyze([
      { value: 14, suit: "spades" },
      { value: 7, suit: "diamonds" },
      { value: 2, suit: "clubs" },
    ]));

    expect(result.textureTags).toContain("dry");
    expect(result.textureTags).toContain("static");
    expect(result.flushThreat).toBe(0);
    expect(result.pairedLevel).toBe(0);
    expect(result.dryness).toBeGreaterThan(result.wetness);
  });

  test("classifies J-T-9 two-tone as connected and highly dynamic", async ({ page }) => {
    const result = await page.evaluate(() => window.AiBoardTextureEngineV1.analyze([
      { value: "J", suit: "spades" },
      { value: "T", suit: "spades" },
      { value: 9, suit: "diamonds" },
    ]));

    expect(result.textureTags).toContain("two-tone");
    expect(result.textureTags).toContain("straight-dense");
    expect(result.textureTags).toContain("dynamic");
    expect(result.straightThreat).toBeGreaterThan(0.7);
    expect(result.wetness).toBeGreaterThan(result.dryness);
  });

  test("classifies K-K-4 as a paired static board", async ({ page }) => {
    const result = await page.evaluate(() => window.AiBoardTextureEngineV1.analyze([
      { value: 13, suit: "clubs" },
      { value: 13, suit: "diamonds" },
      { value: 4, suit: "spades" },
    ]));

    expect(result.pairedLevel).toBe(1);
    expect(result.textureTags).toContain("paired");
    expect(result.textureTags).toContain("static");
    expect(result.nutVolatility).toBeLessThan(0.58);
  });

  test("classifies 8-7-6 monotone as wet, straight-dense and three-flush", async ({ page }) => {
    const result = await page.evaluate(() => window.AiBoardTextureEngineV1.analyze([
      { value: 8, suit: "♥" },
      { value: 7, suit: "♥" },
      { value: 6, suit: "♥" },
    ]));

    expect(result.textureTags).toContain("wet");
    expect(result.textureTags).toContain("three-flush");
    expect(result.textureTags).toContain("straight-dense");
    expect(result.flushThreat).toBeGreaterThan(0.6);
    expect(result.straightThreat).toBeGreaterThan(0.7);
  });

  test("uses only the supplied public board and exposes the fair-information boundary", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalState = window.state;
      window.state = new Proxy({}, {
        get() {
          throw new Error("Board texture engine must not read game state");
        },
      });
      try {
        return {
          texture: window.AiBoardTextureEngineV1.analyze([
            { value: 14, suit: "h" },
            { value: 9, suit: "d" },
            { value: 3, suit: "c" },
          ]),
          policy: window.AiBoardTextureEngineV1.fairInformationPolicy,
        };
      } finally {
        window.state = originalState;
      }
    });

    expect(result.texture.publicInformationOnly).toBe(true);
    expect(result.policy.publicBoard).toBe(true);
    expect(result.policy.hiddenOpponentCards).toBe(false);
    expect(result.policy.playerHoleCards).toBe(false);
    expect(result.policy.actualDeckOrder).toBe(false);
    expect(result.policy.futureBoardAnswer).toBe(false);
    expect(result.policy.predeterminedWinner).toBe(false);
  });
});
