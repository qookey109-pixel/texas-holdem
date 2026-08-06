import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.AI_LONG_RUN_TELEMETRY === "1";
const requestedHands = Number.parseInt(process.env.AI_LONG_RUN_HANDS || "25", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 25;
const SHARD_INDEX = Math.max(0, Number.parseInt(process.env.AI_LONG_RUN_SHARD || "0", 10) || 0);
const SHARD_COUNT = Math.max(1, Number.parseInt(process.env.AI_LONG_RUN_SHARD_COUNT || "1", 10) || 1);
const BASE_SEED = Number.parseInt(process.env.AI_LONG_RUN_SEED_BASE || "26890246", 10) || 26890246;
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(
  `tests/support/ai-long-run-telemetry-v2-9.part-${index}`,
));
const INTEGRITY_SCRIPT = resolve("tests/support/ai-long-run-telemetry-integrity-v2-9-4.js");
// Full shards can spend more than one second per hand on Boss range-equity paths.
// Keep the Playwright limit below the workflow job limit while leaving enough
// headroom for report serialization, assertions and artifact attachment.
const TIMEOUT_MS = Math.max(120_000, HANDS * 2_000);

function padShard(value) {
  return String(value).padStart(3, "0");
}

function injectIntegrityHooks(source) {
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
      target: "        cleanupTimers();\n        activeHand = null;",
      replacement: "        window.AiLongRunTelemetryIntegrityV294?.finalizeHand?.();\n        cleanupTimers();\n        activeHand = null;",
    },
  ];
  let output = source;
  for (const { target, replacement } of replacements) {
    const matches = output.split(target).length - 1;
    if (matches !== 1) {
      throw new Error(`V2.9.4 telemetry hook target count ${matches}: ${target.slice(0, 72)}`);
    }
    output = output.replace(target, replacement);
  }
  return output;
}

test.describe("AI V2.9 long-run full-hand telemetry", () => {
  test.skip(!ENABLED, "Run with AI_LONG_RUN_TELEMETRY=1 or npm run test:ai-long-run:smoke");
  test.setTimeout(TIMEOUT_MS);

  test(`runs deterministic telemetry shard ${SHARD_INDEX + 1}/${SHARD_COUNT} for ${HANDS} hands`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => window.AiTierStrategyV28?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.8.0");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV28 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => window.AiTierStrategyV292?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.2");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiTierStrategyV292 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => window.AiOpeningBalanceV294?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.4");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV294 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.9.5");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiOpeningBalanceV295 || ""),
      { timeout: 15_000 },
    ).toBe("ready");
    await expect.poll(
      () => page.evaluate(() => Boolean(botAction?.__aiOpeningBalanceV295Wrapper)),
      { timeout: 15_000 },
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => Boolean(botAction?.__previousBotAction?.__aiOpeningBalanceV294Wrapper)),
      { timeout: 15_000 },
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""),
      { timeout: 15_000 },
    ).toBe("1.1.0");

    const integritySource = await readFile(INTEGRITY_SCRIPT, "utf8");
    await page.addScriptTag({ content: integritySource });
    await expect.poll(
      () => page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.version || ""),
      { timeout: 10_000 },
    ).toBe("2.9.4");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiTelemetryIntegrityV294 || ""),
      { timeout: 10_000 },
    ).toBe("ready");

    await page.evaluate(() => {
      window.EconomyFoldDefenseV1?.refresh?.();
      window.AiTierStrategyV292?.refresh?.();
      window.AiOpeningBalanceV294?.refresh?.();
      window.AiOpeningBalanceV295?.refresh?.();
      window.AiTierStrategyV292?.resetRuntimeEvidence?.();
      window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
      window.AiLongRunTelemetryIntegrityV294?.reset?.();
    });
    await expect.poll(
      () => page.evaluate(() => Boolean(botAction?.__aiOpeningBalanceV295Wrapper)),
      { timeout: 15_000 },
    ).toBe(true);

    const rawLabSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    const labSource = injectIntegrityHooks(rawLabSource);
    await page.addScriptTag({ content: labSource });
    await expect.poll(
      () => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""),
      { timeout: 10_000 },
    ).toBe("2.9.0");

    const report = await page.evaluate(options => (
      window.AiLongRunTelemetryV29.runShard(options)
    ), {
      hands: HANDS,
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      baseSeed: BASE_SEED,
    });
    report.strategyEvidence = await page.evaluate(() => (
      window.AiTierStrategyV292?.runtimeEvidence?.() || null
    ));
    report.openingBalanceEvidence = await page.evaluate(() => (
      window.AiOpeningBalanceV295?.runtimeEvidence?.() || null
    ));
    report.telemetryIntegrity = await page.evaluate(() => (
      window.AiLongRunTelemetryIntegrityV294?.snapshot?.({ finalize: true }) || null
    ));
    const markdown = await page.evaluate(value => (
      window.AiLongRunTelemetryV29.toMarkdown(value)
    ), report);

    const suffix = padShard(SHARD_INDEX);
    const jsonPath = testInfo.outputPath(`ai-long-run-shard-${suffix}.json`);
    const markdownPath = testInfo.outputPath(`ai-long-run-shard-${suffix}.md`);
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(markdownPath, markdown, "utf8");
    await testInfo.attach(`ai-long-run-shard-${suffix}.json`, {
      path: jsonPath,
      contentType: "application/json",
    });
    await testInfo.attach(`ai-long-run-shard-${suffix}.md`, {
      path: markdownPath,
      contentType: "text/markdown",
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      labVersion: "2.9.0",
      shardIndex: SHARD_INDEX,
      shardCount: SHARD_COUNT,
      configuredHands: HANDS,
      completedHands: HANDS,
      fairness: {
        hiddenOpponentCards: false,
        actualDeckOrder: false,
        futureBoardAnswer: false,
        predeterminedWinner: false,
        publicInformationOnly: true,
        omniscientProfiles: [],
      },
      strategyEvidence: {
        version: "2.9.2",
        observerActive: true,
        fallbackDecisions: 0,
        publicInformationFailures: 0,
      },
      openingBalanceEvidence: {
        version: "2.9.5",
        observerActive: true,
        fallbackDecisions: 0,
        publicInformationFailures: 0,
      },
      telemetryIntegrity: {
        version: "2.9.4",
        schemaVersion: 1,
        definition: "postflop-showdown-hands/showdown-eligible-hands-excluding-preflop-all-in",
        hookMode: "explicit-lab-hooks",
        completedHands: HANDS,
        integrityPassed: true,
        errors: [],
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(report.strategyEvidence.totalV292Decisions).toBe(report.strategyEvidence.totalTargetedDecisions);
    expect(report.openingBalanceEvidence.totalV295Decisions).toBe(
      report.openingBalanceEvidence.totalTargetedDecisions,
    );
    expect(report.openingBalanceEvidence.totalTargetedDecisions).toBeGreaterThanOrEqual(0);
    expect(report.activeRoles.length).toBeGreaterThanOrEqual(5);
    expect(report.humanDecisions).toBeGreaterThan(0);
    expect(report.maximumEvents).toBeGreaterThan(0);
    expect(report.deterministicFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(markdown).toContain("# AI V2.9 Long-run Telemetry Shard");

    const activeSummaries = report.activeRoles.map(name => report.roles[name]);
    expect(activeSummaries.every(role => role.hands > 0)).toBe(true);
    const recordedActions = activeSummaries.reduce((total, role) => (
      total + Object.values(role.actionCounts || {}).reduce((streetTotal, actions) => (
        streetTotal + Object.values(actions || {}).reduce((sum, count) => sum + (Number(count) || 0), 0)
      ), 0)
    ), 0);
    expect(recordedActions).toBeGreaterThan(0);
    expect(activeSummaries.every(role => Number.isFinite(role.bb100))).toBe(true);
    const integrityRoles = Object.values(report.telemetryIntegrity.roles || {})
      .filter(role => role.hands > 0);
    expect(integrityRoles.length).toBeGreaterThanOrEqual(5);
    expect(integrityRoles.every(role => role.integrityPassed)).toBe(true);
    expect(integrityRoles.every(role => role.postflopShowdownHands <= role.showdownEligibleHands)).toBe(true);
  });
});
