import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];

  page.on("pageerror", error => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });

  page.on("requestfailed", request => {
    issues.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });

  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.endsWith("/favicon.ico")) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return issues;
}

test("玩家籌碼歸零後顯示本輪結算並可回到第 1 局", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);

  const summaryWasShown = await page.evaluate(() => {
    clearAutoNewHandTimer();
    clearDialogueTimers();

    state.players[0].stack = 0;
    state.handOver = true;
    state.sessionEnded = false;
    state.heroStyle = {
      ...createHeroStyleStats(),
      hands: 4,
      vpip: 3,
      raises: 2,
      calls: 1,
      checks: 2,
      folds: 1,
      allIns: 1,
      showdowns: 2,
      wins: 1,
      maxStack: 1320,
      biggestPot: 880,
      bestWin: 620,
    };

    return maybeShowSessionSummary();
  });

  expect(summaryWasShown).toBe(true);

  const overlay = page.locator("#sessionSummaryOverlay");
  const heroStats = overlay.locator(".session-hero-stats");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".session-hero h2")).toHaveText("本輪結算");
  await expect(overlay).toContainText("Owl 籌碼歸零");
  await expect(heroStats).toContainText(/完成\s*4\s*手/);
  await expect(heroStats).toContainText(/入池率\s*75\s*%/);
  await expect(overlay).toContainText("七邊形風格輪廓");
  await expect(overlay).toContainText("行為統整圖表");
  await expect(overlay).toContainText("技術分析");
  await expect(overlay).toContainText("本輪成就");
  await expect(overlay.locator(".style-radar .radar-shape")).toBeVisible();
  await expect(overlay.locator(".session-chart-row")).toHaveCount(7);

  await overlay.locator("[data-session-restart]").click();

  await expect(overlay).toBeHidden();
  await expect(page.locator("#handNumber")).toHaveText("第 1 局");
  await expect(page.locator("#playerCards .card")).toHaveCount(2);
  await expect.poll(
    () => page.evaluate(() => ({ handNumber: state.handNumber, sessionEnded: state.sessionEnded })),
    { timeout: 5_000 },
  ).toEqual({ handNumber: 1, sessionEnded: false });

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
