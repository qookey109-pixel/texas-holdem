import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.AI_HERO_RUNAWAY_VARIANCE_TAIL_AUDIT === "1";
const requestedHands = Number.parseInt(process.env.AI_HERO_RUNAWAY_VARIANCE_TAIL_HANDS || "250", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 250;
const PAIR_INDEX = Math.max(0, Number.parseInt(process.env.AI_HERO_RUNAWAY_VARIANCE_TAIL_PAIR || "0", 10) || 0);
const PROFILE = String(process.env.AI_HERO_RUNAWAY_VARIANCE_TAIL_PROFILE || "balanced");
const BASE_SEED = Number.parseInt(process.env.AI_HERO_RUNAWAY_VARIANCE_TAIL_SEED_BASE || "26893246", 10) || 26893246;
const OUTPUT_DIRECTORY = resolve(process.env.AI_HERO_RUNAWAY_VARIANCE_TAIL_OUTPUT_DIR || "ai-hero-runaway-variance-tail-results");
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(`tests/support/ai-long-run-telemetry-v2-9.part-${index}`));
const INTEGRITY_SCRIPT = resolve("tests/support/ai-long-run-telemetry-integrity-v2-9-4.js");
const AUDIT_SCRIPT = resolve("tests/support/ai-hero-runaway-variance-tail-audit-v1.js");
const TIMEOUT_MS = Math.min(55 * 60_000, Math.max(120_000, HANDS * 2_500));
const ALLOWED_PROFILES = new Set(["tight", "balanced", "calling"]);

function safeProfile(value) {
  return ALLOWED_PROFILES.has(value) ? value : "balanced";
}

function injectAuditHooks(source) {
  const replacements = [
    {
      target: "    const heroProfile = HERO_PROFILES[shardIndex % HERO_PROFILES.length];",
      replacement: "    const heroProfile = String(options.heroProfileOverride || HERO_PROFILES[shardIndex % HERO_PROFILES.length]);",
    },
    {
      target: "    function recordAction(player, action) {\n      const metric = metricFor(player);",
      replacement: "    function recordAction(player, action) {\n      window.AiLongRunTelemetryIntegrityV294?.recordAction?.(player, action);\n      const metric = metricFor(player);",
    },
    {
      target: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        const expectedChips",
      replacement: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        window.AiLongRunTelemetryIntegrityV294?.beginHand?.();\n        window.AiHeroRunawayVarianceTailAuditV1?.recordHandStart?.(state.players, bigBlind, state.handNumber, heroProfile);\n        const expectedChips",
    },
    {
      target: "        if (state.handOver && finalValidation.totalChips === expectedChips) handsCompleted += 1;",
      replacement: "        if (state.handOver && finalValidation.totalChips === expectedChips) {\n          window.AiHeroRunawayVarianceTailAuditV1?.recordHandEnd?.(state.players, bigBlind, state.handNumber, state.winners || [], state.board.length);\n          handsCompleted += 1;\n        }",
    },
    {
      target: "        cleanupTimers();\n        activeHand = null;",
      replacement: "        window.AiLongRunTelemetryIntegrityV294?.finalizeHand?.();\n        cleanupTimers();\n        activeHand = null;",
    },
  ];

  let output = source;
  for (const { target, replacement } of replacements) {
    const matches = output.split(target).length - 1;
    if (matches !== 1) throw new Error(`Variance-tail hook target count ${matches}: ${target.slice(0, 80)}`);
    output = output.replace(target, replacement);
  }
  return output;
}

test.describe("AI Hero runaway variance-tail audit V1", () => {
  test.skip(!ENABLED, "Run with AI_HERO_RUNAWAY_VARIANCE_TAIL_AUDIT=1");
  test.setTimeout(TIMEOUT_MS);

  test(`audits ${safeProfile(PROFILE)} pair ${PAIR_INDEX} for ${HANDS} hands`, async ({ page }) => {
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

    const integritySource = await readFile(INTEGRITY_SCRIPT, "utf8");
    const auditSource = await readFile(AUDIT_SCRIPT, "utf8");
    await page.addScriptTag({ content: integritySource });
    await page.addScriptTag({ content: auditSource });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.version || ""), { timeout: 10_000 }).toBe("2.9.4");
    await expect.poll(() => page.evaluate(() => window.AiHeroRunawayVarianceTailAuditV1?.version || ""), { timeout: 10_000 }).toBe("1.0.0");

    await page.evaluate(() => {
      window.AiTierStrategyV292?.resetRuntimeEvidence?.();
      window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
      window.AiLongRunTelemetryIntegrityV294?.reset?.();
      window.AiHeroRunawayVarianceTailAuditV1?.reset?.();
    });

    const rawLabSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    await page.addScriptTag({ content: injectAuditHooks(rawLabSource) });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""), { timeout: 10_000 }).toBe("2.9.0");

    const profile = safeProfile(PROFILE);
    const report = await page.evaluate(options => window.AiLongRunTelemetryV29.runShard(options), {
      hands: HANDS,
      shardIndex: PAIR_INDEX,
      shardCount: 4,
      baseSeed: BASE_SEED,
      heroProfileOverride: profile,
    });
    report.heroRunawayVarianceTailAudit = await page.evaluate(() => window.AiHeroRunawayVarianceTailAuditV1?.snapshot?.() || null);
    report.telemetryIntegrity = await page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.snapshot?.({ finalize: true }) || null);

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = resolve(OUTPUT_DIRECTORY, `ai-hero-runaway-variance-tail-${profile}-pair-${PAIR_INDEX}.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(report).toMatchObject({
      schemaVersion: 1,
      labVersion: "2.9.0",
      shardIndex: PAIR_INDEX,
      configuredHands: HANDS,
      completedHands: HANDS,
      heroProfile: profile,
      fairness: { publicInformationOnly: true },
      telemetryIntegrity: { integrityPassed: true, errors: [] },
      heroRunawayVarianceTailAudit: {
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
    expect(report.heroRunawayVarianceTailAudit.handsCompleted).toBe(HANDS);
    expect(pageErrors).toEqual([]);
  });
});
