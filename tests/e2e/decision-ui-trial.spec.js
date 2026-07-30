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

test("決策區保留公共牌卡背並區分高風險動作", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);

  await expect.poll(
    () => page.evaluate(() => window.DecisionUiTrial?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.2.0");

  await expect(page.locator("#boardCards .card.back")).toHaveCount(5);
  await expect(page.locator("#boardCards .card[data-community-slot]")).toHaveCount(0);
  await expect(page.locator("#boardCards .card.is-community-slot")).toHaveCount(0);

  const visual = await page.evaluate(() => {
    const quickButton = document.querySelector(".quick-bets button");
    const quickBets = document.querySelector(".quick-bets");
    const fold = document.querySelector("#foldButton");
    const allIn = document.querySelector("#allInButton");
    const quickBetsStyle = quickBets ? getComputedStyle(quickBets) : null;
    const foldStyle = fold ? getComputedStyle(fold) : null;
    const allInStyle = allIn ? getComputedStyle(allIn) : null;

    return {
      quickHeight: quickButton?.getBoundingClientRect().height || 0,
      quickGap: Number.parseFloat(quickBetsStyle?.columnGap || "0"),
      foldBackground: foldStyle?.backgroundImage || foldStyle?.backgroundColor || "",
      allInBackground: allInStyle?.backgroundImage || allInStyle?.backgroundColor || "",
      scriptSource: document.querySelector('script[data-decision-ui-trial]')?.getAttribute("src") || "",
    };
  });

  expect(visual.quickHeight).toBeGreaterThanOrEqual(40);
  expect(visual.quickGap).toBeGreaterThanOrEqual(8);
  expect(visual.foldBackground).not.toBe(visual.allInBackground);
  expect(visual.scriptSource).toContain("decision-ui-trial-v2.js?v=decision-ui-v3");

  const explanations = await page.evaluate(() => ({
    narrow: DecisionUiTrial.explainCoach({ winRate: 42, potOdds: 39, action: "Fold" }),
    strong: DecisionUiTrial.explainCoach({ winRate: 47, potOdds: 39, action: "Fold" }),
    pricedOut: DecisionUiTrial.explainCoach({ winRate: 34, potOdds: 39, action: "Fold" }),
  }));

  expect(explanations.narrow).toMatchObject({ tone: "caution", edge: 3 });
  expect(explanations.narrow.title).toContain("+3 PP");
  expect(explanations.narrow.text).toContain("5 PP");
  expect(explanations.strong).toMatchObject({ tone: "review", edge: 8 });
  expect(explanations.pricedOut).toMatchObject({ tone: "clear", edge: -5 });

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});