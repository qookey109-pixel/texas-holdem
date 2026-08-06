import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "2.9.0";
const inputDirectory = resolve(process.argv[2] || "telemetry-shards");
const outputDirectory = resolve(process.argv[3] || "telemetry-summary");
const expectedHands = Math.max(0, Number.parseInt(process.env.AI_LONG_RUN_EXPECTED_HANDS || "0", 10) || 0);
const expectedShards = Math.max(0, Number.parseInt(process.env.AI_LONG_RUN_EXPECTED_SHARDS || "0", 10) || 0);

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

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator, 6) : 0;
}

function emptyStreetActions() {
  return Object.fromEntries(["preflop", "flop", "turn", "river"].map(street => [street, {
    fold: 0,
    check: 0,
    call: 0,
    raise: 0,
    allin: 0,
  }]));
}

function emptySizing() {
  return { small: 0, medium: 0, large: 0, overbet: 0, allin: 0, unknown: 0 };
}

function emptyProfileCounts() {
  return {
    hands: 0,
    bbWon: 0,
    bbSquared: 0,
    vpipHands: 0,
    pfrHands: 0,
    showdownHands: 0,
    showdownWins: 0,
    sawFlopHands: 0,
    flopWins: 0,
  };
}

function emptyRole(name, source = {}) {
  return {
    name,
    tier: source.tier || "",
    targetScore10: Number(source.targetScore10) || 0,
    hands: 0,
    wins: 0,
    busts: 0,
    bbWon: 0,
    bbSquared: 0,
    vpipHands: 0,
    pfrHands: 0,
    openRaises: 0,
    threeBetOpportunities: 0,
    threeBets: 0,
    fourBetPlus: 0,
    foldToThreeBetOpportunities: 0,
    foldsToThreeBet: 0,
    cbetOpportunities: 0,
    cbets: 0,
    foldToCbetOpportunities: 0,
    foldsToCbet: 0,
    checkRaiseOpportunities: 0,
    checkRaises: 0,
    sawFlopHands: 0,
    showdownHands: 0,
    showdownWins: 0,
    flopWins: 0,
    callsWithEv: 0,
    negativeEvCalls: 0,
    raisesWithSizing: 0,
    actionCounts: emptyStreetActions(),
    sizing: emptySizing(),
    byHeroProfile: {},
  };
}

const numericFields = [
  "hands", "wins", "busts", "bbWon", "bbSquared", "vpipHands", "pfrHands",
  "openRaises", "threeBetOpportunities", "threeBets", "fourBetPlus",
  "foldToThreeBetOpportunities", "foldsToThreeBet", "cbetOpportunities", "cbets",
  "foldToCbetOpportunities", "foldsToCbet", "checkRaiseOpportunities", "checkRaises",
  "sawFlopHands", "showdownHands", "showdownWins", "flopWins", "callsWithEv",
  "negativeEvCalls", "raisesWithSizing",
];

function mergeProfile(target, source) {
  for (const field of Object.keys(emptyProfileCounts())) {
    target[field] = (Number(target[field]) || 0) + (Number(source?.[field]) || 0);
  }
}

function mergeRole(target, source) {
  if (!target.tier) target.tier = source.tier || "";
  if (!target.targetScore10) target.targetScore10 = Number(source.targetScore10) || 0;
  for (const field of numericFields) target[field] += Number(source?.[field]) || 0;
  for (const [street, actions] of Object.entries(source?.actionCounts || {})) {
    if (!target.actionCounts[street]) target.actionCounts[street] = {};
    for (const [action, count] of Object.entries(actions || {})) {
      target.actionCounts[street][action] = (Number(target.actionCounts[street][action]) || 0) + (Number(count) || 0);
    }
  }
  for (const [bucket, count] of Object.entries(source?.sizing || {})) {
    target.sizing[bucket] = (Number(target.sizing[bucket]) || 0) + (Number(count) || 0);
  }
  for (const [profile, counts] of Object.entries(source?.byHeroProfile || {})) {
    if (!target.byHeroProfile[profile]) target.byHeroProfile[profile] = emptyProfileCounts();
    mergeProfile(target.byHeroProfile[profile], counts);
  }
}

function summarizeRole(counts) {
  const hands = counts.hands;
  const meanBb = hands > 0 ? counts.bbWon / hands : 0;
  const variance = hands > 1
    ? Math.max(0, (counts.bbSquared - hands * meanBb * meanBb) / (hands - 1))
    : 0;
  const standardError = hands > 0 ? Math.sqrt(variance / hands) * 100 : 0;
  const bb100 = meanBb * 100;
  return {
    name: counts.name,
    tier: counts.tier,
    targetScore10: counts.targetScore10,
    hands,
    wins: counts.wins,
    busts: counts.busts,
    vpip: rate(counts.vpipHands, hands),
    pfr: rate(counts.pfrHands, hands),
    openRaiseRate: rate(counts.openRaises, hands),
    threeBetRate: rate(counts.threeBets, counts.threeBetOpportunities),
    foldToThreeBet: rate(counts.foldsToThreeBet, counts.foldToThreeBetOpportunities),
    cbet: rate(counts.cbets, counts.cbetOpportunities),
    foldToCbet: rate(counts.foldsToCbet, counts.foldToCbetOpportunities),
    checkRaise: rate(counts.checkRaises, counts.checkRaiseOpportunities),
    wtsd: rate(counts.showdownHands, counts.sawFlopHands),
    wsd: rate(counts.showdownWins, counts.showdownHands),
    wwsf: rate(counts.flopWins, counts.sawFlopHands),
    negativeEvCallRate: rate(counts.negativeEvCalls, counts.callsWithEv),
    bb100: round(bb100, 4),
    bb100StandardError: round(standardError, 4),
    bb100Ci95Low: round(bb100 - 1.96 * standardError, 4),
    bb100Ci95High: round(bb100 + 1.96 * standardError, 4),
    sizing: counts.sizing,
    actionCounts: counts.actionCounts,
    profileCoverage: Object.values(counts.byHeroProfile).filter(profile => profile.hands > 0).length,
    byHeroProfile: Object.fromEntries(Object.entries(counts.byHeroProfile).map(([profile, value]) => [profile, {
      hands: value.hands,
      vpip: rate(value.vpipHands, value.hands),
      pfr: rate(value.pfrHands, value.hands),
      wtsd: rate(value.showdownHands, value.sawFlopHands),
      wsd: rate(value.showdownWins, value.showdownHands),
      wwsf: rate(value.flopWins, value.sawFlopHands),
      bb100: round((value.hands > 0 ? value.bbWon / value.hands : 0) * 100, 4),
    }])),
  };
}

function summarizeTier(name, roles) {
  const members = roles.filter(role => role.tier === name && role.hands > 0);
  const hands = members.reduce((sum, role) => sum + role.hands, 0);
  const weighted = field => hands > 0
    ? members.reduce((sum, role) => sum + role[field] * role.hands, 0) / hands
    : 0;
  return {
    tier: name,
    roles: members.length,
    hands,
    vpip: round(weighted("vpip"), 6),
    pfr: round(weighted("pfr"), 6),
    wtsd: round(weighted("wtsd"), 6),
    wsd: round(weighted("wsd"), 6),
    wwsf: round(weighted("wwsf"), 6),
    bb100: round(weighted("bb100"), 4),
  };
}

function promotionReview(role, fatalFairness) {
  const enoughHands = role.hands >= 5_000;
  const profileCoverage = role.profileCoverage >= 5;
  const evDiscipline = role.negativeEvCallRate <= 0.03;
  const statisticallyPositive = role.bb100Ci95Low > 0;
  return {
    currentTarget: role.targetScore10,
    enoughHands,
    profileCoverage,
    evDiscipline,
    statisticallyPositive,
    fairnessClear: !fatalFairness,
    eligibleForTenPointReview: enoughHands
      && profileCoverage
      && evDiscipline
      && statisticallyPositive
      && !fatalFairness,
  };
}

if (!statSync(inputDirectory).isDirectory()) throw new Error(`Telemetry input is not a directory: ${inputDirectory}`);

const files = walk(inputDirectory)
  .filter(path => /^ai-long-run-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No telemetry shard JSON files found under ${inputDirectory}`);

const shardMap = new Map();
const validationErrors = [];
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.labVersion !== VERSION) validationErrors.push(`${basename(path)} labVersion=${report.labVersion}`);
  if (report.schemaVersion !== 1) validationErrors.push(`${basename(path)} schemaVersion=${report.schemaVersion}`);
  if (shardMap.has(report.shardIndex)) validationErrors.push(`duplicate shard index ${report.shardIndex}`);
  shardMap.set(report.shardIndex, report);
}

const shards = [...shardMap.values()].sort((left, right) => left.shardIndex - right.shardIndex);
const mergedRoles = {};
let totalConfiguredHands = 0;
let totalCompletedHands = 0;
let totalFailures = 0;
let totalSchedulerErrors = 0;
const fingerprints = new Set();
const heroProfiles = new Set();
let fatalFairness = false;

for (const report of shards) {
  totalConfiguredHands += Number(report.configuredHands) || 0;
  totalCompletedHands += Number(report.completedHands) || 0;
  totalFailures += report.failures?.length || 0;
  totalSchedulerErrors += report.schedulerErrors?.length || 0;
  heroProfiles.add(report.heroProfile);
  if (fingerprints.has(report.deterministicFingerprint)) validationErrors.push(`duplicate deterministic fingerprint ${report.deterministicFingerprint}`);
  fingerprints.add(report.deterministicFingerprint);
  if (
    !report.fairness?.publicInformationOnly
    || report.fairness?.hiddenOpponentCards
    || report.fairness?.actualDeckOrder
    || report.fairness?.futureBoardAnswer
    || report.fairness?.predeterminedWinner
    || report.fairness?.omniscientProfiles?.length
  ) fatalFairness = true;

  for (const [name, counts] of Object.entries(report.roleCounts || {})) {
    if (!mergedRoles[name]) mergedRoles[name] = emptyRole(name, counts);
    mergeRole(mergedRoles[name], counts);
  }
}

if (expectedShards && shards.length !== expectedShards) validationErrors.push(`shards ${shards.length}/${expectedShards}`);
if (expectedHands && totalCompletedHands !== expectedHands) validationErrors.push(`completed hands ${totalCompletedHands}/${expectedHands}`);
if (totalCompletedHands !== totalConfiguredHands) validationErrors.push(`completed/configured ${totalCompletedHands}/${totalConfiguredHands}`);
if (totalFailures) validationErrors.push(`state failures ${totalFailures}`);
if (totalSchedulerErrors) validationErrors.push(`scheduler errors ${totalSchedulerErrors}`);
if (fatalFairness) validationErrors.push("fair-information boundary failed");

const roles = Object.values(mergedRoles).map(summarizeRole).sort((left, right) => right.bb100 - left.bb100);
const roleMap = Object.fromEntries(roles.map(role => [role.name, role]));
const tiers = Object.fromEntries(["opening", "middle", "elite", "special"].map(tier => [tier, summarizeTier(tier, roles)]));
const fullEvidence = totalCompletedHands >= 25_000 && shards.length >= 50 && heroProfiles.size >= 5;
const promotion = {
  Oracle: roleMap.Oracle ? promotionReview(roleMap.Oracle, fatalFairness) : null,
  Chronos: roleMap.Chronos ? promotionReview(roleMap.Chronos, fatalFairness) : null,
};

const summary = {
  schemaVersion: 1,
  labVersion: VERSION,
  shards: shards.length,
  configuredHands: totalConfiguredHands,
  completedHands: totalCompletedHands,
  heroProfiles: [...heroProfiles].sort(),
  fullEvidence,
  validationPassed: validationErrors.length === 0,
  validationErrors,
  fairness: { publicInformationOnly: !fatalFairness, failures: fatalFairness ? 1 : 0 },
  tiers,
  roles: roleMap,
  ranking: roles.map(role => ({ name: role.name, tier: role.tier, hands: role.hands, bb100: role.bb100, ci95Low: role.bb100Ci95Low, ci95High: role.bb100Ci95High })),
  promotionReview: promotion,
  evidenceNote: fullEvidence
    ? "25,000-hand multi-profile evidence threshold reached; ratings may be reviewed but are not automatically changed."
    : "Smoke or partial run only; do not promote any rating from this report.",
};

const rows = roles.map(role => `| ${role.name} | ${role.tier} | ${role.targetScore10.toFixed(1)} | ${role.hands} | ${(role.vpip * 100).toFixed(1)}% | ${(role.pfr * 100).toFixed(1)}% | ${(role.threeBetRate * 100).toFixed(1)}% | ${(role.cbet * 100).toFixed(1)}% | ${(role.wtsd * 100).toFixed(1)}% | ${(role.wsd * 100).toFixed(1)}% | ${(role.wwsf * 100).toFixed(1)}% | ${role.bb100.toFixed(2)} | ${role.bb100Ci95Low.toFixed(2)}～${role.bb100Ci95High.toFixed(2)} |`);
const markdown = [
  "# AI V2.9 Long-run Telemetry",
  "",
  `- Shards: ${shards.length}`,
  `- Completed hands: ${totalCompletedHands}/${totalConfiguredHands}`,
  `- Hero profiles: ${[...heroProfiles].sort().join(", ")}`,
  `- Full 25,000-hand evidence: ${fullEvidence ? "yes" : "no"}`,
  `- Validation: ${validationErrors.length ? "failed" : "passed"}`,
  `- Fair public-information boundary: ${fatalFairness ? "failed" : "passed"}`,
  "",
  "| Role | Tier | Target | Hands | VPIP | PFR | 3-bet | C-bet | WTSD | W$SD | WWSF | BB/100 | 95% CI |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...rows,
  "",
  "## Boss promotion review",
  "",
  `- Oracle: ${promotion.Oracle?.eligibleForTenPointReview ? "eligible for manual 10.0 review" : "not yet eligible"}`,
  `- Chronos: ${promotion.Chronos?.eligibleForTenPointReview ? "eligible for manual 10.0 review" : "not yet eligible"}`,
  "",
  summary.evidenceNote,
  ...(validationErrors.length ? ["", "## Validation errors", "", ...validationErrors.map(error => `- ${error}`)] : []),
].join("\n");

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ai-long-run-telemetry-v2-9.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(join(outputDirectory, "ai-long-run-telemetry-v2-9.md"), `${markdown}\n`, "utf8");
console.log(markdown);
if (validationErrors.length) process.exitCode = 1;
