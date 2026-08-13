import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { summarizeLongSessionPacing } from "../support/long-session-pacing-metrics-v1.js";

const requestedHands = Number.parseInt(process.env.LONG_SESSION_PACING_HANDS || "12", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(60, Math.max(1, requestedHands)) : 12;
const requestedSeed = Number.parseInt(process.env.LONG_SESSION_PACING_SEED || "1279545165", 10);
const SEED = Number.isInteger(requestedSeed) ? requestedSeed >>> 0 : 0x4c53504d;
const MAX_EVENTS_PER_HAND = 2_000;
const TIMEOUT_MS = Math.max(90_000, HANDS * 2_000);

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

test.describe("Long Session fixed-seed full-hand pacing telemetry", () => {
  test.setTimeout(TIMEOUT_MS);

  test(`runs ${HANDS} real completed-hand opportunities through the Long Session ladder`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => Boolean(
        window.LongSessionModeV1?.isInstalled?.()
        && window.AiTimingController
        && window.FairSpecialBosses?.version
        && document.documentElement.dataset.fairBossCoreGuard === "ready"
      )),
      { timeout: 12_000 },
    ).toBe(true);

    const raw = await page.evaluate(({ handCount, maxEventsPerHand, initialSeed }) => {
      window.AiTimingController?.clear?.();
      window.GeminiAsyncBettingLoop?.cancelPending?.();
      clearAutoNewHandTimer();
      clearDialogueTimers();
      clearTimeout(pulsePot.timer);
      clearTimeout(announceAction.timer);
      clearTimeout(showWinBanner.timer);
      if (typeof announce === "function") clearTimeout(announce.timer);

      const normalSnapshot = () => ({
        config: { ...window.ReplacementStackBalance.normalConfig },
        levels: [1, 6, 11, 16, 21].map(hand => {
          const level = blindLevelForHand(hand);
          return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
        }),
      });
      const normalBefore = normalSnapshot();

      const originals = {
        setTimeout: window.setTimeout,
        clearTimeout: window.clearTimeout,
        setInterval: window.setInterval,
        clearInterval: window.clearInterval,
        random: Math.random,
        dateNow: Date.now,
        render,
      };

      let virtualNow = Date.parse("2026-08-13T02:30:00.000Z");
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
          if (typeof timer.callback === "function") timer.callback(...timer.args);
        } catch (error) {
          schedulerErrors.push(`${timer.label}: ${error?.stack || error}`);
        }
        return { id: timer.id, type: timer.type, label: timer.label };
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

      window.setTimeout = (callback, delay = 0, ...args) => scheduleTimer("timeout", callback, delay, args);
      window.clearTimeout = clearTimer;
      window.setInterval = (callback, delay = 0, ...args) => scheduleTimer("interval", callback, delay, args);
      window.clearInterval = clearTimer;
      Date.now = () => virtualNow;

      let seed = initialSeed >>> 0;
      Math.random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x1_0000_0000;
      };

      // Rendering has separate coverage. Keep the real betting engine, AI decisions,
      // settlement and Long Session wrappers while removing repeated visual work.
      render = () => {};

      const failures = [];
      const pacingHands = [];
      const handReports = [];
      const actionCounts = { call: 0, raise: 0, fold: 0, allin: 0 };
      let handsStarted = 0;
      let handsCompleted = 0;
      let humanDecisions = 0;
      let maximumEvents = 0;
      let maximumPendingTimers = 0;
      let currentHandReady = false;
      let sessionEnded = false;

      function validateState(expectedChips) {
        const players = state.players || [];
        const allCards = [
          ...(state.deck || []),
          ...(state.board || []),
          ...players.flatMap(player => player.cards || []),
        ];
        const cardKey = card => `${card?.rank ?? card?.label ?? card?.value}-${card?.suit}`;
        const totalChips = players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
        const contributionTotal = players.reduce((sum, player) => sum + (player.totalContribution || 0), 0);
        const maximumBet = Math.max(0, ...players.map(player => player.bet || 0));
        const errors = [];

        if (players.length !== TABLE_AI_COUNT + 1) errors.push(`player-count:${players.length}/${TABLE_AI_COUNT + 1}`);
        if (allCards.length !== 52) errors.push(`card-count:${allCards.length}`);
        if (new Set(allCards.map(cardKey)).size !== allCards.length) errors.push("duplicate-card");
        if (![0, 3, 4, 5].includes(state.board.length)) errors.push(`board:${state.board.length}`);
        if (!Number.isInteger(state.pot) || state.pot < 0) errors.push(`pot:${state.pot}`);
        if (totalChips !== expectedChips) errors.push(`chips:${totalChips}/${expectedChips}`);
        if (!state.handOver) {
          if (contributionTotal !== state.pot) errors.push(`contributions:${contributionTotal}/${state.pot}`);
          if (state.currentBet !== maximumBet) errors.push(`current-bet:${state.currentBet}/${maximumBet}`);
        }
        if (state.currentActorIndex < -1 || state.currentActorIndex >= players.length) {
          errors.push(`actor:${state.currentActorIndex}`);
        }
        if (state.waitingForHuman && state.currentActorIndex !== 0) errors.push(`human-wait-actor:${state.currentActorIndex}`);
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

      try {
        state.gameMode = "normal";
        state.tournament = { active: false };
        state.autoNewHand = false;
        state.isMuted = true;
        window.AiTimingController?.resetExperience?.();
        window.LongSessionModeV1.enableNow({ restart: true });
        currentHandReady = true;

        for (let handIndex = 0; handIndex < handCount; handIndex += 1) {
          if (sessionEnded || failures.length) break;
          if (!currentHandReady) startHand();
          currentHandReady = false;
          handsStarted += 1;

          const before = window.LongSessionModeV1.snapshot();
          const sessionBefore = before.session;
          const tableBefore = before.table;
          if (!sessionBefore || !tableBefore || !window.LongSessionModeV1.isActive()) {
            failures.push({ handIndex, errors: ["long-session-not-active-at-hand-start"] });
            break;
          }

          const handNumber = state.handNumber;
          const expectedChips = state.players.reduce((sum, player) => sum + player.stack, state.pot);
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
                pendingTimers: pendingTimerDetails(),
              });
              break;
            }

            if (state.waitingForHuman && state.currentActorIndex === 0) {
              chooseHumanAction();
              events += 1;
              continue;
            }

            const prior = {
              street: state.street,
              actor: state.currentActorIndex,
              pot: state.pot,
              handOver: state.handOver,
              pending: timers.size,
            };
            const executed = runNextTimer();
            if (!executed) {
              window.continueBetting();
              const unchanged = prior.street === state.street
                && prior.actor === state.currentActorIndex
                && prior.pot === state.pot
                && prior.handOver === state.handOver
                && timers.size === 0
                && !state.waitingForHuman;
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
              pendingTimers: pendingTimerDetails(),
            });
          }

          const finalValidation = validateState(expectedChips);
          if (finalValidation.errors.length && !failures.length) {
            failures.push({ handNumber, event: events, errors: finalValidation.errors });
          }
          if (failures.length) break;

          const hero = human();
          const heroEndStack = Math.max(0, Number(hero?.stack) || 0);
          cleanupHandTimers();
          clearAllScheduledTimers();

          // Settlement normally reaches this wrapper itself. Calling it once more is
          // intentionally idempotent for "stay" and ensures the transition envelope
          // exists in headless telemetry if visual/session-summary work was suppressed.
          maybeShowSessionSummary();
          const after = window.LongSessionModeV1.snapshot();
          const proposal = after.decision;
          const transition = proposal?.transition || "stay";
          const targetTableIndex = proposal?.targetTable?.index ?? after.session?.tableIndex ?? sessionBefore.tableIndex;
          const observedTotalWealth = Number(proposal?.observedTotalWealth ?? after.session?.totalWealth);
          const expectedObservedWealth = sessionBefore.bankroll + heroEndStack;
          const transitionWealthConserved = Number.isFinite(observedTotalWealth)
            && observedTotalWealth === expectedObservedWealth;

          pacingHands.push({
            handNumber,
            tableIndex: sessionBefore.tableIndex,
            targetTableIndex,
            bigBlind: tableBefore.big,
            startStack: sessionBefore.tableStack,
            endStack: heroEndStack,
            bankrollBefore: sessionBefore.bankroll,
            transition,
          });
          handReports.push({
            handNumber,
            events,
            boardCount: state.board.length,
            winners: [...state.winners],
            tableIndex: sessionBefore.tableIndex,
            table: `${tableBefore.small}/${tableBefore.big}`,
            heroStartStack: sessionBefore.tableStack,
            heroEndStack,
            bankrollBefore: sessionBefore.bankroll,
            transition,
            targetTableIndex,
            expectedObservedWealth,
            observedTotalWealth,
            transitionWealthConserved,
            totalChips: finalValidation.totalChips,
            expectedChips,
          });
          handsCompleted += 1;

          if (!transitionWealthConserved) {
            failures.push({ handNumber, errors: ["long-session-transition-wealth-drift"] });
            break;
          }

          if (transition === "session-ended") {
            sessionEnded = true;
            break;
          }

          if ((transition === "move-up" || transition === "reentry") && handIndex + 1 < handCount) {
            const primary = document.querySelector('#longSessionDecisionRoot [data-long-session-action="primary"]');
            if (!primary) {
              failures.push({ handNumber, errors: [`missing-primary-transition-control:${transition}`] });
              break;
            }
            primary.click();
            currentHandReady = true;
          }
        }
      } catch (error) {
        failures.push({ handNumber: state?.handNumber || 0, errors: [String(error?.stack || error)] });
      } finally {
        cleanupHandTimers();
        clearAllScheduledTimers();
        window.LongSessionModeV1.disableNow({ restart: false });
      }

      const normalAfter = normalSnapshot();
      const result = {
        schemaVersion: 1,
        evidenceKind: "fixed-seed-full-hand-telemetry",
        interpretation: "design-pacing-only",
        notNormalBugEvidence: true,
        seed: initialSeed >>> 0,
        configuredHands: handCount,
        handsStarted,
        handsCompleted,
        sessionEnded,
        humanDecisions,
        actionCounts,
        maximumEvents,
        maximumPendingTimers,
        schedulerErrors,
        failures,
        tables: window.LongSessionModeV1.tables.map(table => ({ ...table })),
        pacingHands,
        handReports,
        fairness: {
          transitionInput: "public-completed-hand-state-only",
          hiddenOpponentCardsReadForTransition: false,
          futureDeckReadForTransition: false,
          heroPolicyUsesOpponentCards: false,
        },
        normalBefore,
        normalAfter,
      };

      render = originals.render;
      Math.random = originals.random;
      Date.now = originals.dateNow;
      window.setTimeout = originals.setTimeout;
      window.clearTimeout = originals.clearTimeout;
      window.setInterval = originals.setInterval;
      window.clearInterval = originals.clearInterval;
      return result;
    }, {
      handCount: HANDS,
      maxEventsPerHand: MAX_EVENTS_PER_HAND,
      initialSeed: SEED,
    });

    const pacing = summarizeLongSessionPacing({
      tables: raw.tables,
      hands: raw.pacingHands,
      evidenceKind: "fixed-seed-full-hand-telemetry",
    });
    const report = {
      ...raw,
      pacing,
      deterministicFingerprint: fingerprint({
        seed: raw.seed,
        configuredHands: raw.configuredHands,
        handsCompleted: raw.handsCompleted,
        pacingHands: raw.pacingHands,
        actionCounts: raw.actionCounts,
      }),
    };

    const jsonPath = testInfo.outputPath("long-session-full-hand-pacing-telemetry-v1.json");
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await testInfo.attach("long-session-full-hand-pacing-telemetry-v1.json", {
      path: jsonPath,
      contentType: "application/json",
    });

    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(report.handsStarted).toBeGreaterThan(0);
    expect(report.handsCompleted).toBe(report.pacingHands.length);
    expect(report.handsCompleted).toBeLessThanOrEqual(HANDS);
    expect(report.humanDecisions).toBeGreaterThan(0);
    expect(report.deterministicFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(report.normalAfter).toEqual(report.normalBefore);
    expect(report.handReports.every(hand => hand.transitionWealthConserved)).toBe(true);
    expect(report.handReports.every(hand => hand.totalChips === hand.expectedChips)).toBe(true);
    expect(report.pacing).toMatchObject({
      version: "1.0.0",
      evidenceKind: "fixed-seed-full-hand-telemetry",
      interpretation: "design-pacing-only",
      notNormalBugEvidence: true,
      hands: report.handsCompleted,
      fairnessBoundary: {
        publicCompletedHandStateOnly: true,
        hiddenCardsRequired: false,
        futureDeckRequired: false,
      },
    });
    expect(Number.isFinite(report.pacing.heroBb100)).toBe(true);
    expect(report.pacing.activeStackRisk.meanStartBb).toBeGreaterThan(0);
    expect(report.pacing.activeStackRisk.maxExposedWealthRatio).toBeLessThanOrEqual(1);
    expect(report.fairness).toEqual({
      transitionInput: "public-completed-hand-state-only",
      hiddenOpponentCardsReadForTransition: false,
      futureDeckReadForTransition: false,
      heroPolicyUsesOpponentCards: false,
    });
  });
});
