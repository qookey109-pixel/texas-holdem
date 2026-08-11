import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.POKER_STACK_PRESSURE_DIAGNOSTIC === "1";
const requestedHands = Number.parseInt(process.env.POKER_STACK_PRESSURE_HANDS || "250", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 250;
const SHARD_INDEX = Math.max(0, Number.parseInt(process.env.POKER_STACK_PRESSURE_SHARD || "0", 10) || 0);
const SHARD_COUNT = Math.max(1, Number.parseInt(process.env.POKER_STACK_PRESSURE_SHARD_COUNT || "1", 10) || 1);
const BASE_SEED = Number.parseInt(process.env.POKER_STACK_PRESSURE_SEED_BASE || "26890246", 10) || 26890246;
const OUTPUT_DIRECTORY = resolve(process.env.POKER_STACK_PRESSURE_OUTPUT_DIR || "stack-pressure-results");
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(`tests/support/ai-long-run-telemetry-v2-9.part-${index}`));
const DIAGNOSTIC = resolve("tests/support/poker-stack-pressure-diagnostic-v1.js");
const TIMEOUT_MS = Math.min(55 * 60_000, Math.max(120_000, HANDS * 2_500));

function padShard(value) {
  return String(value).padStart(3, "0");
}

function injectDiagnosticHook(source) {
  const target = "    function recordAction(player, action) {\n      const metric = metricFor(player);";
  const replacement = "    function recordAction(player, action) {\n      window.PokerStackPressureDiagnosticV1?.recordAction?.(player, action);\n      const metric = metricFor(player);";
  const matches = source.split(target).length - 1;
  if (matches !== 1) throw new Error(`Stack pressure hook target count ${matches}`);
  return source.replace(target, replacement);
}

test.describe("Poker Stack Pressure Diagnostic V1", () => {
  test.skip(!ENABLED, "Run with POKER_STACK_PRESSURE_DIAGNOSTIC=1");
  test.setTimeout(TIMEOUT_MS);

  test(`observes public-stack AI actions on shard ${SHARD_INDEX + 1}/${SHARD_COUNT} for ${HANDS} hands`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""), { timeout: 15_000 }).toBe("2.9.5");
    await expect.poll(() => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""), { timeout: 15_000 }).toBe("1.1.1");

    const diagnosticSource = await readFile(DIAGNOSTIC, "utf8");
    await page.addScriptTag({ content: diagnosticSource });
    await expect.poll(() => page.evaluate(() => window.PokerStackPressureDiagnosticV1?.version || ""), { timeout: 10_000 }).toBe("1.0.0");
    await page.evaluate(() => window.PokerStackPressureDiagnosticV1.reset());

    const rawLabSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    await page.addScriptTag({ content: injectDiagnosticHook(rawLabSource) });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""), { timeout: 10_000 }).toBe("2.9.0");

    const report = await page.evaluate(options => window.AiLongRunTelemetryV29.runShard(options), {
      hands: HANDS,
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      baseSeed: BASE_SEED,
    });
    report.stackPressureDiagnostic = await page.evaluate(() => window.PokerStackPressureDiagnosticV1.snapshot());

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = resolve(OUTPUT_DIRECTORY, `poker-stack-pressure-shard-${padShard(SHARD_INDEX)}.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(report).toMatchObject({
      schemaVersion: 1,
      labVersion: "2.9.0",
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      configuredHands: HANDS,
      completedHands: HANDS,
      fairness: { publicInformationOnly: true },
      stackPressureDiagnostic: {
        version: "1.0.0",
        schemaVersion: 1,
        behaviorChanged: false,
        publicInformationOnly: true,
        hiddenOpponentCards: false,
        actualDeckOrder: false,
        futureBoardAnswer: false,
        predeterminedWinner: false,
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(report.stackPressureDiagnostic.heroLeadSamples).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
});
