import { expect, test } from "@playwright/test";

const PREVIOUS_OFFICIAL_LAYOUT = {
  seat1: { left: 2.29, top: 73.63 },
  seat2: { left: 1.5, top: 17.5 },
  seat3: { left: 28.25, top: 2 },
  seat4: { left: 57.54, top: 1.89 },
  seat5: { left: 79.66, top: 14.55 },
  seat6: { left: 82.05, top: 62.81 },
  seatCards1: { left: 22.88, top: 59.02 },
  seatCards2: { left: 21.5, top: 37.5 },
  seatCards3: { left: 38.59, top: 26.36 },
  seatCards4: { left: 60.94, top: 26.61 },
  seatCards5: { left: 76.3, top: 35.19 },
  seatCards6: { left: 77.42, top: 54.77 },
  dialogue1: { left: 10.87, top: 67.62 },
  dialogue2: { left: 9, top: 33 },
  dialogue3: { left: 34.41, top: 18.16 },
  dialogue4: { left: 66, top: 18 },
  dialogue5: { left: 90.19, top: 31.6 },
  dialogue6: { left: 92.35, top: 57.17 },
  board: { left: 50, top: 47.55 },
  pot: { left: 50, top: 33.5 },
  stage: { left: 50, top: 39 },
  hero: { left: 50, top: 88 },
  heroCards: { left: 50, top: 65.7 },
  heroPanel: { left: 50, top: 90.46 },
  heroStack: { left: 33.28, top: 90.48 },
  actions: { left: 81.6, top: 89.13 },
};

const PREVIOUS_OFFICIAL_SIZES = {
  heroCard: 92,
  boardCard: 86,
  aiCard: 44,
  aiSeat: 176,
  aiProfile: 272,
};

const PREVIOUS_OFFICIAL_ARROWS = {
  dialogue1: "left",
  dialogue2: "left",
  dialogue3: "up",
  dialogue4: "up",
  dialogue5: "right",
  dialogue6: "right",
};

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

test("V2 官方預設會自動升級到使用者匯出的 V3", async ({ page }) => {
  await page.addInitScript(({ layout, sizes, arrows }) => {
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify(layout));
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify(sizes));
    localStorage.setItem("texasHoldemPotScaleV1", "100");
    localStorage.setItem("texasHoldemDialogueArrowsV1", JSON.stringify(arrows));
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "3");
  }, {
    layout: PREVIOUS_OFFICIAL_LAYOUT,
    sizes: PREVIOUS_OFFICIAL_SIZES,
    arrows: PREVIOUS_OFFICIAL_ARROWS,
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator('script[src="js/official-layout-preset.js?v=official-layout-v3"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset?.version)).toBe("3.0.0");
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.layout.heroCards.top)).toBe(64.57);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.sizes)).toEqual(OFFICIAL_SIZES);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.potScale)).toBe(70);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.arrows)).toEqual(OFFICIAL_ARROWS);

  const migrated = await page.evaluate(() => ({
    layout: localStorage.getItem("texasHoldemTableLayoutV3"),
    sizes: JSON.parse(localStorage.getItem("texasHoldemLayoutSizesV2") || "null"),
    pot: localStorage.getItem("texasHoldemPotScaleV1"),
    arrows: JSON.parse(localStorage.getItem("texasHoldemDialogueArrowsV1") || "null"),
    migration: localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"),
  }));

  expect(migrated.layout).toBeNull();
  expect(migrated.sizes).toEqual(OFFICIAL_SIZES);
  expect(migrated.pot).toBe("70");
  expect(migrated.arrows).toEqual(OFFICIAL_ARROWS);
  expect(migrated.migration).toBe("4");
});

test("玩家自行修改的位置、尺寸、底池與箭頭不會被官方升級覆蓋", async ({ page }) => {
  const customLayout = structuredClone(PREVIOUS_OFFICIAL_LAYOUT);
  customLayout.heroCards.top = 61.4;
  const customSizes = { ...PREVIOUS_OFFICIAL_SIZES, boardCard: 77 };
  const customArrows = { ...PREVIOUS_OFFICIAL_ARROWS, dialogue1: "up" };

  await page.addInitScript(({ layout, sizes, arrows }) => {
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify(layout));
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify(sizes));
    localStorage.setItem("texasHoldemPotScaleV1", "80");
    localStorage.setItem("texasHoldemDialogueArrowsV1", JSON.stringify(arrows));
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "3");
  }, { layout: customLayout, sizes: customSizes, arrows: customArrows });

  await page.goto("/", { waitUntil: "networkidle" });

  const saved = await page.evaluate(() => ({
    layout: JSON.parse(localStorage.getItem("texasHoldemTableLayoutV3") || "null"),
    sizes: JSON.parse(localStorage.getItem("texasHoldemLayoutSizesV2") || "null"),
    pot: localStorage.getItem("texasHoldemPotScaleV1"),
    arrows: JSON.parse(localStorage.getItem("texasHoldemDialogueArrowsV1") || "null"),
    migration: localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"),
  }));

  expect(saved.layout.heroCards.top).toBe(61.4);
  expect(saved.sizes.boardCard).toBe(77);
  expect(saved.pot).toBe("80");
  expect(saved.arrows.dialogue1).toBe("up");
  expect(saved.migration).toBe("4");
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.layout.heroCards.top)).toBe(64.57);
});
