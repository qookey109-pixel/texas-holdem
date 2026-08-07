import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.NORMAL_ECONOMY_BENCHMARK === "1";
const requestedHands = Number.parseInt(process.env.NORMAL_ECONOMY_BENCHMARK_HANDS || "100", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(250, Math.max(20, requestedHands)) : 100;
const BASE_SEED = Number.parseInt(process.env.NORMAL_ECONOMY_BENCHMARK_SEED || "60865001", 10) || 60865001;
const CAPS = [60, 65];
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(
  `tests/support/ai-long-run-telemetry-v2-9.part-${index}`,
));
const TIMEOUT_MS = Math.max(420_000, HANDS * CAPS.length * 4_000);

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function summarizeRun(run) {
  const economy = run.economy;
  const completedSurvivals = economy.replacementEvents
    .filter(event => Number.isFinite(event.survivalHands))
    .map(event => event.survivalHands);
  const observedSurvivals = economy.replacementEvents
    .map(event => Number.isFinite(event.survivalHands)
      ? event.survivalHands
      : Math.max(0, economy.completedHands - event.entryHand + 1));
  const entrantRatios = economy.replacementEvents.map(event => event.entryToMedianRatio);
  const entryBbs = economy.replacementEvents.map(event => event.entryBb);
  const heroRatios = economy.handEnds.map(hand => hand.heroToOpponentMedianRatio);
  const leaderRatios = economy.handEnds.map(hand => hand.maxToMedianRatio);
  const opponentMedianBbs = economy.handEnds.map(hand => hand.opponentMedianBb);
  const totalInjection = economy.replacementEvents.reduce((sum, event) => sum + event.stack, 0)
    + economy.heroRebuys.reduce((sum, event) => sum + event.stack, 0);
  const finalHand = economy.handEnds.at(-1) || null;
  return {
    capBb: economy.capBb,
    completedHands: economy.completedHands,
    aiReplacementCount: economy.replacementEvents.length,
    heroRebuyCount: economy.heroRebuys.length,
    totalInjection,
    injectionPer100Hands: totalInjection * (100 / Math.max(1, economy.completedHands)),
    averageEntryBb: average(entryBbs),
    averageEntryToMedianRatio: average(entrantRatios),
    averageBustedAiSurvivalHands: average(completedSurvivals),
    averageObservedAiSurvivalHands: average(observedSurvivals),
    censoredAiEntrants: economy.replacementEvents.length - completedSurvivals.length,
    averageHeroToOpponentMedianRatio: average(heroRatios),
    maxHeroToOpponentMedianRatio: heroRatios.length ? Math.max(...heroRatios) : 0,
    averageMaxToMedianRatio: average(leaderRatios),
    averageOpponentMedianBb: average(opponentMedianBbs),
    finalHeroBb: finalHand?.heroBb || 0,
    finalOpponentMedianBb: finalHand?.opponentMedianBb || 0,
    finalHeroToOpponentMedianRatio: finalHand?.heroToOpponentMedianRatio || 0,
    labFingerprint: run.lab.deterministicFingerprint,
    labFailures: run.lab.failures?.length || 0,
    schedulerErrors: run.lab.schedulerErrors?.length || 0,
  };
}

function toMarkdown(report) {
  const rows = report.runs.map(run => [
    run.capBb,
    run.completedHands,
    run.aiReplacementCount,
    run.heroRebuyCount,
    round(run.averageEntryBb, 2),
    round(run.averageEntryToMedianRatio, 3),
    round(run.averageBustedAiSurvivalHands, 2),
    round(run.averageObservedAiSurvivalHands, 2),
    run.censoredAiEntrants,
    Math.round(run.injectionPer100Hands),
    round(run.averageHeroToOpponentMedianRatio, 3),
    round(run.maxHeroToOpponentMedianRatio, 3),
    round(run.averageMaxToMedianRatio, 3),
    round(run.finalHeroBb, 2),
    round(run.finalOpponentMedianBb, 2),
  ]);
  return [
    "# Normal Economy 60BB vs 65BB Benchmark",
    "",
    `- Hands per policy: ${report.handsPerPolicy}`,
    `- Shared seed: ${report.baseSeed}`,
    "- Same long-run full-hand lab and hero profile are used for both policies.",
    "- 65BB is applied only in the benchmark harness; production code remains unchanged.",
    "",
    "| Cap | Hands | AI replacements | Hero rebuys | Avg entry BB | Entry/median | Busted survival | Observed survival | Censored | Injection/100 | Hero/opp median | Max hero/opp median | Leader/median | Final hero BB | Final opp median BB |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(row => `| ${row.join(" | ")} |`),
    "",
    "## Notes",
    "",
    "- `Busted survival` uses only replacement entrants that busted within the 100-hand window.",
    "- `Observed survival` treats entrants still alive at hand 100 as right-censored lower bounds.",
    "- `Injection/100` includes AI replacement stacks plus hero rebuys.",
    "- `Hero/opp median` compares Owl with the median positive AI stack at each completed hand.",
  ].join("\n");
}

test.describe("Normal Economy V2 60BB vs 65BB full-hand benchmark", () => {
  test.skip(!ENABLED, "Run with NORMAL_ECONOMY_BENCHMARK=1");
  test.setTimeout(TIMEOUT_MS);

  test(`runs ${HANDS} hands per policy with the same seed`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => window.ReplacementStackBalance?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.1.0");
    await expect.poll(
      () => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""),
      { timeout: 15_000 },
    ).toBe("1.1.0");
    await expect.poll(
      () => page.evaluate(() => window.AiTierStrategyV28?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.8.0");

    const labSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    await page.addScriptTag({ content: labSource });
    await expect.poll(
      () => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""),
      { timeout: 10_000 },
    ).toBe("2.9.0");

    const rawRuns = [];
    for (const capBb of CAPS) {
      const run = await page.evaluate(async ({ capBb, hands, baseSeed }) => {
        const originalCalculate = window.ReplacementStackBalance.calculate;
        const originalBuildNextAiSeats = buildNextAiSeats;
        const originalStartHand = startHand;
        const replacementEvents = [];
        const heroRebuys = [];
        const handEnds = [];
        const liveEntrants = new Map();
        let lastFinalizedHand = 0;

        function finite(value, fallback = 0) {
          const number = Number(value);
          return Number.isFinite(number) ? number : fallback;
        }

        function median(values) {
          const clean = values.map(Number).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
          if (!clean.length) return 0;
          const middle = Math.floor(clean.length / 2);
          return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
        }

        function plan(players = state?.players, options = {}) {
          const requestedHand = Math.max(
            1,
            finite(state?.handNumber, 0) + (options.nextHand ? 1 : 0),
          );
          const level = typeof blindLevelForHand === "function"
            ? blindLevelForHand(requestedHand)
            : state?.blindLevel;
          const bigBlind = Math.max(1, finite(options.bigBlind, finite(level?.big, 20)));
          const fullBuyIn = Math.max(bigBlind, finite(options.buyIn, finite(level?.buyIn, bigBlind * 100)));
          const positive = (Array.isArray(players) ? players : [])
            .map(player => finite(player?.stack))
            .filter(stack => stack > 0);
          const tableMedian = positive.length ? median(positive) : fullBuyIn;
          const rawTarget = Math.min(
            tableMedian * 0.80,
            fullBuyIn * 0.75,
            bigBlind * capBb,
          );
          const softFloor = Math.min(tableMedian, bigBlind * 12);
          const boundedTarget = Math.min(tableMedian, Math.max(rawTarget, softFloor));
          const roundedDown = Math.floor(boundedTarget / bigBlind) * bigBlind;
          const minimumPlayable = Math.min(tableMedian, bigBlind);
          const stack = Math.max(minimumPlayable, roundedDown || minimumPlayable);
          return {
            stack,
            bigBlind,
            fullBuyIn,
            tableMedian,
            entryBb: stack / bigBlind,
            entryToMedianRatio: tableMedian > 0 ? stack / tableMedian : 0,
          };
        }

        function finalizeHand() {
          if (!state?.handOver) return;
          const handNumber = finite(state?.handNumber);
          if (!handNumber || handNumber <= lastFinalizedHand) return;
          const bigBlind = Math.max(1, finite(currentBigBlind?.(), finite(state?.blindLevel?.big, 20)));
          const heroStack = Math.max(0, finite(state.players?.[0]?.stack));
          const positiveStacks = (state.players || []).map(player => finite(player?.stack)).filter(stack => stack > 0);
          const opponentStacks = (state.players || []).slice(1).map(player => finite(player?.stack)).filter(stack => stack > 0);
          const tableMedian = median(positiveStacks);
          const opponentMedian = median(opponentStacks);
          const maximumStack = positiveStacks.length ? Math.max(...positiveStacks) : 0;
          handEnds.push({
            handNumber,
            bigBlind,
            heroStack,
            heroBb: heroStack / bigBlind,
            tableMedian,
            tableMedianBb: tableMedian / bigBlind,
            opponentMedian,
            opponentMedianBb: opponentMedian / bigBlind,
            heroToOpponentMedianRatio: opponentMedian > 0 ? heroStack / opponentMedian : 0,
            maxToMedianRatio: tableMedian > 0 ? maximumStack / tableMedian : 0,
            totalChips: (state.players || []).reduce((sum, player) => sum + Math.max(0, finite(player?.stack)), 0),
          });

          for (const [aiSeatIndex, entrant] of liveEntrants) {
            const player = state.players?.[aiSeatIndex + 1];
            if (!player || player.name !== entrant.name || finite(player.stack) <= 0) {
              replacementEvents[entrant.eventIndex].survivalHands = Math.max(1, handNumber - entrant.entryHand + 1);
              replacementEvents[entrant.eventIndex].bustedHand = handNumber;
              liveEntrants.delete(aiSeatIndex);
            }
          }
          lastFinalizedHand = handNumber;
        }

        window.ReplacementStackBalance.calculate = function benchmarkNormalCalculate(players, options = {}) {
          return plan(players, options).stack;
        };

        buildNextAiSeats = function benchmarkBuildNextAiSeats(previousPlayers) {
          const seats = originalBuildNextAiSeats.apply(this, arguments);
          if (!Array.isArray(previousPlayers) || !previousPlayers.length || window.TournamentMode?.isActive?.()) {
            return seats;
          }
          const entryPlan = plan(previousPlayers);
          return (Array.isArray(seats) ? seats : []).map((seat, aiSeatIndex) => {
            if (!seat?.replaced) return seat;
            const eventIndex = replacementEvents.length;
            const name = seat.profile?.name || `AI-${aiSeatIndex + 1}`;
            replacementEvents.push({
              eventIndex,
              entryHand: finite(state?.handNumber),
              aiSeatIndex,
              name,
              replacedName: seat.replaced?.name || "",
              stack: entryPlan.stack,
              bigBlind: entryPlan.bigBlind,
              entryBb: entryPlan.entryBb,
              tableMedian: entryPlan.tableMedian,
              entryToMedianRatio: entryPlan.entryToMedianRatio,
              survivalHands: null,
              bustedHand: null,
            });
            liveEntrants.set(aiSeatIndex, {
              eventIndex,
              entryHand: finite(state?.handNumber),
              name,
            });
            return {
              ...seat,
              stack: entryPlan.stack,
              economyBenchmarkCapBb: capBb,
            };
          });
        };

        startHand = function benchmarkStartHand(...args) {
          const previousPlayers = Array.isArray(state?.players) ? state.players : [];
          const heroWasBusted = Boolean(previousPlayers[0] && finite(previousPlayers[0].stack) <= 0);
          const heroPlan = heroWasBusted ? plan(previousPlayers, { nextHand: true }) : null;
          finalizeHand();
          const result = originalStartHand.apply(this, args);
          if (heroWasBusted && heroPlan) {
            heroRebuys.push({
              entryHand: finite(state?.handNumber),
              stack: heroPlan.stack,
              bigBlind: heroPlan.bigBlind,
              entryBb: heroPlan.entryBb,
              tableMedian: heroPlan.tableMedian,
              entryToMedianRatio: heroPlan.entryToMedianRatio,
            });
          }
          return result;
        };

        let lab;
        try {
          window.EconomyFoldDefenseV1?.refresh?.();
          lab = await window.AiLongRunTelemetryV29.runShard({
            hands,
            shardIndex: 0,
            shardCount: 1,
            baseSeed,
          });
          finalizeHand();
        } finally {
          window.ReplacementStackBalance.calculate = originalCalculate;
          buildNextAiSeats = originalBuildNextAiSeats;
          startHand = originalStartHand;
        }

        return {
          lab,
          economy: {
            schemaVersion: 1,
            capBb,
            completedHands: handEnds.length,
            replacementEvents,
            heroRebuys,
            handEnds,
          },
        };
      }, { capBb, hands: HANDS, baseSeed: BASE_SEED });
      rawRuns.push(run);
    }

    const report = {
      schemaVersion: 1,
      handsPerPolicy: HANDS,
      baseSeed: BASE_SEED,
      runs: rawRuns.map(summarizeRun),
      rawRuns,
    };
    const markdown = toMarkdown(report);
    const jsonPath = testInfo.outputPath("normal-economy-benchmark-60-vs-65.json");
    const markdownPath = testInfo.outputPath("normal-economy-benchmark-60-vs-65.md");
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(markdownPath, markdown, "utf8");
    await testInfo.attach("normal-economy-benchmark-60-vs-65.json", {
      path: jsonPath,
      contentType: "application/json",
    });
    await testInfo.attach("normal-economy-benchmark-60-vs-65.md", {
      path: markdownPath,
      contentType: "text/markdown",
    });

    console.log(markdown);
    expect(pageErrors).toEqual([]);
    for (const rawRun of rawRuns) {
      expect(rawRun.lab.completedHands).toBe(HANDS);
      expect(rawRun.lab.failures).toEqual([]);
      expect(rawRun.lab.schedulerErrors).toEqual([]);
      expect(rawRun.economy.completedHands).toBe(HANDS);
      expect(rawRun.economy.replacementEvents.length).toBeGreaterThan(0);
    }
  });
});
