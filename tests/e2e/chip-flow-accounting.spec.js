import { expect, test } from "@playwright/test";

async function openFreshTable(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#opponents .seat")).toHaveCount(6);
}

test("new-hand blinds enter the pot from the current rendered seats", async ({ page }) => {
  await openFreshTable(page);

  const result = await page.evaluate(() => {
    Audio.cleanup();
    clearAutoNewHandTimer();
    clearDialogueTimers();
    els.fxLayer.innerHTML = "";

    state.players.forEach(player => {
      player.stack = Math.max(player.stack, 1000);
    });

    // startHand increments first. Hand 5 makes seat 4 the dealer and Hero the
    // first preflop actor, so no AI action can add extra chip effects here.
    state.handNumber = 4;
    startHand();

    const smallBlind = currentSmallBlind();
    const bigBlind = currentBigBlind();
    const smallBlindPlayer = state.players[(state.dealerIndex + 1) % state.players.length];
    const bigBlindPlayer = state.players[(state.dealerIndex + 2) % state.players.length];
    const chipFor = player => els.fxLayer.querySelector(
      `.flying-chip[data-player-position="${player.position}"]`,
    );
    const smallChip = chipFor(smallBlindPlayer);
    const bigChip = chipFor(bigBlindPlayer);

    return {
      smallBlind,
      bigBlind,
      pot: state.pot,
      currentActorIndex: state.currentActorIndex,
      waitingForHuman: state.waitingForHuman,
      small: {
        position: smallBlindPlayer.position,
        amount: Number(smallChip?.dataset.amount || 0),
        geometry: smallChip?.dataset.motionGeometry || null,
      },
      big: {
        position: bigBlindPlayer.position,
        amount: Number(bigChip?.dataset.amount || 0),
        geometry: bigChip?.dataset.motionGeometry || null,
      },
    };
  });

  expect(result.currentActorIndex).toBe(0);
  expect(result.waitingForHuman).toBe(true);
  expect(result.pot).toBe(result.smallBlind + result.bigBlind);
  expect(result.small.amount).toBe(result.smallBlind);
  expect(result.big.amount).toBe(result.bigBlind);
  expect(result.small.geometry).toBe("live");
  expect(result.big.geometry).toBe("live");

  await page.waitForTimeout(1_400);
  await expect(page.locator("#fxLayer .flying-chip")).toHaveCount(0);
});

test("chip inflow uses the actual paid amount when a player is capped all-in", async ({ page }) => {
  await openFreshTable(page);

  const result = await page.evaluate(() => {
    const seat = els.opponents.querySelector('.seat[data-profile-position]');
    if (!seat) throw new Error("Expected a rendered opponent seat");
    const position = Number(seat.dataset.profilePosition);
    const player = state.players.find(candidate => candidate.position === position);
    if (!player) throw new Error(`No player for rendered seat ${position}`);

    // The freshly opened table may still be animating its posted blinds. This
    // regression owns the FX layer from here so it can only inspect the payment
    // created below, not an earlier blind from the same seat.
    els.fxLayer.innerHTML = "";
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

test("side-pot payout animation and banner match each player's exact settlement award", async ({ page }) => {
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
      heroName: hero.name,
      sideWinnerName: sideWinner.name,
      heroRank: getVisibleHandRank(hero),
      sideWinnerRank: getVisibleHandRank(sideWinner),
      heroStack: hero.stack,
      sideWinnerStack: sideWinner.stack,
      sideLoserStack: sideLoser.stack,
      pot: state.pot,
      winners: [...state.winners],
      wealthBefore,
      wealthAfter,
      payouts: [...payoutAnimations.entries()],
      banner: {
        title: els.showdownBanner.querySelector("span")?.textContent?.trim() || "",
        names: els.showdownBanner.querySelector("strong")?.textContent?.trim() || "",
        detail: els.showdownBanner.querySelector("em")?.textContent?.trim() || "",
      },
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

  expect(result.banner.title).toBe("WINNERS");
  expect(result.banner.names).toContain(result.heroName);
  expect(result.banner.names).toContain(result.sideWinnerName);
  expect(result.banner.detail).toContain(`${result.heroName}：${result.heroRank} +300`);
  expect(result.banner.detail).toContain(`${result.sideWinnerName}：${result.sideWinnerRank} +200`);
  expect(result.banner.detail).not.toContain("+500");

  await page.waitForTimeout(2_000);
  await expect(page.locator("#fxLayer .win-chip")).toHaveCount(0);
});

test("winner banner renders player names as text instead of HTML", async ({ page }) => {
  await openFreshTable(page);

  const result = await page.evaluate(() => {
    clearAutoNewHandTimer();
    clearDialogueTimers();
    const winner = state.players[0];
    const originalName = winner.name;
    winner.name = "<b>Injected</b>";
    state.board = [];

    showWinBanner([winner], 120);
    const label = els.showdownBanner.querySelector("strong");
    const snapshot = {
      text: label?.textContent || "",
      html: label?.innerHTML || "",
      nestedBold: label?.querySelectorAll("b").length || 0,
    };

    winner.name = originalName;
    return snapshot;
  });

  expect(result.text).toContain("<b>Injected</b>");
  expect(result.nestedBold).toBe(0);
  expect(result.html).toContain("&lt;b&gt;Injected&lt;/b&gt;");
});
