// Public action history for AI multi-street planning.
(() => {
  "use strict";

  if (window.AiActionMemory?.version) return;

  const VERSION = "1.1.0";
  const SCHEMA_VERSION = "2.2.0";
  const STREET_KEYS = ["preflop", "flop", "turn", "river"];
  const AGGRESSIVE_ACTIONS = new Set(["raise", "allin-raise"]);
  const FORCED_ACTIONS = new Set(["small-blind", "big-blind"]);
  let installTimer = 0;
  let installAttempts = 0;

  function hasState() {
    return typeof state !== "undefined" && Boolean(state);
  }

  function clampNonNegative(value) {
    return Math.max(0, Number(value) || 0);
  }

  function streetKey() {
    if (!hasState()) return "preflop";
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function emptyStreetState() {
    return {
      actionCount: 0,
      currentBet: 0,
      actorBets: Object.create(null),
    };
  }

  function emptyMemory(handNumber = null) {
    const resolvedHandNumber = handNumber == null
      ? (hasState() ? Number(state.handNumber) || 0 : 0)
      : Number(handNumber) || 0;
    return {
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      handNumber: resolvedHandNumber,
      sequence: 0,
      streets: Object.fromEntries(STREET_KEYS.map(key => [key, []])),
      streetState: Object.fromEntries(STREET_KEYS.map(key => [key, emptyStreetState()])),
      publicInformationOnly: true,
    };
  }

  function ensureMemory() {
    if (!hasState()) return emptyMemory();
    if (!state.aiActionMemory || state.aiActionMemory.handNumber !== Number(state.handNumber || 0)) {
      state.aiActionMemory = emptyMemory();
    }
    return state.aiActionMemory;
  }

  function reset(handNumber = null) {
    if (!hasState()) return emptyMemory(handNumber);
    const resolvedHandNumber = handNumber == null ? Number(state.handNumber) || 0 : handNumber;
    state.aiActionMemory = emptyMemory(resolvedHandNumber);
    return state.aiActionMemory;
  }

  function normalizeAction(action, player) {
    const key = String(action || "").toLowerCase();
    if (key.includes("小盲") || key.includes("small blind") || key === "sb") return "small-blind";
    if (key.includes("大盲") || key.includes("big blind") || key === "bb") return "big-blind";
    if (key.includes("fold") || key.includes("棄牌")) return "fold";
    if (key.includes("all-in raise")) return "allin-raise";
    if (key.includes("all-in call")) return "allin-call";
    if (key.includes("all-in")) {
      const trackedCurrentBet = ensureMemory().streetState[streetKey()]?.currentBet || 0;
      return clampNonNegative(player?.bet) > trackedCurrentBet ? "allin-raise" : "allin-call";
    }
    if (key.includes("raise") || key.includes("加注")) return "raise";
    if (key.includes("check") || key.includes("過牌")) return "check";
    if (key.includes("call") || key.includes("跟注")) return "call";
    return key || "unknown";
  }

  function actorKey(player) {
    return `${Number(player?.position) || 0}:${String(player?.name || "")}`;
  }

  function publicPositionLabel(player) {
    try {
      if (typeof positionLabel === "function") return String(positionLabel(player) || "");
    } catch (error) {
      // Fall through to a stable public seat label.
    }
    return `Seat ${Number(player?.position) || 0}`;
  }

  function publicBoardSnapshot() {
    if (!hasState()) return [];
    return (state?.board || []).map(card => ({
      value: Number(card?.value) || 0,
      suit: String(card?.suit || ""),
    }));
  }

  function activePlayerCount() {
    if (!hasState()) return 0;
    return (state?.players || []).filter(player => !player?.folded).length;
  }

  function contributionFor(action, rawAmount, betTo, previousActorBet) {
    if (["fold", "check"].includes(action)) return 0;
    if (["call", "allin-call", "small-blind", "big-blind"].includes(action)) {
      return clampNonNegative(rawAmount);
    }
    if (AGGRESSIVE_ACTIONS.has(action)) return Math.max(0, betTo - previousActorBet);
    return Math.max(0, betTo - previousActorBet);
  }

  function recordAction(player, action, amount = 0, note = "") {
    if (!player || !hasState()) return null;
    const memory = ensureMemory();
    const street = streetKey();
    const streetState = memory.streetState[street] || (memory.streetState[street] = emptyStreetState());
    const normalizedAction = normalizeAction(action, player);
    const key = actorKey(player);
    const previousActorBet = clampNonNegative(streetState.actorBets[key]);
    const currentBetBefore = clampNonNegative(streetState.currentBet);
    const betTo = clampNonNegative(player.bet);
    const rawAmount = clampNonNegative(amount);
    const contribution = contributionFor(normalizedAction, rawAmount, betTo, previousActorBet);
    const potAfter = clampNonNegative(state.pot);
    const potBefore = Math.max(0, potAfter - contribution);
    const currentBetAfter = Math.max(
      currentBetBefore,
      clampNonNegative(state.currentBet),
      FORCED_ACTIONS.has(normalizedAction) ? betTo : 0,
    );
    const amountToCallBefore = Math.max(0, currentBetBefore - previousActorBet);
    const raiseBy = AGGRESSIVE_ACTIONS.has(normalizedAction)
      ? Math.max(0, betTo - currentBetBefore)
      : 0;
    const activePlayers = activePlayerCount();

    const event = {
      sequence: ++memory.sequence,
      streetActionIndex: ++streetState.actionCount,
      handNumber: memory.handNumber,
      street,
      actor: String(player.name || ""),
      actorKey: key,
      seatIndex: Number(player.position) || 0,
      positionLabel: publicPositionLabel(player),
      isHuman: Boolean(player.isHuman),
      action: normalizedAction,
      isAggressive: AGGRESSIVE_ACTIONS.has(normalizedAction),
      isForcedBet: FORCED_ACTIONS.has(normalizedAction),
      isAllIn: Boolean(player.allIn) || normalizedAction.startsWith("allin-"),
      amount: rawAmount,
      contribution,
      previousActorBet,
      betTo,
      amountToCallBefore,
      raiseBy,
      currentBetBefore,
      currentBetAfter,
      potBefore,
      potAfter,
      contributionPotFraction: potBefore > 0 ? contribution / potBefore : 0,
      raiseByPotFraction: potBefore > 0 ? raiseBy / potBefore : 0,
      activePlayerCount: activePlayers,
      activeOpponentCount: Math.max(0, activePlayers - 1),
      board: publicBoardSnapshot(),
      note: String(note || ""),
      publicInformationOnly: true,
    };

    streetState.actorBets[key] = betTo;
    streetState.currentBet = currentBetAfter;
    memory.streets[street].push(event);
    return event;
  }

  function actions(street = streetKey()) {
    return [...(ensureMemory().streets[street] || [])];
  }

  function allActions() {
    const memory = ensureMemory();
    return STREET_KEYS.flatMap(street => memory.streets[street] || [])
      .sort((left, right) => left.sequence - right.sequence);
  }

  function actorActions(playerOrName, street = streetKey()) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    return actions(street).filter(event => event.actor === name);
  }

  function actorLine(playerOrName) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    return allActions().filter(event => event.actor === name);
  }

  function latestAction(playerOrName, street = streetKey()) {
    return actorActions(playerOrName, street).at(-1) || null;
  }

  function latestAggression(street = streetKey()) {
    return actions(street).filter(event => AGGRESSIVE_ACTIONS.has(event.action)).at(-1) || null;
  }

  function checkedThenFacedAggression(playerOrName, street = streetKey()) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    const list = actions(street);
    const ownCheck = [...list].reverse().find(event => event.actor === name && event.action === "check");
    if (!ownCheck) return { ready: false, ownCheck: null, aggression: null };
    const aggression = list.find(event => (
      event.sequence > ownCheck.sequence
      && event.actor !== name
      && AGGRESSIVE_ACTIONS.has(event.action)
    ));
    return { ready: Boolean(aggression), ownCheck, aggression: aggression || null };
  }

  function playerStreetSummary(playerOrName, street = streetKey()) {
    const own = actorActions(playerOrName, street);
    const checkRaise = checkedThenFacedAggression(playerOrName, street);
    return {
      actions: own,
      actionCount: own.length,
      lastAction: own.at(-1)?.action || "",
      checked: own.some(event => event.action === "check"),
      raised: own.some(event => AGGRESSIVE_ACTIONS.has(event.action)),
      checkRaiseReady: checkRaise.ready,
      facedAggression: checkRaise.aggression,
    };
  }

  function streetSummary(street = streetKey()) {
    const list = actions(street);
    return {
      street,
      actionCount: list.length,
      aggressiveActionCount: list.filter(event => event.isAggressive).length,
      forcedBetCount: list.filter(event => event.isForcedBet).length,
      actors: [...new Set(list.map(event => event.actor))],
      finalPot: list.at(-1)?.potAfter || 0,
      finalCurrentBet: list.at(-1)?.currentBetAfter || 0,
    };
  }

  function snapshot() {
    const memory = ensureMemory();
    return {
      version: memory.version,
      schemaVersion: memory.schemaVersion,
      handNumber: memory.handNumber,
      sequence: memory.sequence,
      streets: Object.fromEntries(STREET_KEYS.map(street => [street, actions(street)])),
      publicInformationOnly: true,
    };
  }

  function installHooks() {
    let changed = false;

    if (!window.__aiActionMemoryLogInstalled && typeof logAction === "function") {
      const originalLogAction = logAction;
      logAction = function logActionWithAiMemory(player, action, amount = 0, note = "") {
        const result = originalLogAction.apply(this, arguments);
        recordAction(player, action, amount, note);
        return result;
      };
      window.__aiActionMemoryLogInstalled = true;
      changed = true;
    }

    if (!window.__aiActionMemoryBlindInstalled && typeof postBlind === "function") {
      const originalPostBlind = postBlind;
      postBlind = function postBlindWithAiMemory(player, amount, label) {
        const beforeBet = clampNonNegative(player?.bet);
        const result = originalPostBlind.apply(this, arguments);
        const paid = Math.max(0, clampNonNegative(player?.bet) - beforeBet);
        recordAction(player, label, paid, "forced-bet");
        return result;
      };
      window.__aiActionMemoryBlindInstalled = true;
      changed = true;
    }

    if (!window.__aiActionMemoryStartHandInstalled && typeof startHand === "function") {
      const originalStartHand = startHand;
      startHand = function startHandWithAiMemory(...args) {
        reset((Number(state?.handNumber) || 0) + 1);
        const result = originalStartHand.apply(this, args);
        ensureMemory();
        return result;
      };
      window.__aiActionMemoryStartHandInstalled = true;
      changed = true;
    }

    return changed || (
      Boolean(window.__aiActionMemoryLogInstalled)
      && Boolean(window.__aiActionMemoryBlindInstalled)
      && Boolean(window.__aiActionMemoryStartHandInstalled)
    );
  }

  function refresh() {
    ensureMemory();
    const ready = installHooks();
    if (ready || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return ready;
  }

  window.AiActionMemory = {
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    fairInformationPolicy: Object.freeze({
      publicActionsOnly: true,
      publicPositions: true,
      publicBetSizes: true,
      publicBoardAtActionTime: true,
      hiddenCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    streetKey,
    ensureMemory,
    reset,
    recordAction,
    actions,
    allActions,
    actorActions,
    actorLine,
    latestAction,
    latestAggression,
    checkedThenFacedAggression,
    playerStreetSummary,
    streetSummary,
    snapshot,
    refresh,
  };

  refresh();
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
