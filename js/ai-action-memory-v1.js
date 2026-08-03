// Public action memory for AI multi-street planning.
(() => {
  "use strict";

  if (window.AiActionMemory?.version) return;

  const VERSION = "1.0.0";
  const STREET_KEYS = ["preflop", "flop", "turn", "river"];
  let installTimer = 0;
  let installAttempts = 0;

  function hasState() {
    return typeof state !== "undefined" && Boolean(state);
  }

  function streetKey() {
    if (!hasState()) return "preflop";
    const count = state?.board?.length || 0;
    if (count >= 5) return "river";
    if (count === 4) return "turn";
    if (count >= 3) return "flop";
    return "preflop";
  }

  function emptyMemory(handNumber = null) {
    const resolvedHandNumber = handNumber == null
      ? (hasState() ? Number(state.handNumber) || 0 : 0)
      : Number(handNumber) || 0;
    return {
      version: VERSION,
      handNumber: resolvedHandNumber,
      sequence: 0,
      streets: Object.fromEntries(STREET_KEYS.map(key => [key, []])),
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
    if (key.includes("fold") || key.includes("棄牌")) return "fold";
    if (key.includes("all-in raise")) return "allin-raise";
    if (key.includes("all-in call")) return "allin-call";
    if (key.includes("all-in")) return player?.bet > Number(hasState() ? state.currentBet : 0) ? "allin-raise" : "allin-call";
    if (key.includes("raise") || key.includes("加注")) return "raise";
    if (key.includes("check") || key.includes("過牌")) return "check";
    if (key.includes("call") || key.includes("跟注")) return "call";
    return key || "unknown";
  }

  function recordAction(player, action, amount = 0, note = "") {
    if (!player || !hasState()) return null;
    const memory = ensureMemory();
    const street = streetKey();
    const event = {
      sequence: ++memory.sequence,
      handNumber: memory.handNumber,
      street,
      actor: player.name || "",
      position: Number(player.position) || 0,
      isHuman: Boolean(player.isHuman),
      action: normalizeAction(action, player),
      amount: Math.max(0, Number(amount) || 0),
      bet: Math.max(0, Number(player.bet) || 0),
      pot: Math.max(0, Number(state.pot) || 0),
      currentBet: Math.max(0, Number(state.currentBet) || 0),
      note: String(note || ""),
    };
    memory.streets[street].push(event);
    return event;
  }

  function actions(street = streetKey()) {
    return [...(ensureMemory().streets[street] || [])];
  }

  function actorActions(playerOrName, street = streetKey()) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    return actions(street).filter(event => event.actor === name);
  }

  function latestAction(playerOrName, street = streetKey()) {
    return actorActions(playerOrName, street).at(-1) || null;
  }

  function latestAggression(street = streetKey()) {
    return actions(street).filter(event => ["raise", "allin-raise"].includes(event.action)).at(-1) || null;
  }

  function checkedThenFacedAggression(playerOrName, street = streetKey()) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    const list = actions(street);
    const ownCheck = [...list].reverse().find(event => event.actor === name && event.action === "check");
    if (!ownCheck) return { ready: false, ownCheck: null, aggression: null };
    const aggression = list.find(event => (
      event.sequence > ownCheck.sequence
      && event.actor !== name
      && ["raise", "allin-raise"].includes(event.action)
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
      raised: own.some(event => ["raise", "allin-raise"].includes(event.action)),
      checkRaiseReady: checkRaise.ready,
      facedAggression: checkRaise.aggression,
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
    fairInformationPolicy: Object.freeze({
      publicActionsOnly: true,
      hiddenCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
    }),
    streetKey,
    ensureMemory,
    reset,
    recordAction,
    actions,
    actorActions,
    latestAction,
    latestAggression,
    checkedThenFacedAggression,
    playerStreetSummary,
    refresh,
  };

  refresh();
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
