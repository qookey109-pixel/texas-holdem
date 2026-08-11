import { expect, test } from "@playwright/test";

test("右側版面編輯器可直接用叉叉完成編輯", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const layoutButton = page.locator("#layoutButton");
  const panel = page.locator("#layoutEditorPanel");
  const closeButton = page.locator("#layoutEditorCloseButton");

  await expect(panel).toBeHidden();
  await expect(layoutButton).toHaveText(/編輯版面/);

  await layoutButton.click();
  await expect(panel).toBeVisible();
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toHaveAttribute("aria-label", "完成版面編輯");

  await closeButton.click();
  await expect(panel).toBeHidden();
  await expect(layoutButton).toHaveAttribute("aria-pressed", "false");
  await expect(layoutButton).toHaveText(/編輯版面/);

  await layoutButton.click();
  await expect(panel).toBeVisible();
});
