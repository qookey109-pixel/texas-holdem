// Shared public-information tournament observation memory for late-arriving AI and Gemini.
(() => {
  "use strict";

  if (window.TournamentObservationMemory?.version) return;

  const VERSION = "1.0.0";
  const STORE_VERSION = 1;
  const MAX_RECENT_EVENTS = 16;
  const MAX_REVEALED_SHOWDOWNS = 8;
  const MAX_POSITION_PROFILES = 8;
  const DECISION_PATH = /\/v1\/decision(?:$|[?#])/;

  let installTimer = 0;
  let installAttempts = 0;
  let originalFetch = null;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function finite(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function integer(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    return Math.round(clamp(finite(value), minimum, maximum));
  }

  function rate(value) {
    return Math.round(clamp(value, 0, 1) * 1000) / 1000;
  }

  function hasState() {
    return typeof state !== "undefined" && Boolean(state);
  }

  function currentHandNumber() {
    return integer(hasState() ? state.handNumber : 0);
  }

  function currentMode() {
    return String(hasState() ? state.gameMode || "normal" : "normal");
  }

  function freshStore() {
    return {
      version: STORE_VERSION,
      mode: currentMode(),
      lastHandNumber: currentHandNumber(),
      arrivals: {},
    };
  }

  function ensureStore() {
    if (!hasState()) return freshStore();
    const handNumber = currentHandNumber();
    const mode = currentMode();
    const current = state.tournamentObservationMemoryV1;
    if (
      !current
      || current.version !== STORE_VERSION
      || handNumber < integer(current.lastHandNumber)
      || current.mode !== mode
    ) {
      state.tournamentObservationMemoryV1 = freshStore();
    }
    state.tournamentObservationMemoryV1.lastHandNumber = handNumber;
    return state.tournamentObservationMemoryV1;
  }

  function tierForName(name) {
    const tier = window.AiTierBossSystem?.tierForName?.(name);
    if (tier?.key) return tier.key;
    if (["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"].includes(name)) return "middle";
    if (["Nova", "Unit-9", "Merlin", "Vlad"].includes(name)) return "elite";
    if (["Oracle", "Chronos"].includes(name)) return "special";
    if (name === "Gemini") return "gemini";
    return "opening";
  }

  function modelSnapshot() {
    try {
      return window.AiPlayerModel?.ensureModel?.() || null;
    } catch (error) {
      return null;
    }
  }

  function registerCurrentPlayers() {
    if (!hasState()) return {};
    const store = ensureStore();
    const handNumber = currentHandNumber();
    const observedBeforeArrival = Math.max(0, handNumber - 1);

    for (const player of state.players || []) {
      if (!player || player.isHuman || !player.name) continue;
      if (!store.arrivals[player.name]) {
        store.arrivals[player.name] = {
          arrivalHand: handNumber,
          observedHandsBeforeArrival: observedBeforeArrival,
          tier: tierForName(player.name),
        };
      }
      player.publicObservationMemory = {
        version: VERSION,
        ...store.arrivals[player.name],
      };
    }
    return store.arrivals;
  }

  function arrivalForName(name) {
    registerCurrentPlayers();
    const store = ensureStore();
    return store.arrivals[String(name || "")] || {
      arrivalHand: currentHandNumber(),
      observedHandsBeforeArrival: Math.max(0, currentHandNumber() - 1),
      tier: tierForName(String(name || "")),
    };
  }

  function bucketSummary(bucket) {
    const profile = window.AiPlayerModel?.bucketProfile?.(bucket || {}) || {};
    return {
      actions: integer(profile.actions),
      pressureSamples: integer(profile.pressureSample),
      checkedPressureSamples: integer(profile.checkedPressureSample),
      aggressionRate: rate(profile.aggressionRate),
      foldToPressure: rate(profile.foldToPressure),
      callVsPressure: rate(profile.callVsPressure),
      raiseVsPressure: rate(profile.raiseVsPressure),
      checkFoldRate: rate(profile.checkFoldRate),
      checkRaiseRate: rate(profile.checkRaiseRate),
      smallBetRate: rate(profile.smallBetRate),
      largeBetRate: rate(profile.largeBetRate),
      openRate: rate(profile.openRate),
      threeBetRate: rate(profile.threeBetRate),
      fourBetRate: rate(profile.fourBetRate),
      limpRate: rate(profile.limpRate),
      confidence: rate(profile.confidence),
    };
  }

  function streetProfiles(model) {
    const keys = ["preflop", "flop", "turn", "river"];
    return Object.fromEntries(keys.map(key => [key, bucketSummary(model?.byStreet?.[key])]));
  }

  function positionProfiles(model) {
    return Object.entries(model?.byPosition || {})
      .map(([position, bucket]) => ({ position, ...bucketSummary(bucket) }))
      .sort((left, right) => right.actions - left.actions)
      .slice(0, MAX_POSITION_PROFILES);
  }

  function recentPublicEvents(model) {
    return (model?.recent || []).slice(-MAX_RECENT_EVENTS).map(event => ({
      handNumber: integer(event.handNumber),
      street: String(event.street || "preflop"),
      position: String(event.position || "--"),
      action: String(event.action || ""),
      sizeFraction: Math.round(clamp(event.sizeFraction, 0, 5) * 100) / 100,
      facedAggression: Boolean(event.facedAggression),
      checkedBefore: Boolean(event.checkedBefore),
      priorRaises: integer(event.priorRaises),
    }));
  }

  function sessionSummary() {
    const stats = hasState() ? state.heroStyle || {} : {};
    const hands = Math.max(1, integer(stats.hands));
    return {
      hands: integer(stats.hands),
      vpipRate: rate(finite(stats.vpip) / hands),
      foldRate: rate(finite(stats.folds) / hands),
      callRate: rate(finite(stats.calls) / hands),
      raiseRate: rate(finite(stats.raises) / hands),
      checkRate: rate(finite(stats.checks) / hands),
      allInRate: rate(finite(stats.allIns) / hands),
      showdownRate: rate(finite(stats.showdowns) / hands),
      winRate: rate(finite(stats.wins) / hands),
    };
  }

  function repeatedAllInSummary() {
    try {
      const profile = window.AiRepeatedAllInCounterV1?.recentProfile?.(currentHandNumber());
      if (!profile) return null;
      return {
        windowHands: integer(profile.windowHands),
        observedHands: integer(profile.observedHands),
        jamHands: integer(profile.jamHands),
        weightedJamRate: rate(profile.weightedJamRate),
        consecutiveJams: integer(profile.consecutiveJams),
        publicJamEvents: (profile.entries || []).slice(-12).map(entry => ({
          handNumber: integer(entry.handNumber),
          evidence: rate(entry.evidence),
          riskInBigBlinds: Math.round(clamp(entry.riskInBigBlinds, 0, 500) * 10) / 10,
          openJam: Boolean(entry.openJam),
          priorRaises: integer(entry.priorRaises),
        })),
      };
    } catch (error) {
      return null;
    }
  }

  function revealedShowdownSummary() {
    try {
      const model = window.FairSpecialBosses?.publicShowdownModel?.();
      const samples = Array.isArray(model?.samples) ? model.samples : [];
      const bucketCounts = {};
      for (const sample of samples) {
        const bucket = String(sample?.bucket || "medium");
        bucketCounts[bucket] = integer(bucketCounts[bucket]) + 1;
      }
      return {
        samples: samples.length,
        bucketCounts,
        recent: samples.slice(-MAX_REVEALED_SHOWDOWNS).map(sample => ({
          handNumber: integer(sample.handNumber),
          bucket: String(sample.bucket || "medium"),
          position: String(sample.position || "--"),
          raised: Boolean(sample.raised),
          called: Boolean(sample.called),
          checked: Boolean(sample.checked),
          allIn: Boolean(sample.allIn),
          revealedCards: (sample.cards || []).slice(0, 2).map(card => ({
            value: integer(card?.value, 2, 14),
            suit: String(card?.suit || ""),
          })),
        })),
      };
    } catch (error) {
      return { samples: 0, bucketCounts: {}, recent: [] };
    }
  }

  function tournamentSummary() {
    const tournament = hasState() ? state.tournament || {} : {};
    return {
      mode: currentMode(),
      handNumber: currentHandNumber(),
      blindLevel: integer(state?.blindLevel?.level || state?.blindLevel),
      appeared: Array.isArray(tournament.appeared) ? tournament.appeared.map(String).slice(0, 24) : [],
      eliminated: Array.isArray(tournament.eliminated) ? tournament.eliminated.map(String).slice(0, 24) : [],
      queueRemaining: Array.isArray(tournament.queue) ? tournament.queue.length : 0,
      finished: Boolean(tournament.finished),
    };
  }

  function buildSummary(options = {}) {
    registerCurrentPlayers();
    const model = modelSnapshot();
    const playerName = String(options.playerName || options.player?.name || "");
    const arrival = playerName ? arrivalForName(playerName) : null;
    return {
      schemaVersion: 1,
      strategyVersion: VERSION,
      scope: "shared-public-tournament-observation",
      actor: playerName || null,
      actorArrival: arrival,
      tournament: tournamentSummary(),
      playerModel: {
        handsObserved: integer(model?.handsObserved),
        actionsObserved: integer(model?.actionsObserved),
        byStreet: streetProfiles(model),
        byPosition: positionProfiles(model),
        recentPublicEvents: recentPublicEvents(model),
      },
      heroSession: sessionSummary(),
      repeatedPreflopAllIn: repeatedAllInSummary(),
      revealedShowdowns: revealedShowdownSummary(),
      guidance: "Use only as public historical evidence. Do not infer certainty about current hidden cards, deck order, or future board cards.",
    };
  }

  function looksLikeGeminiDecisionRequest(request) {
    return Boolean(
      request
      && typeof request === "object"
      && Array.isArray(request.legalActions)
      && Array.isArray(request.players)
      && request.players.some(player => player?.name === "Gemini")
      && Array.isArray(request.holeCards)
      && Array.isArray(request.board)
    );
  }

  function augmentDecisionRequest(request, player = null) {
    if (!looksLikeGeminiDecisionRequest(request)) return request;
    return {
      ...request,
      tournamentObservation: buildSummary({ playerName: player?.name || "Gemini" }),
    };
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return String(input?.url || "");
  }

  function installFetchBridge() {
    if (window.__tournamentObservationFetchBridgeInstalled) return true;
    if (typeof window.fetch !== "function") return false;
    originalFetch = window.fetch.bind(window);
    window.fetch = function fetchWithTournamentObservation(input, init = {}) {
      const url = requestUrl(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (!DECISION_PATH.test(url) || method !== "POST" || typeof init?.body !== "string") {
        return originalFetch(input, init);
      }

      try {
        const parsed = JSON.parse(init.body);
        const augmented = augmentDecisionRequest(parsed);
        if (augmented !== parsed) {
          return originalFetch(input, { ...init, body: JSON.stringify(augmented) });
        }
      } catch (error) {
        // Preserve the original request when its body is not JSON or cannot be augmented safely.
      }
      return originalFetch(input, init);
    };
    window.__tournamentObservationFetchBridgeInstalled = true;
    return true;
  }

  function installDebugBuilderBridge() {
    if (window.__tournamentObservationGeminiBuilderInstalled) return true;
    const client = window.GeminiBackendClient;
    if (!client?.buildDecisionRequest) return false;
    const previousBuilder = client.buildDecisionRequest.bind(client);
    client.buildDecisionRequest = player => augmentDecisionRequest(previousBuilder(player), player);
    window.__tournamentObservationGeminiBuilderInstalled = true;
    return true;
  }

  function installStartHandHook() {
    if (window.__tournamentObservationStartHandInstalled) return true;
    if (typeof startHand !== "function") return false;
    const previousStartHand = startHand;
    startHand = function startHandWithSharedObservationMemory(...args) {
      const result = previousStartHand.apply(this, args);
      registerCurrentPlayers();
      return result;
    };
    window.__tournamentObservationStartHandInstalled = true;
    return true;
  }

  function refresh() {
    registerCurrentPlayers();
    const ready = installFetchBridge() && installDebugBuilderBridge() && installStartHandHook();
    installAttempts += 1;
    if (ready || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return ready;
  }

  window.TournamentObservationMemory = {
    version: VERSION,
    limits: Object.freeze({
      recentPublicEvents: MAX_RECENT_EVENTS,
      revealedShowdowns: MAX_REVEALED_SHOWDOWNS,
      positionProfiles: MAX_POSITION_PROFILES,
    }),
    fairInformationPolicy: Object.freeze({
      publicActionsOnly: true,
      publicPositions: true,
      publicBetSizes: true,
      revealedShowdownsOnly: true,
      aggregateTournamentState: true,
      hiddenOpponentCards: false,
      currentHeroHoleCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    ensureStore,
    registerCurrentPlayers,
    arrivalForName,
    buildSummary,
    augmentDecisionRequest,
    refresh,
    status() {
      const store = ensureStore();
      return {
        version: VERSION,
        fetchBridgeInstalled: Boolean(window.__tournamentObservationFetchBridgeInstalled),
        geminiBuilderInstalled: Boolean(window.__tournamentObservationGeminiBuilderInstalled),
        startHandHookInstalled: Boolean(window.__tournamentObservationStartHandInstalled),
        arrivalCount: Object.keys(store.arrivals || {}).length,
      };
    },
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
