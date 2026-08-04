import { expect, test } from "@playwright/test";

async function waitForAccessibility(page) {
  await expect.poll(() => page.evaluate(() => window.DesktopAccessibilityFocus?.version || "")).toBe("2.0.0");
}

async function expectFocusInside(page, containerSelector) {
  await expect.poll(() => page.evaluate(selector => {
    const container = document.querySelector(selector);
    return Boolean(container && container.contains(document.activeElement));
  }, containerSelector)).toBe(true);
}

async function pressTabWithin(page, containerSelector, count) {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Tab");
    await expectFocusInside(page, containerSelector);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("./", { waitUntil: "networkidle" });
  await waitForAccessibility(page);
});

test("新手教學接管焦點、限制 Tab 並在關閉後還原焦點", async ({ page }) => {
  const tutorialButton = page.locator("#tutorialButton");
  const overlay = page.locator("#tutorialOverlay");
  const closeButton = page.locator("#tutorialCloseButton");

  await tutorialButton.focus();
  await page.keyboard.press("Enter");

  await expect(overlay).toBeVisible();
  await expect(closeButton).toBeFocused();
  await expect(overlay).toHaveAttribute("role", "dialog");
  await expect(overlay).toHaveAttribute("aria-modal", "true");

  const focusableCount = await overlay.locator(
    "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  ).count();
  expect(focusableCount).toBeGreaterThan(1);
  await pressTabWithin(page, "#tutorialOverlay", focusableCount + 2);

  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(tutorialButton).toBeFocused();
});

test("AI 角色資訊可由鍵盤開啟、Escape 關閉並回到原座位", async ({ page }) => {
  const seat = page.locator("#opponents .seat[data-profile-position]").first();
  const panel = page.locator("#aiProfilePanel");
  const closeButton = panel.locator("[data-profile-close]");

  await seat.focus();
  await page.keyboard.press("Enter");

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("role", "dialog");
  await expect(panel).toHaveAttribute("aria-label", /角色資訊/);
  await expect(seat).toHaveAttribute("aria-controls", "aiProfilePanel");
  await expect(seat).toHaveAttribute("aria-expanded", "true");
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(seat).toHaveAttribute("aria-expanded", "false");
  await expect(seat).toBeFocused();
});

test("本輪結算限制焦點並在重新開始後聚焦新牌局", async ({ page }) => {
  await page.evaluate(() => renderSessionSummary());

  const overlay = page.locator("#sessionSummaryOverlay");
  const closeButton = page.locator("#sessionSummaryClose");

  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("role", "dialog");
  await expect(overlay).toHaveAttribute("aria-modal", "true");
  await expect(closeButton).toBeFocused();

  const focusableCount = await overlay.locator(
    "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  ).count();
  expect(focusableCount).toBeGreaterThan(1);
  await pressTabWithin(page, "#sessionSummaryOverlay", focusableCount + 2);

  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(page.locator("#newHandButton")).toBeFocused();
  await expect(page.locator("#handNumber")).toHaveText("第 1 局");
});

test("鍵盤導覽顯示清楚的焦點指示", async ({ page }) => {
  await page.keyboard.press("Tab");

  const focusState = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      id: element.id,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      boxShadow: style.boxShadow,
    };
  });

  expect(focusState).not.toBeNull();
  expect(focusState.tag).not.toBe("BODY");
  expect(
    (focusState.outlineStyle !== "none" && focusState.outlineWidth >= 2)
      || (focusState.boxShadow && focusState.boxShadow !== "none"),
    `焦點元素 ${focusState.tag}#${focusState.id || "(no id)"} 應有清楚的 outline 或 box-shadow`,
  ).toBe(true);
});
