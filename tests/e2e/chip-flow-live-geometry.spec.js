import { expect, test } from "@playwright/test";

function closeTo(actual, expected, tolerance = 2) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test("chip flow follows rendered positions even when the mini stack is hidden", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const renderedSeat = page.locator('#opponents .seat[data-profile-position]').first();
  await expect(renderedSeat).toBeVisible({ timeout: 10_000 });

  const result = await page.evaluate(() => {
    const seat = els.opponents.querySelector('.seat[data-profile-position]');
    if (!seat) throw new Error("Expected at least one rendered opponent seat");

    const position = Number(seat.dataset.profilePosition);
    const player = state.players.find(candidate => candidate.position === position);
    if (!player) throw new Error(`No player matches rendered seat position ${position}`);

    const playerStack = seat.querySelector(".mini-chip-stack");
    const seatMeta = seat.querySelector(".seat-meta");
    if (!playerStack || !seatMeta) throw new Error(`Rendered seat ${position} is missing stack anchors`);

    const layer = els.fxLayer;
    const centerInLayer = element => {
      const layerRect = layer.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left - layerRect.left + rect.width / 2,
        y: rect.top - layerRect.top + rect.height / 2,
      };
    };

    // Responsive layouts are allowed to hide the decorative mini stack. Force that
    // state here and prove the runtime falls through to a measurable live anchor.
    playerStack.style.display = "none";
    const before = resolveChipMotionGeometry(player);
    if (!before) throw new Error("Expected live chip geometry with hidden mini stack");

    const fallbackBefore = centerInLayer(seatMeta);
    seat.style.translate = "140px 72px";
    const after = resolveChipMotionGeometry(player);
    if (!after) throw new Error("Expected live chip geometry after moving the seat");

    const fallbackAfter = centerInLayer(seatMeta);
    const actualPotCenter = centerInLayer(els.potChip);

    // The initial table can still have blind-chip FX in flight. Remove those before
    // creating the two animations owned by this regression so querySelector cannot
    // accidentally inspect an older live-geometry chip from the same seat.
    els.fxLayer.innerHTML = "";

    animateChips(player, 240);
    const flyingChip = els.fxLayer.querySelector('.flying-chip[data-motion-geometry="live"]');
    if (!flyingChip) throw new Error("Expected a live-geometry betting chip");
    const flyingAnchor = {
      x: Number.parseFloat(flyingChip.style.left),
      y: Number.parseFloat(flyingChip.style.top),
    };
    const flyingAnimation = flyingChip.getAnimations()[0];
    if (!flyingAnimation) throw new Error("Expected a betting chip Web Animation");
    flyingAnimation.pause();
    flyingAnimation.currentTime = 820;
    const flyingEnd = centerInLayer(flyingChip);

    animateWinChips(player, 360);
    const winChip = els.fxLayer.querySelector('.win-chip[data-motion-geometry="live"]');
    if (!winChip) throw new Error("Expected a live-geometry win chip");
    const winAnchor = {
      x: Number.parseFloat(winChip.style.left),
      y: Number.parseFloat(winChip.style.top),
    };
    const winAnimation = winChip.getAnimations()[0];
    if (!winAnimation) throw new Error("Expected a win chip Web Animation");
    winAnimation.pause();
    winAnimation.currentTime = 1050;
    const winEnd = centerInLayer(winChip);

    return {
      position,
      before,
      after,
      fallbackBefore,
      fallbackAfter,
      actualPotCenter,
      flyingAnchor,
      flyingEnd,
      flyingAmount: flyingChip.dataset.amount,
      flyingPosition: flyingChip.dataset.playerPosition,
      winAnchor,
      winEnd,
      winAmount: winChip.dataset.amount,
      winPosition: winChip.dataset.playerPosition,
    };
  });

  closeTo(result.before.player.x, result.fallbackBefore.x);
  closeTo(result.before.player.y, result.fallbackBefore.y);
  closeTo(result.after.player.x - result.before.player.x, 140);
  closeTo(result.after.player.y - result.before.player.y, 72);
  closeTo(result.after.player.x, result.fallbackAfter.x);
  closeTo(result.after.player.y, result.fallbackAfter.y);
  closeTo(result.after.pot.x, result.actualPotCenter.x);
  closeTo(result.after.pot.y, result.actualPotCenter.y);

  closeTo(result.flyingAnchor.x, result.after.player.x);
  closeTo(result.flyingAnchor.y, result.after.player.y);
  closeTo(result.flyingEnd.x, result.after.pot.x, 5);
  closeTo(result.flyingEnd.y, result.after.pot.y, 5);
  expect(result.flyingAmount).toBe("240");
  expect(result.flyingPosition).toBe(String(result.position));

  closeTo(result.winAnchor.x, result.after.pot.x);
  closeTo(result.winAnchor.y, result.after.pot.y);
  expect(Math.hypot(
    result.winEnd.x - result.after.player.x,
    result.winEnd.y - result.after.player.y,
  )).toBeLessThanOrEqual(30);
  expect(result.winAmount).toBe("360");
  expect(result.winPosition).toBe(String(result.position));

  await page.waitForTimeout(1_900);
  await expect(page.locator("#fxLayer .flying-chip, #fxLayer .win-chip")).toHaveCount(0);
});
