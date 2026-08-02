import { expect, test } from "@playwright/test";

test("牌局復盤整合進撲克教練並可獨立開關", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("texasHoldemCoachHandReviewEnabledV1");
  });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.CoachHandReviewIntegration?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const toggle = page.locator("#coachReviewToggle");
  const reviewCard = page.locator('[data-coach-card="review"]');
  const reviewPanel = page.locator("#handReviewPanel");

  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect(reviewCard).toBeVisible();
  expect(await reviewPanel.evaluate(element => element.parentElement?.id)).toBe("coachReviewMount");
  expect(await page.locator("#historyPanel #handReviewPanel").count()).toBe(0);

  await page.evaluate(() => {
    HandReview.publishReview({
      showdown: false,
      winners: [],
      potSize: 120,
      heroAwarded: 0,
    });
  });

  await expect(reviewPanel).toBeVisible();
  await expect(reviewPanel).toContainText("本手覆盤");
  await expect(page.locator("#coachReviewState")).toContainText("第");

  await toggle.uncheck();
  await expect(reviewCard).toBeHidden();
  await expect.poll(() => page.evaluate(() => state.coach.review)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("texasHoldemCoachHandReviewEnabledV1"))).toBe("false");

  await toggle.check();
  await expect(reviewCard).toBeVisible();
  await expect(reviewPanel).toBeVisible();
  await expect.poll(() => page.evaluate(() => state.coach.review)).toBe(true);

  await page.locator("#coachOddsToggle").uncheck();
  await page.locator("#coachAdviceToggle").uncheck();
  await expect(page.locator("#coachContent")).toBeVisible();
  await expect(reviewCard).toBeVisible();
  await expect(page.locator('[data-coach-card="odds"]')).toBeHidden();
  await expect(page.locator('[data-coach-card="advice"]')).toBeHidden();
});

test("牌局復盤開關會在重新整理後保留", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemCoachHandReviewEnabledV1", "false");
  });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.CoachHandReviewIntegration?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  await expect(page.locator("#coachReviewToggle")).not.toBeChecked();
  await expect(page.locator('[data-coach-card="review"]')).toBeHidden();
  expect(await page.evaluate(() => state.coach.review)).toBe(false);

  await page.locator("#coachReviewToggle").check();
  await page.reload({ waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.CoachHandReviewIntegration?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");
  await expect(page.locator("#coachReviewToggle")).toBeChecked();
  await expect(page.locator('[data-coach-card="review"]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("texasHoldemCoachHandReviewEnabledV1"))).toBe("true");
});
