const STARTING_TOTAL_CHIPS = 14_000;
const SEEDS = [20260805, 20260806, 20260807, 20260808, 20260809];
const TRIALS_PER_PROFILE_PER_SEED = Math.max(
  100,
  Number.parseInt(process.env.TOURNAMENT_FINALIST_TRIALS || "4000", 10),
);

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

const BALANCED_CLOCK = Object.freeze({
  levels: [
    20, 30, 50, 80, 120, 200, 300, 400, 600, 800,
    1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800, 16000,
  ],
  starts: [1, 5, 9, 13, 17, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85],
});

const PACE_PROFILES = Object.freeze(["fast", "normal", "slow", "volatile", "stalled"]);

const ACCEPTANCE_GATES = Object.freeze({
  headsUpP5Minimum: 20.5,
  headsUpP95Maximum: 190,
  headsUp20To150Minimum: 0.84,
  headsUpUnder20Maximum: 0.05,
  headsUpOver200Maximum: 0.04,
  geminiMedianMinimum: 48,
  geminiMedianMaximum: 55,
  geminiP95Maximum: 68,
  geminiMaxRateMaximum: 0.03,
  averageInteriorHitsMinimum: 3,
  cumulativeP95Maximum: 475,
  volatileUnder20Maximum: 0.20,
  stalledOver200Maximum: 0.20,
});

const NAMED_CANDIDATES = Object.freeze([
  { key: "F1", label: "F1：160BB／blend 15%", tableTargetBb: 160, response: 0.15 },
  { key: "E1", label: "E1：160BB／blend 25%", tableTargetBb: 160, response: 0.25 },
  { key: "E2", label: "E2：180BB／blend 25%", tableTargetBb: 180, response: 0.25 },
]);

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
      if (index > 0 && random() < 0.18) increment = 0;
      else increment = random() < 0.65
        ? randomInteger(random, 1, 4)
        : [7, 9, 12, 15, 20][randomInteger(random, 0, 4)];
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
      throw new Error(`Unknown profile: ${profileKey}`);
    }

    hand = Math.max(1, hand + increment);
    hands.push(hand);
  }

  return hands;
}

function blindForHand(handNumber) {
  let bigBlind = BALANCED_CLOCK.levels[0];
  for (let index = 0; index < BALANCED_CLOCK.starts.length; index += 1) {
    if (handNumber >= BALANCED_CLOCK.starts[index]) {
      bigBlind = BALANCED_CLOCK.levels[index];
    }
  }
  return bigBlind;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function simulatePath(eliminationHands, configuration) {
  let totalChips = STARTING_TOTAL_CHIPS;
  let cumulativeEntryBb = 0;
  let minHits = 0;
  let maxHits = 0;
  let interiorHits = 0;
  let maxEntryChips = 0;
  let geminiEntryBb = Number.NaN;

  for (let index = 0; index < REPLACEMENT_QUEUE.length; index += 1) {
    const tier = REPLACEMENT_QUEUE[index];
    const role = ROLE_PROFILES[tier];
    const bigBlind = blindForHand(eliminationHands[index]);
    const currentTableBb = totalChips / bigBlind;
    const tableGapBb = configuration.tableTargetBb - currentTableBb;
    const rawEntryBb = role.target
      + configuration.response * (tableGapBb - role.target);
    const entryBb = clamp(rawEntryBb, role.min, role.max);
    const entryChips = entryBb * bigBlind;

    totalChips += entryChips;
    cumulativeEntryBb += entryBb;
    maxEntryChips = Math.max(maxEntryChips, entryChips);

    if (Math.abs(entryBb - role.min) <= Number.EPSILON) minHits += 1;
    else if (Math.abs(entryBb - role.max) <= Number.EPSILON) maxHits += 1;
    else interiorHits += 1;

    if (tier === "gemini") geminiEntryBb = entryBb;
  }

  const headsUpTableBb = totalChips / blindForHand(eliminationHands[14]);

  return {
    headsUpTableBb,
    geminiEntryBb,
    cumulativeEntryBb,
    minHits,
    maxHits,
    interiorHits,
    maxEntryChips,
  };
}

function percentile(sortedValues, percent) {
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
    p5: percentile(sorted, 5),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeRuns(paths, configuration) {
  const runs = paths.map((path) => ({
    profileKey: path.profileKey,
    ...simulatePath(path.eliminationHands, configuration),
  }));
  const headsUp = runs.map((run) => run.headsUpTableBb);
  const gemini = runs.map((run) => run.geminiEntryBb);
  const cumulative = runs.map((run) => run.cumulativeEntryBb);
  const maxEntryChips = runs.map((run) => run.maxEntryChips);

  const byProfile = {};
  for (const profileKey of PACE_PROFILES) {
    const profileRuns = runs.filter((run) => run.profileKey === profileKey);
    const values = profileRuns.map((run) => run.headsUpTableBb);
    byProfile[profileKey] = {
      p50: summarize(values).p50,
      under20Rate: values.filter((value) => value < 20).length / values.length,
      over200Rate: values.filter((value) => value > 200).length / values.length,
    };
  }

  return {
    headsUp: summarize(headsUp),
    headsUp20To150Rate:
      headsUp.filter((value) => value >= 20 && value <= 150).length / headsUp.length,
    headsUpUnder20Rate: headsUp.filter((value) => value < 20).length / headsUp.length,
    headsUpOver200Rate: headsUp.filter((value) => value > 200).length / headsUp.length,
    gemini: summarize(gemini),
    geminiMinRate: gemini.filter((value) => Math.abs(value - 40) <= Number.EPSILON).length / gemini.length,
    geminiMaxRate: gemini.filter((value) => Math.abs(value - 70) <= Number.EPSILON).length / gemini.length,
    averageMinHits: mean(runs.map((run) => run.minHits)),
    averageInteriorHits: mean(runs.map((run) => run.interiorHits)),
    averageMaxHits: mean(runs.map((run) => run.maxHits)),
    cumulative: summarize(cumulative),
    maxEntryChips: summarize(maxEntryChips),
    byProfile,
  };
}

function passesGates(result) {
  const gates = ACCEPTANCE_GATES;
  return result.headsUp.p5 >= gates.headsUpP5Minimum
    && result.headsUp.p95 <= gates.headsUpP95Maximum
    && result.headsUp20To150Rate >= gates.headsUp20To150Minimum
    && result.headsUpUnder20Rate <= gates.headsUpUnder20Maximum
    && result.headsUpOver200Rate <= gates.headsUpOver200Maximum
    && result.gemini.p50 >= gates.geminiMedianMinimum
    && result.gemini.p50 <= gates.geminiMedianMaximum
    && result.gemini.p95 <= gates.geminiP95Maximum
    && result.geminiMaxRate <= gates.geminiMaxRateMaximum
    && result.averageInteriorHits >= gates.averageInteriorHitsMinimum
    && result.cumulative.p95 <= gates.cumulativeP95Maximum
    && result.byProfile.volatile.under20Rate <= gates.volatileUnder20Maximum
    && result.byProfile.stalled.over200Rate <= gates.stalledOver200Maximum;
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

const paths = [];
for (const seed of SEEDS) {
  const random = mulberry32(seed);
  for (const profileKey of PACE_PROFILES) {
    for (let index = 0; index < TRIALS_PER_PROFILE_PER_SEED; index += 1) {
      paths.push({ seed, profileKey, eliminationHands: generateEliminationPath(random, profileKey) });
    }
  }
}

const grid = [];
for (let tableTargetBb = 150; tableTargetBb <= 190; tableTargetBb += 5) {
  for (const response of [0.15, 0.20, 0.25, 0.30, 0.35]) {
    const configuration = { tableTargetBb, response };
    const result = summarizeRuns(paths, configuration);
    grid.push({ ...configuration, ...result, passes: passesGates(result) });
  }
}

const passing = grid
  .filter((result) => result.passes)
  .sort((left, right) => {
    if (right.headsUp20To150Rate !== left.headsUp20To150Rate) {
      return right.headsUp20To150Rate - left.headsUp20To150Rate;
    }
    if (right.averageInteriorHits !== left.averageInteriorHits) {
      return right.averageInteriorHits - left.averageInteriorHits;
    }
    return Math.abs(left.gemini.p50 - 50) - Math.abs(right.gemini.p50 - 50);
  });

const namedResults = NAMED_CANDIDATES.map((candidate) => {
  const result = summarizeRuns(paths, candidate);
  return { ...candidate, ...result, passes: passesGates(result) };
});

const f1Configuration = NAMED_CANDIDATES.find((candidate) => candidate.key === "F1");
const f1BySeed = SEEDS.map((seed) => ({
  seed,
  ...summarizeRuns(paths.filter((path) => path.seed === seed), f1Configuration),
}));

const selected = passing[0];
if (!selected) throw new Error("No grid candidate passed the provisional acceptance gates");
if (selected.tableTargetBb !== 160 || selected.response !== 0.15) {
  throw new Error(`Unexpected selected candidate: ${selected.tableTargetBb}/${selected.response}`);
}

console.log("# Tournament Economy V1 Finalist Selection");
console.log("");
console.log(`Seeds: ${SEEDS.join(", ")}`);
console.log(`Paths: ${paths.length.toLocaleString("en-US")} (${TRIALS_PER_PROFILE_PER_SEED.toLocaleString("en-US")} per profile per seed)`);
console.log("Synthetic timing stress test; not calibrated player telemetry.");
console.log("");
console.log("## Named finalists");
console.log("");
console.log("| Candidate | Pass | Heads-up BB p5 / p50 / p95 | 20–150BB | <20BB | >200BB | Gemini p50 / p95 | Gemini min / max | Interior hits | Cumulative p95 | Max chips p95 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const result of namedResults) {
  console.log(`| ${result.label} | ${result.passes ? "PASS" : "FAIL"} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUp20To150Rate)} | ${formatPercent(result.headsUpUnder20Rate)} | ${formatPercent(result.headsUpOver200Rate)} | ${formatNumber(result.gemini.p50)} / ${formatNumber(result.gemini.p95)}BB | ${formatPercent(result.geminiMinRate)} / ${formatPercent(result.geminiMaxRate)} | ${formatNumber(result.averageInteriorHits)} | ${formatNumber(result.cumulative.p95)} | ${formatNumber(result.maxEntryChips.p95, 0)} |`);
}

console.log("");
console.log("## F1 seed stability");
console.log("");
console.log("| Seed | Heads-up BB p5 / p50 / p95 | 20–150BB | <20BB | >200BB | Gemini p50 | Interior hits | Cumulative p95 |");
console.log("|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const result of f1BySeed) {
  console.log(`| ${result.seed} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUp20To150Rate)} | ${formatPercent(result.headsUpUnder20Rate)} | ${formatPercent(result.headsUpOver200Rate)} | ${formatNumber(result.gemini.p50)}BB | ${formatNumber(result.averageInteriorHits)} | ${formatNumber(result.cumulative.p95)} |`);
}

console.log("");
console.log("## F1 pace stress");
console.log("");
console.log("| Pace | Heads-up p50 | <20BB | >200BB |");
console.log("|---|---:|---:|---:|");
const f1Overall = namedResults.find((result) => result.key === "F1");
for (const profileKey of PACE_PROFILES) {
  const result = f1Overall.byProfile[profileKey];
  console.log(`| ${profileKey} | ${formatNumber(result.p50)} | ${formatPercent(result.under20Rate)} | ${formatPercent(result.over200Rate)} |`);
}

console.log("");
console.log("## Top passing grid candidates");
console.log("");
console.log("| Rank | Target | Response | Heads-up p5 / p50 / p95 | 20–150BB | Gemini p50 | Interior hits | Cumulative p95 |");
console.log("|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const [index, result] of passing.slice(0, 10).entries()) {
  console.log(`| ${index + 1} | ${result.tableTargetBb}BB | ${formatPercent(result.response)} | ${formatNumber(result.headsUp.p5)} / ${formatNumber(result.headsUp.p50)} / ${formatNumber(result.headsUp.p95)} | ${formatPercent(result.headsUp20To150Rate)} | ${formatNumber(result.gemini.p50)}BB | ${formatNumber(result.averageInteriorHits)} | ${formatNumber(result.cumulative.p95)} |`);
}

console.log("");
console.log(`Selected V1 simulation candidate: F1 = ${selected.tableTargetBb}BB target, ${formatPercent(selected.response)} blend response.`);
console.log("");
console.log("## Machine-readable JSON");
console.log(JSON.stringify({
  seeds: SEEDS,
  trialsPerProfilePerSeed: TRIALS_PER_PROFILE_PER_SEED,
  totalPaths: paths.length,
  acceptanceGates: ACCEPTANCE_GATES,
  selected: {
    tableTargetBb: selected.tableTargetBb,
    response: selected.response,
    result: selected,
  },
  namedResults,
  f1BySeed,
  topPassing: passing.slice(0, 10),
}, null, 2));
