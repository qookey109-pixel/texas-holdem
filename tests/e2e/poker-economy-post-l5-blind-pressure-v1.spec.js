import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const ENABLED = process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE === "1";
const POLICY = String(process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE_POLICY || "frozen-l5");
const PROFILE = String(process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE_PROFILE || "balanced");
const requestedHands = Number.parseInt(process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE_HANDS || "250", 10);
const HANDS = Number.isInteger(requestedHands) ? Math.min(1_000, Math.max(1, requestedHands)) : 250;
const PAIR_INDEX = Math.max(0, Number.parseInt(process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE_PAIR || "0", 10) || 0);
const BASE_SEED = Number.parseInt(process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE_SEED_BASE || "26893246", 10) || 26893246;
const OUTPUT_DIRECTORY = resolve(process.env.POKER_ECONOMY_POST_L5_BLIND_PRESSURE_OUTPUT_DIR || "poker-economy-post-l5-blind-pressure-results");
const LAB_PARTS = [1, 2, 3, 4].map(index => resolve(`tests/support/ai-long-run-telemetry-v2-9.part-${index}`));
const INTEGRITY_SCRIPT = resolve("tests/support/ai-long-run-telemetry-integrity-v2-9-4.js");
const ADAPTER_SCRIPT = resolve("tests/support/poker-economy-post-l5-blind-pressure-v1.js");
const TIMEOUT_MS = Math.min(55 * 60_000, Math.max(120_000, HANDS * 2_500));
const ALLOWED_PROFILES = new Set(["tight", "balanced", "calling"]);
const ALLOWED_POLICIES = new Set(["frozen-l5", "slow-post-l5"]);

function safeProfile(value) {
  return ALLOWED_PROFILES.has(value) ? value : "balanced";
}

function safePolicy(value) {
  return ALLOWED_POLICIES.has(value) ? value : "frozen-l5";
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
      replacement: "        if (state.handOver && finalValidation.totalChips === expectedChips) {\n          window.PokerEconomyPostL5BlindPressureV1?.recordHandSnapshot?.(state.players, bigBlind);\n          handsCompleted += 1;\n        }",
    },
    {
      target: "        cleanupTimers();\n        activeHand = null;",
      replacement: "        window.AiLongRunTelemetryIntegrityV294?.finalizeHand?.();\n        cleanupTimers();\n        activeHand = null;",
    },
  ];

  let output = source;
  for (const { target, replacement } of replacements) {
    const matches = output.split(target).length - 1;
    if (matches !== 1) throw new Error(`Post-L5 hook target count ${matches}: ${target.slice(0, 80)}`);
    output = output.replace(target, replacement);
  }
  return output;
}

test.describe("Poker Economy Slow Post-L5 Blind Pressure Benchmark V1", () => {
  test.skip(!ENABLED, "Run with POKER_ECONOMY_POST_L5_BLIND_PRESSURE=1");
  test.setTimeout(TIMEOUT_MS);

  test(`evaluates ${safePolicy(POLICY)} / ${safeProfile(PROFILE)} / pair ${PAIR_INDEX} for ${HANDS} hands`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1_150);
    await expect.poll(() => page.evaluate(() => window.AiTierStrategyV292?.version || ""), { timeout: 15_000 }).toBe("2.9.2");
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV294?.version || ""), { timeout: 15_000 }).toBe("2.9.4");
    await expect.poll(() => page.evaluate(() => window.AiOpeningBalanceV295?.version || ""), { timeout: 15_000 }).toBe("2.9.5");
    await expect.poll(() => page.evaluate(() => window.ReplacementStackBalance?.version || ""), { timeout: 15_000 }).toBe("2.1.0");
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
    await expect.poll(() => page.evaluate(() => window.PokerEconomyPostL5BlindPressureV1?.version || ""), { timeout: 10_000 }).toBe("1.0.0");

    await page.evaluate(() => {
      window.EconomyFoldDefenseV1?.refresh?.();
      window.AiTierStrategyV292?.resetRuntimeEvidence?.();
      window.AiOpeningBalanceV295?.resetRuntimeEvidence?.();
      window.AiLongRunTelemetryIntegrityV294?.reset?.();
      window.PokerEconomyPostL5BlindPressureV1?.resetTelemetry?.();
    });

    const policy = safePolicy(POLICY);
    const installed = await page.evaluate(id => window.PokerEconomyPostL5BlindPressureV1.install(id), policy);
    expect(installed).toMatchObject({
      version: "1.0.0",
      schemaVersion: 1,
      installed: true,
      experimentOnly: true,
      productionSourceUnchanged: true,
      productionConfigUnchanged: true,
      publicInformationOnly: true,
      policy: { id: policy },
    });

    const levelSanity = await page.evaluate(() => ({
      h21: window.PokerEconomyPostL5BlindPressureV1.levelForHand(21),
      h70: window.PokerEconomyPostL5BlindPressureV1.levelForHand(70),
      h71: window.PokerEconomyPostL5BlindPressureV1.levelForHand(71),
      h121: window.PokerEconomyPostL5BlindPressureV1.levelForHand(121),
      h171: window.PokerEconomyPostL5BlindPressureV1.levelForHand(171),
      h221: window.PokerEconomyPostL5BlindPressureV1.levelForHand(221),
    }));
    expect(levelSanity.h21.big).toBe(400);
    expect(levelSanity.h70.big).toBe(400);
    if (policy === "slow-post-l5") {
      expect(levelSanity.h71).toMatchObject({ level: 6, small: 250, big: 500, buyIn: 18750 });
      expect(levelSanity.h121).toMatchObject({ level: 7, small: 300, big: 600, buyIn: 22500 });
      expect(levelSanity.h171).toMatchObject({ level: 8, small: 400, big: 800, buyIn: 30000 });
      expect(levelSanity.h221).toMatchObject({ level: 9, small: 500, big: 1000, buyIn: 37500 });
    } else {
      expect(levelSanity.h221.big).toBe(400);
    }

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
    report.postL5BlindPressure = await page.evaluate(() => window.PokerEconomyPostL5BlindPressureV1?.snapshot?.() || null);
    report.postL5BlindPressure.profile = profile;
    report.postL5BlindPressure.pairIndex = PAIR_INDEX;

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = resolve(
      OUTPUT_DIRECTORY,
      `poker-economy-post-l5-${policy}-${profile}-pair-${PAIR_INDEX}.json`,
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
      postL5BlindPressure: {
        version: "1.0.0",
        schemaVersion: 1,
        experimentOnly: true,
        productionSourceUnchanged: true,
        productionConfigUnchanged: true,
        publicInformationOnly: true,
        hiddenOpponentCards: false,
        actualDeckOrder: false,
        futureBoardAnswer: false,
        predeterminedWinner: false,
        policy: { id: policy },
        handSampleCount: HANDS,
        scheduleMismatchCount: 0,
        post70ReplacementDepthViolations: 0,
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.schedulerErrors).toEqual([]);
    expect(report.postL5BlindPressure.productionConfig?.tableMedianRatio).toBe(0.80);
    expect(report.postL5BlindPressure.productionConfig?.buyInRatioCap).toBe(0.75);
    expect(report.postL5BlindPressure.productionConfig?.softFloorBigBlinds).toBe(12);
    expect(report.postL5BlindPressure.productionConfig?.maxBigBlinds).toBe(60);
    if (policy === "slow-post-l5") {
      expect(report.postL5BlindPressure.maximumObservedBigBlind).toBe(1000);
      expect(report.postL5BlindPressure.observedLevels).toContain(9);
    } else {
      expect(report.postL5BlindPressure.maximumObservedBigBlind).toBe(400);
      expect(report.postL5BlindPressure.observedLevels).not.toContain(6);
    }
    expect(pageErrors).toEqual([]);
  });
});
