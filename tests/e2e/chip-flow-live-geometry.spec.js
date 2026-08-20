import { expect, test } from "@playwright/test";

function closeTo(actual, expected, tolerance = 2) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test("chip flow follows the rendered player and pot positions", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const renderedSeat = page.locator('#opponents .seat[data-profile-position]').first();
  await expect(renderedSeat).toBeVisible({ timeout: 10_000 });
  await expect(renderedSeat.locator(".mini-chip-stack")).toBeVisible();

  const result = await page.evaluate(() => {
    const seat = els.opponents.querySelector('.seat[data-profile-position]');
    if (!seat) throw new Error("Expected at least one rendered opponent seat");

    const position = Number(seat.dataset.profilePosition);
    const player = state.players.find(candidate => candidate.position === position);
    if (!player) throw new Error(`No player matches rendered seat position ${position}`);

    const playerStack = seat.querySelector(".mini-chip-stack");
    if (!playerStack) throw new Error(`Rendered seat ${position} has no chip stack`);

    const layer = els.fxLayer;
    const centerInLayer = element => {
      const layerRect = layer.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left - layerRect.left + rect.width / 2,
        y: rect.top - layerRect.top + rect.height / 2,
      };
    };

    const before = resolveChipMotionGeometry(player);
    if (!before) throw new Error("Expected live chip geometry before moving the seat");

    seat.style.translate = "140px 72px";
    const after = resolveChipMotionGeometry(player);
    if (!after) throw new Error("Expected live chip geometry after moving the seat");

    const actualPlayerCenter = centerInLayer(playerStack);
    const actualPotCenter = centerInLayer(els.potChip);

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
      before,
      after,
      actualPlayerCenter,
      actualPotCenter,
      flyingAnchor,
      flyingEnd,
      winAnchor,
      winEnd,
    };
  });

  closeTo(result.after.player.x - result.before.player.x, 140);
  closeTo(result.after.player.y - result.before.player.y, 72);
  closeTo(result.after.player.x, result.actualPlayerCenter.x);
  closeTo(result.after.player.y, result.actualPlayerCenter.y);
  closeTo(result.after.pot.x, result.actualPotCenter.x);
  closeTo(result.after.pot.y, result.actualPotCenter.y);

  closeTo(result.flyingAnchor.x, result.after.player.x);
  closeTo(result.flyingAnchor.y, result.after.player.y);
  closeTo(result.flyingEnd.x, result.after.pot.x, 5);
  closeTo(result.flyingEnd.y, result.after.pot.y, 5);

  closeTo(result.winAnchor.x, result.after.pot.x);
  closeTo(result.winAnchor.y, result.after.pot.y);
  expect(Math.hypot(
    result.winEnd.x - result.after.player.x,
    result.winEnd.y - result.after.player.y,
  )).toBeLessThanOrEqual(30);
});