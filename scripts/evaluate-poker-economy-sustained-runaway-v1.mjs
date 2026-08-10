import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "1.0.0";
const BASELINE = "80-75";
const CHALLENGER = "sustain5-median100";
const CANDIDATES = [BASELINE, CHALLENGER];
const PROFILES = ["tight", "balanced", "calling"];
const EXPECTED_PAIRS = 4;
const EXPECTED_RUNS_PER_CANDIDATE = PROFILES.length * EXPECTED_PAIRS;
const inputDir = resolve(process.argv[2] || "poker-economy-sustained-runaway-results");
const outputDir = resolve(process.argv[3] || "poker-economy-sustained-runaway-summary");

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function longest(values, predicate) {
  let best = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function stackSamples(report) {
  return Array.isArray(report?.economySustainedRunaway?.handStackSamples)
    ? report.economySustainedRunaway.handStackSamples
    : [];
}

function ratios(report) {
  return stackSamples(report)
    .map(sample => Number(sample?.heroToOpponentMedianRatio))
    .filter(Number.isFinite);
}

function runKey(report) {
  return `${report?.economySustainedRunaway?.profile || report?.heroProfile || "unknown"}:${finite(report?.economySustainedRunaway?.pairIndex, report?.shardIndex)}`;
}

function runMetrics(report) {
  const all = ratios(report);
  const late = all.slice(-100);
  const lateAverage = average(late);
  const lateP90 = percentile(late, 0.90);
  const late3xRate = late.filter(value => value >= 3).length / Math.max(1, late.length);
  const late5xRate = late.filter(value => value >= 5).length / Math.max(1, late.length);
  const lateLongest5x = longest(late, value => value >= 5);
  const latePersistent = lateAverage >= 3 || late5xRate >= 0.10 || lateLongest5x >= 15;
  const economy = report?.economySustainedRunaway || {};
  return {
    key: runKey(report),
    profile: String(economy.profile || report?.heroProfile || "unknown"),
    pairIndex: finite(economy.pairIndex, report?.shardIndex),
    completedHands: finite(report?.completedHands),
    configuredHands: finite(report?.configuredHands),
    lateAverage: round(lateAverage, 6),
    lateP90: round(lateP90, 6),
    late3xRate: round(late3xRate, 6),
    late5xRate: round(late5xRate, 6),
    lateLongest5x,
    latePersistent,
    finalRatio: round(all.at(-1) || 0, 6),
    maxRatio: all.length ? round(Math.max(...all), 6) : 0,
    estimatedInjectedBb: round(finite(economy.aiReplacedSeats) * finite(economy.averageEntryBb), 4),
    sustainedEligibleEvents: finite(economy.sustainedEligibleEvents),
    sustainedAppliedEvents: finite(economy.sustainedAppliedEvents),
    sustainedAppliedSeats: finite(economy.sustainedAppliedSeats),
    sustainedExtraInjectedBb: round(finite(economy.sustainedExtraInjectedBb), 4),
  };
}

if (!statSync(inputDir).isDirectory()) throw new Error(`Input is not a directory: ${inputDir}`);
const files = walk(inputDir)
  .filter(path => /^poker-economy-sustained-.+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No sustained-runaway benchmark JSON under ${inputDir}`);

const groups = new Map(CANDIDATES.map(id => [id, []]));
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const id = report?.economySustainedRunaway?.policy?.id;
  if (groups.has(id)) groups.get(id).push(report);
}

function observe(id) {
  const reports = groups.get(id);
  const metrics = reports.map(runMetrics);
  const completedHands = reports.reduce((sum, report) => sum + finite(report.completedHands), 0);
  const configuredHands = reports.reduce((sum, report) => sum + finite(report.configuredHands), 0);
  const gameplayFailures = reports.reduce((sum, report) => sum + (report.failures?.length || 0), 0);
  const schedulerFailures = reports.reduce((sum, report) => sum + (report.schedulerErrors?.length || 0), 0);
  const fairnessFailures = reports.filter(report => !report.fairness?.publicInformationOnly || !report.economySustainedRunaway?.publicInformationOnly).length;
  const integrityFailures = reports.filter(report => !report.telemetryIntegrity?.integrityPassed).length;
  const mutationFailures = reports.filter(report => (
    report.economySustainedRunaway?.productionBehaviorChanged
    || !report.economySustainedRunaway?.productionConfigUnchanged
    || finite(report.economySustainedRunaway?.productionConfig?.tableMedianRatio, 0.80) !== 0.80
    || finite(report.economySustainedRunaway?.productionConfig?.buyInRatioCap, 0.75) !== 0.75
    || finite(report.economySustainedRunaway?.productionConfig?.softFloorBigBlinds, 12) !== 12
    || finite(report.economySustainedRunaway?.productionConfig?.maxBigBlinds, 60) !== 60
  )).length;
  const maximumEntryBb = Math.max(0, ...reports.map(report => finite(report.economySustainedRunaway?.maximumEntryBb)));
  const estimatedInjectedBb = metrics.reduce((sum, metric) => sum + metric.estimatedInjectedBb, 0);
  const latePersistentRuns = metrics.filter(metric => metric.latePersistent);

  return {
    id,
    runs: reports.length,
    completedHands,
    configuredHands,
    gameplayFailures,
    schedulerFailures,
    fairnessFailures,
    integrityFailures,
    mutationFailures,
    maximumEntryBb: round(maximumEntryBb, 4),
    estimatedInjectedBb: round(estimatedInjectedBb, 4),
    sustainedEligibleEvents: metrics.reduce((sum, metric) => sum + metric.sustainedEligibleEvents, 0),
    sustainedAppliedEvents: metrics.reduce((sum, metric) => sum + metric.sustainedAppliedEvents, 0),
    sustainedAppliedSeats: metrics.reduce((sum, metric) => sum + metric.sustainedAppliedSeats, 0),
    sustainedExtraInjectedBb: round(metrics.reduce((sum, metric) => sum + metric.sustainedExtraInjectedBb, 0), 4),
    latePersistentCount: latePersistentRuns.length,
    latePersistentKeys: latePersistentRuns.map(metric => metric.key).sort(),
    averageLateRatio: round(average(metrics.map(metric => metric.lateAverage)), 6),
    averageLate5xRate: round(average(metrics.map(metric => metric.late5xRate)), 6),
    metrics,
  };
}

const observations = Object.fromEntries(CANDIDATES.map(id => [id, observe(id)]));
const baselineByKey = new Map(observations[BASELINE].metrics.map(metric => [metric.key, metric]));
const challengerByKey = new Map(observations[CHALLENGER].metrics.map(metric => [metric.key, metric]));
const comparableKeys = [...baselineByKey.keys()].filter(key => challengerByKey.has(key)).sort();
const objectives = ["lateAverage", "lateP90", "late3xRate", "late5xRate", "lateLongest5x", "finalRatio"];

const pairs = comparableKeys.map(key => {
  const baseline = baselineByKey.get(key);
  const challenger = challengerByKey.get(key);
  const deltas = Object.fromEntries(objectives.map(metric => [metric, round(challenger[metric] - baseline[metric], 6)]));
  let winner = "tie";
  if (baseline.latePersistent !== challenger.latePersistent) {
    winner = challenger.latePersistent ? "baseline" : "challenger";
  } else {
    const challengerWins = objectives.filter(metric => deltas[metric] < 0).length;
    const baselineWins = objectives.filter(metric => deltas[metric] > 0).length;
    winner = challengerWins > baselineWins ? "challenger" : baselineWins > challengerWins ? "baseline" : "tie";
  }
  return {
    key,
    profile: baseline.profile,
    pairIndex: baseline.pairIndex,
    baseline,
    challenger,
    deltas,
    winner,
    targetedBaselinePersistent: baseline.latePersistent,
    recoveredPersistent: baseline.latePersistent && !challenger.latePersistent,
    newPersistent: !baseline.latePersistent && challenger.latePersistent,
  };
});

const targeted = pairs.filter(pair => pair.targetedBaselinePersistent);
const nonTargeted = pairs.filter(pair => !pair.targetedBaselinePersistent);
const pairedReview = {
  comparableRuns: pairs.length,
  challengerBetter: pairs.filter(pair => pair.winner === "challenger").length,
  baselineBetter: pairs.filter(pair => pair.winner === "baseline").length,
  ties: pairs.filter(pair => pair.winner === "tie").length,
  targetedBaselinePersistent: targeted.length,
  targetedRecovered: targeted.filter(pair => pair.recoveredPersistent).length,
  targetedStillPersistent: targeted.filter(pair => pair.challenger.latePersistent).length,
  newPersistent: nonTargeted.filter(pair => pair.newPersistent).length,
  injection: {
    baselineBb: observations[BASELINE].estimatedInjectedBb,
    challengerBb: observations[CHALLENGER].estimatedInjectedBb,
    deltaBb: round(observations[CHALLENGER].estimatedInjectedBb - observations[BASELINE].estimatedInjectedBb, 4),
    deltaPct: observations[BASELINE].estimatedInjectedBb
      ? round(((observations[CHALLENGER].estimatedInjectedBb / observations[BASELINE].estimatedInjectedBb) - 1) * 100, 4)
      : 0,
    sustainedExtraBb: observations[CHALLENGER].sustainedExtraInjectedBb,
  },
  pairs,
};

const validationErrors = [];
for (const id of CANDIDATES) {
  const observation = observations[id];
  if (observation.runs !== EXPECTED_RUNS_PER_CANDIDATE) validationErrors.push(`${id}: expected ${EXPECTED_RUNS_PER_CANDIDATE} runs, got ${observation.runs}`);
  if (observation.completedHands !== observation.configuredHands) validationErrors.push(`${id}: incomplete hands ${observation.completedHands}/${observation.configuredHands}`);
  if (observation.gameplayFailures || observation.schedulerFailures || observation.fairnessFailures || observation.integrityFailures || observation.mutationFailures) {
    validationErrors.push(`${id}: safety/integrity gate failure`);
  }
  if (observation.maximumEntryBb > 60) validationErrors.push(`${id}: exceeded 60BB hard cap`);
}
if (pairedReview.comparableRuns !== EXPECTED_RUNS_PER_CANDIDATE) validationErrors.push(`paired: expected ${EXPECTED_RUNS_PER_CANDIDATE} comparable runs, got ${pairedReview.comparableRuns}`);

let disposition = "REJECT_OR_REFINE";
let rationale = "Sustained-runaway response did not meet the paired deep-screen advancement gate.";
if (validationErrors.length) {
  disposition = "VALIDATION_FAIL";
  rationale = "Safety, integrity, completeness, or economy-bound validation failed.";
} else if (observations[BASELINE].latePersistentCount !== 3) {
  disposition = "BASELINE_REPRO_MISMATCH";
  rationale = `Expected the exact #179 baseline to reproduce 3/12 late-persistent paths, observed ${observations[BASELINE].latePersistentCount}/12.`;
} else if (pairedReview.newPersistent > 0) {
  disposition = "REJECT_NEW_LATE_RUNAWAY";
  rationale = "The candidate created at least one new late-persistent runaway on a previously non-persistent paired path.";
} else if (
  pairedReview.targetedRecovered >= 2
  && observations[CHALLENGER].latePersistentCount <= 1
  && pairedReview.baselineBetter <= pairedReview.challengerBetter
  && pairedReview.injection.deltaPct <= 15
) {
  disposition = "ADVANCE_TO_EVIDENCE";
  rationale = "The sustained response removed at least two of three reproduced late-persistent paths without creating a new persistent path, while keeping paired direction and injection bounded.";
} else if (pairedReview.targetedRecovered > 0) {
  disposition = "MIXED_SUSTAINED_RESPONSE";
  rationale = "The candidate improved at least one targeted persistent path but did not satisfy the full paired advancement gate.";
}

const summary = {
  schemaVersion: 1,
  version: VERSION,
  baseline: BASELINE,
  challenger: CHALLENGER,
  validationPassed: validationErrors.length === 0,
  validationErrors,
  disposition,
  rationale,
  automaticPromotion: false,
  productionChange: "none",
  observations,
  pairedReview,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "poker-economy-sustained-runaway-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const profileRows = CANDIDATES.flatMap(id => PROFILES.map(profile => {
  const metrics = observations[id].metrics.filter(metric => metric.profile === profile);
  return `| ${id} | ${profile} | ${metrics.length} | ${metrics.filter(metric => metric.latePersistent).length} | ${average(metrics.map(metric => metric.lateAverage)).toFixed(2)}x | ${(average(metrics.map(metric => metric.late5xRate)) * 100).toFixed(1)}% |`;
}));
const pairRows = pairs.map(pair => `| ${pair.key} | ${pair.baseline.latePersistent ? "YES" : "NO"} | ${pair.challenger.latePersistent ? "YES" : "NO"} | ${pair.baseline.lateAverage.toFixed(2)}x | ${pair.challenger.lateAverage.toFixed(2)}x | ${(pair.baseline.late5xRate * 100).toFixed(1)}% | ${(pair.challenger.late5xRate * 100).toFixed(1)}% | ${pair.winner} |`);

const markdown = [
  "# Poker Economy Sustained Runaway Benchmark V1",
  "",
  `- Validation: ${summary.validationPassed ? "PASS" : "FAIL"}`,
  `- Disposition: **${disposition}**`,
  `- Production change: ${summary.productionChange}`,
  `- Automatic promotion: ${summary.automaticPromotion ? "YES" : "NO"}`,
  `- Baseline late-persistent: ${observations[BASELINE].latePersistentCount}/12`,
  `- Challenger late-persistent: ${observations[CHALLENGER].latePersistentCount}/12`,
  `- Targeted recovered: ${pairedReview.targetedRecovered}/${pairedReview.targetedBaselinePersistent}`,
  `- New persistent paths: ${pairedReview.newPersistent}`,
  `- Paired challenger/baseline/tie: ${pairedReview.challengerBetter}/${pairedReview.baselineBetter}/${pairedReview.ties}`,
  `- Estimated injection delta: ${pairedReview.injection.deltaPct.toFixed(2)}% (${pairedReview.injection.deltaBb.toFixed(1)}BB)`,
  `- Sustained-response extra injection: ${pairedReview.injection.sustainedExtraBb.toFixed(1)}BB`,
  "",
  "## Profile summary",
  "",
  "| Policy | Profile | Runs | Late persistent | Avg late ratio | Avg late >=5x |",
  "|---|---|---:|---:|---:|---:|",
  ...profileRows,
  "",
  "## Paired paths",
  "",
  "| Path | Baseline persistent | Challenger persistent | Baseline late avg | Challenger late avg | Baseline late >=5x | Challenger late >=5x | Direction |",
  "|---|---|---|---:|---:|---:|---:|---|",
  ...pairRows,
  "",
  "## Interpretation",
  "",
  `- ${rationale}`,
  "- The challenger only changes replacement stacks after a full 50-hand public stack-ratio window contains at least 10 hands at >=5x Hero/opponent-median ratio.",
  "- When active, the replacement target may rise from production 80% of table median to at most 100% of table median, while retaining the production 75% buy-in cap, 12BB soft floor and 60BB hard cap.",
  "- This benchmark never promotes or changes production automatically.",
  ...(validationErrors.length ? ["", "## Validation errors", "", ...validationErrors.map(error => `- ${error}`)] : []),
].join("\n");

writeFileSync(join(outputDir, "poker-economy-sustained-runaway-v1.md"), `${markdown}\n`, "utf8");
console.log(markdown);
if (!summary.validationPassed) process.exitCode = 1;
