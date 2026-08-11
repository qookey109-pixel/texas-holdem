import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "stack-pressure-results");
const outputDirectory = resolve(process.argv[3] || "stack-pressure-summary");
const BUCKETS = ["under3", "lead3to5", "lead5plus"];
const ACTIONS = ["fold", "check", "call", "raise", "allin"];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator, 6) : 0;
}

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

function emptyBucket() {
  return {
    actions: 0,
    facingBetActions: 0,
    freeActions: 0,
    foldsFacingBet: 0,
    callsFacingBet: 0,
    raisesFacingBet: 0,
    checksFree: 0,
    raisesFree: 0,
    aggressiveActions: 0,
    strongActions: 0,
    strongPassiveActions: 0,
    strengthTotal: 0,
    ratioTotal: 0,
    actionCounts: Object.fromEntries(ACTIONS.map(action => [action, 0])),
  };
}

const files = walk(inputDirectory)
  .filter(path => /^poker-stack-pressure-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No stack-pressure diagnostic JSON found under ${inputDirectory}`);

const aggregate = Object.fromEntries(BUCKETS.map(name => [name, emptyBucket()]));
let completedHands = 0;
let configuredHands = 0;
let failures = 0;
let schedulerErrors = 0;
let fairnessFailures = 0;
let behaviorMutationFailures = 0;
let maximumHeroLeadRatio = 0;

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  completedHands += finite(report.completedHands);
  configuredHands += finite(report.configuredHands);
  failures += report.failures?.length || 0;
  schedulerErrors += report.schedulerErrors?.length || 0;
  if (!report.fairness?.publicInformationOnly || !report.stackPressureDiagnostic?.publicInformationOnly) fairnessFailures += 1;
  if (report.stackPressureDiagnostic?.behaviorChanged) behaviorMutationFailures += 1;
  maximumHeroLeadRatio = Math.max(maximumHeroLeadRatio, finite(report.stackPressureDiagnostic?.maximumHeroLeadRatio));

  for (const name of BUCKETS) {
    const source = report.stackPressureDiagnostic?.buckets?.[name] || {};
    const target = aggregate[name];
    for (const key of [
      "actions", "facingBetActions", "freeActions", "foldsFacingBet", "callsFacingBet", "raisesFacingBet",
      "checksFree", "raisesFree", "aggressiveActions", "strongActions", "strongPassiveActions",
      "strengthTotal", "ratioTotal",
    ]) target[key] += finite(source[key]);
    for (const action of ACTIONS) target.actionCounts[action] += finite(source.actionCounts?.[action]);
  }
}

function summarize(bucket) {
  return {
    ...bucket,
    aggressionRate: rate(bucket.aggressiveActions, bucket.actions),
    foldFacingBetRate: rate(bucket.foldsFacingBet, bucket.facingBetActions),
    callFacingBetRate: rate(bucket.callsFacingBet, bucket.facingBetActions),
    raiseFacingBetRate: rate(bucket.raisesFacingBet, bucket.facingBetActions),
    checkFreeRate: rate(bucket.checksFree, bucket.freeActions),
    raiseFreeRate: rate(bucket.raisesFree, bucket.freeActions),
    strongPassiveRate: rate(bucket.strongPassiveActions, bucket.strongActions),
    averageStrength: rate(bucket.strengthTotal, bucket.actions),
    averageHeroLeadRatio: rate(bucket.ratioTotal, bucket.actions),
  };
}

const buckets = Object.fromEntries(BUCKETS.map(name => [name, summarize(aggregate[name])]));
const baseline = buckets.under3;
const lead5 = buckets.lead5plus;
const enoughLead5 = lead5.actions >= 100 && lead5.facingBetActions >= 30;
const diagnostics = {
  enoughLead5Sample: enoughLead5,
  aggressionDeltaLead5VsUnder3: round(lead5.aggressionRate - baseline.aggressionRate, 6),
  foldFacingBetDeltaLead5VsUnder3: round(lead5.foldFacingBetRate - baseline.foldFacingBetRate, 6),
  raiseFacingBetDeltaLead5VsUnder3: round(lead5.raiseFacingBetRate - baseline.raiseFacingBetRate, 6),
  strongPassiveDeltaLead5VsUnder3: round(lead5.strongPassiveRate - baseline.strongPassiveRate, 6),
};

diagnostics.stackPressurePassivitySignal = enoughLead5 && (
  diagnostics.aggressionDeltaLead5VsUnder3 <= -0.04
  || diagnostics.foldFacingBetDeltaLead5VsUnder3 >= 0.06
  || diagnostics.strongPassiveDeltaLead5VsUnder3 >= 0.06
);

const summary = {
  version: "1.0.0",
  shards: files.length,
  configuredHands,
  completedHands,
  failures,
  schedulerErrors,
  fairnessFailures,
  behaviorMutationFailures,
  maximumHeroLeadRatio: round(maximumHeroLeadRatio, 6),
  buckets,
  diagnostics,
  gatesPassed: completedHands === configuredHands
    && failures === 0
    && schedulerErrors === 0
    && fairnessFailures === 0
    && behaviorMutationFailures === 0,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "poker-stack-pressure-diagnostic-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
const markdown = [
  "# Poker Stack Pressure Diagnostic V1",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Shards: ${files.length}`,
  `- Gates: ${summary.gatesPassed ? "PASS" : "FAIL"}`,
  `- Max Hero lead: ${summary.maximumHeroLeadRatio}x`,
  `- >=5x sample sufficient: ${diagnostics.enoughLead5Sample ? "YES" : "NO"}`,
  `- Passivity signal: ${diagnostics.stackPressurePassivitySignal ? "YES" : "NO"}`,
  "",
  "| Bucket | Actions | Aggression | Fold facing bet | Raise facing bet | Strong passive |",
  "|---|---:|---:|---:|---:|---:|",
  ...BUCKETS.map(name => {
    const b = buckets[name];
    return `| ${name} | ${b.actions} | ${b.aggressionRate} | ${b.foldFacingBetRate} | ${b.raiseFacingBetRate} | ${b.strongPassiveRate} |`;
  }),
  "",
  "## Lead5 vs under3 deltas",
  "",
  `- aggression: ${diagnostics.aggressionDeltaLead5VsUnder3}`,
  `- fold facing bet: ${diagnostics.foldFacingBetDeltaLead5VsUnder3}`,
  `- raise facing bet: ${diagnostics.raiseFacingBetDeltaLead5VsUnder3}`,
  `- strong passive: ${diagnostics.strongPassiveDeltaLead5VsUnder3}`,
  "",
].join("\n");
writeFileSync(join(outputDirectory, "poker-stack-pressure-diagnostic-v1.md"), markdown, "utf8");

if (!summary.gatesPassed) process.exitCode = 1;
