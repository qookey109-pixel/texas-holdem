import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.POKER_ECONOMY_TAIL_FLOOR === "1";
const POLICY = process.env.POKER_ECONOMY_TAIL_FLOOR_POLICY || "80-75";
const requestedHands = Number.parseInt(process.env.POKER_ECONOMY_TAIL_FLOOR_HANDS || "100", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 100;
const SHARD_INDEX = Math.max(0, Number.parseInt(process.env.POKER_ECONOMY_TAIL_FLOOR_SHARD || "0", 10) || 0);
const SHARD_COUNT = Math.max(1, Number.parseInt(process.env.POKER_ECONOMY_TAIL_FLOOR_SHARD_COUNT || "1", 10) || 1);
const BASE_SEED = Number.parseInt(process.env.POKER_ECONOMY_TAIL_FLOOR_SEED_BASE || "26890246", 10) || 26890246;
const OUTPUT_DIRECTORY = resolve(process.env.POKER_ECONOMY_TAIL_FLOOR_OUTPUT_DIR || "economy-tail-floor-results");
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(`tests/support/ai-long-run-telemetry-v2-9.part-${index}`));
const INTEGRITY_SCRIPT = resolve("tests/support/ai-long-run-telemetry-integrity-v2-9-4.js");
const ADAPTER = resolve("tests/support/poker-economy-tail-floor-v1.js");
const TIMEOUT_MS = Math.min(55 * 60_000, Math.max(120_000, HANDS * 2_500));

function injectTelemetryHooks(source) {
  const replacements = [
    {
      target: "    function recordAction(player, action) {\n      const metric = metricFor(player);",
      replacement: "    function recordAction(player, action) {\n      window.AiLongRunTelemetryIntegrityV294?.recordAction?.(player, action);\n      const metric = metricFor(player);",
    },
    {
      target: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        const expectedChips",
      replacement: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        window.AiLongRunTelemetryIntegrityV294?.beginHand?.();\n        const expectedChips",
    },
    {
      target: "        if (state.handOver && finalValidation.totalChips === expectedChips) handsCompleted += 1;",
      replacement: "        if (state.handOver && finalValidation.totalChips === expectedChips) {\n          window.PokerEconomyTailFloorV1?.recordHandSnapshot?.(state.players, bigBlind);\n          handsCompleted += 1;\n        }",
    },
    {
      target: "        cleanupTimers();\n        activeHand = null;",
      replacement: "        window.AiLongRunTelemetryIntegrityV294?.finalizeHand?.();\n        cleanupTimers();\n        activeHand = null;",
    },
  ];
  let output = source;
  for (const { target, replacement } of replacements) {
    const matches = output.split(target).length - 1;
    if (matches !== 1) throw new Error(`Tail-floor telemetry hook target count ${matches}: ${target.slice(0, 72)}`);
    output = output.replace(target, replacement);
  }
  return output;
}

test.describe("Poker Economy Tail Floor Benchmark V1", () => {
  test.skip(!ENABLED, "Run with POKER_ECONOMY_TAIL_FLOOR=1");
  test.setTimeout(TIMEOUT_MS);

  test(`evaluates ${POLICY} on shard ${SHARD_INDEX + 1}/${SHARD_COUNT} for ${HANDS} hands`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""), { timeout: 15_000 }).toBe("2.9.5");
    await expect.poll(() => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""), { timeout: 15_000 }).toBe("1.1.1");

    const integritySource = await readFile(INTEGRITY_SCRIPT, "utf8");
    await page.addScriptTag({ content: integritySource });
    await page.evaluate(() => {
      window.EconomyFoldDefenseV1?.refresh?.();
      window.AiTierStrategyV292?.refresh?.();
      window.AiOpeningBalanceV294?.refresh?.();
      window.AiOpeningBalanceV295?.refresh?.();
      window.AiTierStrategyV292?.resetRuntimeEvidence?.();
      window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
      window.AiLongRunTelemetryIntegrityV294?.reset?.();
    });

    const adapterSource = await readFile(ADAPTER, "utf8");
    await page.addScriptTag({ content: adapterSource });
    await expect.poll(() => page.evaluate(() => window.PokerEconomyTailFloorV1?.version || ""), { timeout: 10_000 }).toBe("1.0.0");
    const installed = await page.evaluate(policy => window.PokerEconomyTailFloorV1.install(policy), POLICY);
    expect(installed).toMatchObject({
      installed: true,
      experimentOnly: true,
      productionBehaviorChanged: false,
      productionConfigUnchanged: true,
      publicInformationOnly: true,
      policy: { id: POLICY },
    });

    const rawLabSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    await page.addScriptTag({ content: injectTelemetryHooks(rawLabSource) });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""), { timeout: 10_000 }).toBe("2.9.0");

    const report = await page.evaluate(options => window.AiLongRunTelemetryV29.runShard(options), {
      hands: HANDS,
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      baseSeed: BASE_SEED,
    });
    report.strategyEvidence = await page.evaluate(() => window.AiTierStrategyV292?.runtimeEvidence?.() || null);
    report.openingBalanceEvidence = await page.evaluate(() => window.AiOpeningBalanceV295?.runtimeEvidence?.() || null);
    report.telemetryIntegrity = await page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.snapshot?.({ finalize: true }) || null);
    report.economyOoda = await page.evaluate(() => window.PokerEconomyTailFloorV1?.snapshot?.() || null);
    report.economyOoda.stage = process.env.POKER_ECONOMY_TAIL_FLOOR_STAGE || "screen";

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = resolve(OUTPUT_DIRECTORY, `poker-economy-ooda-${POLICY}-shard-${String(SHARD_INDEX).padStart(3, "0")}.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(report).toMatchObject({
      configuredHands: HANDS,
      completedHands: HANDS,
      fairness: { publicInformationOnly: true },
      telemetryIntegrity: { integrityPassed: true, errors: [] },
      economyOoda: {
        version: "1.0.0",
        schemaVersion: 3,
        experimentOnly: true,
        productionBehaviorChanged: false,
        productionConfigUnchanged: true,
        publicInformationOnly: true,
        hiddenOpponentCards: false,
        actualDeckOrder: false,
        futureBoardAnswer: false,
        predeterminedWinner: false,
        policy: { id: POLICY, maxBigBlinds: 60 },
        handStackSampleCount: HANDS,
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(report.economyOoda.handStackSamples).toHaveLength(HANDS);
    expect(report.economyOoda.maximumEntryBb === null || report.economyOoda.maximumEntryBb <= 60).toBe(true);
    expect(report.economyOoda.productionConfig?.maxBigBlinds).toBe(60);
    expect(pageErrors).toEqual([]);
  });
});
