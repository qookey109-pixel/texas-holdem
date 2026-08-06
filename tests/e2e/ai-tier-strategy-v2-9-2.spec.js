import { expect, test } from "@playwright/test";

test.describe("AI V2.9.2 evidence calibration", () => {
  test("loads after V2.8 and applies only the evidence-backed guards", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiTierStrategyV292?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.2");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV292 || ""),
      { timeout: 15_000 },
    ).toBe("ready");

    const result = await page.evaluate(() => {
      const api = window.AiTierStrategyV292;
      const bossPlayer = { name: "Chronos", stack: 1800, bet: 40, folded: false, eliminated: false };
      const pao = { name: "Pao", stack: 1800, bet: 20, folded: false, eliminated: false };
      const shark = { name: "Shark", stack: 1600, bet: 80, folded: false, eliminated: false };

      const bossNegative = api.calibrateBossDecision(bossPlayer, {
        action: "call",
        callEv: -1.25,
        equity: 0.41,
        potOdds: 0.42,
        tier: "special",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 80,
        pot: 300,
        currentBet: 120,
        playerBet: 40,
        opponents: 2,
        street: "turn",
      });
      const bossNearZero = api.calibrateBossDecision(bossPlayer, {
        action: "call",
        callEv: -0.5,
        equity: 0.43,
        potOdds: 0.42,
        tier: "special",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 80,
        pot: 300,
        currentBet: 120,
        playerBet: 40,
        opponents: 2,
        street: "turn",
      });
      const paoFacingRaise = api.calibrateOpeningDecision(pao, {
        action: "call",
        callEv: 2,
        equityProxy: 0.31,
        potOdds: 0.36,
        valueReady: false,
        bluffing: false,
        tier: "opening",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 80,
        pot: 140,
        currentBet: 100,
        playerBet: 20,
        opponents: 2,
        position: "MP",
        street: "preflop",
      });
      const sharkRiver = api.calibrateOpeningDecision(shark, {
        action: "call",
        callEv: 0.5,
        equityProxy: 0.44,
        potOdds: 0.42,
        valueReady: false,
        bluffing: false,
        tier: "opening",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 120,
        pot: 400,
        currentBet: 200,
        playerBet: 80,
        opponents: 1,
        position: "BB",
        street: "river",
      });

      return {
        version: api.version,
        evidence: api.evidence,
        calibratedOpeningNames: api.calibratedOpeningNames,
        specialNames: api.specialNames,
        fairInformationPolicy: api.fairInformationPolicy,
        rosterVersions: Object.fromEntries(
          ["Pao", "Shark", "Oracle", "Chronos"].map(name => {
            const profile = AI_ROSTER.find(candidate => candidate.name === name);
            return [name, {
              calibrationVersion: profile?.aiTierCalibrationVersion || "",
              publicInformationOnly: Boolean(profile?.publicInformationOnly),
              omniscient: Object.prototype.hasOwnProperty.call(profile || {}, "omniscient"),
            }];
          }),
        ),
        bossNegative,
        bossNearZero,
        paoFacingRaise,
        sharkRiver,
      };
    });

    expect(result.version).toBe("2.9.2");
    expect(result.evidence).toMatchObject({
      sourceRunId: 31072973185,
      completedHands: 25000,
      shards: 50,
    });
    expect(result.calibratedOpeningNames).toEqual(["Pao", "Shark"]);
    expect(result.specialNames).toEqual(["Oracle", "Chronos"]);
    expect(result.fairInformationPolicy).toMatchObject({
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    });

    for (const profile of Object.values(result.rosterVersions)) {
      expect(profile.calibrationVersion).toBe("2.9.2");
      expect(profile.publicInformationOnly).toBe(true);
      expect(profile.omniscient).toBe(false);
    }

    expect(result.bossNegative.action).toBe("fold");
    expect(result.bossNegative.v292Adjustment).toBe("boss-negative-ev-discipline");
    expect(result.bossNegative.v292NegativeEvBoundary).toBe(-0.8);
    expect(result.bossNearZero.action).toBe("call");

    expect(result.paoFacingRaise.action).toBe("fold");
    expect(result.paoFacingRaise.v292Adjustment).toBe("opening-raise-discipline");
    expect(result.paoFacingRaise.v292RequiredEquity).toBeGreaterThan(0.4);

    expect(result.sharkRiver.action).toBe("fold");
    expect(result.sharkRiver.v292Adjustment).toBe("opening-river-discipline");
    expect(result.sharkRiver.publicInformationOnly).toBe(true);
  });
});
