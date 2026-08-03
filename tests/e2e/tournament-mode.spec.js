import { expect, test } from "@playwright/test";

test("淘汰賽永久淘汰、分層候補與縮桌流程", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => Boolean(window.TournamentMode?.version)),
    { timeout: 10_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => Boolean(window.GameModeControlsV2?.version)),
    { timeout: 10_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.TournamentModeVisibleEntry?.version || ""),
    { timeout: 10_000 },
  ).toBe("3.3.0");
  await expect.poll(
    () => page.evaluate(() => window.EliteCharacterPresentation?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.AiTierBossSystem?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  expect(await page.evaluate(() => document.querySelector(".side-rail")?.firstElementChild?.id)).toBe("coachPanel");
  await expect(page.locator("#coachPanel")).toBeVisible();

  const modeButton = page.locator("#challengeModeButton");
  await expect(modeButton).toBeVisible();
  await expect(modeButton).toHaveText("🏆 挑戰賽模式");
  await expect(modeButton).toHaveClass(/tool-button/);
  expect(await page.evaluate(() => document.querySelector("#challengeModeButton")?.parentElement?.classList.contains("top-bar-actions"))).toBe(true);
  expect(await page.evaluate(() => document.querySelector("#challengeModeButton")?.previousElementSibling?.id)).toBe("tutorialButton");
  await expect(page.locator("#gameModeLabel")).toHaveText("一般模式");

  await modeButton.click();

  await expect(modeButton).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton).toHaveText("🏆 結束挑戰賽");
  await expect(page.locator("#gameModeLabel")).toHaveText("挑戰賽模式");
  await expect(page.locator("#opponents .seat")).toHaveCount(6);

  const openingNames = await page.evaluate(() => state.players.slice(1).map(player => player.name));
  expect(openingNames).toEqual(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);

  const initialSnapshot = await page.evaluate(() => TournamentMode.snapshot());
  expect(initialSnapshot.queue).toHaveLength(13);
  expect(new Set(initialSnapshot.queue.slice(0, 6))).toEqual(
    new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]),
  );
  expect(new Set(initialSnapshot.queue.slice(6, 10))).toEqual(
    new Set(["Nova", "Unit-9", "Merlin", "Vlad"]),
  );
  expect(initialSnapshot.queue.slice(10, 12)).toEqual(["Oracle", "Chronos"]);
  expect(initialSnapshot.queue.at(-1)).toBe("Gemini");

  await page.evaluate(() => {
    state.handOver = true;
    state.waitingForHuman = false;
    state.players.slice(1).forEach(player => {
      player.stack = 0;
      player.allIn = true;
    });
    startHand();
  });

  const middleNames = await page.evaluate(() => state.players.slice(1).map(player => player.name));
  expect(new Set(middleNames)).toEqual(
    new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]),
  );

  const middleSnapshot = await page.evaluate(() => TournamentMode.snapshot());
  expect(new Set(middleSnapshot.eliminated)).toEqual(
    new Set(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]),
  );
  expect(middleSnapshot.queue.slice(-3)).toEqual(["Oracle", "Chronos", "Gemini"]);

  await page.evaluate(() => {
    state.handOver = true;
    state.waitingForHuman = false;
    for (const skipped of ["Vlad", "Oracle", "Chronos", "Gemini"]) {
      if (!state.tournament.eliminated.includes(skipped)) {
        state.tournament.eliminated.push(skipped);
      }
    }
    state.tournament.queue = [];
    state.players.slice(2).forEach(player => {
      player.stack = 0;
      player.allIn = true;
    });
    startHand();
  });

  await expect(page.locator("#opponents .seat")).toHaveCount(1);
  const survivorName = await page.evaluate(() => state.players[1].name);
  expect(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]).toContain(survivorName);

  const headsUpPositions = await page.evaluate(() => state.players.map(player => positionLabel(player)).sort());
  expect(headsUpPositions).toEqual(["BB", "BTN/SB"]);

  await page.evaluate(() => {
    state.players[1].stack = 0;
    state.players[1].allIn = true;
    state.winners = ["Owl"];
    state.handOver = true;
    maybeShowSessionSummary();
  });

  await expect(page.locator("#sessionSummaryOverlay")).toBeVisible();
  await expect(page.locator("#sessionSummaryContent .session-hero h2")).toHaveText("淘汰賽冠軍");
  await expect(page.locator(".tournament-summary-card")).toContainText("完整通關");
  await expect(page.locator(".tournament-summary-card")).toContainText("19");
});

test("淘汰賽 Gemini 登場時立即取得安全後端資格", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => Boolean(window.TournamentGeminiBridge?.version)),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    TournamentMode.setMode("tournament");
    const profile = AI_ROSTER.find(candidate => candidate.name === "Gemini")
      || window.GeminiFinalBoss.profile;
    Object.assign(state.players[1], profile, {
      name: "Gemini",
      stack: Math.max(1, state.players[1].stack),
    });
    TournamentGeminiBridge.sync();
  });

  await expect.poll(
    () => page.evaluate(() => window.GeminiFinalBoss?.isBossMode?.()),
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => TournamentGeminiBridge.isTemporaryBossMode()),
  ).toBe(true);

  await page.evaluate(() => TournamentMode.setMode("normal"));

  await expect.poll(
    () => page.evaluate(() => window.GeminiFinalBoss?.isBossMode?.()),
    { timeout: 3_000 },
  ).toBe(false);
});