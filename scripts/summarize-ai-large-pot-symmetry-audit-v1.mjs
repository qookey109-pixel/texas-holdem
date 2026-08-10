import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "ai-large-pot-symmetry-results");
const outputDirectory = resolve(process.argv[3] || "ai-large-pot-symmetry-summary");

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

function summarizeSide(events, seatHands) {
  const positive = events.filter(event => finite(event.deltaBb) > 0);
  const grossGainBb = sum(positive.map(event => event.deltaBb));
  const gain20Bb = sum(positive.filter(event => finite(event.deltaBb) >= 20).map(event => event.deltaBb));
  const gain50Bb = sum(positive.filter(event => finite(event.deltaBb) >= 50).map(event => event.deltaBb));
  const showdownGainBb = sum(positive.filter(event => event.showdown).map(event => event.deltaBb));
  const bustGainBb = sum(positive.filter(event => finite(event.aiBustCount) > 0).map(event => event.deltaBb));
  const large20Events = positive.filter(event => finite(event.deltaBb) >= 20).length;
  const large50Events = positive.filter(event => finite(event.deltaBb) >= 50).length;
  return {
    seatHands,
    winningEvents: positive.length,
    grossGainBb: round(grossGainBb, 4),
    grossGainPer100SeatHands: seatHands ? round(grossGainBb / seatHands * 100, 4) : 0,
    win20Events: large20Events,
    win20RatePer100SeatHands: seatHands ? round(large20Events / seatHands * 100, 4) : 0,
    win50Events: large50Events,
    win50RatePer100SeatHands: seatHands ? round(large50Events / seatHands * 100, 4) : 0,
    win20GainShare: grossGainBb ? round(gain20Bb / grossGainBb) : 0,
    win50GainShare: grossGainBb ? round(gain50Bb / grossGainBb) : 0,
    showdownGainShare: grossGainBb ? round(showdownGainBb / grossGainBb) : 0,
    bustLinkedGainShare: grossGainBb ? round(bustGainBb / grossGainBb) : 0,
    maximumGainBb: positive.length ? round(Math.max(...positive.map(event => finite(event.deltaBb))), 4) : 0,
  };
}

function ratio(numerator, denominator) {
  if (denominator <= 0) return numerator > 0 ? null : 1;
  return round(numerator / denominator);
}

function summarizeShard(report) {
  const audit = report.largePotSymmetryAudit || {};
  const heroEvents = [];
  const aiEvents = [];
  let heroSeatHands = 0;
  let aiSeatHands = 0;
  let conservationFailures = 0;

  for (const hand of audit.hands || []) {
    if (Math.abs(finite(hand.deltaSumBb)) > 0.05) conservationFailures += 1;
    for (const delta of hand.playerDeltas || []) {
      const event = {
        ...delta,
        showdown: Boolean(hand.showdown),
        aiBustCount: finite(hand.aiBustCount),
        handNumber: hand.handNumber,
      };
      if (delta.isHuman) {
        heroSeatHands += 1;
        heroEvents.push(event);
      } else {
        aiSeatHands += 1;
        aiEvents.push(event);
      }
    }
  }

  const hero = summarizeSide(heroEvents, heroSeatHands);
  const ai = summarizeSide(aiEvents, aiSeatHands);
  const win50RateRatio = ratio(hero.win50RatePer100SeatHands, ai.win50RatePer100SeatHands);
  const win20RateRatio = ratio(hero.win20RatePer100SeatHands, ai.win20RatePer100SeatHands);
  const win50ShareDiff = round(hero.win50GainShare - ai.win50GainShare);
  const win20ShareDiff = round(hero.win20GainShare - ai.win20GainShare);
  const showdownShareDiff = round(hero.showdownGainShare - ai.showdownGainShare);
  const sampleSufficient = heroSeatHands >= 200 && aiSeatHands >= 1_000 && hero.winningEvents >= 20 && ai.winningEvents >= 100;
  const heroExcess = sampleSufficient
    && win50RateRatio !== null
    && win50RateRatio >= 1.5
    && win50ShareDiff >= 0.10;
  const structuralSymmetry = sampleSufficient
    && win50RateRatio !== null
    && win50RateRatio >= 0.70
    && win50RateRatio <= 1.40
    && Math.abs(win50ShareDiff) <= 0.12;

  return {
    shardIndex: report.shardIndex,
    heroProfile: report.heroProfile,
    hero,
    ai,
    win20RateRatio,
    win50RateRatio,
    win20ShareDiff,
    win50ShareDiff,
    showdownShareDiff,
    conservationFailures,
    sampleSufficient,
    heroExcess,
    structuralSymmetry,
  };
}

const files = walk(inputDirectory)
  .filter(path => /^ai-large-pot-symmetry-audit-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No large-pot symmetry audit shard JSON found under ${inputDirectory}`);

let configuredHands = 0;
let completedHands = 0;
let failures = 0;
let schedulerErrors = 0;
let fairnessFailures = 0;
let integrityFailures = 0;
let auditErrors = 0;
const fingerprints = new Set();
const shardSummaries = [];

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  configuredHands += finite(report.configuredHands);
  completedHands += finite(report.completedHands);
  failures += report.failures?.length || 0;
  schedulerErrors += report.schedulerErrors?.length || 0;
  if (!report.fairness?.publicInformationOnly) fairnessFailures += 1;
  if (!report.telemetryIntegrity?.integrityPassed) integrityFailures += 1;
  if (report.deterministicFingerprint) fingerprints.add(report.deterministicFingerprint);
  auditErrors += report.largePotSymmetryAudit?.errors?.length || 0;
  shardSummaries.push(summarizeShard(report));
}

const sufficient = shardSummaries.filter(row => row.sampleSufficient);
const excess = sufficient.filter(row => row.heroExcess);
const symmetric = sufficient.filter(row => row.structuralSymmetry);
const conservationFailures = sum(shardSummaries.map(row => row.conservationFailures));
const sampleSufficient = completedHands === configuredHands && configuredHands >= 1_000 && sufficient.length >= 3;
let disposition = "NEED_MORE_SYMMETRY_SAMPLE";
if (sampleSufficient) {
  if (excess.length >= 3) disposition = "HERO_LARGE_POT_CAPTURE_EXCESS";
  else if (symmetric.length >= 3) disposition = "LARGE_POT_CAPTURE_STRUCTURALLY_SYMMETRIC";
  else disposition = "MIXED_LARGE_POT_CAPTURE";
}

const summary = {
  version: "1.0.0",
  observationOnly: true,
  causalClaim: false,
  configuredHands,
  completedHands,
  shards: files.length,
  failures,
  schedulerErrors,
  fairnessFailures,
  integrityFailures,
  auditErrors,
  conservationFailures,
  fingerprints: fingerprints.size,
  sampleSufficient,
  disposition,
  heroExcessShards: excess.length,
  symmetricShards: symmetric.length,
  shardSummaries,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ai-large-pot-symmetry-audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

const md = [
  "# AI Hero vs AI Large-Pot Symmetry Audit",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Shards: ${files.length}`,
  `- Sample sufficient: ${sampleSufficient ? "YES" : "NO"}`,
  `- Disposition: ${disposition}`,
  `- Hero-excess shards: ${excess.length}; structurally-symmetric shards: ${symmetric.length}`,
  "- Interpretation: observation only. Large-pot capture is normalized by seat-hands so one Hero seat can be compared with the pooled AI seats.",
  "",
  "| Shard | Profile | Hero 50BB rate | AI 50BB rate | Rate ratio | Hero 50BB gain share | AI share | Share diff | Hero showdown share | AI showdown share | Signal |",
  "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...shardSummaries.map(row => {
    const signal = row.heroExcess ? "HERO EXCESS" : row.structuralSymmetry ? "SYMMETRIC" : "MIXED";
    return `| ${row.shardIndex} | ${row.heroProfile} | ${row.hero.win50RatePer100SeatHands.toFixed(2)} | ${row.ai.win50RatePer100SeatHands.toFixed(2)} | ${row.win50RateRatio === null ? "INF" : row.win50RateRatio.toFixed(2)}x | ${(row.hero.win50GainShare * 100).toFixed(1)}% | ${(row.ai.win50GainShare * 100).toFixed(1)}% | ${(row.win50ShareDiff * 100).toFixed(1)} pp | ${(row.hero.showdownGainShare * 100).toFixed(1)}% | ${(row.ai.showdownGainShare * 100).toFixed(1)}% | ${signal} |`;
  }),
  "",
  "## 20BB+ capture",
  "",
  "| Shard | Hero 20BB rate | AI 20BB rate | Rate ratio | Hero gain share | AI gain share | Diff |",
  "|---:|---:|---:|---:|---:|---:|---:|",
  ...shardSummaries.map(row => `| ${row.shardIndex} | ${row.hero.win20RatePer100SeatHands.toFixed(2)} | ${row.ai.win20RatePer100SeatHands.toFixed(2)} | ${row.win20RateRatio === null ? "INF" : row.win20RateRatio.toFixed(2)}x | ${(row.hero.win20GainShare * 100).toFixed(1)}% | ${(row.ai.win20GainShare * 100).toFixed(1)}% | ${(row.win20ShareDiff * 100).toFixed(1)} pp |`),
  "",
  `Validation failures: gameplay=${failures}, scheduler=${schedulerErrors}, fairness=${fairnessFailures}, integrity=${integrityFailures}, audit=${auditErrors}, chip-conservation=${conservationFailures}.`,
].join("\n");
writeFileSync(join(outputDirectory, "ai-large-pot-symmetry-audit-summary.md"), `${md}\n`);
console.log(md);
