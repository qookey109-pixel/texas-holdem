import { expect, test } from "@playwright/test";

test.describe("AI V2.9.5 WTSD discipline recovery R2", () => {
  test("tightens surviving late calls and minimally recovers Wolf preflop entry", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiWtsdDisciplineV295R2?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.5-r2");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiWtsdDisciplineV295R2 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => Boolean(window.AiTierStrategyV28?.__aiWtsdDisciplineV295R2)),
      { timeout: 15_000 },
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => Boolean(botAction?.__aiWtsdDisciplineV295R2Wrapper)),
      { timeout: 15_000 },
    ).toBe(true);

    const result = await page.evaluate(() => {
      const api = window.AiWtsdDisciplineV295R2;
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
        const foxyMarginal = api.tightenLateDecision(foxy, candidate(0.52, 15, true));

        const leo = player("Leo");
        state.players = [hero, leo, other];
        const leoMarginal = api.tightenLateDecision(leo, candidate(0.55, 18, true));

        const wolf = player("Wolf");
        state.players = [hero, wolf, other];
        const wolfMarginal = api.tightenLateDecision(wolf, candidate(0.60, 24, true));
        const wolfStrong = api.tightenLateDecision(wolf, candidate(0.90, 80, true));

        state.board = [];
        state.pot = 200;
        state.currentBet = 20;
        state.players = [hero, wolf, other];
        const wolfEntry = api.calibrateWolfPreflopDecision(wolf, {
          action: "call",
          equityProxy: 0.497,
          callEv: 8,
          valueReady: false,
          publicInformationOnly: true,
        }, {
          street: "preflop",
          bigBlind: 20,
          needed: 20,
          pot: 200,
          currentBet: 20,
          playerBet: 0,
          stack: 900,
          opponents: 2,
          position: "BTN",
        });

        return {
          foxyMarginal,
          leoMarginal,
          wolfMarginal,
          wolfStrong,
          wolfEntry,
          targets: api.targetNames,
          openingVersion: window.AiOpeningBalanceV295?.version,
          combinedEvidenceAvailable: typeof window.AiOpeningBalanceV295?.runtimeEvidence === "function",
          previousV294Visible: Boolean(botAction?.__previousBotAction?.__aiOpeningBalanceV294Wrapper),
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

    for (const marginal of [result.foxyMarginal, result.leoMarginal, result.wolfMarginal]) {
      expect(marginal.action).toBe("fold");
      expect(marginal.v295R2Adjustment).toMatch(/discipline-r2$/);
      expect(marginal.publicInformationOnly).toBe(true);
    }
    expect(result.wolfStrong.action).toBe("call");
    expect(result.wolfStrong.v295R2ProtectedStrongValue).toBe(true);
    expect(result.wolfEntry.action).toBe("call");
    expect(result.wolfEntry.v295R2WolfEntryRecovery).toBe(true);
    expect(result.wolfEntry.publicInformationOnly).toBe(true);
    expect(result.targets).toEqual(["Foxy", "Leo", "Wolf"]);
    expect(result.openingVersion).toBe("2.9.5");
    expect(result.combinedEvidenceAvailable).toBe(true);
    expect(result.previousV294Visible).toBe(true);
    expect(result.hiddenCardsAllowed).toBe(false);
    expect(result.deckOrderAllowed).toBe(false);
    expect(result.futureBoardAllowed).toBe(false);
  });
});
