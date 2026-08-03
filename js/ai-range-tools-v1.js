// Public-card range, draw, river-value, and blocker helpers.
(() => {
  "use strict";

  if (window.AiRangeTools?.version) return;

  const VERSION = "1.0.0";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function uniqueRanks(cards) {
    const ranks = [...new Set((cards || []).map(card => Number(card?.value) || 0).filter(Boolean))].sort((a, b) => a - b);
    if (ranks.includes(14)) ranks.unshift(1);
    return ranks;
  }

  function straightWindows(cards) {
    const ranks = uniqueRanks(cards);
    const windows = [];
    for (let low = 1; low <= 10; low += 1) {
      const present = ranks.filter(rank => rank >= low && rank <= low + 4);
      windows.push({ low, high: low + 4, hits: present.length, present });
    }
    return windows;
  }

  function drawProfile(player, board = state?.board || []) {
    const cards = [...(player?.cards || []), ...(board || [])];
    const suitCounts = new Map();
    for (const card of cards) suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
    const flushDraw = [...suitCounts.values()].some(count => count === 4);
    const windows = straightWindows(cards);
    const bestWindow = windows.sort((left, right) => right.hits - left.hits)[0] || { hits: 0, low: 0, high: 0 };
    const straightDraw = bestWindow.hits >= 4;
    const gutshot = bestWindow.hits === 4 && !uniqueRanks(cards).includes(bestWindow.low + 2);
    const openEnded = straightDraw && !gutshot;
    const potential = clamp((flushDraw ? 0.13 : 0) + (openEnded ? 0.11 : (gutshot ? 0.07 : 0)), 0, 0.24);
    return { flushDraw, straightDraw, gutshot, openEnded, potential };
  }

  function boardSuitTarget(board = state?.board || []) {
    const counts = new Map();
    for (const card of board || []) counts.set(card.suit, (counts.get(card.suit) || 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0] || ["", 0];
  }

  function blockerProfile(player, board = state?.board || []) {
    const hole = player?.cards || [];
    const [targetSuit, targetCount] = boardSuitTarget(board);
    const suitedBlockers = hole.filter(card => card.suit === targetSuit);
    const nutFlushBlocker = targetCount >= 3 && suitedBlockers.some(card => Number(card.value) === 14);
    const kingFlushBlocker = targetCount >= 3 && suitedBlockers.some(card => Number(card.value) === 13);

    const boardWindows = straightWindows(board || []).filter(window => window.hits >= 3);
    const highStraightBlocker = hole.some(card => boardWindows.some(window => (
      Number(card.value) === window.high || (Number(card.value) === 14 && window.high === 5)
    )));

    let bluffScore = 0;
    if (nutFlushBlocker) bluffScore += 0.5;
    else if (kingFlushBlocker) bluffScore += 0.28;
    if (highStraightBlocker) bluffScore += 0.2;
    if (targetCount >= 3 && suitedBlockers.length === 0) bluffScore -= 0.08;

    return {
      targetSuit,
      targetCount,
      nutFlushBlocker,
      kingFlushBlocker,
      highStraightBlocker,
      bluffScore: clamp(bluffScore, 0, 0.85),
    };
  }

  function handResult(player, board = state?.board || []) {
    if (!player?.cards?.length || (board || []).length < 3 || typeof evaluateBestHand !== "function") return null;
    return evaluateBestHand([...(player.cards || []), ...(board || [])]);
  }

  function riverClass(player, context = {}) {
    if ((state?.board?.length || 0) < 5) return "not-river";
    const result = handResult(player);
    const score = Number(result?.score) || 0;
    const strength = Number(context.equityProxy) || 0;
    const needed = Number(context.needed) || 0;
    const potOdds = Number(context.potOdds) || 0;

    if (score >= 4 || strength >= 0.82) return "thick-value";
    if (score >= 2 || strength >= 0.67) return "thin-value";
    if (score >= 1 || strength >= 0.5) return needed > 0 && potOdds <= 0.28 ? "bluff-catcher" : "showdown";
    if (strength >= 0.38 && needed > 0 && potOdds <= 0.2) return "bluff-catcher";
    return "air";
  }

  function publicAnalysis(player, context = {}) {
    return {
      draws: drawProfile(player),
      blockers: blockerProfile(player),
      riverClass: riverClass(player, context),
    };
  }

  window.AiRangeTools = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
    }),
    drawProfile,
    blockerProfile,
    handResult,
    riverClass,
    publicAnalysis,
  };
})();
