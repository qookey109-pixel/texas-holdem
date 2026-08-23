import { expect, test } from "@playwright/test";

async function waitForUiPolish(page) {
  await expect.poll(
    () => page.evaluate(() => window.UiPolishAccessibilityV1?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.0.0");
}

test("UI polish adds control semantics, selected quick bets, and modal motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await waitForUiPolish(page);

  const tutorialButton = page.locator("#tutorialButton");
  const tutorialOverlay = page.locator("#tutorialOverlay");
  await expect(tutorialButton).toHaveAttribute("aria-pressed", "false");

  const quickBets = page.locator(".quick-bets button[data-bet]");
  for (const button of await quickBets.all()) {
    await expect(button).toHaveAttribute("aria-pressed", "false");
  }

  const quickBetSelection = await page.evaluate(() => {
    const half = document.querySelector('.quick-bets button[data-bet="half"]');
    const third = document.querySelector('.quick-bets button[data-bet="third"]');
    const pot = document.querySelector('.quick-bets button[data-bet="pot"]');
    window.UiPolishAccessibilityV1.setQuickBetSelection(half);
    return {
      halfPressed: half?.getAttribute("aria-pressed"),
      halfSelected: half?.classList.contains("is-selected"),
      thirdPressed: third?.getAttribute("aria-pressed"),
      potPressed: pot?.getAttribute("aria-pressed"),
    };
  });
  expect(quickBetSelection).toEqual({
    halfPressed: "true",
    halfSelected: true,
    thirdPressed: "false",
    potPressed: "false",
  });

  await page.locator("#raiseAmount").evaluate(slider => {
    slider.value = slider.min;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (const button of await quickBets.all()) {
    await expect(button).toHaveAttribute("aria-pressed", "false");
  }

  await tutorialButton.click();
  await expect(tutorialOverlay).toBeVisible();
  await expect(tutorialButton).toHaveAttribute("aria-pressed", "true");
  expect(await tutorialOverlay.evaluate(element => getComputedStyle(element).animationName)).toContain("uiPolishOverlayIn");
  expect(await page.locator(".tutorial-modal").evaluate(element => getComputedStyle(element).animationName)).toContain("uiPolishModalIn");

  const closeState = await page.locator("#tutorialCloseButton").evaluate(button => {
    button.click();
    const overlay = document.querySelector("#tutorialOverlay");
    return {
      hidden: Boolean(overlay?.hidden),
      closing: Boolean(overlay?.classList.contains("ui-polish-closing")),
    };
  });
  expect(closeState).toEqual({ hidden: false, closing: true });
  await expect(tutorialOverlay).toBeHidden({ timeout: 1_000 });
  await expect(tutorialButton).toHaveAttribute("aria-pressed", "false");

  const summaryOverlay = page.locator("#sessionSummaryOverlay");
  await summaryOverlay.evaluate(element => { element.hidden = false; });
  await expect(summaryOverlay).toBeVisible();
  expect(await summaryOverlay.evaluate(element => getComputedStyle(element).animationName)).toContain("uiPolishOverlayIn");
  expect(await page.locator(".session-summary-modal").evaluate(element => getComputedStyle(element).animationName)).toContain("uiPolishModalIn");
  await summaryOverlay.evaluate(element => { element.hidden = true; });

  await expect(page.locator("#autoLayoutButton")).toHaveCount(0);
  await expect(page.locator("#resetLayoutButton")).toHaveText("⭐ 官方預設");
});

test("reduced-motion collapses core table and modal animation durations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await waitForUiPolish(page);

  const durations = await page.evaluate(() => {
    const toMs = value => {
      const first = String(value || "0s").split(",")[0].trim();
      if (first.endsWith("ms")) return Number.parseFloat(first) || 0;
      if (first.endsWith("s")) return (Number.parseFloat(first) || 0) * 1000;
      return Number.parseFloat(first) || 0;
    };

    const tableLight = getComputedStyle(document.querySelector(".table-light"));
    const layoutItem = getComputedStyle(document.querySelector("#arena [data-layout-key]"));
    const tutorial = document.querySelector("#tutorialOverlay");
    tutorial.hidden = false;
    const tutorialStyle = getComputedStyle(tutorial);
    tutorial.hidden = true;

    return {
      tableAnimationMs: toMs(tableLight.animationDuration),
      layoutTransitionMs: toMs(layoutItem.transitionDuration),
      tutorialAnimationMs: toMs(tutorialStyle.animationDuration),
    };
  });

  expect(durations.tableAnimationMs).toBeLessThanOrEqual(0.02);
  expect(durations.layoutTransitionMs).toBeLessThanOrEqual(0.02);
  expect(durations.tutorialAnimationMs).toBeLessThanOrEqual(0.02);
  expect(await page.evaluate(() => window.UiPolishAccessibilityV1.isReducedMotion())).toBe(true);
});
