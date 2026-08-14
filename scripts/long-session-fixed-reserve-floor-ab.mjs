import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const label = process.env.VARIANT_LABEL || '';
const rule = process.env.PROMOTION_RULE || '';
const hands = process.env.LONG_SESSION_BALANCED_HANDS || '60';
const reserveFloor = 2000;
const freshSeeds = Array.from({ length: 16 }, (_, index) => 1279545205 + index);
const priorSeeds = new Set(Array.from({ length: 40 }, (_, index) => 1279545165 + index));
const runtimeFile = 'js/long-session-mode-v1.js';
const evidenceSpec = 'tests/e2e/long-session-balanced-pacing-evidence-v1.spec.js';

if (!['total_wealth_control', 'fixed_reserve_floor'].includes(label)) {
  throw new Error(`unexpected VARIANT_LABEL: ${label}`);
}
if (!['total-wealth', 'fixed-reserve-floor'].includes(rule)) {
  throw new Error(`unexpected PROMOTION_RULE: ${rule}`);
}
if (freshSeeds.length !== 16 || freshSeeds[0] !== 1279545205 || freshSeeds.at(-1) !== 1279545220) {
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
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
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
  const reserveReplacement = `session = createSession({ tableIndex: 0, bankroll: ${reserveFloor}, tableStack: TABLES[0].entry });`;
  const thresholdNeedle = 'if (observedTotalWealth >= candidate.entry) {';
  if (originalRuntime.split(reserveNeedle).length - 1 !== 1) throw new Error('expected exactly one initial bankroll baseline');
  if (originalRuntime.split(thresholdNeedle).length - 1 !== 1) throw new Error('expected exactly one promotion threshold');

  let patched = originalRuntime.replace(reserveNeedle, reserveReplacement);
  if (rule === 'fixed-reserve-floor') {
    patched = patched.replace(
      thresholdNeedle,
      `if (heroStack + Math.max(0, normalized.bankroll - ${reserveFloor}) >= candidate.entry) {`,
    );
  }
  fs.writeFileSync(runtimeFile, patched);
  run('git', ['diff', '--check']);

  console.log(`LONG_SESSION_FIXED_RESERVE_PREREG ${JSON.stringify({
    label,
    rule,
    count: freshSeeds.length,
    first: freshSeeds[0],
    last: freshSeeds.at(-1),
    overlap,
    initialReserve: reserveFloor,
    reserveFloor,
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
  console.log(`LONG_SESSION_FIXED_RESERVE_REPRO ${JSON.stringify(repro)}`);
  if (!repro.sameFingerprint || !repro.samePacing || !repro.sameActions || repro.initialBankroll !== reserveFloor) {
    throw new Error(`reproducibility failed: ${JSON.stringify(repro)}`);
  }

  const reports = freshSeeds.map(seed => runSeed(seed, `fresh-results/${label}/seed-${seed}`));
  const actualSeeds = reports.map(report => report.seed);
  if (JSON.stringify(actualSeeds) !== JSON.stringify(freshSeeds)) {
    throw new Error(`fresh seed coverage mismatch: ${JSON.stringify({ freshSeeds, actualSeeds })}`);
  }

  const promotionViolations = [];
  const reserveFloorErosion = [];
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

      const spendableCapital = hand.heroEndStack + Math.max(0, hand.bankrollBefore - reserveFloor);
      const eligible = rule === 'fixed-reserve-floor'
        ? spendableCapital >= target.entry
        : hand.expectedObservedWealth >= target.entry;
      if (!eligible) {
        promotionViolations.push({
          seed: report.seed,
          handNumber: hand.handNumber,
          heroEndStack: hand.heroEndStack,
          bankrollBefore: hand.bankrollBefore,
          spendableCapital,
          expectedObservedWealth: hand.expectedObservedWealth,
          targetEntry: target.entry,
        });
      }

      const postPromotionBankroll = hand.expectedObservedWealth - target.entry;
      const protectedBefore = Math.min(reserveFloor, hand.bankrollBefore);
      if (postPromotionBankroll < protectedBefore) {
        reserveFloorErosion.push({
          seed: report.seed,
          handNumber: hand.handNumber,
          bankrollBefore: hand.bankrollBefore,
          protectedBefore,
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
    evidenceKind: 'fresh-disjoint-fixed-seed-fixed-reserve-floor-ab',
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
    allInitialBankroll2000: reports.every(report => report.pacingHands?.[0]?.bankrollBefore === reserveFloor),
    promotionViolations: promotionViolations.length,
    reserveFloorErosionMoveUps: reserveFloorErosion.length,
    reserveFloorErosionExamples: reserveFloorErosion.slice(0, 8),
  };

  console.log(`LONG_SESSION_FIXED_RESERVE_VARIANT ${JSON.stringify(summary)}`);
  if (
    summary.failures ||
    summary.schedulerErrors ||
    !summary.allInitialBankroll2000 ||
    summary.promotionViolations ||
    (rule === 'fixed-reserve-floor' && summary.reserveFloorErosionMoveUps !== 0)
  ) {
    throw new Error(`integrity failed: ${JSON.stringify(summary)}`);
  }

  fs.writeFileSync(`fixed-reserve-floor-summary-${label}.json`, JSON.stringify(summary, null, 2));
} finally {
  fs.writeFileSync(runtimeFile, originalRuntime);
}
