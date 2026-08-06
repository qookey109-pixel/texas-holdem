import { expect, test } from "@playwright/test";

test.describe("AI V2.8 tier strategy", () => {
  test("loads tier targets and keeps every local tier on public information", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiTierStrategyV28?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.8.0");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV28 || ""),
      { timeout: 15_000 },
    ).toBe("ready");

    const result = await page.evaluate(() => {
      const api = window.AiTierStrategyV28;
      const ratings = Object.fromEntries(
        Object.entries(api.targetRatings).map(([name, value]) => [name, { ...value }]),
      );
      const specialProfiles = api.specialNames.map(name => {
        const profile = AI_ROSTER.find(candidate => candidate.name === name);
        return {
          name,
          omniscient: Object.prototype.hasOwnProperty.call(profile || {}, "omniscient"),
          fairPlay: Boolean(profile?.fairPlay),
          score10: Number(profile?.strengthScore10) || 0,
        };
      });

      const previous = {
        players: state.players,
        board: state.board,
        pot: state.pot,
        currentBet: state.currentBet,
        handNumber: state.handNumber,
        street: state.street,
        dealer: state.dealer,
        heroStyle: state.heroStyle,
        heroCurrentHand: state.heroCurrentHand,
      };

      const hiddenHero = {
        name: "Hero",
        isHuman: true,
        position: 0,
        stack: 1760,
        bet: 80,
        totalContribution: 160,
        folded: false,
        allIn: false,
        lastAction: "call",
        status: "跟注 80",
      };
      Object.defineProperty(hiddenHero, "cards", {
        configurable: true,
        get() {
          throw new Error("hidden-opponent-cards-read");
        },
      });
      const opening = {
        name: "Shark",
        position: 1,
        stack: 1680,
        bet: 40,
        totalContribution: 120,
        folded: false,
        allIn: false,
        raiseLocked: false,
        cards: [
          { value: 14, suit: "spades" },
          { value: 11, suit: "spades" },
        ],
      };
      const boss = {
        name: "Chronos",
        position: 2,
        stack: 2100,
        bet: 40,
        totalContribution: 120,
        folded: false,
        allIn: false,
        raiseLocked: false,
        cards: [
          { value: 13, suit: "hearts" },
          { value: 13, suit: "clubs" },
        ],
      };

      try {
        state.players = [hiddenHero, opening, boss];
        state.board = [
          { value: 13, suit: "diamonds" },
          { value: 9, suit: "spades" },
          { value: 6, suit: "spades" },
          { value: 2, suit: "hearts" },
        ];
        state.pot = 420;
        state.currentBet = 80;
        state.handNumber = 42;
        state.street = "轉牌";
        state.dealer = 0;
        state.heroStyle = {
          hands: 24,
          folds: 9,
          calls: 8,
          raises: 6,
          allIns: 1,
          vpip: 13,
          showdowns: 4,
        };
        state.heroCurrentHand = {
          raised: false,
          allIn: false,
          called: true,
          checked: false,
        };

        const openingDecision = api.chooseOpeningDecision(opening, {
          random: () => 0.4,
        });
        const bossDecision = api.chooseBossDecision(boss);
        const middleDecision = api.enhanceTierDecision(
          { name: "Nori" },
          {
            action: "call",
            raiseBy: 0,
            sizeFraction: 0,
            equityProxy: 0.44,
            raiseCalledEquity: 0.46,
            valueReady: false,
            bluffing: false,
            context: {
              street: "turn",
              pot: 420,
              needed: 40,
              equityProxy: 0.44,
              drawPotential: 0.04,
              spr: 4,
            },
            candidates: [
              { fraction: 0.33, raiseBy: 140, foldEquity: 0.28, ev: 12 },
              { fraction: 0.72, raiseBy: 300, foldEquity: 0.39, ev: 18 },
            ],
          },
          { random: () => 0.25 },
        );

        return {
          ratings,
          qualityTargets: api.qualityTargets,
          fairInformationPolicy: api.fairInformationPolicy,
          specialProfiles,
          openingDecision: {
            action: openingDecision.action,
            candidateCount: openingDecision.candidates.length,
            score10: openingDecision.targetScore10,
            publicInformationOnly: openingDecision.publicInformationOnly,
          },
          middleDecision: {
            action: middleDecision.action,
            score10: middleDecision.v28TargetScore10,
            publicInformationOnly: middleDecision.publicInformationOnly,
            rankedCandidates: middleDecision.v28RankedCandidates.length,
          },
          bossDecision: {
            action: bossDecision.action,
            score10: bossDecision.targetScore10,
            publicInformationOnly: bossDecision.publicInformationOnly,
            method: bossDecision.equityResult?.method || "",
            samples: bossDecision.equityResult?.samples || 0,
            rangeConditioned: Boolean(bossDecision.equityResult?.rangeConditioned),
            candidateCount: bossDecision.candidates.length,
          },
        };
      } finally {
        Object.assign(state, previous);
      }
    });

    const openingScores = ["Toto", "Pao", "Leo", "Foxy", "Wolf", "Shark"]
      .map(name => result.ratings[name].score10);
    const middleScores = ["Dodo", "Momo", "Ace", "Bruno", "Nori", "Viper"]
      .map(name => result.ratings[name].score10);
    const eliteScores = ["Nova", "Merlin", "Unit-9", "Vlad"]
      .map(name => result.ratings[name].score10);
    const specialScores = ["Oracle", "Chronos"]
      .map(name => result.ratings[name].score10);

    expect(Math.min(...openingScores)).toBeGreaterThanOrEqual(6.6);
    expect(Math.max(...openingScores)).toBeLessThanOrEqual(7.5);
    expect(Math.min(...middleScores)).toBeGreaterThanOrEqual(8.0);
    expect(Math.min(...eliteScores)).toBeGreaterThanOrEqual(9.0);
    expect(Math.min(...specialScores)).toBeGreaterThanOrEqual(9.5);
    expect(Math.max(...specialScores)).toBeLessThanOrEqual(10.0);

    expect(result.fairInformationPolicy).toMatchObject({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      revealedShowdowns: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    });
    for (const profile of result.specialProfiles) {
      expect(profile.omniscient).toBe(false);
      expect(profile.fairPlay).toBe(true);
      expect(profile.score10).toBeGreaterThanOrEqual(9.5);
    }

    expect(["fold", "call", "raise"]).toContain(result.openingDecision.action);
    expect(result.openingDecision.candidateCount).toBeGreaterThan(0);
    expect(result.openingDecision.publicInformationOnly).toBe(true);
    expect(["fold", "call", "raise"]).toContain(result.middleDecision.action);
    expect(result.middleDecision.rankedCandidates).toBeGreaterThan(0);
    expect(result.middleDecision.publicInformationOnly).toBe(true);
    expect(["fold", "call", "raise"]).toContain(result.bossDecision.action);
    expect(result.bossDecision.method).toContain("monte-carlo");
    expect(result.bossDecision.samples).toBeGreaterThanOrEqual(700);
    expect(result.bossDecision.rangeConditioned).toBe(true);
    expect(result.bossDecision.candidateCount).toBeGreaterThan(0);
    expect(result.bossDecision.publicInformationOnly).toBe(true);
  });
});