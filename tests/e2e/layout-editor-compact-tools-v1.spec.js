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

test("版面編輯器直接顯示常用工具，官方版面只保留一個操作", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const editor = await openLayoutEditor(page);
  const saveButton = editor.locator("#saveLayoutButton");
  const resetButton = editor.locator("#resetLayoutButton");
  const lockButton = editor.locator("#lockLayoutButton");
  const nudge = editor.locator(".layout-nudge");

  await expect.poll(
    () => page.evaluate(() => window.LayoutEditorCompactToolsV1?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.1.0");
  await expect.poll(
    () => page.evaluate(() => window.LayoutEditorCompactToolsV1?.mode || ""),
    { timeout: 5_000 },
  ).toBe("direct-actions-single-official");

  await expect(saveButton).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(lockButton).toBeVisible();
  await expect(nudge).toBeVisible();
  await expect(editor.locator("#layoutEditorMoreTools")).toHaveCount(0);
  await expect(editor.locator("#layoutEditorMoreToolsToggle")).toHaveCount(0);
  await expect(editor.locator("#autoLayoutButton")).toHaveCount(0);
  await expect(resetButton).toContainText("官方預設");

  const geometry = await editor.evaluate(element => {
    const editorRect = element.getBoundingClientRect();
    const ids = ["saveLayoutButton", "resetLayoutButton", "lockLayoutButton"];
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

test("Layout V4 會退役舊 V1/V3 與舊面板位置，直接使用官方啟動版面", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemTableLayoutV1", JSON.stringify({
      actions: { left: 12, top: 12 },
    }));
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify({
      actions: { left: 22, top: 22 },
    }));
    localStorage.setItem("texasHoldemLayoutPanelPositionV1", JSON.stringify({ left: 28, top: 220 }));
    localStorage.setItem("texasHoldemDialogueArrowsV1", JSON.stringify({ dialogue1: "left" }));
    localStorage.setItem("texasHoldemLayoutPreferenceV1", "custom");
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "5");
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({
    left: 81.6,
    top: 89.13,
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemTableLayoutV1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemTableLayoutV3"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPanelPositionV1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemDialogueArrowsV1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemTableLayoutV4"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPanelPositionV2"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV2"))).toBe("official");
});

test("官方模式自動進官方版面；只有按儲存版面後才建立 V4 自訂位置", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  const fresh = await page.evaluate(() => ({
    version: window.OfficialLayoutPreset.version,
    generation: window.OfficialLayoutPreset.storageGeneration,
    officialSeat1: window.OfficialLayoutPreset.layout.seat1,
    officialActions: window.OfficialLayoutPreset.layout.actions,
    seat1: state.layout.items.seat1,
    actions: state.layout.items.actions,
    preference: localStorage.getItem("texasHoldemLayoutPreferenceV2"),
    savedLayout: localStorage.getItem("texasHoldemTableLayoutV4"),
    savedPanel: localStorage.getItem("texasHoldemLayoutPanelPositionV2"),
  }));

  expect(fresh.version).toBe("4.0.0");
  expect(fresh.generation).toBe("V4");
  expect(fresh.seat1).toEqual(fresh.officialSeat1);
  expect(fresh.actions).toEqual(fresh.officialActions);
  expect(fresh.preference).toBe("official");
  expect(fresh.savedLayout).toBeNull();
  expect(fresh.savedPanel).toBeNull();

  await page.evaluate(() => {
    state.layout.items.actions = { left: 72.25, top: 76.5 };
    state.layout.panel = { left: 48, top: 36 };
    applyLayout();
  });

  const editor = await openLayoutEditor(page);
  const saveButton = editor.locator("#saveLayoutButton");
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV2"))).toBe("custom");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("texasHoldemTableLayoutV4") || "null");
    return saved?.actions || null;
  })).toEqual({ left: 72.25, top: 76.5 });
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("texasHoldemLayoutPanelPositionV2")))).toBe(true);

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => state.layout.items.actions.left)).toBe(72.25);
  await expect.poll(() => page.evaluate(() => state.layout.items.actions.top)).toBe(76.5);

  const editorAfterReload = await openLayoutEditor(page);
  const resetButton = editorAfterReload.locator("#resetLayoutButton");
  await expect(resetButton).toBeVisible();
  await expect(editorAfterReload.locator("#autoLayoutButton")).toHaveCount(0);
  await resetButton.click();

  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({ left: 81.6, top: 89.13 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV2"))).toBe("official");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemTableLayoutV4"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPanelPositionV2"))).toBeNull();

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => state.layout.items.seat1)).toEqual({ left: 2.29, top: 73.63 });
  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({ left: 81.6, top: 89.13 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV2"))).toBe("official");
});