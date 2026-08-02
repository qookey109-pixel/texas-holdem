import { expect, test } from "@playwright/test";

test("淘汰賽入口留在設定選單、教練可見且重新整理預設一般模式", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemGameModeV1", "tournament");
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.GameModeControlsV2?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");

  await expect.poll(
    () => page.evaluate(() => window.TournamentMode?.isActive?.()),
  ).toBe(false);

  expect(await page.evaluate(() => localStorage.getItem("texasHoldemGameModeV1"))).toBeNull();
  await expect(page.locator("#coachPanel")).toBeVisible();
  expect(await page.evaluate(() => document.querySelector(".side-rail")?.firstElementChild?.id)).toBe("coachPanel");
  expect(await page.evaluate(() => document.querySelector("#tournamentModeButton")?.parentElement?.id)).toBe("settingsMenuPanel");

  await page.getByRole("button", { name: /設定/ }).first().click();
  const tournamentButton = page.locator("#tournamentModeButton");
  await expect(tournamentButton).toBeVisible();
  await expect(tournamentButton).toHaveText("🏆 淘汰賽模式");

  await tournamentButton.click();
  await expect.poll(
    () => page.evaluate(() => window.TournamentMode?.isActive?.()),
  ).toBe(true);
  await expect(tournamentButton).toHaveText("🏆 結束淘汰賽");

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.GameModeControlsV2?.version || ""),
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.TournamentMode?.isActive?.()),
  ).toBe(false);
  await expect(page.locator("#coachPanel")).toBeVisible();
});

test("Gemini 挑戰可立即關閉且不重置目前牌局", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => Boolean(window.GameModeControlsV2?.version)),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    window.GeminiFinalBoss.enable({ restart: true, persist: false });
  });

  await expect.poll(
    () => page.evaluate(() => state.players.some(player => player.name === "Gemini")),
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.GeminiFinalBoss.isBossMode()),
  ).toBe(true);

  const handNumberBefore = await page.evaluate(() => state.handNumber);
  await page.getByRole("button", { name: /設定/ }).first().click();
  const geminiButton = page.locator("#geminiBossButton");
  await expect(geminiButton).toBeVisible();
  await expect(geminiButton).toHaveText("⏹ 結束 Gemini 挑戰");
  await geminiButton.click();

  await expect.poll(
    () => page.evaluate(() => window.GeminiFinalBoss.isBossMode()),
  ).toBe(false);
  expect(await page.evaluate(() => state.handNumber)).toBe(handNumberBefore);
  expect(await page.evaluate(() => state.geminiRetireAfterHand)).toBe(true);
  await expect(geminiButton).toHaveText("👑 挑戰 Gemini");

  const nextSeatNames = await page.evaluate(() => {
    state.handOver = true;
    return buildNextAiSeats(state.players).map(seat => seat.profile.name);
  });
  expect(nextSeatNames).not.toContain("Gemini");
  expect(await page.evaluate(() => state.geminiRetireAfterHand)).toBe(false);
});
