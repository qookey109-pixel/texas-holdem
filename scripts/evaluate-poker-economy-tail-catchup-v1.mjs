import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "1.3.0-tail-catchup";
const BASELINE = "80-75";
const DEFAULT_CANDIDATES = ["80-75", "tail3-70", "tail5-75"];
const CANDIDATES = (process.env.POKER_ECONOMY_OODA_CANDIDATES || DEFAULT_CANDIDATES.join(","))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const inputDirectory = resolve(process.argv[2] || "economy-ooda-results");
const outputDirectory = resolve(process.argv[3] || "economy-ooda-summary");

if (!CANDIDATES.includes(BASELINE)) throw new Error(`Candidates must include baseline ${BASELINE}`);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percentDelta(value, baselineValue) {
  return baselineValue !== 0 ? round(((value / baselineValue) - 1) * 100, 4) : 0;
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

function stackSamples(report) {
  return Array.isArray(report?.economyOoda?.handStackSamples) ? report.economyOoda.handStackSamples : [];
}

function ratios(samples) {
  return samples
    .map(sample => sample?.heroToOpponentMedianRatio)
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
}

function seedMetrics(report) {
  const samples = stackSamples(report);
  const allRatios = ratios(samples);
  const lateRatios = ratios(samples.slice(Math.floor(samples.length * 0.8)));
  const replaced = finite(report?.economyOoda?.aiReplacedSeats);
  const averageEntryBb = finite(report?.economyOoda?.averageEntryBb);
  return {
    shardIndex: finite(report?.shardIndex, -1),
    lateAverage: round(average(lateRatios), 6),
    lateP90: round(percentile(lateRatios, 0.90), 6),
    dominance3x: round(rate(allRatios.filter(value => value >= 3).length, allRatios.length), 6),
    dominance5x: round(rate(allRatios.filter(value => value >= 5).length, allRatios.length), 6),
    injectedBb: round(replaced * averageEntryBb, 4),
    tailExtraBb: round(finite(report?.economyOoda?.tailExtraInjectedBb), 4),
  };
}

if (!statSync(inputDirectory).isDirectory()) throw new Error(`Input is not a directory: ${inputDirectory}`);
const files = walk(inputDirectory)
  .filter(path => /^poker-economy-ooda-.+-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No Poker Economy OODA shard JSON found under ${inputDirectory}`);

const groups = new Map(CANDIDATES.map(id => [id, []]));
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const id = report?.economyOoda?.policy?.id;
  if (groups.has(id)) groups.get(id).push(report);
}

function observe(id, reports) {
  const completedHands = reports.reduce((sum, report) => sum + finite(report.completedHands), 0);
  const configuredHands = reports.reduce((sum, report) => sum + finite(report.configuredHands), 0);
  const failures = reports.reduce((sum, report) => sum + (report.failures?.length || 0), 0);
  const schedulerErrors = reports.reduce((sum, report) => sum + (report.schedulerErrors?.length || 0), 0);
  const fairnessFailures = reports.filter(report => !report.fairness?.publicInformationOnly).length;
  const integrityFailures = reports.filter(report => !report.telemetryIntegrity?.integrityPassed).length;
  const productionMutationFailures = reports.filter(report => (
    report.economyOoda?.productionBehaviorChanged
    || !report.economyOoda?.productionConfigUnchanged
    || finite(report.economyOoda?.productionConfig?.maxBigBlinds, 60) !== 60
  )).length;
  const aiReplacedSeats = reports.reduce((sum, report) => sum + finite(report.economyOoda?.aiReplacedSeats), 0);
  const aiReplacementEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.aiReplacementEvents), 0);
  const injectedBb = reports.reduce((sum, report) => (
    sum + finite(report.economyOoda?.averageEntryBb) * finite(report.economyOoda?.aiReplacedSeats)
  ), 0);
  const medianBbWeighted = reports.reduce((sum, report) => (
    sum + finite(report.economyOoda?.averageTableMedianBb) * finite(report.economyOoda?.aiReplacedSeats)
  ), 0);
  const tailEligibleEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailEligibleEvents), 0);
  const tailAppliedEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailAppliedEvents), 0);
  const tailAppliedSeats = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailAppliedSeats), 0);
  const tailExtraInjectedBb = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailExtraInjectedBb), 0);
  const maximumEntryBb = reports.reduce((max, report) => Math.max(max, finite(report.economyOoda?.maximumEntryBb)), 0);
  const allowedMaximumEntryBb = reports.reduce((max, report) => Math.max(max, finite(report.economyOoda?.policy?.maxBigBlinds, 60)), 60);
  const minimumEntries = reports
    .map(report => report.economyOoda?.minimumEntryBb)
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
  const allSamples = reports.flatMap(stackSamples);
  const allRatios = ratios(allSamples);
  const lateSamples = reports.flatMap(report => {
    const samples = stackSamples(report);
    return samples.slice(Math.floor(samples.length * 0.8));
  });
  const lateRatios = ratios(lateSamples);
  const finalRatios = reports
    .map(report => stackSamples(report).at(-1)?.heroToOpponentMedianRatio)
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
  const roleTotals = {};
  for (const report of reports) {
    for (const [name, role] of Object.entries(report.roleCounts || {})) {
      if (!roleTotals[name]) roleTotals[name] = { hands: 0, bbWon: 0, busts: 0 };
      roleTotals[name].hands += finite(role.hands);
      roleTotals[name].bbWon += finite(role.bbWon);
      roleTotals[name].busts += finite(role.busts);
    }
  }
  const roleHands = Object.values(roleTotals).reduce((sum, role) => sum + role.hands, 0);
  const roleBbWon = Object.values(roleTotals).reduce((sum, role) => sum + role.bbWon, 0);
  const roleBusts = Object.values(roleTotals).reduce((sum, role) => sum + role.busts, 0);
  const fingerprints = new Set(reports.map(report => report.deterministicFingerprint).filter(Boolean));
  return {
    id,
    stage: reports[0]?.economyOoda?.stage || "unknown",
    shards: reports.length,
    configuredHands,
    completedHands,
    failures,
    schedulerErrors,
    fairnessFailures,
    integrityFailures,
    productionMutationFailures,
    fingerprints: fingerprints.size,
    aiReplacementEvents,
    aiReplacedSeats,
    estimatedInjectedBb: round(injectedBb, 4),
    averageEntryBb: aiReplacedSeats ? round(injectedBb / aiReplacedSeats, 4) : 0,
    averageTableMedianBb: aiReplacedSeats ? round(medianBbWeighted / aiReplacedSeats, 4) : 0,
    minimumEntryBb: minimumEntries.length ? Math.min(...minimumEntries) : null,
    maximumEntryBb: round(maximumEntryBb, 4),
    allowedMaximumEntryBb: round(allowedMaximumEntryBb, 4),
    tailEligibleEvents,
    tailAppliedEvents,
    tailAppliedSeats,
    tailExtraInjectedBb: round(tailExtraInjectedBb, 4),
    tailExtraSharePct: injectedBb > 0 ? round((tailExtraInjectedBb / injectedBb) * 100, 4) : 0,
    handStackSamples: allSamples.length,
    averageHeroToOpponentMedianRatio: round(average(allRatios), 6),
    p90HeroToOpponentMedianRatio: round(percentile(allRatios, 0.90), 6),
    maximumHeroToOpponentMedianRatio: allRatios.length ? round(Math.max(...allRatios), 6) : null,
    lateAverageHeroToOpponentMedianRatio: round(average(lateRatios), 6),
    lateP90HeroToOpponentMedianRatio: round(percentile(lateRatios, 0.90), 6),
    finalAverageHeroToOpponentMedianRatio: round(average(finalRatios), 6),
    heroDominance3xRate: round(rate(allRatios.filter(value => value >= 3).length, allRatios.length), 6),
    heroDominance5xRate: round(rate(allRatios.filter(value => value >= 5).length, allRatios.length), 6),
    aggregateRoleBb100: roleHands ? round((roleBbWon / roleHands) * 100, 4) : 0,
    aggregateRoleBustRate: round(rate(roleBusts, roleHands), 6),
    activeRoles: Object.values(roleTotals).filter(role => role.hands > 0).length,
  };
}

function orient(observation) {
  const safetyPassed = observation.failures === 0
    && observation.schedulerErrors === 0
    && observation.fairnessFailures === 0
    && observation.integrityFailures === 0
    && observation.productionMutationFailures === 0
    && observation.completedHands === observation.configuredHands;
  const economyBoundsPassed = observation.maximumEntryBb <= observation.allowedMaximumEntryBb
    && observation.allowedMaximumEntryBb <= 75
    && (observation.minimumEntryBb === null || observation.minimumEntryBb >= 0);
  const telemetryReady = observation.completedHands > 0
    && observation.shards > 0
    && observation.fingerprints === observation.shards
    && observation.activeRoles >= 5
    && observation.handStackSamples === observation.completedHands;
  return {
    safetyPassed,
    economyBoundsPassed,
    telemetryReady,
    gatesPassed: safetyPassed && economyBoundsPassed && telemetryReady,
  };
}

const observations = Object.fromEntries(CANDIDATES.map(id => [id, observe(id, groups.get(id))]));
const orientations = Object.fromEntries(CANDIDATES.map(id => [id, orient(observations[id])]));
const baseline = observations[BASELINE];

function pairedSeedReview(challengerId) {
  const baseByShard = new Map(groups.get(BASELINE).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const challengerByShard = new Map(groups.get(challengerId).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const indexes = [...baseByShard.keys()].filter(index => index >= 0 && challengerByShard.has(index)).sort((a, b) => a - b);
  const pairs = indexes.map(shardIndex => {
    const current = baseByShard.get(shardIndex);
    const challenger = challengerByShard.get(shardIndex);
    return {
      shardIndex,
      baseline: current,
      challenger,
      delta: {
        lateAverage: round(challenger.lateAverage - current.lateAverage, 6),
        lateP90: round(challenger.lateP90 - current.lateP90, 6),
        dominance3x: round(challenger.dominance3x - current.dominance3x, 6),
        dominance5x: round(challenger.dominance5x - current.dominance5x, 6),
        injectedBb: round(challenger.injectedBb - current.injectedBb, 4),
        tailExtraBb: round(challenger.tailExtraBb - current.tailExtraBb, 4),
      },
    };
  });
  const lateDeltas = pairs.map(pair => pair.delta.lateAverage);
  const p90Deltas = pairs.map(pair => pair.delta.lateP90);
  const d3 = pairs.map(pair => pair.delta.dominance3x);
  const d5 = pairs.map(pair => pair.delta.dominance5x);
  const injection = pairs.map(pair => pair.delta.injectedBb);
  const better = lateDeltas.filter(value => value < 0).length;
  const worse = lateDeltas.filter(value => value > 0).length;
  const baselineInjection = pairs.reduce((sum, pair) => sum + pair.baseline.injectedBb, 0);
  const challengerInjection = pairs.reduce((sum, pair) => sum + pair.challenger.injectedBb, 0);
  return {
    challengerId,
    pairedSeeds: pairs.length,
    challengerBetterLateSeeds: better,
    baselineBetterLateSeeds: worse,
    tiedLateSeeds: pairs.length - better - worse,
    lateDirectionConsensus: better > worse ? "challenger" : worse > better ? "baseline" : "tied",
    seedMedianLateAverage: {
      baseline: round(median(pairs.map(pair => pair.baseline.lateAverage)), 6),
      challenger: round(median(pairs.map(pair => pair.challenger.lateAverage)), 6),
    },
    pairedMedianDelta: {
      lateAverageHeroToOpponentMedianRatio: round(median(lateDeltas), 6),
      lateP90HeroToOpponentMedianRatio: round(median(p90Deltas), 6),
      heroDominance3xRate: round(median(d3), 6),
      heroDominance5xRate: round(median(d5), 6),
      estimatedInjectedBb: round(median(injection), 4),
    },
    totalEstimatedInjectedBb: {
      baseline: round(baselineInjection, 4),
      challenger: round(challengerInjection, 4),
      deltaPct: percentDelta(challengerInjection, baselineInjection),
    },
    pairs,
  };
}

const pairedSeedReviews = Object.fromEntries(
  CANDIDATES.filter(id => id !== BASELINE).map(id => [id, pairedSeedReview(id)]),
);
const missingCandidates = CANDIDATES.filter(id => groups.get(id).length === 0);
const validationErrors = missingCandidates.length ? [`missing candidates: ${missingCandidates.join(", ")}`] : [];
const validationPassed = validationErrors.length === 0 && CANDIDATES.every(id => orientations[id].gatesPassed);

function decision(id) {
  const o = observations[id];
  const gates = orientations[id].gatesPassed;
  const relative = {
    injectionDeltaPct: percentDelta(o.estimatedInjectedBb, baseline.estimatedInjectedBb),
    lateAverageDelta: round(o.lateAverageHeroToOpponentMedianRatio - baseline.lateAverageHeroToOpponentMedianRatio, 6),
    lateP90Delta: round(o.lateP90HeroToOpponentMedianRatio - baseline.lateP90HeroToOpponentMedianRatio, 6),
    dominance3xDelta: round(o.heroDominance3xRate - baseline.heroDominance3xRate, 6),
    dominance5xDelta: round(o.heroDominance5xRate - baseline.heroDominance5xRate, 6),
  };
  return {
    id,
    disposition: gates ? (id === BASELINE ? "baseline-pass" : "manual-review-only") : "reject",
    relativeToBaseline: relative,
    rationale: gates
      ? "Evidence-only gates passed. Review paired-seed tail suppression against total and tail-specific injection before any larger run or production proposal."
      : "Safety, integrity, bounds, or telemetry gate failed.",
  };
}

const decisions = Object.fromEntries(CANDIDATES.map(id => [id, decision(id)]));
const action = {
  productionChange: "none",
  automaticPromotion: false,
  baselinePolicy: BASELINE,
  note: "Tail catch-up candidates are test-only. Production remains median-v2 80/75 with a 60BB cap.",
};
const summary = {
  schemaVersion: 2,
  version: VERSION,
  candidates: CANDIDATES,
  validationPassed,
  validationErrors,
  ooda: {
    observe: observations,
    orient: orientations,
    pairedSeedReview: pairedSeedReviews,
    decide: decisions,
    act: action,
  },
};

const rows = CANDIDATES.map(id => {
  const o = observations[id];
  return `| ${id} | ${o.completedHands} | ${o.aiReplacedSeats} | ${o.estimatedInjectedBb.toFixed(0)} | ${o.tailAppliedSeats} | ${o.tailExtraInjectedBb.toFixed(0)} | ${o.maximumEntryBb.toFixed(1)}/${o.allowedMaximumEntryBb.toFixed(0)} | ${o.lateAverageHeroToOpponentMedianRatio.toFixed(2)}x | ${o.lateP90HeroToOpponentMedianRatio.toFixed(2)}x | ${(o.heroDominance3xRate * 100).toFixed(1)}% | ${(o.heroDominance5xRate * 100).toFixed(1)}% | ${orientations[id].gatesPassed ? "pass" : "fail"} |`;
});
const pairedRows = CANDIDATES.filter(id => id !== BASELINE).map(id => {
  const review = pairedSeedReviews[id];
  return `| ${id} | ${review.pairedSeeds} | ${review.challengerBetterLateSeeds} | ${review.baselineBetterLateSeeds} | ${review.seedMedianLateAverage.baseline.toFixed(3)}x | ${review.seedMedianLateAverage.challenger.toFixed(3)}x | ${review.pairedMedianDelta.lateAverageHeroToOpponentMedianRatio.toFixed(3)}x | ${review.pairedMedianDelta.lateP90HeroToOpponentMedianRatio.toFixed(3)}x | ${(review.pairedMedianDelta.heroDominance3xRate * 100).toFixed(2)}% | ${(review.pairedMedianDelta.heroDominance5xRate * 100).toFixed(2)}% | ${review.totalEstimatedInjectedBb.deltaPct.toFixed(2)}% | ${review.lateDirectionConsensus} |`;
});
const markdown = [
  "# Poker Economy Tail Catch-up Benchmark",
  "",
  `- Validation: ${validationPassed ? "passed" : "failed"}`,
  "- Production change: none",
  "- Production baseline remains: 80/75, 60BB max",
  "- Tail candidates only use public visible stack ratios and only affect replacement stacks in this benchmark.",
  "",
  "| Candidate | Hands | Replaced | Injected BB | Tail-applied seats | Tail extra BB | Max/allowed BB | Late hero/opp | Late P90 | Hero >=3x | Hero >=5x | Gates |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...rows,
  "",
  "## Paired-seed robustness",
  "",
  "Negative deltas favor the challenger for all domination metrics.",
  "",
  "| Challenger | Pairs | Challenger better | Baseline better | Baseline seed median | Challenger seed median | Median late delta | Median P90 delta | Median >=3x delta | Median >=5x delta | Injection delta | Consensus |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...pairedRows,
  "",
  "## Act",
  "",
  "- Do not change production from this benchmark automatically.",
  "- Prefer a challenger only if paired-seed direction improves, >=3x/>=5x tails improve, and added injection remains materially below the failed global 80/80 and 80/85 experiments.",
  "- Any promising candidate must pass a larger paired evidence stage before a production PR.",
  ...(validationErrors.length ? ["", "## Validation errors", "", ...validationErrors.map(error => `- ${error}`)] : []),
].join("\n");

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "poker-economy-ooda-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(join(outputDirectory, "poker-economy-ooda-v1.md"), `${markdown}\n`, "utf8");
console.log(markdown);
if (!validationPassed) process.exitCode = 1;
