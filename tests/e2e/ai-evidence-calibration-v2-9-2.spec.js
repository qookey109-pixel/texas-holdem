import { expect, test } from "@playwright/test";

test.describe("AI V2.9.2 evidence calibration", () => {
  test("loads after V2.8 and applies only the measured guardrails", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiEvidenceCalibrationV292?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.2");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiEvidenceCalibrationV292 || ""),
      { timeout: 15_000 },
    ).toBe("ready");

    const result = await page.evaluate(() => {
      const api = window.AiEvidenceCalibrationV292;
      const ratings = window.AiTierStrategyV28.targetRatings;
      return {
        wrapperInstalled: Boolean(botAction.__aiEvidenceCalibrationV292Wrapper),
        sourceEvidence: api.sourceEvidence,
        policy: api.fairInformationPolicy,
        bossNegative: api.evaluateBossCalibration({
          name: "Oracle",
          action: "call",
          needed: 40,
          bigBlind: 20,
          callEv: -0.81,
        }),
        bossAcceptable: api.evaluateBossCalibration({
          name: "Chronos",
          action: "call",
          needed: 40,
          bigBlind: 20,
          callEv: -0.79,
        }),
        paoWeakOpenCall: api.evaluateOpeningCalibration({
          name: "Pao",
          action: "call",
          needed: 20,
          bigBlind: 20,
          stack: 1800,
          street: "preflop",
          equityProxy: 0.44,
          callEv: 3,
        }),
        paoPlayableOpenCall: api.evaluateOpeningCalibration({
          name: "Pao",
          action: "call",
          needed: 20,
          bigBlind: 20,
          stack: 1800,
          street: "preflop",
          equityProxy: 0.5,
          callEv: 3,
        }),
        sharkRaisedPotCall: api.evaluateOpeningCalibration({
          name: "Shark",
          action: "call",
          needed: 100,
          bigBlind: 20,
          stack: 1600,
          street: "preflop",
          equityProxy: 0.54,
          callEv: 2,
        }),
        sharkTurnLeak: api.evaluateOpeningCalibration({
          name: "Shark",
          action: "call",
          needed: 60,
          bigBlind: 20,
          stack: 1500,
          street: "turn",
          equityProxy: 0.58,
          callEv: -0.9,
        }),
        untouchedRole: api.evaluateOpeningCalibration({
          name: "Leo",
          action: "call",
          needed: 100,
          bigBlind: 20,
          stack: 1600,
          street: "preflop",
          equityProxy: 0.2,
          callEv: -100,
        }),
        ratings: {
          Pao: ratings.Pao.score10,
          Shark: ratings.Shark.score10,
          Oracle: ratings.Oracle.score10,
          Chronos: ratings.Chronos.score10,
        },
      };
    });

    expect(result.wrapperInstalled).toBe(true);
    expect(result.sourceEvidence).toMatchObject({
      completedHands: 25_000,
      shards: 50,
      heroProfiles: 5,
      promotionThreshold: 0.03,
    });
    expect(result.policy).toMatchObject({
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    });

    expect(result.bossNegative.fold).toBe(true);
    expect(result.bossNegative.code).toBe("boss-negative-ev-call-stop");
    expect(result.bossAcceptable.fold).toBe(false);

    expect(result.paoWeakOpenCall.fold).toBe(true);
    expect(result.paoWeakOpenCall.floor).toBe(0.46);
    expect(result.paoPlayableOpenCall.fold).toBe(false);
    expect(result.sharkRaisedPotCall.fold).toBe(true);
    expect(result.sharkRaisedPotCall.floor).toBe(0.55);
    expect(result.sharkTurnLeak.fold).toBe(true);
    expect(result.sharkTurnLeak.code).toBe("opening-late-street-negative-ev-stop");
    expect(result.untouchedRole.fold).toBe(false);

    expect(result.ratings).toEqual({
      Pao: 6.7,
      Shark: 7.5,
      Oracle: 9.6,
      Chronos: 9.8,
    });
  });
});
