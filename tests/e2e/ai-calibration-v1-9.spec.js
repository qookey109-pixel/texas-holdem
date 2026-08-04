import { expect, test } from "@playwright/test";

const CALIBRATION_ENABLED = process.env.AI_V19_CALIBRATION === "1";
const CALIBRATION_SCRIPT = "/tests/support/ai-calibration-lab-v1-9.js";

async function loadCalibrationLab(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.BossEquityIntegrationV1?.version || ""),
    { timeout: 15_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.BossEquityEngineV1?.version || ""),
    { timeout: 15_000 },
  ).toBe("1.0.1");
  await page.addScriptTag({ url: CALIBRATION_SCRIPT });
  await expect.poll(
    () => page.evaluate(() => window.AiCalibrationLabV19?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");
}

function expectRate(value) {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(1);
}

test.describe("AI V1.9 fixed-seed Boss calibration", () => {
  test.skip(!CALIBRATION_ENABLED, "Run with AI_V19_CALIBRATION=1 or npm run test:ai-calibration:v1.9");

  test("produces reproducible action, fairness and performance baselines", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loadCalibrationLab(page);

    const result = await page.evaluate(() => {
      const options = { seed: 1904, iterations: 4 };
      const first = window.AiCalibrationLabV19.run(options);
      const second = window.AiCalibrationLabV19.run(options);
      return {
        first,
        secondFingerprint: second.deterministicFingerprint,
        markdown: window.AiCalibrationLabV19.toMarkdown(first),
      };
    });

    await testInfo.attach("ai-calibration-v1-9.json", {
      body: JSON.stringify(result.first, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("ai-calibration-v1-9.md", {
      body: result.markdown,
      contentType: "text/markdown",
    });

    expect(result.first).toMatchObject({
      schemaVersion: 1,
      labVersion: "1.0.0",
      seed: 1904,
      iterations: 4,
      versions: {
        integration: "1.0.0",
        equityEngine: "1.0.1",
        evAccounting: "1.0.1",
      },
    });
    expect(result.secondFingerprint).toBe(result.first.deterministicFingerprint);

    expect(result.first.probes.exactRiverHeadsUp).toEqual({
      method: "exact-river-heads-up",
      combinations: 990,
      equity: 1,
    });
    expect(result.first.probes.oracleMultiway).toMatchObject({
      method: "joint-multiway-monte-carlo",
      samples: 360,
      opponentCount: 3,
    });
    expect(result.first.probes.chronosMultiway).toMatchObject({
      method: "joint-multiway-monte-carlo",
      samples: 480,
      opponentCount: 3,
    });

    expect(result.first.fairness).toEqual({
      hiddenOpponentCardRead: false,
      containsDeck: false,
      containsOpponentCards: false,
      containsFutureBoard: false,
      publicInformationOnly: true,
    });

    for (const name of ["Oracle", "Chronos"]) {
      const scenarios = result.first.characters[name];
      expect(Object.keys(scenarios)).toHaveLength(4);
      for (const value of Object.values(scenarios)) {
        for (const rate of Object.values(value.rates)) expectRate(rate);
        const totalRate = Object.values(value.rates).reduce((sum, rate) => sum + rate, 0);
        expect(totalRate).toBeCloseTo(1, 3);
        expect(value.averageEquity).toBeGreaterThanOrEqual(0);
        expect(value.averageEquity).toBeLessThanOrEqual(1);
        expect(value.fallbackCount).toBe(0);
        expect(value.timingMs.median).toBeGreaterThanOrEqual(0);
        expect(value.timingMs.p95).toBeGreaterThanOrEqual(value.timingMs.median);
        expect(value.timingMs.max).toBeGreaterThanOrEqual(value.timingMs.p95);
      }

      const nutValue = scenarios["river-nuts-facing-bet"];
      expect(nutValue.rates.raise).toBeGreaterThanOrEqual(0.75);
      expect(nutValue.rates.call).toBeLessThanOrEqual(0.25);
    }

    expect(result.first.performance.totalMs).toBeGreaterThan(0);
    expect(result.first.performance.totalMs).toBeLessThan(180_000);
    expect(result.markdown).toContain("# AI Calibration V1.9");
    expect(result.markdown).toContain("| Oracle |");
    expect(result.markdown).toContain("| Chronos |");
    expect(result.markdown).toContain("990");
  });
});
