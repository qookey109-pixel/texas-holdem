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

  const halfPot = page.locator('.quick-bets button[data-bet="half"]');
  await page.evaluate(() => {
    const button = document.querySelector('.quick-bets button[data-bet="half"]');
    window.UiPolishAccessibilityV1.setQuickBetSelection(button);
  });
  await expect(halfPot).toHaveAttribute("aria-pressed", "true");
  await expect(halfPot).toHaveClass(/is-selected/);
  await expect(page.locator('.quick-bets button[data-bet="third"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.quick-bets button[data-bet="pot"]')).toHaveAttribute("aria-pressed", "false");

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

  await page.locator("#tutorialCloseButton").click();
  await page.waitForTimeout(30);
  await expect(tutorialOverlay).toBeVisible();
  await expect(tutorialOverlay).toHaveClass(/ui-polish-closing/);
  await expect(tutorialOverlay).toBeHidden({ timeout: 1_000 });
  await expect(tutorialButton).toHaveAttribute("aria-pressed", "false");

  const summaryOverlay = page.locator("#sessionSummaryOverlay");
  await summaryOverlay.evaluate(element => { element.hidden = false; });
  await expect(summaryOverlay).toBeVisible();
  expect(await summaryOverlay.evaluate(element => getComputedStyle(element).animationName)).toContain("uiPolishOverlayIn");
  expect(await page.locator(".session-summary-modal").evaluate(element => getComputedStyle(element).animationName)).toContain("uiPolishModalIn");
  await summaryOverlay.evaluate(element => { element.hidden = true; });

  await expect(page.locator("#autoLayoutButton")).toHaveText("📐 套用官方版面");
  await expect(page.locator("#autoLayoutButton")).toHaveAttribute("aria-label", "套用官方版面");
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
