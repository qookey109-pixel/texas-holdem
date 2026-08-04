import { expect, test } from "@playwright/test";

const POT_SCENARIOS = 5_000;
const SHOWDOWN_SCENARIOS = 600;

function attachStressReport(testInfo, report) {
  return testInfo.attach("poker-core-stress.json", {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: "application/json",
  });
}

test.describe("固定種子牌局核心壓力測試", () => {
  test.setTimeout(120_000);

  test("隨機主池與邊池拆分維持投入總額與合法參賽者", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const report = await page.evaluate(({ scenarios }) => {
      window.AiTimingController?.clear?.();
      window.GeminiAsyncBettingLoop?.cancelPending?.();
      if (typeof clearAutoNewHandTimer === "function") clearAutoNewHandTimer();
      if (typeof clearDialogueTimers === "function") clearDialogueTimers();

      if (typeof buildPots !== "function") {
        throw new Error("buildPots is unavailable");
      }

      let seed = 0x7f4a7c15;
      const next = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x1_0000_0000;
      };
      const integer = (minimum, maximum) => (
        minimum + Math.floor(next() * (maximum - minimum + 1))
      );

      let maximumPotCount = 0;
      let maximumTotalContribution = 0;
      let splitPotScenarios = 0;
      let foldedContributorScenarios = 0;

      for (let scenario = 0; scenario < scenarios; scenario += 1) {
        const playerCount = integer(2, 6);
        const contributions = Array.from({ length: playerCount }, () => integer(0, 80) * 10);
        const activeIndexes = new Set();

        while (activeIndexes.size < Math.min(2, playerCount)) {
          activeIndexes.add(integer(0, playerCount - 1));
        }

        const maximum = Math.max(...contributions, 20);
        const activeMaximumIndex = [...activeIndexes][integer(0, activeIndexes.size - 1)];
        contributions[activeMaximumIndex] = maximum;

        if (contributions.every(value => value === 0)) {
          contributions[activeMaximumIndex] = 20;
        }

        state.players = contributions.map((totalContribution, index) => ({
          position: index,
          name: `Stress ${index}`,
          folded: !activeIndexes.has(index),
          totalContribution,
          stack: 10_000 - totalContribution,
        }));
        state.pot = contributions.reduce((sum, value) => sum + value, 0);

        const pots = buildPots();
        const distributed = pots.reduce((sum, pot) => sum + pot.amount, 0);
        const eligible = new Set(
          state.players.filter(player => !player.folded).map(player => player.position),
        );

        if (distributed !== state.pot) {
          throw new Error(
            `scenario ${scenario}: pot mismatch ${distributed} !== ${state.pot}; `
            + `contributions=${JSON.stringify(contributions)}`,
          );
        }

        for (const pot of pots) {
          if (!Number.isInteger(pot.amount) || pot.amount <= 0) {
            throw new Error(`scenario ${scenario}: invalid pot amount ${pot.amount}`);
          }
          if (!Array.isArray(pot.eligiblePlayerIds) || pot.eligiblePlayerIds.length === 0) {
            throw new Error(`scenario ${scenario}: pot has no eligible player`);
          }
          for (const playerId of pot.eligiblePlayerIds) {
            if (!eligible.has(playerId)) {
              throw new Error(`scenario ${scenario}: folded player ${playerId} remained eligible`);
            }
          }
        }

        maximumPotCount = Math.max(maximumPotCount, pots.length);
        maximumTotalContribution = Math.max(maximumTotalContribution, state.pot);
        if (pots.length > 1) splitPotScenarios += 1;
        if (state.players.some(player => player.folded && player.totalContribution > 0)) {
          foldedContributorScenarios += 1;
        }
      }

      return {
        seed: "0x7f4a7c15",
        scenarios,
        maximumPotCount,
        maximumTotalContribution,
        splitPotScenarios,
        foldedContributorScenarios,
      };
    }, { scenarios: POT_SCENARIOS });

    expect(report.scenarios).toBe(POT_SCENARIOS);
    expect(report.splitPotScenarios).toBeGreaterThan(0);
    expect(report.foldedContributorScenarios).toBeGreaterThan(0);
    await attachStressReport(testInfo, report);
  });

  test("數百組隨機多人攤牌維持籌碼守恆、唯一牌面與非負籌碼", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const report = await page.evaluate(({ scenarios }) => {
      window.AiTimingController?.clear?.();
      window.GeminiAsyncBettingLoop?.cancelPending?.();
      if (typeof clearAutoNewHandTimer === "function") clearAutoNewHandTimer();
      if (typeof clearDialogueTimers === "function") clearDialogueTimers();

      for (const name of ["showdown", "evaluateBestHand", "buildPots"]) {
        if (typeof window[name] !== "function") throw new Error(`${name} is unavailable`);
      }

      const sideEffectNames = [
        "render",
        "showWinBanner",
        "animateWinChips",
        "log",
        "logScoreboard",
        "scheduleAutoNewHand",
        "say",
        "tableTalk",
      ];
      const originals = Object.fromEntries(
        sideEffectNames.map(name => [name, window[name]]),
      );
      const originalMaybeShowSessionSummary = window.maybeShowSessionSummary;
      const originalCompleteHeroStyleHand = window.completeHeroStyleHand;

      for (const name of sideEffectNames) window[name] = () => undefined;
      window.maybeShowSessionSummary = () => true;
      window.completeHeroStyleHand = () => undefined;

      let seed = 0x51de5eed;
      const next = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x1_0000_0000;
      };
      const integer = (minimum, maximum) => (
        minimum + Math.floor(next() * (maximum - minimum + 1))
      );
      const shuffle = values => {
        for (let index = values.length - 1; index > 0; index -= 1) {
          const target = integer(0, index);
          [values[index], values[target]] = [values[target], values[index]];
        }
        return values;
      };
      const createDeck = () => {
        const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
        const suits = ["clubs", "diamonds", "hearts", "spades"];
        return shuffle(suits.flatMap(suit => ranks.map(rank => ({ rank, suit }))));
      };
      const cardId = card => `${card.rank}-${card.suit}`;

      let splitPotScenarios = 0;
      let tieScenarios = 0;
      let maximumPot = 0;
      let maximumWinnerCount = 0;

      try {
        state.isMuted = true;
        state.autoNewHand = false;
        state.gameMode = "normal";
        state.tournament = { active: false };

        for (let scenario = 0; scenario < scenarios; scenario += 1) {
          const playerCount = integer(2, 6);
          const deck = createDeck();
          const board = deck.splice(0, 5);
          const bankrolls = Array.from({ length: playerCount }, () => integer(30, 500) * 10);
          const contributions = bankrolls.map(bankroll => integer(0, Math.floor(bankroll / 10)) * 10);
          const activeIndexes = new Set();

          while (activeIndexes.size < Math.min(2, playerCount)) {
            activeIndexes.add(integer(0, playerCount - 1));
          }

          const maximumContribution = Math.max(...contributions, 20);
          const activeMaximumIndex = [...activeIndexes][integer(0, activeIndexes.size - 1)];
          contributions[activeMaximumIndex] = Math.min(bankrolls[activeMaximumIndex], maximumContribution);

          if (contributions.every(value => value === 0)) {
            contributions[activeMaximumIndex] = Math.min(bankrolls[activeMaximumIndex], 20);
          }

          const players = bankrolls.map((bankroll, index) => ({
            position: index,
            name: `Stress ${index}`,
            emoji: "🧪",
            isHuman: index === 0,
            cards: deck.splice(0, 2),
            stack: bankroll - contributions[index],
            wins: 0,
            folded: !activeIndexes.has(index),
            allIn: contributions[index] === bankroll,
            status: "等待結算",
            totalContribution: contributions[index],
            bet: 0,
            streak: 0,
            emotion: "calm",
            lastAction: "",
          }));

          const allCards = [...board, ...players.flatMap(player => player.cards)];
          const uniqueCardCount = new Set(allCards.map(cardId)).size;
          if (uniqueCardCount !== allCards.length) {
            throw new Error(`scenario ${scenario}: duplicate cards before showdown`);
          }

          const chipsBefore = bankrolls.reduce((sum, value) => sum + value, 0);
          state.players = players;
          state.board = board;
          state.deck = deck;
          state.pot = contributions.reduce((sum, value) => sum + value, 0);
          state.handNumber = scenario + 1;
          state.handOver = false;
          state.street = "河牌";
          state.winners = [];
          state.waitingForHuman = false;
          state.actionPulse = null;
          state.winAmount = 0;

          const potsBefore = buildPots();
          if (potsBefore.length > 1) splitPotScenarios += 1;
          maximumPot = Math.max(maximumPot, state.pot);

          showdown();

          const chipsAfter = state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
          if (chipsAfter !== chipsBefore) {
            throw new Error(
              `scenario ${scenario}: chip conservation failed ${chipsAfter} !== ${chipsBefore}; `
              + `contributions=${JSON.stringify(contributions)}`,
            );
          }
          if (state.pot !== 0) {
            throw new Error(`scenario ${scenario}: pot was not cleared (${state.pot})`);
          }
          if (!state.handOver) {
            throw new Error(`scenario ${scenario}: showdown did not finish the hand`);
          }
          if (!Array.isArray(state.winners) || state.winners.length === 0) {
            throw new Error(`scenario ${scenario}: showdown produced no winner`);
          }
          if (state.players.some(player => !Number.isInteger(player.stack) || player.stack < 0)) {
            throw new Error(`scenario ${scenario}: invalid player stack after showdown`);
          }

          const awardedPlayers = state.players.filter(player => player.stack > bankrolls[player.position] - contributions[player.position]);
          maximumWinnerCount = Math.max(maximumWinnerCount, awardedPlayers.length);
          if (awardedPlayers.length > potsBefore.length) tieScenarios += 1;
        }
      } finally {
        for (const [name, original] of Object.entries(originals)) window[name] = original;
        window.maybeShowSessionSummary = originalMaybeShowSessionSummary;
        window.completeHeroStyleHand = originalCompleteHeroStyleHand;
      }

      return {
        seed: "0x51de5eed",
        scenarios,
        splitPotScenarios,
        tieScenarios,
        maximumPot,
        maximumWinnerCount,
      };
    }, { scenarios: SHOWDOWN_SCENARIOS });

    expect(report.scenarios).toBe(SHOWDOWN_SCENARIOS);
    expect(report.splitPotScenarios).toBeGreaterThan(0);
    expect(report.maximumPot).toBeGreaterThan(0);
    expect(report.maximumWinnerCount).toBeGreaterThan(0);
    await attachStressReport(testInfo, report);
  });
});
