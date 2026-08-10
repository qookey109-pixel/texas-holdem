import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const firstPath = resolve(process.argv[2]);
const secondPath = resolve(process.argv[3]);
const outputPath = resolve(process.argv[4] || "blind-pressure-repro/reproducibility-summary.json");
const first = JSON.parse(readFileSync(firstPath, "utf8"));
const second = JSON.parse(readFileSync(secondPath, "utf8"));

function stable(value) {
  return JSON.stringify(value);
}

const checks = {
  deterministicFingerprint: first.deterministicFingerprint === second.deterministicFingerprint,
  completedHands: first.completedHands === second.completedHands,
  roleCounts: stable(first.roleCounts) === stable(second.roleCounts),
  blindPressure: stable(first.blindPressure) === stable(second.blindPressure),
  telemetryIntegrity: stable(first.telemetryIntegrity) === stable(second.telemetryIntegrity),
  failures: stable(first.failures) === stable(second.failures),
  schedulerErrors: stable(first.schedulerErrors) === stable(second.schedulerErrors),
};
const passed = Object.values(checks).every(Boolean);
const summary = {
  schemaVersion: 1,
  version: "1.0.0",
  passed,
  checks,
  fingerprints: [first.deterministicFingerprint || null, second.deterministicFingerprint || null],
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
if (!passed) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(summary, null, 2));
}
