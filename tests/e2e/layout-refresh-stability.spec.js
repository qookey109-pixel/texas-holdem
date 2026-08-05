import { expect, test } from "@playwright/test";

test("重新整理時會等版面與尺寸套用完成後再顯示牌桌", async ({ page }) => {
  await page.route("**/js/layout-size-controls.js*", async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.layoutReady || ""
  ))).toBe("");
  await expect(page.locator("#arena")).toHaveCSS("visibility", "hidden");

  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.layoutReady || ""
  )), { timeout: 5_000 }).toBe("true");
  await expect(page.locator("#arena")).toHaveCSS("visibility", "visible");

  const dimensions = await page.evaluate(() => ({
    heroCard: getComputedStyle(document.documentElement).getPropertyValue("--layout-hero-card-width").trim(),
    boardCard: getComputedStyle(document.documentElement).getPropertyValue("--layout-board-card-width").trim(),
    potScale: getComputedStyle(document.documentElement).getPropertyValue("--layout-pot-scale").trim(),
  }));

  expect(dimensions).toEqual({
    heroCard: "70px",
    boardCard: "68px",
    potScale: "0.700",
  });
});
