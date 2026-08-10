import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "ai-stack-pressure-results");
const outputDirectory = resolve(process.argv[3] || "ai-stack-pressure-summary");
const BAND_KEYS = ["under3x", "threeTo5x", "fivePlus"];
const ACTION_KEYS = ["fold", "check", "call", "raise", "allin", "other"];
const SPR_KEYS = ["shallow", "medium", "deep", "unknown"];
const CONTROLLED_SPR_KEYS = ["shallow", "medium", "deep"];
const PRESSURE_KEYS = ["free", "low", "medium", "high"];
const FACING_PRESSURE_KEYS = ["low", "medium", "high"];

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

function emptyCounts(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function emptyPressureCell() {
  return {
    actions: emptyCounts(ACTION_KEYS),
    totalActions: 0,
    voluntaryActions: 0,
    weightedPotOdds: 0,
    weightedNeededBb: 0,
  };
}

function emptySprCell() {
  return {
    actions: emptyCounts(ACTION_KEYS),
    totalActions: 0,
    voluntaryActions: 0,
    byPressure: Object.fromEntries(PRESSURE_KEYS.map(key => [key, emptyPressureCell()])),
  };
}

function emptyBand() {
  return {
    actions: emptyCounts(ACTION_KEYS),
    sprBands: emptyCounts(SPR_KEYS),
    bySpr: Object.fromEntries(SPR_KEYS.map(key => [key, emptySprCell()])),
    totalActions: 0,
    voluntaryActions: 0,
    weightedHeroLead: 0,
    weightedActorStackBb: 0,
    weightedEffectiveStackBb: 0,
    weightedEffectiveSpr: 0,
  };
}

const files = walk(inputDirectory)
  .filter(path => /^ai-stack-pressure-audit-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No stack-pressure audit shard JSON found under ${inputDirectory}`);

const aggregate = Object.fromEntries(BAND_KEYS.map(key => [key, emptyBand()]));
let configuredHands = 0;
let completedHands = 0;
let failures = 0;
let schedulerErrors = 0;
let fairnessFailures = 0;
let integrityFailures = 0;
let totalActions = 0;
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
  const audit = report.stackPressureAudit || {};
  totalActions += finite(audit.totalActions);

  for (const key of BAND_KEYS) {
    const source = audit.bands?.[key] || {};
    const target = aggregate[key];
    const actions = finite(source.totalActions);
    target.totalActions += actions;
    target.voluntaryActions += finite(source.voluntaryActions);
    for (const action of ACTION_KEYS) target.actions[action] += finite(source.actions?.[action]);
    for (const spr of SPR_KEYS) {
      target.sprBands[spr] += finite(source.sprBands?.[spr]);
      const sourceCell = source.bySpr?.[spr] || {};
      const targetCell = target.bySpr[spr];
      targetCell.totalActions += finite(sourceCell.totalActions);
      targetCell.voluntaryActions += finite(sourceCell.voluntaryActions);
      for (const action of ACTION_KEYS) targetCell.actions[action] += finite(sourceCell.actions?.[action]);
      for (const pressure of PRESSURE_KEYS) {
        const sourcePressure = sourceCell.byPressure?.[pressure] || {};
        const targetPressure = targetCell.byPressure[pressure];
        const pressureActions = finite(sourcePressure.totalActions);
        targetPressure.totalActions += pressureActions;
        targetPressure.voluntaryActions += finite(sourcePressure.voluntaryActions);
        for (const action of ACTION_KEYS) targetPressure.actions[action] += finite(sourcePressure.actions?.[action]);
        targetPressure.weightedPotOdds += finite(sourcePressure.averagePotOdds) * pressureActions;
        targetPressure.weightedNeededBb += finite(sourcePressure.averageNeededBb) * pressureActions;
      }
    }
    target.weightedHeroLead += finite(source.averageHeroLeadRatio) * actions;
    target.weightedActorStackBb += finite(source.averageActorStackBb) * actions;
    target.weightedEffectiveStackBb += finite(source.averageEffectiveStackBb) * actions;
    target.weightedEffectiveSpr += finite(source.averageEffectiveSpr) * actions;
  }
}

function summarizePressureCell(source) {
  const decisions = source.voluntaryActions;
  const aggressive = source.actions.raise + source.actions.allin;
  return {
    totalActions: source.totalActions,
    voluntaryActions: decisions,
    actions: source.actions,
    foldRate: decisions ? round(source.actions.fold / decisions) : 0,
    callRate: decisions ? round(source.actions.call / decisions) : 0,
    raiseRate: decisions ? round(source.actions.raise / decisions) : 0,
    allInRate: decisions ? round(source.actions.allin / decisions) : 0,
    aggressionRate: decisions ? round(aggressive / decisions) : 0,
    averagePotOdds: source.totalActions ? round(source.weightedPotOdds / source.totalActions) : 0,
    averageNeededBb: source.totalActions ? round(source.weightedNeededBb / source.totalActions, 4) : 0,
  };
}

function summarizeSprCell(source) {
  const decisions = source.voluntaryActions;
  const aggressive = source.actions.raise + source.actions.allin;
  return {
    totalActions: source.totalActions,
    voluntaryActions: decisions,
    actions: source.actions,
    byPressure: Object.fromEntries(PRESSURE_KEYS.map(key => [key, summarizePressureCell(source.byPressure[key])])),
    foldRate: decisions ? round(source.actions.fold / decisions) : 0,
    callRate: decisions ? round(source.actions.call / decisions) : 0,
    raiseRate: decisions ? round(source.actions.raise / decisions) : 0,
    allInRate: decisions ? round(source.actions.allin / decisions) : 0,
    aggressionRate: decisions ? round(aggressive / decisions) : 0,
  };
}

function summarizeBand(source) {
  const decisions = source.voluntaryActions;
  const aggressive = source.actions.raise + source.actions.allin;
  return {
    totalActions: source.totalActions,
    voluntaryActions: decisions,
    actions: source.actions,
    sprBands: source.sprBands,
    bySpr: Object.fromEntries(SPR_KEYS.map(key => [key, summarizeSprCell(source.bySpr[key])])),
    foldRate: decisions ? round(source.actions.fold / decisions) : 0,
    callRate: decisions ? round(source.actions.call / decisions) : 0,
    raiseRate: decisions ? round(source.actions.raise / decisions) : 0,
    allInRate: decisions ? round(source.actions.allin / decisions) : 0,
    aggressionRate: decisions ? round(aggressive / decisions) : 0,
    shallowShare: source.totalActions ? round(source.sprBands.shallow / source.totalActions) : 0,
    averageHeroLeadRatio: source.totalActions ? round(source.weightedHeroLead / source.totalActions) : 0,
    averageActorStackBb: source.totalActions ? round(source.weightedActorStackBb / source.totalActions, 4) : 0,
    averageEffectiveStackBb: source.totalActions ? round(source.weightedEffectiveStackBb / source.totalActions, 4) : 0,
    averageEffectiveSpr: source.totalActions ? round(source.weightedEffectiveSpr / source.totalActions) : 0,
  };
}

function delta(high, low) {
  return {
    foldRate: round(high.foldRate - low.foldRate),
    callRate: round(high.callRate - low.callRate),
    raiseRate: round(high.raiseRate - low.raiseRate),
    allInRate: round(high.allInRate - low.allInRate),
    aggressionRate: round(high.aggressionRate - low.aggressionRate),
  };
}

const bands = Object.fromEntries(BAND_KEYS.map(key => [key, summarizeBand(aggregate[key])]));
const low = bands.under3x;
const high = bands.fivePlus;
const highSampleSufficient = high.voluntaryActions >= 100;
const deltas = {
  ...delta(high, low),
  shallowShare: round(high.shallowShare - low.shallowShare),
};

const controlledBySpr = Object.fromEntries(CONTROLLED_SPR_KEYS.map(spr => {
  const lowCell = low.bySpr[spr];
  const highCell = high.bySpr[spr];
  const sampleSufficient = lowCell.voluntaryActions >= 100 && highCell.voluntaryActions >= 100;
  const cellDeltas = delta(highCell, lowCell);
  const passive = sampleSufficient
    && cellDeltas.aggressionRate <= -0.05
    && cellDeltas.foldRate >= 0.03;
  return [spr, {
    sampleSufficient,
    low: lowCell,
    high: highCell,
    deltas: cellDeltas,
    passiveSignal: passive,
  }];
}));

const shallowPressureControlled = Object.fromEntries(PRESSURE_KEYS.map(pressure => {
  const lowCell = low.bySpr.shallow.byPressure[pressure];
  const highCell = high.bySpr.shallow.byPressure[pressure];
  const minimumHigh = pressure === "free" ? 50 : 50;
  const minimumLow = pressure === "free" ? 100 : 100;
  const sampleSufficient = lowCell.voluntaryActions >= minimumLow && highCell.voluntaryActions >= minimumHigh;
  const cellDeltas = delta(highCell, lowCell);
  const passive = sampleSufficient
    && cellDeltas.aggressionRate <= -0.05
    && cellDeltas.foldRate >= 0.03;
  return [pressure, {
    sampleSufficient,
    low: lowCell,
    high: highCell,
    deltas: cellDeltas,
    passiveSignal: passive,
  }];
}));

const sufficientControlledCells = CONTROLLED_SPR_KEYS.filter(key => controlledBySpr[key].sampleSufficient);
const passiveControlledCells = sufficientControlledCells.filter(key => controlledBySpr[key].passiveSignal);
const controlledSampleSufficient = sufficientControlledCells.length >= 2;
const controlledPassivitySignal = controlledSampleSufficient && passiveControlledCells.length >= 2;

const sufficientPressureCells = FACING_PRESSURE_KEYS.filter(key => shallowPressureControlled[key].sampleSufficient);
const passivePressureCells = sufficientPressureCells.filter(key => shallowPressureControlled[key].passiveSignal);
const pressureControlledSampleSufficient = sufficientPressureCells.length >= 2;
const pressureControlledPassivitySignal = pressureControlledSampleSufficient && passivePressureCells.length >= 2;

const rawPassivePressureSignal = highSampleSufficient
  && deltas.aggressionRate <= -0.05
  && deltas.allInRate <= -0.015
  && (deltas.foldRate >= 0.03 || deltas.callRate >= 0.03);

const summary = {
  version: "1.2.0",
  shards: files.length,
  configuredHands,
  completedHands,
  totalActions,
  failures,
  schedulerErrors,
  fairnessFailures,
  integrityFailures,
  fingerprints: fingerprints.size,
  bands,
  fivePlusVsUnder3x: deltas,
  highSampleSufficient,
  rawPassivePressureSignal,
  controlledBySpr,
  controlledSampleSufficient,
  controlledPassivitySignal,
  shallowPressureControlled,
  pressureControlledSampleSufficient,
  pressureControlledPassivitySignal,
  disposition: !controlledSampleSufficient
    ? "NEED_MORE_SPR_CONTROLLED_SAMPLE"
    : !pressureControlledSampleSufficient
      ? "NEED_MORE_PRESSURE_CONTROLLED_SAMPLE"
      : pressureControlledPassivitySignal
        ? "PRESSURE_CONTROLLED_PASSIVITY_SIGNAL"
        : "NO_PRESSURE_CONTROLLED_PASSIVITY_SIGNAL",
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ai-stack-pressure-audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
const md = [
  "# AI Hero Stack Pressure Audit",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Shards: ${files.length}`,
  `- Total AI actions: ${totalActions}`,
  `- Hero >=5x voluntary actions: ${high.voluntaryActions}`,
  `- SPR-controlled sample sufficient: ${controlledSampleSufficient ? "YES" : "NO"}`,
  `- Pressure-controlled sample sufficient: ${pressureControlledSampleSufficient ? "YES" : "NO"}`,
  `- Disposition: ${summary.disposition}`,
  "",
  "| Band | Voluntary | Fold | Call | Raise | All-in | Aggression | Shallow SPR |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...BAND_KEYS.map(key => {
    const band = bands[key];
    return `| ${key} | ${band.voluntaryActions} | ${(band.foldRate * 100).toFixed(2)}% | ${(band.callRate * 100).toFixed(2)}% | ${(band.raiseRate * 100).toFixed(2)}% | ${(band.allInRate * 100).toFixed(2)}% | ${(band.aggressionRate * 100).toFixed(2)}% | ${(band.shallowShare * 100).toFixed(2)}% |`;
  }),
  "",
  "## SPR-controlled Hero >=5x minus Hero <3x",
  "",
  "| SPR | Low n | High n | Fold delta | Call delta | Raise delta | All-in delta | Aggression delta | Signal |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---|",
  ...CONTROLLED_SPR_KEYS.map(key => {
    const row = controlledBySpr[key];
    return `| ${key} | ${row.low.voluntaryActions} | ${row.high.voluntaryActions} | ${(row.deltas.foldRate * 100).toFixed(2)} pp | ${(row.deltas.callRate * 100).toFixed(2)} pp | ${(row.deltas.raiseRate * 100).toFixed(2)} pp | ${(row.deltas.allInRate * 100).toFixed(2)} pp | ${(row.deltas.aggressionRate * 100).toFixed(2)} pp | ${row.sampleSufficient ? (row.passiveSignal ? "PASSIVE" : "NO") : "LOW SAMPLE"} |`;
  }),
  "",
  "## Shallow-SPR pressure-controlled Hero >=5x minus Hero <3x",
  "",
  "| Pressure | Low n | High n | Low pot odds | High pot odds | Fold delta | Raise delta | All-in delta | Aggression delta | Signal |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...PRESSURE_KEYS.map(key => {
    const row = shallowPressureControlled[key];
    return `| ${key} | ${row.low.voluntaryActions} | ${row.high.voluntaryActions} | ${(row.low.averagePotOdds * 100).toFixed(2)}% | ${(row.high.averagePotOdds * 100).toFixed(2)}% | ${(row.deltas.foldRate * 100).toFixed(2)} pp | ${(row.deltas.raiseRate * 100).toFixed(2)} pp | ${(row.deltas.allInRate * 100).toFixed(2)} pp | ${(row.deltas.aggressionRate * 100).toFixed(2)} pp | ${row.sampleSufficient ? (row.passiveSignal ? "PASSIVE" : "NO") : "LOW SAMPLE"} |`;
  }),
  "",
].join("\n");
writeFileSync(join(outputDirectory, "ai-stack-pressure-audit-summary.md"), md);
console.log(JSON.stringify(summary, null, 2));
