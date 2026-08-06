// AI V2.9.4 long-run telemetry integrity observer.
(() => {
  "use strict";

  if (window.AiLongRunTelemetryIntegrityV294?.version) return;

  const VERSION = "2.9.4";
  const DEFINITION = "postflop-showdown-hands/showdown-eligible-hands-excluding-preflop-all-in";
  const ROLE_NAMES = Object.freeze([
    "Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark",
    "Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper",
    "Nova", "Unit-9", "Merlin", "Vlad", "Oracle", "Chronos",
  ]);
  const POSTFLOP_STREETS = Object.freeze(["flop", "turn", "river"]);

  let activeHand = null;
  let completedHands = 0;
  let roles = createRoleMap();
  const errors = [];

  function createRoleCounts(name) {
    return {
      name,
      hands: 0,
      sawFlopHands: 0,
      showdownHands: 0,
      showdownEligibleHands: 0,
      postflopShowdownHands: 0,
      preflopAllInHands: 0,
      preflopAllInShowdownHands: 0,
      postflopFoldHands: 0,
    };
  }

  function createRoleMap() {
    return Object.fromEntries(ROLE_NAMES.map(name => [name, createRoleCounts(name)]));
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function rate(numerator, denominator) {
    return denominator > 0 ? round(numerator / denominator) : 0;
  }

  function streetKey() {
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function normalizeAction(action) {
    const value = String(action || "").toLowerCase();
    if (value.includes("fold")) return "fold";
    if (value.includes("all-in") || value.includes("allin")) return "allin";
    if (value.includes("raise")) return "raise";
    if (value.includes("call")) return "call";
    if (value.includes("check")) return "check";
    return "";
  }

  function beginHand() {
    finalizeHand();
    const players = Array.isArray(state?.players) ? state.players : [];
    const flags = new Map();
    for (const player of players) {
      if (!ROLE_NAMES.includes(player?.name)) continue;
      flags.set(player.name, {
        foldedStreet: "",
        preflopAllIn: false,
      });
      roles[player.name].hands += 1;
    }
    activeHand = {
      handNumber: Number(state?.handNumber) || 0,
      flags,
      finalized: false,
    };
  }

  function recordAction(player, action) {
    if (!activeHand || !player || !activeHand.flags.has(player.name)) return;
    try {
      const flags = activeHand.flags.get(player.name);
      const street = streetKey();
      const normalized = normalizeAction(action);
      if (!normalized) return;
      if (normalized === "fold" && !flags.foldedStreet) flags.foldedStreet = street;
      if (street === "preflop" && (normalized === "allin" || player.allIn)) {
        flags.preflopAllIn = true;
      }
    } catch (error) {
      errors.push(`record-action:${error?.message || error}`);
    }
  }

  function finalizeHand() {
    if (!activeHand || activeHand.finalized) return;
    activeHand.finalized = true;
    try {
      const players = Array.isArray(state?.players) ? state.players : [];
      const activeAtEnd = players.filter(player => !player?.folded);
      const showdown = (state?.board?.length || 0) === 5 && activeAtEnd.length >= 2;

      for (const player of players) {
        const metric = roles[player?.name];
        const flags = activeHand.flags.get(player?.name);
        if (!metric || !flags) continue;

        const sawFlop = (state?.board?.length || 0) >= 3 && flags.foldedStreet !== "preflop";
        const wentShowdown = showdown && !player.folded;
        const showdownEligible = sawFlop && !flags.preflopAllIn;
        const postflopShowdown = wentShowdown && showdownEligible;
        const preflopAllInShowdown = wentShowdown && flags.preflopAllIn;
        const postflopFold = POSTFLOP_STREETS.includes(flags.foldedStreet);

        if (sawFlop) metric.sawFlopHands += 1;
        if (wentShowdown) metric.showdownHands += 1;
        if (showdownEligible) metric.showdownEligibleHands += 1;
        if (postflopShowdown) metric.postflopShowdownHands += 1;
        if (flags.preflopAllIn) metric.preflopAllInHands += 1;
        if (preflopAllInShowdown) metric.preflopAllInShowdownHands += 1;
        if (postflopFold) metric.postflopFoldHands += 1;
      }
      completedHands += 1;
    } catch (error) {
      errors.push(`finalize-hand:${error?.message || error}`);
    }
  }

  function reset() {
    activeHand = null;
    completedHands = 0;
    roles = createRoleMap();
    errors.length = 0;
  }

  function roleSummary(counts) {
    const integrityErrors = [];
    if (counts.postflopShowdownHands > counts.showdownEligibleHands) {
      integrityErrors.push("postflop-showdown-exceeds-eligible");
    }
    if (counts.preflopAllInShowdownHands > counts.showdownHands) {
      integrityErrors.push("preflop-allin-showdown-exceeds-showdown");
    }
    if (counts.showdownEligibleHands > counts.sawFlopHands) {
      integrityErrors.push("eligible-exceeds-saw-flop");
    }
    return {
      ...counts,
      legacyWtsd: rate(counts.showdownHands, counts.sawFlopHands),
      wtsd: rate(counts.postflopShowdownHands, counts.showdownEligibleHands),
      preflopAllInShowdownShare: rate(counts.preflopAllInShowdownHands, counts.showdownHands),
      postflopFoldRate: rate(counts.postflopFoldHands, counts.showdownEligibleHands),
      integrityPassed: integrityErrors.length === 0,
      integrityErrors,
    };
  }

  function snapshot(options = {}) {
    if (options.finalize !== false) finalizeHand();
    const summaries = Object.fromEntries(
      Object.entries(roles).map(([name, counts]) => [name, roleSummary(counts)]),
    );
    const roleErrors = Object.values(summaries).flatMap(role => (
      role.integrityErrors.map(error => `${role.name}:${error}`)
    ));
    return {
      version: VERSION,
      schemaVersion: 1,
      definition: DEFINITION,
      hookMode: "explicit-lab-hooks",
      completedHands,
      roles: summaries,
      integrityPassed: errors.length === 0 && roleErrors.length === 0,
      errors: [...errors, ...roleErrors],
    };
  }

  window.AiLongRunTelemetryIntegrityV294 = Object.freeze({
    version: VERSION,
    definition: DEFINITION,
    roleNames: [...ROLE_NAMES],
    beginHand,
    recordAction,
    finalizeHand,
    reset,
    snapshot,
  });
  document.documentElement.dataset.aiTelemetryIntegrityV294 = "ready";
})();
