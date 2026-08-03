// Public-action opponent range distribution model for multiway pots.
(() => {
  "use strict";

  if (window.AiMultiwayRangeModel?.version) return;

  const VERSION = "1.0.0";
  const STREET_KEYS = ["preflop", "flop", "turn", "river"];
  const AGGRESSIVE_ACTIONS = new Set(["raise", "allin-raise"]);
  const CALL_ACTIONS = new Set(["call", "allin-call"]);
  const POSITION_STRENGTH = Object.freeze({
    UTG: 0.075,
    MP: 0.05,
    HJ: 0.035,
    CO: 0.015,
    BTN: -0.015,
    SB: 0.025,
    BB: 0.01,
    "--": 0,
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function currentStreet() {
    const count = typeof state === "object" ? (state?.board?.length || 0) : 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function streetIndex(street) {
    return Math.max(0, STREET_KEYS.indexOf(STREET_KEYS.includes(street) ? street : currentStreet()));
  }

  function publicPosition(player) {
    if (typeof positionLabel === "function") {
      try {
        return positionLabel(player) || "--";
      } catch (_) {
        // Numeric seat fallback remains public information.
      }
    }
    return String(player?.position ?? "--");
  }

  function activeOpponents(player) {
    if (typeof state !== "object" || !Array.isArray(state?.players)) return [];
    return state.players.filter(candidate => (
      candidate
      && candidate !== player
      && !candidate.folded
      && candidate.name
    ));
  }

  function actorActions(name, street) {
    return window.AiActionMemory?.actorActions?.(name, street) || [];
  }

  function actionSizeFraction(event) {
    const amount = Math.max(0, Number(event?.amount) || Number(event?.bet) || 0);
    const potAfter = Math.max(0, Number(event?.pot) || 0);
    const potBefore = Math.max(1, potAfter - amount);
    return clamp(amount / potBefore, 0, 4);
  }

  function actionCounts(events) {
    const result = {
      raises: 0,
      calls: 0,
      checks: 0,
      allIns: 0,
      largeActions: 0,
      overbets: 0,
      latestAction: "",
      latestSizeFraction: 0,
    };
    for (const event of events) {
      if (AGGRESSIVE_ACTIONS.has(event.action)) result.raises += 1;
      if (CALL_ACTIONS.has(event.action)) result.calls += 1;
      if (event.action === "check") result.checks += 1;
      if (String(event.action || "").startsWith("allin")) result.allIns += 1;
      const size = actionSizeFraction(event);
      if (size >= 0.72) result.largeActions += 1;
      if (size >= 1.12) result.overbets += 1;
      result.latestAction = event.action || result.latestAction;
      result.latestSizeFraction = size || result.latestSizeFraction;
    }
    return result;
  }

  function preflopRangeEstimate(opponent) {
    const events = actorActions(opponent?.name, "preflop");
    const counts = actionCounts(events);
    const position = publicPosition(opponent);
    const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 1);
    const largestBet = events.reduce((largest, event) => Math.max(largest, Number(event?.bet) || Number(event?.amount) || 0), 0);
    const sizeInBigBlinds = largestBet / bigBlind;

    let strength = 0.39 + (POSITION_STRENGTH[position] || 0);
    if (counts.raises === 1) strength = Math.max(strength, 0.58 + (POSITION_STRENGTH[position] || 0));
    else if (counts.raises === 2) strength = Math.max(strength, 0.72 + (POSITION_STRENGTH[position] || 0) * 0.6);
    else if (counts.raises >= 3) strength = Math.max(strength, 0.84);
    else if (counts.calls > 0) strength = Math.max(strength, 0.46 + Math.min(0.06, counts.calls * 0.02));
    else if (counts.checks > 0) strength = Math.min(strength, 0.35);

    if (counts.allIns > 0) strength += 0.08;
    if (sizeInBigBlinds >= 12) strength += 0.075;
    else if (sizeInBigBlinds >= 7) strength += 0.045;
    else if (sizeInBigBlinds >= 3.5) strength += 0.02;

    return {
      position,
      events: events.length,
      raises: counts.raises,
      calls: counts.calls,
      checks: counts.checks,
      allIns: counts.allIns,
      sizeInBigBlinds,
      strength: clamp(strength, 0.22, 0.93),
    };
  }

  function postflopRangeEstimate(opponent, street, preflop) {
    const targetIndex = streetIndex(street);
    let strength = preflop.strength;
    let currentStreetAggression = 0;
    let totalAggression = 0;
    let totalCalls = 0;
    let totalChecks = 0;
    let largeActions = 0;
    let overbets = 0;
    let latestAction = "";
    let latestSizeFraction = 0;

    for (let index = 1; index <= targetIndex; index += 1) {
      const key = STREET_KEYS[index];
      const events = actorActions(opponent?.name, key);
      const counts = actionCounts(events);
      const weight = index === targetIndex ? 1 : 0.55;
      totalAggression += counts.raises;
      totalCalls += counts.calls;
      totalChecks += counts.checks;
      largeActions += counts.largeActions;
      overbets += counts.overbets;
      if (index === targetIndex) currentStreetAggression = counts.raises;
      if (counts.latestAction) {
        latestAction = counts.latestAction;
        latestSizeFraction = counts.latestSizeFraction;
      }

      strength += counts.raises * 0.115 * weight;
      strength += counts.calls * 0.028 * weight;
      strength -= counts.checks * 0.018 * weight;
      strength += counts.allIns * 0.075 * weight;
      strength += counts.largeActions * 0.035 * weight;
      strength += counts.overbets * 0.045 * weight;
    }

    if (opponent?.allIn) strength += 0.055;

    return {
      strength: clamp(strength, 0.18, 0.97),
      currentStreetAggression,
      totalAggression,
      totalCalls,
      totalChecks,
      largeActions,
      overbets,
      latestAction,
      latestSizeFraction,
    };
  }

  function opponentProfile(opponent, street = currentStreet()) {
    const preflop = preflopRangeEstimate(opponent);
    const postflop = postflopRangeEstimate(opponent, street, preflop);
    const rangeStrength = street === "preflop" ? preflop.strength : postflop.strength;
    const aggressionSignal = postflop.currentStreetAggression > 0 || postflop.latestAction === "allin-raise";
    const callingSignal = postflop.totalCalls > postflop.totalAggression && postflop.totalCalls > 0;
    const nutDensity = clamp(
      0.06
      + Math.max(0, rangeStrength - 0.42) * 0.82
      + postflop.currentStreetAggression * 0.055
      + postflop.overbets * 0.04,
      0.04,
      0.7,
    );

    return {
      name: String(opponent?.name || ""),
      isHuman: Boolean(opponent?.isHuman),
      position: preflop.position,
      allIn: Boolean(opponent?.allIn),
      preflopStrength: preflop.strength,
      rangeStrength,
      rangeWidth: clamp(1.02 - rangeStrength, 0.08, 0.82),
      nutDensity,
      aggressiveThisStreet: aggressionSignal,
      callingLine: callingSignal,
      totalAggression: postflop.totalAggression,
      totalCalls: postflop.totalCalls,
      totalChecks: postflop.totalChecks,
      largeActions: postflop.largeActions,
      overbets: postflop.overbets,
      latestAction: postflop.latestAction,
      latestSizeFraction: postflop.latestSizeFraction,
    };
  }

  function analyze(player, context = {}) {
    const street = context.street || currentStreet();
    const profiles = activeOpponents(player).map(opponent => opponentProfile(opponent, street));
    const opponentCount = profiles.length;
    const multiway = opponentCount >= 2;
    const strongestRange = profiles.reduce((value, profile) => Math.max(value, profile.rangeStrength), 0);
    const averageRange = opponentCount
      ? profiles.reduce((total, profile) => total + profile.rangeStrength, 0) / opponentCount
      : 0;
    const averageNutDensity = opponentCount
      ? profiles.reduce((total, profile) => total + profile.nutDensity, 0) / opponentCount
      : 0;
    const aggressiveOpponents = profiles.filter(profile => profile.aggressiveThisStreet || profile.rangeStrength >= 0.7).length;
    const callingOpponents = profiles.filter(profile => profile.callingLine).length;
    const allInOpponents = profiles.filter(profile => profile.allIn).length;
    const countPressure = Math.max(0, opponentCount - 1) * 0.055;
    const rangePressure = clamp(
      averageRange * 0.48
      + strongestRange * 0.34
      + averageNutDensity * 0.12
      + countPressure
      + aggressiveOpponents * 0.035,
      opponentCount ? 0.2 : 0,
      0.96,
    );
    const requiredShowdownStrength = clamp(
      0.4 + rangePressure * 0.27 + Math.max(0, opponentCount - 1) * 0.027,
      0.42,
      0.79,
    );
    const thinValueThreshold = clamp(
      0.61 + rangePressure * 0.09 + Math.max(0, opponentCount - 1) * 0.035,
      0.63,
      0.84,
    );
    const strongValueThreshold = clamp(
      0.74 + rangePressure * 0.055 + Math.max(0, opponentCount - 1) * 0.022,
      0.76,
      0.9,
    );
    const bluffSuccessModifier = clamp(
      1 - Math.max(0, opponentCount - 1) * 0.27 - aggressiveOpponents * 0.075 - callingOpponents * 0.055,
      0.1,
      1,
    );
    const equityProxy = clamp(context.equityProxy, 0, 1);

    return {
      version: VERSION,
      street,
      opponentCount,
      multiway,
      profiles,
      strongestRange,
      averageRange,
      averageNutDensity,
      aggressiveOpponents,
      callingOpponents,
      allInOpponents,
      rangePressure,
      requiredShowdownStrength,
      thinValueThreshold,
      strongValueThreshold,
      bluffSuccessModifier,
      rangeAdvantage: clamp(equityProxy - requiredShowdownStrength, -0.6, 0.6),
      publicInformationOnly: true,
    };
  }

  window.AiMultiwayRangeModel = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      publicPlayers: true,
      publicPositions: true,
      publicActions: true,
      publicBetSizes: true,
      ownStrengthProxyFromCaller: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    currentStreet,
    activeOpponents,
    opponentProfile,
    analyze,
  };
})();
