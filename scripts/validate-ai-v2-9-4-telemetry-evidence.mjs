import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "2.9.4";
const WTSD_DEFINITION = "postflop-showdown-hands/showdown-eligible-hands-excluding-preflop-all-in";
const inputDirectory = resolve(process.argv[2] || "telemetry-shards");
const outputDirectory = resolve(process.argv[3] || "telemetry-summary");
const expectedHands = Math.max(
  0,
  Number.parseInt(process.env.AI_LONG_RUN_EXPECTED_HANDS || "0", 10) || 0,
);
const TARGETS = ["Toto", "Foxy", "Leo", "Wolf"];
const FULL_RUN_BOUNDS = Object.freeze({
  Toto: Object.freeze({ vpip: [0.28, 0.54], pfr: [0.06, 0.25], wtsd: [0.10, 0.80] }),
  Foxy: Object.freeze({ vpip: [0.32, 0.58], pfr: [0.15, 0.38], wtsd: [0.10, 0.78] }),
  Leo: Object.freeze({ vpip: [0.32, 0.57], pfr: [0.16, 0.38], wtsd: [0.10, 0.78] }),
  Wolf: Object.freeze({ vpip: [0.28, 0.53], pfr: [0.12, 0.34], wtsd: [0.10, 0.76] }),
});

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
    v294Decisions: 0,
    adjustedDecisions: 0,
    fallbackDecisions: 0,
    publicInformationFailures: 0,
    adjustments: {},
  };
}

function addRole(target, source = {}) {
  for (const field of [
    "targetedDecisions",
    "v294Decisions",
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

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(3)}%`;
}

function checkRange(errors, name, field, value, [minimum, maximum]) {
  if (!Number.isFinite(value)) {
    errors.push(`${name}: ${field} is not finite`);
    return;
  }
  if (value < minimum) {
    errors.push(`${name}: ${field} ${percent(value)} is below ${percent(minimum)}`);
  }
  if (value > maximum) {
    errors.push(`${name}: ${field} ${percent(value)} exceeds ${percent(maximum)}`);
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
  version: VERSION,
  shards: files.length,
  expectedHands,
  targetedDecisions: 0,
  v294Decisions: 0,
  adjustedDecisions: 0,
  fallbackDecisions: 0,
  publicInformationFailures: 0,
  integrityHands: 0,
  byRole: Object.fromEntries(TARGETS.map(name => [name, emptyRole()])),
  roleMetrics: {},
};
const errors = [];

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const label = basename(path);
  const evidence = report.openingBalanceEvidence;
  const integrity = report.telemetryIntegrity;

  if (!evidence || evidence.version !== VERSION || evidence.observerActive !== true) {
    errors.push(`${label}: missing active V2.9.4 opening-balance evidence`);
  } else {
    const targeted = Number(evidence.totalTargetedDecisions) || 0;
    const v294 = Number(evidence.totalV294Decisions) || 0;
    const adjusted = Number(evidence.totalAdjustedDecisions) || 0;
    const fallback = Number(evidence.fallbackDecisions) || 0;
    const publicFailures = Number(evidence.publicInformationFailures) || 0;
    totals.targetedDecisions += targeted;
    totals.v294Decisions += v294;
    totals.adjustedDecisions += adjusted;
    totals.fallbackDecisions += fallback;
    totals.publicInformationFailures += publicFailures;
    if (v294 !== targeted) errors.push(`${label}: V2.9.4 coverage ${v294}/${targeted}`);
    if (fallback) errors.push(`${label}: V2.9.4 fallback decisions ${fallback}`);
    if (publicFailures) errors.push(`${label}: V2.9.4 public-information failures ${publicFailures}`);
    for (const name of TARGETS) addRole(totals.byRole[name], evidence.roles?.[name]);
  }

  if (!integrity || integrity.version !== VERSION) {
    errors.push(`${label}: missing V2.9.4 telemetry-integrity evidence`);
  } else {
    if (integrity.definition !== WTSD_DEFINITION) {
      errors.push(`${label}: unexpected WTSD definition ${integrity.definition || "missing"}`);
    }
    if (integrity.integrityPassed !== true || integrity.errors?.length) {
      errors.push(`${label}: WTSD integrity failed`);
    }
    const integrityHands = Number(integrity.completedHands) || 0;
    const completedHands = Number(report.completedHands) || 0;
    totals.integrityHands += integrityHands;
    if (integrityHands !== completedHands) {
      errors.push(`${label}: integrity hands ${integrityHands}/${completedHands}`);
    }
  }
}

if (totals.targetedDecisions <= 0) errors.push("no V2.9.4 targeted decisions were observed");
if (totals.v294Decisions !== totals.targetedDecisions) {
  errors.push(`aggregate V2.9.4 coverage ${totals.v294Decisions}/${totals.targetedDecisions}`);
}
if (totals.fallbackDecisions) errors.push(`aggregate V2.9.4 fallback decisions ${totals.fallbackDecisions}`);
if (totals.publicInformationFailures) {
  errors.push(`aggregate V2.9.4 public-information failures ${totals.publicInformationFailures}`);
}
if (expectedHands && totals.integrityHands !== expectedHands) {
  errors.push(`aggregate integrity hands ${totals.integrityHands}/${expectedHands}`);
}

const aggregatePath = join(outputDirectory, "ai-long-run-telemetry-v2-9.json");
if (!existsSync(aggregatePath)) {
  errors.push("missing aggregate telemetry report");
} else {
  const aggregate = JSON.parse(readFileSync(aggregatePath, "utf8"));
  if (aggregate.telemetryRevision !== VERSION) {
    errors.push(`aggregate telemetry revision ${aggregate.telemetryRevision || "missing"}`);
  }
  if (aggregate.telemetryIntegrity?.definition !== WTSD_DEFINITION) {
    errors.push("aggregate WTSD definition mismatch");
  }
  if (aggregate.telemetryIntegrity?.validationPassed !== true) {
    errors.push("aggregate WTSD integrity did not pass");
  }

  const fullEvidence = expectedHands >= 25_000;
  if (fullEvidence) {
    if (totals.adjustedDecisions <= 0) {
      errors.push("full run produced no V2.9.4 balance adjustments");
    }
    for (const name of TARGETS) {
      const evidence = totals.byRole[name];
      if (evidence.v294Decisions <= 0) errors.push(`${name}: no V2.9.4 decisions observed`);
      if (evidence.adjustedDecisions <= 0) errors.push(`${name}: no V2.9.4 adjustment observed`);

      const role = aggregate.roles?.[name];
      const bounds = FULL_RUN_BOUNDS[name];
      if (!role || Number(role.hands) <= 0) {
        errors.push(`${name}: no aggregate role metrics`);
        continue;
      }
      const metrics = {
        hands: Number(role.hands) || 0,
        vpip: Number(role.vpip),
        pfr: Number(role.pfr),
        wtsd: Number(role.wtsd),
        legacyWtsd: Number(role.legacyWtsd),
        bb100: Number(role.bb100),
        showdownEligibleHands: Number(role.telemetryIntegrity?.showdownEligibleHands) || 0,
        preflopAllInShowdownHands: Number(role.telemetryIntegrity?.preflopAllInShowdownHands) || 0,
      };
      totals.roleMetrics[name] = metrics;
      checkRange(errors, name, "VPIP", metrics.vpip, bounds.vpip);
      checkRange(errors, name, "PFR", metrics.pfr, bounds.pfr);
      checkRange(errors, name, "WTSD", metrics.wtsd, bounds.wtsd);
      if (metrics.showdownEligibleHands <= 0) {
        errors.push(`${name}: no corrected WTSD opportunities`);
      }
      if (role.telemetryIntegrity?.integrityPassed !== true) {
        errors.push(`${name}: role WTSD integrity failed`);
      }
    }
  }
}

totals.fullEvidence = expectedHands >= 25_000;
totals.wtsdDefinition = WTSD_DEFINITION;
totals.bounds = FULL_RUN_BOUNDS;
totals.validationPassed = errors.length === 0;
totals.validationErrors = errors;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  join(outputDirectory, "ai-v2-9-4-strategy-evidence.json"),
  `${JSON.stringify(totals, null, 2)}\n`,
  "utf8",
);

console.log("# AI V2.9.4 opening balance and WTSD integrity");
console.log(`- Shards: ${totals.shards}`);
console.log(`- Targeted decisions: ${totals.targetedDecisions}`);
console.log(`- V2.9.4 decisions: ${totals.v294Decisions}`);
console.log(`- Adjusted decisions: ${totals.adjustedDecisions}`);
console.log(`- Integrity hands: ${totals.integrityHands}`);
for (const name of TARGETS) {
  const role = totals.byRole[name];
  const metric = totals.roleMetrics[name];
  console.log(`- ${name}: ${role.v294Decisions} decisions; ${role.adjustedDecisions} adjusted${metric ? `; VPIP ${percent(metric.vpip)}; PFR ${percent(metric.pfr)}; WTSD ${percent(metric.wtsd)}` : ""}`);
}
console.log(`- Validation: ${errors.length ? "failed" : "passed"}`);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
