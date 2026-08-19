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

test("可讀性樣式保留，但不再改寫 Layout V4 官方位置", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-official-layout-runtime-ready", "true");
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);

  await expect.poll(
    () => page.evaluate(() => window.LayoutReadabilityTrial?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.2.0");
  await expect.poll(
    () => page.evaluate(() => window.LayoutReadabilityTrial?.positionAuthority || ""),
    { timeout: 5_000 },
  ).toBe("layout-v4");

  await expect(page.locator("#layoutReadabilityTrialStyles")).toHaveCount(1);

  const coachToggle = page.locator("#coachEnabled");
  await expect(coachToggle).toBeVisible();
  await expect(coachToggle).not.toBeChecked();
  await coachToggle.check();
  await expect(page.locator("#coachContent")).toBeVisible();

  const layout = await page.evaluate(() => {
    const trialSnapshot = LayoutReadabilityTrial.snapshot();
    const officialHeroCards = OfficialLayoutPreset.layout.heroCards;
    const stateHeroCards = state.layout.items.heroCards;
    const status = document.querySelector(".seat-status");
    const statusStyle = status ? getComputedStyle(status) : null;
    const meter = document.querySelector(".coach-meter");
    const sideRail = document.querySelector(".side-rail");
    const sideRailStyle = sideRail ? getComputedStyle(sideRail) : null;
    const gameLog = document.querySelector("#gameLog");
    const gameLogStyle = gameLog ? getComputedStyle(gameLog) : null;

    return {
      trial: document.documentElement.dataset.layoutTrial,
      liftedFlag: document.documentElement.dataset.layoutTrialHeroLifted || "",
      positionAuthority: document.documentElement.dataset.layoutReadabilityPositionAuthority,
      heroCardsLifted: trialSnapshot.heroCardsLifted,
      heroCardsTop: trialSnapshot.heroCardsTop,
      liftPixels: trialSnapshot.liftPixels,
      authorityMode: trialSnapshot.authorityMode,
      officialHeroCards,
      stateHeroCards,
      statusFontSize: Number.parseFloat(statusStyle?.fontSize || "0"),
      statusHeight: status?.getBoundingClientRect().height || 0,
      meterHeight: meter?.getBoundingClientRect().height || 0,
      sideRailGap: Number.parseFloat(sideRailStyle?.rowGap || "0"),
      sideRailPaddingLeft: Number.parseFloat(sideRailStyle?.paddingLeft || "0"),
      logOverflowY: gameLogStyle?.overflowY || "",
    };
  });

  expect(layout.trial).toBe("readability-v2");
  expect(layout.liftedFlag).toBe("");
  expect(layout.positionAuthority).toBe("layout-v4");
  expect(layout.heroCardsLifted).toBe(false);
  expect(layout.liftPixels).toBe(0);
  expect(layout.authorityMode).toBe("official");
  expect(layout.stateHeroCards).toEqual(layout.officialHeroCards);
  expect(layout.heroCardsTop).toBe(64.57);
  expect(layout.statusFontSize).toBeGreaterThanOrEqual(10);
  expect(layout.statusHeight).toBeGreaterThanOrEqual(20);
  expect(layout.meterHeight).toBeGreaterThanOrEqual(10);
  expect(layout.sideRailGap).toBeGreaterThanOrEqual(10);
  expect(layout.sideRailPaddingLeft).toBeGreaterThanOrEqual(10);
  expect(layout.logOverflowY).toBe("auto");

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
