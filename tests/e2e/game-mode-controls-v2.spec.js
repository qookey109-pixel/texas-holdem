import { expect, test } from "@playwright/test";

test("挑戰賽入口固定在新手教學旁、模式標籤同步且重新整理預設一般模式", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemGameModeV1", "tournament");
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.GameModeControlsV2?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.TournamentModeVisibleEntry?.version || ""),
    { timeout: 10_000 },
  ).toBe("3.1.0");

  await expect.poll(
    () => page.evaluate(() => window.TournamentMode?.isActive?.()),
  ).toBe(false);

  expect(await page.evaluate(() => localStorage.getItem("texasHoldemGameModeV1"))).toBeNull();
  await expect(page.locator("#coachPanel")).toBeVisible();
  expect(await page.evaluate(() => document.querySelector(".side-rail")?.firstElementChild?.id)).toBe("coachPanel");

  const autoButton = page.locator("#autoNewHandButton");
  await expect.poll(() => page.evaluate(() => state.autoNewHand)).toBe(true);
  await expect(autoButton).toHaveText("⏸ 自動牌局");
  await expect(autoButton).toHaveAttribute("aria-pressed", "true");

  const challengeButton = page.locator("#challengeModeButton");
  await expect(challengeButton).toBeVisible();
  await expect(challengeButton).toHaveText("🏆 挑戰賽模式");
  await expect(challengeButton).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => document.querySelector("#challengeModeButton")?.parentElement?.classList.contains("top-bar-actions"))).toBe(true);
  expect(await page.evaluate(() => document.querySelector("#challengeModeButton")?.previousElementSibling?.id)).toBe("tutorialButton");

  const modeLabel = page.locator("#gameModeLabel");
  await expect(modeLabel).toBeVisible();
  await expect(modeLabel).toHaveText("一般模式");
  await expect(modeLabel).toHaveAttribute("data-mode", "normal");
  expect(await page.evaluate(() => document.querySelector("#gameModeLabel")?.previousElementSibling?.id)).toBe("handNumber");

  await page.getByRole("button", { name: /設定/ }).first().click();
  await expect(page.locator("#tournamentModeButton")).toBeHidden();

  await autoButton.click();
  await expect.poll(() => page.evaluate(() => state.autoNewHand)).toBe(false);
  await expect(autoButton).toHaveText("▶ 自動牌局");
  await expect(autoButton).toHaveAttribute("aria-pressed", "false");

  await challengeButton.click();
  await expect.poll(
    () => page.evaluate(() => window.TournamentMode?.isActive?.()),
  ).toBe(true);
  await expect(challengeButton).toHaveText("🏆 結束挑戰賽");
  await expect(challengeButton).toHaveAttribute("aria-pressed", "true");
  await expect(modeLabel).toHaveText("挑戰賽模式");
  await expect(modeLabel).toHaveAttribute("data-mode", "challenge");
  await expect.poll(() => page.evaluate(() => state.autoNewHand)).toBe(false);

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.GameModeControlsV2?.version || ""),
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.TournamentModeVisibleEntry?.version || ""),
  ).toBe("3.1.0");
  await expect.poll(
    () => page.evaluate(() => window.TournamentMode?.isActive?.()),
  ).toBe(false);
  await expect.poll(() => page.evaluate(() => state.autoNewHand)).toBe(true);
  await expect(page.locator("#autoNewHandButton")).toHaveText("⏸ 自動牌局");
  await expect(page.locator("#coachPanel")).toBeVisible();
  await expect(page.locator("#challengeModeButton")).toHaveText("🏆 挑戰賽模式");
  await expect(page.locator("#gameModeLabel")).toHaveText("一般模式");
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