// Observation-only audit for public action sequences around large Hero showdown wins.
(() => {
  "use strict";

  if (window.AiBalancedLargePotResponseAuditV1?.version) return;

  const VERSION = "1.0.0";
  const MAX_HANDS = 2_000;
  const MAX_ACTIONS_PER_HAND = 300;
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

  function normalizeAction(action) {
    const value = String(action || "").toLowerCase();
    if (value.includes("fold")) return "fold";
    if (value.includes("check")) return "check";
    if (value.includes("all-in") || value.includes("allin")) return "allin";
    if (value.includes("raise")) return "raise";
    if (value.includes("call")) return "call";
    return value || "unknown";
  }

  function publicPlayers(players, bigBlind) {
    const bb = Math.max(1, finite(bigBlind, 1));
    return (Array.isArray(players) ? players : []).map((player, index) => ({
      position: finite(player?.position, index),
      name: String(player?.name || `seat-${index}`),
      isHuman: Boolean(player?.isHuman),
      stackBb: round(finite(player?.stack) / bb, 4),
      wealthBb: round((finite(player?.stack) + finite(player?.totalContribution)) / bb, 4),
      folded: Boolean(player?.folded),
    }));
  }

  function recordHandStart(players, bigBlind, handNumber, heroProfile) {
    try {
      active = {
        handNumber: finite(handNumber),
        bigBlind: Math.max(1, finite(bigBlind, 1)),
        heroProfile: String(heroProfile || ""),
        players: publicPlayers(players, bigBlind),
        actions: [],
      };
      return active;
    } catch (error) {
      errors.push(`recordHandStart:${String(error?.message || error)}`);
      active = null;
      return null;
    }
  }

  function recordAction(player, action, amount = 0, context = {}) {
    try {
      if (!active || active.actions.length >= MAX_ACTIONS_PER_HAND) return null;
      const bb = Math.max(1, finite(context.bigBlind, active.bigBlind));
      const normalized = normalizeAction(action);
      const amountBb = round(finite(amount) / bb, 4);
      const potBb = round(finite(context.pot) / bb, 4);
      const record = {
        sequence: active.actions.length,
        name: String(player?.name || ""),
        isHuman: Boolean(player?.isHuman),
        tier: String(context.tier || ""),
        street: String(context.street || ""),
        action: normalized,
        amountBb,
        potBb,
        amountToPotRatio: potBb > 0 ? round(amountBb / potBb, 4) : null,
        stackBb: round(finite(player?.stack) / bb, 4),
        betBb: round(finite(player?.bet) / bb, 4),
      };
      active.actions.push(record);
      return record;
    } catch (error) {
      errors.push(`recordAction:${String(error?.message || error)}`);
      return null;
    }
  }

  function recordHandEnd(players, bigBlind, handNumber, winners = [], boardCount = 0) {
    try {
      if (!active || hands.length >= MAX_HANDS) return null;
      const endPlayers = publicPlayers(players, bigBlind);
      const endByName = new Map(endPlayers.map(player => [player.name, player]));
      const heroStart = active.players.find(player => player.isHuman) || active.players[0] || null;
      const heroEnd = heroStart ? endByName.get(heroStart.name) : null;
      const winnerNames = new Set((Array.isArray(winners) ? winners : []).map(value => String(value)));
      const unfoldedCount = endPlayers.filter(player => !player.folded).length;
      const showdown = finite(boardCount) === 5 && unfoldedCount >= 2;
      const heroDeltaBb = heroStart && heroEnd ? round(heroEnd.stackBb - heroStart.wealthBb, 4) : 0;
      const aiBustCount = active.players.filter(startPlayer => {
        if (startPlayer.isHuman || startPlayer.wealthBb <= 0) return false;
        const endPlayer = endByName.get(startPlayer.name);
        return endPlayer && endPlayer.stackBb <= 0;
      }).length;
      const record = {
        handNumber: active.handNumber,
        heroProfile: active.heroProfile,
        heroName: heroStart?.name || "",
        heroWon: heroStart ? winnerNames.has(heroStart.name) : false,
        heroDeltaBb,
        showdown,
        boardCount: finite(boardCount),
        aiBustCount,
        actions: active.actions.map(action => ({ ...action })),
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
    return snapshot();
  }

  function snapshot() {
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

  window.AiBalancedLargePotResponseAuditV1 = Object.freeze({
    version: VERSION,
    recordHandStart,
    recordAction,
    recordHandEnd,
    reset,
    snapshot,
  });
  document.documentElement.dataset.aiBalancedLargePotResponseAuditV1 = "ready";
})();
