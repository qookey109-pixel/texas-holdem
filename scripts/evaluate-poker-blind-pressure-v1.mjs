import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const BASELINE = "baseline";
const DEFAULT_CANDIDATES = ["baseline", "gentle50", "gentle100"];
const CANDIDATES = (process.env.POKER_BLIND_PRESSURE_CANDIDATES || DEFAULT_CANDIDATES.join(","))
  .split(",").map(value => value.trim()).filter(Boolean);
const inputDirectory = resolve(process.argv[2] || "blind-pressure-results");
const outputDirectory = resolve(process.argv[3] || "blind-pressure-summary");

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round(value, digits = 6) { const f = 10 ** digits; return Math.round(finite(value) * f) / f; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function percentile(values, q) { const s = values.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return 0; return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * q) - 1))]; }
function median(values) { const s = values.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return 0; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function walk(directory) { const files = []; for (const entry of readdirSync(directory)) { const path = join(directory, entry); const stat = statSync(path); if (stat.isDirectory()) files.push(...walk(path)); else files.push(path); } return files; }
function samples(report) { return Array.isArray(report?.blindPressure?.handSamples) ? report.blindPressure.handSamples : []; }
function ratioValues(list) { return list.map(sample => Number(sample?.heroToOpponentMedianRatio)).filter(Number.isFinite); }

if (!CANDIDATES.includes(BASELINE)) throw new Error(`Candidates must include ${BASELINE}`);
const files = walk(inputDirectory).filter(path => /^poker-blind-pressure-.+-shard-\d+\.json$/.test(basename(path))).sort();
if (!files.length) throw new Error(`No blind pressure JSON found under ${inputDirectory}`);
const groups = new Map(CANDIDATES.map(id => [id, []]));
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const id = report?.blindPressure?.policy?.id;
  if (groups.has(id)) groups.get(id).push(report);
}

function windowSamples(report, startHand = 121) {
  return samples(report).filter(sample => finite(sample.handNumber) >= startHand);
}

function seedMetrics(report) {
  const post = windowSamples(report, 121);
  const positive = post.filter(sample => finite(sample.heroBb) > 0);
  const heroBbs = positive.map(sample => finite(sample.heroBb));
  const ratios = ratioValues(positive);
  const threats = positive.map(sample => Number(sample.opponentThreatShare)).filter(Number.isFinite);
  const last50Ratios = ratioValues(samples(report).slice(-50));
  const finalRatio = ratioValues(samples(report).slice(-1))[0] || 0;
  return {
    shardIndex: finite(report.shardIndex, -1),
    post120HeroBbP90: round(percentile(heroBbs, 0.90)),
    post120HeroBbP95: round(percentile(heroBbs, 0.95)),
    post120RatioP90: round(percentile(ratios, 0.90)),
    post120Dominance3x: round(ratios.filter(value => value >= 3).length / Math.max(1, ratios.length)),
    post120Dominance5x: round(ratios.filter(value => value >= 5).length / Math.max(1, ratios.length)),
    post120Dominance10x: round(ratios.filter(value => value >= 10).length / Math.max(1, ratios.length)),
    post120OpponentThreatP10: round(percentile(threats, 0.10)),
    last50AverageRatio: round(average(last50Ratios)),
    finalRatio: round(finalRatio),
    heroBustedRate: round(post.filter(sample => sample.heroBusted).length / Math.max(1, post.length)),
  };
}

function observe(id) {
  const reports = groups.get(id) || [];
  const configuredHands = reports.reduce((sum, report) => sum + finite(report.configuredHands), 0);
  const completedHands = reports.reduce((sum, report) => sum + finite(report.completedHands), 0);
  const failures = reports.reduce((sum, report) => sum + (report.failures?.length || 0) + (report.schedulerErrors?.length || 0), 0);
  const fairnessFailures = reports.filter(report => !report.fairness?.publicInformationOnly || !report.blindPressure?.publicInformationOnly).length;
  const integrityFailures = reports.filter(report => !report.telemetryIntegrity?.integrityPassed).length;
  const productionMutationFailures = reports.filter(report => report.blindPressure?.productionSourceChanged || !report.blindPressure?.productionConfigUnchanged).length;
  const all = reports.flatMap(samples);
  const post = all.filter(sample => finite(sample.handNumber) >= 121);
  const positive = post.filter(sample => finite(sample.heroBb) > 0);
  const heroBbs = positive.map(sample => finite(sample.heroBb));
  const ratios = ratioValues(positive);
  const threats = positive.map(sample => Number(sample.opponentThreatShare)).filter(Number.isFinite);
  const maxBlind = Math.max(0, ...all.map(sample => finite(sample.bigBlind)));
  const replacedSeats = reports.reduce((sum, report) => sum + finite(report.blindPressure?.replacedSeats), 0);
  const replacementBbWeighted = reports.reduce((sum, report) => sum + finite(report.blindPressure?.averageReplacementEntryBb) * finite(report.blindPressure?.replacedSeats), 0);
  return {
    id,
    shards: reports.length,
    configuredHands,
    completedHands,
    failures,
    fairnessFailures,
    integrityFailures,
    productionMutationFailures,
    maxBigBlind: maxBlind,
    finalBuyIn: all.length ? finite(all.at(-1)?.buyIn) : 0,
    heroBustedRate: round(post.filter(sample => sample.heroBusted).length / Math.max(1, post.length)),
    post120HeroBbP90: round(percentile(heroBbs, 0.90)),
    post120HeroBbP95: round(percentile(heroBbs, 0.95)),
    post120RatioP90: round(percentile(ratios, 0.90)),
    post120Dominance3x: round(ratios.filter(value => value >= 3).length / Math.max(1, ratios.length)),
    post120Dominance5x: round(ratios.filter(value => value >= 5).length / Math.max(1, ratios.length)),
    post120Dominance10x: round(ratios.filter(value => value >= 10).length / Math.max(1, ratios.length)),
    post120OpponentThreatP10: round(percentile(threats, 0.10)),
    replacedSeats,
    averageReplacementEntryBb: replacedSeats ? round(replacementBbWeighted / replacedSeats) : 0,
    maximumReplacementEntryBb: Math.max(0, ...reports.map(report => finite(report.blindPressure?.maximumReplacementEntryBb))),
  };
}

const observations = Object.fromEntries(CANDIDATES.map(id => [id, observe(id)]));
const lowerBetter = ["post120HeroBbP90", "post120HeroBbP95", "post120RatioP90", "post120Dominance3x", "post120Dominance5x", "post120Dominance10x", "last50AverageRatio", "finalRatio"];
const higherBetter = ["post120OpponentThreatP10"];

function pairedReview(id) {
  const baseMap = new Map((groups.get(BASELINE) || []).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const candidateMap = new Map((groups.get(id) || []).map(report => [finite(report.shardIndex, -1), seedMetrics(report)]));
  const indexes = [...baseMap.keys()].filter(index => index >= 0 && candidateMap.has(index)).sort((a, b) => a - b);
  const pairs = indexes.map(shardIndex => {
    const base = baseMap.get(shardIndex);
    const candidate = candidateMap.get(shardIndex);
    const deltas = {};
    let wins = 0;
    let losses = 0;
    for (const key of lowerBetter) {
      const d = round(candidate[key] - base[key]);
      deltas[key] = d;
      if (d < 0) wins += 1;
      if (d > 0) losses += 1;
    }
    for (const key of higherBetter) {
      const d = round(candidate[key] - base[key]);
      deltas[key] = d;
      if (d > 0) wins += 1;
      if (d < 0) losses += 1;
    }
    const bustDelta = round(candidate.heroBustedRate - base.heroBustedRate);
    return {
      shardIndex,
      baseline: base,
      challenger: candidate,
      deltas,
      heroBustedRateDelta: bustDelta,
      wins,
      losses,
      winner: wins > losses ? "challenger" : losses > wins ? "baseline" : "tie",
    };
  });
  const challengerBetterSeeds = pairs.filter(pair => pair.winner === "challenger").length;
  const baselineBetterSeeds = pairs.filter(pair => pair.winner === "baseline").length;
  const bustDeltas = pairs.map(pair => pair.heroBustedRateDelta);
  return {
    challengerId: id,
    pairedSeeds: pairs.length,
    challengerBetterSeeds,
    baselineBetterSeeds,
    tiedSeeds: pairs.length - challengerBetterSeeds - baselineBetterSeeds,
    directionConsensus: challengerBetterSeeds > baselineBetterSeeds ? "challenger" : baselineBetterSeeds > challengerBetterSeeds ? "baseline" : "tied",
    medianHeroBustDelta: round(median(bustDeltas)),
    maximumHeroBustDelta: bustDeltas.length ? round(Math.max(...bustDeltas)) : 0,
    medianObjectiveDelta: Object.fromEntries([...lowerBetter, ...higherBetter].map(key => [key, round(median(pairs.map(pair => pair.deltas[key])))])),
    pairs,
  };
}

const pairedSeedReview = Object.fromEntries(CANDIDATES.filter(id => id !== BASELINE).map(id => [id, pairedReview(id)]));
const validationErrors = [];
for (const observation of Object.values(observations)) {
  if (observation.completedHands !== observation.configuredHands) validationErrors.push(`${observation.id}: incomplete hands`);
  if (observation.failures || observation.fairnessFailures || observation.integrityFailures || observation.productionMutationFailures) validationErrors.push(`${observation.id}: safety/integrity failure`);
}
for (const [id, review] of Object.entries(pairedSeedReview)) {
  if (review.maximumHeroBustDelta > 0.10) validationErrors.push(`${id}: at least one paired seed increased post-120 hero bust rate by more than 10pp (${round(review.maximumHeroBustDelta * 100, 2)}pp max)`);
}
const summary = {
  schemaVersion: 1,
  version: "1.1.0-gentle-bounded",
  candidates: CANDIDATES,
  validationPassed: validationErrors.length === 0,
  validationErrors,
  observations,
  pairedSeedReview,
  promotion: "NONE",
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "poker-blind-pressure-v1.json"), `${JSON.stringify(summary, null, 2)}\n`);
const lines = ["# Poker Blind Pressure V1", "", `Validation: ${summary.validationPassed ? "PASS" : "FAIL"}`, "", "Production is unchanged; this report never promotes automatically.", ""];
for (const id of CANDIDATES) {
  const o = observations[id];
  lines.push(
    `## ${id}`,
    `- hands: ${o.completedHands}/${o.configuredHands}`,
    `- max big blind: ${o.maxBigBlind}`,
    `- post-120 Hero BB P90 / P95: ${o.post120HeroBbP90} / ${o.post120HeroBbP95}`,
    `- post-120 Hero ratio P90: ${o.post120RatioP90}`,
    `- post-120 >=3x / >=5x / >=10x: ${(o.post120Dominance3x * 100).toFixed(2)}% / ${(o.post120Dominance5x * 100).toFixed(2)}% / ${(o.post120Dominance10x * 100).toFixed(2)}%`,
    `- post-120 opponent-threat P10: ${(o.post120OpponentThreatP10 * 100).toFixed(2)}% of Hero stack`,
    `- post-120 Hero busted-hand rate: ${(o.heroBustedRate * 100).toFixed(2)}%`,
    `- replacement entry average/max: ${o.averageReplacementEntryBb}/${o.maximumReplacementEntryBb} BB`,
    "",
  );
}
for (const [id, review] of Object.entries(pairedSeedReview)) {
  lines.push(
    `## Paired ${id}`,
    `- seeds: ${review.pairedSeeds}`,
    `- challenger / baseline / tie: ${review.challengerBetterSeeds} / ${review.baselineBetterSeeds} / ${review.tiedSeeds}`,
    `- direction: ${review.directionConsensus}`,
    `- median Hero bust delta: ${(review.medianHeroBustDelta * 100).toFixed(2)} pp`,
    `- maximum single-seed Hero bust delta: ${(review.maximumHeroBustDelta * 100).toFixed(2)} pp`,
    "",
  );
}
if (validationErrors.length) lines.push("## Safety gate failures", "", ...validationErrors.map(error => `- ${error}`), "");
writeFileSync(join(outputDirectory, "poker-blind-pressure-v1.md"), `${lines.join("\n")}\n`);
if (!summary.validationPassed) process.exitCode = 1;
