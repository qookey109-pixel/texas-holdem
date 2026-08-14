import { expect, test } from "@playwright/test";

async function openAt(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".app-shell")).toBeVisible();
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

const DESKTOP_VIEWPORTS = [
  { name: "compact 4:3 laptop", width: 1024, height: 768 },
  { name: "compact 16:9 laptop", width: 1280, height: 720 },
  { name: "standard 16:10 laptop", width: 1440, height: 900 },
  { name: "full HD desktop", width: 1920, height: 1080 },
  { name: "ultrawide high resolution", width: 3440, height: 1440 },
];

test.describe("Desktop Responsive Layout V1", () => {
  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`${viewport.name} keeps the table composition inside the viewport`, async ({ page }) => {
      await openAt(page, viewport.width, viewport.height);

      await expect(page.locator("body")).not.toHaveClass(/is-mobile-v1-landscape/);
      await expect(page.locator(".side-rail")).toBeVisible();

      const loadedResponsiveSheet = await page.evaluate(() =>
        Array.from(document.styleSheets).some((sheet) =>
          String(sheet.href || "").includes("desktop-responsive-layout-v1.css")
        )
      );
      expect(loadedResponsiveSheet).toBe(true);

      await expectInsideViewport(page, page.locator(".table"));
      await expectInsideViewport(page, page.locator(".arena"));
      await expectInsideViewport(page, page.locator(".side-rail"));
      await expectInsideViewport(page, page.locator(".board-cards"));
      await expectInsideViewport(page, page.locator("#playerCards"));
      await expectInsideViewport(page, page.locator(".player-panel"));

      const seats = page.locator(".seat");
      await expect(seats).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        await expectInsideViewport(page, seats.nth(index));
      }

      const tableBox = await page.locator(".table").boundingBox();
      const arenaBox = await page.locator(".arena").boundingBox();
      const railBox = await page.locator(".side-rail").boundingBox();
      expect(tableBox).not.toBeNull();
      expect(arenaBox).not.toBeNull();
      expect(railBox).not.toBeNull();
      expect(arenaBox.width).toBeGreaterThan(railBox.width * 2);
      expect(railBox.width).toBeGreaterThanOrEqual(220);
      expect(railBox.width).toBeLessThanOrEqual(322);
    });
  }

  test("component sizing grows smoothly from compact laptop to full HD", async ({ page }) => {
    await openAt(page, 1280, 720);
    const compact = await page.evaluate(() => ({
      seat: document.querySelector(".seat")?.getBoundingClientRect().width || 0,
      boardCard: document.querySelector(".board-cards .card")?.getBoundingClientRect().width || 0,
      rail: document.querySelector(".side-rail")?.getBoundingClientRect().width || 0,
    }));

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator("html")).toHaveAttribute("data-layout-ready", "true");
    const fullHd = await page.evaluate(() => ({
      seat: document.querySelector(".seat")?.getBoundingClientRect().width || 0,
      boardCard: document.querySelector(".board-cards .card")?.getBoundingClientRect().width || 0,
      rail: document.querySelector(".side-rail")?.getBoundingClientRect().width || 0,
    }));

    expect(compact.seat).toBeGreaterThanOrEqual(130);
    expect(fullHd.seat).toBeGreaterThan(compact.seat);
    expect(fullHd.seat).toBeLessThanOrEqual(168);

    expect(compact.boardCard).toBeGreaterThanOrEqual(63);
    expect(fullHd.boardCard).toBeGreaterThan(compact.boardCard);
    expect(fullHd.boardCard).toBeLessThanOrEqual(94);

    expect(compact.rail).toBeGreaterThanOrEqual(220);
    expect(fullHd.rail).toBeGreaterThanOrEqual(compact.rail);
  });

  test("mobile landscape remains owned by Mobile V1 instead of desktop overrides", async ({ page }) => {
    await openAt(page, 844, 390);
    await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);
    await expect(page.locator(".side-rail")).toBeHidden();
    await expect(page.locator(".mobile-v1-dock")).toBeVisible();
  });
});
