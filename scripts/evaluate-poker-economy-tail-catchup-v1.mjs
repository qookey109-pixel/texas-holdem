import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "1.4.0-tail-fullbuyin";
const BASELINE = "80-75";
const DEFAULT_CANDIDATES = ["80-75", "tail5-fullbuyin", "tail5-budgeted"];
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
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percentDelta(value, baselineValue) {
  return baselineValue !== 0 ? round(((value / baselineValue) - 1) * 100, 4) : 0;
}

function longestStreak(values, predicate) {
  let best = 0;
  let current = 0;
  for (const value of values) {
    current = predicate(value) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
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

function runawayMetrics(values) {
  return {
    average: round(average(values), 6),
    p90: round(percentile(values, 0.90), 6),
    dominance3xRate: round(rate(values.filter(value => value >= 3).length, values.length), 6),
    dominance5xRate: round(rate(values.filter(value => value >= 5).length, values.length), 6),
    excess3x: round(average(values.map(value => Math.max(0, value - 3))), 6),
    excess5x: round(average(values.map(value => Math.max(0, value - 5))), 6),
    longest3xStreak: longestStreak(values, value => value >= 3),
    longest5xStreak: longestStreak(values, value => value >= 5),
  };
}

function seedMetrics(report) {
  const samples = stackSamples(report);
  const allRatios = ratios(samples);
  const lateStart = Math.floor(samples.length * 0.8);
  const last100Start = Math.max(0, samples.length - Math.min(100, samples.length));
  const lateRatios = ratios(samples.slice(lateStart));
  const last100Ratios = ratios(samples.slice(last100Start));
  const replacedSeats = finite(report?.economyOoda?.aiReplacedSeats);
  const averageEntryBb = finite(report?.economyOoda?.averageEntryBb);
  const late = runawayMetrics(lateRatios);
  return {
    shardIndex: finite(report?.shardIndex, -1),
    lateAverage: late.average,
    lateP90: late.p90,
    lateDominance3xRate: late.dominance3xRate,
    lateDominance5xRate: late.dominance5xRate,
    lateExcess3x: late.excess3x,
    lateExcess5x: late.excess5x,
    lateLongest3xStreak: late.longest3xStreak,
    lateLongest5xStreak: late.longest5xStreak,
    last100Average: round(average(last100Ratios), 6),
    finalRatio: round(allRatios.at(-1) ?? 0, 6),
    injectedBb: round(replacedSeats * averageEntryBb, 4),
    replacementEvents: finite(report?.economyOoda?.aiReplacementEvents),
    replacedSeats,
    tailEligibleEvents: finite(report?.economyOoda?.tailEligibleEvents),
    tailCooldownSuppressedEvents: finite(report?.economyOoda?.tailCooldownSuppressedEvents),
    tailAppliedEvents: finite(report?.economyOoda?.tailAppliedEvents),
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
  const tailEligibleEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailEligibleEvents), 0);
  const tailCooldownSuppressedEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailCooldownSuppressedEvents), 0);
  const tailAppliedEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailAppliedEvents), 0);
  const tailAppliedSeats = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailAppliedSeats), 0);
  const tailExtraInjectedBb = reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailExtraInjectedBb), 0);
  const maximumEntryBb = reports.reduce((max, report) => Math.max(max, finite(report.economyOoda?.maximumEntryBb)), 0);
  const allowedMaximumEntryBb = reports.reduce((max, report) => Math.max(max, finite(report.economyOoda?.policy?.maxBigBlinds, 60)), 60);
  const allSamples = reports.flatMap(stackSamples);
  const allRatios = ratios(allSamples);
  const lateRatios = reports.flatMap(report => {
    const samples = stackSamples(report);
    return ratios(samples.slice(Math.floor(samples.length * 0.8)));
  });
  const fingerprints = new Set(reports.map(report => report.deterministicFingerprint).filter(Boolean));
  const late = runawayMetrics(lateRatios);
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
    maximumEntryBb: round(maximumEntryBb, 4),
    allowedMaximumEntryBb: round(allowedMaximumEntryBb, 4),
    tailEligibleEvents,
    tailCooldownSuppressedEvents,
    tailAppliedEvents,
    tailAppliedSeats,
    tailExtraInjectedBb: round(tailExtraInjectedBb, 4),
    handStackSamples: allSamples.length,
    averageHeroToOpponentMedianRatio: round(average(allRatios), 6),
    heroDominance3xRate: round(rate(allRatios.filter(value => value >= 3).length, allRatios.length), 6),
    heroDominance5xRate: round(rate(allRatios.filter(value => value >= 5).length, allRatios.length), 6),
    lateAverageHeroToOpponentMedianRatio: late.average,
    lateP90HeroToOpponentMedianRatio: late.p90,
    lateHeroDominance3xRate: late.dominance3xRate,
    lateHeroDominance5xRate: late.dominance5xRate,
    lateExcess3x: late.excess3x,
    lateExcess5x: late.excess5x,
    lateLongest3xStreak: late.longest3xStreak,
    lateLongest5xStreak: late.longest5xStreak,
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
    && observation.allowedMaximumEntryBb <= 60;
  const telemetryReady = observation.completedHands > 0
    && observation.shards > 0
    && observation.fingerprints === observation.shards
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

const RUNAWAY_OBJECTIVES = [
  "lateDominance3xRate",
  "lateDominance5xRate",
  "lateExcess3x",
  "lateExcess5x",
  "lateLongest3xStreak",
  "lateLongest5xStreak",
  "last100Average",
  "finalRatio",
];

function pairedSeedReview(challengerId) {
  const baseByShard = new Map(groups.get(BASELINE).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const challengerByShard = new Map(groups.get(challengerId).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const indexes = [...baseByShard.keys()].filter(index => index >= 0 && challengerByShard.has(index)).sort((a, b) => a - b);
  const pairs = indexes.map(shardIndex => {
    const current = baseByShard.get(shardIndex);
    const challenger = challengerByShard.get(shardIndex);
    const delta = {};
    for (const key of Object.keys(current)) {
      if (key === "shardIndex") continue;
      if (Number.isFinite(current[key]) && Number.isFinite(challenger[key])) delta[key] = round(challenger[key] - current[key], 6);
    }
    let improved = 0;
    let worsened = 0;
    let tied = 0;
    for (const key of RUNAWAY_OBJECTIVES) {
      if (delta[key] < 0) improved += 1;
      else if (delta[key] > 0) worsened += 1;
      else tied += 1;
    }
    const runawayDirection = improved > worsened ? "challenger" : worsened > improved ? "baseline" : "tied";
    return { shardIndex, baseline: current, challenger, delta, runawayDirection, improvedObjectives: improved, worsenedObjectives: worsened, tiedObjectives: tied };
  });

  const metricConsensus = Object.fromEntries(RUNAWAY_OBJECTIVES.map(key => {
    const deltas = pairs.map(pair => pair.delta[key]);
    return [key, {
      challengerBetter: deltas.filter(value => value < 0).length,
      baselineBetter: deltas.filter(value => value > 0).length,
      tied: deltas.filter(value => value === 0).length,
      medianDelta: round(median(deltas), 6),
    }];
  }));

  const challengerBetterSeeds = pairs.filter(pair => pair.runawayDirection === "challenger").length;
  const baselineBetterSeeds = pairs.filter(pair => pair.runawayDirection === "baseline").length;
  const tiedSeeds = pairs.length - challengerBetterSeeds - baselineBetterSeeds;
  const baselineInjection = pairs.reduce((sum, pair) => sum + pair.baseline.injectedBb, 0);
  const challengerInjection = pairs.reduce((sum, pair) => sum + pair.challenger.injectedBb, 0);

  return {
    challengerId,
    pairedSeeds: pairs.length,
    runawayObjectives: RUNAWAY_OBJECTIVES,
    challengerBetterSeeds,
    baselineBetterSeeds,
    tiedSeeds,
    runawayDirectionConsensus: challengerBetterSeeds > baselineBetterSeeds
      ? "challenger"
      : baselineBetterSeeds > challengerBetterSeeds ? "baseline" : "tied",
    metricConsensus,
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

const validationErrors = [];
for (const id of CANDIDATES) {
  if (!groups.get(id)?.length) validationErrors.push(`${id}: no reports`);
  if (!orientations[id]?.gatesPassed) validationErrors.push(`${id}: validation gates failed`);
}
const validationPassed = validationErrors.length === 0;

const decisions = Object.fromEntries(CANDIDATES.map(id => {
  if (id === BASELINE) return [id, {
    id,
    disposition: validationPassed ? "baseline-pass" : "reject",
    rationale: "Production baseline remains unchanged; this benchmark is evidence-only.",
  }];
  const review = pairedSeedReviews[id];
  return [id, {
    id,
    disposition: validationPassed ? "manual-review-only" : "reject",
    rationale: validationPassed
      ? `Robust runaway review: ${review.challengerBetterSeeds} challenger-better / ${review.baselineBetterSeeds} baseline-better / ${review.tiedSeeds} tied paired seeds. No automatic promotion.`
      : "Validation failed.",
    relativeToBaseline: {
      injectionDeltaPct: percentDelta(observations[id].estimatedInjectedBb, baseline.estimatedInjectedBb),
      lateAverageDelta: round(observations[id].lateAverageHeroToOpponentMedianRatio - baseline.lateAverageHeroToOpponentMedianRatio, 6),
      lateP90Delta: round(observations[id].lateP90HeroToOpponentMedianRatio - baseline.lateP90HeroToOpponentMedianRatio, 6),
      late3xDelta: round(observations[id].lateHeroDominance3xRate - baseline.lateHeroDominance3xRate, 6),
      late5xDelta: round(observations[id].lateHeroDominance5xRate - baseline.lateHeroDominance5xRate, 6),
    },
  }];
}));

const summary = {
  schemaVersion: 3,
  version: VERSION,
  candidates: CANDIDATES,
  validationPassed,
  validationErrors,
  ooda: {
    observe: observations,
    orient: orientations,
    pairedSeedReview: pairedSeedReviews,
    decide: decisions,
    act: {
      automaticPromotion: false,
      productionChange: "none",
      baselinePolicy: BASELINE,
      note: "Full-buyin tail candidates are test-only. Production remains median-v2 80/75 with a 60BB hard cap.",
    },
  },
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "poker-economy-ooda-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const lines = [
  "# Poker Economy Full-buyin Tail Catch-up Benchmark",
  "",
  `- Validation: ${validationPassed ? "passed" : "failed"}`,
  "- Production change: none",
  "- Production baseline remains: 80/75, 60BB hard cap",
  "- Tail candidates use public visible stack ratios only.",
  "",
  "| Candidate | Hands | Replaced | Injected BB | Tail eligible | Cooldown suppressed | Tail applied | Tail extra BB | Max/allowed BB | Late hero/opp | Late P90 | Late >=3x | Late >=5x | Gates |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...CANDIDATES.map(id => {
    const o = observations[id];
    return `| ${id} | ${o.completedHands} | ${o.aiReplacedSeats} | ${Math.round(o.estimatedInjectedBb)} | ${o.tailEligibleEvents} | ${o.tailCooldownSuppressedEvents} | ${o.tailAppliedEvents} | ${Math.round(o.tailExtraInjectedBb)} | ${o.maximumEntryBb.toFixed(1)}/${o.allowedMaximumEntryBb.toFixed(0)} | ${o.lateAverageHeroToOpponentMedianRatio.toFixed(2)}x | ${o.lateP90HeroToOpponentMedianRatio.toFixed(2)}x | ${(o.lateHeroDominance3xRate * 100).toFixed(1)}% | ${(o.lateHeroDominance5xRate * 100).toFixed(1)}% | ${orientations[id].gatesPassed ? "pass" : "fail"} |`;
  }),
  "",
  "## Paired-seed runaway robustness",
  "",
  "Each paired seed is classified across eight late-runaway objectives: late >=3x/>=5x rate, excess severity above 3x/5x, longest 3x/5x streak, last-100 average ratio, and final ratio. Lower is better.",
  "",
  "| Challenger | Pairs | Challenger better | Baseline better | Tied | Injection delta | Consensus |",
  "|---|---:|---:|---:|---:|---:|---|",
  ...Object.values(pairedSeedReviews).map(review => (
    `| ${review.challengerId} | ${review.pairedSeeds} | ${review.challengerBetterSeeds} | ${review.baselineBetterSeeds} | ${review.tiedSeeds} | ${review.totalEstimatedInjectedBb.deltaPct.toFixed(2)}% | ${review.runawayDirectionConsensus} |`
  )),
  "",
  "## Act",
  "",
  "- Do not change production automatically.",
  "- A candidate may advance only if safety gates pass and the multi-metric paired-seed direction is stable enough to justify the next stage.",
  "- Keep the 60BB production hard cap unchanged in this benchmark.",
];
writeFileSync(join(outputDirectory, "poker-economy-ooda-v1.md"), `${lines.join("\n")}\n`, "utf8");

if (!validationPassed) {
  console.error(validationErrors.join("\n"));
  process.exitCode = 1;
}