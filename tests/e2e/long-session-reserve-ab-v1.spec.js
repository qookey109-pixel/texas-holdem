import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { summarizeLongSessionPacing } from "../support/long-session-pacing-metrics-v1.js";

const requestedHands = Number.parseInt(process.env.LONG_SESSION_RESERVE_HANDS || "60", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(60, Math.max(1, requestedHands)) : 60;
const requestedSeed = Number.parseInt(process.env.LONG_SESSION_RESERVE_SEED || "1279545165", 10);
const SEED = Number.isInteger(requestedSeed) ? requestedSeed >>> 0 : 0x4c535241;
const requestedBankroll = Number.parseInt(process.env.LONG_SESSION_INITIAL_BANKROLL || "0", 10);
const INITIAL_BANKROLL = Number.isInteger(requestedBankroll) ? Math.max(0, requestedBankroll) : 0;
const MAX_EVENTS_PER_HAND = 2_000;
const TIMEOUT_MS = Math.max(120_000, HANDS * 2_500);

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

async function waitForAiReadiness(page) {
  await expect.poll(
    () => page.evaluate(() => Boolean(
      window.LongSessionModeV1?.isInstalled?.()
      && window.AiTimingController
      && window.FairSpecialBosses?.version
      && document.documentElement.dataset.fairBossCoreGuard === "ready"
    )),
    { timeout: 12_000 },
  ).toBe(true);
  await expect.poll(() => page.evaluate(() => window.AiTierStrategyV28?.version || ""), { timeout: 15_000 }).toBe("2.8.0");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV28 || ""), { timeout: 15_000 }).toBe("ready");
  await expect.poll(() => page.evaluate(() => window.AiTierStrategyV292?.version || ""), { timeout: 15_000 }).toBe("2.9.2");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV292 || ""), { timeout: 15_000 }).toBe("ready");
  await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV294?.version || ""), { timeout: 15_000 }).toBe("2.9.4");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV294 || ""), { timeout: 15_000 }).toBe("ready");
  await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""), { timeout: 15_000 }).toBe("2.9.5");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV295 || ""), { timeout: 15_000 }).toBe("ready");
  await expect.poll(() => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""), { timeout: 15_000 }).toBe("1.1.1");
  await expect.poll(() => page.evaluate(() => window.AiBoardTextureEngineV1?.version || ""), { timeout: 15_000 }).toBe("1.0.1");
  await expect.poll(() => page.evaluate(() => window.AiPostflopTexturePolicyV1?.version || ""), { timeout: 15_000 }).toBe("1.0.0");

  await page.evaluate(() => {
    window.EconomyFoldDefenseV1?.refresh?.();
    window.AiTierStrategyV292?.refresh?.();
    window.AiOpeningBalanceV294?.refresh?.();
    window.AiOpeningBalanceV295?.refresh?.();
    window.AiTierStrategyV292?.resetRuntimeEvidence?.();
    window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV295 || ""), { timeout: 15_000 }).toBe("ready");
}

test.describe("Long Session initial reserve paired evidence", () => {
  test.setTimeout(TIMEOUT_MS);

  test(`runs up to ${HANDS} real hands with initial bankroll ${INITIAL_BANKROLL}`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await waitForAiReadiness(page);

    const raw = await page.evaluate(({ handCount, maxEventsPerHand, initialSeed, initialBankroll }) => {
      const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
      const tables = window.LongSessionModeV1.tables.map(table => ({ ...table }));
      const failures = [];
      const schedulerErrors = [];
      const pacingHands = [];
      const handReports = [];
      const actionCounts = { call: 0, raise: 0, fold: 0, allin: 0 };

      window.LongSessionModeV1.disableNow({ restart: false });
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
        blindLevelForHand,
      };

      let externalSession = window.LongSessionModeV1.createSession({
        tableIndex: 0,
        bankroll: initialBankroll,
        tableStack: tables[0].entry,
      });
      const initialTotalWealth = externalSession.totalWealth;
      let virtualNow = Date.parse("2026-08-13T06:30:00.000Z");
      let nextTimerId = 1;
      let nextSequence = 1;
      const timers = new Map();

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
          if (!selected || timer.due < selected.due || (timer.due === selected.due && timer.sequence < selected.sequence)) selected = timer;
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
        return timer;
      }

      function timerDetails() {
        return [...timers.values()]
          .sort((left, right) => left.due - right.due || left.sequence - right.sequence)
          .slice(0, 30)
          .map(timer => ({ type: timer.type, label: timer.label, dueIn: timer.due - virtualNow }));
      }

      function clearAllTimers() {
        timers.clear();
      }

      window.setTimeout = (callback, delay = 0, ...args) => scheduleTimer("timeout", callback, delay, args);
      window.clearTimeout = clearTimer;
      window.setInterval = (callback, delay = 0, ...args) => scheduleTimer("interval", callback, delay, args);
      window.clearInterval = clearTimer;
      Date.now = () => virtualNow;

      let gameSeed = initialSeed >>> 0;
      Math.random = () => {
        gameSeed ^= gameSeed << 13;
        gameSeed ^= gameSeed >>> 17;
        gameSeed ^= gameSeed << 5;
        return (gameSeed >>> 0) / 0x1_0000_0000;
      };

      let policySeed = (initialSeed ^ 0x9e3779b9) >>> 0;
      function policyRandom() {
        policySeed += 0x6d2b79f5;
        let output = policySeed;
        output = Math.imul(output ^ (output >>> 15), output | 1);
        output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
        return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
      }

      blindLevelForHand = function longSessionExperimentalBlindLevel() {
        const table = tables[externalSession.tableIndex];
        return {
          level: table.index + 1,
          small: table.small,
          big: table.big,
          buyIn: table.entry,
          longSession: true,
          longSessionTable: table.key,
        };
      };
      render = () => {};

      let handsStarted = 0;
      let handsCompleted = 0;
      let humanDecisions = 0;
      let maximumEvents = 0;
      let maximumPendingTimers = 0;
      let sessionEnded = false;
      let currentHandReady = false;

      function validateState(expectedChips) {
        const players = state.players || [];
        const allCards = [...(state.deck || []), ...(state.board || []), ...players.flatMap(player => player.cards || [])];
        const cardKey = card => `${card?.rank ?? card?.label ?? card?.value}-${card?.suit}`;
        const totalChips = players.reduce((sum, player) => sum + (Number(player.stack) || 0), 0) + (Number(state.pot) || 0);
        const contributionTotal = players.reduce((sum, player) => sum + (Number(player.totalContribution) || 0), 0);
        const maximumBet = Math.max(0, ...players.map(player => Number(player.bet) || 0));
        const errors = [];

        if (players.length !== TABLE_AI_COUNT + 1) errors.push(`player-count:${players.length}/${TABLE_AI_COUNT + 1}`);
        if (allCards.length !== 52) errors.push(`card-count:${allCards.length}`);
        if (new Set(allCards.map(cardKey)).size !== allCards.length) errors.push("duplicate-card");
        if (![0, 3, 4, 5].includes(state.board.length)) errors.push(`board:${state.board.length}`);
        if (!Number.isInteger(state.pot) || state.pot < 0) errors.push(`pot:${state.pot}`);
        if (totalChips !== expectedChips) errors.push(`chips:${totalChips}/${expectedChips}`);
        if (!state.handOver && contributionTotal !== state.pot) errors.push(`contributions:${contributionTotal}/${state.pot}`);
        if (!state.handOver && state.currentBet !== maximumBet) errors.push(`current-bet:${state.currentBet}/${maximumBet}`);
        if (state.currentActorIndex < -1 || state.currentActorIndex >= players.length) errors.push(`actor:${state.currentActorIndex}`);
        if (state.waitingForHuman && state.currentActorIndex !== 0) errors.push(`human-wait-actor:${state.currentActorIndex}`);
        if (state.waitingForHuman && !needsAction(players[0])) errors.push("human-does-not-need-action");
        if (state.handOver && state.waitingForHuman) errors.push("hand-over-waiting-human");
        for (const player of players) {
          for (const [field, value] of [["stack", player.stack], ["bet", player.bet], ["totalContribution", player.totalContribution]]) {
            if (!Number.isInteger(value) || value < 0) errors.push(`${player.position}:${field}:${value}`);
          }
        }
        maximumPendingTimers = Math.max(maximumPendingTimers, timers.size);
        return { errors, totalChips };
      }

      function chooseBalancedHumanAction() {
        const player = human();
        const needed = Math.max(0, amountToCall(player));
        const pot = Math.max(1, Number(state?.pot) || 1);
        const bigBlind = Math.max(1, currentBigBlind());
        const availableRaise = Math.max(0, Number(player?.stack) - needed);
        const minimumRaise = Math.max(bigBlind, minimumRaiseBy());
        const canRaise = !player?.raiseLocked && availableRaise >= minimumRaise;
        const strength = clamp(estimateStrength(player), 0.01, 0.99);
        const potOdds = needed / Math.max(1, pot + needed);
        const stackBb = Number(player?.stack) / bigBlind;
        const roll = policyRandom();
        const free = needed === 0;
        let action = "call";
        let raiseFraction = 0.55;

        if (!free && strength < potOdds + 0.018 && roll < 0.78) {
          action = "fold";
        } else if (canRaise && (strength >= 0.66 || (free && strength >= 0.48 && roll < 0.14))) {
          action = "raise";
          raiseFraction = state.board.length >= 3 ? (strength >= 0.72 ? 0.72 : 0.42) : 0.58;
        }
        if (stackBb <= 9 && strength >= 0.68 && player.stack > 0 && (!player.raiseLocked || player.stack <= needed)) action = "allin";
        if (action === "raise") {
          const desired = Math.max(minimumRaise, Math.round((pot * raiseFraction) / 10) * 10);
          els.raiseAmount.value = String(Math.min(availableRaise, desired));
        }
        humanDecisions += 1;
        actionCounts[action] += 1;
        playerAction(action);
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

      function prepareFreshTable() {
        state.players = [];
        state.sessionEnded = false;
        startHand();
        currentHandReady = true;
      }

      try {
        state.gameMode = "normal";
        state.tournament = { active: false };
        state.autoNewHand = false;
        state.isMuted = true;
        window.AiTimingController?.resetExperience?.();
        resetGameSession();
        prepareFreshTable();

        for (let handIndex = 0; handIndex < handCount; handIndex += 1) {
          if (sessionEnded || failures.length) break;
          if (!currentHandReady) startHand();
          currentHandReady = false;
          handsStarted += 1;

          const sessionBefore = { ...externalSession };
          const tableBefore = tables[sessionBefore.tableIndex];
          const handNumber = state.handNumber;
          const expectedChips = state.players.reduce((sum, player) => sum + player.stack, state.pot);
          let events = 0;
          let stuckReason = "";

          while (!state.handOver && events < maxEventsPerHand) {
            const validation = validateState(expectedChips);
            if (validation.errors.length) {
              failures.push({ handNumber, event: events, errors: validation.errors, street: state.street, actor: state.currentActorIndex, pendingTimers: timerDetails() });
              break;
            }
            if (state.waitingForHuman && state.currentActorIndex === 0) {
              chooseBalancedHumanAction();
              events += 1;
              continue;
            }
            const prior = { street: state.street, actor: state.currentActorIndex, pot: state.pot, handOver: state.handOver };
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
          if (!state.handOver && !failures.length) failures.push({ handNumber, event: events, errors: [stuckReason || "event-guard-exhausted"], street: state.street, actor: state.currentActorIndex, pendingTimers: timerDetails() });
          const finalValidation = validateState(expectedChips);
          if (finalValidation.errors.length && !failures.length) failures.push({ handNumber, event: events, errors: finalValidation.errors });
          if (failures.length) break;

          const heroEndStack = Math.max(0, Number(human()?.stack) || 0);
          cleanupHandTimers();
          clearAllTimers();

          const completedHand = window.LongSessionModeV1.captureCompletedHandPublicState(state);
          const envelope = window.LongSessionModeV1.propose({ completedHand, inputSession: externalSession });
          if (envelope.status !== "proposed") {
            failures.push({ handNumber, errors: [`transition-not-proposed:${envelope.reason}`] });
            break;
          }
          const transition = envelope.proposal.transition;
          const action = transition === "stay" ? "auto" : "primary";
          const committed = window.LongSessionModeV1.commit(envelope, action);
          const targetTableIndex = committed.session.tableIndex;
          const observedTotalWealth = envelope.proposal.observedTotalWealth;
          const expectedObservedWealth = sessionBefore.bankroll + heroEndStack;
          const transitionWealthConserved = observedTotalWealth === expectedObservedWealth
            && committed.session.totalWealth === observedTotalWealth;

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
            tableIndex: sessionBefore.tableIndex,
            table: `${tableBefore.small}/${tableBefore.big}`,
            heroStartStack: sessionBefore.tableStack,
            heroEndStack,
            bankrollBefore: sessionBefore.bankroll,
            transition,
            targetTableIndex,
            observedTotalWealth,
            committedTotalWealth: committed.session.totalWealth,
            transitionWealthConserved,
            totalChips: finalValidation.totalChips,
            expectedChips,
          });
          handsCompleted += 1;

          if (!transitionWealthConserved) {
            failures.push({ handNumber, errors: ["long-session-transition-wealth-drift"] });
            break;
          }
          externalSession = committed.session;
          if (committed.status === "ended") {
            sessionEnded = true;
            break;
          }
          state.sessionEnded = false;
          if (transition === "move-up" || transition === "reentry") prepareFreshTable();
        }
      } catch (error) {
        failures.push({ handNumber: state?.handNumber || 0, errors: [String(error?.stack || error)] });
      } finally {
        cleanupHandTimers();
        clearAllTimers();
        blindLevelForHand = originals.blindLevelForHand;
        render = originals.render;
        Math.random = originals.random;
        Date.now = originals.dateNow;
        window.setTimeout = originals.setTimeout;
        window.clearTimeout = originals.clearTimeout;
        window.setInterval = originals.setInterval;
        window.clearInterval = originals.clearInterval;
      }

      const normalAfter = normalSnapshot();
      return {
        schemaVersion: 1,
        evidenceKind: "fixed-seed-long-session-reserve-ab",
        interpretation: "design-pacing-only",
        notNormalBugEvidence: true,
        heroPolicy: "balanced-v2.9",
        seed: initialSeed >>> 0,
        initialBankroll,
        initialTableStack: tables[0].entry,
        initialTotalWealth,
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
        tables,
        pacingHands,
        handReports,
        finalSession: { ...externalSession },
        fairness: {
          transitionApi: "LongSessionModeV1.createSession/propose/commit",
          transitionInput: "public-completed-hand-state-only",
          hiddenOpponentCardsReadForTransition: false,
          futureDeckReadForTransition: false,
          heroPolicyUsesOwnCards: true,
          heroPolicyUsesPublicBoardPotActions: true,
          heroPolicyUsesOpponentCards: false,
          heroPolicyUsesFutureDeck: false,
        },
        normalBefore,
        normalAfter,
        productRuntimeActivated: window.LongSessionModeV1.isActive(),
      };
    }, { handCount: HANDS, maxEventsPerHand: MAX_EVENTS_PER_HAND, initialSeed: SEED, initialBankroll: INITIAL_BANKROLL });

    const pacing = summarizeLongSessionPacing({ tables: raw.tables, hands: raw.pacingHands, evidenceKind: raw.evidenceKind });
    const report = {
      ...raw,
      pacing,
      deterministicFingerprint: fingerprint({
        heroPolicy: raw.heroPolicy,
        seed: raw.seed,
        initialBankroll: raw.initialBankroll,
        configuredHands: raw.configuredHands,
        handsCompleted: raw.handsCompleted,
        pacingHands: raw.pacingHands,
        actionCounts: raw.actionCounts,
      }),
    };

    const jsonPath = testInfo.outputPath("long-session-reserve-ab-v1.json");
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await testInfo.attach("long-session-reserve-ab-v1.json", { path: jsonPath, contentType: "application/json" });

    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(report.heroPolicy).toBe("balanced-v2.9");
    expect(report.productRuntimeActivated).toBe(false);
    expect(report.handsCompleted).toBe(report.pacingHands.length);
    expect(report.handsCompleted).toBeGreaterThan(0);
    expect(report.handsCompleted).toBeLessThanOrEqual(HANDS);
    expect(report.humanDecisions).toBeGreaterThan(0);
    expect(report.normalAfter).toEqual(report.normalBefore);
    expect(report.handReports.every(hand => hand.transitionWealthConserved)).toBe(true);
    expect(report.handReports.every(hand => hand.totalChips === hand.expectedChips)).toBe(true);
    expect(report.deterministicFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(report.pacing).toMatchObject({
      version: "1.0.0",
      evidenceKind: "fixed-seed-long-session-reserve-ab",
      interpretation: "design-pacing-only",
      notNormalBugEvidence: true,
      hands: report.handsCompleted,
      fairnessBoundary: {
        publicCompletedHandStateOnly: true,
        hiddenCardsRequired: false,
        futureDeckRequired: false,
      },
    });
    expect(report.fairness.transitionApi).toBe("LongSessionModeV1.createSession/propose/commit");
    expect(report.fairness.heroPolicyUsesOpponentCards).toBe(false);
    expect(report.fairness.heroPolicyUsesFutureDeck).toBe(false);
  });
});
