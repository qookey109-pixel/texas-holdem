import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const BASELINE = "80-75";
const CANDIDATES = ["80-75", "tail5-floor20", "tail5-floor20-budgeted"];
const inputDir = resolve(process.argv[2] || "economy-tail-floor-results");
const outputDir = resolve(process.argv[3] || "economy-tail-floor-summary");
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 6) => { const f = 10 ** digits; return Math.round(finite(value) * f) / f; };
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
function median(values) { const s = [...values].sort((a, b) => a - b); if (!s.length) return 0; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function walk(dir) { const out = []; for (const entry of readdirSync(dir)) { const path = join(dir, entry); const stat = statSync(path); if (stat.isDirectory()) out.push(...walk(path)); else out.push(path); } return out; }
function samples(report) { return Array.isArray(report?.economyOoda?.handStackSamples) ? report.economyOoda.handStackSamples : []; }
function ratios(report) { return samples(report).map(sample => Number(sample?.heroToOpponentMedianRatio)).filter(Number.isFinite); }
function longest(values, predicate) { let best = 0, current = 0; for (const value of values) { if (predicate(value)) { current += 1; best = Math.max(best, current); } else current = 0; } return best; }
function seedMetrics(report) {
  const all = ratios(report);
  const late = all.slice(Math.floor(all.length * 0.8));
  const last100 = all.slice(-100);
  const excess = (values, threshold) => average(values.filter(value => value >= threshold).map(value => value - threshold));
  return {
    shardIndex: finite(report?.shardIndex, -1),
    lateDominance3xRate: round(late.filter(v => v >= 3).length / Math.max(1, late.length)),
    lateDominance5xRate: round(late.filter(v => v >= 5).length / Math.max(1, late.length)),
    lateExcess3x: round(excess(late, 3)),
    lateExcess5x: round(excess(late, 5)),
    lateLongest3xStreak: longest(late, value => value >= 3),
    lateLongest5xStreak: longest(late, value => value >= 5),
    last100Average: round(average(last100)),
    finalRatio: round(all.at(-1) || 0),
    injectedBb: round(finite(report?.economyOoda?.aiReplacedSeats) * finite(report?.economyOoda?.averageEntryBb), 4),
    tailExtraBb: round(finite(report?.economyOoda?.tailExtraInjectedBb), 4),
  };
}

const files = walk(inputDir).filter(path => /^poker-economy-ooda-.+-shard-\d+\.json$/.test(basename(path)));
if (!files.length) throw new Error(`No tail-floor shard JSON under ${inputDir}`);
const groups = new Map(CANDIDATES.map(id => [id, []]));
for (const path of files) { const report = JSON.parse(readFileSync(path, "utf8")); const id = report?.economyOoda?.policy?.id; if (groups.has(id)) groups.get(id).push(report); }

function observe(id) {
  const reports = groups.get(id);
  const completedHands = reports.reduce((sum, report) => sum + finite(report.completedHands), 0);
  const configuredHands = reports.reduce((sum, report) => sum + finite(report.configuredHands), 0);
  const failures = reports.reduce((sum, report) => sum + (report.failures?.length || 0) + (report.schedulerErrors?.length || 0), 0);
  const fairnessFailures = reports.filter(report => !report.fairness?.publicInformationOnly || !report.economyOoda?.publicInformationOnly).length;
  const integrityFailures = reports.filter(report => !report.telemetryIntegrity?.integrityPassed).length;
  const mutationFailures = reports.filter(report => report.economyOoda?.productionBehaviorChanged || !report.economyOoda?.productionConfigUnchanged || finite(report.economyOoda?.productionConfig?.maxBigBlinds, 60) !== 60).length;
  const aiReplacedSeats = reports.reduce((sum, report) => sum + finite(report.economyOoda?.aiReplacedSeats), 0);
  const injectedBb = reports.reduce((sum, report) => sum + finite(report.economyOoda?.aiReplacedSeats) * finite(report.economyOoda?.averageEntryBb), 0);
  const allRatios = reports.flatMap(ratios);
  const lateRatios = reports.flatMap(report => { const values = ratios(report); return values.slice(Math.floor(values.length * 0.8)); });
  return {
    id,
    shards: reports.length,
    configuredHands,
    completedHands,
    failures,
    fairnessFailures,
    integrityFailures,
    mutationFailures,
    estimatedInjectedBb: round(injectedBb, 4),
    averageEntryBb: aiReplacedSeats ? round(injectedBb / aiReplacedSeats, 4) : 0,
    maximumEntryBb: Math.max(0, ...reports.map(report => finite(report.economyOoda?.maximumEntryBb))),
    tailEligibleEvents: reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailEligibleEvents), 0),
    tailCooldownSuppressedEvents: reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailCooldownSuppressedEvents), 0),
    tailAppliedEvents: reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailAppliedEvents), 0),
    tailAppliedSeats: reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailAppliedSeats), 0),
    tailExtraInjectedBb: round(reports.reduce((sum, report) => sum + finite(report.economyOoda?.tailExtraInjectedBb), 0), 4),
    heroDominance3xRate: round(allRatios.filter(v => v >= 3).length / Math.max(1, allRatios.length)),
    heroDominance5xRate: round(allRatios.filter(v => v >= 5).length / Math.max(1, allRatios.length)),
    lateAverageHeroToOpponentMedianRatio: round(average(lateRatios)),
    lateHeroDominance3xRate: round(lateRatios.filter(v => v >= 3).length / Math.max(1, lateRatios.length)),
    lateHeroDominance5xRate: round(lateRatios.filter(v => v >= 5).length / Math.max(1, lateRatios.length)),
  };
}

const observations = Object.fromEntries(CANDIDATES.map(id => [id, observe(id)]));
const baseline = observations[BASELINE];
const objectives = ["lateDominance3xRate", "lateDominance5xRate", "lateExcess3x", "lateExcess5x", "lateLongest3xStreak", "lateLongest5xStreak", "last100Average", "finalRatio"];
function pairedReview(id) {
  const baseMap = new Map(groups.get(BASELINE).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const challengerMap = new Map(groups.get(id).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const indexes = [...baseMap.keys()].filter(index => index >= 0 && challengerMap.has(index)).sort((a, b) => a - b);
  const pairs = indexes.map(shardIndex => {
    const base = baseMap.get(shardIndex), challenger = challengerMap.get(shardIndex);
    const deltas = Object.fromEntries(objectives.map(key => [key, round(challenger[key] - base[key])]));
    const wins = objectives.filter(key => deltas[key] < 0).length;
    const losses = objectives.filter(key => deltas[key] > 0).length;
    return { shardIndex, baseline: base, challenger, deltas, winner: wins > losses ? "challenger" : losses > wins ? "baseline" : "tie", wins, losses };
  });
  const challengerBetterSeeds = pairs.filter(pair => pair.winner === "challenger").length;
  const baselineBetterSeeds = pairs.filter(pair => pair.winner === "baseline").length;
  const baselineInjection = pairs.reduce((sum, pair) => sum + pair.baseline.injectedBb, 0);
  const challengerInjection = pairs.reduce((sum, pair) => sum + pair.challenger.injectedBb, 0);
  return {
    challengerId: id,
    pairedSeeds: pairs.length,
    challengerBetterSeeds,
    baselineBetterSeeds,
    tiedSeeds: pairs.length - challengerBetterSeeds - baselineBetterSeeds,
    directionConsensus: challengerBetterSeeds > baselineBetterSeeds ? "challenger" : baselineBetterSeeds > challengerBetterSeeds ? "baseline" : "tied",
    medianObjectiveDelta: Object.fromEntries(objectives.map(key => [key, round(median(pairs.map(pair => pair.deltas[key])))])),
    totalEstimatedInjectedBb: { baseline: round(baselineInjection, 4), challenger: round(challengerInjection, 4), deltaPct: baselineInjection ? round(((challengerInjection / baselineInjection) - 1) * 100, 4) : 0 },
    pairs,
  };
}
const pairedSeedReview = Object.fromEntries(CANDIDATES.filter(id => id !== BASELINE).map(id => [id, pairedReview(id)]));
const validationErrors = [];
for (const observation of Object.values(observations)) {
  if (observation.completedHands !== observation.configuredHands) validationErrors.push(`${observation.id}: incomplete hands`);
  if (observation.failures || observation.fairnessFailures || observation.integrityFailures || observation.mutationFailures) validationErrors.push(`${observation.id}: safety gate failure`);
  if (observation.maximumEntryBb > 60) validationErrors.push(`${observation.id}: exceeded 60BB hard cap`);
}
const summary = { schemaVersion: 1, version: "1.0.0-tail-floor20", candidates: CANDIDATES, validationPassed: validationErrors.length === 0, validationErrors, observations, pairedSeedReview };
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "poker-economy-tail-floor-v1.json"), `${JSON.stringify(summary, null, 2)}\n`);
const lines = ["# Poker Economy Tail Floor V1", "", `Validation: ${summary.validationPassed ? "PASS" : "FAIL"}`, ""];
for (const id of CANDIDATES) { const o = observations[id]; lines.push(`## ${id}`, `- hands: ${o.completedHands}/${o.configuredHands}`, `- tail applied events: ${o.tailAppliedEvents}`, `- tail extra BB: ${o.tailExtraInjectedBb}`, `- injection: ${o.estimatedInjectedBb}BB`, `- late >=3x: ${(o.lateHeroDominance3xRate * 100).toFixed(2)}%`, `- late >=5x: ${(o.lateHeroDominance5xRate * 100).toFixed(2)}%`, ""); }
for (const [id, review] of Object.entries(pairedSeedReview)) lines.push(`## Paired ${id}`, `- seeds: ${review.pairedSeeds}`, `- challenger/baseline/tie: ${review.challengerBetterSeeds}/${review.baselineBetterSeeds}/${review.tiedSeeds}`, `- injection delta: ${review.totalEstimatedInjectedBb.deltaPct}%`, "");
writeFileSync(join(outputDir, "poker-economy-tail-floor-v1.md"), `${lines.join("\n")}\n`);
if (!summary.validationPassed) process.exitCode = 1;
