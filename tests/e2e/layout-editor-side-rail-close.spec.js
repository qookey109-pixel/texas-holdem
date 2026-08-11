import { expect, test } from "@playwright/test";

test("右側版面編輯欄可直接按叉叉完成編輯", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const layoutButton = page.locator("#layoutButton");
  const panel = page.locator("#layoutEditorPanel");
  const closeButton = page.locator("#layoutEditorCloseButton");

  await expect.poll(() => closeButton.count()).toBe(1);
  await expect(closeButton).toHaveText("×");
  await expect(closeButton).toHaveAttribute("aria-label", "完成版面編輯");
  await expect(closeButton).toHaveAttribute("title", "完成編輯");

  await page.evaluate(() => document.querySelector("#layoutButton")?.click());
  await expect(layoutButton).toHaveAttribute("aria-pressed", "true");
  await expect(layoutButton).toContainText("完成編輯");
  await expect(panel).toBeVisible();
  await expect(closeButton).toBeVisible();

  const closeGeometry = await closeButton.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const head = button.closest(".layout-panel-head")?.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      insideHeader: Boolean(
        head
        && rect.left >= head.left
        && rect.right <= head.right
        && rect.top >= head.top
        && rect.bottom <= head.bottom
      ),
    };
  });

  expect(closeGeometry.width).toBeGreaterThanOrEqual(28);
  expect(closeGeometry.height).toBeGreaterThanOrEqual(28);
  expect(closeGeometry.insideHeader).toBe(true);

  await closeButton.evaluate(button => button.click());
  await expect(layoutButton).toHaveAttribute("aria-pressed", "false");
  await expect(layoutButton).toContainText("編輯版面");
  await expect(panel).toBeHidden();
});
