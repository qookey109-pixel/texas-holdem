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

const files = walk(inputDirectory)
  .filter(path => /^ai-replacement-churn-audit-shard-\d+\.json$/.test(basename(path)))
  .sort();

if (!files.length) throw new Error(`No replacement-churn audit shard JSON found under ${inputDirectory}`);

const aggregate = Object.fromEntries(KINDS.map(kind => [kind, emptyGroup()]));
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

  for (const anchor of audit.anchors || []) {
    const kind = KINDS.includes(anchor.kind) ? anchor.kind : null;
    const band = BANDS.includes(anchor.band) ? anchor.band : "unknown";
    if (!kind) continue;
    anchors += 1;
    for (const window of WINDOWS) {
      const outcome = anchor.outcomes?.[window];
      if (!outcome) continue;
      addOutcome(aggregate[kind][band][window], outcome);
    }
  }
}

const groups = Object.fromEntries(KINDS.map(kind => [
  kind,
  Object.fromEntries(BANDS.map(band => [
    band,
    Object.fromEntries(WINDOWS.map(window => [window, summarizeCell(aggregate[kind][band][window])])),
  ])),
]));

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

const comparisons = Object.fromEntries(BANDS.map(band => [
  band,
  Object.fromEntries(WINDOWS.map(window => [
    window,
    compare(groups.replacement[band][window], groups.control[band][window]),
  ])),
]));

const highBands = ["threeTo5x", "fivePlus"];
const highCells = [];
for (const band of highBands) {
  for (const window of [25, 50]) {
    const cell = comparisons[band][window];
    const minimumReplacement = window === 25 ? 10 : 8;
    const minimumControl = window === 25 ? 30 : 20;
    const sampleSufficient = cell.replacementSamples >= minimumReplacement && cell.controlSamples >= minimumControl;
    const runawayAssociation = sampleSufficient
      && cell.averageRatioDeltaDiff >= 1
      && cell.end5xRateDiff >= 0.05;
    highCells.push({ band, window, sampleSufficient, runawayAssociation, ...cell });
  }
}

const sufficientHighCells = highCells.filter(cell => cell.sampleSufficient);
const signalHighCells = sufficientHighCells.filter(cell => cell.runawayAssociation);
const sampleSufficient = replacementEvents >= 20 && sufficientHighCells.length >= 2;
const disposition = !sampleSufficient
  ? "NEED_MORE_CHURN_SAMPLE"
  : signalHighCells.length >= 2
    ? "CHURN_RUNAWAY_ASSOCIATION"
    : "NO_CLEAR_CHURN_RUNAWAY_ASSOCIATION";

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
  replacementEvents,
  replacementSeats,
  bustSeats,
  anchors,
  groups,
  comparisons,
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
  `- Sample sufficient: ${sampleSufficient ? "YES" : "NO"}`,
  `- Disposition: ${disposition}`,
  "- Interpretation: temporal association only; this audit does not establish causality and changes no gameplay.",
  "",
  "| Start band | Window | Replacement n | Control n | Ratio Δ diff | Hero BB Δ diff | Opp median BB Δ diff | End >=5x diff |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...BANDS.flatMap(band => WINDOWS.map(window => {
    const row = comparisons[band][window];
    return `| ${band} | ${window} | ${row.replacementSamples} | ${row.controlSamples} | ${row.averageRatioDeltaDiff.toFixed(3)} | ${row.averageHeroBbDeltaDiff.toFixed(2)} | ${row.averageOpponentMedianBbDeltaDiff.toFixed(2)} | ${(row.end5xRateDiff * 100).toFixed(2)} pp |`;
  })),
  "",
  "## High-lead gate cells",
  "",
  "| Band | Window | Replacement n | Control n | Sample | Runaway association |",
  "|---|---:|---:|---:|---|---|",
  ...highCells.map(row => `| ${row.band} | ${row.window} | ${row.replacementSamples} | ${row.controlSamples} | ${row.sampleSufficient ? "YES" : "NO"} | ${row.runawayAssociation ? "YES" : "NO"} |`),
  "",
  `Validation failures: gameplay=${failures}, scheduler=${schedulerErrors}, fairness=${fairnessFailures}, integrity=${integrityFailures}, audit=${auditErrors}.`,
].join("\n");

writeFileSync(join(outputDirectory, "ai-replacement-churn-audit-summary.md"), `${md}\n`);
console.log(md);
