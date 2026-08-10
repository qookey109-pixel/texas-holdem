import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "ai-replacement-churn-results");
const outputDirectory = resolve(process.argv[3] || "ai-replacement-churn-summary");
const KINDS = ["replacement", "control"];
const BANDS = ["under3x", "threeTo5x", "fivePlus", "unknown"];
const WINDOWS = [10, 25, 50];

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

function emptyCell() {
  return {
    samples: 0,
    ratioDeltaSum: 0,
    heroBbDeltaSum: 0,
    opponentMedianBbDeltaSum: 0,
    endRatioSum: 0,
    endRatioSamples: 0,
    end3x: 0,
    end5x: 0,
  };
}

function emptyGroup() {
  return Object.fromEntries(BANDS.map(band => [
    band,
    Object.fromEntries(WINDOWS.map(window => [window, emptyCell()])),
  ]));
}

function addOutcome(cell, outcome) {
  cell.samples += 1;
  if (Number.isFinite(Number(outcome.ratioDelta))) cell.ratioDeltaSum += Number(outcome.ratioDelta);
  cell.heroBbDeltaSum += finite(outcome.heroBbDelta);
  cell.opponentMedianBbDeltaSum += finite(outcome.opponentMedianBbDelta);
  if (Number.isFinite(Number(outcome.heroToOpponentMedianRatio))) {
    const ratio = Number(outcome.heroToOpponentMedianRatio);
    cell.endRatioSum += ratio;
    cell.endRatioSamples += 1;
    if (ratio >= 3) cell.end3x += 1;
    if (ratio >= 5) cell.end5x += 1;
  }
}

function summarizeCell(cell) {
  const n = cell.samples;
  return {
    samples: n,
    averageRatioDelta: n ? round(cell.ratioDeltaSum / n) : 0,
    averageHeroBbDelta: n ? round(cell.heroBbDeltaSum / n, 4) : 0,
    averageOpponentMedianBbDelta: n ? round(cell.opponentMedianBbDeltaSum / n, 4) : 0,
    averageEndRatio: cell.endRatioSamples ? round(cell.endRatioSum / cell.endRatioSamples) : 0,
    end3xRate: cell.endRatioSamples ? round(cell.end3x / cell.endRatioSamples) : 0,
    end5xRate: cell.endRatioSamples ? round(cell.end5x / cell.endRatioSamples) : 0,
  };
}

function compare(replacement, control) {
  return {
    replacementSamples: replacement.samples,
    controlSamples: control.samples,
    averageRatioDeltaDiff: round(replacement.averageRatioDelta - control.averageRatioDelta),
    averageHeroBbDeltaDiff: round(replacement.averageHeroBbDelta - control.averageHeroBbDelta, 4),
    averageOpponentMedianBbDeltaDiff: round(
      replacement.averageOpponentMedianBbDelta - control.averageOpponentMedianBbDelta,
      4,
    ),
    end3xRateDiff: round(replacement.end3xRate - control.end3xRate),
    end5xRateDiff: round(replacement.end5xRate - control.end5xRate),
  };
}

function objectiveDirection(diff) {
  const worse = [
    diff.averageRatioDeltaDiff >= 1,
    diff.averageHeroBbDeltaDiff >= 10,
    diff.averageOpponentMedianBbDeltaDiff <= -2,
    diff.end5xRateDiff >= 0.05,
  ].filter(Boolean).length;
  const better = [
    diff.averageRatioDeltaDiff <= -1,
    diff.averageHeroBbDeltaDiff <= -10,
    diff.averageOpponentMedianBbDeltaDiff >= 2,
    diff.end5xRateDiff <= -0.05,
  ].filter(Boolean).length;
  return {
    worseObjectives: worse,
    betterObjectives: better,
    direction: worse > better ? "replacement-worse" : better > worse ? "replacement-better" : "tied",
  };
}

const files = walk(inputDirectory)
  .filter(path => /^ai-replacement-churn-audit-shard-\d+\.json$/.test(basename(path)))
  .sort();

if (!files.length) throw new Error(`No replacement-churn audit shard JSON found under ${inputDirectory}`);

const pooledAggregate = Object.fromEntries(KINDS.map(kind => [kind, emptyGroup()]));
const shardReviews = [];
let configuredHands = 0;
let completedHands = 0;
let failures = 0;
let schedulerErrors = 0;
let fairnessFailures = 0;
let integrityFailures = 0;
let auditErrors = 0;
let replacementEvents = 0;
let replacementSeats = 0;
let bustSeats = 0;
let anchors = 0;
const fingerprints = new Set();

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  configuredHands += finite(report.configuredHands);
  completedHands += finite(report.completedHands);
  failures += report.failures?.length || 0;
  schedulerErrors += report.schedulerErrors?.length || 0;
  if (!report.fairness?.publicInformationOnly) fairnessFailures += 1;
  if (!report.telemetryIntegrity?.integrityPassed) integrityFailures += 1;
  if (report.deterministicFingerprint) fingerprints.add(report.deterministicFingerprint);

  const audit = report.replacementChurnAudit || {};
  auditErrors += audit.errors?.length || 0;
  replacementEvents += finite(audit.replacementEvents);
  replacementSeats += finite(audit.replacementSeats);
  bustSeats += finite(audit.bustSeats);

  const shardAggregate = Object.fromEntries(KINDS.map(kind => [kind, emptyGroup()]));
  for (const anchor of audit.anchors || []) {
    const kind = KINDS.includes(anchor.kind) ? anchor.kind : null;
    const band = BANDS.includes(anchor.band) ? anchor.band : "unknown";
    if (!kind) continue;
    anchors += 1;
    for (const window of WINDOWS) {
      const outcome = anchor.outcomes?.[window];
      if (!outcome) continue;
      addOutcome(shardAggregate[kind][band][window], outcome);
      addOutcome(pooledAggregate[kind][band][window], outcome);
    }
  }

  const cells = Object.fromEntries(BANDS.map(band => [
    band,
    Object.fromEntries(WINDOWS.map(window => {
      const replacement = summarizeCell(shardAggregate.replacement[band][window]);
      const control = summarizeCell(shardAggregate.control[band][window]);
      const diff = compare(replacement, control);
      const comparable = replacement.samples >= 3 && control.samples >= 10;
      return [window, {
        replacement,
        control,
        comparable,
        ...diff,
        ...(comparable ? objectiveDirection(diff) : {
          worseObjectives: 0,
          betterObjectives: 0,
          direction: "insufficient",
        }),
      }];
    })),
  ]));

  shardReviews.push({
    shardIndex: finite(report.shardIndex),
    heroProfile: report.heroProfile || "",
    replacementEvents: finite(audit.replacementEvents),
    replacementSeats: finite(audit.replacementSeats),
    cells,
  });
}

const pooledGroups = Object.fromEntries(KINDS.map(kind => [
  kind,
  Object.fromEntries(BANDS.map(band => [
    band,
    Object.fromEntries(WINDOWS.map(window => [window, summarizeCell(pooledAggregate[kind][band][window])])),
  ])),
]));

const pooledComparisons = Object.fromEntries(BANDS.map(band => [
  band,
  Object.fromEntries(WINDOWS.map(window => [
    window,
    compare(pooledGroups.replacement[band][window], pooledGroups.control[band][window]),
  ])),
]));

const matchedCells = Object.fromEntries(BANDS.map(band => [
  band,
  Object.fromEntries(WINDOWS.map(window => {
    const comparable = shardReviews
      .map(shard => ({ shardIndex: shard.shardIndex, heroProfile: shard.heroProfile, ...shard.cells[band][window] }))
      .filter(row => row.comparable);
    const replacementSamples = comparable.reduce((sum, row) => sum + row.replacementSamples, 0);
    const controlSamples = comparable.reduce((sum, row) => sum + row.controlSamples, 0);
    const worseShards = comparable.filter(row => row.direction === "replacement-worse").length;
    const betterShards = comparable.filter(row => row.direction === "replacement-better").length;
    const tiedShards = comparable.filter(row => row.direction === "tied").length;
    return [window, {
      comparableShards: comparable.length,
      replacementSamples,
      controlSamples,
      worseShards,
      betterShards,
      tiedShards,
      directionConsensus: worseShards > betterShards
        ? "replacement-worse"
        : betterShards > worseShards
          ? "replacement-better"
          : "mixed-or-tied",
      shards: comparable,
    }];
  })),
]));

const highCells = [];
for (const band of ["threeTo5x", "fivePlus"]) {
  for (const window of [25, 50]) {
    const matched = matchedCells[band][window];
    const sampleSufficient = matched.comparableShards >= 2
      && matched.replacementSamples >= 10
      && matched.controlSamples >= 30;
    const runawayAssociation = sampleSufficient
      && matched.worseShards >= 2
      && matched.worseShards > matched.betterShards;
    const improvementAssociation = sampleSufficient
      && matched.betterShards >= 2
      && matched.betterShards > matched.worseShards;
    highCells.push({
      band,
      window,
      sampleSufficient,
      runawayAssociation,
      improvementAssociation,
      comparableShards: matched.comparableShards,
      replacementSamples: matched.replacementSamples,
      controlSamples: matched.controlSamples,
      worseShards: matched.worseShards,
      betterShards: matched.betterShards,
      tiedShards: matched.tiedShards,
      directionConsensus: matched.directionConsensus,
    });
  }
}

const sufficientHighCells = highCells.filter(cell => cell.sampleSufficient);
const signalHighCells = sufficientHighCells.filter(cell => cell.runawayAssociation);
const improvementHighCells = sufficientHighCells.filter(cell => cell.improvementAssociation);
const sampleSufficient = replacementEvents >= 20 && sufficientHighCells.length >= 2;
const disposition = !sampleSufficient
  ? "NEED_MORE_MATCHED_CHURN_SAMPLE"
  : signalHighCells.length >= 2
    ? "CHURN_RUNAWAY_ASSOCIATION"
    : signalHighCells.length || improvementHighCells.length
      ? "MIXED_CHURN_ASSOCIATION"
      : "NO_CLEAR_CHURN_RUNAWAY_ASSOCIATION";

const summary = {
  version: "1.1.0",
  observationOnly: true,
  causalClaim: false,
  pairedPathRequired: true,
  shards: files.length,
  configuredHands,
  completedHands,
  failures,
  schedulerErrors,
  fairnessFailures,
  integrityFailures,
  auditErrors,
  fingerprints: fingerprints.size,
  replacementEvents,
  replacementSeats,
  bustSeats,
  anchors,
  pooledGroups,
  pooledComparisons,
  shardReviews,
  matchedCells,
  highCells,
  sampleSufficient,
  disposition,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  join(outputDirectory, "ai-replacement-churn-audit-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

const md = [
  "# AI Replacement Churn / Hero Runaway Audit",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Shards: ${files.length}`,
  `- Replacement events / seats: ${replacementEvents} / ${replacementSeats}`,
  `- AI bust seats observed: ${bustSeats}`,
  `- Audit anchors: ${anchors}`,
  `- Matched-path sample sufficient: ${sampleSufficient ? "YES" : "NO"}`,
  `- Disposition: ${disposition}`,
  "- Interpretation: temporal association only; pooled averages are descriptive and never override matched-shard direction.",
  "",
  "## Matched high-lead gate",
  "",
  "| Band | Window | Comparable shards | Repl n | Control n | Worse / Better / Tie | Consensus | Gate |",
  "|---|---:|---:|---:|---:|---:|---|---|",
  ...highCells.map(row => `| ${row.band} | ${row.window} | ${row.comparableShards} | ${row.replacementSamples} | ${row.controlSamples} | ${row.worseShards} / ${row.betterShards} / ${row.tiedShards} | ${row.directionConsensus} | ${row.sampleSufficient ? (row.runawayAssociation ? "RUNAWAY" : row.improvementAssociation ? "IMPROVEMENT" : "MIXED") : "LOW SAMPLE"} |`),
  "",
  "## Comparable shard details",
  "",
  "| Shard | Hero profile | Band | Window | Repl n | Control n | Ratio Δ diff | Hero BB Δ diff | Opp median BB Δ diff | End >=5x diff | Direction |",
  "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
  ...shardReviews.flatMap(shard => ["threeTo5x", "fivePlus"].flatMap(band => [25, 50].flatMap(window => {
    const row = shard.cells[band][window];
    if (!row.comparable) return [];
    return [`| ${shard.shardIndex} | ${shard.heroProfile} | ${band} | ${window} | ${row.replacementSamples} | ${row.controlSamples} | ${row.averageRatioDeltaDiff.toFixed(3)} | ${row.averageHeroBbDeltaDiff.toFixed(2)} | ${row.averageOpponentMedianBbDeltaDiff.toFixed(2)} | ${(row.end5xRateDiff * 100).toFixed(2)} pp | ${row.direction} |`];
  }))),
  "",
  `Validation failures: gameplay=${failures}, scheduler=${schedulerErrors}, fairness=${fairnessFailures}, integrity=${integrityFailures}, audit=${auditErrors}.`,
].join("\n");

writeFileSync(join(outputDirectory, "ai-replacement-churn-audit-summary.md"), `${md}\n`);
console.log(md);
