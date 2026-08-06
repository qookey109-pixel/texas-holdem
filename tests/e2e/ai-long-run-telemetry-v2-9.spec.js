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
const TIMEOUT_MS = Math.max(120_000, HANDS * 1_000);

function padShard(value) {
  return String(value).padStart(3, "0");
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
      () => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""),
      { timeout: 15_000 },
    ).toBe("1.0.1");
    await page.evaluate(() => window.EconomyFoldDefenseV1?.refresh?.());

    const labSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
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
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(report.activeRoles.length).toBeGreaterThanOrEqual(5);
    expect(report.humanDecisions).toBeGreaterThan(0);
    expect(report.maximumEvents).toBeGreaterThan(0);
    expect(report.deterministicFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(markdown).toContain("# AI V2.9 Long-run Telemetry Shard");

    const activeSummaries = report.activeRoles.map(name => report.roles[name]);
    expect(activeSummaries.every(role => role.hands > 0)).toBe(true);
    expect(activeSummaries.some(role => role.vpip > 0)).toBe(true);
    expect(activeSummaries.some(role => role.pfr > 0)).toBe(true);
    expect(activeSummaries.every(role => Number.isFinite(role.bb100))).toBe(true);
  });
});
