import { expect, test } from "@playwright/test";

test.describe("AI V2.9.5 WTSD discipline recovery R1", () => {
  test("tightens Foxy, Leo and Wolf while preserving strong value and fairness", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiWtsdDisciplineV295R1?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.5-r1");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiWtsdDisciplineV295R1 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => Boolean(window.AiTierStrategyV28?.__aiWtsdDisciplineV295R1)),
      { timeout: 15_000 },
    ).toBe(true);

    const result = await page.evaluate(() => {
      const api = window.AiWtsdDisciplineV295R1;
      const priorState = {
        board: state.board,
        pot: state.pot,
        players: state.players,
        currentBet: state.currentBet,
      };
      const player = name => ({ name, stack: 900, bet: 0, folded: false, eliminated: false });
      const hero = { name: "玩家", isHuman: true, stack: 900, bet: 0, folded: false, eliminated: false };
      const other = { name: "Pao", stack: 900, bet: 0, folded: false, eliminated: false };
      const candidate = (equityProxy, callEv, valueReady = false) => ({
        action: "call",
        equityProxy,
        callEv,
        valueReady,
        publicInformationOnly: true,
      });

      try {
        state.board = [{}, {}, {}, {}, {}];
        state.pot = 200;
        state.currentBet = 50;

        const foxy = player("Foxy");
        state.players = [hero, foxy, other];
        foxy.bet = 0;
        const foxyWeak = api.tightenDecision(foxy, candidate(0.40, 50, true));

        const leo = player("Leo");
        state.players = [hero, leo, other];
        const leoWeak = api.tightenDecision(leo, candidate(0.44, 50, true));

        const wolf = player("Wolf");
        state.players = [hero, wolf, other];
        const wolfWeak = api.tightenDecision(wolf, candidate(0.50, 50, true));
        const wolfStrong = api.tightenDecision(wolf, candidate(0.86, 50, true));

        const toto = player("Toto");
        state.players = [hero, toto, other];
        const totoDecision = candidate(0.30, -50, false);
        const totoUntouched = api.tightenDecision(toto, totoDecision);

        return {
          foxyWeak,
          leoWeak,
          wolfWeak,
          wolfStrong,
          totoUntouched: totoUntouched === totoDecision,
          targets: api.targetNames,
          hiddenCardsAllowed: api.fairInformationPolicy.hiddenOpponentCards,
          deckOrderAllowed: api.fairInformationPolicy.actualDeckOrder,
          futureBoardAllowed: api.fairInformationPolicy.futureBoardAnswer,
        };
      } finally {
        state.board = priorState.board;
        state.pot = priorState.pot;
        state.players = priorState.players;
        state.currentBet = priorState.currentBet;
      }
    });

    for (const weak of [result.foxyWeak, result.leoWeak, result.wolfWeak]) {
      expect(weak.action).toBe("fold");
      expect(weak.v295R1Adjustment).toMatch(/discipline-r1$/);
      expect(weak.publicInformationOnly).toBe(true);
    }
    expect(result.wolfStrong.action).toBe("call");
    expect(result.wolfStrong.v295R1ProtectedStrongValue).toBe(true);
    expect(result.totoUntouched).toBe(true);
    expect(result.targets).toEqual(["Foxy", "Leo", "Wolf"]);
    expect(result.hiddenCardsAllowed).toBe(false);
    expect(result.deckOrderAllowed).toBe(false);
    expect(result.futureBoardAllowed).toBe(false);
  });
});
