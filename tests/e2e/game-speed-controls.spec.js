import { expect, test } from "@playwright/test";

test("設定選單可調整一到三倍牌局速度且 Gemini 維持原速", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("texasHoldemGameSpeedV1"));
  await page.reload({ waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.GameSpeedController?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  await page.evaluate(() => window.GameModeControlsV2?.openSettingsMenu?.());

  const control = page.locator("#gameSpeedControl");
  const slider = page.locator("#gameSpeedSlider");
  const output = page.locator("#gameSpeedOutput");

  await expect(control).toBeVisible();
  await expect(slider).toHaveValue("1");
  await expect(output).toHaveText("×1");
  await expect(control).toContainText("Gemini 模型思考與網路等待維持原速");

  await slider.evaluate(input => {
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect(output).toHaveText("×3");
  await expect(page.locator("html")).toHaveAttribute("data-game-speed", "3");

  const timing = await page.evaluate(() => ({
    speed: GameSpeedController.getSpeed(),
    localAi: GameSpeedController.scaleDelay(900, {
      category: "ai-thinking",
      actorName: "Leo",
    }),
    geminiAi: GameSpeedController.scaleDelay(900, {
      category: "ai-thinking",
      actorName: "Gemini",
    }),
    geminiRequest: GameSpeedController.scaleDelay(900, {
      category: "gemini-request",
    }),
    stored: localStorage.getItem("texasHoldemGameSpeedV1"),
  }));

  expect(timing).toEqual({
    speed: 3,
    localAi: 300,
    geminiAi: 900,
    geminiRequest: 900,
    stored: "3",
  });

  const autoHandElapsed = await page.evaluate(() => new Promise(resolve => {
    const originalStartHand = startHand;
    const beganAt = performance.now();
    state.handOver = true;
    state.autoNewHand = true;
    startHand = function measuredStartHand() {
      clearAutoNewHandTimer();
      startHand = originalStartHand;
      resolve(performance.now() - beganAt);
    };
    scheduleAutoNewHand();
  }));

  expect(autoHandElapsed).toBeGreaterThan(700);
  expect(autoHandElapsed).toBeLessThan(1600);

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.GameSpeedController?.getSpeed?.()),
    { timeout: 10_000 },
  ).toBe(3);

  await page.evaluate(() => window.GameModeControlsV2?.openSettingsMenu?.());
  await expect(page.locator("#gameSpeedSlider")).toHaveValue("3");
  await expect(page.locator("#gameSpeedOutput")).toHaveText("×3");
});
