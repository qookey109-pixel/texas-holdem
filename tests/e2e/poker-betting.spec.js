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

function formatAmount(value) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

async function openFreshTable(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);
}

async function waitForHumanAction(page, selector) {
  const button = page.locator(selector);
  await expect(button).toBeEnabled({ timeout: 30_000 });
  return button;
}

test("玩家加注會扣除籌碼並寫入牌局紀錄", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await openFreshTable(page);

  const openingConfig = await page.evaluate(() => ({
    startingStack: STARTING_STACK,
    firstBuyIn: blindLevelForHand(1).buyIn,
    highestOpeningStack: Math.max(...state.players.map(player => player.stack + player.bet)),
    betInfoVersion: BetInfoUI?.version,
  }));
  expect(openingConfig).toEqual({
    startingStack: 2000,
    firstBuyIn: 2000,
    highestOpeningStack: 2000,
    betInfoVersion: "3.1.0",
  });

  const raiseButton = await waitForHumanAction(page, "#raiseButton");
  const stackBefore = Number(await page.locator("#playerStack").textContent());
  const raiseAmount = page.locator("#raiseAmount");

  await expect(page.locator("#betInfoSummary")).toHaveCount(0);
  await expect(page.locator("#callButton")).toHaveText(/^(過牌|跟注 [\d,]+)$/);
  await expect(raiseButton).toHaveText(/^加注至 [\d,]+$/);
  await expect(page.locator("#allInButton")).toHaveText(/^All-in [\d,]+$/);
  await expect(page.locator(".raise-caption")).toHaveText("加注至");
  await expect(page.locator(".quick-bets button")).toHaveCount(4);

  await raiseAmount.evaluate(input => {
    input.value = input.min;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const guidance = await page.evaluate(() => {
    const snapshot = BetInfoUI.snapshot();
    const controls = document.querySelector(".controls")?.getBoundingClientRect();
    const raiseControl = document.querySelector(".raise-control")?.getBoundingClientRect();
    const quickBets = document.querySelector(".quick-bets")?.getBoundingClientRect();
    const mainButton = document.querySelector("#raiseButton")?.getBoundingClientRect();
    return {
      minimumTo: snapshot.minimumTo,
      effectiveTarget: snapshot.effectiveTarget,
      remaining: snapshot.remaining,
      potAfter: snapshot.potAfter,
      raiseLabel: document.querySelector("#raiseButton")?.textContent,
      raiseValueLabel: document.querySelector("#raiseAmountValue")?.textContent,
      summaryExists: Boolean(document.querySelector("#betInfoSummary")),
      controlsWidth: controls?.width || 0,
      raiseControlWidth: raiseControl?.width || 0,
      quickBetsWidth: quickBets?.width || 0,
      mainButtonHeight: mainButton?.height || 0,
    };
  });

  expect(guidance.raiseLabel).toBe(`加注至 ${formatAmount(guidance.effectiveTarget)}`);
  expect(guidance.raiseValueLabel).toBe(formatAmount(guidance.effectiveTarget));
  expect(guidance.summaryExists).toBe(false);
  expect(guidance.remaining).toBeGreaterThanOrEqual(0);
  expect(guidance.potAfter).toBeGreaterThan(0);
  expect(guidance.effectiveTarget).toBeGreaterThanOrEqual(guidance.minimumTo);
  expect(guidance.mainButtonHeight).toBeGreaterThanOrEqual(40);
  expect(guidance.raiseControlWidth).toBeGreaterThanOrEqual(guidance.controlsWidth * 0.95);
  expect(guidance.quickBetsWidth).toBeGreaterThanOrEqual(guidance.controlsWidth * 0.95);

  const twoThirdsButton = page.locator('.quick-bets button[data-bet="twoThirds"]');
  await expect(twoThirdsButton.locator(".quick-bet-label")).toHaveText("2/3");
  await expect(twoThirdsButton.locator(".quick-bet-amount")).toHaveText(/^至 [\d,]+$/);
  await twoThirdsButton.click();
  await expect(twoThirdsButton).toHaveClass(/is-selected/);
  await expect(twoThirdsButton).toHaveAttribute("aria-pressed", "true");

  const twoThirdsTarget = Number(await twoThirdsButton.getAttribute("data-target"));
  expect(twoThirdsTarget).toBeGreaterThan(0);
  await expect(raiseButton).toHaveText(`加注至 ${formatAmount(twoThirdsTarget)}`);
  await expect(page.locator("#raiseAmountValue")).toHaveText(formatAmount(twoThirdsTarget));

  await raiseButton.click();

  await expect.poll(
    async () => Number(await page.locator("#playerStack").textContent()),
    { timeout: 5_000 },
  ).toBeLessThan(stackBefore);

  await expect(page.locator("#gameLog")).toContainText(/Owl (加注|All-in 加注)/, { timeout: 5_000 });

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});

test("玩家 All-in 會清空可用籌碼並寫入牌局紀錄", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await openFreshTable(page);

  const allInButton = await waitForHumanAction(page, "#allInButton");
  const stackBefore = Number(await page.locator("#playerStack").textContent());
  expect(stackBefore).toBeGreaterThan(0);
  expect(stackBefore).toBeLessThanOrEqual(2000);
  await expect(allInButton).toHaveText(`All-in ${formatAmount(stackBefore)}`);

  await allInButton.click();

  await expect.poll(
    async () => Number(await page.locator("#playerStack").textContent()),
    { timeout: 2_000 },
  ).toBe(0);

  await expect(page.locator("#gameLog")).toContainText(/Owl All-in/, { timeout: 5_000 });

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});