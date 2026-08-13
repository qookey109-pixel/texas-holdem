export const LONG_SESSION_PACING_METRICS_VERSION = "1.0.0";

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function summarizeLongSessionPacing({ tables, hands, evidenceKind = "deterministic-design-path" } = {}) {
  if (!Array.isArray(tables) || tables.length < 2) throw new TypeError("tables must contain the Long Session ladder");
  if (!Array.isArray(hands) || hands.length < 1) throw new TypeError("hands must contain at least one completed hand");

  const tableCount = tables.length;
  let totalDeltaBb = 0;
  let totalExposureRatio = 0;
  let totalStartBb = 0;
  let minimumStartBb = Number.POSITIVE_INFINITY;
  let maximumExposureRatio = 0;
  let sub50BbHands = 0;
  let bustHands = 0;
  let reentries = 0;
  let moveUps = 0;
  let sessionEnds = 0;
  let highestTableIndex = 0;

  const normalizedHands = hands.map((hand, index) => {
    const tableIndex = Math.max(0, Math.trunc(finite(hand.tableIndex, `hands[${index}].tableIndex`)));
    const targetTableIndex = Math.max(0, Math.trunc(finite(hand.targetTableIndex ?? tableIndex, `hands[${index}].targetTableIndex`)));
    if (tableIndex >= tableCount || targetTableIndex >= tableCount) throw new RangeError(`hands[${index}] references an unknown table`);

    const table = tables[tableIndex];
    const bigBlind = finite(hand.bigBlind ?? table.big, `hands[${index}].bigBlind`);
    const startStack = finite(hand.startStack, `hands[${index}].startStack`);
    const endStack = finite(hand.endStack, `hands[${index}].endStack`);
    const bankrollBefore = finite(hand.bankrollBefore, `hands[${index}].bankrollBefore`);
    if (bigBlind <= 0 || startStack < 0 || endStack < 0 || bankrollBefore < 0) {
      throw new RangeError(`hands[${index}] contains invalid chip or blind values`);
    }

    const totalWealthBefore = bankrollBefore + startStack;
    const startBb = startStack / bigBlind;
    const deltaBb = (endStack - startStack) / bigBlind;
    const exposedWealthRatio = ratio(startStack, totalWealthBefore);
    const transition = String(hand.transition || "stay");

    totalDeltaBb += deltaBb;
    totalExposureRatio += exposedWealthRatio;
    totalStartBb += startBb;
    minimumStartBb = Math.min(minimumStartBb, startBb);
    maximumExposureRatio = Math.max(maximumExposureRatio, exposedWealthRatio);
    if (startBb < 50) sub50BbHands += 1;
    if (endStack <= 0) bustHands += 1;
    if (transition === "reentry") reentries += 1;
    if (transition === "move-up") moveUps += 1;
    if (transition === "session-ended") sessionEnds += 1;
    highestTableIndex = Math.max(highestTableIndex, tableIndex, targetTableIndex);

    return {
      handNumber: Math.max(1, Math.trunc(finite(hand.handNumber ?? index + 1, `hands[${index}].handNumber`))),
      tableIndex,
      targetTableIndex,
      bigBlind,
      startStack,
      endStack,
      bankrollBefore,
      transition,
      startBb: round(startBb, 4),
      deltaBb: round(deltaBb, 4),
      exposedWealthRatio: round(exposedWealthRatio, 6),
    };
  });

  const handCount = normalizedHands.length;
  const progressionDenominator = Math.max(1, tableCount - 1);
  return {
    version: LONG_SESSION_PACING_METRICS_VERSION,
    evidenceKind,
    interpretation: "design-pacing-only",
    notNormalBugEvidence: true,
    hands: handCount,
    heroBb100: round(totalDeltaBb * 100 / handCount, 4),
    activeStackRisk: {
      meanExposedWealthRatio: round(totalExposureRatio / handCount, 6),
      maxExposedWealthRatio: round(maximumExposureRatio, 6),
      meanStartBb: round(totalStartBb / handCount, 4),
      minStartBb: round(minimumStartBb, 4),
      sub50BbHandRate: round(sub50BbHands / handCount, 6),
    },
    bustFrequency: round(bustHands / handCount, 6),
    reentryFrequency: round(reentries / handCount, 6),
    progression: {
      moveUps,
      highestTableIndex,
      completionRatio: round(highestTableIndex / progressionDenominator, 6),
      reachedFinalTable: highestTableIndex === tableCount - 1,
      sessionEnds,
    },
    fairnessBoundary: {
      publicCompletedHandStateOnly: true,
      hiddenCardsRequired: false,
      futureDeckRequired: false,
    },
    sampleHands: normalizedHands,
  };
}
