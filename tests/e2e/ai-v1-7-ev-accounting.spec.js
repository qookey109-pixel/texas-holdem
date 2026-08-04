import { expect, test } from "@playwright/test";

test.describe("AI V1.7 net EV accounting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.AiEvAccountingV1?.version || "")).toBe("1.0.0");
  });

  test("call EV subtracts the full call investment", async ({ page }) => {
    const result = await page.evaluate(() => window.AiEvAccountingV1.callEv({
      equity: 0.4,
      pot: 100,
      callAmount: 50,
    }));
    expect(result).toBeCloseTo(10, 8);
  });

  test("showdown EV subtracts the full new investment", async ({ page }) => {
    const result = await page.evaluate(() => window.AiEvAccountingV1.showdownEv({
      equity: 0.5,
      finalPot: 220,
      investment: 80,
    }));
    expect(result).toBeCloseTo(30, 8);
  });

  test("raise EV combines immediate folds with corrected called EV", async ({ page }) => {
    const result = await page.evaluate(() => window.AiEvAccountingV1.raiseEv({
      equity: 0.35,
      pot: 100,
      callAmount: 20,
      raiseBy: 60,
      foldEquity: 0.4,
    }));
    // investment=80, finalPot=180, calledEV=-17, totalEV=40 + 0.6*(-17)=29.8
    expect(result).toBeCloseTo(29.8, 8);
  });

  test("negative corrected raise EV downgrades to call or fold", async ({ page }) => {
    const decision = await page.evaluate(() => window.AiEvAccountingV1.repriceStrategyDecision({
      action: "raise",
      raiseBy: 100,
      sizeFraction: 1,
      equityProxy: 0.2,
      reason: "legacy raise",
      context: { pot: 100, needed: 40, equityProxy: 0.2 },
      candidates: [{ fraction: 1, raiseBy: 100, foldEquity: 0.05, ev: 20 }],
    }));
    expect(decision.action).toBe("fold");
    expect(decision.raiseBy).toBe(0);
    expect(decision.evAccountingVersion).toBe("1.0.0");
    expect(decision.candidates[0].legacyEv).toBe(20);
    expect(decision.candidates[0].ev).toBeLessThan(0);
  });

  test("middle and elite strategy entrypoint is patched", async ({ page }) => {
    const status = await page.evaluate(() => ({
      patched: Boolean(window.AiCharacterStrategies?.__evAccountingPatched),
      version: window.AiCharacterStrategies?.evAccountingVersion || "",
      dataset: document.documentElement.dataset.aiEvAccounting || "",
    }));
    expect(status.patched).toBe(true);
    expect(status.version).toBe("1.0.0");
    expect(status.dataset).toBe("ready");
  });
});
