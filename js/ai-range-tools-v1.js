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

// Public action-history range narrowing diagnostics for AI V2.2.
(() => {
  "use strict";

  if (window.AiRangeHistoryFilterV1?.version) return;

  const VERSION = "1.0.0";
  const HISTORY_SCHEMA_VERSION = "2.2.0";
  const STREET_KEYS = ["preflop", "flop", "turn", "river"];
  const AGGRESSIVE_ACTIONS = new Set(["raise", "allin-raise"]);
  const CALL_ACTIONS = new Set(["call", "allin-call"]);
  const FORCED_ACTIONS = new Set(["small-blind", "big-blind"]);
  const POSITION_STRENGTH = Object.freeze({
    UTG: 0.055,
    MP: 0.038,
    HJ: 0.025,
    CO: 0.008,
    BTN: -0.018,
    SB: 0.018,
    BB: 0.006,
  });
  const POSITION_AGGRESSION_WIDTH = Object.freeze({
    UTG: -0.055,
    MP: -0.035,
    HJ: -0.02,
    CO: 0.015,
    BTN: 0.065,
    SB: 0.025,
    BB: 0.04,
  });

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function normalizeStreet(street) {
    const key = String(street || "").toLowerCase();
    return STREET_KEYS.includes(key) ? key : "preflop";
  }

  function streetIndex(street) {
    return Math.max(0, STREET_KEYS.indexOf(normalizeStreet(street)));
  }

  function actorName(playerOrName) {
    return typeof playerOrName === "string"
      ? playerOrName
      : String(playerOrName?.name || "");
  }

  function safeHistorySnapshot(source = null) {
    if (source?.streets && typeof source.streets === "object") return source;
    try {
      const snapshot = window.AiActionMemory?.snapshot?.();
      if (snapshot?.streets) return snapshot;
    } catch (_) {
      // Neutral empty history is safer than consulting any non-public fallback.
    }
    return {
      version: "neutral",
      schemaVersion: HISTORY_SCHEMA_VERSION,
      handNumber: 0,
      streets: Object.fromEntries(STREET_KEYS.map(street => [street, []])),
      publicInformationOnly: true,
    };
  }

  function knownEventFields(event) {
    return {
      sequence: Math.max(0, Number(event?.sequence) || 0),
      streetActionIndex: Math.max(0, Number(event?.streetActionIndex) || 0),
      handNumber: Math.max(0, Number(event?.handNumber) || 0),
      street: normalizeStreet(event?.street),
      actor: String(event?.actor || ""),
      positionLabel: String(event?.positionLabel || "--"),
      action: String(event?.action || "").toLowerCase(),
      isAggressive: Boolean(event?.isAggressive),
      isForcedBet: Boolean(event?.isForcedBet),
      isAllIn: Boolean(event?.isAllIn),
      contribution: Math.max(0, Number(event?.contribution) || Number(event?.amount) || 0),
      amountToCallBefore: Math.max(0, Number(event?.amountToCallBefore) || 0),
      raiseBy: Math.max(0, Number(event?.raiseBy) || 0),
      potBefore: Math.max(0, Number(event?.potBefore) || 0),
      contributionPotFraction: Math.max(0, Number(event?.contributionPotFraction) || 0),
      raiseByPotFraction: Math.max(0, Number(event?.raiseByPotFraction) || 0),
      activeOpponentCount: Math.max(0, Number(event?.activeOpponentCount) || 0),
      publicInformationOnly: event?.publicInformationOnly !== false,
    };
  }

  function eventSizeFraction(event) {
    if (event.contributionPotFraction > 0) return clamp(event.contributionPotFraction, 0, 4);
    if (event.raiseByPotFraction > 0) return clamp(event.raiseByPotFraction, 0, 4);
    return event.potBefore > 0 ? clamp(event.contribution / event.potBefore, 0, 4) : 0;
  }

  function actionKind(event) {
    if (FORCED_ACTIONS.has(event.action) || event.isForcedBet) return "forced";
    if (event.action === "fold") return "fold";
    if (event.action === "check") return "check";
    if (CALL_ACTIONS.has(event.action)) return event.isAllIn ? "allin-call" : "call";
    if (AGGRESSIVE_ACTIONS.has(event.action) || event.isAggressive) {
      const openingBet = event.amountToCallBefore <= 0;
      if (event.isAllIn || event.action === "allin-raise") {
        return openingBet ? "allin-bet" : "allin-raise";
      }
      return openingBet ? "bet" : "raise";
    }
    return "unknown";
  }

  function initialState(position = "--") {
    const strength = clamp(0.37 + (POSITION_STRENGTH[position] || 0), 0.25, 0.55);
    return {
      rangeWidth: 1,
      rangeStrength: strength,
      nutDensity: 0.055,
      valueDensity: 0.13,
      bluffDensity: 0.18,
      confidence: 0.08,
      voluntaryActions: 0,
      aggressiveActions: 0,
      calls: 0,
      checks: 0,
      folded: false,
    };
  }

  function normalizeDensities(state) {
    state.rangeWidth = state.folded ? 0 : clamp(state.rangeWidth, 0.012, 1);
    state.rangeStrength = clamp(state.rangeStrength, 0.12, 0.985);
    state.valueDensity = clamp(state.valueDensity, 0.02, 0.88);
    state.nutDensity = clamp(state.nutDensity, 0.01, Math.min(0.78, state.valueDensity));
    state.bluffDensity = clamp(state.bluffDensity, 0, 0.48);
    if (state.valueDensity + state.bluffDensity > 0.94) {
      state.bluffDensity = Math.max(0, 0.94 - state.valueDensity);
    }
    state.confidence = clamp(state.confidence, 0.05, 0.985);
    return state;
  }

  function applyPreflopAction(state, event, kind, size) {
    const positionWidth = POSITION_AGGRESSION_WIDTH[event.positionLabel] || 0;
    let retention = 1;
    let explanation = "No voluntary preflop filter";

    if (kind === "forced") {
      state.confidence += 0.012;
      explanation = "Forced blind does not narrow the voluntary range";
    } else if (kind === "check") {
      retention = 0.94;
      state.rangeStrength -= 0.018;
      state.valueDensity -= 0.012;
      state.bluffDensity += 0.012;
      state.checks += 1;
      state.voluntaryActions += 1;
      state.confidence += 0.075;
      explanation = "Free option keeps a wide big-blind range";
    } else if (kind === "call" || kind === "allin-call") {
      retention = kind === "allin-call"
        ? clamp(0.25 - Math.min(0.07, size * 0.025), 0.12, 0.25)
        : clamp(0.56 - Math.min(0.16, size * 0.11), 0.34, 0.58);
      state.rangeStrength += 0.055 + Math.min(0.065, size * 0.035);
      state.valueDensity += 0.035;
      state.nutDensity += kind === "allin-call" ? 0.055 : 0.018;
      state.bluffDensity -= kind === "allin-call" ? 0.085 : 0.035;
      state.calls += 1;
      state.voluntaryActions += 1;
      state.confidence += 0.14 + Math.min(0.07, size * 0.035);
      explanation = kind === "allin-call"
        ? "Preflop all-in call keeps a compact continuing range"
        : "Preflop call removes folds while retaining capped and trapping hands";
    } else if (["bet", "raise", "allin-bet", "allin-raise"].includes(kind)) {
      const priorAggression = state.aggressiveActions;
      if (kind.startsWith("allin")) {
        retention = clamp(0.21 + positionWidth - priorAggression * 0.035, 0.075, 0.28);
      } else if (priorAggression === 0) {
        retention = clamp(0.35 + positionWidth - Math.min(0.06, size * 0.025), 0.22, 0.44);
      } else {
        retention = clamp(0.46 - priorAggression * 0.09 - Math.min(0.07, size * 0.025), 0.19, 0.48);
      }
      state.rangeStrength += 0.105 + priorAggression * 0.075 + Math.min(0.07, size * 0.035);
      state.valueDensity += 0.075 + priorAggression * 0.05;
      state.nutDensity += 0.045 + priorAggression * 0.055;
      state.bluffDensity = clamp(
        state.bluffDensity * 0.82 + (priorAggression === 0 ? 0.035 : 0.015),
        0.025,
        0.3,
      );
      state.aggressiveActions += 1;
      state.voluntaryActions += 1;
      state.confidence += 0.17 + Math.min(0.08, size * 0.035) + priorAggression * 0.035;
      explanation = kind.startsWith("allin")
        ? "Preflop all-in creates a very narrow but non-zero bluff-capable range"
        : (priorAggression === 0
          ? "Opening aggression applies a position-aware first filter"
          : "Repeated preflop aggression applies an additional re-raise filter");
    } else if (kind === "fold") {
      retention = 0;
      state.folded = true;
      state.confidence = 1;
      explanation = "Fold ends the active range";
    }

    state.rangeWidth *= retention;
    return { retention, explanation };
  }

  function applyPostflopAction(state, event, kind, size) {
    const street = event.street;
    const river = street === "river";
    const turn = street === "turn";
    let retention = 1;
    let explanation = "Unknown public action keeps the prior range";

    if (kind === "check") {
      retention = river ? 0.9 : 0.93;
      state.rangeStrength -= river ? 0.028 : 0.018;
      state.valueDensity -= river ? 0.018 : 0.01;
      state.nutDensity -= 0.006;
      state.bluffDensity += river ? 0.012 : 0.02;
      state.checks += 1;
      state.voluntaryActions += 1;
      state.confidence += 0.065;
      explanation = river
        ? "River check modestly caps value while preserving traps"
        : "Check keeps a broad range with draws, showdown hands and traps";
    } else if (kind === "call" || kind === "allin-call") {
      retention = kind === "allin-call"
        ? clamp(0.3 - Math.min(0.09, size * 0.035), 0.14, 0.3)
        : clamp(0.73 - Math.min(0.32, size * 0.22), 0.34, 0.76);
      state.rangeStrength += 0.048 + Math.min(0.105, size * 0.07) + (river ? 0.025 : 0);
      state.valueDensity += 0.04 + (river ? 0.025 : 0);
      state.nutDensity += kind === "allin-call" ? 0.07 : 0.018;
      state.bluffDensity *= river ? 0.38 : 0.55;
      state.calls += 1;
      state.voluntaryActions += 1;
      state.confidence += 0.135 + Math.min(0.1, size * 0.06);
      explanation = kind === "allin-call"
        ? "All-in call removes most marginal continues"
        : "Call narrows by public price while retaining value and bluff-catchers";
    } else if (["bet", "raise", "allin-bet", "allin-raise"].includes(kind)) {
      const raising = kind === "raise" || kind === "allin-raise";
      const allIn = kind.startsWith("allin");
      const overbet = size >= 1.05;
      if (allIn) retention = clamp(0.25 - Math.min(0.1, size * 0.035), 0.1, 0.25);
      else if (raising) retention = clamp(0.46 - Math.min(0.16, size * 0.105), 0.25, 0.47);
      else retention = clamp(0.62 - Math.min(0.22, size * 0.14), 0.34, 0.63);

      const aggressionBoost = raising ? 0.12 : 0.075;
      state.rangeStrength += aggressionBoost + Math.min(0.11, size * 0.065) + (river ? 0.025 : 0);
      state.valueDensity += (raising ? 0.105 : 0.07) + (river ? 0.035 : 0);
      state.nutDensity += (raising ? 0.08 : 0.045) + Math.min(0.08, size * 0.045);
      const semibluffFloor = river ? 0.035 : (turn ? 0.07 : 0.09);
      const polarizationTail = overbet ? (river ? 0.06 : 0.085) : 0.025;
      state.bluffDensity = clamp(
        state.bluffDensity * (raising ? 0.76 : 0.84) + semibluffFloor + polarizationTail,
        river ? 0.025 : 0.05,
        river ? 0.32 : 0.42,
      );
      state.aggressiveActions += 1;
      state.voluntaryActions += 1;
      state.confidence += 0.17 + Math.min(0.115, size * 0.065) + (raising ? 0.035 : 0);
      explanation = allIn
        ? "All-in pressure creates a compact polarized range"
        : (raising
          ? "Raise removes most medium-strength hands while keeping value and a bluff tail"
          : (overbet
            ? "Overbet creates a polarized value-and-bluff distribution"
            : "Bet filters checks while retaining value and semi-bluffs"));
    } else if (kind === "fold") {
      retention = 0;
      state.folded = true;
      state.confidence = 1;
      explanation = "Fold ends the active range";
    }

    state.rangeWidth *= retention;
    return { retention, explanation };
  }

  function publicEventDiagnostic(event, kind, size, before, state, effect) {
    return Object.freeze({
      sequence: event.sequence,
      streetActionIndex: event.streetActionIndex,
      street: event.street,
      action: event.action,
      actionKind: kind,
      positionLabel: event.positionLabel,
      sizeFraction: round(size),
      amountToCallBefore: round(event.amountToCallBefore),
      potBefore: round(event.potBefore),
      widthBefore: round(before.rangeWidth),
      widthAfter: round(state.rangeWidth),
      retention: round(effect.retention),
      strengthAfter: round(state.rangeStrength),
      nutDensityAfter: round(state.nutDensity),
      valueDensityAfter: round(state.valueDensity),
      bluffDensityAfter: round(state.bluffDensity),
      confidenceAfter: round(state.confidence),
      explanation: effect.explanation,
      publicInformationOnly: true,
    });
  }

  function snapshotState(state) {
    return {
      rangeWidth: round(state.rangeWidth),
      rangeStrength: round(state.rangeStrength),
      nutDensity: round(state.nutDensity),
      valueDensity: round(state.valueDensity),
      bluffDensity: round(state.bluffDensity),
      confidence: round(state.confidence),
      equivalentComboCount: state.folded ? 0 : Math.max(1, Math.round(1326 * state.rangeWidth)),
      voluntaryActions: state.voluntaryActions,
      aggressiveActions: state.aggressiveActions,
      calls: state.calls,
      checks: state.checks,
      folded: state.folded,
    };
  }

  function analyzeEvents(playerOrName, sourceEvents = [], options = {}) {
    const name = actorName(playerOrName);
    const targetStreet = normalizeStreet(options.street || "river");
    const targetIndex = streetIndex(targetStreet);
    const events = (sourceEvents || [])
      .map(knownEventFields)
      .filter(event => (
        event.actor === name
        && event.publicInformationOnly
        && streetIndex(event.street) <= targetIndex
      ))
      .sort((left, right) => (
        left.sequence - right.sequence
        || streetIndex(left.street) - streetIndex(right.street)
        || left.streetActionIndex - right.streetActionIndex
      ));

    const firstPosition = events.find(event => event.positionLabel && event.positionLabel !== "--")?.positionLabel || "--";
    const state = initialState(firstPosition);
    const diagnostics = [];
    const streets = {};
    let cursor = 0;

    for (let index = 0; index <= targetIndex; index += 1) {
      const street = STREET_KEYS[index];
      const entry = snapshotState(state);
      const streetEvents = [];

      while (cursor < events.length && events[cursor].street === street) {
        const event = events[cursor];
        const kind = actionKind(event);
        const size = eventSizeFraction(event);
        const before = { ...state };
        const effect = street === "preflop"
          ? applyPreflopAction(state, event, kind, size)
          : applyPostflopAction(state, event, kind, size);
        normalizeDensities(state);
        const diagnostic = publicEventDiagnostic(event, kind, size, before, state, effect);
        diagnostics.push(diagnostic);
        streetEvents.push(diagnostic);
        cursor += 1;
      }

      streets[street] = Object.freeze({
        street,
        entry,
        exit: snapshotState(state),
        actionCount: streetEvents.length,
        events: Object.freeze(streetEvents),
        publicInformationOnly: true,
      });
    }

    const finalState = snapshotState(state);
    return Object.freeze({
      version: VERSION,
      historySchemaVersion: HISTORY_SCHEMA_VERSION,
      actor: name,
      targetStreet,
      positionLabel: firstPosition,
      ...finalState,
      preflopWidth: streets.preflop?.exit.rangeWidth ?? 1,
      flopWidth: streets.flop?.exit.rangeWidth ?? null,
      turnWidth: streets.turn?.exit.rangeWidth ?? null,
      riverWidth: streets.river?.exit.rangeWidth ?? null,
      streets: Object.freeze(streets),
      events: Object.freeze(diagnostics),
      publicInformationOnly: true,
      decisionIntegrated: false,
    });
  }

  function actorEventsFromHistory(playerOrName, history = null) {
    const name = actorName(playerOrName);
    const snapshot = safeHistorySnapshot(history);
    return STREET_KEYS.flatMap(street => snapshot.streets?.[street] || [])
      .filter(event => String(event?.actor || "") === name);
  }

  function analyzeActor(playerOrName, options = {}) {
    const history = safeHistorySnapshot(options.history || null);
    const events = actorEventsFromHistory(playerOrName, history);
    const inferredStreet = options.street
      || [...events].sort((left, right) => streetIndex(right?.street) - streetIndex(left?.street))[0]?.street
      || "preflop";
    return analyzeEvents(playerOrName, events, { street: inferredStreet });
  }

  function analyzeAll(options = {}) {
    const history = safeHistorySnapshot(options.history || null);
    const names = options.actors?.length
      ? options.actors.map(actorName).filter(Boolean)
      : [...new Set(STREET_KEYS.flatMap(street => (
        history.streets?.[street] || []
      )).map(event => String(event?.actor || "")).filter(Boolean))];

    return Object.freeze(names.map(name => analyzeActor(name, {
      history,
      street: options.street || "river",
    })));
  }

  window.AiRangeHistoryFilterV1 = Object.freeze({
    version: VERSION,
    historySchemaVersion: HISTORY_SCHEMA_VERSION,
    fairInformationPolicy: Object.freeze({
      publicActionHistoryOnly: true,
      publicPositions: true,
      publicBetSizes: true,
      publicBoardTiming: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    normalizeStreet,
    actionKind,
    eventSizeFraction,
    analyzeEvents,
    actorEventsFromHistory,
    analyzeActor,
    analyzeAll,
  });

  if (typeof document === "object" && document?.documentElement) {
    document.documentElement.dataset.aiRangeHistoryFilter = "ready";
  }
})();
