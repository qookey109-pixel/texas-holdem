import { expect, test } from "@playwright/test";

async function openAt(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-mobile-v1-ready", "true");
}

async function expectInsideViewport(page, locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  return box;
}

test.describe("Mobile V1 responsive shell", () => {
  test("portrait keeps utility entry available while the seven-seat table asks for landscape", async ({ page }) => {
    await openAt(page, 390, 844);

    await expect(page.locator("body")).toHaveClass(/is-mobile-v1-portrait/);
    await expect(page.locator("#desktopOnlyNotice")).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();

    const portraitActions = page.locator(".mobile-v1-portrait-actions");
    await expect(portraitActions).toBeVisible();
    await expect(portraitActions.locator("button")).toHaveCount(3);

    await portraitActions.locator('[data-mobile-portrait-action="tutorial"]').click();
    await expect(page.locator("#tutorialOverlay")).toBeVisible();
    await page.locator("#tutorialCloseButton").click();
    await expect(page.locator("#tutorialOverlay")).toBeHidden();

    const themeBefore = await page.locator("html").getAttribute("data-theme");
    await portraitActions.locator('[data-mobile-portrait-action="theme"]').click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", themeBefore);
  });

  for (const viewport of [
    { name: "compact phone", width: 667, height: 375 },
    { name: "standard phone", width: 844, height: 390 },
    { name: "large phone", width: 932, height: 430 },
    { name: "small landscape tablet", width: 1024, height: 600 },
  ]) {
    test(`${viewport.name} keeps actions, dock and cards inside the viewport`, async ({ page }) => {
      await openAt(page, viewport.width, viewport.height);

      await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
      await expect(page.locator(".app-shell")).toBeVisible();
      await expect(page.locator(".side-rail")).toBeHidden();
      await expect(page.locator(".mobile-v1-dock")).toBeVisible();
      await expect(page.locator(".mobile-v1-bet-toggle")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-layout-ready", "true");

      const controls = page.locator(".controls");
      const dock = page.locator(".mobile-v1-dock");
      const controlsBox = await expectInsideViewport(page, controls);
      const dockBox = await expectInsideViewport(page, dock);
      expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(dockBox.x + 1);

      for (const id of ["foldButton", "callButton", "raiseButton", "allInButton"]) {
        const button = page.locator(`#${id}`);
        const box = await expectInsideViewport(page, button);
        expect(box.height).toBeGreaterThanOrEqual(39);
      }

      await expectInsideViewport(page, page.locator("#playerCards"));
      await expectInsideViewport(page, page.locator(".board-cards"));

      await page.locator(".mobile-v1-bet-toggle").click();
      await expect(page.locator("body")).toHaveClass(/mobile-v1-bet-sizing-open/);
      await expect(page.locator(".raise-control")).toBeVisible();
      await expect(page.locator(".quick-bets")).toBeVisible();
      await expectInsideViewport(page, page.locator(".raise-control"));
      await expectInsideViewport(page, page.locator(".quick-bets"));
    });
  }

  test("coach, history and settings use one accessible mobile drawer", async ({ page }) => {
    await openAt(page, 844, 390);

    const drawer = page.locator(".mobile-v1-drawer");
    const coachTab = page.locator('[data-mobile-panel="coach"]');
    const historyTab = page.locator('[data-mobile-panel="history"]');
    const settingsTab = page.locator('[data-mobile-panel="settings"]');

    await coachTab.click();
    await expect(page.locator("body")).toHaveClass(/mobile-v1-drawer-open/);
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("#coachPanel")).toBeVisible();
    await expect(coachTab).toHaveAttribute("aria-pressed", "true");

    await historyTab.click();
    await expect(drawer.locator("#historyPanel")).toBeVisible();
    await expect(historyTab).toHaveAttribute("aria-pressed", "true");

    await settingsTab.click();
    await expect(drawer.locator(".mobile-v1-settings-grid")).toBeVisible();
    await expect(drawer.locator("[data-mobile-proxy]")).toHaveCount(6);
    await expect(settingsTab).toHaveAttribute("aria-pressed", "true");

    await drawer.locator(".mobile-v1-drawer-close").click();
    await expect(page.locator("body")).not.toHaveClass(/mobile-v1-drawer-open/);
    await expect(page.locator(".side-rail #coachPanel")).toHaveCount(1);
    await expect(page.locator(".side-rail #historyPanel")).toHaveCount(1);
  });

  test("rotating from portrait to landscape restores the table without a reload", async ({ page }) => {
    await openAt(page, 390, 844);
    await expect(page.locator("body")).toHaveClass(/is-mobile-v1-portrait/);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
    await expect(page.locator("body")).not.toHaveClass(/is-desktop-only-blocked/);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator("#playerCards .card")).toHaveCount(2);
  });
});
