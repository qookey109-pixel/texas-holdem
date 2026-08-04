// Fair Boss equity engine: exact river enumeration and joint multiway simulation from public information only.
(() => {
  "use strict";

  const VERSION = "1.1.0";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function knownCards(player, board) {
    return [...(player?.cards || []), ...(board || [])];
  }

  function beliefDeck(player, board = state?.board || []) {
    const known = new Set(knownCards(player, board).map(cardKey));
    return createDeck().filter(card => !known.has(cardKey(card)));
  }

  function activeOpponentCount(player) {
    return Math.max(1, (state?.players || []).filter(candidate => candidate && candidate !== player && !candidate.folded).length);
  }

  function publicRangeModel() {
    return window.BossPublicRangeModelV1?.version ? window.BossPublicRangeModelV1 : null;
  }

  function compareAgainstField(playerCards, opponentHands, board) {
    const ownResult = evaluateBestHand([...playerCards, ...board]);
    let tied = 0;
    for (const cards of opponentHands) {
      const comparison = compareResults(ownResult, evaluateBestHand([...cards, ...board]));
      if (comparison < 0) return 0;
      if (comparison === 0) tied += 1;
    }
    return tied > 0 ? 1 / (tied + 1) : 1;
  }

  function exactRiverHeadsUp(player, board = state?.board || [], options = {}) {
    if (!player?.cards || player.cards.length !== 2 || board.length !== 5) return null;
    const deck = beliefDeck(player, board);
    const model = options.rangeModel === false ? null : publicRangeModel();
    const profiles = options.opponentProfiles
      || model?.profilesFor?.(player, 1, board)
      || [];
    const profile = profiles[0] || null;

    let weightedEquity = 0;
    let totalWeight = 0;
    let unweightedEquity = 0;
    let combinations = 0;
    let records = null;

    if (model?.buildComboRecords && profile) {
      records = model.buildComboRecords(deck, board);
      for (const record of records) {
        const outcome = compareAgainstField(player.cards, [record.cards], board);
        const weight = model.comboWeight(record, profile);
        weightedEquity += outcome * weight;
        totalWeight += weight;
        unweightedEquity += outcome;
        combinations += 1;
      }
    } else {
      for (let left = 0; left < deck.length - 1; left += 1) {
        for (let right = left + 1; right < deck.length; right += 1) {
          const outcome = compareAgainstField(player.cards, [[deck[left], deck[right]]], board);
          weightedEquity += outcome;
          totalWeight += 1;
          unweightedEquity += outcome;
          combinations += 1;
        }
      }
    }

    return {
      equity: totalWeight > 0 ? weightedEquity / totalWeight : 0.5,
      unweightedEquity: combinations > 0 ? unweightedEquity / combinations : 0.5,
      combinations,
      method: "exact-river-heads-up",
      opponentCount: 1,
      rangeConditioned: Boolean(model && profile),
      rangeModelVersion: model?.version || "uniform",
      rangeSummaries: model && profile && records
        ? [model.distributionSummary(records, profile)]
        : [],
    };
  }

  function shuffledIndices(length, random) {
    const indices = Array.from({ length }, (_, index) => index);
    for (let index = 0; index < length - 1; index += 1) {
      const choice = index + Math.floor(random() * (length - index));
      [indices[index], indices[choice]] = [indices[choice], indices[index]];
    }
    return indices;
  }

  function uniformOpponentHands(deck, opponents, futureCount, random) {
    const cardsNeeded = opponents * 2 + futureCount;
    const order = shuffledIndices(deck.length, random).slice(0, cardsNeeded);
    const opponentHands = [];
    let cursor = 0;
    for (let opponent = 0; opponent < opponents; opponent += 1) {
      opponentHands.push([deck[order[cursor]], deck[order[cursor + 1]]]);
      cursor += 2;
    }
    return {
      opponentHands,
      futureCards: order.slice(cursor).map(index => deck[index]),
    };
  }

  function weightedOpponentHands(deck, records, profiles, opponents, futureCount, random, model) {
    const usedKeys = new Set();
    const opponentHands = [];
    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const profile = profiles[opponent] || profiles[profiles.length - 1];
      const record = model.chooseWeightedRecord(records, profile, random, usedKeys);
      if (!record) return null;
      opponentHands.push(record.cards);
      record.keys.forEach(key => usedKeys.add(key));
    }

    const remaining = deck.filter(card => !usedKeys.has(cardKey(card)));
    if (remaining.length < futureCount) return null;
    const order = shuffledIndices(remaining.length, random).slice(0, futureCount);
    return {
      opponentHands,
      futureCards: order.map(index => remaining[index]),
    };
  }

  function simulateMultiway(player, {
    board = state?.board || [],
    opponentCount = activeOpponentCount(player),
    samples = 320,
    random = Math.random,
    opponentProfiles = null,
    rangeModel = true,
  } = {}) {
    if (!player?.cards || player.cards.length !== 2) {
      return { equity: 0.5, samples: 0, method: "fallback", opponentCount: 0 };
    }

    const opponents = clamp(Math.floor(Number(opponentCount) || 1), 1, 7);
    const futureCount = Math.max(0, 5 - board.length);
    const deck = beliefDeck(player, board);
    const cardsNeeded = opponents * 2 + futureCount;
    const iterations = clamp(Math.floor(Number(samples) || 320), 48, 1200);
    if (deck.length < cardsNeeded) {
      return { equity: 0.5, samples: 0, method: "fallback", opponentCount: opponents };
    }

    const model = rangeModel === false ? null : publicRangeModel();
    const profiles = opponentProfiles
      || model?.profilesFor?.(player, opponents, board)
      || [];
    const conditioned = Boolean(model && profiles.length);
    const records = conditioned ? model.buildComboRecords(deck, board) : null;

    let equity = 0;
    let completed = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const deal = conditioned
        ? weightedOpponentHands(deck, records, profiles, opponents, futureCount, random, model)
        : uniformOpponentHands(deck, opponents, futureCount, random);
      if (!deal) continue;
      const finalBoard = [...board, ...deal.futureCards];
      equity += compareAgainstField(player.cards, deal.opponentHands, finalBoard);
      completed += 1;
    }

    return {
      equity: completed > 0 ? equity / completed : 0.5,
      samples: completed,
      method: opponents > 1 ? "joint-multiway-monte-carlo" : "heads-up-monte-carlo",
      opponentCount: opponents,
      rangeConditioned: conditioned,
      rangeModelVersion: model?.version || "uniform",
      rangeSummaries: conditioned
        ? profiles.map(profile => model.distributionSummary(records, profile))
        : [],
    };
  }

  function estimate(player, options = {}) {
    const board = options.board || state?.board || [];
    const opponentCount = options.opponentCount ?? activeOpponentCount(player);
    if (board.length === 5 && Number(opponentCount) === 1) {
      return exactRiverHeadsUp(player, board, options);
    }
    return simulateMultiway(player, { ...options, board, opponentCount });
  }

  window.BossEquityEngineV1 = Object.freeze({
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActivePlayerCount: true,
      publicActions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    cardKey,
    beliefDeck,
    activeOpponentCount,
    compareAgainstField,
    exactRiverHeadsUp,
    simulateMultiway,
    estimate,
  });

  document.documentElement.dataset.bossEquityEngine = "ready";
})();
