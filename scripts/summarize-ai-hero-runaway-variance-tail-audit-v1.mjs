import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "ai-hero-runaway-variance-tail-results");
const outputDirectory = resolve(process.argv[3] || "ai-hero-runaway-variance-tail-summary");
const PROFILES = ["tight", "balanced", "calling"];

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function round(value, digits = 6) { const factor = 10 ** digits; return Math.round(finite(value) * factor) / factor; }
function rate(a, b) { return b > 0 ? round(a / b) : 0; }
function sum(values) { return values.reduce((total, value) => total + finite(value), 0); }
function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function percentile(values, p) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
function longestRun(values, predicate) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) { current += 1; longest = Math.max(longest, current); }
    else current = 0;
  }
  return longest;
}
function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path)); else files.push(path);
  }
  return files;
}

function summarizeRun(report) {
  const audit = report.heroRunawayVarianceTailAudit || {};
  const hands = Array.isArray(audit.hands) ? audit.hands : [];
  const ratios = hands.map(hand => Number(hand.heroToOpponentMedianRatio)).filter(Number.isFinite);
  const late = ratios.slice(-100);
  const large = hands.filter(hand => hand.largeShowdown);
  const largeWins = large.filter(hand => finite(hand.heroDeltaBb) >= 50);
  const largeLosses = large.filter(hand => finite(hand.heroDeltaBb) <= -50);
  const grossLargeGainBb = sum(largeWins.map(hand => hand.heroDeltaBb));
  const grossLargeLossBb = -sum(largeLosses.map(hand => hand.heroDeltaBb));
  const rate3x = rate(ratios.filter(value => value >= 3).length, ratios.length);
  const rate5x = rate(ratios.filter(value => value >= 5).length, ratios.length);
  const maxRatio = ratios.length ? Math.max(...ratios) : 0;
  const longest5x = longestRun(ratios, value => value >= 5);
  const tailFlag = maxRatio >= 10 || rate5x >= 0.10 || longest5x >= 15;
  return {
    profile: String(report.heroProfile || ""),
    pairIndex: finite(report.shardIndex),
    hands: hands.length,
    maxRatio: round(maxRatio, 4),
    rate3x,
    rate5x,
    longest5x,
    late100AverageRatio: late.length ? round(sum(late) / late.length, 4) : 0,
    late100P90Ratio: round(percentile(late, 0.90), 4),
    maxHeroBb: hands.length ? round(Math.max(...hands.map(hand => finite(hand.heroStackBb))), 4) : 0,
    finalRatio: ratios.length ? round(ratios[ratios.length - 1], 4) : 0,
    largeShowdownEvents: large.length,
    largeShowdownWins: largeWins.length,
    largeShowdownLosses: largeLosses.length,
    largeShowdownWinRate: rate(largeWins.length, large.length),
    largeShowdownNetBb: round(grossLargeGainBb - grossLargeLossBb, 4),
    tailFlag,
  };
}

const files = walk(inputDirectory)
  .filter(path => /^ai-hero-runaway-variance-tail-(tight|balanced|calling)-pair-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No variance-tail audit JSON found under ${inputDirectory}`);

let configuredHands = 0;
let completedHands = 0;
let failures = 0;
let schedulerErrors = 0;
let fairnessFailures = 0;
let integrityFailures = 0;
let auditErrors = 0;
const runs = [];

for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  configuredHands += finite(report.configuredHands);
  completedHands += finite(report.completedHands);
  failures += report.failures?.length || 0;
  schedulerErrors += report.schedulerErrors?.length || 0;
  if (!report.fairness?.publicInformationOnly) fairnessFailures += 1;
  if (!report.telemetryIntegrity?.integrityPassed) integrityFailures += 1;
  auditErrors += report.heroRunawayVarianceTailAudit?.errors?.length || 0;
  runs.push(summarizeRun(report));
}

function profileSummary(profile) {
  const rows = runs.filter(run => run.profile === profile);
  const largeEvents = sum(rows.map(row => row.largeShowdownEvents));
  const largeWins = sum(rows.map(row => row.largeShowdownWins));
  const largeLosses = sum(rows.map(row => row.largeShowdownLosses));
  return {
    runs: rows.length,
    tailRuns: rows.filter(row => row.tailFlag).length,
    medianMaxRatio: round(median(rows.map(row => row.maxRatio)), 4),
    medianRate5x: round(median(rows.map(row => row.rate5x)), 6),
    medianLongest5x: round(median(rows.map(row => row.longest5x)), 2),
    medianLate100AverageRatio: round(median(rows.map(row => row.late100AverageRatio)), 4),
    p90OfRunMaxRatio: round(percentile(rows.map(row => row.maxRatio), 0.90), 4),
    maximumObservedRatio: rows.length ? round(Math.max(...rows.map(row => row.maxRatio)), 4) : 0,
    maximumObservedHeroBb: rows.length ? round(Math.max(...rows.map(row => row.maxHeroBb)), 4) : 0,
    largeShowdownEvents: largeEvents,
    largeShowdownWins: largeWins,
    largeShowdownLosses: largeLosses,
    largeShowdownWinRate: rate(largeWins, largeEvents),
    largeShowdownNetBb: round(sum(rows.map(row => row.largeShowdownNetBb)), 4),
  };
}

const profiles = Object.fromEntries(PROFILES.map(profile => [profile, profileSummary(profile)]));
const sampleSufficient = files.length === 12 && configuredHands === 3_000 && completedHands === configuredHands;
const balancedTailRuns = profiles.balanced.tailRuns;
const controlTailMean = (profiles.tight.tailRuns + profiles.calling.tailRuns) / 2;
let disposition = "NEED_MORE_VARIANCE_TAIL_SAMPLE";
if (sampleSufficient) {
  if (balancedTailRuns >= 3 && profiles.tight.tailRuns <= 1 && profiles.calling.tailRuns <= 1) {
    disposition = "BALANCED_SPECIFIC_RUNAWAY_TAIL";
  } else if (sum(PROFILES.map(profile => profiles[profile].tailRuns)) >= 4 && Math.abs(balancedTailRuns - controlTailMean) <= 1.5) {
    disposition = "RUNAWAY_TAIL_PRESENT_WITHOUT_PROFILE_DOMINANCE";
  } else if (sum(PROFILES.map(profile => profiles[profile].tailRuns)) <= 2) {
    disposition = "RUNAWAY_TAIL_RARE_IN_SCREEN";
  } else {
    disposition = "MIXED_RUNAWAY_TAIL_FREQUENCY";
  }
}

const summary = {
  version: "1.0.0",
  observationOnly: true,
  causalClaim: false,
  configuredHands,
  completedHands,
  files: files.length,
  failures,
  schedulerErrors,
  fairnessFailures,
  integrityFailures,
  auditErrors,
  sampleSufficient,
  disposition,
  profiles,
  runs,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ai-hero-runaway-variance-tail-audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

const md = [
  "# AI Hero Runaway Variance-Tail Audit",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Runs: ${files.length}/12`,
  `- Sample sufficient: ${sampleSufficient ? "YES" : "NO"}`,
  `- Disposition: ${disposition}`,
  "- Tail flag per run: max Hero/opponent-median ratio >=10x, or >=5x on at least 10% of hands, or a >=5x streak of at least 15 hands.",
  "- Observation only; no production behavior is changed by this audit.",
  "",
  "| Profile | Tail runs | Median max ratio | Max observed | Median >=5x share | Median longest 5x streak | Median late-100 avg | Max Hero BB | 50BB+ SD W/L | 50BB+ SD win rate | 50BB+ SD net BB |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...PROFILES.map(profile => {
    const row = profiles[profile];
    return `| ${profile} | ${row.tailRuns}/4 | ${row.medianMaxRatio.toFixed(2)}x | ${row.maximumObservedRatio.toFixed(2)}x | ${(row.medianRate5x * 100).toFixed(1)}% | ${row.medianLongest5x.toFixed(1)} | ${row.medianLate100AverageRatio.toFixed(2)}x | ${row.maximumObservedHeroBb.toFixed(1)} | ${row.largeShowdownWins}/${row.largeShowdownLosses} | ${(row.largeShowdownWinRate * 100).toFixed(1)}% | ${row.largeShowdownNetBb.toFixed(1)} |`;
  }),
  "",
  "## Per-run tails",
  "",
  "| Pair | Profile | Max ratio | >=3x | >=5x | Longest 5x | Late-100 avg | Late P90 | Max Hero BB | 50BB+ SD net | Tail |",
  "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...runs.sort((a, b) => a.pairIndex - b.pairIndex || a.profile.localeCompare(b.profile)).map(row => `| ${row.pairIndex} | ${row.profile} | ${row.maxRatio.toFixed(2)}x | ${(row.rate3x * 100).toFixed(1)}% | ${(row.rate5x * 100).toFixed(1)}% | ${row.longest5x} | ${row.late100AverageRatio.toFixed(2)}x | ${row.late100P90Ratio.toFixed(2)}x | ${row.maxHeroBb.toFixed(1)} | ${row.largeShowdownNetBb.toFixed(1)} | ${row.tailFlag ? "YES" : "NO"} |`),
  "",
  `Validation failures: gameplay=${failures}, scheduler=${schedulerErrors}, fairness=${fairnessFailures}, integrity=${integrityFailures}, audit=${auditErrors}.`,
].join("\n");
writeFileSync(join(outputDirectory, "ai-hero-runaway-variance-tail-audit-summary.md"), `${md}\n`);
console.log(md);
