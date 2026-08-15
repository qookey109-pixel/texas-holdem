import { expect, test } from "@playwright/test";

async function forceHeroTurn(page) {
  await page.evaluate(() => {
    const hero = state.players[0];
    state.handOver = false;
    state.waitingForHuman = true;
    state.currentActorIndex = 0;
    state.pot = 600;
    state.currentBet = 100;
    hero.folded = false;
    hero.allIn = false;
    hero.raiseLocked = false;
    hero.stack = 5000;
    hero.bet = 0;
    render();
  });
}

test.describe("Bet Controls V2", () => {
  test("shows clear action amounts and quick bets only select a legal raise target", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => window.BetInfoUI?.version || null)).toBe("4.0.0");
    await forceHeroTurn(page);

    const controls = page.locator(".controls");
    await expect(controls).toHaveClass(/bet-controls-v2/);
    await expect(page.locator(".table")).toHaveClass(/is-human-turn/);

    await expect(page.locator("#foldButton")).toBeEnabled();
    await expect(page.locator("#callButton")).toBeEnabled();
    await expect(page.locator("#raiseButton")).toBeEnabled();
    await expect(page.locator("#allInButton")).toBeEnabled();

    await expect(page.locator("#callButton")).toContainText(/跟注|過牌/);
    await expect(page.locator("#raiseButton")).toContainText(/^加注至 [\d,]+$/);
    await expect(page.locator("#allInButton")).toContainText(/^All-in · [\d,]+$/);
    await expect(page.locator(".raise-caption")).toHaveText("加注至");

    const quickButtons = page.locator(".quick-bets button[data-bet]");
    await expect(quickButtons).toHaveCount(4);
    await expect(page.locator('[data-bet="third"] .quick-bet-label')).toHaveText("33%");
    await expect(page.locator('[data-bet="half"] .quick-bet-label')).toHaveText("50%");
    await expect(page.locator('[data-bet="threeQuarter"] .quick-bet-label')).toHaveText("75%");
    await expect(page.locator('[data-bet="pot"] .quick-bet-label')).toHaveText("Pot");

    const targets = await page.evaluate(() => window.BetInfoUI.quickTargets());
    expect(targets.third.raiseBy).toBeLessThanOrEqual(targets.half.raiseBy);
    expect(targets.half.raiseBy).toBeLessThanOrEqual(targets.threeQuarter.raiseBy);
    expect(targets.threeQuarter.raiseBy).toBeLessThanOrEqual(targets.pot.raiseBy);

    const before = await page.evaluate(() => ({
      pot: state.pot,
      stack: state.players[0].stack,
      bet: state.players[0].bet,
    }));

    await page.locator('[data-bet="threeQuarter"]').click();
    await expect(page.locator('[data-bet="threeQuarter"]')).toHaveClass(/is-selected/);
    await expect(page.locator("#raiseAmount")).toHaveValue(String(targets.threeQuarter.raiseBy));
    await expect(page.locator("#raiseButton")).toHaveText(`加注至 ${targets.threeQuarter.target.toLocaleString("zh-TW")}`);

    const after = await page.evaluate(() => ({
      pot: state.pot,
      stack: state.players[0].stack,
      bet: state.players[0].bet,
    }));
    expect(after).toEqual(before);

    const slider = page.locator("#raiseAmount");
    const minimum = Number(await slider.getAttribute("min"));
    const maximum = Number(await slider.getAttribute("max"));
    const nextValue = Math.min(maximum, minimum + 20);
    await slider.fill(String(nextValue));
    await expect(page.locator('[data-bet="threeQuarter"]')).not.toHaveClass(/is-selected/);
    await expect(page.locator("#raiseButton")).toContainText(/^加注至 [\d,]+$/);
  });

  test("disabled-state and Mobile V1 layout remain intact", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => window.BetInfoUI?.version || null)).toBe("4.0.0");
    await expect(page.locator("body")).toHaveClass(/is-mobile-v1-landscape/);

    await forceHeroTurn(page);
    await expect(page.locator(".quick-bets button[data-bet]")).toHaveCount(4);
    await expect(page.locator(".quick-bet-amount").first()).toBeHidden();

    const controlsBox = await page.locator(".controls").boundingBox();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox.x).toBeGreaterThanOrEqual(-2);
    expect(controlsBox.y).toBeGreaterThanOrEqual(-2);
    expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(846);
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(392);

    await page.evaluate(() => {
      state.waitingForHuman = false;
      render();
    });
    await expect(page.locator("#foldButton")).toBeDisabled();
    await expect(page.locator("#callButton")).toBeDisabled();
    await expect(page.locator("#raiseButton")).toBeDisabled();
    await expect(page.locator("#allInButton")).toBeDisabled();
  });
});