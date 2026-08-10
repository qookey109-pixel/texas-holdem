// Observation-only audit for replacement churn and subsequent Hero runaway.
(() => {
  "use strict";

  if (window.AiReplacementChurnAuditV1?.version) return;

  const VERSION = "1.0.0";
  const WINDOWS = Object.freeze([10, 25, 50]);
  const MAX_ANCHORS = 2_000;

  let priorEnd = null;
  let anchors = [];
  let replacementEvents = 0;
  let replacementSeats = 0;
  let bustSeats = 0;
  let handsStarted = 0;
  let handsCompleted = 0;
  let errors = [];

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  }

  function median(values) {
    const sorted = values
      .map(value => finite(value, NaN))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function bandFor(ratio) {
    if (!Number.isFinite(ratio)) return "unknown";
    if (ratio < 3) return "under3x";
    if (ratio < 5) return "threeTo5x";
    return "fivePlus";
  }

  function snapshot(players, bigBlind, handNumber) {
    const bb = Math.max(1, finite(bigBlind, 1));
    const list = Array.isArray(players) ? players : [];
    const hero = list.find(player => player?.isHuman) || list[0] || null;
    const aiSeats = list
      .filter(player => player && !player.isHuman)
      .map(player => ({
        position: finite(player.position, -1),
        name: String(player.name || ""),
        stackBb: round(finite(player.stack) / bb, 4),
      }))
      .sort((left, right) => left.position - right.position);
    const positiveOpponentBb = aiSeats.filter(seat => seat.stackBb > 0).map(seat => seat.stackBb);
    const opponentMedianBb = median(positiveOpponentBb);
    const heroBb = round(finite(hero?.stack) / bb, 4);
    const ratio = opponentMedianBb > 0 ? round(heroBb / opponentMedianBb) : null;

    return {
      handNumber: finite(handNumber),
      bigBlind: bb,
      heroBb,
      opponentMedianBb: round(opponentMedianBb, 4),
      heroToOpponentMedianRatio: ratio,
      band: bandFor(ratio),
      aiSeats,
    };
  }

  function seatMap(value) {
    return new Map((value?.aiSeats || []).map(seat => [seat.position, seat]));
  }

  function detectReplacements(previous, current) {
    if (!previous) return [];
    const before = seatMap(previous);
    const after = seatMap(current);
    const positions = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
    return positions.flatMap(position => {
      const oldSeat = before.get(position);
      const newSeat = after.get(position);
      if (!oldSeat || !newSeat || oldSeat.name === newSeat.name) return [];
      return [{
        position,
        replacedName: oldSeat.name,
        replacementName: newSeat.name,
        replacedEndStackBb: oldSeat.stackBb,
        replacementStartStackBb: newSeat.stackBb,
      }];
    });
  }

  function createAnchor(kind, current, replacements = []) {
    if (anchors.length >= MAX_ANCHORS) return;
    anchors.push({
      kind,
      handNumber: current.handNumber,
      band: current.band,
      replacementSeatCount: replacements.length,
      replacements,
      start: current,
      outcomes: Object.fromEntries(WINDOWS.map(window => [window, null])),
    });
  }

  function recordHandStart(players, bigBlind, handNumber) {
    try {
      const current = snapshot(players, bigBlind, handNumber);
      handsStarted += 1;
      if (priorEnd) {
        const replacements = detectReplacements(priorEnd, current);
        if (replacements.length) {
          replacementEvents += 1;
          replacementSeats += replacements.length;
          createAnchor("replacement", current, replacements);
        } else {
          createAnchor("control", current, []);
        }
      }
      return current;
    } catch (error) {
      errors.push(`recordHandStart:${String(error?.message || error)}`);
      return null;
    }
  }

  function recordHandEnd(players, bigBlind, handNumber) {
    try {
      const current = snapshot(players, bigBlind, handNumber);
      handsCompleted += 1;
      bustSeats += current.aiSeats.filter(seat => seat.stackBb <= 0).length;

      for (const anchor of anchors) {
        const completedSince = current.handNumber - anchor.handNumber + 1;
        for (const window of WINDOWS) {
          if (anchor.outcomes[window] || completedSince < window) continue;
          anchor.outcomes[window] = {
            handNumber: current.handNumber,
            heroBb: current.heroBb,
            opponentMedianBb: current.opponentMedianBb,
            heroToOpponentMedianRatio: current.heroToOpponentMedianRatio,
            band: current.band,
            ratioDelta: (
              Number.isFinite(current.heroToOpponentMedianRatio)
              && Number.isFinite(anchor.start.heroToOpponentMedianRatio)
            ) ? round(current.heroToOpponentMedianRatio - anchor.start.heroToOpponentMedianRatio) : null,
            heroBbDelta: round(current.heroBb - anchor.start.heroBb, 4),
            opponentMedianBbDelta: round(current.opponentMedianBb - anchor.start.opponentMedianBb, 4),
          };
        }
      }

      priorEnd = current;
      return current;
    } catch (error) {
      errors.push(`recordHandEnd:${String(error?.message || error)}`);
      return null;
    }
  }

  function reset() {
    priorEnd = null;
    anchors = [];
    replacementEvents = 0;
    replacementSeats = 0;
    bustSeats = 0;
    handsStarted = 0;
    handsCompleted = 0;
    errors = [];
    return snapshotState();
  }

  function snapshotState() {
    return {
      version: VERSION,
      schemaVersion: 1,
      observationOnly: true,
      publicInformationOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
      windows: [...WINDOWS],
      handsStarted,
      handsCompleted,
      replacementEvents,
      replacementSeats,
      bustSeats,
      anchors: JSON.parse(JSON.stringify(anchors)),
      errors: [...errors],
    };
  }

  window.AiReplacementChurnAuditV1 = Object.freeze({
    version: VERSION,
    windows: [...WINDOWS],
    recordHandStart,
    recordHandEnd,
    reset,
    snapshot: snapshotState,
  });

  document.documentElement.dataset.aiReplacementChurnAuditV1 = "ready";
})();
