import { expect, test } from "@playwright/test";

async function waitForActionHistory(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiActionMemory?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.1.0");
}

test.describe("AI V2.2 public action history foundation", () => {
  test("loads the upgraded public-only schema without changing the existing API", async ({ page }) => {
    await waitForActionHistory(page);

    const result = await page.evaluate(() => ({
      version: AiActionMemory.version,
      schemaVersion: AiActionMemory.schemaVersion,
      policy: AiActionMemory.fairInformationPolicy,
      api: [
        "recordAction",
        "actions",
        "actorActions",
        "latestAction",
        "latestAggression",
        "checkedThenFacedAggression",
        "playerStreetSummary",
        "allActions",
        "actorLine",
        "streetSummary",
        "snapshot",
      ].filter(key => typeof AiActionMemory[key] === "function"),
    }));

    expect(result.version).toBe("1.1.0");
    expect(result.schemaVersion).toBe("2.2.0");
    expect(result.api).toHaveLength(11);
    expect(result.policy).toMatchObject({
      publicActionsOnly: true,
      publicPositions: true,
      publicBetSizes: true,
      publicBoardAtActionTime: true,
      hiddenCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    });
  });

  test("reconstructs blinds, raise and call with pre-action public amounts", async ({ page }) => {
    await waitForActionHistory(page);

    const result = await page.evaluate(() => {
      state.handNumber = 701;
      state.board = [];
      state.pot = 0;
      state.currentBet = 0;
      state.dealerIndex = 0;

      const button = {
        name: "Owl",
        isHuman: true,
        position: 0,
        stack: 2000,
        bet: 0,
        totalContribution: 0,
        folded: false,
        allIn: false,
      };
      const smallBlind = {
        name: "Ace",
        isHuman: false,
        position: 1,
        stack: 2000,
        bet: 0,
        totalContribution: 0,
        folded: false,
        allIn: false,
      };
      const bigBlind = {
        name: "Momo",
        isHuman: false,
        position: 2,
        stack: 2000,
        bet: 0,
        totalContribution: 0,
        folded: false,
        allIn: false,
      };
      state.players = [button, smallBlind, bigBlind];
      AiActionMemory.reset(701);

      postBlind(smallBlind, 10, "小盲");
      postBlind(bigBlind, 20, "大盲");
      state.currentBet = 20;

      button.stack -= 60;
      button.bet = 60;
      button.totalContribution = 60;
      state.pot = 90;
      state.currentBet = 60;
      AiActionMemory.recordAction(button, "Raise", 60);

      bigBlind.stack -= 40;
      bigBlind.bet = 60;
      bigBlind.totalContribution = 60;
      state.pot = 130;
      AiActionMemory.recordAction(bigBlind, "Call", 40);

      return {
        events: AiActionMemory.actions("preflop"),
        summary: AiActionMemory.streetSummary("preflop"),
      };
    });

    expect(result.events.map(event => event.action)).toEqual([
      "small-blind",
      "big-blind",
      "raise",
      "call",
    ]);

    expect(result.events[0]).toMatchObject({
      streetActionIndex: 1,
      actor: "Ace",
      positionLabel: "SB",
      contribution: 10,
      currentBetBefore: 0,
      currentBetAfter: 10,
      potBefore: 0,
      potAfter: 10,
      isForcedBet: true,
    });
    expect(result.events[1]).toMatchObject({
      streetActionIndex: 2,
      actor: "Momo",
      positionLabel: "BB",
      contribution: 20,
      currentBetBefore: 10,
      currentBetAfter: 20,
      potBefore: 10,
      potAfter: 30,
      isForcedBet: true,
    });
    expect(result.events[2]).toMatchObject({
      actor: "Owl",
      positionLabel: "BTN",
      previousActorBet: 0,
      amountToCallBefore: 20,
      contribution: 60,
      betTo: 60,
      raiseBy: 40,
      currentBetBefore: 20,
      currentBetAfter: 60,
      potBefore: 30,
      potAfter: 90,
      isAggressive: true,
    });
    expect(result.events[3]).toMatchObject({
      actor: "Momo",
      previousActorBet: 20,
      amountToCallBefore: 40,
      contribution: 40,
      betTo: 60,
      currentBetBefore: 60,
      currentBetAfter: 60,
      potBefore: 90,
      potAfter: 130,
    });
    expect(result.summary).toMatchObject({
      street: "preflop",
      actionCount: 4,
      aggressiveActionCount: 1,
      forcedBetCount: 2,
      finalPot: 130,
      finalCurrentBet: 60,
    });
  });

  test("preserves a public actor line across streets with board snapshots", async ({ page }) => {
    await waitForActionHistory(page);

    const result = await page.evaluate(() => {
      const card = (value, suit) => ({ value, suit });
      state.handNumber = 702;
      state.dealerIndex = 0;
      state.board = [];
      state.pot = 30;
      state.currentBet = 20;

      const hero = {
        name: "Owl", isHuman: true, position: 0, bet: 20,
        folded: false, allIn: false,
      };
      const villain = {
        name: "Viper", isHuman: false, position: 1, bet: 20,
        folded: false, allIn: false,
      };
      state.players = [hero, villain];
      AiActionMemory.reset(702);
      AiActionMemory.recordAction(villain, "Call", 20);

      state.board = [card(13, "s"), card(8, "d"), card(3, "c")];
      state.pot = 70;
      state.currentBet = 0;
      hero.bet = 0;
      villain.bet = 0;
      AiActionMemory.recordAction(hero, "Check", 0);
      villain.bet = 35;
      state.currentBet = 35;
      state.pot = 105;
      AiActionMemory.recordAction(villain, "Raise", 35);

      state.board = [...state.board, card(11, "h")];
      state.currentBet = 0;
      hero.bet = 0;
      villain.bet = 0;
      AiActionMemory.recordAction(hero, "Check", 0);
      AiActionMemory.recordAction(villain, "Check", 0);

      return {
        line: AiActionMemory.actorLine("Viper"),
        snapshot: AiActionMemory.snapshot(),
      };
    });

    expect(result.line.map(event => event.street)).toEqual(["preflop", "flop", "turn"]);
    expect(result.line.map(event => event.action)).toEqual(["call", "raise", "check"]);
    expect(result.line.map(event => event.board.length)).toEqual([0, 3, 4]);
    expect(result.snapshot.schemaVersion).toBe("2.2.0");
    expect(result.snapshot.publicInformationOnly).toBe(true);
    expect(result.snapshot.streets.river).toEqual([]);
  });

  test("does not inspect hole cards, deck order or future-board answers", async ({ page }) => {
    await waitForActionHistory(page);

    const result = await page.evaluate(() => {
      state.handNumber = 703;
      state.board = [{ value: 14, suit: "s" }, { value: 7, suit: "d" }, { value: 2, suit: "c" }];
      state.pot = 120;
      state.currentBet = 0;
      state.dealerIndex = 0;

      const actor = {
        name: "Oracle",
        isHuman: false,
        position: 0,
        bet: 0,
        folded: false,
        allIn: false,
      };
      Object.defineProperty(actor, "cards", {
        get() {
          throw new Error("hidden hole cards were read");
        },
      });
      state.players = [actor];
      Object.defineProperty(state, "deck", {
        configurable: true,
        get() {
          throw new Error("actual deck order was read");
        },
      });
      Object.defineProperty(state, "futureBoard", {
        configurable: true,
        get() {
          throw new Error("future board answer was read");
        },
      });

      try {
        AiActionMemory.reset(703);
        const event = AiActionMemory.recordAction(actor, "Check", 0);
        return {
          event,
          policy: AiActionMemory.fairInformationPolicy,
        };
      } finally {
        delete state.deck;
        delete state.futureBoard;
      }
    });

    expect(result.event).toMatchObject({
      actor: "Oracle",
      action: "check",
      publicInformationOnly: true,
    });
    expect(result.event.board).toEqual([
      { value: 14, suit: "s" },
      { value: 7, suit: "d" },
      { value: 2, suit: "c" },
    ]);
    expect(result.policy.hiddenCards).toBe(false);
    expect(result.policy.actualDeckOrder).toBe(false);
    expect(result.policy.futureBoardAnswer).toBe(false);
    expect(result.policy.predeterminedWinner).toBe(false);
  });
});
