import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY === "1";
const POLICY = String(process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY_POLICY || "80-75");
const PROFILE = String(process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY_PROFILE || "balanced");
const requestedHands = Number.parseInt(process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY_HANDS || "250", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 250;
const PAIR_INDEX = Math.max(0, Number.parseInt(process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY_PAIR || "0", 10) || 0);
const BASE_SEED = Number.parseInt(process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY_SEED_BASE || "26893246", 10) || 26893246;
const OUTPUT_DIRECTORY = resolve(process.env.POKER_ECONOMY_SUSTAINED_RUNAWAY_OUTPUT_DIR || "poker-economy-sustained-runaway-results");
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(`tests/support/ai-long-run-telemetry-v2-9.part-${index}`));
const INTEGRITY_SCRIPT = resolve("tests/support/ai-long-run-telemetry-integrity-v2-9-4.js");
const ADAPTER_SCRIPT = resolve("tests/support/poker-economy-sustained-runaway-v1.js");
const TIMEOUT_MS = Math.min(55 * 60_000, Math.max(120_000, HANDS * 2_500));
const ALLOWED_PROFILES = new Set(["tight", "balanced", "calling"]);
const ALLOWED_POLICIES = new Set(["80-75", "sustain5-median100"]);

function safeProfile(value) {
  return ALLOWED_PROFILES.has(value) ? value : "balanced";
}

function safePolicy(value) {
  return ALLOWED_POLICIES.has(value) ? value : "80-75";
}

function injectBenchmarkHooks(source) {
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
      replacement: "        activeHand = createHandState(state.players, bigBlind, heroProfile);\n        window.AiLongRunTelemetryIntegrityV294?.beginHand?.();\n        const expectedChips",
    },
    {
      target: "        if (state.handOver && finalValidation.totalChips === expectedChips) handsCompleted += 1;",
      replacement: "        if (state.handOver && finalValidation.totalChips === expectedChips) {\n          window.PokerEconomySustainedRunawayV1?.recordHandSnapshot?.(state.players, bigBlind);\n          handsCompleted += 1;\n        }",
    },
    {
      target: "        cleanupTimers();\n        activeHand = null;",
      replacement: "        window.AiLongRunTelemetryIntegrityV294?.finalizeHand?.();\n        cleanupTimers();\n        activeHand = null;",
    },
  ];

  let output = source;
  for (const { target, replacement } of replacements) {
    const matches = output.split(target).length - 1;
    if (matches !== 1) throw new Error(`Sustained-runaway hook target count ${matches}: ${target.slice(0, 80)}`);
    output = output.replace(target, replacement);
  }
  return output;
}

test.describe("Poker Economy Sustained Runaway Benchmark V1", () => {
  test.skip(!ENABLED, "Run with POKER_ECONOMY_SUSTAINED_RUNAWAY=1");
  test.setTimeout(TIMEOUT_MS);

  test(`evaluates ${safePolicy(POLICY)} / ${safeProfile(PROFILE)} / pair ${PAIR_INDEX} for ${HANDS} hands`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });

    // Production wrappers schedule native startup callbacks through 900ms.
    // Let them finish before the telemetry lab swaps in its virtual scheduler.
    await page.waitForTimeout(1_150);
    await expect.poll(() => page.evaluate(() => window.AiTierStrategyV292?.version || ""), { timeout: 15_000 }).toBe("2.9.2");
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV294?.version || ""), { timeout: 15_000 }).toBe("2.9.4");
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""), { timeout: 15_000 }).toBe("2.9.5");
    await expect.poll(() => page.evaluate(() => window.EconomyFoldDefenseV1?.version || ""), { timeout: 15_000 }).toBe("1.1.1");
    await expect.poll(() => page.evaluate(() => ({
      v292: document.documentElement.dataset.aiTierStrategyV292 || "",
      v294: document.documentElement.dataset.aiOpeningBalanceV294 || "",
      v295: document.documentElement.dataset.aiOpeningBalanceV295 || "",
      dispatcher: document.documentElement.dataset.aiActionDispatcherV1 || "",
    })), { timeout: 15_000 }).toEqual({
      v292: "ready",
      v294: "ready",
      v295: "ready",
      dispatcher: "ready",
    });

    const integritySource = await readFile(INTEGRITY_SCRIPT, "utf8");
    const adapterSource = await readFile(ADAPTER_SCRIPT, "utf8");
    await page.addScriptTag({ content: integritySource });
    await page.addScriptTag({ content: adapterSource });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.version || ""), { timeout: 10_000 }).toBe("2.9.4");
    await expect.poll(() => page.evaluate(() => window.PokerEconomySustainedRunawayV1?.version || ""), { timeout: 10_000 }).toBe("1.0.0");

    await page.evaluate(() => {
      window.EconomyFoldDefenseV1?.refresh?.();
      window.AiTierStrategyV292?.resetRuntimeEvidence?.();
      window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
      window.AiLongRunTelemetryIntegrityV294?.reset?.();
      window.PokerEconomySustainedRunawayV1?.resetTelemetry?.();
    });

    const policy = safePolicy(POLICY);
    const installed = await page.evaluate(id => window.PokerEconomySustainedRunawayV1.install(id), policy);
    expect(installed).toMatchObject({
      version: "1.0.0",
      schemaVersion: 1,
      installed: true,
      experimentOnly: true,
      productionBehaviorChanged: false,
      productionConfigUnchanged: true,
      publicInformationOnly: true,
      policy: {
        id: policy,
        triggerWindowHands: 50,
        triggerFiveXHands: 10,
        triggerRatio: 5,
        buyInRatioCap: 0.75,
        maxBigBlinds: 60,
      },
    });

    const rawLabSource = (await Promise.all(LAB_PARTS.map(path => readFile(path, "utf8")))).join("");
    await page.addScriptTag({ content: injectBenchmarkHooks(rawLabSource) });
    await expect.poll(() => page.evaluate(() => window.AiLongRunTelemetryV29?.version || ""), { timeout: 10_000 }).toBe("2.9.0");

    const profile = safeProfile(PROFILE);
    const report = await page.evaluate(options => window.AiLongRunTelemetryV29.runShard(options), {
      hands: HANDS,
      shardIndex: PAIR_INDEX,
      shardCount: 4,
      baseSeed: BASE_SEED,
      heroProfileOverride: profile,
    });

    report.telemetryIntegrity = await page.evaluate(() => window.AiLongRunTelemetryIntegrityV294?.snapshot?.({ finalize: true }) || null);
    report.economySustainedRunaway = await page.evaluate(() => window.PokerEconomySustainedRunawayV1?.snapshot?.() || null);
    report.economySustainedRunaway.profile = profile;
    report.economySustainedRunaway.pairIndex = PAIR_INDEX;

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = resolve(
      OUTPUT_DIRECTORY,
      `poker-economy-sustained-${policy}-${profile}-pair-${PAIR_INDEX}.json`,
    );
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
      economySustainedRunaway: {
        version: "1.0.0",
        schemaVersion: 1,
        experimentOnly: true,
        productionBehaviorChanged: false,
        productionConfigUnchanged: true,
        publicInformationOnly: true,
        hiddenOpponentCards: false,
        actualDeckOrder: false,
        futureBoardAnswer: false,
        predeterminedWinner: false,
        policy: { id: policy, maxBigBlinds: 60 },
        handStackSampleCount: HANDS,
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(report.economySustainedRunaway.maximumEntryBb === null || report.economySustainedRunaway.maximumEntryBb <= 60).toBe(true);
    expect(report.economySustainedRunaway.productionConfig?.tableMedianRatio).toBe(0.80);
    expect(report.economySustainedRunaway.productionConfig?.buyInRatioCap).toBe(0.75);
    expect(report.economySustainedRunaway.productionConfig?.softFloorBigBlinds).toBe(12);
    expect(report.economySustainedRunaway.productionConfig?.maxBigBlinds).toBe(60);
    expect(pageErrors).toEqual([]);
  });
});