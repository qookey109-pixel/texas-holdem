import { expect, test } from "@playwright/test";

test("AI V2.3 短碼強牌在 raise lock 下不會產生非法加注", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiOpeningStrategiesV23?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.3.0");

  const decision = await page.evaluate(() => window.AiOpeningStrategiesV23.evaluateScenario("Leo", {
    handNumber: 16,
    stack: 180,
    effectiveStack: 180,
    needed: 40,
    pot: 180,
    bigBlind: 20,
    minimumRaise: 40,
    activeOpponents: 1,
    baseStrength: 0.92,
    position: "BB",
    texture: { wetness: 0.12, dry: true },
    canRaise: false,
  }, 0.1));

  expect(decision.context.stackInBigBlinds).toBe(9);
  expect(decision.context.raiseLegal).toBe(false);
  expect(decision.action).not.toBe("raise");
  expect(decision.raiseBy).toBe(0);
});
