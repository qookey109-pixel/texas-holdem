import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "1.1.0";
const DEFAULT_CANDIDATES = ["80-75", "85-75", "80-85", "85-85"];
const BASELINE = "80-75";
const CANDIDATES = (process.env.POKER_ECONOMY_OODA_CANDIDATES || DEFAULT_CANDIDATES.join(","))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const inputDirectory = resolve(process.argv[2] || "economy-ooda-results");
const outputDirectory = resolve(process.argv[3] || "economy-ooda-summary");

if (!CANDIDATES.includes(BASELINE)) throw new Error(`Poker Economy OODA candidates must include baseline ${BASELINE}`);

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

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function stackSamples(report) {
  return Array.isArray(report?.economyOoda?.handStackSamples)
    ? report.economyOoda.handStackSamples
    : [];
}

function validRatios(samples) {
  return samples
    .map(sample => sample?.heroToOpponentMedianRatio)
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
}

if (!statSync(inputDirectory).isDirectory()) throw new Error(`Economy OODA input is not a directory: ${inputDirectory}`);
const files = walk(inputDirectory)
  .filter(path => /^poker-economy-ooda-.+-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No Poker Economy OODA shard JSON found under ${inputDirectory}`);

const groups = new Map(CANDIDATES.map(id => [id, []]));
const globalErrors = [];
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const id = report?.economyOoda?.policy?.id;
  if (!groups.has(id)) continue;
  groups.get(id).push(report);
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
  )).length;
  const aiReplacedSeats = reports.reduce((sum, report) => sum + finite(report.economyOoda?.aiReplacedSeats), 0);
  const aiReplacementEvents = reports.reduce((sum, report) => sum + finite(report.economyOoda?.aiReplacementEvents), 0);
  const entryBbWeighted = reports.reduce((sum, report) => (
    sum + finite(report.economyOoda?.averageEntryBb) * finite(report.economyOoda?.aiReplacedSeats)
  ), 0);
  const medianBbWeighted = reports.reduce((sum, report) => (
    sum + finite(report.economyOoda?.averageTableMedianBb) * finite(report.economyOoda?.aiReplacedSeats)
  ), 0);
  const maximumEntryBb = reports.reduce((max, report) => Math.max(max, finite(report.economyOoda?.maximumEntryBb)), 0);
  const minimumEntryValues = reports
    .map(report => report.economyOoda?.minimumEntryBb)
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
  const allStackSamples = reports.flatMap(stackSamples);
  const allRatios = validRatios(allStackSamples);
  const lateStackSamples = reports.flatMap(report => {
    const samples = stackSamples(report);
    const start = Math.floor(samples.length * 0.8);
    return samples.slice(start);
  });
  const lateRatios = validRatios(lateStackSamples);
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
  const stage = reports[0]?.economyOoda?.stage || "unknown";
  const fingerprints = new Set(reports.map(report => report.deterministicFingerprint).filter(Boolean));
  return {
    id,
    stage,
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
    estimatedInjectedBb: round(entryBbWeighted, 4),
    averageEntryBb: aiReplacedSeats ? round(entryBbWeighted / aiReplacedSeats, 4) : 0,
    averageTableMedianBb: aiReplacedSeats ? round(medianBbWeighted / aiReplacedSeats, 4) : 0,
    entryToMedianRatio: aiReplacedSeats && medianBbWeighted > 0 ? round(entryBbWeighted / medianBbWeighted, 6) : 0,
    minimumEntryBb: minimumEntryValues.length ? Math.min(...minimumEntryValues) : null,
    maximumEntryBb: round(maximumEntryBb, 4),
    handStackSamples: allStackSamples.length,
    averageHeroBb: round(average(allStackSamples.map(sample => finite(sample?.heroBb))), 4),
    averageOpponentMedianBb: round(average(allStackSamples.map(sample => finite(sample?.opponentMedianBb))), 4),
    averageHeroToOpponentMedianRatio: round(average(allRatios), 6),
    p90HeroToOpponentMedianRatio: round(percentile(allRatios, 0.90), 6),
    maximumHeroToOpponentMedianRatio: allRatios.length ? round(Math.max(...allRatios), 6) : null,
    lateAverageHeroToOpponentMedianRatio: round(average(lateRatios), 6),
    lateP90HeroToOpponentMedianRatio: round(percentile(lateRatios, 0.90), 6),
    finalAverageHeroToOpponentMedianRatio: round(average(finalRatios), 6),
    heroDominance2xRate: round(rate(allRatios.filter(value => value >= 2).length, allRatios.length), 6),
    heroDominance3xRate: round(rate(allRatios.filter(value => value >= 3).length, allRatios.length), 6),
    heroDominance5xRate: round(rate(allRatios.filter(value => value >= 5).length, allRatios.length), 6),
    allOpponentsBustedRate: round(rate(allStackSamples.filter(sample => sample?.allOpponentsBusted).length, allStackSamples.length), 6),
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
  const economyBoundsPassed = observation.maximumEntryBb <= 60
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

function percentDelta(value, baselineValue) {
  return baselineValue !== 0 ? round(((value / baselineValue) - 1) * 100, 4) : 0;
}

function decide(id) {
  const observation = observations[id];
  const orientation = orientations[id];
  const completed = observation.completedHands;
  const evidenceBand = completed >= 10_000 ? "evidence" : completed >= 1_000 ? "deep" : completed >= 200 ? "screen" : "smoke";
  const relative = {
    estimatedInjectedBbDeltaPct: percentDelta(observation.estimatedInjectedBb, baseline.estimatedInjectedBb),
    averageEntryBbDelta: round(observation.averageEntryBb - baseline.averageEntryBb, 4),
    lateHeroToOpponentMedianDelta: round(
      observation.lateAverageHeroToOpponentMedianRatio - baseline.lateAverageHeroToOpponentMedianRatio,
      6,
    ),
    lateHeroToOpponentMedianDeltaPct: percentDelta(
      observation.lateAverageHeroToOpponentMedianRatio,
      baseline.lateAverageHeroToOpponentMedianRatio,
    ),
    heroDominance3xRateDelta: round(observation.heroDominance3xRate - baseline.heroDominance3xRate, 6),
    aggregateRoleBb100Delta: round(observation.aggregateRoleBb100 - baseline.aggregateRoleBb100, 4),
    aggregateRoleBustRateDelta: round(observation.aggregateRoleBustRate - baseline.aggregateRoleBustRate, 6),
  };
  let disposition = "reject";
  let rationale = "Safety, integrity, bounds, or telemetry gate failed.";
  if (orientation.gatesPassed) {
    disposition = evidenceBand === "smoke" ? "advance-to-screen" : evidenceBand === "screen" ? "advance-to-deep" : "manual-review-only";
    rationale = evidenceBand === "smoke"
      ? "Smoke gates passed; collect a larger staged sample before interpreting performance."
      : evidenceBand === "screen"
        ? "Screen gates passed; collect deep evidence before any policy recommendation."
        : "Long-run gates passed; compare hero domination, injection cost, uncertainty, and gameplay quality manually. Production remains unchanged by this runner.";
  }
  if (id === BASELINE && orientation.gatesPassed) {
    disposition = evidenceBand === "smoke" ? "baseline-pass" : disposition;
  }
  return { id, evidenceBand, disposition, relativeToBaseline: relative, rationale };
}

const decisions = Object.fromEntries(CANDIDATES.map(id => [id, decide(id)]));
const missingCandidates = CANDIDATES.filter(id => groups.get(id).length === 0);
if (missingCandidates.length) globalErrors.push(`missing candidates: ${missingCandidates.join(", ")}`);
const validationPassed = globalErrors.length === 0 && CANDIDATES.every(id => orientations[id].gatesPassed);
const action = {
  productionChange: "none",
  automaticPromotion: false,
  baselinePolicy: BASELINE,
  nextStageCandidates: CANDIDATES.filter(id => ["baseline-pass", "advance-to-screen", "advance-to-deep", "manual-review-only"].includes(decisions[id].disposition)),
  note: "Poker Economy OODA V1 is evidence-only. It never changes production ReplacementStackBalance settings automatically.",
};

const summary = {
  schemaVersion: 1,
  version: VERSION,
  candidates: CANDIDATES,
  validationPassed,
  validationErrors: globalErrors,
  ooda: {
    observe: observations,
    orient: orientations,
    decide: decisions,
    act: action,
  },
};

const rows = CANDIDATES.map(id => {
  const o = observations[id];
  const d = decisions[id];
  return `| ${id} | ${o.completedHands} | ${o.shards} | ${o.aiReplacedSeats} | ${o.estimatedInjectedBb.toFixed(0)} | ${o.averageEntryBb.toFixed(2)} | ${o.lateAverageHeroToOpponentMedianRatio.toFixed(2)}x | ${o.lateP90HeroToOpponentMedianRatio.toFixed(2)}x | ${(o.heroDominance3xRate * 100).toFixed(1)}% | ${o.aggregateRoleBb100.toFixed(2)} | ${(o.aggregateRoleBustRate * 100).toFixed(2)}% | ${orientations[id].gatesPassed ? "pass" : "fail"} | ${d.disposition} |`;
});
const markdown = [
  "# Poker Economy OODA Long-Run Runner V1",
  "",
  `- Validation: ${validationPassed ? "passed" : "failed"}`,
  `- Production change: ${action.productionChange}`,
  `- Automatic promotion: ${action.automaticPromotion ? "yes" : "no"}`,
  `- Baseline: ${BASELINE}`,
  "",
  "| Candidate | Hands | Shards | Replaced seats | Est. injected BB | Avg entry BB | Late hero/opp median | Late P90 | Hero >=3x | Aggregate role BB/100 | Bust rate | Gates | Decision |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ...rows,
  "",
  "## Act",
  "",
  `- Keep production policy unchanged: ${BASELINE}.`,
  `- Next-stage candidates: ${action.nextStageCandidates.join(", ") || "none"}.`,
  "- Lower late hero/opponent-median ratios and lower hero >=3x rates are preferred when injection and safety remain bounded.",
  "- Any production parameter change requires separate evidence review and a normal validated PR.",
  ...(globalErrors.length ? ["", "## Validation errors", "", ...globalErrors.map(error => `- ${error}`)] : []),
].join("\n");

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "poker-economy-ooda-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(join(outputDirectory, "poker-economy-ooda-v1.md"), `${markdown}\n`, "utf8");
console.log(markdown);
if (!validationPassed) process.exitCode = 1;