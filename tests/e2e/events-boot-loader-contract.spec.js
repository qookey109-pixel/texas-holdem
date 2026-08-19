import { expect, test } from "@playwright/test";

async function playerCount(page) {
  return page.evaluate(() => typeof state !== "undefined" ? state.players?.length || 0 : 0);
}

test("critical layout-size loader failure is surfaced and prevents the first hand", async ({ page }) => {
  await page.route("**/js/layout-size-controls.js*", route => route.abort("failed"));
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => document.documentElement.dataset.gameBootState || ""),
    { timeout: 10_000 },
  ).toBe("failed");

  await expect(page.locator("#gameBootFailure")).toBeVisible();
  await expect(page.locator("#gameBootFailure")).toContainText("必要版面模組載入失敗");
  expect(await playerCount(page)).toBe(0);
});

test("optional audio recovery loader failure keeps the game playable", async ({ page }) => {
  await page.route("**/js/audio-recovery.js*", route => route.abort("failed"));
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => document.documentElement.dataset.gameBootState || ""),
    { timeout: 10_000 },
  ).toBe("ready");

  await expect.poll(() => playerCount(page), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator("#gameBootFailure")).toHaveCount(0);
});
