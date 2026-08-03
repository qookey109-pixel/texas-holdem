// Public-information range continuation from preflop roles into postflop pressure lines.
(() => {
  "use strict";

  if (window.AiRangeContinuation?.version) return;

  const VERSION = "1.0.0";
  const SUPPORTED_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"];
  const AGGRESSIVE_ACTIONS = new Set(["raise", "allin-raise"]);
  const RANGE_VALUES = Object.freeze({ premium: 0.96, strong: 0.76, medium: 0.53, speculative: 0.34, air: 0.15 });
  const ROLE_RANGES = Object.freeze({
    "four-bettor": { premium: 0.48, strong: 0.34, medium: 0.12, speculative: 0.03, air: 0.03 },
    "three-bettor": { premium: 0.28, strong: 0.31, medium: 0.19, speculative: 0.08, air: 0.14 },
    squeezer: { premium: 0.25, strong: 0.28, medium: 0.18, speculative: 0.1, air: 0.19 },
    opener: { premium: 0.15, strong: 0.25, medium: 0.28, speculative: 0.18, air: 0.14 },
    "blind-defender": { premium: 0.08, strong: 0.17, medium: 0.29, speculative: 0.28, air: 0.18 },
    caller: { premium: 0.07, strong: 0.18, medium: 0.33, speculative: 0.27, air: 0.15 },
    limper: { premium: 0.05, strong: 0.12, medium: 0.29, speculative: 0.31, air: 0.23 },
    unopened: { premium: 0.09, strong: 0.19, medium: 0.3, speculative: 0.24, air: 0.18 },
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function normalize(weights) {
    const safe = {};
    let total = 0;
    for (const key of Object.keys(RANGE_VALUES)) {
      safe[key] = Math.max(0.001, Number(weights?.[key]) || 0);
      total += safe[key];
    }
    for (const key of Object.keys(safe)) safe[key] /= total;
    return safe;
  }

  function actorName(playerOrName) {
    return typeof playerOrName === "string" ? playerOrName : String(playerOrName?.name || "");
  }

  function actorPlayer(playerOrName) {
    const name = actorName(playerOrName);
    if (typeof playerOrName === "object" && playerOrName) return playerOrName;
    return (state?.players || []).find(candidate => candidate?.name === name) || null;
  }

  function actorPosition(playerOrName) {
    const player = actorPlayer(playerOrName);
    return player && typeof positionLabel === "function" ? positionLabel(player) : "--";
  }

  function preflopActions() {
    return window.AiActionMemory?.actions?.("preflop") || [];
  }

  function roleFor(playerOrName) {
    const name = actorName(playerOrName);
    const actions = preflopActions();
    const own = actions.filter(event => event.actor === name);
    const ownRaises = own.filter(event => AGGRESSIVE_ACTIONS.has(event.action));
    const ownCalls = own.filter(event => ["call", "allin-call"].includes(event.action));
    const firstAggression = actions.find(event => AGGRESSIVE_ACTIONS.has(event.action)) || null;
    const firstOwnRaise = ownRaises[0] || null;
    const priorAggressions = firstOwnRaise
      ? actions.filter(event => event.sequence < firstOwnRaise.sequence && AGGRESSIVE_ACTIONS.has(event.action))
      : [];
    const callersBetween = firstOwnRaise && priorAggressions.length
      ? actions.filter(event => (
        event.sequence > priorAggressions.at(-1).sequence
        && event.sequence < firstOwnRaise.sequence
        && ["call", "allin-call"].includes(event.action)
      ))
      : [];
    const position = actorPosition(playerOrName);

    let role = "unopened";
    if (ownRaises.length >= 2 || (firstOwnRaise && priorAggressions.length >= 2)) role = "four-bettor";
    else if (firstOwnRaise && priorAggressions.length && callersBetween.length) role = "squeezer";
    else if (firstOwnRaise && priorAggressions.length) role = "three-bettor";
    else if (firstAggression?.actor === name) role = "opener";
    else if (ownCalls.length && firstAggression) role = ["SB", "BB", "BTN/SB"].includes(position) ? "blind-defender" : "caller";
    else if (ownCalls.length) role = "limper";

    return {
      actor: name,
      role,
      position,
      aggressive: ["opener", "three-bettor", "four-bettor", "squeezer"].includes(role),
      raises: ownRaises.length,
      calls: ownCalls.length,
      firstAggression: firstAggression ? { actor: firstAggression.actor, sequence: firstAggression.sequence } : null,
      actionCount: own.length,
    };
  }

  function positionAdjustedRange(roleInfo) {
    const base = { ...(ROLE_RANGES[roleInfo.role] || ROLE_RANGES.unopened) };
    const late = ["CO", "BTN", "BTN/SB"].includes(roleInfo.position);
    const early = ["UTG", "MP"].includes(roleInfo.position);
    const blind = ["SB", "BB", "BTN/SB"].includes(roleInfo.position);

    if (late && roleInfo.aggressive) {
      base.speculative += 0.035;
      base.air += 0.025;
      base.premium -= 0.025;
      base.strong -= 0.035;
    }
    if (early && roleInfo.aggressive) {
      base.premium += 0.035;
      base.strong += 0.035;
      base.speculative -= 0.03;
      base.air -= 0.04;
    }
    if (blind && ["caller", "blind-defender"].includes(roleInfo.role)) {
      base.medium += 0.025;
      base.speculative += 0.035;
      base.strong -= 0.025;
      base.air -= 0.035;
    }
    return normalize(base);
  }

  function rangeProfile(playerOrName) {
    const role = roleFor(playerOrName);
    const weights = positionAdjustedRange(role);
    const strength = Object.entries(weights).reduce((sum, [key, weight]) => sum + RANGE_VALUES[key] * weight, 0);
    return { ...role, weights, strength: clamp(strength, 0.1, 0.95) };
  }

  function boardProfile(board = state?.board || []) {
    const cards = [...(board || [])];
    const ranks = cards.map(card => Number(card?.value) || 0).filter(Boolean).sort((a, b) => a - b);
    const rankCounts = new Map();
    const suitCounts = new Map();
    for (const card of cards) {
      rankCounts.set(Number(card.value), (rankCounts.get(Number(card.value)) || 0) + 1);
      suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
    }
    const unique = [...new Set(ranks)];
    if (unique.includes(14)) unique.unshift(1);
    let connectedWindows = 0;
    for (let index = 0; index <= unique.length - 3; index += 1) {
      if (unique[index + 2] - unique[index] <= 4) connectedWindows += 1;
    }
    const maxSuit = Math.max(0, ...suitCounts.values());
    const paired = [...rankCounts.values()].some(count => count >= 2);
    const high = Math.max(0, ...ranks);
    const broadwayCount = ranks.filter(rank => rank >= 10).length;
    const connectedness = clamp(connectedWindows * 0.28, 0, 1);
    const wetness = clamp(
      connectedness * 0.48
      + (maxSuit >= 3 ? 0.34 : (maxSuit === 2 ? 0.14 : 0))
      + (paired ? 0.08 : 0),
      0,
      1,
    );
    return {
      cards: cards.length,
      high,
      broadwayCount,
      paired,
      maxSuit,
      monotone: cards.length >= 3 && maxSuit >= 3,
      twoTone: cards.length >= 3 && maxSuit === 2,
      connected: connectedWindows > 0,
      connectedness,
      wetness,
      dry: wetness < 0.24,
      lowBoard: high > 0 && high <= 9,
      highBoard: high >= 12,
    };
  }

  function rangeBoardScore(range, board) {
    const w = range.weights;
    let score = range.strength * 0.56;
    if (board.highBoard) score += w.premium * 0.2 + w.strong * 0.13 - w.speculative * 0.08;
    if (board.broadwayCount >= 2) score += w.premium * 0.12 + w.strong * 0.1 - w.air * 0.04;
    if (board.lowBoard) score += w.speculative * 0.15 + w.medium * 0.06 - w.premium * 0.045;
    if (board.connected) score += w.speculative * 0.16 + w.medium * 0.05 - w.air * 0.025;
    if (board.monotone || board.twoTone) score += w.speculative * 0.09 + w.strong * 0.035;
    if (board.paired) score += w.premium * 0.08 + w.strong * 0.05 - w.speculative * 0.025;
    if (board.dry) score += w.premium * 0.06 + w.strong * 0.04;
    return clamp(score, 0.08, 0.96);
  }

  function nutBoardScore(range, board) {
    const w = range.weights;
    let score = w.premium * 0.62 + w.strong * 0.28 + w.medium * 0.08;
    if (board.highBoard || board.broadwayCount >= 2) score += w.premium * 0.18 + w.strong * 0.08;
    if (board.lowBoard && board.connected) score += w.speculative * 0.24 + w.medium * 0.08;
    if (board.monotone) score += w.speculative * 0.12 + w.strong * 0.06;
    if (board.paired) score += w.premium * 0.1;
    return clamp(score, 0.03, 0.95);
  }

  function heroPlayer() {
    return (state?.players || []).find(candidate => candidate?.isHuman) || state?.players?.[0] || null;
  }

  function streetAggressions(street, actor = "") {
    return (window.AiActionMemory?.actions?.(street) || []).filter(event => (
      AGGRESSIVE_ACTIONS.has(event.action) && (!actor || event.actor === actor)
    ));
  }

  function actorStreetActions(playerOrName, street) {
    return window.AiActionMemory?.actorActions?.(playerOrName, street) || [];
  }

  function publicContext(player, decision = {}) {
    const actorRange = rangeProfile(player);
    const hero = heroPlayer();
    const heroRange = rangeProfile(hero || "");
    const board = boardProfile();
    const actorBoard = rangeBoardScore(actorRange, board);
    const heroBoard = rangeBoardScore(heroRange, board);
    const actorNut = nutBoardScore(actorRange, board);
    const heroNut = nutBoardScore(heroRange, board);
    const street = decision?.context?.street || window.AiActionMemory?.streetKey?.() || "preflop";
    const actor = player?.name || "";
    const preflopAggressor = preflopActions().filter(event => AGGRESSIVE_ACTIONS.has(event.action)).at(-1)?.actor || "";
    const actorIsAggressor = preflopAggressor === actor;
    const flopOwn = actorStreetActions(player, "flop");
    const turnOwn = actorStreetActions(player, "turn");
    const riverOwn = actorStreetActions(player, "river");
    const flopAggressions = streetAggressions("flop");
    const turnAggressions = streetAggressions("turn");
    const aggressorFlopActions = preflopAggressor ? actorStreetActions(preflopAggressor, "flop") : [];
    const actorHasActed = actorStreetActions(player, street).length > 0;
    const needed = Number(decision?.context?.needed) || 0;
    const canLead = needed === 0 && !actorHasActed;
    const activeOpponents = Number(decision?.context?.activeOpponents) || 1;
    const multiwayPenalty = Math.max(0, activeOpponents - 1) * 0.045;
    const rangeAdvantage = clamp(actorBoard - heroBoard - multiwayPenalty, -0.45, 0.45);
    const nutAdvantage = clamp(actorNut - heroNut - multiwayPenalty * 0.5, -0.4, 0.4);
    const flopCheckedByActor = flopOwn.some(event => event.action === "check");
    const flopBetByActor = flopOwn.some(event => AGGRESSIVE_ACTIONS.has(event.action));
    const turnBetByActor = turnOwn.some(event => AGGRESSIVE_ACTIONS.has(event.action));
    const aggressorCheckedFlop = aggressorFlopActions.some(event => event.action === "check")
      && !aggressorFlopActions.some(event => AGGRESSIVE_ACTIONS.has(event.action));

    return {
      street,
      actorRange,
      heroRange,
      board,
      preflopAggressor,
      actorIsAggressor,
      initiative: actorIsAggressor ? "aggressor" : (actorRange.role === "unopened" ? "neutral" : "caller"),
      rangeAdvantage,
      nutAdvantage,
      actorBoardScore: actorBoard,
      heroBoardScore: heroBoard,
      cbetOpportunity: street === "flop" && actorIsAggressor && canLead,
      delayedCbetOpportunity: street === "turn" && actorIsAggressor && canLead && flopCheckedByActor && !flopBetByActor,
      doubleBarrelOpportunity: street === "turn" && actorIsAggressor && canLead && flopBetByActor,
      tripleBarrelOpportunity: street === "river" && actorIsAggressor && canLead && flopBetByActor && turnBetByActor,
      probeOpportunity: street === "turn" && !actorIsAggressor && canLead && Boolean(preflopAggressor) && aggressorCheckedFlop && flopAggressions.length === 0,
      donkOpportunity: street === "flop" && !actorIsAggressor && canLead && Boolean(preflopAggressor)
        && actor !== preflopAggressor && aggressorFlopActions.length === 0,
      checkedBackFlop: flopAggressions.length === 0 && flopOwn.some(event => event.action === "check"),
      flopBetByActor,
      turnBetByActor,
      riverBetByActor: riverOwn.some(event => AGGRESSIVE_ACTIONS.has(event.action)),
      publicActions: {
        preflop: preflopActions().map(event => ({ actor: event.actor, action: event.action, amount: event.amount, bet: event.bet })),
        flopAggressions: flopAggressions.map(event => ({ actor: event.actor, action: event.action, amount: event.amount })),
        turnAggressions: turnAggressions.map(event => ({ actor: event.actor, action: event.action, amount: event.amount })),
      },
    };
  }

  window.AiRangeContinuation = {
    version: VERSION,
    supportedNames: [...SUPPORTED_NAMES],
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicPositions: true,
      publicActions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    supports: name => SUPPORTED_NAMES.includes(name),
    roleFor,
    rangeProfile,
    boardProfile,
    publicContext,
  };
})();
