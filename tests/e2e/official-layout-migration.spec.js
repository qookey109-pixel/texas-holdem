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
  heroCards: { left: 50, top: 63.2 },
  heroPanel: { left: 50, top: 90.46 },
  heroStack: { left: 33.28, top: 90.48 },
  actions: { left: 81.6, top: 89.13 },
};

const PREVIOUS_OFFICIAL_SIZES = {
  heroCard: 70,
  boardCard: 65,
  aiCard: 52,
  aiSeat: 176,
  aiProfile: 272,
};

test("舊官方預設會自動升級到 V2，不再被舊快取與 localStorage 卡住", async ({ page }) => {
  await page.addInitScript(({ layout, sizes }) => {
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify(layout));
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify(sizes));
    localStorage.setItem("texasHoldemPotScaleV1", "70");
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "2");
  }, { layout: PREVIOUS_OFFICIAL_LAYOUT, sizes: PREVIOUS_OFFICIAL_SIZES });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator('script[src="js/official-layout-preset.js?v=official-layout-v2-1"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset?.version)).toBe("2.1.0");
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.layout.heroCards.top)).toBe(65.7);

  const migrated = await page.evaluate(() => ({
    layout: localStorage.getItem("texasHoldemTableLayoutV3"),
    sizes: localStorage.getItem("texasHoldemLayoutSizesV2"),
    pot: localStorage.getItem("texasHoldemPotScaleV1"),
    migration: localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"),
  }));

  expect(migrated.layout).toBeNull();
  expect(migrated.sizes).toBeNull();
  expect(migrated.pot).toBeNull();
  expect(migrated.migration).toBe("3");
});

test("玩家自行修改的版面不會被官方升級覆蓋", async ({ page }) => {
  const customLayout = structuredClone(PREVIOUS_OFFICIAL_LAYOUT);
  customLayout.heroCards.top = 61.4;

  await page.addInitScript(({ layout }) => {
    localStorage.setItem("texasHoldemTableLayoutV3", JSON.stringify(layout));
    localStorage.setItem("texasHoldemOfficialLayoutPresetVersionV1", "2");
  }, { layout: customLayout });

  await page.goto("/", { waitUntil: "networkidle" });

  const saved = await page.evaluate(() => JSON.parse(
    localStorage.getItem("texasHoldemTableLayoutV3") || "null",
  ));

  expect(saved.heroCards.top).toBe(61.4);
  await expect.poll(() => page.evaluate(() => window.OfficialLayoutPreset.layout.heroCards.top)).toBe(65.7);
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem("texasHoldemOfficialLayoutPresetVersionV1"),
  )).toBe("3");
});
