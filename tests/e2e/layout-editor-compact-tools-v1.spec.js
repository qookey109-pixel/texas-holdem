import { expect, test } from "@playwright/test";

async function openLayoutEditor(page) {
  const settingsButton = page.locator("#settingsMenuButton");
  const settingsPanel = page.locator("#settingsMenuPanel");
  const layoutButton = page.locator("#layoutButton");
  const editor = page.locator("#layoutEditorPanel");

  if (!(await settingsPanel.isVisible())) {
    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
  }
  if (!(await editor.isVisible())) {
    await layoutButton.click();
    await expect(editor).toBeVisible();
  }

  return editor;
}

test("版面編輯器直接顯示常用與調整工具，不需要更多工具", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const editor = await openLayoutEditor(page);
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

  await expect(saveButton).toBeVisible();
  await expect(autoButton).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(lockButton).toBeVisible();
  await expect(nudge).toBeVisible();
  await expect(editor.locator("#layoutEditorMoreTools")).toHaveCount(0);
  await expect(editor.locator("#layoutEditorMoreToolsToggle")).toHaveCount(0);
  await expect(autoButton).toContainText("套用官方版面");
  await expect(resetButton).toContainText("官方預設");

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

test("舊 V1 或未標記的舊 V3 不再覆蓋官方啟動版面", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemTableLayoutV1", JSON.stringify({
      actions: { left: 12, top: 12 },
    }));
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify({
      actions: { left: 22, top: 22 },
    }));
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "4");
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({
    left: 81.6,
    top: 89.13,
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemTableLayoutV1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV1"))).toBe("official");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"))).toBe("5");
});

test("官方模式自動進官方版面；只有按儲存版面後才保留自訂位置", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const fresh = await page.evaluate(() => ({
    version: window.OfficialLayoutPreset.version,
    officialSeat1: window.OfficialLayoutPreset.layout.seat1,
    officialActions: window.OfficialLayoutPreset.layout.actions,
    seat1: state.layout.items.seat1,
    actions: state.layout.items.actions,
    preference: localStorage.getItem("texasHoldemLayoutPreferenceV1"),
  }));

  expect(fresh.version).toBe("3.1.0");
  expect(fresh.seat1).toEqual(fresh.officialSeat1);
  expect(fresh.actions).toEqual(fresh.officialActions);
  expect(fresh.preference).toBe("official");

  await page.evaluate(() => {
    state.layout.items.actions = { left: 72.25, top: 76.5 };
    applyLayout();
  });

  const editor = await openLayoutEditor(page);
  const saveButton = editor.locator("#saveLayoutButton");
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV1"))).toBe("custom");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("texasHoldemTableLayoutV3") || "null");
    return saved?.actions || null;
  })).toEqual({ left: 72.25, top: 76.5 });

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => state.layout.items.actions.left)).toBe(72.25);
  await expect.poll(() => page.evaluate(() => state.layout.items.actions.top)).toBe(76.5);

  const editorAfterReload = await openLayoutEditor(page);
  const autoButton = editorAfterReload.locator("#autoLayoutButton");
  await expect(autoButton).toBeVisible();
  await autoButton.click();

  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({ left: 81.6, top: 89.13 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV1"))).toBe("official");

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => state.layout.items.seat1)).toEqual({ left: 2.29, top: 73.63 });
  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({ left: 81.6, top: 89.13 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV1"))).toBe("official");
});
