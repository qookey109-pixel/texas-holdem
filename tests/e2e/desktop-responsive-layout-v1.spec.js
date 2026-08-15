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

async function expectAllSeatsInsideViewport(page, tolerance = 2) {
  const snapshot = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    seats: Array.from(document.querySelectorAll(".seat"), (seat) => {
      const rect = seat.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }),
  }));

  expect(snapshot.seats).toHaveLength(6);
  for (const box of snapshot.seats) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(-tolerance);
    expect(box.y).toBeGreaterThanOrEqual(-tolerance);
    expect(box.x + box.width).toBeLessThanOrEqual(snapshot.viewport.width + tolerance);
    expect(box.y + box.height).toBeLessThanOrEqual(snapshot.viewport.height + tolerance);
  }
}

async function readComputedSizing(page) {
  return page.evaluate(() => {
    const widthOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return 0;
      return Number.parseFloat(getComputedStyle(element).width || "0");
    };
    const saved = window.LayoutSizeController?.getSizes?.() || {};

    return {
      seat: widthOf(".seat"),
      boardCard: widthOf(".board-cards .card"),
      heroCard: widthOf("#playerCards .card"),
      rail: widthOf(".side-rail"),
      savedSeat: Number(saved.aiSeat) || 0,
      savedBoardCard: Number(saved.boardCard) || 0,
      savedHeroCard: Number(saved.heroCard) || 0,
    };
  });
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

      await expectInsideViewport(page, page.locator(".table"));
      await expectInsideViewport(page, page.locator(".arena"));
      await expectInsideViewport(page, page.locator(".side-rail"));
      await expectInsideViewport(page, page.locator(".board-cards"));
      await expectInsideViewport(page, page.locator("#playerCards"));
      await expectInsideViewport(page, page.locator(".player-panel"));
      await expectAllSeatsInsideViewport(page);

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

  test("saved layout sizes remain preferences while responsive caps fit the viewport", async ({ page }) => {
    await openAt(page, 1280, 720);
    const compact = await readComputedSizing(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator("html")).toHaveAttribute("data-layout-ready", "true");
    const fullHd = await readComputedSizing(page);

    // Resizing must not mutate the user's stored layout preferences.
    expect(fullHd.savedSeat).toBe(compact.savedSeat);
    expect(fullHd.savedBoardCard).toBe(compact.savedBoardCard);
    expect(fullHd.savedHeroCard).toBe(compact.savedHeroCard);

    // Existing editor contract ranges from js/layout-size-controls.js.
    expect(compact.savedSeat).toBeGreaterThanOrEqual(150);
    expect(compact.savedSeat).toBeLessThanOrEqual(210);
    expect(compact.savedBoardCard).toBeGreaterThanOrEqual(65);
    expect(compact.savedBoardCard).toBeLessThanOrEqual(105);
    expect(compact.savedHeroCard).toBeGreaterThanOrEqual(70);
    expect(compact.savedHeroCard).toBeLessThanOrEqual(115);

    // Effective sizes may be capped by viewport height/width, but must stay legal,
    // never exceed the saved preference, and must not shrink when the viewport grows.
    expect(compact.seat).toBeGreaterThanOrEqual(149);
    expect(compact.seat).toBeLessThanOrEqual(compact.savedSeat + 1);
    expect(fullHd.seat).toBeGreaterThanOrEqual(compact.seat - 1);
    expect(fullHd.seat).toBeLessThanOrEqual(fullHd.savedSeat + 1);

    expect(compact.boardCard).toBeGreaterThanOrEqual(65);
    expect(compact.boardCard).toBeLessThanOrEqual(compact.savedBoardCard + 1);
    expect(fullHd.boardCard).toBeGreaterThanOrEqual(compact.boardCard - 1);
    expect(fullHd.boardCard).toBeLessThanOrEqual(fullHd.savedBoardCard + 1);

    expect(compact.heroCard).toBeGreaterThanOrEqual(70);
    expect(compact.heroCard).toBeLessThanOrEqual(compact.savedHeroCard + 1);
    expect(fullHd.heroCard).toBeGreaterThanOrEqual(compact.heroCard - 1);
    expect(fullHd.heroCard).toBeLessThanOrEqual(fullHd.savedHeroCard + 1);

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
