import { expect, test } from "@playwright/test";

const requestedHandCount = Number.parseInt(process.env.NATURAL_STRESS_HANDS || "12", 10);
const HAND_COUNT = Number.isInteger(requestedHandCount)
  ? Math.min(100, Math.max(1, requestedHandCount))
  : 12;
const MAX_EVENTS_PER_HAND = 2_000;
const TEST_TIMEOUT_MS = Math.max(60_000, HAND_COUNT * 1_200);

test.describe("自然下注狀態機壓力測試", () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test(`連續 ${HAND_COUNT} 手可完成、籌碼守恆且不殘留牌局計時器`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => Boolean(
        window.AiTimingController
        && window.FairSpecialBosses?.version
        && document.documentElement.dataset.fairBossCoreGuard === "ready"
      )),
      { timeout: 10_000 },
    ).toBe(true);

    const report = await page.evaluate(({ handCount, maxEventsPerHand }) => {
      window.AiTimingController?.clear?.();
      window.GeminiAsyncBettingLoop?.cancelPending?.();
      clearAutoNewHandTimer();
      clearDialogueTimers();
      clearTimeout(pulsePot.timer);
      clearTimeout(announceAction.timer);
      clearTimeout(showWinBanner.timer);
      if (typeof announce === "function") clearTimeout(announce.timer);

      const originals = {
        setTimeout: window.setTimeout,
        clearTimeout: window.clearTimeout,
        setInterval: window.setInterval,
        clearInterval: window.clearInterval,
        random: Math.random,
        dateNow: Date.now,
        render,
      };

      let virtualNow = Date.parse("2026-08-04T08:00:00.000Z");
      let nextTimerId = 1;
      let nextSequence = 1;
      const timers = new Map();
      const schedulerErrors = [];

      function scheduleTimer(type, callback, delay, args) {
        const id = nextTimerId++;
        const duration = Math.max(0, Number(delay) || 0);
        timers.set(id, {
          id,
          type,
          callback,
          args,
          delay: duration,
          due: virtualNow + duration,
          sequence: nextSequence++,
          label: String(callback?.name || "anonymous"),
        });
        return id;
      }

      function clearTimer(id) {
        timers.delete(Number(id));
      }

      function nextTimer() {
        let selected = null;
        for (const timer of timers.values()) {
          if (
            !selected
            || timer.due < selected.due
            || (timer.due === selected.due && timer.sequence < selected.sequence)
          ) {
            selected = timer;
          }
        }
        return selected;
      }

      function runNextTimer() {
        const timer = nextTimer();
        if (!timer) return null;

        timers.delete(timer.id);
        virtualNow = Math.max(virtualNow, timer.due);
        if (timer.type === "interval") {
          timer.due = virtualNow + Math.max(1, timer.delay);
          timer.sequence = nextSequence++;
          timers.set(timer.id, timer);
        }

        try {
          if (typeof timer.callback === "function") {
            timer.callback(...timer.args);
          }
        } catch (error) {
          schedulerErrors.push(`${timer.label}: ${error?.stack || error}`);
        }

        return {
          id: timer.id,
          type: timer.type,
          label: timer.label,
          due: timer.due,
        };
      }

      function pendingTimerDetails() {
        return [...timers.values()]
          .sort((left, right) => left.due - right.due || left.sequence - right.sequence)
          .map(timer => ({
            id: timer.id,
            type: timer.type,
            label: timer.label,
            delay: timer.delay,
            dueIn: timer.due - virtualNow,
          }));
      }

      function clearAllScheduledTimers() {
        timers.clear();
      }

      window.setTimeout = (callback, delay = 0, ...args) => (
        scheduleTimer("timeout", callback, delay, args)
      );
      window.clearTimeout = clearTimer;
      window.setInterval = (callback, delay = 0, ...args) => (
        scheduleTimer("interval", callback, delay, args)
      );
      window.clearInterval = clearTimer;
      Date.now = () => virtualNow;

      let seed = 0x4e415455;
      Math.random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x1_0000_0000;
      };

      // UI rendering has its own E2E coverage. This stress case keeps the real
      // betting engine and timer callbacks while removing repeated DOM work.
      render = () => {};

      const failures = [];
      const handReports = [];
      const actionCounts = { call: 0, raise: 0, fold: 0, allin: 0 };
      let handsStarted = 0;
      let handsCompleted = 0;
      let humanDecisions = 0;
      let maximumEvents = 0;
      let maximumPot = 0;
      let maximumPendingTimers = 0;

      function validateState(expectedChips) {
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

        if (!state.handOver) {
          if (contributionTotal !== state.pot) {
            errors.push(`contributions:${contributionTotal}/${state.pot}`);
          }
          if (state.currentBet !== maximumBet) {
            errors.push(`current-bet:${state.currentBet}/${maximumBet}`);
          }
        }

        if (state.currentActorIndex < -1 || state.currentActorIndex >= players.length) {
          errors.push(`actor:${state.currentActorIndex}`);
        }
        if (state.waitingForHuman && state.currentActorIndex !== 0) {
          errors.push(`human-wait-actor:${state.currentActorIndex}`);
        }
        if (state.waitingForHuman && !needsAction(players[0])) {
          errors.push("human-does-not-need-action");
        }
        if (state.handOver && state.waitingForHuman) {
          errors.push("hand-over-waiting-human");
        }

        for (const player of players) {
          for (const [field, value] of [
            ["stack", player.stack],
            ["bet", player.bet],
            ["totalContribution", player.totalContribution],
          ]) {
            if (!Number.isInteger(value) || value < 0) {
              errors.push(`${player.position}:${field}:${value}`);
            }
          }
          if (player.bet > player.totalContribution) {
            errors.push(`${player.position}:bet-over-contribution`);
          }
        }

        maximumPot = Math.max(maximumPot, state.pot);
        maximumPendingTimers = Math.max(maximumPendingTimers, timers.size);
        return { errors, totalChips };
      }

      function chooseHumanAction() {
        const player = human();
        const callAmount = amountToCall(player);
        const availableRaise = Math.max(0, player.stack - callAmount);
        const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
        const canAllIn = player.stack > 0 && (!player.raiseLocked || player.stack <= callAmount);
        const phase = humanDecisions % 8;
        let action = "call";

        if ((phase === 0 || phase === 4) && canRaise) {
          action = "raise";
          els.raiseAmount.value = String(minimumRaiseBy());
        } else if (phase === 2 && callAmount > 0) {
          action = "fold";
        } else if (phase === 3 && canAllIn) {
          action = "allin";
        }

        humanDecisions += 1;
        actionCounts[action] += 1;
        playerAction(action);
        return action;
      }

      function cleanupHandTimers() {
        window.AiTimingController?.clear?.();
        window.GeminiAsyncBettingLoop?.cancelPending?.();
        clearAutoNewHandTimer();
        clearDialogueTimers();
        clearTimeout(pulsePot.timer);
        clearTimeout(announceAction.timer);
        clearTimeout(showWinBanner.timer);
        if (typeof announce === "function") clearTimeout(announce.timer);
      }

      resetGameSession();
      state.gameMode = "normal";
      state.tournament = { active: false };
      state.autoNewHand = false;
      state.isMuted = true;
      window.AiTimingController?.resetExperience?.();

      for (let handIndex = 0; handIndex < handCount; handIndex += 1) {
        startHand();
        handsStarted += 1;

        const handNumber = state.handNumber;
        const expectedChips = state.players.reduce(
          (sum, player) => sum + player.stack,
          state.pot,
        );
        let events = 0;
        let stuckReason = "";

        while (!state.handOver && events < maxEventsPerHand) {
          const validation = validateState(expectedChips);
          if (validation.errors.length) {
            failures.push({
              handNumber,
              event: events,
              errors: validation.errors,
              street: state.street,
              actor: state.currentActorIndex,
              waitingForHuman: state.waitingForHuman,
              pendingTimers: pendingTimerDetails(),
            });
            break;
          }

          if (state.waitingForHuman && state.currentActorIndex === 0) {
            chooseHumanAction();
            events += 1;
            continue;
          }

          const before = {
            street: state.street,
            actor: state.currentActorIndex,
            pot: state.pot,
            handOver: state.handOver,
            pending: timers.size,
          };
          const executed = runNextTimer();

          if (!executed) {
            window.continueBetting();
            const unchanged = (
              before.street === state.street
              && before.actor === state.currentActorIndex
              && before.pot === state.pot
              && before.handOver === state.handOver
              && timers.size === 0
              && !state.waitingForHuman
            );
            if (unchanged) {
              stuckReason = "no-scheduled-progress";
              break;
            }
          }

          events += 1;
        }

        maximumEvents = Math.max(maximumEvents, events);

        if (!state.handOver && !failures.length) {
          failures.push({
            handNumber,
            event: events,
            errors: [stuckReason || "event-guard-exhausted"],
            street: state.street,
            actor: state.currentActorIndex,
            waitingForHuman: state.waitingForHuman,
            pendingTimers: pendingTimerDetails(),
          });
        }

        const finalValidation = validateState(expectedChips);
        if (finalValidation.errors.length && !failures.length) {
          failures.push({
            handNumber,
            event: events,
            errors: finalValidation.errors,
            street: state.street,
            actor: state.currentActorIndex,
            waitingForHuman: state.waitingForHuman,
            pendingTimers: pendingTimerDetails(),
          });
        }

        cleanupHandTimers();
        const residualTimers = pendingTimerDetails();

        if (residualTimers.length && !failures.length) {
          failures.push({
            handNumber,
            event: events,
            errors: ["residual-timers"],
            pendingTimers: residualTimers,
          });
        }

        handReports.push({
          handNumber,
          events,
          handOver: state.handOver,
          winners: [...state.winners],
          boardCount: state.board.length,
          totalChips: finalValidation.totalChips,
          expectedChips,
          residualTimers,
        });

        if (
          state.handOver
          && state.winners.length > 0
          && finalValidation.totalChips === expectedChips
          && residualTimers.length === 0
        ) {
          handsCompleted += 1;
        }

        clearAllScheduledTimers();
        if (failures.length) break;
      }

      const experience = window.AiTimingController?.getExperience?.() || {};
      const result = {
        seed: "0x4e415455",
        configuredHands: handCount,
        handsStarted,
        handsCompleted,
        humanDecisions,
        actionCounts,
        maximumEvents,
        maximumPot,
        maximumPendingTimers,
        aiExperienceEntries: Object.keys(experience).length,
        schedulerErrors,
        failures,
        handReports,
      };

      cleanupHandTimers();
      clearAllScheduledTimers();
      render = originals.render;
      Math.random = originals.random;
      Date.now = originals.dateNow;
      window.setTimeout = originals.setTimeout;
      window.clearTimeout = originals.clearTimeout;
      window.setInterval = originals.setInterval;
      window.clearInterval = originals.clearInterval;

      return result;
    }, {
      handCount: HAND_COUNT,
      maxEventsPerHand: MAX_EVENTS_PER_HAND,
    });

    await page.waitForTimeout(50);
    report.pageErrors = pageErrors;

    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(report.handsStarted).toBe(HAND_COUNT);
    expect(report.handsCompleted).toBe(HAND_COUNT);
    expect(report.humanDecisions).toBeGreaterThan(0);
    expect(report.actionCounts.call).toBeGreaterThan(0);
    expect(report.actionCounts.raise + report.actionCounts.allin).toBeGreaterThan(0);
    expect(report.maximumEvents).toBeLessThan(MAX_EVENTS_PER_HAND);
    expect(report.aiExperienceEntries).toBeGreaterThan(0);
    expect(report.pageErrors).toEqual([]);

    await testInfo.attach("natural-betting-state-stress.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });
  });
});
