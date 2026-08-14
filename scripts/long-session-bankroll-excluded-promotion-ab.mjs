import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const label = process.env.VARIANT_LABEL || '';
const rule = process.env.PROMOTION_RULE || '';
const hands = process.env.LONG_SESSION_BALANCED_HANDS || '60';
const freshSeeds = Array.from({ length: 16 }, (_, index) => 1279545189 + index);
const priorSeeds = new Set(Array.from({ length: 24 }, (_, index) => 1279545165 + index));
const runtimeFile = 'js/long-session-mode-v1.js';
const evidenceSpec = 'tests/e2e/long-session-balanced-pacing-evidence-v1.spec.js';

if (!['total_wealth_control', 'bankroll_excluded'].includes(label)) {
  throw new Error(`unexpected VARIANT_LABEL: ${label}`);
}
if (!['total-wealth', 'table-stack-only'].includes(rule)) {
  throw new Error(`unexpected PROMOTION_RULE: ${rule}`);
}
if (freshSeeds.length !== 16 || freshSeeds[0] !== 1279545189 || freshSeeds.at(-1) !== 1279545204) {
  throw new Error(`fresh seed preregistration invalid: ${JSON.stringify(freshSeeds)}`);
}
const overlap = freshSeeds.filter(seed => priorSeeds.has(seed));
if (overlap.length) throw new Error(`fresh seed overlap: ${overlap.join(',')}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function findReport(root) {
  const file = walk(root).find(candidate => candidate.endsWith('long-session-balanced-pacing-evidence-v1.json'));
  if (!file) throw new Error(`missing report under ${root}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runSeed(seed, outputDir) {
  run('npx', [
    'playwright', 'test', evidenceSpec,
    '--project=chromium',
    '--retries=0',
    `--output=${outputDir}`,
  ], {
    env: {
      ...process.env,
      LONG_SESSION_BALANCED_HANDS: hands,
      LONG_SESSION_BALANCED_SEED: String(seed),
    },
  });
  return findReport(outputDir);
}

const originalRuntime = fs.readFileSync(runtimeFile, 'utf8');
try {
  const reserveNeedle = 'session = createSession({ tableIndex: 0, bankroll: 0, tableStack: TABLES[0].entry });';
  const reserveReplacement = 'session = createSession({ tableIndex: 0, bankroll: 2000, tableStack: TABLES[0].entry });';
  const thresholdNeedle = 'if (observedTotalWealth >= candidate.entry) {';
  const reserveMatches = originalRuntime.split(reserveNeedle).length - 1;
  const thresholdMatches = originalRuntime.split(thresholdNeedle).length - 1;
  if (reserveMatches !== 1) throw new Error(`expected one reserve baseline, found ${reserveMatches}`);
  if (thresholdMatches !== 1) throw new Error(`expected one promotion threshold, found ${thresholdMatches}`);

  let patched = originalRuntime.replace(reserveNeedle, reserveReplacement);
  if (rule === 'table-stack-only') {
    patched = patched.replace(thresholdNeedle, 'if (heroStack >= candidate.entry) {');
  }
  fs.writeFileSync(runtimeFile, patched);
  run('git', ['diff', '--check']);

  console.log(`LONG_SESSION_BANKROLL_EXCLUDED_PREREG ${JSON.stringify({
    label,
    rule,
    count: freshSeeds.length,
    first: freshSeeds[0],
    last: freshSeeds.at(-1),
    overlap,
    initialReserve: 2000,
  })}`);

  const reproSeed = freshSeeds[0];
  const reproA = runSeed(reproSeed, `repro-results/${label}-a`);
  const reproB = runSeed(reproSeed, `repro-results/${label}-b`);
  const repro = {
    label,
    rule,
    seed: reproSeed,
    sameFingerprint: reproA.deterministicFingerprint === reproB.deterministicFingerprint,
    samePacing: JSON.stringify(reproA.pacingHands) === JSON.stringify(reproB.pacingHands),
    sameActions: JSON.stringify(reproA.actionCounts) === JSON.stringify(reproB.actionCounts),
    fingerprint: reproA.deterministicFingerprint,
    initialBankroll: reproA.pacingHands?.[0]?.bankrollBefore,
  };
  console.log(`LONG_SESSION_BANKROLL_EXCLUDED_REPRO ${JSON.stringify(repro)}`);
  if (!repro.sameFingerprint || !repro.samePacing || !repro.sameActions || repro.initialBankroll !== 2000) {
    throw new Error(`reproducibility failed: ${JSON.stringify(repro)}`);
  }

  const reports = freshSeeds.map(seed => runSeed(seed, `fresh-results/${label}/seed-${seed}`));
  const actualSeeds = reports.map(report => report.seed);
  if (JSON.stringify(actualSeeds) !== JSON.stringify(freshSeeds)) {
    throw new Error(`fresh seed coverage mismatch: ${JSON.stringify({ freshSeeds, actualSeeds })}`);
  }

  const promotionViolations = [];
  const reserveErosion = [];
  let moveUpCount = 0;

  for (const report of reports) {
    for (const hand of report.handReports || []) {
      if (hand.transition !== 'move-up') continue;
      moveUpCount += 1;
      const target = report.tables?.[hand.targetTableIndex];
      if (!target) {
        promotionViolations.push({ seed: report.seed, handNumber: hand.handNumber, reason: 'missing-target' });
        continue;
      }
      const eligible = rule === 'table-stack-only'
        ? hand.heroEndStack >= target.entry
        : hand.expectedObservedWealth >= target.entry;
      if (!eligible) {
        promotionViolations.push({
          seed: report.seed,
          handNumber: hand.handNumber,
          heroEndStack: hand.heroEndStack,
          bankrollBefore: hand.bankrollBefore,
          expectedObservedWealth: hand.expectedObservedWealth,
          targetEntry: target.entry,
        });
      }
      const postPromotionBankroll = hand.expectedObservedWealth - target.entry;
      if (postPromotionBankroll < hand.bankrollBefore) {
        reserveErosion.push({
          seed: report.seed,
          handNumber: hand.handNumber,
          bankrollBefore: hand.bankrollBefore,
          postPromotionBankroll,
          heroEndStack: hand.heroEndStack,
          targetEntry: target.entry,
        });
      }
    }
  }

  const reachedT3 = reports.filter(report => (report.pacing?.progression?.highestTableIndex || 0) >= 2);
  const summary = {
    label,
    rule,
    evidenceKind: 'fresh-disjoint-fixed-seed-bankroll-excluded-promotion-ab',
    freshSeedFirst: freshSeeds[0],
    freshSeedLast: freshSeeds.at(-1),
    seeds: reports.length,
    primaryEndpoint: 'reachedT3Seeds',
    reachedT3Seeds: reachedT3.length,
    t3ReachRate: Number((reachedT3.length / reports.length).toFixed(6)),
    t3Seeds: reachedT3.map(report => report.seed),
    maxHighestTableIndex: Math.max(...reports.map(report => report.pacing?.progression?.highestTableIndex || 0)),
    totalHandsCompleted: reports.reduce((sum, report) => sum + report.handsCompleted, 0),
    meanHandsCompleted: Number((reports.reduce((sum, report) => sum + report.handsCompleted, 0) / reports.length).toFixed(3)),
    hitHandCeilingSeeds: reports.filter(report => report.handsCompleted >= Number(hands) && !report.sessionEnded).length,
    sessionEndedSeeds: reports.filter(report => report.sessionEnded).length,
    movedUpSeeds: reports.filter(report => (report.pacing?.progression?.moveUps || 0) > 0).length,
    moveUpCount,
    reachedFinalTableSeeds: reports.filter(report => report.pacing?.progression?.reachedFinalTable).length,
    reentrySeeds: reports.filter(report => (report.pacing?.reentryFrequency || 0) > 0).length,
    meanExposure: Number((reports.reduce((sum, report) => sum + (report.pacing?.activeStackRisk?.meanExposedWealthRatio || 0), 0) / reports.length).toFixed(6)),
    failures: reports.reduce((sum, report) => sum + report.failures.length, 0),
    schedulerErrors: reports.reduce((sum, report) => sum + report.schedulerErrors.length, 0),
    allInitialBankroll2000: reports.every(report => report.pacingHands?.[0]?.bankrollBefore === 2000),
    promotionViolations: promotionViolations.length,
    reserveErosionMoveUps: reserveErosion.length,
    reserveErosionExamples: reserveErosion.slice(0, 8),
  };

  console.log(`LONG_SESSION_BANKROLL_EXCLUDED_VARIANT ${JSON.stringify(summary)}`);
  if (
    summary.failures ||
    summary.schedulerErrors ||
    !summary.allInitialBankroll2000 ||
    summary.promotionViolations ||
    (rule === 'table-stack-only' && summary.reserveErosionMoveUps !== 0)
  ) {
    throw new Error(`integrity failed: ${JSON.stringify(summary)}`);
  }

  fs.writeFileSync(`bankroll-excluded-summary-${label}.json`, JSON.stringify(summary, null, 2));
} finally {
  fs.writeFileSync(runtimeFile, originalRuntime);
}
