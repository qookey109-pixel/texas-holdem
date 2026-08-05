import { expect, test } from "@playwright/test";
import geminiWorker from "../../backend/gemini-worker/src/index.js";

test.describe("Economy and persistent-fold defense V1", () => {
  test("normal rebuys are symmetric, boss catch-up is bounded, and tight play triggers controlled pressure", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => window.EconomyFoldDefenseV1?.status?.().installed === true),
      { timeout: 12_000 },
    ).toBe(true);

    const report = await page.evaluate(() => {
      const api = window.EconomyFoldDefenseV1;
      const normalRebuy = api.calculateNormalRebuy([
        { stack: 0 },
        { stack: 2000 },
        { stack: 1000 },
      ], { bigBlind: 20, buyIn: 2000 });
      const minimumRebuy = api.calculateNormalRebuy([
        { stack: 100 },
        { stack: 100 },
      ], { bigBlind: 20, buyIn: 2000 });
      const oracle = api.calculateBossCatchup({
        name: "Oracle",
        baseStack: 4500,
        bigBlind: 100,
        smallBlind: 50,
        heroStack: 18000,
        secondStack: 10000,
      });
      const gemini = api.calculateBossCatchup({
        name: "Gemini",
        baseStack: 5000,
        bigBlind: 100,
        smallBlind: 50,
        heroStack: 35000,
        secondStack: 10000,
      });
      const noCatchup = api.calculateBossCatchup({
        name: "Oracle",
        baseStack: 4500,
        bigBlind: 100,
        smallBlind: 50,
        heroStack: 16000,
        secondStack: 10000,
      });
      const tight = api.classifyHeroTightness({
        hands: 10,
        vpipHands: 1,
        preflopFolds: 8,
        opportunities: 10,
        stats: {},
      });
      const balanced = api.classifyHeroTightness({
        hands: 10,
        vpipHands: 4,
        preflopFolds: 4,
        opportunities: 10,
        stats: {},
      });

      const player = state.players.find(candidate => !candidate.isHuman && candidate.name === "Leo")
        || state.players.find(candidate => !candidate.isHuman);
      const hero = state.players.find(candidate => candidate.isHuman);
      const previousPositionLabel = window.positionLabel;
      const previousEstimateStrength = window.estimateStrength;
      const previousBoard = state.board;
      const previousCurrentBet = state.currentBet;
      const previousPot = state.pot;
      const previousFolded = hero.folded;
      const previousAllIn = hero.allIn;
      const previousPlayerStack = player.stack;
      const previousRaiseLocked = player.raiseLocked;

      window.positionLabel = () => "BTN";
      window.estimateStrength = () => 0.5;
      state.board = [];
      state.currentBet = currentBigBlind();
      state.pot = currentBigBlind() * 1.5;
      hero.folded = false;
      hero.allIn = false;
      player.stack = currentBigBlind() * 40;
      player.raiseLocked = false;

      const pressurePlan = api.planPressure(player, {
        profile: tight,
        random: () => 0,
      });

      window.positionLabel = previousPositionLabel;
      window.estimateStrength = previousEstimateStrength;
      state.board = previousBoard;
      state.currentBet = previousCurrentBet;
      state.pot = previousPot;
      hero.folded = previousFolded;
      hero.allIn = previousAllIn;
      player.stack = previousPlayerStack;
      player.raiseLocked = previousRaiseLocked;

      return {
        normalRebuy,
        minimumRebuy,
        oracle,
        gemini,
        noCatchup,
        tight,
        balanced,
        pressurePlan,
        policy: api.fairInformationPolicy,
        status: api.status(),
      };
    });

    expect(report.normalRebuy).toBe(1000);
    expect(report.minimumRebuy).toBe(400);
    expect(report.oracle.adjusted).toBe(true);
    expect(report.oracle.actualEntryBb).toBe(55);
    expect(report.gemini.adjusted).toBe(true);
    expect(report.gemini.actualEntryBb).toBe(90);
    expect(report.noCatchup.adjusted).toBe(false);
    expect(report.noCatchup.stack).toBe(4500);
    expect(report.tight.tightPassive).toBe(true);
    expect(report.tight.lowVpip).toBe(true);
    expect(report.tight.highPreflopFold).toBe(true);
    expect(report.balanced.tightPassive).toBe(false);
    expect(report.pressurePlan?.action).toBe("raise");
    expect(report.pressurePlan?.exploitApplied).toBe("low-vpip-steal");
    expect(report.pressurePlan?.raiseBy).toBeGreaterThan(0);
    expect(report.policy.hiddenOpponentCards).toBe(false);
    expect(report.policy.actualDeckOrder).toBe(false);
    expect(report.policy.futureBoardAnswer).toBe(false);
    expect(report.status.installed).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test("Gemini Worker keeps sanitized public observation and rejects hidden fields", async () => {
    const previousFetch = globalThis.fetch;
    let upstreamRequest = null;

    globalThis.fetch = async (_url, init = {}) => {
      upstreamRequest = JSON.parse(String(init.body || "{}"));
      return new Response(JSON.stringify({
        id: "interaction-test",
        model: "gemini-3.6-flash",
        steps: [{
          type: "model_output",
          content: [{
            type: "text",
            text: JSON.stringify({
              action: "check",
              raiseTo: 0,
              dialogue: "我記得你的節奏。",
              emotion: "calm",
              reason: "公開歷史顯示玩家偏緊，保留小尺寸施壓空間。",
            }),
          }],
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const request = new Request("https://worker.example/v1/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "test-observation",
          handNumber: 24,
          street: "flop",
          position: "BTN",
          holeCards: [
            { rank: "A", suit: "spades" },
            { rank: "J", suit: "spades" },
          ],
          board: [
            { rank: "8", suit: "clubs" },
            { rank: "5", suit: "diamonds" },
            { rank: "2", suit: "hearts" },
          ],
          pot: 300,
          currentBet: 0,
          callAmount: 0,
          minRaiseTo: 100,
          maxRaiseTo: 1200,
          stack: 5000,
          playerBet: 0,
          legalActions: ["check", "raise"],
          players: [
            { name: "Owl", position: "BB", stack: 4000, bet: 0, isHuman: true },
            { name: "Gemini", position: "BTN", stack: 5000, bet: 0, isHuman: false },
          ],
          tournamentObservation: {
            schemaVersion: 1,
            actor: "Gemini",
            opponentCards: [{ rank: "K", suit: "hearts" }],
            playerModel: {
              handsObserved: 20,
              actionsObserved: 38,
              byStreet: {
                preflop: {
                  actions: 20,
                  foldToPressure: 0.72,
                  confidence: 0.9,
                },
              },
              byPosition: [{ position: "BB", actions: 8, foldToPressure: 0.75 }],
              recentPublicEvents: [{
                handNumber: 23,
                street: "preflop",
                position: "BB",
                action: "fold",
                facedAggression: true,
              }],
            },
            heroSession: {
              hands: 20,
              vpipRate: 0.1,
              foldRate: 0.75,
              callRate: 0.05,
              raiseRate: 0.05,
            },
            revealedShowdowns: {
              samples: 2,
              bucketCounts: { strong: 1, weak: 1 },
              recent: [{ revealedCards: [{ rank: "A", suit: "clubs" }] }],
            },
          },
        }),
      });

      const response = await geminiWorker.fetch(request, { GEMINI_API_KEY: "test-key" });
      const result = await response.json();
      const publicState = JSON.parse(String(upstreamRequest?.input || "").split("\n").slice(1).join("\n"));
      const serialized = JSON.stringify(publicState);

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(publicState.tournamentObservation.heroSession.vpipRate).toBe(0.1);
      expect(publicState.tournamentObservation.playerModel.byStreet.preflop.foldToPressure).toBe(0.72);
      expect(publicState.tournamentObservation.revealedShowdowns.samples).toBe(2);
      expect(serialized).not.toContain("opponentCards");
      expect(serialized).not.toContain("revealedCards");
      expect(upstreamRequest.system_instruction).toContain("historical public tendencies");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
