// Public-information opponent combo weighting for the fair Oracle / Chronos equity engine.
(() => {
  "use strict";

  if (window.BossPublicRangeModelV1?.version) return;

  const VERSION = "1.0.0";
  const AGGRESSIVE_ACTIONS = new Set(["raise", "allin", "allin-raise"]);
  const CALL_ACTIONS = new Set(["call", "allin-call"]);

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function normalizedValue(card) {
    const raw = card?.value ?? card?.rank ?? card?.number;
    if (Number.isFinite(Number(raw))) return Number(raw);
    const face = String(raw || "").trim().toUpperCase();
    return { A: 14, K: 13, Q: 12, J: 11, T: 10 }[face] || 0;
  }

  function normalizedSuit(card) {
    const raw = String(card?.suit ?? card?.symbol ?? "").trim().toLowerCase();
    const aliases = {
      hearts: "h", heart: "h", "♥": "h", h: "h",
      diamonds: "d", diamond: "d", "♦": "d", d: "d",
      clubs: "c", club: "c", "♣": "c", c: "c",
      spades: "s", spade: "s", "♠": "s", s: "s",
    };
    return aliases[raw] || raw;
  }

  function cardKey(card) {
    return `${normalizedValue(card)}:${normalizedSuit(card)}`;
  }

  function currentStreet(board = state?.board || []) {
    if (board.length >= 5) return "river";
    if (board.length === 4) return "turn";
    if (board.length >= 3) return "flop";
    return "preflop";
  }

  function activeOpponents(player) {
    return (state?.players || []).filter(candidate => (
      candidate
      && candidate !== player
      && !candidate.folded
      && candidate.name
    ));
  }

  function visibleBetFraction(opponent) {
    const amount = Math.max(0, Number(opponent?.bet) || Number(state?.currentBet) || 0);
    const pot = Math.max(1, Number(state?.pot) || 1);
    return clamp(amount / pot, 0, 3);
  }

  function neutralProfile(opponent, street) {
    return {
      name: String(opponent?.name || "Public opponent"),
      street,
      rangeStrength: 0.42,
      rangeWidth: 0.6,
      nutDensity: 0.1,
      aggressiveThisStreet: false,
      callingLine: false,
      latestAction: "",
      latestSizeFraction: 0,
      publicInformationOnly: true,
    };
  }

  function profileFor(opponent, street = currentStreet()) {
    let source = null;
    try {
      source = window.AiMultiwayRangeModel?.opponentProfile?.(opponent, street) || null;
    } catch (_) {
      source = null;
    }

    const profile = { ...neutralProfile(opponent, street), ...(source || {}) };
    const fallbackAction = String(opponent?.lastAction || "").toLowerCase();
    const latestAction = String(profile.latestAction || fallbackAction || "").toLowerCase();
    const latestSizeFraction = Math.max(
      Number(profile.latestSizeFraction) || 0,
      visibleBetFraction(opponent),
    );
    const aggressiveThisStreet = Boolean(
      profile.aggressiveThisStreet
      || AGGRESSIVE_ACTIONS.has(latestAction),
    );
    const callingLine = Boolean(profile.callingLine || CALL_ACTIONS.has(latestAction));

    let rangeStrength = clamp(profile.rangeStrength, 0.18, 0.97);
    let nutDensity = clamp(profile.nutDensity, 0.04, 0.72);
    if (aggressiveThisStreet && !Number(profile.totalAggression)) {
      const streetWeight = street === "river" ? 0.14 : (street === "turn" ? 0.11 : 0.08);
      rangeStrength += streetWeight + Math.min(0.09, latestSizeFraction * 0.12);
      nutDensity += streetWeight * 0.55 + Math.min(0.055, latestSizeFraction * 0.07);
    } else if (callingLine && !Number(profile.totalCalls)) {
      rangeStrength += 0.035 + Math.min(0.035, latestSizeFraction * 0.045);
    } else if (latestAction === "check") {
      rangeStrength -= street === "river" ? 0.045 : 0.025;
    }

    return {
      ...profile,
      street,
      latestAction,
      latestSizeFraction,
      aggressiveThisStreet,
      callingLine,
      rangeStrength: clamp(rangeStrength, 0.18, 0.97),
      rangeWidth: clamp(profile.rangeWidth, 0.08, 0.85),
      nutDensity: clamp(nutDensity, 0.04, 0.72),
      publicInformationOnly: true,
    };
  }

  function profilesFor(player, opponentCount, board = state?.board || []) {
    const street = currentStreet(board);
    const visible = activeOpponents(player).map(opponent => profileFor(opponent, street));
    const count = Math.max(1, Math.floor(Number(opponentCount) || visible.length || 1));
    while (visible.length < count) visible.push(neutralProfile(null, street));
    return visible.slice(0, count);
  }

  function preflopScore(cards) {
    const values = (cards || []).map(normalizedValue).sort((left, right) => right - left);
    if (values.length !== 2) return 0.5;
    const [high, low] = values;
    const pair = high === low;
    const suited = normalizedSuit(cards[0]) === normalizedSuit(cards[1]);
    const gap = Math.max(0, high - low - 1);
    const broadway = Number(high >= 10) + Number(low >= 10);

    if (pair) return clamp(0.5 + (high - 2) / 24, 0.5, 1);

    let score = 0.16 + (high - 2) / 24 + (low - 2) / 48;
    if (suited) score += 0.075;
    if (gap === 0) score += 0.07;
    else if (gap === 1) score += 0.045;
    else if (gap === 2) score += 0.02;
    else if (gap >= 4) score -= Math.min(0.08, (gap - 3) * 0.018);
    score += broadway * 0.035;
    if (high === 14) score += 0.04;
    return clamp(score, 0.05, 0.98);
  }

  function gaussian(value, target, sigma) {
    const safeSigma = Math.max(0.035, Number(sigma) || 0.2);
    const distance = (value - target) / safeSigma;
    return Math.exp(-0.5 * distance * distance);
  }

  function comboWeight(record, profile) {
    const percentile = clamp(record?.percentile, 0, 1);
    const prior = clamp(record?.preflopScore, 0, 1);
    const strength = clamp(profile?.rangeStrength, 0.18, 0.97);
    const width = clamp(profile?.rangeWidth, 0.08, 0.85);
    const size = clamp(profile?.latestSizeFraction, 0, 3);
    const street = profile?.street || "preflop";
    const aggressive = Boolean(profile?.aggressiveThisStreet);
    const calling = Boolean(profile?.callingLine);
    const checked = profile?.latestAction === "check";

    let weight;
    if (aggressive && street === "river") {
      const valueTarget = clamp(0.68 + strength * 0.27 + Math.min(0.05, size * 0.04), 0.72, 0.985);
      const valueSigma = 0.105 + width * 0.075;
      const bluffShare = clamp(0.36 - strength * 0.2 - Math.min(0.08, size * 0.06), 0.08, 0.32);
      const bluffTarget = clamp(0.1 + prior * 0.16, 0.08, 0.3);
      const bluffSigma = 0.12 + width * 0.08;
      const blockerPrior = 0.55 + prior * 0.9;
      const valueWeight = gaussian(percentile, valueTarget, valueSigma);
      const bluffWeight = gaussian(percentile, bluffTarget, bluffSigma) * blockerPrior;
      weight = (1 - bluffShare) * valueWeight + bluffShare * bluffWeight;
    } else if (aggressive) {
      const target = clamp(0.56 + strength * 0.32 + Math.min(0.04, size * 0.035), 0.58, 0.94);
      const sigma = 0.15 + width * 0.1;
      const semibluff = gaussian(percentile, 0.34 + prior * 0.12, 0.17 + width * 0.07) * (0.45 + prior * 0.65);
      const semibluffShare = street === "turn" ? 0.2 : 0.26;
      weight = (1 - semibluffShare) * gaussian(percentile, target, sigma) + semibluffShare * semibluff;
    } else if (calling) {
      const target = clamp(0.38 + strength * 0.34, 0.42, 0.76);
      weight = gaussian(percentile, target, 0.2 + width * 0.12);
    } else if (checked) {
      const target = clamp(0.25 + strength * 0.3, 0.28, 0.62);
      weight = gaussian(percentile, target, 0.27 + width * 0.12);
    } else {
      const target = clamp(0.25 + strength * 0.58, 0.32, 0.82);
      weight = gaussian(percentile, target, 0.24 + width * 0.15);
    }

    const priorCompatibility = 0.55 + gaussian(prior, clamp(0.18 + strength * 0.72, 0.25, 0.9), 0.3) * 0.75;
    return Math.max(0.002, weight * priorCompatibility);
  }

  function buildComboRecords(deck, board = state?.board || []) {
    const records = [];
    for (let left = 0; left < deck.length - 1; left += 1) {
      for (let right = left + 1; right < deck.length; right += 1) {
        const cards = [deck[left], deck[right]];
        records.push({
          cards,
          keys: [cardKey(cards[0]), cardKey(cards[1])],
          preflopScore: preflopScore(cards),
          result: board.length >= 3 && typeof evaluateBestHand === "function"
            ? evaluateBestHand([...cards, ...board])
            : null,
          percentile: 0.5,
        });
      }
    }

    if (records.length > 1 && board.length >= 3 && typeof compareResults === "function") {
      const ranked = [...records].sort((left, right) => compareResults(left.result, right.result));
      const denominator = Math.max(1, ranked.length - 1);
      ranked.forEach((record, index) => {
        record.percentile = index / denominator;
      });
    } else {
      records.forEach(record => {
        record.percentile = record.preflopScore;
      });
    }
    return records;
  }

  function distributionSummary(records, profile) {
    let total = 0;
    let weightedPercentile = 0;
    let topQuartile = 0;
    let bottomQuartile = 0;
    for (const record of records || []) {
      const weight = comboWeight(record, profile);
      total += weight;
      weightedPercentile += weight * record.percentile;
      if (record.percentile >= 0.75) topQuartile += weight;
      if (record.percentile <= 0.25) bottomQuartile += weight;
    }
    return {
      averagePercentile: total > 0 ? weightedPercentile / total : 0.5,
      topQuartileMass: total > 0 ? topQuartile / total : 0.25,
      bottomQuartileMass: total > 0 ? bottomQuartile / total : 0.25,
      totalWeight: total,
      latestAction: profile?.latestAction || "",
      rangeStrength: clamp(profile?.rangeStrength, 0, 1),
      publicInformationOnly: true,
    };
  }

  function chooseWeightedRecord(records, profile, random = Math.random, excludedKeys = new Set()) {
    let total = 0;
    const candidates = [];
    for (const record of records || []) {
      if (record.keys.some(key => excludedKeys.has(key))) continue;
      const weight = comboWeight(record, profile);
      total += weight;
      candidates.push({ record, cumulative: total });
    }
    if (!candidates.length) return null;
    const target = clamp(random(), 0, 0.999999999) * total;
    for (const candidate of candidates) {
      if (candidate.cumulative >= target) return candidate.record;
    }
    return candidates[candidates.length - 1].record;
  }

  window.BossPublicRangeModelV1 = Object.freeze({
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      publicPlayers: true,
      publicPositions: true,
      publicActions: true,
      publicBetSizes: true,
      publicBoard: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    cardKey,
    currentStreet,
    activeOpponents,
    profileFor,
    profilesFor,
    preflopScore,
    comboWeight,
    buildComboRecords,
    distributionSummary,
    chooseWeightedRecord,
  });

  document.documentElement.dataset.bossPublicRangeModel = "ready";
})();
