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
      const ratings = window.AiTierStrategyV28.targetRatings;
      const bossPlayer = { name: "Chronos", stack: 1800, bet: 40, folded: false, eliminated: false };
      const pao = { name: "Pao", stack: 1800, bet: 20, folded: false, eliminated: false };
      const shark = { name: "Shark", stack: 1600, bet: 80, folded: false, eliminated: false };
      const wrapperInstalled = (() => {
        let current = botAction;
        for (let depth = 0; current && depth < 16; depth += 1) {
          if (current.__aiTierStrategyV292Wrapper) return true;
          current = current.__previousBotAction;
        }
        return false;
      })();

      const bossNegative = api.calibrateBossDecision(bossPlayer, {
        action: "call",
        callEv: -0.81,
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
        callEv: -0.79,
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
      const paoWeakOpenCall = api.calibrateOpeningDecision(pao, {
        action: "call",
        callEv: 2,
        equityProxy: 0.44,
        potOdds: 0.2,
        valueReady: false,
        bluffing: false,
        tier: "opening",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 20,
        pot: 80,
        currentBet: 20,
        playerBet: 0,
        stack: 1800,
        opponents: 1,
        position: "MP",
        street: "preflop",
      });
      const paoPlayableOpenCall = api.calibrateOpeningDecision(pao, {
        action: "call",
        callEv: 2,
        equityProxy: 0.5,
        potOdds: 0.2,
        valueReady: false,
        bluffing: false,
        tier: "opening",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 20,
        pot: 80,
        currentBet: 20,
        playerBet: 0,
        stack: 1800,
        opponents: 1,
        position: "MP",
        street: "preflop",
      });
      const paoFacingRaise = api.calibrateOpeningDecision(pao, {
        action: "call",
        callEv: 2,
        equityProxy: 0.51,
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
        stack: 1800,
        opponents: 2,
        position: "MP",
        street: "preflop",
      });
      const sharkHeavyPressure = api.calibrateOpeningDecision(shark, {
        action: "call",
        callEv: 3,
        equityProxy: 0.6,
        potOdds: 0.4,
        valueReady: false,
        bluffing: false,
        tier: "opening",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 320,
        pot: 480,
        currentBet: 400,
        playerBet: 80,
        stack: 1600,
        opponents: 1,
        position: "BB",
        street: "preflop",
      });
      const sharkRiver = api.calibrateOpeningDecision(shark, {
        action: "call",
        callEv: -0.1,
        equityProxy: 0.44,
        potOdds: 0.42,
        valueReady: true,
        bluffing: false,
        tier: "opening",
        reason: "base",
      }, {
        bigBlind: 20,
        needed: 120,
        pot: 400,
        currentBet: 200,
        playerBet: 80,
        stack: 1600,
        opponents: 1,
        position: "BB",
        street: "river",
      });

      return {
        version: api.version,
        wrapperInstalled,
        evidence: api.evidence,
        openingGuards: api.openingGuards,
        calibratedOpeningNames: api.calibratedOpeningNames,
        specialNames: api.specialNames,
        fairInformationPolicy: api.fairInformationPolicy,
        ratings: {
          Pao: ratings.Pao.score10,
          Shark: ratings.Shark.score10,
          Oracle: ratings.Oracle.score10,
          Chronos: ratings.Chronos.score10,
        },
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
        paoWeakOpenCall,
        paoPlayableOpenCall,
        paoFacingRaise,
        sharkHeavyPressure,
        sharkRiver,
      };
    });

    expect(result.version).toBe("2.9.2");
    expect(result.wrapperInstalled).toBe(true);
    expect(result.evidence).toMatchObject({
      sourceRunId: 31072973185,
      completedHands: 25000,
      shards: 50,
      heroProfiles: 5,
      promotionThreshold: 0.03,
    });
    expect(result.openingGuards.Pao).toMatchObject({ openFloor: 0.46, raiseFloor: 0.52, reraiseFloor: 0.58 });
    expect(result.openingGuards.Shark).toMatchObject({ openFloor: 0.48, raiseFloor: 0.55, reraiseFloor: 0.62 });
    expect(result.calibratedOpeningNames).toEqual(["Pao", "Shark"]);
    expect(result.specialNames).toEqual(["Oracle", "Chronos"]);
    expect(result.fairInformationPolicy).toMatchObject({
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    });
    expect(result.ratings).toEqual({ Pao: 6.7, Shark: 7.5, Oracle: 9.6, Chronos: 9.8 });

    for (const profile of Object.values(result.rosterVersions)) {
      expect(profile.calibrationVersion).toBe("2.9.2");
      expect(profile.publicInformationOnly).toBe(true);
      expect(profile.omniscient).toBe(false);
    }

    expect(result.bossNegative.action).toBe("fold");
    expect(result.bossNegative.v292Adjustment).toBe("boss-negative-ev-discipline");
    expect(result.bossNegative.v292NegativeEvBoundary).toBe(-0.8);
    expect(result.bossNearZero.action).toBe("call");

    expect(result.paoWeakOpenCall.action).toBe("fold");
    expect(result.paoWeakOpenCall.v292Adjustment).toBe("opening-range-floor");
    expect(result.paoWeakOpenCall.v292RequiredEquity).toBe(0.46);
    expect(result.paoPlayableOpenCall.action).toBe("call");
    expect(result.paoFacingRaise.action).toBe("fold");
    expect(result.paoFacingRaise.v292Adjustment).toBe("opening-raise-discipline");
    expect(result.paoFacingRaise.v292RequiredEquity).toBeGreaterThanOrEqual(0.52);

    expect(result.sharkHeavyPressure.action).toBe("fold");
    expect(result.sharkHeavyPressure.v292Adjustment).toBe("opening-reraise-discipline");
    expect(result.sharkHeavyPressure.v292RequiredEquity).toBeGreaterThanOrEqual(0.62);
    expect(result.sharkRiver.action).toBe("fold");
    expect(result.sharkRiver.v292Adjustment).toBe("opening-river-negative-ev-stop");
    expect(result.sharkRiver.publicInformationOnly).toBe(true);
  });
});