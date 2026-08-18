import { expect, test } from "@playwright/test";

const OFFICIAL_SIZES = {
  heroCard: 70,
  boardCard: 68,
  aiCard: 44,
  aiSeat: 176,
  aiProfile: 272,
};

const OFFICIAL_ARROWS = {
  dialogue1: "down",
  dialogue2: "up",
  dialogue3: "up",
  dialogue4: "up",
  dialogue5: "up",
  dialogue6: "down",
};

test("Layout V4 一次退役舊 layout generation 並從官方基線啟動", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemTableLayoutV1", JSON.stringify({ actions: { left: 12, top: 12 } }));
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify({ actions: { left: 22, top: 22 } }));
    localStorage.setItem("texasHoldemLayoutPanelPositionV1", JSON.stringify({ left: 30, top: 240 }));
    localStorage.setItem("texasHoldemDialogueArrowsV1", JSON.stringify({ dialogue1: "left" }));
    localStorage.setItem("texasHoldemLayoutPreferenceV1", "custom");
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "5");
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify({
      heroCard: 100,
      boardCard: 90,
      aiCard: 50,
      aiSeat: 200,
      aiProfile: 300,
    }));
    localStorage.setItem("texasHoldemPotScaleV1", "120");
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator('script[src="js/official-layout-preset.js?v=official-layout-runtime-authority-v1"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset?.version)).toBe("4.0.1");
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset?.runtimeAuthorityVersion)).toBe("1.0.0");
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset?.storageGeneration)).toBe("V4");
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.layout.heroCards.top)).toBe(64.57);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.sizes)).toEqual(OFFICIAL_SIZES);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.potScale)).toBe(70);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.arrows)).toEqual(OFFICIAL_ARROWS);
  await expect.poll(() => page.evaluate(() => state.layout.items.actions)).toEqual({ left: 81.6, top: 89.13 });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.layoutStartupApplied)).toBe("true");
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-official-layout-runtime-ready"))).toBe("true");

  const runtimeLayout = await page.evaluate(() => {
    const arena = document.querySelector("#arena");
    return {
      actionsLeft: arena.style.getPropertyValue("--layout-actions-left").trim(),
      actionsTop: arena.style.getPropertyValue("--layout-actions-top").trim(),
      boardLeft: arena.style.getPropertyValue("--layout-board-left").trim(),
      boardTop: arena.style.getPropertyValue("--layout-board-top").trim(),
      seat1Left: arena.style.getPropertyValue("--layout-seat1-left").trim(),
      seat1Top: arena.style.getPropertyValue("--layout-seat1-top").trim(),
    };
  });

  expect(runtimeLayout).toEqual({
    actionsLeft: "81.6%",
    actionsTop: "89.13%",
    boardLeft: "50%",
    boardTop: "46.55%",
    seat1Left: "2.29%",
    seat1Top: "73.63%",
  });

  const storage = await page.evaluate(() => ({
    oldV1: localStorage.getItem("texasHoldemTableLayoutV1"),
    oldV3: localStorage.getItem("texasHoldemTableLayoutV3"),
    oldPanel: localStorage.getItem("texasHoldemLayoutPanelPositionV1"),
    oldArrows: localStorage.getItem("texasHoldemDialogueArrowsV1"),
    oldPreference: localStorage.getItem("texasHoldemLayoutPreferenceV1"),
    oldMigration: localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"),
    v4Layout: localStorage.getItem("texasHoldemTableLayoutV4"),
    v4Panel: localStorage.getItem("texasHoldemLayoutPanelPositionV2"),
    v4Arrows: localStorage.getItem("texasHoldemDialogueArrowsV2"),
    v4Preference: localStorage.getItem("texasHoldemLayoutPreferenceV2"),
    sizes: JSON.parse(localStorage.getItem("texasHoldemLayoutSizesV2") || "null"),
    pot: localStorage.getItem("texasHoldemPotScaleV1"),
  }));

  expect(storage.oldV1).toBeNull();
  expect(storage.oldV3).toBeNull();
  expect(storage.oldPanel).toBeNull();
  expect(storage.oldArrows).toBeNull();
  expect(storage.oldPreference).toBeNull();
  expect(storage.oldMigration).toBeNull();
  expect(storage.v4Layout).toBeNull();
  expect(storage.v4Panel).toBeNull();
  expect(storage.v4Arrows).toBeNull();
  expect(storage.v4Preference).toBe("official");
  expect(storage.sizes).toEqual(OFFICIAL_SIZES);
  expect(storage.pot).toBe("70");
});

test("不完整的 V4 custom 狀態不會把舊面板或尺寸帶回官方模式", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemLayoutPreferenceV2", "custom");
    localStorage.setItem("texasHoldemLayoutPanelPositionV2", JSON.stringify({ left: 18, top: 180 }));
    localStorage.setItem("texasHoldemDialogueArrowsV2", JSON.stringify({ dialogue1: "left" }));
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify({
      heroCard: 110,
      boardCard: 100,
      aiCard: 55,
      aiSeat: 205,
      aiProfile: 320,
    }));
    localStorage.setItem("texasHoldemPotScaleV1", "140");
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPreferenceV2"))).toBe("official");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemTableLayoutV4"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemLayoutPanelPositionV2"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemDialogueArrowsV2"))).toBeNull();
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.top)).toBeLessThanOrEqual(64.57);
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.top)).toBeGreaterThan(61.5);
  await expect.poll(() => page.evaluate(() => state.layout.arrows.dialogue1)).toBe("down");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("texasHoldemLayoutSizesV2")))).toEqual(OFFICIAL_SIZES);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("texasHoldemPotScaleV1"))).toBe("70");
  await expect.poll(() => page.evaluate(() => document.querySelector("#arena").style.getPropertyValue("--layout-actions-left").trim())).toBe("81.6%");
});

test("只有目前 V4 明確 custom 會保留玩家位置、面板、尺寸、底池與箭頭", async ({ page }) => {
  const customLayout = {
    heroCards: { left: 50, top: 61.4 },
    actions: { left: 70.25, top: 78.5 },
  };
  const customSizes = {
    heroCard: 84,
    boardCard: 77,
    aiCard: 41,
    aiSeat: 184,
    aiProfile: 286,
  };
  const customArrows = { dialogue1: "left", dialogue6: "right" };
  const customPanel = { left: 42, top: 28 };

  await page.addInitScript(({ layout, sizes, arrows, panel }) => {
    localStorage.setItem("texasHoldemTableLayoutV4", JSON.stringify(layout));
    localStorage.setItem("texasHoldemLayoutPanelPositionV2", JSON.stringify(panel));
    localStorage.setItem("texasHoldemDialogueArrowsV2", JSON.stringify(arrows));
    localStorage.setItem("texasHoldemLayoutPreferenceV2", "custom");
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify(sizes));
    localStorage.setItem("texasHoldemPotScaleV1", "80");
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify({ actions: { left: 9, top: 9 } }));
  }, { layout: customLayout, sizes: customSizes, arrows: customArrows, panel: customPanel });

  await page.goto("/", { waitUntil: "networkidle" });

  const saved = await page.evaluate(() => ({
    layout: JSON.parse(localStorage.getItem("texasHoldemTableLayoutV4") || "null"),
    panel: JSON.parse(localStorage.getItem("texasHoldemLayoutPanelPositionV2") || "null"),
    sizes: JSON.parse(localStorage.getItem("texasHoldemLayoutSizesV2") || "null"),
    pot: localStorage.getItem("texasHoldemPotScaleV1"),
    arrows: JSON.parse(localStorage.getItem("texasHoldemDialogueArrowsV2") || "null"),
    preference: localStorage.getItem("texasHoldemLayoutPreferenceV2"),
    oldV3: localStorage.getItem("texasHoldemTableLayoutV3"),
    stateActions: state.layout.items.actions,
    stateHeroCards: state.layout.items.heroCards,
    stateDialogue1: state.layout.arrows.dialogue1,
    runtimeActionsLeft: document.querySelector("#arena").style.getPropertyValue("--layout-actions-left").trim(),
    runtimeActionsTop: document.querySelector("#arena").style.getPropertyValue("--layout-actions-top").trim(),
  }));

  expect(saved.layout.actions).toEqual(customLayout.actions);
  expect(saved.layout.heroCards).toEqual(customLayout.heroCards);
  expect(saved.panel).toEqual(customPanel);
  expect(saved.sizes).toEqual(customSizes);
  expect(saved.pot).toBe("80");
  expect(saved.arrows).toEqual(customArrows);
  expect(saved.preference).toBe("custom");
  expect(saved.oldV3).toBeNull();
  expect(saved.stateActions).toEqual(customLayout.actions);
  expect(saved.stateHeroCards.left).toBe(customLayout.heroCards.left);
  expect(saved.stateHeroCards.top).toBeLessThanOrEqual(customLayout.heroCards.top);
  expect(saved.stateHeroCards.top).toBeGreaterThan(customLayout.heroCards.top - 3);
  expect(saved.stateDialogue1).toBe("left");
  expect(saved.runtimeActionsLeft).toBe("70.25%");
  expect(saved.runtimeActionsTop).toBe("78.5%");
  await expect.poll(() => page.locator("[data-layout-size='boardCard']").inputValue()).toBe("77");
});