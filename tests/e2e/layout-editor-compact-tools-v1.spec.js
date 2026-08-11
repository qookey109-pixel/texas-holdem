import { expect, test } from "@playwright/test";

test("版面編輯器只常駐儲存並將次要工具收進更多工具", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const settingsButton = page.locator("#settingsMenuButton");
  const settingsPanel = page.locator("#settingsMenuPanel");
  const layoutButton = page.locator("#layoutButton");
  const editor = page.locator("#layoutEditorPanel");
  const saveButton = editor.locator("#saveLayoutButton");
  const moreTools = editor.locator("#layoutEditorMoreTools");
  const moreToolsToggle = editor.locator("#layoutEditorMoreToolsToggle");
  const autoButton = editor.locator("#autoLayoutButton");
  const resetButton = editor.locator("#resetLayoutButton");
  const lockButton = editor.locator("#lockLayoutButton");
  const nudge = editor.locator(".layout-nudge");

  await expect.poll(
    () => page.evaluate(() => window.LayoutEditorCompactToolsV1?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.0.0");

  await settingsButton.click();
  await expect(settingsPanel).toBeVisible();
  await layoutButton.click();
  await expect(editor).toBeVisible();

  await expect(saveButton).toBeVisible();
  await expect(moreTools).not.toHaveAttribute("open", "");
  await expect(moreToolsToggle).toBeVisible();
  await expect(autoButton).toBeHidden();
  await expect(resetButton).toBeHidden();
  await expect(lockButton).toBeHidden();
  await expect(nudge).toBeHidden();

  await moreToolsToggle.click();
  await expect(moreTools).toHaveAttribute("open", "");
  await expect(autoButton).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(lockButton).toBeVisible();
  await expect(nudge).toBeVisible();
});
