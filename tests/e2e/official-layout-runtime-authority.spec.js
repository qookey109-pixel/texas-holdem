import { expect, test } from "@playwright/test";

const OFFICIAL_SIZES = {
  heroCard: 70,
  boardCard: 68,
  aiCard: 44,
  aiSeat: 176,
  aiProfile: 272,
};

async function renderedSnapshot(page) {
  return page.evaluate(() => {
    const arena = document.querySelector("#arena");
    const arenaRect = arena.getBoundingClientRect();
    const relativeRect = selector => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return {
        left: Number((rect.left - arenaRect.left).toFixed(2)),
        top: Number((rect.top - arenaRect.top).toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      };
    };

    return {
      seat1: relativeRect(".seat-pos-1"),
      seat3: relativeRect(".seat-pos-3"),
      seat6: relativeRect(".seat-pos-6"),
      board: relativeRect("#boardCards"),
      pot: relativeRect(".pot-chip"),
      heroCards: relativeRect("#playerCards"),
      heroPanel: relativeRect(".player-panel"),
      actions: relativeRect(".controls"),
      sizes: window.LayoutSizeController?.getSizes?.() || null,
      potScale: Number(
        (Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--layout-pot-scale"),
        ) * 100).toFixed(1),
      ),
      preference: localStorage.getItem("texasHoldemLayoutPreferenceV2"),
      runtimeAuthority: window.OfficialLayoutPreset?.runtimeStatus?.() || null,
    };
  });
}

function expectRectsClose(actual, expected, tolerance = 1) {
  for (const key of ["seat1", "seat3", "seat6", "board", "pot", "heroCards", "heroPanel", "actions"]) {
    for (const metric of ["left", "top", "width", "height"]) {
      expect(
        Math.abs(actual[key][metric] - expected[key][metric]),
        `${key}.${metric}: initial=${actual[key][metric]} official=${expected[key][metric]}`,
      ).toBeLessThanOrEqual(tolerance);
    }
  }
}

test("desktop cold boot rendered geometry already equals the official reset result", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.removeItem("texasHoldemTableLayoutV4");
    localStorage.removeItem("texasHoldemLayoutPanelPositionV2");
    localStorage.removeItem("texasHoldemDialogueArrowsV2");
    localStorage.setItem("texasHoldemLayoutPreferenceV2", "official");
    // Deliberately seed the historical controller defaults. Official boot must
    // neutralize them before the table becomes visible.
    localStorage.setItem("texasHoldemLayoutSizesV2", JSON.stringify({
      heroCard: 92,
      boardCard: 86,
      aiCard: 44,
      aiSeat: 176,
      aiProfile: 272,
    }));
    localStorage.setItem("texasHoldemPotScaleV1", "100");
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-official-layout-runtime-ready", "true");
  await expect(page.locator("#arena")).toBeVisible();

  const initial = await renderedSnapshot(page);
  expect(initial.preference).toBe("official");
  expect(initial.sizes).toEqual(OFFICIAL_SIZES);
  expect(initial.potScale).toBe(70);
  expect(initial.runtimeAuthority).toMatchObject({
    version: "1.0.0",
    presetVersion: "4.0.1",
    ready: true,
    mode: "official",
  });

  await page.evaluate(() => {
    window.OfficialLayoutPreset.apply({ persist: true, announceResult: false });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const afterOfficialReset = await renderedSnapshot(page);
  expect(afterOfficialReset.sizes).toEqual(OFFICIAL_SIZES);
  expect(afterOfficialReset.potScale).toBe(70);
  expectRectsClose(initial, afterOfficialReset);
});

test("late controller overwrite cannot survive an official runtime reconcile", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-official-layout-runtime-ready", "true");

  await page.evaluate(() => {
    window.LayoutSizeController.setSize("heroCard", 92, { persist: false });
    window.LayoutSizeController.setSize("boardCard", 86, { persist: false });
    document.documentElement.style.setProperty("--layout-pot-scale", "1.000");
  });

  await page.evaluate(() => {
    window.OfficialLayoutPreset.reconcile({ reason: "e2e-late-overwrite" });
  });

  const recovered = await renderedSnapshot(page);
  expect(recovered.sizes).toEqual(OFFICIAL_SIZES);
  expect(recovered.potScale).toBe(70);
  expect(recovered.runtimeAuthority).toMatchObject({
    version: "1.0.0",
    ready: true,
    mode: "official",
    reason: "e2e-late-overwrite",
  });
});
