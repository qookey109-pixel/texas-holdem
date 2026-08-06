import { expect, test } from "@playwright/test";

test.describe("AI V2.9.4 opening balance", () => {
  test("tightens weak entries while preserving role-specific aggression", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiOpeningBalanceV294?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.4");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV294 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => Boolean(botAction?.__aiOpeningBalanceV294Wrapper)),
      { timeout: 15_000 },
    ).toBe(true);

    const result = await page.evaluate(() => {
      const api = window.AiOpeningBalanceV294;
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
      const river = overrides => ({
        street: "river",
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

      const weakToto = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.42 }),
        preflop({ position: "MP" }),
      );
      const strongToto = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.70 }),
        preflop({ position: "MP" }),
      );
      const protectedFoxyBluff = api.calibrateDecision(
        player("Foxy"),
        decision({
          action: "raise",
          raiseBy: 60,
          sizeFraction: 0.6,
          equityProxy: 0.45,
          bluffing: true,
        }),
        preflop({ position: "BTN", opponents: 3 }),
      );
      const weakLeoOpen = api.calibrateDecision(
        player("Leo"),
        decision({
          action: "raise",
          raiseBy: 70,
          sizeFraction: 0.7,
          equityProxy: 0.42,
        }),
        preflop({ position: "UTG" }),
      );
      const weakWolfRiverCall = api.calibrateDecision(
        player("Wolf"),
        decision({ equityProxy: 0.36, callEv: -2 }),
        river({}),
      );
      const optimisticWolfRiverCall = api.calibrateDecision(
        player("Wolf"),
        decision({ equityProxy: 0.18, callEv: 50 }),
        river({}),
      );
      const pricedTotoRiverCall = api.calibrateDecision(
        player("Toto"),
        decision({ equityProxy: 0.48, callEv: 1 }),
        river({ needed: 30, currentBet: 30, position: "BB" }),
      );
      const paoDecision = decision({ equityProxy: 0.2 });
      const untouchedPao = api.calibrateDecision(player("Pao"), paoDecision, preflop({}));

      return {
        weakToto: {
          action: weakToto.action,
          adjustment: weakToto.v294Adjustment,
          callFloor: weakToto.v294CallFloor,
        },
        strongToto: {
          action: strongToto.action,
          adjustment: strongToto.v294Adjustment,
        },
        protectedFoxyBluff: {
          action: protectedFoxyBluff.action,
          adjustment: protectedFoxyBluff.v294Adjustment,
          protected: protectedFoxyBluff.v294ProtectedBluff,
        },
        weakLeoOpen: {
          action: weakLeoOpen.action,
          adjustment: weakLeoOpen.v294Adjustment,
        },
        weakWolfRiverCall: {
          action: weakWolfRiverCall.action,
          adjustment: weakWolfRiverCall.v294Adjustment,
          evFloor: weakWolfRiverCall.v294PostflopEvFloor,
        },
        optimisticWolfRiverCall: {
          action: optimisticWolfRiverCall.action,
          adjustment: optimisticWolfRiverCall.v294Adjustment,
          equityFloor: optimisticWolfRiverCall.v294PostflopEquityFloor,
        },
        pricedTotoRiverCall: {
          action: pricedTotoRiverCall.action,
          adjustment: pricedTotoRiverCall.v294Adjustment,
        },
        untouchedPao: untouchedPao === paoDecision && !untouchedPao.v294Adjustment,
        targets: api.targetNames,
        hiddenCardsAllowed: api.fairInformationPolicy.hiddenOpponentCards,
        deckOrderAllowed: api.fairInformationPolicy.actualDeckOrder,
        futureBoardAllowed: api.fairInformationPolicy.futureBoardAnswer,
      };
    });

    expect(result.weakToto.action).toBe("fold");
    expect(result.weakToto.adjustment).toBe("opening-call-floor");
    expect(result.weakToto.callFloor).toBeGreaterThan(0.42);
    expect(result.strongToto.action).toBe("call");
    expect(result.strongToto.adjustment).toBe("none");
    expect(result.protectedFoxyBluff.action).toBe("raise");
    expect(result.protectedFoxyBluff.protected).toBe(true);
    expect(result.weakLeoOpen.action).toBe("fold");
    expect(result.weakLeoOpen.adjustment).toBe("opening-weak-open-fold");
    expect(result.weakWolfRiverCall.action).toBe("fold");
    expect(result.weakWolfRiverCall.adjustment).toBe("river-call-ev-discipline");
    expect(result.weakWolfRiverCall.evFloor).toBeGreaterThan(0);
    expect(result.optimisticWolfRiverCall.action).toBe("fold");
    expect(result.optimisticWolfRiverCall.adjustment).toBe("river-equity-price-discipline");
    expect(result.optimisticWolfRiverCall.equityFloor).toBeGreaterThan(0.18);
    expect(result.pricedTotoRiverCall.action).toBe("call");
    expect(result.pricedTotoRiverCall.adjustment).toBe("none");
    expect(result.untouchedPao).toBe(true);
    expect(result.targets).toEqual(["Toto", "Foxy", "Leo", "Wolf"]);
    expect(result.hiddenCardsAllowed).toBe(false);
    expect(result.deckOrderAllowed).toBe(false);
    expect(result.futureBoardAllowed).toBe(false);
  });
});
