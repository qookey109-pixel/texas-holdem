import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "1.0.0";
const BASELINE = "frozen-l5";
const CHALLENGER = "slow-post-l5";
const POLICIES = [BASELINE, CHALLENGER];
const PROFILES = ["tight", "balanced", "calling"];
const EXPECTED_PAIRS = 4;
const EXPECTED_RUNS = PROFILES.length * EXPECTED_PAIRS;
const inputDir = resolve(process.argv[2] || "poker-economy-post-l5-blind-pressure-results");
const outputDir = resolve(process.argv[3] || "poker-economy-post-l5-blind-pressure-summary");

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

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
    } else current = 0;
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

function runKey(report) {
  const audit = report?.postL5BlindPressure || {};
  return `${audit.profile || report?.heroProfile || "unknown"}:${finite(audit.pairIndex, report?.shardIndex)}`;
}

function runMetrics(report) {
  const audit = report?.postL5BlindPressure || {};
  const hands = Array.isArray(audit.hands) ? audit.hands : [];
  const ratios = hands.map(hand => Number(hand?.heroToOpponentMedianRatio)).filter(Number.isFinite);
  const heroBbs = hands.map(hand => Number(hand?.heroBb)).filter(Number.isFinite);
  const late = ratios.slice(-100);
  const lateHero = heroBbs.slice(-100);
  const lateAverage = average(late);
  const late5xRate = late.filter(value => value >= 5).length / Math.max(1, late.length);
  const lateLongest5x = longest(late, value => value >= 5);
  const latePersistent = lateAverage >= 3 || late5xRate >= 0.10 || lateLongest5x >= 15;
  return {
    key: runKey(report),
    profile: String(audit.profile || report?.heroProfile || "unknown"),
    pairIndex: finite(audit.pairIndex, report?.shardIndex),
    completedHands: finite(report?.completedHands),
    configuredHands: finite(report?.configuredHands),
    lateAverage: round(lateAverage, 6),
    lateP90: round(percentile(late, 0.90), 6),
    late5xRate: round(late5xRate, 6),
    lateLongest5x,
    latePersistent,
    lateHeroBbAverage: round(average(lateHero), 4),
    maxHeroBb: heroBbs.length ? round(Math.max(...heroBbs), 4) : 0,
    maxRatio: ratios.length ? round(Math.max(...ratios), 6) : 0,
    finalRatio: ratios.length ? round(ratios.at(-1), 6) : 0,
    maximumObservedBigBlind: finite(audit.maximumObservedBigBlind),
    observedLevels: Array.isArray(audit.observedLevels) ? [...audit.observedLevels] : [],
    scheduleMismatchCount: finite(audit.scheduleMismatchCount),
    adjustedReplacementEvents: finite(audit.adjustedReplacementEvents),
    adjustedReplacementSeats: finite(audit.adjustedReplacementSeats),
    post70ReplacementEntryBbMax: audit.post70ReplacementEntryBbMax === null ? null : round(audit.post70ReplacementEntryBbMax, 4),
    post70ReplacementEntryBbMin: audit.post70ReplacementEntryBbMin === null ? null : round(audit.post70ReplacementEntryBbMin, 4),
    post70ReplacementDepthViolations: finite(audit.post70ReplacementDepthViolations),
    productionConfigUnchanged: Boolean(audit.productionConfigUnchanged),
    fairnessClean: Boolean(
      report?.fairness?.publicInformationOnly
      && audit.publicInformationOnly
      && audit.hiddenOpponentCards === false
      && audit.actualDeckOrder === false
      && audit.futureBoardAnswer === false
      && audit.predeterminedWinner === false
    ),
    gameplayFailures: report?.failures?.length || 0,
    schedulerErrors: report?.schedulerErrors?.length || 0,
    integrityErrors: report?.telemetryIntegrity?.errors?.length || 0,
    integrityPassed: Boolean(report?.telemetryIntegrity?.integrityPassed),
  };
}

if (!statSync(inputDir).isDirectory()) throw new Error(`Input is not a directory: ${inputDir}`);
const files = walk(inputDir)
  .filter(path => /^poker-economy-post-l5-.+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No post-L5 blind benchmark JSON under ${inputDir}`);

const groups = new Map(POLICIES.map(policy => [policy, []]));
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const policy = report?.postL5BlindPressure?.policy?.id;
  if (groups.has(policy)) groups.get(policy).push(report);
}

function observe(policy) {
  const reports = groups.get(policy);
  const runs = reports.map(runMetrics).sort((a, b) => a.profile.localeCompare(b.profile) || a.pairIndex - b.pairIndex);
  const completedHands = reports.reduce((sum, report) => sum + finite(report.completedHands), 0);
  const configuredHands = reports.reduce((sum, report) => sum + finite(report.configuredHands), 0);
  const validationClean = runs.every(run =>
    run.completedHands === run.configuredHands
    && run.gameplayFailures === 0
    && run.schedulerErrors === 0
    && run.integrityPassed
    && run.integrityErrors === 0
    && run.fairnessClean
    && run.productionConfigUnchanged
    && run.scheduleMismatchCount === 0
    && run.post70ReplacementDepthViolations === 0
  );
  return {
    policy,
    runs: runs.length,
    expectedRuns: EXPECTED_RUNS,
    completedHands,
    configuredHands,
    validationClean,
    persistentRuns: runs.filter(run => run.latePersistent).length,
    medianLateAverage: round(median(runs.map(run => run.lateAverage)), 6),
    medianLateP90: round(median(runs.map(run => run.lateP90)), 6),
    medianLateHeroBb: round(median(runs.map(run => run.lateHeroBbAverage)), 4),
    maxObservedBigBlind: Math.max(0, ...runs.map(run => run.maximumObservedBigBlind)),
    adjustedReplacementEvents: runs.reduce((sum, run) => sum + run.adjustedReplacementEvents, 0),
    adjustedReplacementSeats: runs.reduce((sum, run) => sum + run.adjustedReplacementSeats, 0),
    post70ReplacementDepthViolations: runs.reduce((sum, run) => sum + run.post70ReplacementDepthViolations, 0),
    runsDetail: runs,
  };
}

const observations = Object.fromEntries(POLICIES.map(policy => [policy, observe(policy)]));
const baseline = observations[BASELINE];
const challenger = observations[CHALLENGER];
const baselineByKey = new Map(baseline.runsDetail.map(run => [run.key, run]));
const challengerByKey = new Map(challenger.runsDetail.map(run => [run.key, run]));
const pairs = [];
for (const [key, base] of baselineByKey.entries()) {
  const next = challengerByKey.get(key);
  if (!next) continue;
  const delta = next.lateAverage - base.lateAverage;
  const direction = Math.abs(delta) <= 0.05 ? "tie" : delta < 0 ? "challenger-better" : "baseline-better";
  pairs.push({
    key,
    profile: base.profile,
    pairIndex: base.pairIndex,
    baselineLateAverage: base.lateAverage,
    challengerLateAverage: next.lateAverage,
    baselinePersistent: base.latePersistent,
    challengerPersistent: next.latePersistent,
    deltaLateAverage: round(delta, 6),
    direction,
  });
}

const targetPairs = pairs.filter(pair => pair.baselinePersistent);
const controlPairs = pairs.filter(pair => !pair.baselinePersistent);
const recoveredTargets = targetPairs.filter(pair => !pair.challengerPersistent).length;
const newPersistentControls = controlPairs.filter(pair => pair.challengerPersistent).length;
const pairedChallengerBetter = pairs.filter(pair => pair.direction === "challenger-better").length;
const pairedBaselineBetter = pairs.filter(pair => pair.direction === "baseline-better").length;
const pairedTie = pairs.filter(pair => pair.direction === "tie").length;
const sampleComplete = POLICIES.every(policy => observations[policy].runs === EXPECTED_RUNS && observations[policy].completedHands === observations[policy].configuredHands);
const validationClean = POLICIES.every(policy => observations[policy].validationClean);
const baselineReproduced = baseline.persistentRuns === 3;
const scheduleApplied = challenger.maxObservedBigBlind === 1000 && challenger.adjustedReplacementSeats > 0;
const replacementDepthPreserved = challenger.post70ReplacementDepthViolations === 0;

let disposition = "REJECT_OR_INCONCLUSIVE";
if (!sampleComplete || !validationClean) disposition = "INVALID_EVIDENCE";
else if (!baselineReproduced) disposition = "BASELINE_REPRO_MISMATCH";
else if (!scheduleApplied) disposition = "INERT_SCHEDULE_CANDIDATE";
else if (!replacementDepthPreserved) disposition = "REJECT_REPLACEMENT_DEPTH_DRIFT";
else if (newPersistentControls > 0) disposition = "REJECT_NEW_LATE_RUNAWAY";
else if (recoveredTargets >= 2 && challenger.persistentRuns <= 1 && pairedChallengerBetter >= pairedBaselineBetter) disposition = "ADVANCE_TO_DEEP_EVIDENCE";
else disposition = "NO_ROBUST_POST_L5_BLIND_BENEFIT";

const summary = {
  version: VERSION,
  baseline: BASELINE,
  challenger: CHALLENGER,
  sampleComplete,
  validationClean,
  baselineReproduced,
  scheduleApplied,
  replacementDepthPreserved,
  disposition,
  targetedPersistent: targetPairs.length,
  recoveredTargets,
  newPersistentControls,
  pairedDirection: { challengerBetter: pairedChallengerBetter, baselineBetter: pairedBaselineBetter, tie: pairedTie },
  observations,
  pairs,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "poker-economy-post-l5-blind-pressure-v1.json"), `${JSON.stringify(summary, null, 2)}\n`);

const runRows = pairs.map(pair => `| ${pair.pairIndex} | ${pair.profile} | ${pair.baselineLateAverage.toFixed(2)}x | ${pair.challengerLateAverage.toFixed(2)}x | ${pair.baselinePersistent ? "YES" : "NO"} | ${pair.challengerPersistent ? "YES" : "NO"} | ${pair.direction} |`);
const markdown = [
  "# Poker Economy Slow Post-L5 Blind Pressure V1",
  "",
  `- Runs: ${baseline.runs + challenger.runs}/${EXPECTED_RUNS * 2}`,
  `- Hands: ${baseline.completedHands + challenger.completedHands}/${baseline.configuredHands + challenger.configuredHands}`,
  `- Validation: ${validationClean ? "PASS" : "FAIL"}`,
  `- Baseline #179 reproduced: ${baselineReproduced ? "YES" : "NO"} (${baseline.persistentRuns}/12 late-persistent)`,
  `- Challenger late-persistent: ${challenger.persistentRuns}/12`,
  `- Target recovery: ${recoveredTargets}/${targetPairs.length}`,
  `- New persistent controls: ${newPersistentControls}/${controlPairs.length}`,
  `- Paired direction: challenger ${pairedChallengerBetter} / baseline ${pairedBaselineBetter} / tie ${pairedTie}`,
  `- Challenger max observed BB: ${challenger.maxObservedBigBlind}`,
  `- Challenger adjusted replacement seats: ${challenger.adjustedReplacementSeats}`,
  `- Replacement-depth violations: ${challenger.post70ReplacementDepthViolations}`,
  `- Disposition: **${disposition}**`,
  "",
  "| Pair | Profile | Baseline late avg | Challenger late avg | Baseline persistent | Challenger persistent | Direction |",
  "|---:|---|---:|---:|---|---|---|",
  ...runRows,
  "",
  "Challenger schedule: production through hand 70; then 250/500 from hand 71, 300/600 from 121, 400/800 from 171, and 500/1000 from 221. Buy-in scales with the blind to preserve the Level-5 37.5BB buy-in depth and 28.125BB structural replacement cap.",
  "",
  "Evidence only. No production JS, AI strategy, hidden-information access, Normal Economy ratios, or G1 behavior changed.",
].join("\n");
writeFileSync(join(outputDir, "poker-economy-post-l5-blind-pressure-v1.md"), `${markdown}\n`);
console.log(markdown);
