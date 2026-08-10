import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDir = resolve(process.argv[2] || "ai-hero-effective-risk-results");
const outputDir = resolve(process.argv[3] || "ai-hero-effective-risk-summary");
const EXPECTED_RUNS = 12;
const EXPECTED_HANDS = 3_000;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function longest(values, predicate) {
  let best = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
  }
  return best;
}
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function runMetrics(report) {
  const audit = report?.heroEffectiveRiskAudit || {};
  const hands = Array.isArray(audit.hands) ? audit.hands : [];
  const late = hands.slice(-100);
  const ratios = late.map(hand => Number(hand?.heroToOpponentMedianRatio)).filter(Number.isFinite);
  const deepestRisk = late.map(hand => Number(hand?.deepestOpponentRiskFraction)).filter(Number.isFinite);
  const medianRisk = late.map(hand => Number(hand?.medianOpponentRiskFraction)).filter(Number.isFinite);
  const fiveXRate = ratios.filter(value => value >= 5).length / Math.max(1, ratios.length);
  const longestFiveX = longest(ratios, value => value >= 5);
  const lateAverageRatio = average(ratios);
  const latePersistent = lateAverageRatio >= 3 || fiveXRate >= 0.10 || longestFiveX >= 15;
  const deepestRisk25Rate = deepestRisk.filter(value => value <= 0.25).length / Math.max(1, deepestRisk.length);
  const deepestRisk35Rate = deepestRisk.filter(value => value <= 0.35).length / Math.max(1, deepestRisk.length);
  const deepestRisk50Rate = deepestRisk.filter(value => value <= 0.50).length / Math.max(1, deepestRisk.length);
  const lateAverageDeepestRisk = average(deepestRisk);
  const riskInsulated = deepestRisk35Rate >= 0.60 && lateAverageDeepestRisk <= 0.40;

  return {
    pair: finite(report?.shardIndex, -1),
    profile: String(report?.heroProfile || ""),
    completedHands: finite(report?.completedHands),
    configuredHands: finite(report?.configuredHands),
    lateAverageRatio: round(lateAverageRatio),
    lateFiveXRate: round(fiveXRate),
    lateLongestFiveX: longestFiveX,
    latePersistent,
    lateAverageDeepestRiskFraction: round(lateAverageDeepestRisk),
    lateMedianDeepestRiskFraction: round(median(deepestRisk)),
    lateAverageMedianRiskFraction: round(average(medianRisk)),
    lateDeepestRisk25Rate: round(deepestRisk25Rate),
    lateDeepestRisk35Rate: round(deepestRisk35Rate),
    lateDeepestRisk50Rate: round(deepestRisk50Rate),
    riskInsulated,
    lateAverageHeroBb: round(average(late.map(hand => finite(hand?.heroBb)))),
    lateAverageOpponentMaxBb: round(average(late.map(hand => finite(hand?.opponentMaxBb)))),
    lateAverageOpponentMedianBb: round(average(late.map(hand => finite(hand?.opponentMedianBb)))),
    lateAverageBuyInBb: round(average(late.map(hand => finite(hand?.buyInBb)))),
    lateAverageStructuralReplacementCapBb: round(average(late.map(hand => finite(hand?.structuralReplacementCapBb)))),
    auditErrors: Array.isArray(audit.errors) ? audit.errors.length : 0,
    gameplayFailures: Array.isArray(report?.failures) ? report.failures.length : 0,
    schedulerFailures: Array.isArray(report?.schedulerErrors) ? report.schedulerErrors.length : 0,
    fairnessFailure: report?.fairness?.publicInformationOnly === false ? 1 : 0,
    integrityFailure: report?.telemetryIntegrity?.integrityPassed === true ? 0 : 1,
  };
}

const files = walk(inputDir).filter(path => /^ai-hero-effective-risk-.+-pair-\d+\.json$/.test(basename(path)));
if (!files.length) throw new Error(`No effective-risk audit JSON under ${inputDir}`);
const reports = files.map(path => JSON.parse(readFileSync(path, "utf8")));
const runs = reports.map(runMetrics).sort((left, right) => left.pair - right.pair || left.profile.localeCompare(right.profile));
const validationFailures = [];
if (runs.length !== EXPECTED_RUNS) validationFailures.push(`expected ${EXPECTED_RUNS} runs, got ${runs.length}`);
const completedHands = runs.reduce((sum, run) => sum + run.completedHands, 0);
if (completedHands !== EXPECTED_HANDS) validationFailures.push(`expected ${EXPECTED_HANDS} hands, got ${completedHands}`);
for (const run of runs) {
  if (run.completedHands !== run.configuredHands) validationFailures.push(`${run.profile}:${run.pair} incomplete hands`);
  if (run.auditErrors || run.gameplayFailures || run.schedulerFailures || run.fairnessFailure || run.integrityFailure) {
    validationFailures.push(`${run.profile}:${run.pair} safety/integrity failure`);
  }
}

const persistentRuns = runs.filter(run => run.latePersistent);
const controlRuns = runs.filter(run => !run.latePersistent);
const persistentInsulated = persistentRuns.filter(run => run.riskInsulated);
const controlInsulated = controlRuns.filter(run => run.riskInsulated);
const baselineReproduced = persistentRuns.length === 3;
let disposition = "NO_PERSISTENT_RISK_INSULATION_SIGNAL";
if (!baselineReproduced) disposition = "BASELINE_REPRO_MISMATCH";
else if (persistentInsulated.length === persistentRuns.length && persistentRuns.length > 0) disposition = "PERSISTENT_RUNAWAY_RISK_INSULATION_SIGNAL";
else if (persistentInsulated.length >= 2) disposition = "MIXED_PERSISTENT_RISK_INSULATION";

const profileSummary = {};
for (const profile of ["tight", "balanced", "calling"]) {
  const group = runs.filter(run => run.profile === profile);
  profileSummary[profile] = {
    runs: group.length,
    latePersistent: group.filter(run => run.latePersistent).length,
    riskInsulated: group.filter(run => run.riskInsulated).length,
    medianLateDeepestRisk35Rate: round(median(group.map(run => run.lateDeepestRisk35Rate))),
    medianLateAverageDeepestRiskFraction: round(median(group.map(run => run.lateAverageDeepestRiskFraction))),
    medianLateAverageRatio: round(median(group.map(run => run.lateAverageRatio))),
  };
}

const levelMap = new Map();
for (const report of reports) {
  for (const hand of report?.heroEffectiveRiskAudit?.hands || []) {
    const level = finite(hand?.blindLevel);
    if (!level) continue;
    if (!levelMap.has(level)) levelMap.set(level, { buyInBb: [], capBb: [] });
    levelMap.get(level).buyInBb.push(finite(hand?.buyInBb));
    levelMap.get(level).capBb.push(finite(hand?.structuralReplacementCapBb));
  }
}
const blindLevelStructure = Object.fromEntries([...levelMap.entries()].sort((a, b) => a[0] - b[0]).map(([level, values]) => [level, {
  buyInBb: round(median(values.buyInBb), 4),
  structuralReplacementCapBb: round(median(values.capBb), 4),
}]));

const summary = {
  schemaVersion: 1,
  version: "1.0.0",
  completedHands,
  runs: runs.length,
  validationPassed: validationFailures.length === 0,
  validationFailures,
  baselineReproduced,
  latePersistentRuns: persistentRuns.length,
  disposition,
  persistentRiskInsulatedRuns: persistentInsulated.length,
  controlRiskInsulatedRuns: controlInsulated.length,
  persistentMedianDeepestRisk35Rate: round(median(persistentRuns.map(run => run.lateDeepestRisk35Rate))),
  controlMedianDeepestRisk35Rate: round(median(controlRuns.map(run => run.lateDeepestRisk35Rate))),
  persistentMedianAverageDeepestRiskFraction: round(median(persistentRuns.map(run => run.lateAverageDeepestRiskFraction))),
  controlMedianAverageDeepestRiskFraction: round(median(controlRuns.map(run => run.lateAverageDeepestRiskFraction))),
  profileSummary,
  blindLevelStructure,
  runsDetail: runs,
  action: {
    productionChange: "none",
    automaticPromotion: false,
    note: "Observation only. A table-stack/bankroll benchmark is justified only if persistent runaway paths show robust deepest-opponent risk insulation.",
  },
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "ai-hero-effective-risk-audit-v1.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const rows = runs.map(run => `| ${run.pair} | ${run.profile} | ${run.lateAverageRatio.toFixed(2)}x | ${(run.lateFiveXRate * 100).toFixed(1)}% | ${run.lateLongestFiveX} | ${(run.lateAverageDeepestRiskFraction * 100).toFixed(1)}% | ${(run.lateDeepestRisk35Rate * 100).toFixed(1)}% | ${run.lateAverageHeroBb.toFixed(1)} | ${run.lateAverageOpponentMaxBb.toFixed(1)} | ${run.latePersistent ? "YES" : "NO"} | ${run.riskInsulated ? "YES" : "NO"} |`);
const markdown = [
  "# AI Hero Effective-Risk Audit V1",
  "",
  `- Hands: ${completedHands}/${EXPECTED_HANDS}`,
  `- Runs: ${runs.length}/${EXPECTED_RUNS}`,
  `- Validation: ${summary.validationPassed ? "PASS" : "FAIL"}`,
  `- Baseline #179 reproduced: ${baselineReproduced ? "YES" : "NO"} (${persistentRuns.length}/12 late-persistent)`,
  `- Disposition: **${disposition}**`,
  `- Persistent risk-insulated: ${persistentInsulated.length}/${persistentRuns.length}`,
  `- Control risk-insulated: ${controlInsulated.length}/${controlRuns.length}`,
  `- Persistent median late <=35% deepest-risk rate: ${(summary.persistentMedianDeepestRisk35Rate * 100).toFixed(1)}%`,
  `- Control median late <=35% deepest-risk rate: ${(summary.controlMedianDeepestRisk35Rate * 100).toFixed(1)}%`,
  "",
  "Risk fraction means the maximum fraction of Hero's current stack that could be lost in a heads-up all-in against the deepest positive-stack opponent at that snapshot.",
  "",
  "| Pair | Profile | Late avg ratio | Late >=5x | Longest 5x | Avg deepest risk | <=35% deepest-risk | Hero BB | Deepest opp BB | Persistent | Risk insulated |",
  "|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ...rows,
  "",
  "## Blind/buy-in structure observed",
  "",
  ...Object.entries(blindLevelStructure).map(([level, values]) => `- Level ${level}: buy-in ${values.buyInBb.toFixed(1)}BB; 75%-buy-in structural replacement cap ${values.structuralReplacementCapBb.toFixed(1)}BB.`),
  "",
  "- Observation only; no AI, economy, stack, blind, bankroll, G1 or production behavior changes.",
  ...(validationFailures.length ? ["", "## Validation failures", "", ...validationFailures.map(failure => `- ${failure}`)] : []),
].join("\n");
writeFileSync(join(outputDir, "ai-hero-effective-risk-audit-v1.md"), `${markdown}\n`, "utf8");
console.log(markdown);
if (!summary.validationPassed) process.exitCode = 1;