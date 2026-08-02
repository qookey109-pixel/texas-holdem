import { expect, test } from "@playwright/test";

test("高階角色使用專屬外觀、人物卡與登場提示", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.EliteCharacterPresentation?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");

  const vladData = await page.evaluate(() => {
    const vladIndex = AI_ROSTER.findIndex(profile => profile.name === "Vlad");
    const geminiIndex = AI_ROSTER.findIndex(profile => profile.name === "Gemini");
    return {
      vladIndex,
      geminiIndex,
      profile: AI_ROSTER[vladIndex],
      meta: AI_PROFILE_META.Vlad,
      join: DIALOGUE_BANK.Vlad?.join?.[0] || "",
    };
  });

  expect(vladData.vladIndex).toBeGreaterThanOrEqual(0);
  expect(vladData.geminiIndex).toBeGreaterThan(vladData.vladIndex);
  expect(vladData.profile).toMatchObject({
    name: "Vlad",
    emoji: "🧛",
    style: "Night Trap",
    isElite: true,
  });
  expect(vladData.meta.title).toBe("午夜獵手");
  expect(vladData.join).toContain("夜色正好");

  await page.evaluate(() => {
    const profile = AI_ROSTER.find(candidate => candidate.name === "Nova");
    Object.assign(state.players[1], profile, {
      name: "Nova",
      position: 1,
      isHuman: false,
      status: "新加入",
      stack: Math.max(1, state.players[1].stack),
    });
    render();
    EliteCharacterPresentation.refresh();
  });

  const novaSeat = page.locator('.seat[data-profile-position="1"]');
  await expect(novaSeat).toHaveClass(/is-elite-character/);
  await expect(novaSeat).toHaveClass(/elite-nova/);
  await expect(novaSeat.locator(".elite-character-badge")).toHaveText("ALIEN MIND");
  await expect(page.locator("#eliteArrivalBanner")).toContainText("Nova｜外星讀心者");

  await novaSeat.click();
  await expect(page.locator("#aiProfilePanel")).toHaveClass(/is-elite-character-profile/);
  await expect(page.locator("#aiProfilePanel")).toHaveClass(/elite-nova-profile/);
  await expect(page.locator("#aiProfilePanel .elite-profile-banner")).toContainText("ALIEN MIND");
  await expect(page.locator("#aiProfilePanel .elite-profile-banner")).toContainText("外星讀心者");

  await page.evaluate(() => {
    const profile = AI_ROSTER.find(candidate => candidate.name === "Vlad");
    Object.assign(state.players[1], profile, {
      name: "Vlad",
      position: 1,
      isHuman: false,
      status: "新加入",
      stack: Math.max(1, state.players[1].stack),
    });
    state.selectedProfilePosition = 1;
    render();
    EliteCharacterPresentation.refresh();
  });

  await expect(novaSeat).toHaveClass(/elite-vlad/);
  await expect(novaSeat.locator(".elite-character-badge")).toHaveText("NIGHT HUNTER");
  await expect(page.locator("#aiProfilePanel")).toHaveClass(/elite-vlad-profile/);
  await expect(page.locator("#aiProfilePanel .elite-profile-banner")).toContainText("午夜獵手");
  await expect(page.locator("#eliteArrivalBanner")).toContainText("Vlad｜午夜獵手");
});

test("Vlad 加入挑戰賽高階候補且 Gemini 仍是最後一位", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.EliteCharacterPresentation?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.EliteCharacterProgressFix?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  await page.evaluate(() => window.TournamentMode.setMode("tournament"));

  await expect.poll(
    () => page.evaluate(() => window.TournamentMode.snapshot()),
    { timeout: 10_000 },
  ).toMatchObject({ mode: "tournament" });

  const queue = await page.evaluate(() => window.TournamentMode.snapshot().queue);
  expect(queue).toHaveLength(11);
  expect(queue).toContain("Vlad");
  expect(queue.at(-1)).toBe("Gemini");
  expect(queue.indexOf("Vlad")).toBeLessThan(queue.indexOf("Gemini"));

  await expect.poll(
    () => page.evaluate(() => document.querySelector("#tournamentProgressBadge strong")?.dataset.eliteProgress || ""),
    { timeout: 10_000 },
  ).toBe("0 / 17");
  const visibleProgress = await page.locator("#tournamentProgressBadge strong").evaluate(
    element => getComputedStyle(element, "::after").content.replaceAll('"', ""),
  );
  expect(visibleProgress).toBe("0 / 17");
  expect(await page.evaluate(() => EliteCharacterPresentation.totalTournamentAi)).toBe(17);
});
