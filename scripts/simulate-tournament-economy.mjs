const STARTING_TOTAL_CHIPS = 14_000;
const STARTING_ACTIVE_PLAYERS = 7;

const TABLE_TARGET_BB = Object.freeze({
  7: 300,
  6: 260,
  5: 220,
  4: 170,
  3: 115,
  2: 70,
});

const ROLE_PROFILES = Object.freeze({
  middle: Object.freeze({ min: 25, target: 35, max: 45 }),
  elite: Object.freeze({ min: 30, target: 40, max: 50 }),
  gemini: Object.freeze({ min: 40, target: 50, max: 70 }),
});

const REPLACEMENT_QUEUE = Object.freeze([
  ...Array.from({ length: 6 }, () => "middle"),
  ...Array.from({ length: 3 }, () => "elite"),
  "gemini",
]);

const BLIND_SCHEDULES = Object.freeze({
  official: {
    label: "現行：每 5 手，400 BB 封頂",
    everyHands: null,
    levels: [20, 40, 100, 200, 400],
    starts: [1, 6, 11, 16, 21],
  },
  smooth6Capped: {
    label: "候選 B：每 6 手平滑，1,600 封頂",
    everyHands: null,
    levels: [20, 30, 50, 80, 120, 200, 300, 500, 800, 1200, 1600],
    starts: [1, 7, 13, 19, 25, 31, 37, 43, 49, 55, 61],
  },
  smooth6Open: {
    label: "候選 B2：每 6 手平滑，持續升級",
    everyHands: 6,
    levels: [20, 30, 50, 80, 120, 200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 50000, 80000],
    starts: null,
  },
  smooth8Open: {
    label: "候選 C：每 8 手平滑，持續升級",
    everyHands: 8,
    levels: [20, 30, 50, 80, 120, 200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000],
    starts: null,
  },
});

const SCENARIOS = Object.freeze({
  burst: {
    label: "極端連勝：每 3 手同時淘汰 2 位",
    eliminationHands: [3, 3, 6, 6, 9, 9, 12, 12, 15, 15, 18, 18, 21, 21, 24, 24],
  },
  fast: {
    label: "快速：每 2 手淘汰 1 位",
    eliminationHands: Array.from({ length: 16 }, (_, index) => (index + 1) * 2),
  },
  normal: {
    label: "一般：每 4 手淘汰 1 位",
    eliminationHands: Array.from({ length: 16 }, (_, index) => (index + 1) * 4),
  },
  slow: {
    label: "慢速：每 7 手淘汰 1 位",
    eliminationHands: Array.from({ length: 16 }, (_, index) => (index + 1) * 7),
  },
  late: {
    label: "極端僵局：第 35 手才首次淘汰，之後每 3 手",
    eliminationHands: Array.from({ length: 16 }, (_, index) => 35 + index * 3),
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function blindForHand(handNumber, schedule) {
  if (Array.isArray(schedule.starts)) {
    let value = schedule.levels[0];
    schedule.starts.forEach((start, index) => {
      if (handNumber >= start) value = schedule.levels[index];
    });
    return value;
  }

  const levelIndex = Math.max(0, Math.floor((handNumber - 1) / schedule.everyHands));
  return schedule.levels[Math.min(levelIndex, schedule.levels.length - 1)];
}

function theoreticalMaxEntryBb() {
  return REPLACEMENT_QUEUE.reduce((sum, tier) => sum + ROLE_PROFILES[tier].max, 0);
}

function simulate(scheduleKey, scenarioKey) {
  const schedule = BLIND_SCHEDULES[scheduleKey];
  const scenario = SCENARIOS[scenarioKey];
  const queue = [...REPLACEMENT_QUEUE];
  const eliminationsByHand = new Map();

  scenario.eliminationHands.forEach((hand) => {
    eliminationsByHand.set(hand, (eliminationsByHand.get(hand) || 0) + 1);
  });

  let activePlayers = STARTING_ACTIVE_PLAYERS;
  let totalChips = STARTING_TOTAL_CHIPS;
  let cumulativeEntryBb = 0;
  let geminiEntry = null;
  let headsUp = null;
  let maxAbsoluteEntryChips = 0;
  let minBoundHits = 0;
  let maxBoundHits = 0;
  const entries = [];
  const timeline = [];
  const finalHand = Math.max(...scenario.eliminationHands);

  for (let handNumber = 1; handNumber <= finalHand; handNumber += 1) {
    const bigBlind = blindForHand(handNumber, schedule);
    const eliminations = eliminationsByHand.get(handNumber) || 0;

    for (let count = 0; count < eliminations; count += 1) {
      if (activePlayers <= 1) break;
      activePlayers -= 1;

      if (queue.length) {
        const tier = queue.shift();
        const role = ROLE_PROFILES[tier];
        const postEntryPlayers = activePlayers + 1;
        const currentTableBb = totalChips / bigBlind;
        const tableTargetBb = TABLE_TARGET_BB[postEntryPlayers];
        const stateReliable = Number.isFinite(currentTableBb) && Number.isFinite(tableTargetBb);
        const tableGapBb = stateReliable ? tableTargetBb - currentTableBb : null;
        const entryBb = stateReliable
          ? clamp(tableGapBb, role.min, role.max)
          : role.target;
        const entryChips = entryBb * bigBlind;

        if (!Number.isFinite(entryBb) || entryBb < role.min || entryBb > role.max) {
          throw new Error(`Invalid entry BB: ${tier} ${entryBb}`);
        }

        totalChips += entryChips;
        cumulativeEntryBb += entryBb;
        activePlayers = postEntryPlayers;
        maxAbsoluteEntryChips = Math.max(maxAbsoluteEntryChips, entryChips);
        if (entryBb === role.min) minBoundHits += 1;
        if (entryBb === role.max) maxBoundHits += 1;

        const entry = {
          tier,
          handNumber,
          bigBlind,
          entryBb,
          entryChips,
          currentTableBb,
          tableTargetBb,
          tableGapBb,
          postEntryTableBb: totalChips / bigBlind,
        };
        entries.push(entry);
        if (tier === "gemini") geminiEntry = entry;
      }

      if (activePlayers === 2 && !headsUp) {
        headsUp = {
          handNumber,
          bigBlind,
          tableBb: totalChips / bigBlind,
        };
      }
    }

    timeline.push({
      handNumber,
      bigBlind,
      activePlayers,
      totalChips,
      currentTableBb: totalChips / bigBlind,
    });
  }

  const maxEntryBb = theoreticalMaxEntryBb();
  if (cumulativeEntryBb > maxEntryBb + Number.EPSILON) {
    throw new Error(`Cumulative entry BB ${cumulativeEntryBb} exceeds ${maxEntryBb}`);
  }

  return {
    scheduleKey,
    scenarioKey,
    scheduleLabel: schedule.label,
    scenarioLabel: scenario.label,
    theoreticalMaxEntryBb: maxEntryBb,
    cumulativeEntryBb,
    entryUtilization: cumulativeEntryBb / maxEntryBb,
    peakTableBb: Math.max(...timeline.map((row) => row.currentTableBb)),
    geminiEntry,
    headsUp,
    final: timeline.at(-1),
    minBoundHits,
    maxBoundHits,
    maxAbsoluteEntryChips,
  };
}

function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

const results = [];
for (const scheduleKey of Object.keys(BLIND_SCHEDULES)) {
  for (const scenarioKey of Object.keys(SCENARIOS)) {
    results.push(simulate(scheduleKey, scenarioKey));
  }
}

console.log("# Tournament Economy V1 Simulation");
console.log("\nCurrent roster: 6 opening + 6 middle + 3 elite + Gemini = 16 AI.");
console.log(`Theoretical replacement injection ceiling: ${theoreticalMaxEntryBb()} entry-BB.`);
console.log("\n| Blind schedule | Scenario | Gemini hand / BB | Gemini entry | Table BB after Gemini | Heads-up hand / table BB | Cumulative entry BB | min / max hits | Max entry chips |");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");

for (const result of results) {
  const gemini = result.geminiEntry;
  const headsUp = result.headsUp;
  console.log(`| ${result.scheduleLabel} | ${result.scenarioLabel} | ${gemini ? `${gemini.handNumber} / ${formatNumber(gemini.bigBlind, 0)}` : "—"} | ${gemini ? `${formatNumber(gemini.entryBb)} BB` : "—"} | ${gemini ? formatNumber(gemini.postEntryTableBb) : "—"} | ${headsUp ? `${headsUp.handNumber} / ${formatNumber(headsUp.tableBb)}` : "—"} | ${formatNumber(result.cumulativeEntryBb)} | ${result.minBoundHits} / ${result.maxBoundHits} | ${formatNumber(result.maxAbsoluteEntryChips, 0)} |`);
}

console.log("\n## Machine-readable JSON");
console.log(JSON.stringify(results, null, 2));
