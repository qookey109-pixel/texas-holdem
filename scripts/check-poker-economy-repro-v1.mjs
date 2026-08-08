import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [, , leftPath, rightPath, summaryPath = "economy-ooda-repro/reproducibility-summary.json"] = process.argv;

if (!leftPath || !rightPath) {
  console.error("Usage: node scripts/check-poker-economy-repro-v1.mjs <run-a.json> <run-b.json> [summary.json]");
  process.exit(2);
}

const [left, right] = await Promise.all([
  readFile(resolve(leftPath), "utf8").then(JSON.parse),
  readFile(resolve(rightPath), "utf8").then(JSON.parse),
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function same(leftValue, rightValue) {
  return JSON.stringify(stable(leftValue)) === JSON.stringify(stable(rightValue));
}

const checks = {
  schemaVersion: left.schemaVersion === right.schemaVersion,
  labVersion: left.labVersion === right.labVersion,
  seed: left.seed === right.seed,
  configuredHands: left.configuredHands === right.configuredHands,
  completedHands: left.completedHands === right.completedHands,
  policy: left.economyOoda?.policy?.id === right.economyOoda?.policy?.id,
  deterministicFingerprint: Boolean(left.deterministicFingerprint)
    && left.deterministicFingerprint === right.deterministicFingerprint,
  economyTelemetry: same(left.economyOoda, right.economyOoda),
  telemetryIntegrity: same(left.telemetryIntegrity, right.telemetryIntegrity),
  fairness: left.fairness?.publicInformationOnly === true
    && right.fairness?.publicInformationOnly === true,
  failures: (left.failures?.length || 0) === 0 && (right.failures?.length || 0) === 0,
  schedulerErrors: (left.schedulerErrors?.length || 0) === 0
    && (right.schedulerErrors?.length || 0) === 0,
};

const passed = Object.values(checks).every(Boolean);
const summary = {
  version: "1.0.0",
  passed,
  policy: left.economyOoda?.policy?.id || null,
  seed: left.seed ?? null,
  configuredHands: left.configuredHands ?? null,
  fingerprints: [
    left.deterministicFingerprint || null,
    right.deterministicFingerprint || null,
  ],
  checks,
};

const target = resolve(summaryPath);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

if (!passed) process.exit(1);
