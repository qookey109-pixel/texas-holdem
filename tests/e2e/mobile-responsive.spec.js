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

async function expectInsideViewport(page, locator, label, tolerance = 2) {
  await expect(locator, `${label} 應可見`).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box, `${label} 應有可量測的版面`).not.toBeNull();
  expect(viewport, "測試應有固定 viewport").not.toBeNull();
  expect(box.x, `${label} 左側不可超出畫面`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y, `${label} 上方不可超出畫面`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.x + box.width, `${label} 右側不可超出畫面`).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.y + box.height, `${label} 下方不可超出畫面`).toBeLessThanOrEqual(viewport.height + tolerance);
}

async function expectNoHorizontalPageOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

test("手機直向顯示旋轉提示並隱藏牌桌", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#desktopOnlyNotice")).toBeVisible();
  await expect(page.locator("#desktopOnlyNotice h1")).toHaveText("請旋轉成橫向");
  await expect(page.locator(".app-shell")).toBeHidden();
  await expectInsideViewport(page, page.locator("#desktopOnlyNotice > div"), "旋轉提示卡片");
  await expectNoHorizontalPageOverflow(page);

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});

test("手機橫向可顯示完整核心牌桌並操作新牌局", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#desktopOnlyNotice")).toBeHidden();
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);
  await expect(page.locator("#opponents .seat")).toHaveCount(6);
  await expect(page.locator(".side-rail")).toBeHidden();
  await expect(page.locator("#layoutButton")).toBeHidden();

  await expectInsideViewport(page, page.locator("#arena"), "牌桌");
  await expectInsideViewport(page, page.locator("#playerCards"), "玩家手牌");
  await expectInsideViewport(page, page.locator(".controls"), "操作區");
  await expectInsideViewport(page, page.locator("#foldButton"), "棄牌按鈕");
  await expectInsideViewport(page, page.locator("#callButton"), "跟注按鈕");
  await expectInsideViewport(page, page.locator("#raiseButton"), "加注按鈕");
  await expectInsideViewport(page, page.locator("#allInButton"), "All-in 按鈕");
  await expectNoHorizontalPageOverflow(page);

  await page.locator("#newHandButton").click();
  await expect(page.locator("#handNumber")).toHaveText("第 2 局");

  await page.locator("#tutorialButton").click();
  await expect(page.locator("#tutorialOverlay")).toBeVisible();
  await expectInsideViewport(page, page.locator(".tutorial-modal"), "新手教學視窗");
  await page.locator("#tutorialCloseButton").click();
  await expect(page.locator("#tutorialOverlay")).toBeHidden();

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});

test("小型手機橫向不產生頁面水平溢出", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#desktopOnlyNotice")).toBeHidden();
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);
  await expect(page.locator("#opponents .seat")).toHaveCount(6);
  await expectInsideViewport(page, page.locator("#playerCards"), "小型橫向玩家手牌");
  await expectInsideViewport(page, page.locator(".controls"), "小型橫向操作區");
  await expectNoHorizontalPageOverflow(page);

  const topActions = await page.locator(".top-bar-actions").evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(topActions.overflowX).toBe("auto");
  expect(topActions.scrollWidth).toBeGreaterThanOrEqual(topActions.clientWidth);

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
