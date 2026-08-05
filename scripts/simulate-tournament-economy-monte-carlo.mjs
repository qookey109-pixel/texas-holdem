const STARTING_TOTAL_CHIPS = 14_000;
const STARTING_ACTIVE_PLAYERS = 7;
const TRIALS_PER_PROFILE = Math.max(
  100,
  Number.parseInt(process.env.TOURNAMENT_MONTE_CARLO_TRIALS || "10000", 10),
);
const RANDOM_SEED = Number.parseInt(
  process.env.TOURNAMENT_MONTE_CARLO_SEED || "20260805",
  10,
) >>> 0;

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

const THEORETICAL_MAX_ENTRY_BB = REPLACEMENT_QUEUE.reduce(
  (sum, tier) => sum + ROLE_PROFILES[tier].max,
  0,
);

const BLIND_SCHEDULES = Object.freeze({
  official: Object.freeze({
    label: "現行：每 5 手，400 封頂",
    levels: [20, 40, 100, 200, 400],
    starts: [1, 6, 11, 16, 21],
  }),
  balancedClock: Object.freeze({
    label: "候選 D：前 4 後 5 手，16,000 封頂",
    levels: [
      20, 30, 50, 80, 120, 200, 300, 400, 600, 800,
      1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800, 16000,
    ],
    starts: [1, 5, 9, 13, 17, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85],
  }),
  smooth6Capped: Object.freeze({
    label: "候選 B：每 6 手，1,600 封頂",
    levels: [20, 30, 50, 80, 120, 200, 300, 500, 800, 1200, 1600],
    starts: [1, 7, 13, 19, 25, 31, 37, 43, 49, 55, 61],
  }),
  smooth6Open: Object.freeze({
    label: "候選 B2：每 6 手持續升級",
    levels: [
      20, 30, 50, 80, 120, 200, 300, 500, 800, 1200,
      2000, 3000, 5000, 8000, 12000, 20000, 30000, 50000, 80000,
    ],
    everyHands: 6,
  }),
  smooth8Open: Object.freeze({
    label: "候選 C：每 8 手持續升級",
    levels: [
      20, 30, 50, 80, 120, 200, 300, 500, 800, 1200,
      2000, 3000, 5000, 8000, 12000, 20000, 30000, 50000,
    ],
    everyHands: 8,
  }),
});

const PACE_PROFILES = Object.freeze({
  fast: Object.freeze({ label: "快速" }),
  normal: Object.freeze({ label: "一般" }),
  slow: Object.freeze({ label: "慢速" }),
  volatile: Object.freeze({ label: "爆發／拉鋸混合" }),
  stalled: Object.freeze({ label: "前段僵局" }),
});

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickWeighted(random, values, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return values[index];
  }
  return values.at(-1);
}

function randomInteger(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function generateEliminationPath(random, profileKey) {
  const hands = [];
  let hand = 0;

  for (let index = 0; index < 16; index += 1) {
    let increment = 1;

    if (profileKey === "fast") {
      increment = index > 0 && random() < 0.12
        ? 0
        : pickWeighted(random, [1, 2, 3, 4, 5], [0.20, 0.35, 0.25, 0.15, 0.05]);
    } else if (profileKey === "normal") {
      increment = index > 0 && random() < 0.06
        ? 0
        : pickWeighted(random, [2, 3, 4, 5, 6, 7, 8], [0.08, 0.15, 0.25, 0.22, 0.15, 0.10, 0.05]);
    } else if (profileKey === "slow") {
      increment = pickWeighted(
        random,
        [4, 5, 6, 7, 8, 9, 10, 12, 15],
        [0.05, 0.08, 0.12, 0.18, 0.18, 0.14, 0.10, 0.10, 0.05],
      );
    } else if (profileKey === "volatile") {
      if (index > 0 && random() < 0.18) {
        increment = 0;
      } else {
        increment = random() < 0.65
          ? randomInteger(random, 1, 4)
          : [7, 9, 12, 15, 20][randomInteger(random, 0, 4)];
      }
    } else if (profileKey === "stalled") {
      if (index === 0) {
        hand = randomInteger(random, 20, 50);
        hands.push(hand);
        continue;
      }
      increment = pickWeighted(
        random,
        [2, 3, 4, 5, 6, 8, 10],
        [0.10, 0.15, 0.22, 0.20, 0.15, 0.10, 0.08],
      );
    } else {
      throw new Error(`Unknown pace profile: ${profileKey}`);
    }

    hand = Math.max(1, hand + increment);
    hands.push(hand);
  }

  return hands;
}

function blindForHand(handNumber, schedule) {
  if (Array.isArray(schedule.starts)) {
    let value = schedule.levels[0];
    for (let index = 0; index < schedule.starts.length; index += 1) {
      if (handNumber >= schedule.starts[index]) value = schedule.levels[index];
    }
    return value;
  }

  const levelIndex = Math.max(0, Math.floor((handNumber - 1) / schedule.everyHands));
  return schedule.levels[Math.min(levelIndex, schedule.levels.length - 1)];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function calculateEntryBb({ currentTableBb, tableTargetBb, role, formula }) {
  const tableGapBb = tableTargetBb - currentTableBb;
  if (formula.kind === "hard-gap") {
    return clamp(tableGapBb, role.min, role.max);
  }
  if (formula.kind === "blended-gap") {
    const raw = role.target + formula.response * (tableGapBb - role.target);
    return clamp(raw, role.min, role.max);
  }
  throw new Error(`Unknown formula kind: ${formula.kind}`);
}

function simulatePath({ eliminationHands, schedule, tableTargetBb, formula }) {
  let activePlayers = STARTING_ACTIVE_PLAYERS;
  let totalChips = STARTING_TOTAL_CHIPS;
  let queueIndex = 0;
  let cumulativeEntryBb = 0;
  let geminiEntryBb = Number.NaN;
  let geminiPostTableBb = Number.NaN;
  let headsUpTableBb = Number.NaN;
  let maxEntryChips = 0;
  let minBoundHits = 0;
  let maxBoundHits = 0;
  let interiorHits = 0;
  let previousBlind = 0;

  for (const handNumber of eliminationHands) {
    if (activePlayers <= 1) break;

    const bigBlind = blindForHand(handNumber, schedule);
    if (!Number.isFinite(bigBlind) || bigBlind <= 0 || bigBlind < previousBlind) {
      throw new Error(`Invalid blind at hand ${handNumber}: ${bigBlind}`);
    }
    previousBlind = bigBlind;
    activePlayers -= 1;

    if (queueIndex < REPLACEMENT_QUEUE.length) {
      const tier = REPLACEMENT_QUEUE[queueIndex];
      queueIndex += 1;
      const role = ROLE_PROFILES[tier];
      const postEntryPlayers = activePlayers + 1;

      if (postEntryPlayers !== 7) {
        throw new Error(`Unexpected post-entry player count: ${postEntryPlayers}`);
      }

      const currentTableBb = totalChips / bigBlind;
      const entryBb = calculateEntryBb({ currentTableBb, tableTargetBb, role, formula });
      const entryChips = entryBb * bigBlind;

      if (!Number.isFinite(entryBb) || entryBb < role.min || entryBb > role.max) {
        throw new Error(`Invalid ${tier} entry BB: ${entryBb}`);
      }
      if (!Number.isFinite(entryChips) || entryChips < 0) {
        throw new Error(`Invalid ${tier} entry chips: ${entryChips}`);
      }

      totalChips += entryChips;
      cumulativeEntryBb += entryBb;
      activePlayers = postEntryPlayers;
      maxEntryChips = Math.max(maxEntryChips, entryChips);

      if (Math.abs(entryBb - role.min) <= Number.EPSILON) minBoundHits += 1;
      else if (Math.abs(entryBb - role.max) <= Number.EPSILON) maxBoundHits += 1;
      else interiorHits += 1;

      if (tier === "gemini") {
        geminiEntryBb = entryBb;
        geminiPostTableBb = totalChips / bigBlind;
      }
    }

    if (activePlayers === 2 && Number.isNaN(headsUpTableBb)) {
      headsUpTableBb = totalChips / bigBlind;
    }
  }

  if (queueIndex !== REPLACEMENT_QUEUE.length) {
    throw new Error(`Expected 10 replacements, got ${queueIndex}`);
  }
  if (cumulativeEntryBb > THEORETICAL_MAX_ENTRY_BB + 1e-9) {
    throw new Error(
      `Cumulative entry BB ${cumulativeEntryBb} exceeds ${THEORETICAL_MAX_ENTRY_BB}`,
    );
  }
  if (![headsUpTableBb, geminiEntryBb, geminiPostTableBb].every(Number.isFinite)) {
    throw new Error("Simulation did not reach Gemini and heads-up states");
  }

  return {
    finalHand: eliminationHands.at(-1),
    headsUpTableBb,
    geminiEntryBb,
    geminiPostTableBb,
    cumulativeEntryBb,
    maxEntryChips,
    minBoundHits,
    maxBoundHits,
    interiorHits,
  };
}

function percentile(sortedValues, percent) {
  if (!sortedValues.length) return Number.NaN;
  const position = (sortedValues.length - 1) * (percent / 100);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p1: percentile(sorted, 1),
    p5: percentile(sorted, 5),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeRuns(runs) {
  const headsUp = runs.map((run) => run.headsUpTableBb);
  const geminiEntry = runs.map((run) => run.geminiEntryBb);
  const geminiPost = runs.map((run) => run.geminiPostTableBb);
  const cumulative = runs.map((run) => run.cumulativeEntryBb);
  const maxEntryChips = runs.map((run) => run.maxEntryChips);
  const finalHand = runs.map((run) => run.finalHand);

  return {
    runs: runs.length,
    headsUp: summarize(headsUp),
    geminiEntry: summarize(geminiEntry),
    geminiPost: summarize(geminiPost),
    cumulative: summarize(cumulative),
    maxEntryChips: summarize(maxEntryChips),
    finalHand: summarize(finalHand),
    headsUpUnder20Rate: headsUp.filter((value) => value < 20).length / headsUp.length,
    headsUp20To150Rate:
      headsUp.filter((value) => value >= 20 && value <= 150).length / headsUp.length,
    headsUpOver200Rate: headsUp.filter((value) => value > 200).length / headsUp.length,
    geminiMinRate:
      geminiEntry.filter((value) => Math.abs(value - ROLE_PROFILES.gemini.min) <= Number.EPSILON).length
      / geminiEntry.length,
    geminiMaxRate:
      geminiEntry.filter((value) => Math.abs(value - ROLE_PROFILES.gemini.max) <= Number.EPSILON).length
      / geminiEntry.length,
    averageMinHits: mean(runs.map((run) => run.minBoundHits)),
    averageMaxHits: mean(runs.map((run) => run.maxBoundHits)),
    averageInteriorHits: mean(runs.map((run) => run.interiorHits)),
  };
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value) {
  return `${formatNumber(value * 100, 1)}%`;
}

const random = mulberry32(RANDOM_SEED);
const paths = [];
for (const profileKey of Object.keys(PACE_PROFILES)) {
  for (let index = 0; index < TRIALS_PER_PROFILE; index += 1) {
    paths.push({ profileKey, eliminationHands: generateEliminationPath(random, profileKey) });
  }
}

const baselineFormula = Object.freeze({ kind: "hard-gap" });
const scheduleResults = [];
for (const [scheduleKey, schedule] of Object.entries(BLIND_SCHEDULES)) {
  const runs = paths.map(({ eliminationHands }) => simulatePath({
    eliminationHands,
    schedule,
    tableTargetBb: 300,
    formula: baselineFormula,
  }));
  scheduleResults.push({ scheduleKey, label: schedule.label, ...summarizeRuns(runs) });
}

const balancedSchedule = BLIND_SCHEDULES.balancedClock;
const targetSensitivity = [];
for (const tableTargetBb of [160, 180, 200, 220, 240, 300]) {
  const runs = paths.map(({ eliminationHands }) => simulatePath({
    eliminationHands,
    schedule: balancedSchedule,
    tableTargetBb,
    formula: baselineFormula,
  }));
  targetSensitivity.push({ tableTargetBb, formula: "hard-gap", ...summarizeRuns(runs) });
}

const formulaSensitivity = [];
for (const configuration of [
  { tableTargetBb: 160, formula: { kind: "hard-gap" }, label: "160／hard-gap" },
  { tableTargetBb: 160, formula: { kind: "blended-gap", response: 0.25 }, label: "160／blend 25%" },
  { tableTargetBb: 180, formula: { kind: "hard-gap" }, label: "180／hard-gap" },
  { tableTargetBb: 180, formula: { kind: "blended-gap", response: 0.25 }, label: "180／blend 25%" },
  { tableTargetBb: 300, formula: { kind: "hard-gap" }, label: "300／hard-gap（目前）" },
]) {
  const runs = paths.map(({ eliminationHands }) => simulatePath({
    eliminationHands,
    schedule: balancedSchedule,
    tableTargetBb: configuration.tableTargetBb,
    formula: configuration.formula,
  }));
  formulaSensitivity.push({
    label: configuration.label,
    tableTargetBb: configuration.tableTargetBb,
    formula: configuration.formula,
    ...summarizeRuns(runs),
  });
}

const balancedByProfile = [];
for (const [profileKey, profile] of Object.entries(PACE_PROFILES)) {
  const runs = paths
    .filter((path) => path.profileKey === profileKey)
    .map(({ eliminationHands }) => simulatePath({
      eliminationHands,
      schedule: balancedSchedule,
      tableTargetBb: 300,
      formula: baselineFormula,
    }));
  balancedByProfile.push({ profileKey, label: profile.label, ...summarizeRuns(runs) });
}

console.log("# Tournament Economy V1 Monte Carlo");
console.log("");
console.log(`Seed: ${RANDOM_SEED}`);
console.log(`Trials: ${paths.length.toLocaleString("en-US")} paired paths (${TRIALS_PER_PROFILE.toLocaleString("en-US")} per pace profile)`);
console.log(`Theoretical replacement ceiling: ${THEORETICAL_MAX_ENTRY_BB} entry-BB`);
console.log("Synthetic timing stress test only; elimination intervals are not calibrated game telemetry.");
console.log("");
console.log("## Blind schedule comparison (table_target_bb = 300, hard-gap)");
console.log("");
console.log("| Schedule | Heads-up BB p5 / p50 / p95 | 20–150BB | <20BB | >200BB | Gemini entry p50 | Gemini max-rate | Bound hits min / interior / max | Max entry chips p95 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const result of scheduleResults) {
  console.log(`| ${result.label} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUp20To150Rate)} | ${formatPercent(result.headsUpUnder20Rate)} | ${formatPercent(result.headsUpOver200Rate)} | ${formatNumber(result.geminiEntry.p50)}BB | ${formatPercent(result.geminiMaxRate)} | ${formatNumber(result.averageMinHits)} / ${formatNumber(result.averageInteriorHits)} / ${formatNumber(result.averageMaxHits)} | ${formatNumber(result.maxEntryChips.p95, 0)} |`);
}

console.log("");
console.log("## Candidate D by pace profile (table_target_bb = 300, hard-gap)");
console.log("");
console.log("| Profile | Final hand p50 | Heads-up BB p5 / p50 / p95 | <20BB | >200BB | Gemini post-table BB p50 | Max entry chips p95 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
for (const result of balancedByProfile) {
  console.log(`| ${result.label} | ${formatNumber(result.finalHand.p50, 0)} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUpUnder20Rate)} | ${formatPercent(result.headsUpOver200Rate)} | ${formatNumber(result.geminiPost.p50)} | ${formatNumber(result.maxEntryChips.p95, 0)} |`);
}

console.log("");
console.log("## Candidate D table-target sensitivity (hard-gap)");
console.log("");
console.log("| table_target_bb | Heads-up BB p5 / p50 / p95 | <20BB | >200BB | Gemini entry p50 | Gemini min / max rate | Avg interior hits | Cumulative entry p50 / p95 |");
console.log("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const result of targetSensitivity) {
  console.log(`| ${result.tableTargetBb} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUpUnder20Rate)} | ${formatPercent(result.headsUpOver200Rate)} | ${formatNumber(result.geminiEntry.p50)}BB | ${formatPercent(result.geminiMinRate)} / ${formatPercent(result.geminiMaxRate)} | ${formatNumber(result.averageInteriorHits)} | ${formatNumber(result.cumulative.p50)} / ${formatNumber(result.cumulative.p95)} |`);
}

console.log("");
console.log("## Candidate D formula sensitivity");
console.log("");
console.log("| Configuration | Heads-up BB p5 / p50 / p95 | <20BB | >200BB | Gemini entry p5 / p50 / p95 | Gemini min / max rate | Bound hits min / interior / max |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
for (const result of formulaSensitivity) {
  console.log(`| ${result.label} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUpUnder20Rate)} | ${formatPercent(result.headsUpOver200Rate)} | ${formatNumber(result.geminiEntry.p5)} / ${formatNumber(result.geminiEntry.p50)} / ${formatNumber(result.geminiEntry.p95)}BB | ${formatPercent(result.geminiMinRate)} / ${formatPercent(result.geminiMaxRate)} | ${formatNumber(result.averageMinHits)} / ${formatNumber(result.averageInteriorHits)} / ${formatNumber(result.averageMaxHits)} |`);
}

console.log("");
console.log("## Machine-readable JSON");
console.log(JSON.stringify({
  seed: RANDOM_SEED,
  trialsPerProfile: TRIALS_PER_PROFILE,
  totalPaths: paths.length,
  theoreticalMaxEntryBb: THEORETICAL_MAX_ENTRY_BB,
  scheduleResults,
  balancedByProfile,
  targetSensitivity,
  formulaSensitivity,
}, null, 2));
