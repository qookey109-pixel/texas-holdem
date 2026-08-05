import { expect, test } from "@playwright/test";

const ENABLED = process.env.AI_V27_GAMEPLAY_CALIBRATION === "1";
const LAB_SCRIPT = "/tests/support/ai-gameplay-calibration-v2-7.js";
const DETERMINISM_SCRIPT = "/tests/support/ai-gameplay-calibration-v2-7-determinism.js";

function expectRate(value) {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(1);
}

function deterministicRecords(records) {
  return records.map(({ latencyMs, ...record }) => record);
}

test.describe("AI V2.7 gameplay calibration", () => {
  test.skip(!ENABLED, "Run with AI_V27_GAMEPLAY_CALIBRATION=1 or npm run test:ai-calibration:v2.7");

  test("produces a reproducible middle-versus-elite gameplay baseline", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto("/", { waitUntil: "networkidle" });

    await expect.poll(
      () => page.evaluate(() => window.AiMidEliteDecisionChainV27?.version || ""),
      { timeout: 15_000 },
    ).toBe("2.7.0");
    await expect.poll(
      () => page.evaluate(() => document.documentElement.dataset.aiTieredMultiwayEquity || ""),
      { timeout: 15_000 },
    ).toBe("ready");

    await page.addScriptTag({ url: LAB_SCRIPT });
    await page.addScriptTag({ url: DETERMINISM_SCRIPT });
    await expect.poll(
      () => page.evaluate(() => window.AiGameplayCalibrationV27?.version || ""),
      { timeout: 10_000 },
    ).toBe("1.0.0");
    await expect.poll(
      () => page.evaluate(() => window.AiGameplayCalibrationV27?.scenarioVersion || ""),
      { timeout: 10_000 },
    ).toBe("1.0.3");
    await expect.poll(
      () => page.evaluate(() => window.AiGameplayCalibrationV27?.fingerprintVersion || ""),
      { timeout: 10_000 },
    ).toBe("1.0.1");

    const result = await page.evaluate(() => {
      const options = { seeds: [2711, 2717, 2729, 2741, 2753] };
      const first = window.AiGameplayCalibrationV27.run(options);
      const second = window.AiGameplayCalibrationV27.run(options);
      return {
        first,
        secondFingerprint: second.deterministicFingerprint,
        secondRecords: second.records,
        markdown: window.AiGameplayCalibrationV27.toMarkdown(first),
      };
    });

    await testInfo.attach("ai-gameplay-calibration-v2-7.json", {
      body: JSON.stringify(result.first, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("ai-gameplay-calibration-v2-7.md", {
      body: result.markdown,
      contentType: "text/markdown",
    });

    expect(result.first).toMatchObject({
      schemaVersion: 1,
      labVersion: "1.0.0",
      scenarioVersion: "1.0.3",
      fingerprintVersion: "1.0.1",
      scenarioCount: 6,
      roleCount: 10,
      decisionCount: 300,
      versions: {
        decisionChain: "2.7.0",
        tieredEquity: "2.7.0",
      },
      scope: {
        postflopV27DecisionPath: true,
        preflopCompatibilityProbeOnly: true,
        fullGamePreflopTelemetry: false,
      },
      fairness: {
        hiddenOpponentCardRead: false,
        actualDeckRead: false,
        publicInformationOnly: true,
      },
    });

    expect(result.secondFingerprint).toBe(result.first.deterministicFingerprint);
    expect(deterministicRecords(result.secondRecords)).toEqual(
      deterministicRecords(result.first.records),
    );

    const middle = result.first.tiers.middle;
    const elite = result.first.tiers.elite;
    expect(middle.decisions).toBe(180);
    expect(elite.decisions).toBe(120);
    expect(middle.postflopDecisions).toBe(120);
    expect(elite.postflopDecisions).toBe(80);
    expect(middle.averageSamples).toBeGreaterThan(0);
    expect(elite.averageSamples).toBeGreaterThan(middle.averageSamples);
    expect(middle.maximumAbsoluteEquityAdjustment).toBeLessThanOrEqual(0.065001);
    expect(elite.maximumAbsoluteEquityAdjustment).toBeLessThanOrEqual(0.115001);
    expect(middle.publicInformationOnly).toBe(true);
    expect(elite.publicInformationOnly).toBe(true);

    for (const tier of [middle, elite]) {
      expectRate(tier.vpipProxy);
      expectRate(tier.openRaiseProxy);
      expectRate(tier.threeBetProxy);
      for (const rate of Object.values(tier.actionRates)) expectRate(rate);
      const actionTotal = Object.values(tier.actionRates).reduce((sum, rate) => sum + rate, 0);
      expect(actionTotal).toBeCloseTo(1, 3);
      expect(tier.timingMs.median).toBeGreaterThanOrEqual(0);
      expect(tier.timingMs.p95).toBeGreaterThanOrEqual(tier.timingMs.median);
      expect(tier.timingMs.max).toBeGreaterThanOrEqual(tier.timingMs.p95);
    }

    for (const name of ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"]) {
      expect(result.first.roles[name].decisions).toBe(30);
      expect(result.first.roles[name].publicInformationOnly).toBe(true);
    }

    expect(result.first.performance.totalMs).toBeGreaterThan(0);
    expect(result.first.performance.totalMs).toBeLessThan(180_000);
    expect(result.first.deterministicFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(result.markdown).toContain("# AI V2.7 Gameplay Calibration");
    expect(result.markdown).toContain("| middle |");
    expect(result.markdown).toContain("| elite |");
    expect(result.markdown).toContain("compatibility probes only");
  });
});
