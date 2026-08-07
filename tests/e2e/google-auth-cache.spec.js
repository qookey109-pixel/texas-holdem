import { expect, test } from "@playwright/test";

test("Google auth stylesheet uses the current cache version", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator('link[data-google-auth-style]')).toHaveAttribute(
    "href",
    "js/google-auth.css?v=google-auth-v1.1",
  );
});
