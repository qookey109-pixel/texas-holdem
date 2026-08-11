import { expect, test } from "@playwright/test";

async function loadAt(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionModeV1?.isInstalled?.() === true),
    { timeout: 12_000 },
  ).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-layout-ready", "true");
}

async function expectInsideViewport(page, locator, tolerance = 2) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y).toBeGreaterThanOrEqual(-tolerance);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + tolerance);
  return box;
}

async function freezeAtCompletedHand(page) {
  await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer?.();
    clearDialogueTimers?.();
    state.autoNewHand = false;
    state.handOver = true;
    state.waitingForHuman = false;
  });
}

async function forceMoveUpDecision(page) {
  await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer?.();
    clearDialogueTimers?.();
    state.autoNewHand = false;
    state.players[0].stack = 4300;
    state.players[0].bet = 0;
    state.players[0].totalContribution = 0;
    state.handOver = true;
    state.waitingForHuman = false;
    maybeShowSessionSummary();
  });
  await expect(page.locator("#longSessionDecisionRoot")).toBeVisible();
  await expect(page.locator("#longSessionDecisionRoot")).toContainText("20/40");
}

async function assertDecisionFits(page) {
  const overlay = page.locator("#longSessionDecisionRoot");
  const card = overlay.locator(".long-session-decision-card");
  const primary = overlay.locator('[data-long-session-action="primary"]');
  const secondary = overlay.locator('[data-long-session-action="secondary"]');

  await expectInsideViewport(page, card);
  const primaryBox = await expectInsideViewport(page, primary);
  const secondaryBox = await expectInsideViewport(page, secondary);
  expect(primaryBox.height).toBeGreaterThanOrEqual(44);
  expect(secondaryBox.height).toBeGreaterThanOrEqual(44);
}

test("desktop UI can enter Long Session, move up, and return to Normal", async ({ page }, testInfo) => {
  await loadAt(page, 1536, 900);
  await freezeAtCompletedHand(page);

  const settingsButton = page.locator("#settingsMenuButton");
  const settingsPanel = page.locator("#settingsMenuPanel");
  await settingsButton.click();
  await expect(settingsPanel).toBeVisible();

  const longButton = settingsPanel.locator("#longSessionModeButton");
  await expect(longButton).toBeVisible();
  await expectInsideViewport(page, longButton);
  await longButton.click();

  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(true);
  await expect(page.locator("#longSessionStatusBadge")).toBeVisible();
  await expect(page.locator("#longSessionStatusBadge")).toContainText("10/20");
  await expectInsideViewport(page, page.locator("#longSessionStatusBadge"));

  await forceMoveUpDecision(page);
  await assertDecisionFits(page);
  await testInfo.attach("desktop-long-session-move-up", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.locator('[data-long-session-action="primary"]').click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.snapshot().session?.tableIndex)).toBe(1);
  await expect(page.locator("#longSessionStatusBadge")).toContainText("20/40");

  await freezeAtCompletedHand(page);
  await settingsButton.click();
  await expect(settingsPanel).toBeVisible();
  await settingsPanel.locator("#longSessionModeButton").click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(false);
  await expect(page.locator("#longSessionStatusBadge")).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({ ...state.blindLevel }))).toMatchObject({
    small: 10,
    big: 20,
    buyIn: 2000,
  });
});

test("mobile landscape UI keeps Long Session controls and move-up decision tappable", async ({ page }, testInfo) => {
  await loadAt(page, 844, 390);
  await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
  await expect(page.locator(".app-shell")).toBeVisible();
  await freezeAtCompletedHand(page);

  const settingsTab = page.locator('[data-mobile-panel="settings"]');
  await settingsTab.click();
  await expect(page.locator("body")).toHaveClass(/mobile-v1-drawer-open/);

  const mobileToggle = page.locator(".mobile-v1-settings-grid [data-long-session-mobile-toggle]");
  await expect(mobileToggle).toBeVisible();
  const toggleBox = await expectInsideViewport(page, mobileToggle);
  expect(toggleBox.height).toBeGreaterThanOrEqual(44);
  await mobileToggle.click();

  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(true);
  await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
  await expect(page.locator(".app-shell")).toBeVisible();

  await forceMoveUpDecision(page);
  await assertDecisionFits(page);
  await testInfo.attach("mobile-landscape-long-session-move-up", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.locator('[data-long-session-action="primary"]').click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.snapshot().session?.tableIndex)).toBe(1);
  await expect(page.locator("#longSessionStatusBadge")).toContainText("20/40");

  await freezeAtCompletedHand(page);
  await settingsTab.click();
  await expect(page.locator("body")).toHaveClass(/mobile-v1-drawer-open/);
  await page.locator(".mobile-v1-settings-grid [data-long-session-mobile-toggle]").click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(false);
  await expect(page.locator("#longSessionStatusBadge")).toBeHidden();
});
