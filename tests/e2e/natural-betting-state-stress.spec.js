import { expect, test } from "@playwright/test";

const requestedHandCount = Number.parseInt(process.env.NATURAL_STRESS_HANDS || "8", 10);
const HAND_COUNT = Number.isInteger(requestedHandCount)
  ? Math.min(100, Math.max(1, requestedHandCount))
  : 8;
const MAX_STEPS_PER_HAND = 80;
const STEP_CLOCK_MS = 30_000;
const TIMER_DRAIN_MS = 25_000;
const TEST_TIMEOUT_MS = Math.max(120_000, HAND_COUNT * 6_500);

test.describe("自然下注狀態機壓力測試", () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test(`連續 ${HAND_COUNT} 手可完成、籌碼守恆且不殘留牌局計時器`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });

    await page.evaluate(() => {
      window.AiTimingController?.clear?.();
      window.GeminiAsyncBettingLoop?.cancelPending?.();
      clearAutoNewHandTimer();
      clearDialogueTimers();
      clearTimeout(pulsePot.timer);
      clearTimeout(announceAction.timer);
      clearTimeout(showWinBanner.timer);
      state.autoNewHand = false;
      state.isMuted = true;
    });

    await page.clock.install({ time: new Date("2026-08-04T08:00:00.000Z") });

    await page.evaluate(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      const nativeSetInterval = window.setInterval.bind(window);
      const nativeClearInterval = window.clearInterval.bind(window);
      const pendingTimeouts = new Map();
      const pendingIntervals = new Map();

      window.setTimeout = (callback, delay = 0, ...args) => {
        let timerId = 0;
        const wrapped = (...callbackArgs) => {
          pendingTimeouts.delete(timerId);
          return callback(...callbackArgs);
        };
        timerId = nativeSetTimeout(wrapped, delay, ...args);
        pendingTimeouts.set(timerId, {
          delay: Number(delay) || 0,
          label: String(callback?.name || "anonymous"),
        });
        return timerId;
      };

      window.clearTimeout = timerId => {
        pendingTimeouts.delete(timerId);
        return nativeClearTimeout(timerId);
      };

      window.setInterval = (callback, delay = 0, ...args) => {
        const timerId = nativeSetInterval(callback, delay, ...args);
        pendingIntervals.set(timerId, {
          delay: Number(delay) || 0,
          label: String(callback?.name || "anonymous"),
        });
        return timerId;
      };

      window.clearInterval = timerId => {
        pendingIntervals.delete(timerId);
        return nativeClearInterval(timerId);
      };

      let seed = 0x4e415455;
      const originalRandom = Math.random;
      Math.random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x1_0000_0000;
      };

      window.__NATURAL_BETTING_STRESS__ = {
        pendingTimeouts,
        pendingIntervals,
        originalRandom,
        handsStarted: 0,
        handsCompleted: 0,
        humanDecisions: 0,
        actionCounts: { call: 0, raise: 0, fold: 0, allin: 0 },
        maximumSteps: 0,
        maximumPot: 0,
        maximumPendingTimers: 0,
      };

      resetGameSession();
      state.gameMode = "normal";
      state.tournament = { active: false };
      state.autoNewHand = false;
      state.isMuted = true;
      window.AiTimingController?.resetExperience?.();
      startHand();
      window.__NATURAL_BETTING_STRESS__.handsStarted += 1;
    });

    const handReports = [];

    for (let handIndex = 0; handIndex < HAND_COUNT; handIndex += 1) {
      const baseline = await page.evaluate(() => ({
        handNumber: state.handNumber,
        chips: state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot,
      }));
      let steps = 0;

      while (steps < MAX_STEPS_PER_HAND) {
        const snapshot = await page.evaluate(expectedChips => {
          const stress = window.__NATURAL_BETTING_STRESS__;
          const players = state.players || [];
          const allCards = [
            ...(state.deck || []),
            ...(state.board || []),
            ...players.flatMap(player => player.cards || []),
          ];
          const cardKey = card => `${card?.rank ?? card?.label ?? card?.value}-${card?.suit}`;
          const totalChips = players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
          const contributionTotal = players.reduce(
            (sum, player) => sum + (player.totalContribution || 0),
            0,
          );
          const maximumBet = Math.max(0, ...players.map(player => player.bet || 0));
          const expectedPlayerCount = TABLE_AI_COUNT + 1;
          const errors = [];

          if (players.length !== expectedPlayerCount) {
            errors.push(`player-count:${players.length}/${expectedPlayerCount}`);
          }
          if (allCards.length !== 52) errors.push(`card-count:${allCards.length}`);
          if (new Set(allCards.map(cardKey)).size !== allCards.length) errors.push("duplicate-card");
          if (![0, 3, 4, 5].includes(state.board.length)) errors.push(`board:${state.board.length}`);
          if (!Number.isInteger(state.pot) || state.pot < 0) errors.push(`pot:${state.pot}`);
          if (totalChips !== expectedChips) errors.push(`chips:${totalChips}/${expectedChips}`);
          if (!state.handOver && contributionTotal !== state.pot) {
            errors.push(`contributions:${contributionTotal}/${state.pot}`);
          }
          if (state.currentBet !== maximumBet) errors.push(`current-bet:${state.currentBet}/${maximumBet}`);
          if (state.currentActorIndex < -1 || state.currentActorIndex >= players.length) {
            errors.push(`actor:${state.currentActorIndex}`);
          }
          if (state.waitingForHuman && state.currentActorIndex !== 0) {
            errors.push(`human-wait-actor:${state.currentActorIndex}`);
          }
          if (state.waitingForHuman && !needsAction(players[0])) errors.push("human-does-not-need-action");
          if (state.handOver && state.waitingForHuman) errors.push("hand-over-waiting-human");

          for (const player of players) {
            for (const [field, value] of [
              ["stack", player.stack],
              ["bet", player.bet],
              ["totalContribution", player.totalContribution],
            ]) {
              if (!Number.isInteger(value) || value < 0) errors.push(`${player.position}:${field}:${value}`);
            }
            if (player.bet > player.totalContribution) errors.push(`${player.position}:bet-over-contribution`);
          }

          stress.maximumPot = Math.max(stress.maximumPot, state.pot);
          stress.maximumPendingTimers = Math.max(
            stress.maximumPendingTimers,
            stress.pendingTimeouts.size + stress.pendingIntervals.size,
          );

          let action = "";
          if (!errors.length && !state.handOver && state.waitingForHuman && state.currentActorIndex === 0) {
            const player = human();
            const callAmount = amountToCall(player);
            const availableRaise = Math.max(0, player.stack - callAmount);
            const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
            const canAllIn = player.stack > 0 && (!player.raiseLocked || player.stack <= callAmount);
            const phase = stress.humanDecisions % 8;
            action = "call";

            if ((phase === 0 || phase === 4) && canRaise) {
              action = "raise";
              els.raiseAmount.value = String(minimumRaiseBy());
            } else if (phase === 2 && callAmount > 0) {
              action = "fold";
            } else if (phase === 3 && canAllIn) {
              action = "allin";
            }

            stress.humanDecisions += 1;
            stress.actionCounts[action] += 1;
            playerAction(action);
          }

          return {
            errors,
            action,
            handOver: state.handOver,
            waitingForHuman: state.waitingForHuman,
            actor: state.currentActorIndex,
            street: state.street,
            boardCount: state.board.length,
            pot: state.pot,
            pendingTimers: stress.pendingTimeouts.size + stress.pendingIntervals.size,
          };
        }, baseline.chips);

        expect(snapshot.errors, `第 ${baseline.handNumber} 手第 ${steps} 步`).toEqual([]);
        if (snapshot.handOver) break;

        await page.clock.runFor(STEP_CLOCK_MS);
        steps += 1;
      }

      expect(steps, `第 ${baseline.handNumber} 手未能完成`).toBeLessThan(MAX_STEPS_PER_HAND);
      await page.clock.runFor(TIMER_DRAIN_MS);

      const completed = await page.evaluate(({ expectedChips, steps }) => {
        const stress = window.__NATURAL_BETTING_STRESS__;
        const totalChips = state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
        stress.handsCompleted += 1;
        stress.maximumSteps = Math.max(stress.maximumSteps, steps);
        return {
          handNumber: state.handNumber,
          handOver: state.handOver,
          totalChips,
          expectedChips,
          winners: [...state.winners],
          boardCount: state.board.length,
          pendingTimeouts: stress.pendingTimeouts.size,
          pendingIntervals: stress.pendingIntervals.size,
          pendingTimerDetails: [
            ...stress.pendingTimeouts.values(),
            ...stress.pendingIntervals.values(),
          ],
        };
      }, { expectedChips: baseline.chips, steps });

      expect(completed.handOver).toBe(true);
      expect(completed.totalChips).toBe(completed.expectedChips);
      expect(completed.winners.length).toBeGreaterThan(0);
      expect(
        completed.pendingTimeouts,
        `第 ${completed.handNumber} 手殘留 timeout：${JSON.stringify(completed.pendingTimerDetails)}`,
      ).toBe(0);
      expect(
        completed.pendingIntervals,
        `第 ${completed.handNumber} 手殘留 interval：${JSON.stringify(completed.pendingTimerDetails)}`,
      ).toBe(0);
      handReports.push({ ...completed, steps });

      if (handIndex < HAND_COUNT - 1) {
        await page.evaluate(() => {
          const overlay = document.querySelector("#sessionSummaryOverlay");
          if (overlay) overlay.hidden = true;
          startHand();
          window.__NATURAL_BETTING_STRESS__.handsStarted += 1;
        });
      }
    }

    const browserReport = await page.evaluate(configuredHands => {
      const stress = window.__NATURAL_BETTING_STRESS__;
      const experience = window.AiTimingController?.getExperience?.() || {};
      Math.random = stress.originalRandom;
      return {
        seed: "0x4e415455",
        configuredHands,
        handsStarted: stress.handsStarted,
        handsCompleted: stress.handsCompleted,
        humanDecisions: stress.humanDecisions,
        actionCounts: { ...stress.actionCounts },
        maximumSteps: stress.maximumSteps,
        maximumPot: stress.maximumPot,
        maximumPendingTimers: stress.maximumPendingTimers,
        aiExperienceEntries: Object.keys(experience).length,
      };
    }, HAND_COUNT);
    const report = {
      ...browserReport,
      pageErrors: [...pageErrors],
      handReports,
    };

    expect(report.handsStarted).toBe(HAND_COUNT);
    expect(report.handsCompleted).toBe(HAND_COUNT);
    expect(report.humanDecisions).toBeGreaterThan(0);
    expect(report.actionCounts.call).toBeGreaterThan(0);
    expect(report.actionCounts.raise + report.actionCounts.allin).toBeGreaterThan(0);
    expect(report.maximumSteps).toBeLessThan(MAX_STEPS_PER_HAND);
    expect(report.aiExperienceEntries).toBeGreaterThan(0);
    expect(report.pageErrors).toEqual([]);

    await testInfo.attach("natural-betting-state-stress.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });
  });
});
