import { expect, test } from "@playwright/test";

test.describe("AI V2.9.5 opening and WTSD recovery", () => {
  test("recovers Toto entries and requires real late-street value", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.5");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV295 || ""),
      { timeout: 15_000 },
    ).toBe("ready");

    const result = await page.evaluate(() => {
      const api = window.AiOpeningBalanceV295;
      const player = name => ({ name, stack: 1800, bet: 0, raiseLocked: false });
      const decision = overrides => ({
        action: "call",
        raiseBy: 0,
        sizeFraction: 0,
        equityProxy: 0.5,
        potOdds: 0.2,
        callEv: 4,
        valueReady: false,
        bluffing: false,
        publicInformationOnly: true,
        ...overrides,
      });
      const preflop = overrides => ({
        street: "preflop",
        bigBlind: 20,
        needed: 20,
        pot: 100,
        currentBet: 20,
        playerBet: 0,
        stack: 1800,
        opponents: 5,
        position: "MP",
        ...overrides,
      });
      const turn = overrides => ({
        street: "turn",
        bigBlind: 20,
        needed: 50,
        pot: 200,
        currentBet: 50,
        playerBet: 0,
        stack: 900,
        opponents: 2,
        position: "CO",
        ...overrides,
      });
      const river = overrides => ({ ...turn({}), street: "river", ...overrides });

      const totoMarginalRaise = api.calibrateDecision(
        player("Toto"),
        decision({
          action: "raise",
          raiseBy: 60,
          sizeFraction: 0.6,
          equityProxy: 0.508,
        }),
        preflop({}),
      );
      const totoJunkCall = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.43 }),
        preflop({}),
      );
      const totoPressureCall = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.52 }),
        preflop({ needed: 60, currentBet: 60 }),
      );
      const wolfMarginalOpen = api.calibrateDecision(
        player("Wolf"),
        decision({
          action: "raise",
          raiseBy: 40,
          sizeFraction: 0.4,
          equityProxy: 0.38,
        }),
        preflop({ opponents: 1, position: "CO" }),
      );
      const foxyMarginalValue = api.calibrateDecision(
        player("Foxy"),
        decision({ equityProxy: 0.25, callEv: 50, valueReady: true }),
        river({}),
      );
      const leoMarginalValue = api.calibrateDecision(
        player("Leo"),
        decision({ equityProxy: 0.24, callEv: 50, valueReady: true }),
        turn({}),
      );
      const wolfMarginalValue = api.calibrateDecision(
        player("Wolf"),
        decision({ equityProxy: 0.28, callEv: 50, valueReady: true }),
        river({}),
      );
      const wolfStrongValue = api.calibrateDecision(
        player("Wolf"),
        decision({ equityProxy: 0.72, callEv: -20, valueReady: true }),
        river({}),
      );
      const totoPricedRiver = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.36, callEv: 3 }),
        river({ needed: 30, currentBet: 30, position: "BB" }),
      );
      const totoRiverFloor = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.9, callEv: 50 }),
        river({}),
      );
      const wolfRiverFloor = api.calibrateDecision(
        player("Wolf"),
        decision({ equityProxy: 0.9, callEv: 50 }),
        river({}),
      );
      const paoDecision = decision({ equityProxy: 0.2 });
      const untouchedPao = api.calibrateDecision(player("Pao"), paoDecision, preflop({}));

      return {
        totoMarginalRaise: {
          action: totoMarginalRaise.action,
          adjustment: totoMarginalRaise.v295Adjustment,
          callFloor: totoMarginalRaise.v295CallFloor,
          raiseFloor: totoMarginalRaise.v295RaiseFloor,
        },
        totoJunkCall: {
          action: totoJunkCall.action,
          adjustment: totoJunkCall.v295Adjustment,
        },
        totoPressureCall: {
          action: totoPressureCall.action,
          adjustment: totoPressureCall.v295Adjustment,
        },
        wolfMarginalOpen: {
          action: wolfMarginalOpen.action,
          adjustment: wolfMarginalOpen.v295Adjustment,
          raiseFloor: wolfMarginalOpen.v295RaiseFloor,
        },
        foxyMarginalValue: {
          action: foxyMarginalValue.action,
          adjustment: foxyMarginalValue.v295Adjustment,
          protected: foxyMarginalValue.v295ProtectedStrongValue,
        },
        leoMarginalValue: {
          action: leoMarginalValue.action,
          adjustment: leoMarginalValue.v295Adjustment,
          protected: leoMarginalValue.v295ProtectedStrongValue,
        },
        wolfMarginalValue: {
          action: wolfMarginalValue.action,
          adjustment: wolfMarginalValue.v295Adjustment,
          protected: wolfMarginalValue.v295ProtectedStrongValue,
        },
        wolfStrongValue: {
          action: wolfStrongValue.action,
          adjustment: wolfStrongValue.v295Adjustment,
          protected: wolfStrongValue.v295ProtectedStrongValue,
        },
        totoPricedRiver: {
          action: totoPricedRiver.action,
          adjustment: totoPricedRiver.v295Adjustment,
        },
        totoRiverFloor: totoRiverFloor.v295PostflopEquityFloor,
        wolfRiverFloor: wolfRiverFloor.v295PostflopEquityFloor,
        wolfGuard: api.guards.Wolf,
        untouchedPao: untouchedPao === paoDecision && !untouchedPao.v295Adjustment,
        targets: api.targetNames,
        hiddenCardsAllowed: api.fairInformationPolicy.hiddenOpponentCards,
        deckOrderAllowed: api.fairInformationPolicy.actualDeckOrder,
        futureBoardAllowed: api.fairInformationPolicy.futureBoardAnswer,
      };
    });

    expect(result.totoMarginalRaise.action).toBe("call");
    expect(result.totoMarginalRaise.adjustment).toBe("toto-marginal-entry-rescue");
    expect(result.totoMarginalRaise.callFloor).toBeLessThanOrEqual(0.508);
    expect(result.totoMarginalRaise.raiseFloor).toBeGreaterThan(0.508);
    expect(result.totoJunkCall.action).toBe("fold");
    expect(result.totoJunkCall.adjustment).toBe("opening-call-floor");
    expect(result.totoPressureCall.action).toBe("fold");
    expect(result.totoPressureCall.adjustment).toBe("opening-raise-fold");
    expect(result.wolfMarginalOpen.action).toBe("raise");
    expect(result.wolfMarginalOpen.adjustment).toBe("none");
    expect(result.wolfMarginalOpen.raiseFloor).toBeLessThanOrEqual(0.38);
    expect(result.wolfGuard.openFloor).toBe(0.415);
    expect(result.wolfGuard.callFloor).toBe(0.52);
    expect(result.wolfGuard.lateDiscount).toBe(0.045);

    for (const marginal of [
      result.foxyMarginalValue,
      result.leoMarginalValue,
      result.wolfMarginalValue,
    ]) {
      expect(marginal.action).toBe("fold");
      expect(marginal.protected).toBe(false);
      expect(marginal.adjustment).toMatch(/-(equity-price|call-ev)-discipline$/);
    }

    expect(result.wolfStrongValue.action).toBe("call");
    expect(result.wolfStrongValue.adjustment).toBe("none");
    expect(result.wolfStrongValue.protected).toBe(true);
    expect(result.totoPricedRiver.action).toBe("call");
    expect(result.totoPricedRiver.adjustment).toBe("none");
    expect(result.wolfRiverFloor).toBeGreaterThan(result.totoRiverFloor);
    expect(result.untouchedPao).toBe(true);
    expect(result.targets).toEqual(["Toto", "Foxy", "Leo", "Wolf"]);
    expect(result.hiddenCardsAllowed).toBe(false);
    expect(result.deckOrderAllowed).toBe(false);
    expect(result.futureBoardAllowed).toBe(false);
  });
});
