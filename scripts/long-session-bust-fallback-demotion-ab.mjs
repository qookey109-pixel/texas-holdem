import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const label = process.env.VARIANT_LABEL || "";
const rule = process.env.BUST_RULE || "";
const hands = process.env.LONG_SESSION_BALANCED_HANDS || "60";
const freshSeeds = Array.from({ length: 16 }, (_, index) => 1279545221 + index);
const priorSeeds = new Set(Array.from({ length: 56 }, (_, index) => 1279545165 + index));
const runtimeFile = "js/long-session-mode-v1.js";
const evidenceSpec = "tests/e2e/long-session-balanced-pacing-evidence-v1.spec.js";
const reserveBaseline = 2000;

if (!["current_bust_control", "highest_affordable_fallback"].includes(label)) {
  throw new Error(`unexpected VARIANT_LABEL: ${label}`);
}
if (!["current-bust", "highest-affordable-fallback"].includes(rule)) {
  throw new Error(`unexpected BUST_RULE: ${rule}`);
}
if (freshSeeds.length !== 16 || freshSeeds[0] !== 1279545221 || freshSeeds.at(-1) !== 1279545236) {
  throw new Error(`fresh seed preregistration invalid: ${JSON.stringify(freshSeeds)}`);
}
const overlap = freshSeeds.filter(seed => priorSeeds.has(seed));
if (overlap.length) throw new Error(`fresh seed overlap: ${overlap.join(",")}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function findReport(root) {
  const file = walk(root).find(candidate => candidate.endsWith("long-session-balanced-pacing-evidence-v1.json"));
  if (!file) throw new Error(`missing report under ${root}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runSeed(seed, outputDir) {
  run("npx", [
    "playwright", "test", evidenceSpec,
    "--project=chromium",
    "--retries=0",
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

function replaceExactlyOnce(source, needle, replacement, labelText) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${labelText} expected exactly once, found ${count}`);
  return source.replace(needle, replacement);
}

const originalRuntime = fs.readFileSync(runtimeFile, "utf8");
const originalEvidence = fs.readFileSync(evidenceSpec, "utf8");

try {
  const reserveNeedle = "session = createSession({ tableIndex: 0, bankroll: 0, tableStack: TABLES[0].entry });";
  let patchedRuntime = replaceExactlyOnce(
    originalRuntime,
    reserveNeedle,
    `session = createSession({ tableIndex: 0, bankroll: ${reserveBaseline}, tableStack: TABLES[0].entry });`,
    "initial bankroll baseline",
  );

  let patchedEvidence = replaceExactlyOnce(
    originalEvidence,
    "            observedTotalWealth,\n            transitionWealthConserved,",
    "            observedTotalWealth,\n            proposedBankroll: Number(proposal?.proposedBankroll ?? after.session?.bankroll),\n            proposedTableStack: Number(proposal?.proposedTableStack ?? heroEndStack),\n            transitionWealthConserved,",
    "evidence proposal accounting fields",
  );

  if (rule === "highest-affordable-fallback") {
    const bustNeedle = `    if (heroStack <= 0) {
      if (normalized.bankroll >= current.entry) {
        transition = "reentry";
        proposedBankroll = normalized.bankroll - current.entry;
        proposedTableStack = current.entry;
      } else {
        transition = "session-ended";
        proposedTableStack = 0;
      }
    } else if (current.index < TABLES.length - 1) {`;

    const bustReplacement = `    if (heroStack <= 0) {
      if (normalized.bankroll >= current.entry) {
        transition = "reentry";
        proposedBankroll = normalized.bankroll - current.entry;
        proposedTableStack = current.entry;
      } else {
        const fallback = [...TABLES]
          .slice(0, current.index)
          .reverse()
          .find(table => normalized.bankroll >= table.entry) || null;
        if (fallback) {
          transition = "move-down";
          target = fallback;
          proposedBankroll = normalized.bankroll - fallback.entry;
          proposedTableStack = fallback.entry;
        } else {
          transition = "session-ended";
          proposedTableStack = 0;
        }
      }
    } else if (current.index < TABLES.length - 1) {`;

    patchedRuntime = replaceExactlyOnce(
      patchedRuntime,
      bustNeedle,
      bustReplacement,
      "bust fallback branch",
    );

    patchedRuntime = replaceExactlyOnce(
      patchedRuntime,
      '    if (proposal.transition === "reentry" && action === "secondary") {',
      '    if ((proposal.transition === "reentry" || proposal.transition === "move-down") && action === "secondary") {',
      "secondary pause handling",
    );

    patchedRuntime = replaceExactlyOnce(
      patchedRuntime,
      `    if (proposal.transition === "reentry") {
      return {
        title: "Long Session 重新買入",
        body: \`本桌籌碼歸零。資金庫足夠用固定 100BB 重新進入 \${proposal.currentTable.small}/\${proposal.currentTable.big}。\`,
        primary: \`重新買入 \${proposal.currentTable.entry}\`,
        secondary: "暫不重新買入",
      };
    }`,
      `    if (proposal.transition === "move-down") {
      return {
        title: "Long Session 降桌",
        body: \`本桌籌碼歸零，資金庫不足以重新進入 \${proposal.currentTable.small}/\${proposal.currentTable.big}，但可回到 \${proposal.targetTable.small}/\${proposal.targetTable.big} 以固定 100BB 繼續。\`,
        primary: \`降到 \${proposal.targetTable.small}/\${proposal.targetTable.big}\`,
        secondary: "暫停 Long Session",
      };
    }
    if (proposal.transition === "reentry") {
      return {
        title: "Long Session 重新買入",
        body: \`本桌籌碼歸零。資金庫足夠用固定 100BB 重新進入 \${proposal.currentTable.small}/\${proposal.currentTable.big}。\`,
        primary: \`重新買入 \${proposal.currentTable.entry}\`,
        secondary: "暫不重新買入",
      };
    }`,
      "move-down decision copy",
    );

    patchedRuntime = replaceExactlyOnce(
      patchedRuntime,
      `    if (result.transition === "move-up") {
      const table = tableAt(session.tableIndex);
      announce?.(\`Long Session 升桌 \${table.small} / \${table.big}\`);
      return startCommittedHand({ fresh: true, message: \`升桌到 \${table.small}/\${table.big}，Hero 與 6 位 AI 皆以 100BB 入桌。\` });
    }

    if (transition === "reentry") {`,
      `    if (result.transition === "move-up") {
      const table = tableAt(session.tableIndex);
      announce?.(\`Long Session 升桌 \${table.small} / \${table.big}\`);
      return startCommittedHand({ fresh: true, message: \`升桌到 \${table.small}/\${table.big}，Hero 與 6 位 AI 皆以 100BB 入桌。\` });
    }

    if (result.transition === "move-down") {
      const table = tableAt(session.tableIndex);
      announce?.(\`Long Session 降桌 \${table.small} / \${table.big}\`);
      return startCommittedHand({ fresh: true, message: \`降桌到 \${table.small}/\${table.big}，Hero 與 6 位 AI 皆以 100BB 入桌。\` });
    }

    if (transition === "reentry") {`,
      "move-down resolve handling",
    );

    patchedEvidence = replaceExactlyOnce(
      patchedEvidence,
      '          if ((transition === "move-up" || transition === "reentry") && handIndex + 1 < handCount) {',
      '          if ((transition === "move-up" || transition === "move-down" || transition === "reentry") && handIndex + 1 < handCount) {',
      "evidence move-down primary click",
    );
  }

  fs.writeFileSync(runtimeFile, patchedRuntime);
  fs.writeFileSync(evidenceSpec, patchedEvidence);
  run("git", ["diff", "--check"]);

  console.log(`LONG_SESSION_BUST_FALLBACK_PREREG ${JSON.stringify({
    label,
    rule,
    count: freshSeeds.length,
    first: freshSeeds[0],
    last: freshSeeds.at(-1),
    overlap,
    initialReserve: reserveBaseline,
    promotionRule: "total-wealth-1.00x-unchanged",
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
  console.log(`LONG_SESSION_BUST_FALLBACK_REPRO ${JSON.stringify(repro)}`);
  if (!repro.sameFingerprint || !repro.samePacing || !repro.sameActions || repro.initialBankroll !== reserveBaseline) {
    throw new Error(`reproducibility failed: ${JSON.stringify(repro)}`);
  }

  const reports = freshSeeds.map(seed => runSeed(seed, `fresh-results/${label}/seed-${seed}`));
  const actualSeeds = reports.map(report => report.seed);
  if (JSON.stringify(actualSeeds) !== JSON.stringify(freshSeeds)) {
    throw new Error(`fresh seed coverage mismatch: ${JSON.stringify({ freshSeeds, actualSeeds })}`);
  }

  const promotionViolations = [];
  const moveDownViolations = [];
  let moveUpCount = 0;
  let moveDownCount = 0;

  for (const report of reports) {
    const tables = report.tables || [];
    for (const hand of report.handReports || []) {
      const current = tables[hand.tableIndex];
      const target = tables[hand.targetTableIndex];

      if (hand.transition === "move-up") {
        moveUpCount += 1;
        if (!target || hand.expectedObservedWealth < target.entry) {
          promotionViolations.push({
            seed: report.seed,
            handNumber: hand.handNumber,
            tableIndex: hand.tableIndex,
            targetTableIndex: hand.targetTableIndex,
            expectedObservedWealth: hand.expectedObservedWealth,
            targetEntry: target?.entry,
          });
        }
      }

      if (hand.transition === "move-down") {
        moveDownCount += 1;
        const affordableLower = tables
          .filter(table => table.index < hand.tableIndex && table.entry <= hand.bankrollBefore)
          .sort((left, right) => right.index - left.index);
        const expectedTarget = affordableLower[0] || null;
        const expectedBankrollAfter = expectedTarget ? hand.bankrollBefore - expectedTarget.entry : null;
        const valid = Boolean(
          current
          && target
          && hand.heroEndStack === 0
          && hand.bankrollBefore < current.entry
          && expectedTarget
          && target.index === expectedTarget.index
          && hand.proposedTableStack === target.entry
          && hand.proposedBankroll === expectedBankrollAfter
          && hand.expectedObservedWealth === hand.bankrollBefore
        );
        if (!valid) {
          moveDownViolations.push({
            seed: report.seed,
            handNumber: hand.handNumber,
            tableIndex: hand.tableIndex,
            targetTableIndex: hand.targetTableIndex,
            heroEndStack: hand.heroEndStack,
            bankrollBefore: hand.bankrollBefore,
            currentEntry: current?.entry,
            expectedTargetIndex: expectedTarget?.index ?? null,
            targetEntry: target?.entry,
            proposedBankroll: hand.proposedBankroll,
            proposedTableStack: hand.proposedTableStack,
            expectedBankrollAfter,
            expectedObservedWealth: hand.expectedObservedWealth,
          });
        }
      }
    }
  }

  const maxTableIndex = report => Math.max(
    0,
    ...(report.handReports || []).flatMap(hand => [hand.tableIndex, hand.targetTableIndex ?? hand.tableIndex]),
  );
  const reachedT3 = reports.filter(report => maxTableIndex(report) >= 2);
  const reachedFinal = reports.filter(report => maxTableIndex(report) >= 4);
  const moveDownReports = reports.filter(report => (report.handReports || []).some(hand => hand.transition === "move-down"));
  const recoveredAfterMoveDown = reports.filter(report => {
    const handsRows = report.handReports || [];
    for (let index = 0; index < handsRows.length; index += 1) {
      const hand = handsRows[index];
      if (hand.transition !== "move-down") continue;
      const sourceIndex = hand.tableIndex;
      if (handsRows.slice(index + 1).some(later => later.tableIndex >= sourceIndex)) return true;
    }
    return false;
  });

  const summary = {
    label,
    rule,
    evidenceKind: "fresh-disjoint-fixed-seed-bust-fallback-demotion-ab",
    freshSeedFirst: freshSeeds[0],
    freshSeedLast: freshSeeds.at(-1),
    seeds: reports.length,
    primaryEndpoint: "reachedT3Seeds",
    reachedT3Seeds: reachedT3.length,
    t3ReachRate: Number((reachedT3.length / reports.length).toFixed(6)),
    t3Seeds: reachedT3.map(report => report.seed),
    reachedFinalTableSeeds: reachedFinal.length,
    maxHighestTableIndex: Math.max(...reports.map(maxTableIndex)),
    totalHandsCompleted: reports.reduce((sum, report) => sum + report.handsCompleted, 0),
    meanHandsCompleted: Number((reports.reduce((sum, report) => sum + report.handsCompleted, 0) / reports.length).toFixed(3)),
    hitHandCeilingSeeds: reports.filter(report => report.handsCompleted >= Number(hands) && !report.sessionEnded).length,
    sessionEndedSeeds: reports.filter(report => report.sessionEnded).length,
    movedUpSeeds: reports.filter(report => (report.handReports || []).some(hand => hand.transition === "move-up")).length,
    moveUpCount,
    reentrySeeds: reports.filter(report => (report.handReports || []).some(hand => hand.transition === "reentry")).length,
    moveDownSeeds: moveDownReports.length,
    moveDownCount,
    recoveredAfterMoveDownSeeds: recoveredAfterMoveDown.length,
    meanExposure: Number((reports.reduce((sum, report) => sum + (report.pacing?.activeStackRisk?.meanExposedWealthRatio || 0), 0) / reports.length).toFixed(6)),
    failures: reports.reduce((sum, report) => sum + report.failures.length, 0),
    schedulerErrors: reports.reduce((sum, report) => sum + report.schedulerErrors.length, 0),
    allInitialBankroll2000: reports.every(report => report.pacingHands?.[0]?.bankrollBefore === reserveBaseline),
    promotionViolations: promotionViolations.length,
    moveDownViolations: moveDownViolations.length,
    moveDownViolationExamples: moveDownViolations.slice(0, 8),
  };

  console.log(`LONG_SESSION_BUST_FALLBACK_VARIANT ${JSON.stringify(summary)}`);
  if (
    summary.failures
    || summary.schedulerErrors
    || !summary.allInitialBankroll2000
    || summary.promotionViolations
    || summary.moveDownViolations
    || (rule === "current-bust" && summary.moveDownCount !== 0)
  ) {
    throw new Error(`integrity failed: ${JSON.stringify(summary)}`);
  }

  fs.writeFileSync(`bust-fallback-summary-${label}.json`, JSON.stringify(summary, null, 2));
} finally {
  fs.writeFileSync(runtimeFile, originalRuntime);
  fs.writeFileSync(evidenceSpec, originalEvidence);
}
