import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.AI_HERO_GAIN_AUDIT === "1";
const requestedHands = Number.parseInt(process.env.AI_HERO_GAIN_HANDS || "250", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 250;
const SHARD_INDEX = Math.max(0, Number.parseInt(process.env.AI_HERO_GAIN_SHARD || "0", 10) || 0);
const SHARD_COUNT = Math.max(1, Number.parseInt(process.env.AI_HERO_GAIN_SHARD_COUNT || "1", 10) || 1);
const BASE_SEED = Number.parseInt(process.env.AI_HERO_GAIN_SEED_BASE || "26890246", 10) || 26890246;
const OUTPUT_DIRECTORY = resolve(process.env.AI_HERO_GAIN_OUTPUT_DIR || "ai-hero-gain-results");
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(`tests/support/ai-long-run-telemetry-v2-9.part-${index}`));
const INTEGRITY_SCRIPT = resolve("tests/support/ai-long-run-telemetry-integrity-v2-9-4.js");
const AUDIT_SCRIPT = resolve("tests/support/ai-hero-gain-concentration-audit-v1.js");
const TIMEOUT_MS = Math.min(55 * 60_000, Math.max(120_000, HANDS * 2_500));

function padShard(value) {
  return String(value).padStart(3, "0");
}

function injectAuditHooks(source) {
  const replacements = [
    {
      target: "    function recordAction(player, action) {\n      const metric = metricFor(player);",
      replacement: "    function recordAction(player, action) {\n      window.AiLongRunTelemetryIntegrityV294?.recordAction?.(player, action);\n      const metric = metricFor(player);",
    },
    {
      target: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        const expectedChips",
      replacement: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        window.AiLongRunTelemetryIntegrityV294?.beginHand?.();\n        window.AiHeroGainConcentrationAuditV1?.recordHandStart?.(state.players, bigBlind, state.handNumber);\n        const expectedChips",
    },
    {
      target: "        if (state.handOver && finalValidation.totalChips === expectedChips) handsCompleted += 1;",
      replacement: "        if (state.handOver && finalValidation.totalChips === expectedChips) {\n          window.AiHeroGainConcentrationAuditV1?.recordHandEnd?.(state.players, bigBlind, state.handNumber, state.winners || [], state.board?.length || 0);\n          handsCompleted += 1;\n        }",
    },
    {
      target: "        cleanupTimers();\n        activeHand = null;",
      replacement: "        window.AiLongRunTelemetryIntegrityV294?.finalizeHand?.();\n        cleanupTimers();\n        activeHand = null;",
    },
  ];

  let output = source;
  for (const { target, replacement } of replacements) {
    const matches = output.split(target).length - 1;
    if (matches !== 1) throw new Error(`Hero-gain hook target count ${matches}: ${target.slice(0, 72)}`);
    output = output.replace(target, replacement);
  }
  return output;
}

test.describe("AI Hero gain concentration audit V1", () => {
  test.skip(!ENABLED, "Run with AI_HERO_GAIN_AUDIT=1");
  test.setTimeout(TIMEOUT_MS);

  test(`audits Hero gain shard ${SHARD_INDEX + 1}/${SHARD_COUNT} for ${HANDS} hands`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1_150);
    await expect.poll(() => page.evaluate(() => window.AiTierStrategyV292?.version || ""), { timeout: 15_000 }).toBe("2.9.2");
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV294?.version || ""), { timeout: 15_000 }).toBe("2.9.4");
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""), { timeout: 15_000 }).toBe("2.9.5");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV292 || ""), { timeout: 15_000 }).toBe("ready");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV294 || ""), { timeout: 15_000 }).toBe("ready");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV295 || ""), { timeout: 15_000 }).toBe("ready");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.aiActionDispatcherV1 || ""), { timeout: 15_000 }).toBe("ready");
    await expect.poll(() => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""), { timeout: 15_000 }).toBe("1.1.1");

    const integritySource = await readFile(INTEGRITY_SCRIPT, "utf8");
    const auditSource = await readFile(AUDIT_SCRIPT, "utf8");
    await page.addScriptTag({ content: integritySource });
    await page.addScriptTag({ content: auditSource });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.version || ""), { timeout: 10_000 }).toBe("2.9.4");
    await expect.poll(() => page.evaluate(() => window.AiHeroGainConcentrationAuditV1?.version || ""), { timeout: 10_000 }).toBe("1.0.0");

    await page.evaluate(() => {
      window.AiTierStrategyV292?.resetRuntimeEvidence?.();
      window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
      window.AiLongRunTelemetryIntegrityV294?.reset?.();
      window.AiHeroGainConcentrationAuditV1?.reset?.();
    });

    const rawLabSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    await page.addScriptTag({ content: injectAuditHooks(rawLabSource) });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""), { timeout: 10_000 }).toBe("2.9.0");

    const report = await page.evaluate(options => window.AiLongRunTelemetryV29.runShard(options), {
      hands: HANDS,
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      baseSeed: BASE_SEED,
    });
    report.heroGainAudit = await page.evaluate(() => window.AiHeroGainConcentrationAuditV1?.snapshot?.() || null);
    report.telemetryIntegrity = await page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.snapshot?.({ finalize: true }) || null);

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = resolve(OUTPUT_DIRECTORY, `ai-hero-gain-audit-shard-${padShard(SHARD_INDEX)}.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(report).toMatchObject({
      schemaVersion: 1,
      labVersion: "2.9.0",
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      configuredHands: HANDS,
      completedHands: HANDS,
      fairness: { publicInformationOnly: true },
      telemetryIntegrity: { integrityPassed: true, errors: [] },
      heroGainAudit: {
        version: "1.0.0",
        schemaVersion: 1,
        observationOnly: true,
        publicInformationOnly: true,
        hiddenOpponentCards: false,
        actualDeckOrder: false,
        futureBoardAnswer: false,
        predeterminedWinner: false,
        errors: [],
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(report.heroGainAudit.handsCompleted).toBe(HANDS);
    expect(pageErrors).toEqual([]);
  });
});
