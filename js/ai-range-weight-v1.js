// Public-information-only combo weighting foundation for AI V2.2.
(() => {
  "use strict";

  if (window.AiRangeWeightV1?.version) return;

  const VERSION = "1.0.0";
  const RANKS = Object.freeze([
    { label: "2", value: 2 }, { label: "3", value: 3 }, { label: "4", value: 4 },
    { label: "5", value: 5 }, { label: "6", value: 6 }, { label: "7", value: 7 },
    { label: "8", value: 8 }, { label: "9", value: 9 }, { label: "T", value: 10 },
    { label: "J", value: 11 }, { label: "Q", value: 12 }, { label: "K", value: 13 },
    { label: "A", value: 14 },
  ]);
  const SUITS = Object.freeze(["s", "h", "d", "c"]);
  const POSITION_TARGET = Object.freeze({
    UTG: 0.72, MP: 0.66, HJ: 0.61, CO: 0.55, BTN: 0.48, SB: 0.58, BB: 0.52, "--": 0.58,
  });

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function normalizeSuit(card) {
    const raw = String(card?.suit ?? card?.symbol ?? "").trim().toLowerCase();
    const aliases = {
      spades: "s", spade: "s", "♠": "s", s: "s",
      hearts: "h", heart: "h", "♥": "h", h: "h",
      diamonds: "d", diamond: "d", "♦": "d", d: "d",
      clubs: "c", club: "c", "♣": "c", c: "c",
    };
    return aliases[raw] || raw;
  }

  function normalizeValue(card) {
    const raw = card?.value ?? card?.rank ?? card?.number;
    if (Number.isFinite(Number(raw))) return Number(raw);
    return { A: 14, K: 13, Q: 12, J: 11, T: 10, "10": 10 }[String(raw || "").trim().toUpperCase()] || 0;
  }

  function cardKey(card) {
    return `${normalizeValue(card)}:${normalizeSuit(card)}`;
  }

  function buildDeck() {
    return RANKS.flatMap(rank => SUITS.map(suit => Object.freeze({
      value: rank.value,
      label: rank.label,
      suit,
      key: `${rank.value}:${suit}`,
    })));
  }

  function comboLabel(cards) {
    const ordered = [...cards].sort((left, right) => (
      normalizeValue(right) - normalizeValue(left)
      || normalizeSuit(left).localeCompare(normalizeSuit(right))
    ));
    const high = ordered[0];
    const low = ordered[1];
    const pair = normalizeValue(high) === normalizeValue(low);
    const suited = normalizeSuit(high) === normalizeSuit(low);
    const rankLabel = value => RANKS.find(rank => rank.value === value)?.label || String(value);
    return pair
      ? `${rankLabel(normalizeValue(high))}${rankLabel(normalizeValue(low))}`
      : `${rankLabel(normalizeValue(high))}${rankLabel(normalizeValue(low))}${suited ? "s" : "o"}`;
  }

  function preflopScore(cards) {
    const values = cards.map(normalizeValue).sort((a, b) => b - a);
    const [high, low] = values;
    const pair = high === low;
    const suited = normalizeSuit(cards[0]) === normalizeSuit(cards[1]);
    const gap = Math.max(0, high - low - 1);
    if (pair) return clamp(0.5 + (high - 2) / 24, 0.5, 1);
    let score = 0.14 + (high - 2) / 24 + (low - 2) / 52;
    if (suited) score += 0.075;
    if (gap === 0) score += 0.075;
    else if (gap === 1) score += 0.045;
    else if (gap === 2) score += 0.02;
    else if (gap >= 4) score -= Math.min(0.1, (gap - 3) * 0.02);
    if (high >= 10) score += 0.03;
    if (low >= 10) score += 0.025;
    if (high === 14) score += 0.045;
    return clamp(score, 0.04, 0.99);
  }

  function buildAllCombos() {
    const deck = buildDeck();
    const combos = [];
    for (let left = 0; left < deck.length - 1; left += 1) {
      for (let right = left + 1; right < deck.length; right += 1) {
        const cards = [deck[left], deck[right]];
        combos.push(Object.freeze({
          cards,
          keys: Object.freeze(cards.map(cardKey)),
          class: comboLabel(cards),
          preflopScore: preflopScore(cards),
        }));
      }
    }
    return Object.freeze(combos);
  }

  const ALL_COMBOS = buildAllCombos();

  function blockedKeySet(ownCards = [], board = []) {
    return new Set([...(ownCards || []), ...(board || [])].map(cardKey).filter(key => !key.startsWith("0:")));
  }

  function availableCombos(ownCards = [], board = []) {
    const blocked = blockedKeySet(ownCards, board);
    return ALL_COMBOS.filter(combo => combo.keys.every(key => !blocked.has(key)));
  }

  function gaussian(value, target, sigma) {
    const width = Math.max(0.04, Number(sigma) || 0.2);
    const distance = (value - target) / width;
    return Math.exp(-0.5 * distance * distance);
  }

  function publicRangeDiagnostic(actor, options = {}) {
    if (options.rangeDiagnostic) return options.rangeDiagnostic;
    const filter = window.AiRangeHistoryFilterV1;
    if (!filter?.analyzeActor) return null;
    try {
      return filter.analyzeActor(actor, {
        history: options.history || null,
        street: options.street || "preflop",
      });
    } catch (_) {
      return null;
    }
  }

  function positionTarget(positionLabel = "--") {
    return POSITION_TARGET[String(positionLabel || "--").toUpperCase()] ?? POSITION_TARGET["--"];
  }

  function actionShape(diagnostic = {}) {
    const events = diagnostic?.events || [];
    const latest = events[events.length - 1] || {};
    return {
      latestKind: String(latest.actionKind || ""),
      latestSize: clamp(latest.sizeFraction, 0, 4),
      aggressive: Number(diagnostic?.aggressiveActions) || 0,
      calls: Number(diagnostic?.calls) || 0,
    };
  }

  function rawWeight(combo, diagnostic = {}, options = {}) {
    const score = combo.preflopScore;
    const width = clamp(diagnostic?.rangeWidth ?? 1, 0.01, 1);
    const strength = clamp(diagnostic?.rangeStrength ?? positionTarget(diagnostic?.positionLabel), 0.12, 0.99);
    const position = String(diagnostic?.positionLabel || options.positionLabel || "--").toUpperCase();
    const shape = actionShape(diagnostic);
    const target = clamp(0.18 + strength * 0.72 + (positionTarget(position) - 0.58) * 0.2, 0.18, 0.96);
    const sigma = clamp(0.09 + width * 0.31, 0.09, 0.4);
    let weight = gaussian(score, target, sigma);

    if (shape.aggressive > 0) {
      const value = gaussian(score, clamp(target + 0.08, 0.3, 0.98), sigma * 0.78);
      const bluffTarget = clamp(0.22 + width * 0.2, 0.2, 0.42);
      const bluff = gaussian(score, bluffTarget, 0.12 + width * 0.08);
      const bluffShare = clamp(diagnostic?.bluffDensity ?? 0.12, 0.03, 0.32);
      weight = value * (1 - bluffShare) + bluff * bluffShare;
    } else if (shape.calls > 0) {
      weight *= 0.74 + gaussian(score, clamp(target - 0.08, 0.18, 0.78), sigma * 1.15) * 0.5;
    }

    if (shape.latestKind.includes("allin")) weight *= 0.45 + score * 0.85;
    if (shape.latestSize >= 1) weight *= 0.72 + score * 0.58;
    if (combo.class.endsWith("s")) weight *= 1.035;
    if (combo.class.length === 2) weight *= 1.08;
    return Math.max(0.000001, weight);
  }

  function normalizeRecords(records) {
    const total = records.reduce((sum, record) => sum + record.rawWeight, 0);
    if (!(total > 0)) return records.map(record => ({ ...record, weight: 0 }));
    return records.map(record => ({ ...record, weight: record.rawWeight / total }));
  }

  function summarizeClasses(records) {
    const map = new Map();
    for (const record of records) {
      const prior = map.get(record.class) || { class: record.class, weight: 0, combos: 0 };
      prior.weight += record.weight;
      prior.combos += 1;
      map.set(record.class, prior);
    }
    return [...map.values()]
      .map(item => ({ ...item, weight: round(item.weight) }))
      .sort((left, right) => right.weight - left.weight || left.class.localeCompare(right.class));
  }

  function analyze(actor, options = {}) {
    const ownCards = options.ownCards || [];
    const board = options.board || [];
    const diagnostic = publicRangeDiagnostic(actor, options) || {
      actor: typeof actor === "string" ? actor : String(actor?.name || ""),
      targetStreet: options.street || "preflop",
      positionLabel: options.positionLabel || "--",
      rangeWidth: 1,
      rangeStrength: positionTarget(options.positionLabel),
      bluffDensity: 0.18,
      publicInformationOnly: true,
      decisionIntegrated: false,
      events: [],
    };
    const combos = availableCombos(ownCards, board);
    const weighted = normalizeRecords(combos.map(combo => ({ ...combo, rawWeight: rawWeight(combo, diagnostic, options) })));
    const sorted = [...weighted].sort((left, right) => right.weight - left.weight || right.preflopScore - left.preflopScore);
    const classSummary = summarizeClasses(weighted);
    const weightedStrength = weighted.reduce((sum, record) => sum + record.weight * record.preflopScore, 0);
    const totalWeight = weighted.reduce((sum, record) => sum + record.weight, 0);

    return Object.freeze({
      version: VERSION,
      actor: typeof actor === "string" ? actor : String(actor?.name || ""),
      targetStreet: diagnostic.targetStreet || options.street || "preflop",
      totalDeckCombos: ALL_COMBOS.length,
      availableComboCount: combos.length,
      blockedCardCount: blockedKeySet(ownCards, board).size,
      normalizedWeightTotal: round(totalWeight),
      weightedPreflopStrength: round(weightedStrength),
      rangeWidth: diagnostic.rangeWidth ?? 1,
      rangeStrength: diagnostic.rangeStrength ?? weightedStrength,
      topCombos: Object.freeze(sorted.slice(0, Math.max(1, Number(options.topN) || 20)).map(record => Object.freeze({
        keys: record.keys,
        class: record.class,
        preflopScore: round(record.preflopScore),
        weight: round(record.weight),
      }))),
      classSummary: Object.freeze(classSummary),
      rangeDiagnostic: diagnostic,
      publicInformationOnly: true,
      decisionIntegrated: false,
    });
  }

  window.AiRangeWeightV1 = Object.freeze({
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActionHistory: true,
      publicPositions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    buildDeck,
    buildAllCombos: () => ALL_COMBOS,
    cardKey,
    comboLabel,
    preflopScore,
    availableCombos,
    analyze,
  });

  document.documentElement.dataset.aiRangeWeight = "ready";
})();
