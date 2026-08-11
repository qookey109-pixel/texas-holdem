import { expect, test } from "@playwright/test";

async function loadAt(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionModeV1?.isInstalled?.() === true),
    { timeout: 12_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.LongSessionEntryVisibilityV1?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.0.0");
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

async function waitForMobileDrawerSettled(page) {
  const drawer = page.locator(".mobile-v1-drawer");
  await expect(drawer).toBeVisible();
  await expect.poll(
    () => drawer.evaluate(element => {
      const transform = getComputedStyle(element).transform;
      if (!transform || transform === "none") return true;
      const matrix = new DOMMatrixReadOnly(transform);
      return Math.abs(matrix.a - 1) < 0.001 && Math.abs(matrix.d - 1) < 0.001;
    }),
    { timeout: 1_500 },
  ).toBe(true);
}

async function ensureMobileSettingsDrawerOpen(page, settingsTab) {
  const body = page.locator("body");
  const alreadyOpen = await body.evaluate(element => element.classList.contains("mobile-v1-drawer-open"));
  if (!alreadyOpen) await settingsTab.click();
  await expect(body).toHaveClass(/mobile-v1-drawer-open/);
  await waitForMobileDrawerSettled(page);
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

test("desktop hides Long Session entry while the retained internal flow still works", async ({ page }, testInfo) => {
  await loadAt(page, 1536, 900);
  await freezeAtCompletedHand(page);

  const settingsButton = page.locator("#settingsMenuButton");
  const settingsPanel = page.locator("#settingsMenuPanel");
  await settingsButton.click();
  await expect(settingsPanel).toBeVisible();

  const longButton = settingsPanel.locator("#longSessionModeButton");
  await expect(longButton).toBeHidden();
  await expect(longButton).toHaveAttribute("aria-hidden", "true");
  await expect(longButton).toHaveAttribute("tabindex", "-1");

  await page.evaluate(() => window.LongSessionModeV1.enableNow({ restart: false }));
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(true);
  await expect(page.locator("#longSessionStatusBadge")).toBeVisible();
  await expect(page.locator("#longSessionStatusBadge")).toContainText("10/20");
  await expectInsideViewport(page, page.locator("#longSessionStatusBadge"));

  await forceMoveUpDecision(page);
  await assertDecisionFits(page);
  await testInfo.attach("desktop-long-session-hidden-entry-move-up", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.locator('[data-long-session-action="primary"]').click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.snapshot().session?.tableIndex)).toBe(1);
  await expect(page.locator("#longSessionStatusBadge")).toContainText("20/40");

  await freezeAtCompletedHand(page);
  await page.evaluate(() => window.LongSessionModeV1.disableNow({ restart: true }));
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(false);
  await expect(page.locator("#longSessionStatusBadge")).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({ ...state.blindLevel }))).toMatchObject({
    small: 10,
    big: 20,
    buyIn: 2000,
  });
});

test("mobile landscape hides Long Session entry while retained decisions stay usable internally", async ({ page }, testInfo) => {
  await loadAt(page, 844, 390);
  await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
  await expect(page.locator(".app-shell")).toBeVisible();
  await freezeAtCompletedHand(page);

  const settingsTab = page.locator('[data-mobile-panel="settings"]');
  await ensureMobileSettingsDrawerOpen(page, settingsTab);

  const mobileToggle = page.locator(".mobile-v1-settings-grid [data-long-session-mobile-toggle]");
  await expect(mobileToggle).toBeHidden();
  await expect(mobileToggle).toHaveAttribute("aria-hidden", "true");
  await expect(mobileToggle).toHaveAttribute("tabindex", "-1");

  await page.evaluate(() => window.LongSessionModeV1.enableNow({ restart: false }));
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(true);
  await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
  await expect(page.locator(".app-shell")).toBeVisible();

  await forceMoveUpDecision(page);
  await assertDecisionFits(page);
  await testInfo.attach("mobile-landscape-long-session-hidden-entry-move-up", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.locator('[data-long-session-action="primary"]').click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.snapshot().session?.tableIndex)).toBe(1);
  await expect(page.locator("#longSessionStatusBadge")).toContainText("20/40");

  await freezeAtCompletedHand(page);
  await page.evaluate(() => window.LongSessionModeV1.disableNow({ restart: true }));
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.isActive())).toBe(false);
  await expect(page.locator("#longSessionStatusBadge")).toBeHidden();
});
