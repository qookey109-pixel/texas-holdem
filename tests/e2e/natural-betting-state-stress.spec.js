import { expect, test } from "@playwright/test";

const HAND_COUNT = 8;
const MAX_STEPS_PER_HAND = 320;

test.describe("自然下注狀態機壓力測試", () => {
  test.setTimeout(120_000);

  test(`連續 ${HAND_COUNT} 手不超時、籌碼守恆且清除後不再推進`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay = 0, ...args) => {
        const normalized = Number(delay) || 0;
        const accelerated = normalized > 20 ? 1 : normalized;
        return nativeSetTimeout(callback, accelerated, ...args);
      };
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => Boolean(window.AiTimingController?.clear)),
      { timeout: 15_000 },
    ).toBe(true);

    await page.evaluate(() => {
      window.AiTimingController.clear();
      window.GeminiAsyncBettingLoop?.cancelPending?.();
      clearAutoNewHandTimer();
      clearDialogueTimers();
      state.autoNewHand = false;
      state.isMuted = true;

      let seed = 0x4e415455;
      window.__naturalStressOriginalRandom = Math.random;
      Math.random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x1_0000_0000;
      };

      resetGameSession();
      state.gameMode = "normal";
      state.tournament = { active: false };
      startHand();
    });

    const reports = [];
    const actionCounts = { call: 0, raise: 0, fold: 0, allin: 0 };
    let humanDecisionIndex = 0;

    for (let handIndex = 0; handIndex < HAND_COUNT; handIndex += 1) {
      const baseline = await page.evaluate(() => ({
        handNumber: state.handNumber,
        chips: state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot,
      }));

      let completed = null;
      for (let step = 0; step < MAX_STEPS_PER_HAND; step += 1) {
        const snapshot = await page.evaluate(({ expectedChips, decisionIndex }) => {
          const players = state.players || [];
          const allCards = [
            ...(state.deck || []),
            ...(state.board || []),
            ...players.flatMap(player => player.cards || []),
          ];
          const cardKey = card => `${card?.rank ?? card?.label ?? card?.value}-${card?.suit}`;
          const totalChips = players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
          const contributionTotal = players.reduce(
            (sum, player) => sum + (Number(player.totalContribution) || 0),
            0,
          );
          const maximumBet = Math.max(0, ...players.map(player => Number(player.bet) || 0));
          const errors = [];

          if (players.length !== TABLE_AI_COUNT + 1) errors.push(`player-count:${players.length}`);
          if (allCards.length !== 52) errors.push(`card-count:${allCards.length}`);
          if (new Set(allCards.map(cardKey)).size !== allCards.length) errors.push("duplicate-card");
          if (![0, 3, 4, 5].includes(state.board.length)) errors.push(`board:${state.board.length}`);
          if (!Number.isInteger(state.pot) || state.pot < 0) errors.push(`pot:${state.pot}`);
          if (totalChips !== expectedChips) errors.push(`chips:${totalChips}/${expectedChips}`);
          if (!state.handOver && contributionTotal !== state.pot) {
            errors.push(`contributions:${contributionTotal}/${state.pot}`);
          }
          if (!state.handOver && state.currentBet !== maximumBet) {
            errors.push(`current-bet:${state.currentBet}/${maximumBet}`);
          }
          if (state.currentActorIndex < -1 || state.currentActorIndex >= players.length) {
            errors.push(`actor:${state.currentActorIndex}`);
          }
          if (state.waitingForHuman && state.currentActorIndex !== 0) {
            errors.push(`human-wait-actor:${state.currentActorIndex}`);
          }

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

          let action = "";
          if (!errors.length && !state.handOver && state.waitingForHuman && state.currentActorIndex === 0) {
            const player = human();
            const callAmount = amountToCall(player);
            const availableRaise = Math.max(0, player.stack - callAmount);
            const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
            const phase = decisionIndex % 10;
            action = "call";

            if ((phase === 1 || phase === 6) && canRaise) {
              action = "raise";
              els.raiseAmount.value = String(minimumRaiseBy());
            } else if (phase === 3 && callAmount > 0) {
              action = "fold";
            } else if (phase === 8 && player.stack > 0 && (!player.raiseLocked || player.stack <= callAmount)) {
              action = "allin";
            }
            playerAction(action);
          }

          return {
            errors,
            action,
            handOver: state.handOver,
            handNumber: state.handNumber,
            street: state.street,
            boardCount: state.board.length,
            pot: state.pot,
            winners: [...state.winners],
            totalChips: state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot,
          };
        }, { expectedChips: baseline.chips, decisionIndex: humanDecisionIndex });

        expect(snapshot.errors, `第 ${baseline.handNumber} 手第 ${step} 步`).toEqual([]);
        if (snapshot.action) {
          actionCounts[snapshot.action] += 1;
          humanDecisionIndex += 1;
        }
        if (snapshot.handOver) {
          completed = { ...snapshot, steps: step };
          break;
        }
        await page.waitForTimeout(2);
      }

      expect(completed, `第 ${baseline.handNumber} 手在 ${MAX_STEPS_PER_HAND} 步內未完成`).not.toBeNull();
      expect(completed.totalChips).toBe(baseline.chips);
      expect(completed.winners.length).toBeGreaterThan(0);

      await page.evaluate(() => window.AiTimingController.clear());
      const stableBefore = await page.evaluate(() => ({
        handNumber: state.handNumber,
        handOver: state.handOver,
        actor: state.currentActorIndex,
        street: state.street,
        pot: state.pot,
      }));
      await page.waitForTimeout(25);
      const stableAfter = await page.evaluate(() => ({
        handNumber: state.handNumber,
        handOver: state.handOver,
        actor: state.currentActorIndex,
        street: state.street,
        pot: state.pot,
      }));
      expect(stableAfter, `第 ${baseline.handNumber} 手清除 AI timer 後仍自行推進`).toEqual(stableBefore);
      reports.push(completed);

      if (handIndex < HAND_COUNT - 1) {
        await page.evaluate(() => {
          const overlay = document.querySelector("#sessionSummaryOverlay");
          if (overlay) overlay.hidden = true;
          startHand();
        });
      }
    }

    const finalReport = await page.evaluate(() => {
      const experience = window.AiTimingController.getExperience();
      Math.random = window.__naturalStressOriginalRandom;
      return {
        experienceEntries: Object.keys(experience).length,
        fairGuardReady: document.documentElement.dataset.fairSpecialBossGuard === "ready",
        specialProfiles: AI_ROSTER
          .filter(profile => ["Oracle", "Chronos"].includes(profile.name))
          .map(profile => ({
            name: profile.name,
            omniscient: profile.omniscient,
            fairPlay: profile.fairPlay,
            publicInformationOnly: profile.publicInformationOnly,
          })),
      };
    });

    expect(reports).toHaveLength(HAND_COUNT);
    expect(actionCounts.call).toBeGreaterThan(0);
    expect(actionCounts.raise + actionCounts.allin).toBeGreaterThan(0);
    expect(finalReport.experienceEntries).toBeGreaterThan(0);
    expect(finalReport.fairGuardReady).toBe(true);
    expect(finalReport.specialProfiles).toEqual([
      { name: "Oracle", omniscient: undefined, fairPlay: true, publicInformationOnly: true },
      { name: "Chronos", omniscient: undefined, fairPlay: true, publicInformationOnly: true },
    ]);
    expect(pageErrors).toEqual([]);

    await testInfo.attach("natural-betting-state-stress.json", {
      body: Buffer.from(JSON.stringify({ reports, actionCounts, finalReport, pageErrors }, null, 2)),
      contentType: "application/json",
    });
  });
});
