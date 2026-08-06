import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "telemetry-shards");
const outputDirectory = resolve(process.argv[3] || "telemetry-summary");
const expectedHands = Math.max(
  0,
  Number.parseInt(process.env.AI_LONG_RUN_EXPECTED_HANDS || "0", 10) || 0,
);
const TARGETS = ["Pao", "Shark", "Oracle", "Chronos"];

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function emptyRole() {
  return {
    targetedDecisions: 0,
    v292Decisions: 0,
    adjustedDecisions: 0,
    fallbackDecisions: 0,
    nonPublicDecisions: 0,
    adjustments: {},
  };
}

function addRole(target, source = {}) {
  for (const field of [
    "targetedDecisions",
    "v292Decisions",
    "adjustedDecisions",
    "fallbackDecisions",
    "nonPublicDecisions",
  ]) {
    target[field] += Number(source[field]) || 0;
  }
  for (const [name, count] of Object.entries(source.adjustments || {})) {
    target.adjustments[name] = (target.adjustments[name] || 0) + (Number(count) || 0);
  }
}

if (!statSync(inputDirectory).isDirectory()) {
  throw new Error(`Telemetry input is not a directory: ${inputDirectory}`);
}

const files = walk(inputDirectory)
  .filter(path => /^ai-long-run-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No telemetry shard JSON files found under ${inputDirectory}`);

const totals = {
  version: "2.9.2",
  shards: files.length,
  expectedHands,
  targetedDecisions: 0,
  v292Decisions: 0,
  adjustedDecisions: 0,
  fallbackDecisions: 0,
  nonPublicDecisions: 0,
  byRole: Object.fromEntries(TARGETS.map(name => [name, emptyRole()])),
};
const errors = [];

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const evidence = report.strategyEvidence;
  const label = basename(path);
  if (!evidence || evidence.version !== "2.9.2" || evidence.observerActive !== true) {
    errors.push(`${label}: missing active V2.9.2 strategy evidence`);
    continue;
  }

  for (const field of [
    "targetedDecisions",
    "v292Decisions",
    "adjustedDecisions",
    "fallbackDecisions",
    "nonPublicDecisions",
  ]) {
    totals[field] += Number(evidence[field]) || 0;
  }
  if ((Number(evidence.v292Decisions) || 0) !== (Number(evidence.targetedDecisions) || 0)) {
    errors.push(`${label}: V2.9.2 coverage ${evidence.v292Decisions}/${evidence.targetedDecisions}`);
  }
  if (Number(evidence.fallbackDecisions) || 0) {
    errors.push(`${label}: fallback decisions ${evidence.fallbackDecisions}`);
  }
  if (Number(evidence.nonPublicDecisions) || 0) {
    errors.push(`${label}: non-public decisions ${evidence.nonPublicDecisions}`);
  }

  for (const name of TARGETS) addRole(totals.byRole[name], evidence.byRole?.[name]);
}

if (totals.targetedDecisions <= 0) errors.push("no calibrated-role decisions were observed");
if (totals.v292Decisions !== totals.targetedDecisions) {
  errors.push(`aggregate V2.9.2 coverage ${totals.v292Decisions}/${totals.targetedDecisions}`);
}
if (totals.fallbackDecisions) errors.push(`aggregate fallback decisions ${totals.fallbackDecisions}`);
if (totals.nonPublicDecisions) errors.push(`aggregate non-public decisions ${totals.nonPublicDecisions}`);

const fullEvidence = expectedHands >= 25_000;
if (fullEvidence) {
  if (totals.adjustedDecisions <= 0) {
    errors.push("full run produced no V2.9.2 calibration adjustments");
  }
  for (const name of TARGETS) {
    const role = totals.byRole[name];
    if (role.v292Decisions <= 0) errors.push(`${name}: no V2.9.2 decisions observed`);
    if (role.adjustedDecisions <= 0) errors.push(`${name}: no V2.9.2 calibration adjustment observed`);
  }
}

totals.fullEvidence = fullEvidence;
totals.validationPassed = errors.length === 0;
totals.validationErrors = errors;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  join(outputDirectory, "ai-v2-9-2-strategy-evidence.json"),
  `${JSON.stringify(totals, null, 2)}\n`,
  "utf8",
);

console.log("# AI V2.9.2 strategy evidence");
console.log(`- Shards: ${totals.shards}`);
console.log(`- Targeted decisions: ${totals.targetedDecisions}`);
console.log(`- V2.9.2 decisions: ${totals.v292Decisions}`);
console.log(`- Adjusted decisions: ${totals.adjustedDecisions}`);
for (const name of TARGETS) {
  const role = totals.byRole[name];
  console.log(`- ${name}: ${role.v292Decisions} V2.9.2 decisions; ${role.adjustedDecisions} adjusted`);
}
console.log(`- Validation: ${errors.length ? "failed" : "passed"}`);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
