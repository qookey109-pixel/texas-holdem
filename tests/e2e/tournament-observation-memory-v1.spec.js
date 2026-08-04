import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test.describe("Shared tournament observation memory V1", () => {
  test("late-arriving AI inherits prior public observations without reading hidden cards", async ({ page }) => {
    const runtimeIssues = collectRuntimeIssues(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.TournamentObservationMemory?.version || ""),
      { timeout: 12_000 },
    ).toBe("1.0.0");

    const result = await page.evaluate(() => {
      const memory = window.TournamentObservationMemory;
      const model = window.AiPlayerModel;
      const counter = window.AiRepeatedAllInCounterV1;

      state.gameMode = "tournament";
      state.handNumber = 9;
      state.blindLevel = { level: 2, small: 20, big: 40, buyIn: 4500 };
      state.tournament = {
        active: true,
        appeared: ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark", "Ace"],
        eliminated: ["Leo"],
        queue: ["Momo", "Nori", "Gemini"],
        finished: false,
      };
      delete state.tournamentObservationMemoryV1;

      const hero = {
        name: "Owl",
        isHuman: true,
        stack: 3900,
        bet: 0,
        folded: false,
        allIn: false,
        position: 0,
      };
      Object.defineProperty(hero, "cards", {
        configurable: true,
        get() {
          throw new Error("shared observation memory must not read current hidden hero cards");
        },
      });
      const ace = {
        name: "Ace",
        isHuman: false,
        stack: 4500,
        bet: 0,
        folded: false,
        allIn: false,
        position: 1,
        cards: [
          { value: 14, suit: "spades" },
          { value: 13, suit: "spades" },
        ],
      };
      state.players = [hero, ace];

      model.reset();
      for (let handNumber = 1; handNumber <= 8; handNumber += 1) {
        model.beginHand(handNumber);
        model.observePublicEvent({
          handNumber,
          street: "preflop",
          position: handNumber % 2 ? "BTN" : "CO",
          action: handNumber <= 5 ? "raise" : "call",
          amount: handNumber <= 5 ? 80 : 40,
          potBefore: 60,
          facedAggression: handNumber > 5,
          priorRaises: handNumber > 5 ? 1 : 0,
        });
        model.observePublicEvent({
          handNumber,
          street: "flop",
          position: "BTN",
          action: handNumber % 3 === 0 ? "fold" : "call",
          amount: 60,
          potBefore: 160,
          facedAggression: true,
          checkedBefore: handNumber % 3 === 0,
          priorRaises: 0,
        });
      }

      state.heroStyle = {
        hands: 8,
        vpip: 6,
        folds: 3,
        calls: 5,
        raises: 5,
        checks: 4,
        allIns: 4,
        showdowns: 2,
        wins: 1,
      };

      counter.reset(1);
      for (const handNumber of [5, 6, 7, 8]) {
        counter.observeHeroJam({ handNumber, riskInBigBlinds: 22, priorRaises: 0 });
      }

      localStorage.setItem("texasHoldemPublicShowdownModelV2", JSON.stringify({
        schemaVersion: 2,
        updatedAt: Date.now(),
        samples: [
          {
            handNumber: 3,
            cards: [
              { value: 14, suit: "hearts" },
              { value: 12, suit: "hearts" },
            ],
            bucket: "premium",
            raised: true,
            allIn: false,
            called: false,
            checked: false,
            position: "BTN",
            recordedAt: Date.now() - 1000,
          },
          {
            handNumber: 7,
            cards: [
              { value: 9, suit: "clubs" },
              { value: 8, suit: "clubs" },
            ],
            bucket: "medium",
            raised: false,
            allIn: false,
            called: true,
            checked: true,
            position: "CO",
            recordedAt: Date.now(),
          },
        ],
      }));

      memory.registerCurrentPlayers();
      const summary = memory.buildSummary({ player: ace });
      return {
        arrival: ace.publicObservationMemory,
        summary,
        status: memory.status(),
        fair: memory.fairInformationPolicy,
        serialized: JSON.stringify(summary),
      };
    });

    expect(result.arrival.arrivalHand).toBe(9);
    expect(result.arrival.observedHandsBeforeArrival).toBe(8);
    expect(result.arrival.tier).toBe("middle");
    expect(result.summary.actor).toBe("Ace");
    expect(result.summary.playerModel.handsObserved).toBe(8);
    expect(result.summary.playerModel.actionsObserved).toBe(16);
    expect(result.summary.playerModel.byStreet.preflop.actions).toBe(8);
    expect(result.summary.playerModel.byStreet.flop.actions).toBe(8);
    expect(result.summary.playerModel.recentPublicEvents.length).toBeLessThanOrEqual(16);
    expect(result.summary.repeatedPreflopAllIn.jamHands).toBe(4);
    expect(result.summary.revealedShowdowns.samples).toBe(2);
    expect(result.summary.revealedShowdowns.recent[0].revealedCards).toHaveLength(2);
    expect(result.summary.tournament.eliminated).toContain("Leo");
    expect(result.status.startHandHookInstalled).toBe(true);
    expect(result.fair.hiddenOpponentCards).toBe(false);
    expect(result.fair.currentHeroHoleCards).toBe(false);
    expect(result.fair.actualDeckOrder).toBe(false);
    expect(result.serialized).not.toContain("actualDeckOrder");
    expect(result.serialized).not.toContain("futureBoard");
    expect(result.serialized).not.toContain("currentHeroHoleCards");

    await page.waitForTimeout(100);
    expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
  });

  test("Gemini decision POST receives the latest bounded public observation summary", async ({ page }) => {
    const runtimeIssues = collectRuntimeIssues(page);
    let capturedRequest = null;

    await page.route("https://memory.test/v1/decision", async route => {
      capturedRequest = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => window.TournamentObservationMemory?.status?.().fetchBridgeInstalled || false),
      { timeout: 12_000 },
    ).toBe(true);

    const responseOk = await page.evaluate(async () => {
      state.gameMode = "tournament";
      state.handNumber = 12;
      state.tournament = {
        active: true,
        appeared: ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark", "Ace", "Gemini"],
        eliminated: ["Leo", "Toto", "Foxy"],
        queue: [],
        finished: false,
      };

      const response = await fetch("https://memory.test/v1/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 1,
          requestId: "observation-test",
          handNumber: 12,
          street: "翻牌前",
          position: "BB",
          holeCards: [
            { rank: "A", suit: "spades" },
            { rank: "K", suit: "spades" },
          ],
          board: [],
          pot: 60,
          currentBet: 40,
          callAmount: 0,
          minRaiseTo: 80,
          maxRaiseTo: 4500,
          stack: 4460,
          playerBet: 40,
          legalActions: ["check", "raise", "all_in"],
          players: [
            { name: "Owl", isHuman: true, stack: 3900, bet: 20, folded: false, allIn: false },
            { name: "Gemini", isHuman: false, stack: 4460, bet: 40, folded: false, allIn: false },
          ],
        }),
      });
      return response.ok;
    });

    expect(responseOk).toBe(true);
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest.tournamentObservation).toBeTruthy();
    expect(capturedRequest.tournamentObservation.schemaVersion).toBe(1);
    expect(capturedRequest.tournamentObservation.strategyVersion).toBe("1.0.0");
    expect(capturedRequest.tournamentObservation.actor).toBe("Gemini");
    expect(capturedRequest.tournamentObservation.tournament.handNumber).toBe(12);
    expect(capturedRequest.tournamentObservation.tournament.eliminated).toEqual(["Leo", "Toto", "Foxy"]);
    expect(capturedRequest.tournamentObservation.guidance).toContain("public historical evidence");
    expect(JSON.stringify(capturedRequest.tournamentObservation).length).toBeLessThan(14_000);
    expect(JSON.stringify(capturedRequest.tournamentObservation)).not.toContain("deckOrder");
    expect(JSON.stringify(capturedRequest.tournamentObservation)).not.toContain("currentHeroHoleCards");

    await page.waitForTimeout(100);
    expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
  });
});
