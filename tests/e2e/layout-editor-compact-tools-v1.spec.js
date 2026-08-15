import { expect, test } from "@playwright/test";

test("版面編輯器直接顯示常用與調整工具，不需要更多工具", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const settingsButton = page.locator("#settingsMenuButton");
  const settingsPanel = page.locator("#settingsMenuPanel");
  const layoutButton = page.locator("#layoutButton");
  const editor = page.locator("#layoutEditorPanel");
  const saveButton = editor.locator("#saveLayoutButton");
  const autoButton = editor.locator("#autoLayoutButton");
  const resetButton = editor.locator("#resetLayoutButton");
  const lockButton = editor.locator("#lockLayoutButton");
  const nudge = editor.locator(".layout-nudge");

  await expect.poll(
    () => page.evaluate(() => window.LayoutEditorCompactToolsV1?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.LayoutEditorCompactToolsV1?.mode || ""),
    { timeout: 5_000 },
  ).toBe("direct-actions");

  await settingsButton.click();
  await expect(settingsPanel).toBeVisible();
  await layoutButton.click();
  await expect(editor).toBeVisible();

  await expect(saveButton).toBeVisible();
  await expect(autoButton).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(lockButton).toBeVisible();
  await expect(nudge).toBeVisible();
  await expect(editor.locator("#layoutEditorMoreTools")).toHaveCount(0);
  await expect(editor.locator("#layoutEditorMoreToolsToggle")).toHaveCount(0);
  await expect(autoButton).toContainText("套用官方版面");

  const geometry = await editor.evaluate(element => {
    const editorRect = element.getBoundingClientRect();
    const ids = ["saveLayoutButton", "autoLayoutButton", "resetLayoutButton", "lockLayoutButton"];
    return ids.map(id => {
      const rect = element.querySelector(`#${id}`).getBoundingClientRect();
      return {
        id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        editorLeft: editorRect.left,
        editorRight: editorRect.right,
      };
    });
  });

  for (const item of geometry) {
    expect(item.right).toBeGreaterThan(item.left);
    expect(item.bottom).toBeGreaterThan(item.top);
    expect(item.left).toBeGreaterThanOrEqual(item.editorLeft - 1);
    expect(item.right).toBeLessThanOrEqual(item.editorRight + 1);
  }
});
