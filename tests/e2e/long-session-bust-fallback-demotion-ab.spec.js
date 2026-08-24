import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const RUNNER = "scripts/long-session-bust-fallback-demotion-ab.mjs";
const RUNTIME = "js/long-session-mode-v1.js";
const EVIDENCE_SPEC = "tests/e2e/long-session-balanced-pacing-evidence-v1.spec.js";
const EXPECTED_PR_BRANCH = "test/long-session-bust-fallback-demotion-v1-20260814";
const shouldRun = process.env.LONG_SESSION_RUN_BUST_FALLBACK_EVIDENCE === "1"
  || process.env.GITHUB_HEAD_REF === EXPECTED_PR_BRANCH;

const ARMS = [
  { label: "current_bust_control", rule: "current-bust" },
  { label: "highest_affordable_fallback", rule: "highest-affordable-fallback" },
];

test.describe("Long Session bust fallback / demotion A/B", () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(20 * 60 * 1000);

  test("compares visible highest-affordable lower-table fallback on 16 fresh seeds", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Dedicated deterministic evidence runs once in Chromium only.");
    test.skip(!shouldRun, "Archived one-off evidence only auto-runs on its preregistered PR branch.");

    const summaries = [];

    for (const arm of ARMS) {
      const result = spawnSync("node", [RUNNER], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CI: "",
          LONG_SESSION_BALANCED_HANDS: "60",
          VARIANT_LABEL: arm.label,
          BUST_RULE: arm.rule,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 24 * 1024 * 1024,
      });

      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      expect(result.error, `${arm.label} runner process error`).toBeUndefined();
      expect(result.status, `${arm.label} runner exit status`).toBe(0);

      for (const file of [RUNTIME, EVIDENCE_SPEC]) {
        const diff = spawnSync("git", ["diff", "--exit-code", "--", file], {
          cwd: process.cwd(),
          encoding: "utf8",
        });
        if (diff.stdout) process.stdout.write(diff.stdout);
        if (diff.stderr) process.stderr.write(diff.stderr);
        expect(diff.status, `${arm.label} must restore ${file}`).toBe(0);
      }

      const summaryPath = `bust-fallback-summary-${arm.label}.json`;
      expect(fs.existsSync(summaryPath), `${arm.label} summary exists`).toBe(true);
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      summaries.push(summary);
      await testInfo.attach(summaryPath, {
        body: Buffer.from(JSON.stringify(summary, null, 2)),
        contentType: "application/json",
      });
    }

    const byLabel = Object.fromEntries(summaries.map(row => [row.label, row]));
    const control = byLabel.current_bust_control;
    const treatment = byLabel.highest_affordable_fallback;

    expect(control).toBeTruthy();
    expect(treatment).toBeTruthy();
    expect(control.rule).toBe("current-bust");
    expect(treatment.rule).toBe("highest-affordable-fallback");

    for (const row of summaries) {
      expect(row.freshSeedFirst).toBe(1279545221);
      expect(row.freshSeedLast).toBe(1279545236);
      expect(row.seeds).toBe(16);
      expect(row.failures).toBe(0);
      expect(row.schedulerErrors).toBe(0);
      expect(row.promotionViolations).toBe(0);
      expect(row.moveDownViolations).toBe(0);
      expect(row.allInitialBankroll2000).toBe(true);
    }
    expect(control.moveDownCount).toBe(0);

    const aggregate = {
      evidenceKind: "fresh-disjoint-bust-fallback-demotion-ab",
      primaryEndpoint: "reachedT3Seeds",
      freshSeedFirst: 1279545221,
      freshSeedLast: 1279545236,
      control: {
        reachedT3Seeds: control.reachedT3Seeds,
        reachedFinalTableSeeds: control.reachedFinalTableSeeds,
        meanHandsCompleted: control.meanHandsCompleted,
        sessionEndedSeeds: control.sessionEndedSeeds,
        movedUpSeeds: control.movedUpSeeds,
        reentrySeeds: control.reentrySeeds,
        moveDownSeeds: control.moveDownSeeds,
        meanExposure: control.meanExposure,
      },
      treatment: {
        reachedT3Seeds: treatment.reachedT3Seeds,
        reachedFinalTableSeeds: treatment.reachedFinalTableSeeds,
        meanHandsCompleted: treatment.meanHandsCompleted,
        sessionEndedSeeds: treatment.sessionEndedSeeds,
        movedUpSeeds: treatment.movedUpSeeds,
        reentrySeeds: treatment.reentrySeeds,
        moveDownSeeds: treatment.moveDownSeeds,
        moveDownCount: treatment.moveDownCount,
        recoveredAfterMoveDownSeeds: treatment.recoveredAfterMoveDownSeeds,
        meanExposure: treatment.meanExposure,
      },
      delta: {
        reachedT3Seeds: treatment.reachedT3Seeds - control.reachedT3Seeds,
        reachedFinalTableSeeds: treatment.reachedFinalTableSeeds - control.reachedFinalTableSeeds,
        meanHandsCompleted: Number((treatment.meanHandsCompleted - control.meanHandsCompleted).toFixed(3)),
        sessionEndedSeeds: treatment.sessionEndedSeeds - control.sessionEndedSeeds,
        movedUpSeeds: treatment.movedUpSeeds - control.movedUpSeeds,
        reentrySeeds: treatment.reentrySeeds - control.reentrySeeds,
        meanExposure: Number((treatment.meanExposure - control.meanExposure).toFixed(6)),
      },
      treatmentPreservesOrImprovesPrimaryT3: treatment.reachedT3Seeds >= control.reachedT3Seeds,
      treatmentImprovesMeanHands: treatment.meanHandsCompleted > control.meanHandsCompleted,
      treatmentDoesNotWorsenSessionEnds: treatment.sessionEndedSeeds <= control.sessionEndedSeeds,
      mechanismCovered: treatment.moveDownSeeds > 0,
      manualGate8Candidate:
        treatment.reachedT3Seeds >= control.reachedT3Seeds
        && treatment.meanHandsCompleted > control.meanHandsCompleted
        && treatment.sessionEndedSeeds <= control.sessionEndedSeeds
        && treatment.moveDownSeeds > 0,
      productionDecisionAuthorized: false,
      interpretation: "design-pacing-only",
      notNormalBugEvidence: true,
    };

    console.log(`LONG_SESSION_BUST_FALLBACK_AGGREGATE ${JSON.stringify(aggregate)}`);
    await testInfo.attach("bust-fallback-demotion-ab-aggregate.json", {
      body: Buffer.from(JSON.stringify(aggregate, null, 2)),
      contentType: "application/json",
    });

    expect(aggregate.productionDecisionAuthorized).toBe(false);
  });
});
