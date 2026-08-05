// Public-board-only texture analysis for AI V2.1.
(() => {
  "use strict";

  if (window.AiBoardTextureEngineV1?.version) return;

  const VERSION = "1.0.1";
  const FACE_VALUES = Object.freeze({ A: 14, K: 13, Q: 12, J: 11, T: 10 });
  const SUIT_ALIASES = Object.freeze({
    hearts: "h", heart: "h", "♥": "h", h: "h",
    diamonds: "d", diamond: "d", "♦": "d", d: "d",
    clubs: "c", club: "c", "♣": "c", c: "c",
    spades: "s", spade: "s", "♠": "s", s: "s",
  });

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function normalizedValue(card) {
    const raw = card?.value ?? card?.rank ?? card?.number;
    if (Number.isFinite(Number(raw))) return Number(raw);
    return FACE_VALUES[String(raw || "").trim().toUpperCase()] || 0;
  }

  function normalizedSuit(card) {
    const raw = String(card?.suit ?? card?.symbol ?? card?.suitSymbol ?? "").trim().toLowerCase();
    return SUIT_ALIASES[raw] || raw;
  }

  function normalizedBoard(board) {
    return (Array.isArray(board) ? board : [])
      .map(card => ({ value: normalizedValue(card), suit: normalizedSuit(card) }))
      .filter(card => card.value >= 2 && card.value <= 14 && card.suit);
  }

  function rankCounts(cards) {
    const counts = new Map();
    cards.forEach(card => counts.set(card.value, (counts.get(card.value) || 0) + 1));
    return counts;
  }

  function suitCounts(cards) {
    const counts = new Map();
    cards.forEach(card => counts.set(card.suit, (counts.get(card.suit) || 0) + 1));
    return counts;
  }

  function straightWindowScore(values) {
    const unique = [...new Set(values)];
    if (unique.includes(14)) unique.push(1);
    let bestOccupancy = 0;
    let bestSpan = 12;
    for (let low = 1; low <= 10; low += 1) {
      const windowValues = [low, low + 1, low + 2, low + 3, low + 4];
      const occupancy = windowValues.filter(value => unique.includes(value === 1 ? 1 : value)).length;
      if (occupancy > bestOccupancy) bestOccupancy = occupancy;
    }
    const sorted = [...new Set(values.map(value => value === 14 ? 14 : value))].sort((a, b) => a - b);
    for (let left = 0; left < sorted.length; left += 1) {
      for (let right = left; right < sorted.length; right += 1) {
        const count = right - left + 1;
        if (count >= 2) bestSpan = Math.min(bestSpan, sorted[right] - sorted[left]);
      }
    }
    const occupancyScore = clamp((bestOccupancy - 1) / 3);
    const compactnessScore = sorted.length >= 2 ? clamp(1 - Math.max(0, bestSpan - 2) / 8) : 0;
    return clamp(occupancyScore * 0.78 + compactnessScore * 0.22);
  }

  function analyze(board) {
    const cards = normalizedBoard(board);
    const values = cards.map(card => card.value);
    const ranks = rankCounts(cards);
    const suits = suitCounts(cards);
    const uniqueRanks = ranks.size;
    const maxSuitCount = Math.max(0, ...suits.values());
    const pairGroups = [...ranks.values()].filter(count => count === 2).length;
    const tripsGroups = [...ranks.values()].filter(count => count >= 3).length;
    const pairedLevel = tripsGroups > 0 ? 3 : Math.min(2, pairGroups);
    const flushThreat = cards.length < 3 ? 0 : clamp((maxSuitCount - 1) / 3);
    const straightThreat = cards.length < 3 ? 0 : straightWindowScore(values);
    const highCardDensity = cards.length ? values.filter(value => value >= 11).length / cards.length : 0;
    const broadwayDensity = cards.length ? values.filter(value => value >= 10).length / cards.length : 0;
    const rankDuplication = cards.length ? 1 - uniqueRanks / cards.length : 0;
    const connectivity = straightThreat;

    const wetness = clamp(
      flushThreat * 0.34
      + straightThreat * 0.42
      + broadwayDensity * 0.08
      + (pairedLevel === 0 ? 0.08 : 0)
      + (cards.length >= 4 ? 0.08 : 0),
    );
    const dryness = clamp(1 - wetness - rankDuplication * 0.08);
    const nutVolatility = clamp(
      straightThreat * 0.42
      + flushThreat * 0.38
      + (cards.length === 3 ? 0.12 : 0.04)
      - pairedLevel * 0.08,
    );
    const structurallyWet = wetness >= 0.58
      || (flushThreat >= 0.66 && straightThreat >= 0.68);
    const structurallyDynamic = nutVolatility >= 0.55
      || straightThreat >= 0.72
      || (flushThreat >= 0.66 && straightThreat >= 0.6);

    const tags = [];
    if (dryness >= 0.66 && !structurallyWet) tags.push("dry");
    if (structurallyWet) tags.push("wet");
    if (maxSuitCount === 2) tags.push("two-tone");
    if (maxSuitCount === 3) tags.push("three-flush");
    if (maxSuitCount >= 4) tags.push("four-flush");
    if (straightThreat >= 0.72) tags.push("straight-dense");
    else if (straightThreat >= 0.44) tags.push("connected");
    if (pairedLevel === 1) tags.push("paired");
    if (pairedLevel === 2) tags.push("double-paired");
    if (pairedLevel === 3) tags.push("trips-board");
    if (highCardDensity >= 0.5) tags.push("high-card-heavy");
    if (values.length && Math.max(...values) <= 9) tags.push("low-board");
    tags.push(structurallyDynamic ? "dynamic" : "static");

    return Object.freeze({
      version: VERSION,
      cardCount: cards.length,
      dryness,
      wetness,
      flushThreat,
      straightThreat,
      pairedLevel,
      connectivity,
      highCardDensity,
      nutVolatility,
      maxSuitCount,
      uniqueRanks,
      textureTags: Object.freeze(tags),
      publicInformationOnly: true,
    });
  }

  window.AiBoardTextureEngineV1 = Object.freeze({
    version: VERSION,
    analyze,
    fairInformationPolicy: Object.freeze({
      publicBoard: true,
      hiddenOpponentCards: false,
      playerHoleCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
  });
})();
