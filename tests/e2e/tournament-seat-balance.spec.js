import { expect, test } from "@playwright/test";

test("淘汰賽縮桌後會對稱分散座位且不改變下注位置", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TournamentSeatBalance?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const plans = await page.evaluate(() => ({
    five: TournamentSeatBalance.slotsForCount(5),
    four: TournamentSeatBalance.slotsForCount(4),
    three: TournamentSeatBalance.slotsForCount(3),
    two: TournamentSeatBalance.slotsForCount(2),
    one: TournamentSeatBalance.slotsForCount(1),
  }));

  expect(plans.five.map(item => item.slot)).toEqual([1, 2, 3, 5, 6]);
  expect(plans.five[2].center).toBe(true);
  expect(plans.four.map(item => item.slot)).toEqual([1, 2, 5, 6]);
  expect(plans.three.map(item => item.slot)).toEqual([1, 3, 6]);
  expect(plans.three[1].center).toBe(true);
  expect(plans.two.map(item => item.slot)).toEqual([2, 5]);
  expect(plans.one).toEqual([{ slot: 3, center: true }]);

  await page.evaluate(() => {
    TournamentMode.setMode("tournament");
    state.players = [state.players[0], ...state.players.slice(1, 4)];
    state.dealerIndex = 0;
    state.currentActorIndex = 0;
    state.layout.editing = true;
    render();
  });

  await expect(page.locator("#opponents")).toHaveAttribute("data-seat-balance", "balanced-3");

  const threePlayerLayout = await page.evaluate(() => ({
    snapshot: TournamentSeatBalance.snapshot(),
    logicalPositions: state.players.slice(1).map(player => player.position),
    cardSeats: [...document.querySelectorAll("#opponents .seat-card-zone")]
      .map(node => Number(node.dataset.displaySeat)),
    dialogueSeats: [...document.querySelectorAll("#opponents .seat-dialogue")]
      .map(node => Number(node.dataset.displaySeat)),
    centerExpected: {
      left: Number(((state.layout.items.seat3.left + state.layout.items.seat4.left) / 2).toFixed(2)),
      top: Number(((state.layout.items.seat3.top + state.layout.items.seat4.top) / 2).toFixed(2)),
    },
  }));

  expect(threePlayerLayout.logicalPositions).toEqual([1, 2, 3]);
  expect(threePlayerLayout.snapshot.seats.map(seat => seat.logicalPosition)).toEqual([1, 2, 3]);
  expect(threePlayerLayout.snapshot.seats.map(seat => seat.displaySeat)).toEqual([1, 3, 6]);
  expect(threePlayerLayout.snapshot.seats.map(seat => seat.centered)).toEqual([false, true, false]);
  expect(threePlayerLayout.cardSeats).toEqual([1, 3, 6]);
  expect(threePlayerLayout.dialogueSeats).toEqual([1, 3, 6]);
  expect(Number.parseFloat(threePlayerLayout.snapshot.seats[1].left)).toBe(threePlayerLayout.centerExpected.left);
  expect(Number.parseFloat(threePlayerLayout.snapshot.seats[1].top)).toBe(threePlayerLayout.centerExpected.top);

  await page.evaluate(() => {
    state.players = [state.players[0], ...state.players.slice(1, 3)];
    state.layout.editing = false;
    render();
  });

  await expect(page.locator("#opponents")).toHaveAttribute("data-seat-balance", "balanced-2");
  expect(
    await page.locator("#opponents .seat").evaluateAll(nodes => nodes.map(node => Number(node.dataset.displaySeat))),
  ).toEqual([2, 5]);
  expect(await page.evaluate(() => state.players.slice(1).map(player => player.position))).toEqual([1, 2]);

  await page.evaluate(() => {
    state.players = [state.players[0], state.players[1]];
    render();
  });

  await expect(page.locator("#opponents")).toHaveAttribute("data-seat-balance", "balanced-1");
  const headsUpSeat = await page.locator("#opponents .seat").evaluate(node => ({
    logical: Number(node.dataset.profilePosition),
    display: Number(node.dataset.displaySeat),
    centered: node.dataset.balancedCenter,
    left: Number.parseFloat(node.style.left),
  }));
  expect(headsUpSeat.logical).toBe(1);
  expect(headsUpSeat.display).toBe(3);
  expect(headsUpSeat.centered).toBe("true");
  expect(headsUpSeat.left).toBeGreaterThan(40);
  expect(headsUpSeat.left).toBeLessThan(60);

  await page.evaluate(() => {
    state.gameMode = "normal";
    render();
  });

  await expect(page.locator("#opponents")).toHaveAttribute("data-seat-balance", "full");
  const restoredSeat = await page.locator("#opponents .seat").evaluate(node => ({
    display: Number(node.dataset.displaySeat),
    centered: node.dataset.balancedCenter || "",
    left: node.style.left,
  }));
  expect(restoredSeat.display).toBe(1);
  expect(restoredSeat.centered).toBe("");
  expect(restoredSeat.left).toBe("");
});
