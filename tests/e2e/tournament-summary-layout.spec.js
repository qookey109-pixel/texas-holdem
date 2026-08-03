import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1536, height: 900 } });

test("淘汰賽結算在 Safari 桌機高度不會互相重疊且可完整捲動", async ({ page }) => {
  const runtimeIssues = [];
  page.on("pageerror", error => runtimeIssues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") runtimeIssues.push(`console: ${message.text()}`);
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => Boolean(window.TournamentMode?.version)),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    window.TournamentMode.setMode("tournament", { restart: false, persist: false });
    state.tournament = {
      active: true,
      started: true,
      queue: ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Gemini"],
      appeared: ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"],
      eliminated: ["Leo", "Toto", "Foxy"],
      finished: true,
      result: "loss",
      lastEliminated: "Foxy",
      lastOpponent: "Shark",
      dealerCursor: 0,
    };
    state.players[0].stack = 0;
    state.handOver = true;
    state.sessionEnded = true;
    state.heroStyle = {
      ...createHeroStyleStats(),
      hands: 1,
      vpip: 1,
      raises: 0,
      calls: 0,
      checks: 0,
      folds: 0,
      allIns: 1,
      showdowns: 1,
      wins: 0,
      maxStack: 2000,
      biggestPot: 10020,
      bestWin: 0,
    };
    renderSessionSummary();
  });

  const overlay = page.locator("#sessionSummaryOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".session-hero h2")).toHaveText("淘汰賽結束");
  await expect(overlay.locator(".tournament-summary-card")).toBeVisible();
  await expect(overlay.locator(".session-radar-card")).toBeVisible();
  await expect(overlay.locator(".session-chart-card")).toBeVisible();
  await expect(overlay.locator(".session-review-card")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const box = selector => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      if (!rect) return null;
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const content = document.querySelector("#sessionSummaryContent");
    const modal = document.querySelector(".session-summary-modal");
    return {
      overflowY: getComputedStyle(content).overflowY,
      contentClientHeight: content.clientHeight,
      contentScrollHeight: content.scrollHeight,
      modal: box(".session-summary-modal"),
      tournament: box(".tournament-summary-card"),
      radarCard: box(".session-radar-card"),
      radar: box(".style-radar"),
      chartCard: box(".session-chart-card"),
      chartStats: box(".session-chart-card .session-key-stats"),
      review: box(".session-review-card"),
      restart: box(".session-restart-button"),
      viewportHeight: window.innerHeight,
      modalScrollHeight: modal.scrollHeight,
    };
  });

  expect(geometry.overflowY).toBe("auto");
  expect(geometry.modal.height).toBeLessThanOrEqual(geometry.viewportHeight - 20);
  expect(geometry.tournament.bottom).toBeLessThanOrEqual(geometry.radarCard.top + 1);
  expect(geometry.tournament.bottom).toBeLessThanOrEqual(geometry.chartCard.top + 1);
  expect(geometry.radarCard.bottom).toBeLessThanOrEqual(geometry.review.top + 1);
  expect(geometry.chartCard.bottom).toBeLessThanOrEqual(geometry.review.top + 1);
  expect(geometry.radar.bottom).toBeLessThanOrEqual(geometry.radarCard.bottom + 1);
  expect(geometry.chartStats.bottom).toBeLessThanOrEqual(geometry.chartCard.bottom + 1);
  expect(geometry.review.bottom).toBeLessThanOrEqual(geometry.restart.top + 1);
  expect(geometry.contentScrollHeight).toBeGreaterThanOrEqual(geometry.contentClientHeight);

  await overlay.locator(".session-restart-button").scrollIntoViewIfNeeded();
  await expect(overlay.locator(".session-restart-button")).toBeVisible();
  await expect(overlay.locator("#sessionSummaryClose")).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
