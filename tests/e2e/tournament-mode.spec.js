import { expect, test } from "@playwright/test";

test("淘汰賽永久淘汰、分層候補與縮桌流程", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => Boolean(window.TournamentMode?.version)),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    TournamentMode.setMode("tournament");
  });

  await expect(page.locator("#tournamentModeButton")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#opponents .seat")).toHaveCount(6);

  const openingNames = await page.evaluate(() => state.players.slice(1).map(player => player.name));
  expect(openingNames).toEqual(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);

  const initialSnapshot = await page.evaluate(() => TournamentMode.snapshot());
  expect(initialSnapshot.queue).toHaveLength(10);
  expect(new Set(initialSnapshot.queue.slice(0, 6))).toEqual(
    new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]),
  );
  expect(new Set(initialSnapshot.queue.slice(6, 9))).toEqual(
    new Set(["Nova", "Unit-9", "Merlin"]),
  );
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
  expect(middleSnapshot.queue.at(-1)).toBe("Gemini");

  await page.evaluate(() => {
    state.handOver = true;
    state.waitingForHuman = false;
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
});
