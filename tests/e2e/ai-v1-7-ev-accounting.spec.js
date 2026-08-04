import { expect, test } from "@playwright/test";

test.describe("AI V1.7 net EV accounting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect.poll(() => page.evaluate(() => window.AiEvAccountingV1?.version || "")).toBe("1.0.1");
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

  test("raise EV includes one opponent matching the raise by default", async ({ page }) => {
    const result = await page.evaluate(() => window.AiEvAccountingV1.raiseEv({
      equity: 0.35,
      pot: 100,
      callAmount: 20,
      raiseBy: 60,
      foldEquity: 0.4,
    }));
    // investment=80, opponentCall=60, finalPot=240, calledEV=4, totalEV=40 + 0.6*4=42.4
    expect(result).toBeCloseTo(42.4, 8);
  });

  test("raise EV supports more than one expected caller", async ({ page }) => {
    const result = await page.evaluate(() => window.AiEvAccountingV1.raiseEv({
      equity: 0.5,
      pot: 100,
      callAmount: 20,
      raiseBy: 60,
      foldEquity: 0,
      calledBy: 2,
    }));
    // investment=80, two callers add 120, finalPot=300, EV=150-80=70
    expect(result).toBeCloseTo(70, 8);
  });

  test("nut value raise EV is higher than flat-call EV", async ({ page }) => {
    const result = await page.evaluate(() => ({
      callEv: window.AiEvAccountingV1.callEv({
        equity: 0.999,
        pot: 240,
        callAmount: 80,
      }),
      raiseEv: window.AiEvAccountingV1.raiseEv({
        equity: 0.999,
        pot: 240,
        callAmount: 80,
        raiseBy: 170,
        foldEquity: 0.24,
      }),
    }));
    expect(result.callEv).toBeCloseTo(239.68, 8);
    expect(result.raiseEv).toBeGreaterThan(result.callEv);
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
    expect(decision.evAccountingVersion).toBe("1.0.1");
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
    expect(status.version).toBe("1.0.1");
    expect(status.dataset).toBe("ready");
  });
});
