import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "ai-hero-gain-results");
const outputDirectory = resolve(process.argv[3] || "ai-hero-gain-summary");

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
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

function sum(values) {
  return values.reduce((total, value) => total + finite(value), 0);
}

function gainShare(hands, predicate) {
  const positive = hands.filter(hand => finite(hand.heroDeltaBb) > 0);
  const gross = sum(positive.map(hand => hand.heroDeltaBb));
  if (!gross) return 0;
  return round(sum(positive.filter(predicate).map(hand => hand.heroDeltaBb)) / gross);
}

function topShare(positiveHands, fraction) {
  const gross = sum(positiveHands.map(hand => hand.heroDeltaBb));
  if (!gross || !positiveHands.length) return 0;
  const sorted = [...positiveHands].sort((left, right) => right.heroDeltaBb - left.heroDeltaBb);
  const count = Math.max(1, Math.ceil(sorted.length * fraction));
  return round(sum(sorted.slice(0, count).map(hand => hand.heroDeltaBb)) / gross);
}

function summarizeHands(hands, shardIndex = null, heroProfile = "aggregate") {
  const positive = hands.filter(hand => finite(hand.heroDeltaBb) > 0);
  const negative = hands.filter(hand => finite(hand.heroDeltaBb) < 0);
  const grossGainBb = round(sum(positive.map(hand => hand.heroDeltaBb)), 4);
  const grossLossBb = round(-sum(negative.map(hand => hand.heroDeltaBb)), 4);
  const bustGainShare = gainShare(hands, hand => finite(hand.aiBustCount) > 0);
  const showdownGainShare = gainShare(hands, hand => Boolean(hand.showdown));
  const win20Share = gainShare(hands, hand => finite(hand.heroDeltaBb) >= 20);
  const win50Share = gainShare(hands, hand => finite(hand.heroDeltaBb) >= 50);
  const crosses3 = hands.filter(hand => hand.crosses3x);
  const crosses5 = hands.filter(hand => hand.crosses5x);
  const crossing5GainBb = crosses5.length ? round(sum(crosses5.map(hand => hand.heroDeltaBb)) / crosses5.length, 4) : 0;
  const crossing5BustShare = crosses5.length ? round(crosses5.filter(hand => finite(hand.aiBustCount) > 0).length / crosses5.length) : 0;
  const crossing5LargeShare = crosses5.length ? round(crosses5.filter(hand => finite(hand.heroDeltaBb) >= 20).length / crosses5.length) : 0;
  const crossing5ShowdownShare = crosses5.length ? round(crosses5.filter(hand => Boolean(hand.showdown)).length / crosses5.length) : 0;
  const top5GainShare = topShare(positive, 0.05);
  const top10GainShare = topShare(positive, 0.10);
  const sampleSufficient = positive.length >= 20;
  const outlierSignal = sampleSufficient && top5GainShare >= 0.40 && top10GainShare >= 0.55;
  const bustSignal = sampleSufficient && bustGainShare >= 0.40;

  return {
    shardIndex,
    heroProfile,
    hands: hands.length,
    winningHands: positive.length,
    losingHands: negative.length,
    grossGainBb,
    grossLossBb,
    netBb: round(grossGainBb - grossLossBb, 4),
    top5GainShare,
    top10GainShare,
    win20Share,
    win50Share,
    bustGainShare,
    showdownGainShare,
    crossings3x: crosses3.length,
    crossings5x: crosses5.length,
    crossing5AverageHeroGainBb: crossing5GainBb,
    crossing5BustShare,
    crossing5LargeWinShare: crossing5LargeShare,
    crossing5ShowdownShare,
    sampleSufficient,
    outlierSignal,
    bustSignal,
  };
}

const files = walk(inputDirectory)
  .filter(path => /^ai-hero-gain-audit-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No Hero gain audit shard JSON found under ${inputDirectory}`);

let configuredHands = 0;
let completedHands = 0;
let failures = 0;
let schedulerErrors = 0;
let fairnessFailures = 0;
let integrityFailures = 0;
let auditErrors = 0;
const fingerprints = new Set();
const shardSummaries = [];
const allHands = [];

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  configuredHands += finite(report.configuredHands);
  completedHands += finite(report.completedHands);
  failures += report.failures?.length || 0;
  schedulerErrors += report.schedulerErrors?.length || 0;
  if (!report.fairness?.publicInformationOnly) fairnessFailures += 1;
  if (!report.telemetryIntegrity?.integrityPassed) integrityFailures += 1;
  if (report.deterministicFingerprint) fingerprints.add(report.deterministicFingerprint);
  const audit = report.heroGainAudit || {};
  auditErrors += audit.errors?.length || 0;
  const hands = Array.isArray(audit.hands) ? audit.hands : [];
  allHands.push(...hands.map(hand => ({ ...hand, shardIndex: report.shardIndex, heroProfile: report.heroProfile })));
  shardSummaries.push(summarizeHands(hands, report.shardIndex, report.heroProfile));
}

const aggregate = summarizeHands(allHands);
const sufficientShards = shardSummaries.filter(shard => shard.sampleSufficient);
const outlierShards = sufficientShards.filter(shard => shard.outlierSignal);
const bustShards = sufficientShards.filter(shard => shard.bustSignal);
const sampleSufficient = completedHands === configuredHands && configuredHands >= 1_000 && sufficientShards.length >= 3;
let disposition = "NEED_MORE_GAIN_SAMPLE";
if (sampleSufficient) {
  if (outlierShards.length >= 3) disposition = "OUTLIER_GAIN_CONCENTRATION";
  else if (bustShards.length >= 3) disposition = "BUST_LINKED_GAIN_CONCENTRATION";
  else if (outlierShards.length || bustShards.length) disposition = "MIXED_GAIN_SOURCE";
  else disposition = "DIFFUSE_GAIN_ACCUMULATION";
}

const topPositiveHands = allHands
  .filter(hand => finite(hand.heroDeltaBb) > 0)
  .sort((left, right) => right.heroDeltaBb - left.heroDeltaBb)
  .slice(0, 20)
  .map(hand => ({
    shardIndex: hand.shardIndex,
    heroProfile: hand.heroProfile,
    handNumber: hand.handNumber,
    startBand: hand.startBand,
    heroDeltaBb: hand.heroDeltaBb,
    aiBustCount: hand.aiBustCount,
    showdown: hand.showdown,
    startRatio: hand.startRatio,
    endRatio: hand.endRatio,
    crosses3x: hand.crosses3x,
    crosses5x: hand.crosses5x,
    largestOpponentLossBb: hand.largestOpponentLossBb,
    largestOpponentLossName: hand.largestOpponentLossName,
  }));

const summary = {
  version: "1.0.0",
  observationOnly: true,
  causalClaim: false,
  shards: files.length,
  configuredHands,
  completedHands,
  failures,
  schedulerErrors,
  fairnessFailures,
  integrityFailures,
  auditErrors,
  fingerprints: fingerprints.size,
  sampleSufficient,
  disposition,
  aggregate,
  shardSummaries,
  topPositiveHands,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ai-hero-gain-concentration-audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

const md = [
  "# AI Hero Gain Concentration Audit",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Shards: ${files.length}`,
  `- Matched deterministic paths sufficient: ${sampleSufficient ? "YES" : "NO"}`,
  `- Disposition: ${disposition}`,
  "- Interpretation: observation only; identifies where Hero chip gains accumulate and does not by itself justify a gameplay change.",
  "",
  "## Per-shard gain source",
  "",
  "| Shard | Hero profile | Wins | Gross gain BB | Top 5% share | Top 10% share | >=20BB share | >=50BB share | Bust-linked share | Showdown share | Cross 5x | Signal |",
  "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...shardSummaries.map(row => {
    const signal = row.outlierSignal ? "OUTLIER" : row.bustSignal ? "BUST" : "DIFFUSE";
    return `| ${row.shardIndex} | ${row.heroProfile} | ${row.winningHands} | ${row.grossGainBb.toFixed(1)} | ${(row.top5GainShare * 100).toFixed(1)}% | ${(row.top10GainShare * 100).toFixed(1)}% | ${(row.win20Share * 100).toFixed(1)}% | ${(row.win50Share * 100).toFixed(1)}% | ${(row.bustGainShare * 100).toFixed(1)}% | ${(row.showdownGainShare * 100).toFixed(1)}% | ${row.crossings5x} | ${signal} |`;
  }),
  "",
  "## Aggregate descriptive metrics",
  "",
  `- Hero winning hands: ${aggregate.winningHands}`,
  `- Gross Hero gains: ${aggregate.grossGainBb.toFixed(1)} BB`,
  `- Top 5% winning-hand gain share: ${(aggregate.top5GainShare * 100).toFixed(1)}%`,
  `- Top 10% winning-hand gain share: ${(aggregate.top10GainShare * 100).toFixed(1)}%`,
  `- Gain share from >=20BB wins: ${(aggregate.win20Share * 100).toFixed(1)}%`,
  `- Gain share from >=50BB wins: ${(aggregate.win50Share * 100).toFixed(1)}%`,
  `- Gain share on AI-bust hands: ${(aggregate.bustGainShare * 100).toFixed(1)}%`,
  `- Gain share on showdown hands: ${(aggregate.showdownGainShare * 100).toFixed(1)}%`,
  `- 5x crossings: ${aggregate.crossings5x}; avg Hero delta on crossing hand: ${aggregate.crossing5AverageHeroGainBb.toFixed(2)} BB`,
  `- 5x crossings with >=20BB Hero gain: ${(aggregate.crossing5LargeWinShare * 100).toFixed(1)}%`,
  `- 5x crossings with AI bust: ${(aggregate.crossing5BustShare * 100).toFixed(1)}%`,
  "",
  "## Largest Hero gain hands",
  "",
  "| Shard | Profile | Hand | Start band | Hero +BB | Busts | Showdown | Ratio start -> end | Cross 5x |",
  "|---:|---|---:|---|---:|---:|---|---|---|",
  ...topPositiveHands.slice(0, 12).map(hand => `| ${hand.shardIndex} | ${hand.heroProfile} | ${hand.handNumber} | ${hand.startBand} | ${finite(hand.heroDeltaBb).toFixed(1)} | ${hand.aiBustCount} | ${hand.showdown ? "YES" : "NO"} | ${finite(hand.startRatio).toFixed(2)} -> ${finite(hand.endRatio).toFixed(2)} | ${hand.crosses5x ? "YES" : "NO"} |`),
  "",
  `Validation failures: gameplay=${failures}, scheduler=${schedulerErrors}, fairness=${fairnessFailures}, integrity=${integrityFailures}, audit=${auditErrors}.`,
].join("\n");

writeFileSync(join(outputDirectory, "ai-hero-gain-concentration-audit-summary.md"), `${md}\n`);
console.log(md);
