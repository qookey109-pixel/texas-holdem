// Observation-only audit comparing Hero and AI large-pot capture from public table state.
(() => {
  "use strict";

  if (window.AiLargePotSymmetryAuditV1?.version) return;

  const VERSION = "1.0.0";
  const MAX_HANDS = 2_000;
  let active = null;
  let hands = [];
  let errors = [];

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  }

  function snapshot(players, bigBlind, handNumber) {
    const bb = Math.max(1, finite(bigBlind, 1));
    return {
      handNumber: finite(handNumber),
      bigBlind: bb,
      players: (Array.isArray(players) ? players : []).map((player, index) => ({
        position: finite(player?.position, index),
        name: String(player?.name || `seat-${index}`),
        isHuman: Boolean(player?.isHuman),
        stackBb: round(finite(player?.stack) / bb, 4),
        folded: Boolean(player?.folded),
      })),
    };
  }

  function recordHandStart(players, bigBlind, handNumber) {
    try {
      active = snapshot(players, bigBlind, handNumber);
      return active;
    } catch (error) {
      errors.push(`recordHandStart:${String(error?.message || error)}`);
      active = null;
      return null;
    }
  }

  function recordHandEnd(players, bigBlind, handNumber, winners = [], boardCount = 0) {
    try {
      if (!active || hands.length >= MAX_HANDS) return null;
      const end = snapshot(players, bigBlind, handNumber);
      const startByPosition = new Map(active.players.map(player => [player.position, player]));
      const endByPosition = new Map(end.players.map(player => [player.position, player]));
      const winnerNames = new Set((Array.isArray(winners) ? winners : []).map(value => String(value)));
      const unfoldedCount = end.players.filter(player => !player.folded).length;
      const showdown = finite(boardCount) === 5 && unfoldedCount >= 2;
      let bustCount = 0;
      const playerDeltas = [];
      let deltaSumBb = 0;

      for (const [position, startPlayer] of startByPosition.entries()) {
        const endPlayer = endByPosition.get(position);
        if (!endPlayer || endPlayer.name !== startPlayer.name) continue;
        const deltaBb = round(endPlayer.stackBb - startPlayer.stackBb, 4);
        const busted = startPlayer.stackBb > 0 && endPlayer.stackBb <= 0;
        if (busted && !startPlayer.isHuman) bustCount += 1;
        deltaSumBb += deltaBb;
        playerDeltas.push({
          position,
          name: startPlayer.name,
          isHuman: startPlayer.isHuman,
          startStackBb: startPlayer.stackBb,
          endStackBb: endPlayer.stackBb,
          deltaBb,
          won: winnerNames.has(startPlayer.name),
          folded: endPlayer.folded,
          busted,
        });
      }

      const record = {
        handNumber: active.handNumber,
        bigBlind: active.bigBlind,
        boardCount: finite(boardCount),
        showdown,
        aiBustCount: bustCount,
        deltaSumBb: round(deltaSumBb, 4),
        playerDeltas,
      };
      hands.push(record);
      active = null;
      return record;
    } catch (error) {
      errors.push(`recordHandEnd:${String(error?.message || error)}`);
      active = null;
      return null;
    }
  }

  function reset() {
    active = null;
    hands = [];
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
      handsCompleted: hands.length,
      hands: JSON.parse(JSON.stringify(hands)),
      errors: [...errors],
    };
  }

  window.AiLargePotSymmetryAuditV1 = Object.freeze({
    version: VERSION,
    recordHandStart,
    recordHandEnd,
    reset,
    snapshot: snapshotState,
  });
  document.documentElement.dataset.aiLargePotSymmetryAuditV1 = "ready";
})();
