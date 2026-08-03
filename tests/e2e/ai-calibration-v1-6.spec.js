import { expect, test } from "@playwright/test";

const CALIBRATION_SCRIPT = "/tests/support/ai-calibration-lab-v1.js";
const NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"];

async function loadCalibrationLab(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV15?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.5.0");
  await page.addScriptTag({ url: CALIBRATION_SCRIPT });
  await expect.poll(
    () => page.evaluate(() => window.AiCalibrationLab?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");
}

function average(report, names, selector) {
  return names.reduce((sum, name) => sum + selector(report, name), 0) / names.length;
}

function expectRate(value) {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(1);
}

test("V1.6 固定種子校準矩陣產生可重現的角色頻率報表", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await loadCalibrationLab(page);

  const report = await page.evaluate(() => window.AiCalibrationLab.run({
    seed: 1604,
    postflopIterations: 24,
  }));
  const markdown = await page.evaluate(value => window.AiCalibrationLab.toMarkdown(value), report);

  await testInfo.attach("ai-calibration-v1-6.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("ai-calibration-v1-6.md", {
    body: markdown,
    contentType: "text/markdown",
  });

  expect(report).toMatchObject({
    schemaVersion: 1,
    labVersion: "1.0.0",
    strategyVersions: {
      preflop: "1.2.0",
      adaptive: "1.3.0",
      multiway: "1.5.0",
    },
    seed: 1604,
    handClassCount: 169,
    weightedCombinationCount: 1326,
    postflopIterations: 24,
    supportedNames: NAMES,
  });

  expect(report.fairness).toEqual({
    hiddenOpponentCardRead: false,
    containsDeck: false,
    containsOpponentCards: false,
    containsFutureBoard: false,
  });

  for (const name of NAMES) {
    const preflop = report.preflop[name];
    const postflop = report.postflop[name];
    expect(preflop).toBeTruthy();
    expect(postflop).toBeTruthy();

    for (const position of ["UTG", "CO", "BTN", "SB"]) {
      expectRate(preflop.openByPosition[position].openRate);
      expectRate(preflop.openByPosition[position].vpipRate);
      expect(preflop.openByPosition[position].averageRaiseBy).toBeGreaterThanOrEqual(0);
    }
    expect(preflop.openByPosition.BTN.openRate)
      .toBeGreaterThanOrEqual(preflop.openByPosition.UTG.openRate);

    expectRate(preflop.versusOpen.foldRate);
    expectRate(preflop.versusOpen.callRate);
    expectRate(preflop.versusOpen.threeBetRate);
    expectRate(preflop.versusThreeBet.foldRate);
    expectRate(preflop.versusThreeBet.continueRate);
    expectRate(preflop.versusThreeBet.fourBetRate);
    expectRate(preflop.versusThreeBet.premiumContinueRate);
    expectRate(preflop.squeezeRate);
    expect(preflop.versusThreeBet.premiumContinueRate).toBeGreaterThanOrEqual(0.85);

    for (const key of [
      "airAggressionRate",
      "drawAggressionRate",
      "thinValueAggressionRate",
      "bluffCatchContinueRate",
      "multiwayAirAggressionRate",
      "multiwayValueAggressionRate",
    ]) {
      expectRate(postflop[key]);
    }
    expect(postflop.multiwayAirAggressionRate)
      .toBeLessThanOrEqual(postflop.airAggressionRate + 0.001);
    expect(postflop.multiwayValueAggressionRate)
      .toBeGreaterThanOrEqual(postflop.multiwayAirAggressionRate);
  }

  const aggressive = ["Momo", "Nova", "Vlad"];
  const conservative = ["Bruno", "Dodo"];
  expect(average(report, aggressive, (value, name) => value.preflop[name].openByPosition.BTN.openRate))
    .toBeGreaterThan(average(report, conservative, (value, name) => value.preflop[name].openByPosition.BTN.openRate));
  expect(average(report, aggressive, (value, name) => value.preflop[name].versusOpen.threeBetRate))
    .toBeGreaterThan(average(report, conservative, (value, name) => value.preflop[name].versusOpen.threeBetRate));

  const uniqueFingerprints = new Set(NAMES.map(name => report.preflop[name].fingerprint));
  expect(uniqueFingerprints.size).toBeGreaterThanOrEqual(6);
  expect(report.supportedNames).not.toContain("Oracle");
  expect(report.supportedNames).not.toContain("Chronos");
  expect(report.supportedNames).not.toContain("Gemini");
  expect(markdown).toContain("# AI Calibration V1.6");
  expect(markdown).toContain("| Momo |");
});

test("相同種子與輸入會得到完全相同的校準結果", async ({ page }) => {
  test.setTimeout(90_000);
  await loadCalibrationLab(page);

  const result = await page.evaluate(() => {
    const options = { seed: 778899, handClassLimit: 40, postflopIterations: 6 };
    const first = window.AiCalibrationLab.run(options);
    const second = window.AiCalibrationLab.run(options);
    return {
      first: JSON.stringify(first),
      second: JSON.stringify(second),
    };
  });

  expect(result.first).toBe(result.second);
});
