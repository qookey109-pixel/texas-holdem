import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const RUNNER = "scripts/long-session-bankroll-excluded-promotion-ab.mjs";
const RUNTIME = "js/long-session-mode-v1.js";
const ARMS = [
  { label: "total_wealth_control", rule: "total-wealth" },
  { label: "bankroll_excluded", rule: "table-stack-only" },
];

test.describe("Long Session bankroll-excluded promotion A/B", () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(20 * 60 * 1000);

  test("compares reserve-preserving promotion on 16 fresh seeds", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Dedicated deterministic evidence runs once in Chromium only.");

    const summaries = [];

    for (const arm of ARMS) {
      const result = spawnSync("node", [RUNNER], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CI: "",
          LONG_SESSION_BALANCED_HANDS: "60",
          VARIANT_LABEL: arm.label,
          PROMOTION_RULE: arm.rule,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 16 * 1024 * 1024,
      });

      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      expect(result.error, `${arm.label} runner process error`).toBeUndefined();
      expect(result.status, `${arm.label} runner exit status`).toBe(0);

      const runtimeDiff = spawnSync("git", ["diff", "--exit-code", "--", RUNTIME], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      if (runtimeDiff.stdout) process.stdout.write(runtimeDiff.stdout);
      if (runtimeDiff.stderr) process.stderr.write(runtimeDiff.stderr);
      expect(runtimeDiff.status, `${arm.label} must restore product runtime`).toBe(0);

      const summaryPath = `bankroll-excluded-summary-${arm.label}.json`;
      expect(fs.existsSync(summaryPath), `${arm.label} summary exists`).toBe(true);
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      summaries.push(summary);
      await testInfo.attach(summaryPath, {
        body: Buffer.from(JSON.stringify(summary, null, 2)),
        contentType: "application/json",
      });
    }

    const byLabel = Object.fromEntries(summaries.map(row => [row.label, row]));
    const control = byLabel.total_wealth_control;
    const treatment = byLabel.bankroll_excluded;

    expect(control).toBeTruthy();
    expect(treatment).toBeTruthy();
    expect(control.rule).toBe("total-wealth");
    expect(treatment.rule).toBe("table-stack-only");

    for (const row of summaries) {
      expect(row.freshSeedFirst).toBe(1279545189);
      expect(row.freshSeedLast).toBe(1279545204);
      expect(row.seeds).toBe(16);
      expect(row.failures).toBe(0);
      expect(row.schedulerErrors).toBe(0);
      expect(row.promotionViolations).toBe(0);
      expect(row.allInitialBankroll2000).toBe(true);
    }
    expect(treatment.reserveErosionMoveUps).toBe(0);

    const aggregate = {
      evidenceKind: "fresh-disjoint-bankroll-excluded-promotion-ab",
      primaryEndpoint: "reachedT3Seeds",
      freshSeedFirst: 1279545189,
      freshSeedLast: 1279545204,
      control: {
        reachedT3Seeds: control.reachedT3Seeds,
        reachedFinalTableSeeds: control.reachedFinalTableSeeds,
        meanHandsCompleted: control.meanHandsCompleted,
        movedUpSeeds: control.movedUpSeeds,
        reentrySeeds: control.reentrySeeds,
        meanExposure: control.meanExposure,
        reserveErosionMoveUps: control.reserveErosionMoveUps,
      },
      treatment: {
        reachedT3Seeds: treatment.reachedT3Seeds,
        reachedFinalTableSeeds: treatment.reachedFinalTableSeeds,
        meanHandsCompleted: treatment.meanHandsCompleted,
        movedUpSeeds: treatment.movedUpSeeds,
        reentrySeeds: treatment.reentrySeeds,
        meanExposure: treatment.meanExposure,
        reserveErosionMoveUps: treatment.reserveErosionMoveUps,
      },
      delta: {
        reachedT3Seeds: treatment.reachedT3Seeds - control.reachedT3Seeds,
        reachedFinalTableSeeds: treatment.reachedFinalTableSeeds - control.reachedFinalTableSeeds,
        meanHandsCompleted: Number((treatment.meanHandsCompleted - control.meanHandsCompleted).toFixed(3)),
        movedUpSeeds: treatment.movedUpSeeds - control.movedUpSeeds,
        reentrySeeds: treatment.reentrySeeds - control.reentrySeeds,
        meanExposure: Number((treatment.meanExposure - control.meanExposure).toFixed(6)),
      },
      treatmentPreservesOrImprovesPrimaryT3: treatment.reachedT3Seeds >= control.reachedT3Seeds,
      treatmentPreservesBankrollOnMoveUp: treatment.reserveErosionMoveUps === 0,
      manualGate8Candidate: treatment.reachedT3Seeds >= control.reachedT3Seeds
        && treatment.reserveErosionMoveUps === 0,
      productionDecisionAuthorized: false,
      interpretation: "design-pacing-only",
      notNormalBugEvidence: true,
    };

    console.log(`LONG_SESSION_BANKROLL_EXCLUDED_AGGREGATE ${JSON.stringify(aggregate)}`);
    await testInfo.attach("bankroll-excluded-ab-aggregate.json", {
      body: Buffer.from(JSON.stringify(aggregate, null, 2)),
      contentType: "application/json",
    });

    expect(aggregate.productionDecisionAuthorized).toBe(false);
    expect(aggregate.treatmentPreservesBankrollOnMoveUp).toBe(true);
  });
});
