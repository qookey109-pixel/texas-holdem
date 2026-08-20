import { expect, test } from "@playwright/test";

async function openFreshTable(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#opponents .seat")).toHaveCount(6);
}

test("chip inflow uses the actual paid amount when a player is capped all-in", async ({ page }) => {
  await openFreshTable(page);

  const result = await page.evaluate(() => {
    const seat = els.opponents.querySelector('.seat[data-profile-position]');
    if (!seat) throw new Error("Expected a rendered opponent seat");
    const position = Number(seat.dataset.profilePosition);
    const player = state.players.find(candidate => candidate.position === position);
    if (!player) throw new Error(`No player for rendered seat ${position}`);

    player.stack = 75;
    player.bet = 0;
    player.totalContribution = 0;
    player.allIn = false;
    const potBefore = state.pot;

    const paid = pay(player, 120);
    const chip = els.fxLayer.querySelector(`.flying-chip[data-player-position="${position}"]`);

    return {
      position,
      paid,
      potBefore,
      potAfter: state.pot,
      stack: player.stack,
      bet: player.bet,
      contribution: player.totalContribution,
      allIn: player.allIn,
      animationAmount: chip?.dataset.amount || null,
      motionGeometry: chip?.dataset.motionGeometry || null,
    };
  });

  expect(result).toEqual({
    position: result.position,
    paid: 75,
    potBefore: result.potBefore,
    potAfter: result.potBefore + 75,
    stack: 0,
    bet: 75,
    contribution: 75,
    allIn: true,
    animationAmount: "75",
    motionGeometry: "live",
  });

  await page.waitForTimeout(1_400);
  await expect(page.locator("#fxLayer .flying-chip")).toHaveCount(0);
});

test("side-pot payout animation matches each player's exact settlement award", async ({ page }) => {
  await openFreshTable(page);

  const result = await page.evaluate(() => {
    const suitSymbols = { s: "♠", h: "♥", d: "♦", c: "♣" };
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: suitSymbols[suit] });

    Audio.cleanup();
    clearAutoNewHandTimer();
    clearDialogueTimers();
    els.fxLayer.innerHTML = "";

    state.players.forEach(player => {
      player.folded = true;
      player.allIn = false;
      player.bet = 0;
      player.totalContribution = 0;
      player.hasActed = true;
      player.raiseLocked = false;
    });

    const hero = state.players[0];
    const sideWinner = state.players[1];
    const sideLoser = state.players[2];

    hero.folded = false;
    hero.stack = 900;
    hero.cards = [card("A", 14, "s"), card("A", 14, "d")];
    hero.totalContribution = 100;

    sideWinner.folded = false;
    sideWinner.stack = 800;
    sideWinner.cards = [card("K", 13, "h"), card("Q", 12, "h")];
    sideWinner.totalContribution = 200;

    sideLoser.folded = false;
    sideLoser.stack = 800;
    sideLoser.cards = [card("Q", 12, "s"), card("Q", 12, "d")];
    sideLoser.totalContribution = 200;

    state.board = [
      card("2", 2, "c"),
      card("3", 3, "d"),
      card("4", 4, "h"),
      card("8", 8, "s"),
      card("K", 13, "c"),
    ];
    state.pot = 500;
    state.currentBet = 200;
    state.street = "河牌";
    state.handOver = false;
    state.waitingForHuman = false;
    state.sessionEnded = false;
    state.heroCurrentHand = createHeroHandTracker();

    const wealthBefore = state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
    showdown();
    const wealthAfter = state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;

    const payoutAnimations = [...els.fxLayer.querySelectorAll(".win-chip")]
      .reduce((map, chip) => {
        const position = Number(chip.dataset.playerPosition);
        if (!map.has(position)) {
          map.set(position, {
            amount: Number(chip.dataset.amount),
            geometry: chip.dataset.motionGeometry || "fallback",
          });
        }
        return map;
      }, new Map());

    return {
      heroPosition: hero.position,
      sideWinnerPosition: sideWinner.position,
      sideLoserPosition: sideLoser.position,
      heroStack: hero.stack,
      sideWinnerStack: sideWinner.stack,
      sideLoserStack: sideLoser.stack,
      pot: state.pot,
      winners: [...state.winners],
      wealthBefore,
      wealthAfter,
      payouts: [...payoutAnimations.entries()],
    };
  });

  expect(result.heroStack).toBe(1200);
  expect(result.sideWinnerStack).toBe(1000);
  expect(result.sideLoserStack).toBe(800);
  expect(result.pot).toBe(0);
  expect(result.wealthAfter).toBe(result.wealthBefore);
  expect(result.winners).toEqual(expect.arrayContaining(["Owl"]));

  const payouts = new Map(result.payouts);
  expect(payouts.get(result.heroPosition)).toEqual({ amount: 300, geometry: "live" });
  expect(payouts.get(result.sideWinnerPosition)).toEqual({ amount: 200, geometry: "live" });
  expect(payouts.has(result.sideLoserPosition)).toBe(false);
  expect([...payouts.values()].reduce((sum, payout) => sum + payout.amount, 0)).toBe(500);

  await page.waitForTimeout(2_000);
  await expect(page.locator("#fxLayer .win-chip")).toHaveCount(0);
});