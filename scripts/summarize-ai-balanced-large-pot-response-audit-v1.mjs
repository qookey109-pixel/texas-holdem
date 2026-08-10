import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] || "ai-balanced-large-pot-response-results");
const outputDirectory = resolve(process.argv[3] || "ai-balanced-large-pot-response-summary");
const PROFILES = ["tight", "balanced", "calling"];

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

function rate(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator) : 0;
}

function isAggressive(action) {
  return action === "raise" || action === "allin";
}

function isContinue(action) {
  return action === "call" || action === "raise" || action === "allin";
}

function featureForHand(hand) {
  const actions = Array.isArray(hand.actions) ? hand.actions : [];
  const aiActions = actions.filter(action => !action.isHuman);
  const heroAggressions = actions.filter(action => action.isHuman && isAggressive(action.action));
  const lastHeroAggression = heroAggressions.length ? heroAggressions[heroAggressions.length - 1] : null;
  const afterLastHeroAggression = lastHeroAggression
    ? actions.filter(action => action.sequence > lastHeroAggression.sequence && !action.isHuman)
    : [];
  const continuation = afterLastHeroAggression.find(action => isContinue(action.action)) || null;
  const lastAiAction = aiActions.length ? aiActions[aiActions.length - 1] : null;
  const maxAmountToPotRatio = aiActions
    .map(action => Number(action.amountToPotRatio))
    .filter(Number.isFinite)
    .reduce((maximum, value) => Math.max(maximum, value), 0);
  return {
    handNumber: hand.handNumber,
    heroProfile: hand.heroProfile,
    heroDeltaBb: finite(hand.heroDeltaBb),
    aiBustCount: finite(hand.aiBustCount),
    heroAggressionObserved: Boolean(lastHeroAggression),
    aiContinuedAfterHeroAggression: Boolean(continuation),
    aiContinuationAction: continuation?.action || "",
    aiContinuationStreet: continuation?.street || "",
    aiCallPresent: aiActions.some(action => action.action === "call"),
    aiRaisePresent: aiActions.some(action => action.action === "raise"),
    aiAllinPresent: aiActions.some(action => action.action === "allin"),
    aiRaiseOrAllinPresent: aiActions.some(action => isAggressive(action.action)),
    lastAiAction: lastAiAction?.action || "",
    lastAiStreet: lastAiAction?.street || "",
    lastAiContinued: Boolean(lastAiAction && isContinue(lastAiAction.action)),
    maxAiAmountToPotRatio: round(maxAmountToPotRatio, 4),
    actionCount: actions.length,
  };
}

function summarizeCategory(hands) {
  const features = hands.map(featureForHand);
  const withHeroAggression = features.filter(feature => feature.heroAggressionObserved);
  return {
    hands: features.length,
    heroAggressionObservedRate: rate(withHeroAggression.length, features.length),
    aiContinueAfterHeroAggressionRate: rate(
      withHeroAggression.filter(feature => feature.aiContinuedAfterHeroAggression).length,
      withHeroAggression.length,
    ),
    aiCallPresentRate: rate(features.filter(feature => feature.aiCallPresent).length, features.length),
    aiRaisePresentRate: rate(features.filter(feature => feature.aiRaisePresent).length, features.length),
    aiAllinPresentRate: rate(features.filter(feature => feature.aiAllinPresent).length, features.length),
    aiRaiseOrAllinPresentRate: rate(features.filter(feature => feature.aiRaiseOrAllinPresent).length, features.length),
    lastAiContinueRate: rate(features.filter(feature => feature.lastAiContinued).length, features.length),
    averageMaxAiAmountToPotRatio: features.length
      ? round(features.reduce((sum, feature) => sum + feature.maxAiAmountToPotRatio, 0) / features.length, 4)
      : 0,
    examples: features.sort((left, right) => right.heroDeltaBb - left.heroDeltaBb).slice(0, 6),
  };
}

function summarizeLargeOutcome(hands) {
  const events = hands.filter(hand => hand.showdown && Math.abs(finite(hand.heroDeltaBb)) >= 50);
  const wins = events.filter(hand => finite(hand.heroDeltaBb) >= 50);
  const losses = events.filter(hand => finite(hand.heroDeltaBb) <= -50);
  const grossGainBb = round(wins.reduce((sum, hand) => sum + finite(hand.heroDeltaBb), 0), 4);
  const grossLossBb = round(-losses.reduce((sum, hand) => sum + finite(hand.heroDeltaBb), 0), 4);
  return {
    events: events.length,
    wins: wins.length,
    losses: losses.length,
    winRate: rate(wins.length, events.length),
    grossGainBb,
    grossLossBb,
    netBb: round(grossGainBb - grossLossBb, 4),
    averageWinBb: wins.length ? round(grossGainBb / wins.length, 4) : 0,
    averageLossBb: losses.length ? round(grossLossBb / losses.length, 4) : 0,
  };
}

function summarizeRun(report) {
  const audit = report.balancedLargePotResponseAudit || {};
  const hands = Array.isArray(audit.hands) ? audit.hands : [];
  const largeShowdownWins = hands.filter(hand => hand.heroWon && hand.showdown && finite(hand.heroDeltaBb) >= 50);
  const ordinaryShowdownWins = hands.filter(hand => hand.heroWon && hand.showdown && finite(hand.heroDeltaBb) > 0 && finite(hand.heroDeltaBb) < 50);
  return {
    profile: String(report.heroProfile || ""),
    pairIndex: finite(report.shardIndex),
    completedHands: finite(report.completedHands),
    largeShowdown: summarizeCategory(largeShowdownWins),
    ordinaryShowdown: summarizeCategory(ordinaryShowdownWins),
    largeOutcome: summarizeLargeOutcome(hands),
  };
}

const files = walk(inputDirectory)
  .filter(path => /^ai-balanced-large-pot-response-(tight|balanced|calling)-pair-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No balanced large-pot response JSON found under ${inputDirectory}`);

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
  auditErrors += report.balancedLargePotResponseAudit?.errors?.length || 0;
  runs.push(summarizeRun(report));
}

function combine(profile, category) {
  const matching = runs.filter(run => run.profile === profile);
  const totals = matching.reduce((acc, run) => {
    const value = run[category];
    acc.hands += value.hands;
    acc.heroAggression += Math.round(value.heroAggressionObservedRate * value.hands);
    const heroAggHands = Math.round(value.heroAggressionObservedRate * value.hands);
    acc.heroAggHands += heroAggHands;
    acc.continued += Math.round(value.aiContinueAfterHeroAggressionRate * heroAggHands);
    acc.call += Math.round(value.aiCallPresentRate * value.hands);
    acc.raise += Math.round(value.aiRaisePresentRate * value.hands);
    acc.allin += Math.round(value.aiAllinPresentRate * value.hands);
    acc.raiseOrAllin += Math.round(value.aiRaiseOrAllinPresentRate * value.hands);
    acc.lastContinue += Math.round(value.lastAiContinueRate * value.hands);
    acc.maxPotRatioWeighted += value.averageMaxAiAmountToPotRatio * value.hands;
    return acc;
  }, { hands: 0, heroAggression: 0, heroAggHands: 0, continued: 0, call: 0, raise: 0, allin: 0, raiseOrAllin: 0, lastContinue: 0, maxPotRatioWeighted: 0 });
  return {
    hands: totals.hands,
    heroAggressionObservedRate: rate(totals.heroAggression, totals.hands),
    aiContinueAfterHeroAggressionRate: rate(totals.continued, totals.heroAggHands),
    aiCallPresentRate: rate(totals.call, totals.hands),
    aiRaisePresentRate: rate(totals.raise, totals.hands),
    aiAllinPresentRate: rate(totals.allin, totals.hands),
    aiRaiseOrAllinPresentRate: rate(totals.raiseOrAllin, totals.hands),
    lastAiContinueRate: rate(totals.lastContinue, totals.hands),
    averageMaxAiAmountToPotRatio: totals.hands ? round(totals.maxPotRatioWeighted / totals.hands, 4) : 0,
  };
}

function combineLargeOutcome(profile) {
  const matching = runs.filter(run => run.profile === profile);
  const totals = matching.reduce((acc, run) => {
    const value = run.largeOutcome;
    acc.events += value.events;
    acc.wins += value.wins;
    acc.losses += value.losses;
    acc.grossGainBb += value.grossGainBb;
    acc.grossLossBb += value.grossLossBb;
    return acc;
  }, { events: 0, wins: 0, losses: 0, grossGainBb: 0, grossLossBb: 0 });
  return {
    events: totals.events,
    wins: totals.wins,
    losses: totals.losses,
    winRate: rate(totals.wins, totals.events),
    grossGainBb: round(totals.grossGainBb, 4),
    grossLossBb: round(totals.grossLossBb, 4),
    netBb: round(totals.grossGainBb - totals.grossLossBb, 4),
    averageWinBb: totals.wins ? round(totals.grossGainBb / totals.wins, 4) : 0,
    averageLossBb: totals.losses ? round(totals.grossLossBb / totals.losses, 4) : 0,
  };
}

const profiles = Object.fromEntries(PROFILES.map(profile => [profile, {
  largeShowdown: combine(profile, "largeShowdown"),
  ordinaryShowdown: combine(profile, "ordinaryShowdown"),
  largeOutcome: combineLargeOutcome(profile),
}]));

function meanControl(metric) {
  return round((profiles.tight.largeShowdown[metric] + profiles.calling.largeShowdown[metric]) / 2);
}

const balancedLarge = profiles.balanced.largeShowdown;
const balancedOrdinary = profiles.balanced.ordinaryShowdown;
const balancedOutcome = profiles.balanced.largeOutcome;
const controlContinue = meanControl("aiContinueAfterHeroAggressionRate");
const controlEscalate = meanControl("aiRaiseOrAllinPresentRate");
const continueDiffControl = round(balancedLarge.aiContinueAfterHeroAggressionRate - controlContinue);
const continueDiffOrdinary = round(balancedLarge.aiContinueAfterHeroAggressionRate - balancedOrdinary.aiContinueAfterHeroAggressionRate);
const escalateDiffControl = round(balancedLarge.aiRaiseOrAllinPresentRate - controlEscalate);
const escalateDiffOrdinary = round(balancedLarge.aiRaiseOrAllinPresentRate - balancedOrdinary.aiRaiseOrAllinPresentRate);

function pairMetric(profile, pairIndex, category, metric) {
  return runs.find(run => run.profile === profile && run.pairIndex === pairIndex)?.[category]?.[metric] ?? 0;
}

const pairChecks = [0, 1].map(pairIndex => {
  const balancedContinue = pairMetric("balanced", pairIndex, "largeShowdown", "aiContinueAfterHeroAggressionRate");
  const controlContinuePair = (pairMetric("tight", pairIndex, "largeShowdown", "aiContinueAfterHeroAggressionRate")
    + pairMetric("calling", pairIndex, "largeShowdown", "aiContinueAfterHeroAggressionRate")) / 2;
  const balancedEscalate = pairMetric("balanced", pairIndex, "largeShowdown", "aiRaiseOrAllinPresentRate");
  const controlEscalatePair = (pairMetric("tight", pairIndex, "largeShowdown", "aiRaiseOrAllinPresentRate")
    + pairMetric("calling", pairIndex, "largeShowdown", "aiRaiseOrAllinPresentRate")) / 2;
  return {
    pairIndex,
    continueDiff: round(balancedContinue - controlContinuePair),
    escalateDiff: round(balancedEscalate - controlEscalatePair),
  };
});

const sampleSufficient = completedHands === configuredHands
  && configuredHands >= 1_500
  && runs.length === 6
  && balancedLarge.hands >= 8
  && balancedLarge.heroAggressionObservedRate >= 0.35;
const pairedContinue = pairChecks.every(pair => pair.continueDiff >= 0.10);
const pairedEscalate = pairChecks.every(pair => pair.escalateDiff >= 0.10);
const continueSignal = sampleSufficient && continueDiffControl >= 0.15 && continueDiffOrdinary >= 0.15 && pairedContinue;
const escalateSignal = sampleSufficient && escalateDiffControl >= 0.15 && escalateDiffOrdinary >= 0.15 && pairedEscalate;

let disposition = "NEED_MORE_RESPONSE_SAMPLE";
if (sampleSufficient) {
  if (continueSignal && escalateSignal) disposition = "BALANCED_AI_CONTINUATION_AND_ESCALATION_PATTERN";
  else if (continueSignal) disposition = "BALANCED_AI_CONTINUATION_PATTERN";
  else if (escalateSignal) disposition = "BALANCED_AI_ESCALATION_PATTERN";
  else if (continueDiffControl > 0.05 || escalateDiffControl > 0.05) disposition = "MIXED_BALANCED_RESPONSE_PATTERN";
  else disposition = "NO_BALANCED_RESPONSE_EXCESS";
}

let largePotOutcomeDisposition = "NEED_MORE_LARGE_POT_OUTCOME_SAMPLE";
if (sampleSufficient && balancedOutcome.events >= 20) {
  if (balancedOutcome.winRate >= 0.60 && balancedOutcome.netBb > 0) {
    largePotOutcomeDisposition = "BALANCED_LARGE_POT_POSITIVE_EDGE_SIGNAL";
  } else if (balancedOutcome.winRate >= 0.40 && balancedOutcome.winRate <= 0.60 && balancedOutcome.netBb <= 0) {
    largePotOutcomeDisposition = "BALANCED_LARGE_POT_VARIANCE_WITHOUT_EDGE";
  } else {
    largePotOutcomeDisposition = "MIXED_BALANCED_LARGE_POT_OUTCOME";
  }
}

const summary = {
  version: "1.1.0",
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
  largePotOutcomeDisposition,
  continueDiffControl,
  continueDiffOrdinary,
  escalateDiffControl,
  escalateDiffOrdinary,
  pairChecks,
  profiles,
  runs,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ai-balanced-large-pot-response-audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

const md = [
  "# AI Balanced Large-Pot Response Audit",
  "",
  `- Hands: ${completedHands}/${configuredHands}`,
  `- Runs: ${runs.length}/6 paired profile runs`,
  `- Sample sufficient: ${sampleSufficient ? "YES" : "NO"}`,
  `- Response disposition: ${disposition}`,
  `- Large-pot outcome disposition: ${largePotOutcomeDisposition}`,
  "- Observation only; action sequences use public actions/stacks/pot context and resolved winners, never hidden cards or future board.",
  "",
  "| Profile | 50BB+ showdown wins | Hero aggression seen | AI continue after Hero aggression | AI raise/all-in present | AI all-in present | Last AI continue |",
  "|---|---:|---:|---:|---:|---:|---:|",
  ...PROFILES.map(profile => {
    const row = profiles[profile].largeShowdown;
    return `| ${profile} | ${row.hands} | ${(row.heroAggressionObservedRate * 100).toFixed(1)}% | ${(row.aiContinueAfterHeroAggressionRate * 100).toFixed(1)}% | ${(row.aiRaiseOrAllinPresentRate * 100).toFixed(1)}% | ${(row.aiAllinPresentRate * 100).toFixed(1)}% | ${(row.lastAiContinueRate * 100).toFixed(1)}% |`;
  }),
  "",
  "## Two-sided 50BB+ showdown outcomes",
  "",
  "| Profile | Events | Wins | Losses | Win rate | Gross gain | Gross loss | Net BB | Avg win | Avg loss |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...PROFILES.map(profile => {
    const row = profiles[profile].largeOutcome;
    return `| ${profile} | ${row.events} | ${row.wins} | ${row.losses} | ${(row.winRate * 100).toFixed(1)}% | ${row.grossGainBb.toFixed(1)} | ${row.grossLossBb.toFixed(1)} | ${row.netBb.toFixed(1)} | ${row.averageWinBb.toFixed(1)} | ${row.averageLossBb.toFixed(1)} |`;
  }),
  "",
  "## Balanced 50BB+ vs balanced ordinary showdown wins",
  "",
  `- AI continue diff: ${(continueDiffOrdinary * 100).toFixed(1)} pp`,
  `- AI raise/all-in diff: ${(escalateDiffOrdinary * 100).toFixed(1)} pp`,
  `- Versus tight/calling 50BB+ control, continue diff: ${(continueDiffControl * 100).toFixed(1)} pp`,
  `- Versus tight/calling 50BB+ control, raise/all-in diff: ${(escalateDiffControl * 100).toFixed(1)} pp`,
  "",
  "## Paired-seed direction",
  "",
  "| Pair | Continue diff vs controls | Raise/all-in diff vs controls |",
  "|---:|---:|---:|",
  ...pairChecks.map(pair => `| ${pair.pairIndex} | ${(pair.continueDiff * 100).toFixed(1)} pp | ${(pair.escalateDiff * 100).toFixed(1)} pp |`),
  "",
  `Validation failures: gameplay=${failures}, scheduler=${schedulerErrors}, fairness=${fairnessFailures}, integrity=${integrityFailures}, audit=${auditErrors}.`,
].join("\n");
writeFileSync(join(outputDirectory, "ai-balanced-large-pot-response-audit-summary.md"), `${md}\n`);
console.log(md);
