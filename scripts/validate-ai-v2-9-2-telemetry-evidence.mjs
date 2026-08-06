import {
  existsSync,
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
const PARTICIPATION_TIERS = ["middle", "elite"];
const MINIMUM_FULL_RUN_VPIP = 0.03;
const MAXIMUM_FULL_RUN_VPIP = 0.55;
const MINIMUM_FULL_RUN_PFR = 0.01;

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
    publicInformationFailures: 0,
    adjustments: {},
  };
}

function addRole(target, source = {}) {
  for (const field of [
    "targetedDecisions",
    "v292Decisions",
    "adjustedDecisions",
    "fallbackDecisions",
    "publicInformationFailures",
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
  version: "2.9.3",
  shards: files.length,
  expectedHands,
  targetedDecisions: 0,
  v292Decisions: 0,
  adjustedDecisions: 0,
  fallbackDecisions: 0,
  publicInformationFailures: 0,
  byRole: Object.fromEntries(TARGETS.map(name => [name, emptyRole()])),
  tierParticipation: {},
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

  const targeted = Number(evidence.totalTargetedDecisions) || 0;
  const v292 = Number(evidence.totalV292Decisions) || 0;
  const adjusted = Number(evidence.totalAdjustedDecisions) || 0;
  const fallback = Number(evidence.fallbackDecisions) || 0;
  const publicFailures = Number(evidence.publicInformationFailures) || 0;
  totals.targetedDecisions += targeted;
  totals.v292Decisions += v292;
  totals.adjustedDecisions += adjusted;
  totals.fallbackDecisions += fallback;
  totals.publicInformationFailures += publicFailures;

  if (v292 !== targeted) errors.push(`${label}: V2.9.2 coverage ${v292}/${targeted}`);
  if (fallback) errors.push(`${label}: fallback decisions ${fallback}`);
  if (publicFailures) errors.push(`${label}: public-information failures ${publicFailures}`);

  for (const name of TARGETS) addRole(totals.byRole[name], evidence.roles?.[name]);
}

if (totals.targetedDecisions <= 0) errors.push("no calibrated-role decisions were observed");
if (totals.v292Decisions !== totals.targetedDecisions) {
  errors.push(`aggregate V2.9.2 coverage ${totals.v292Decisions}/${totals.targetedDecisions}`);
}
if (totals.fallbackDecisions) errors.push(`aggregate fallback decisions ${totals.fallbackDecisions}`);
if (totals.publicInformationFailures) {
  errors.push(`aggregate public-information failures ${totals.publicInformationFailures}`);
}

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

  const aggregatePath = join(outputDirectory, "ai-long-run-telemetry-v2-9.json");
  if (!existsSync(aggregatePath)) {
    errors.push("full run is missing the aggregate telemetry report");
  } else {
    const aggregate = JSON.parse(readFileSync(aggregatePath, "utf8"));
    for (const tier of PARTICIPATION_TIERS) {
      const summary = aggregate.tiers?.[tier] || {};
      const hands = Number(summary.hands) || 0;
      const vpip = Number(summary.vpip) || 0;
      const pfr = Number(summary.pfr) || 0;
      totals.tierParticipation[tier] = { hands, vpip, pfr };
      if (hands <= 0) errors.push(`${tier}: no full-run hands observed`);
      if (vpip < MINIMUM_FULL_RUN_VPIP) {
        errors.push(
          `${tier}: full-run VPIP ${(vpip * 100).toFixed(3)}% is below the ${(MINIMUM_FULL_RUN_VPIP * 100).toFixed(1)}% participation floor`,
        );
      }
      if (vpip > MAXIMUM_FULL_RUN_VPIP) {
        errors.push(
          `${tier}: full-run VPIP ${(vpip * 100).toFixed(3)}% exceeds the ${(MAXIMUM_FULL_RUN_VPIP * 100).toFixed(1)}% participation ceiling`,
        );
      }
      if (pfr < MINIMUM_FULL_RUN_PFR) {
        errors.push(
          `${tier}: full-run PFR ${(pfr * 100).toFixed(3)}% is below the ${(MINIMUM_FULL_RUN_PFR * 100).toFixed(1)}% aggression floor`,
        );
      }
    }
  }
}

totals.fullEvidence = fullEvidence;
totals.minimumFullRunVpip = MINIMUM_FULL_RUN_VPIP;
totals.maximumFullRunVpip = MAXIMUM_FULL_RUN_VPIP;
totals.minimumFullRunPfr = MINIMUM_FULL_RUN_PFR;
totals.validationPassed = errors.length === 0;
totals.validationErrors = errors;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  join(outputDirectory, "ai-v2-9-2-strategy-evidence.json"),
  `${JSON.stringify(totals, null, 2)}\n`,
  "utf8",
);

console.log("# AI V2.9.3 strategy evidence");
console.log(`- Shards: ${totals.shards}`);
console.log(`- Targeted decisions: ${totals.targetedDecisions}`);
console.log(`- V2.9.2 decisions: ${totals.v292Decisions}`);
console.log(`- Adjusted decisions: ${totals.adjustedDecisions}`);
for (const name of TARGETS) {
  const role = totals.byRole[name];
  console.log(`- ${name}: ${role.v292Decisions} V2.9.2 decisions; ${role.adjustedDecisions} adjusted`);
}
for (const tier of PARTICIPATION_TIERS) {
  const participation = totals.tierParticipation[tier];
  if (participation) {
    console.log(
      `- ${tier}: ${participation.hands} hands; VPIP ${(participation.vpip * 100).toFixed(3)}%; PFR ${(participation.pfr * 100).toFixed(3)}%`,
    );
  }
}
console.log(`- Validation: ${errors.length ? "failed" : "passed"}`);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
