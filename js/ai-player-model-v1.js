// Street-specific public player model for adaptive AI exploitation.
(() => {
  "use strict";

  if (window.AiPlayerModel?.version) return;

  const VERSION = "1.0.0";
  const STREET_KEYS = ["preflop", "flop", "turn", "river"];
  const AGGRESSIVE_ACTIONS = new Set(["raise", "allin-raise"]);
  const MAX_RECENT_EVENTS = 120;
  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function hasState() {
    return typeof state !== "undefined" && Boolean(state);
  }

  function emptyBucket() {
    return {
      actions: 0,
      folds: 0,
      calls: 0,
      checks: 0,
      raises: 0,
      allIns: 0,
      facedAggression: 0,
      foldsToAggression: 0,
      callsVsAggression: 0,
      raisesVsAggression: 0,
      checkedThenFacedAggression: 0,
      checkFolds: 0,
      checkCalls: 0,
      checkRaises: 0,
      smallBets: 0,
      mediumBets: 0,
      largeBets: 0,
      overbets: 0,
      opens: 0,
      threeBets: 0,
      fourBets: 0,
      limps: 0,
    };
  }

  function emptyModel() {
    return {
      version: VERSION,
      handsObserved: 0,
      actionsObserved: 0,
      currentHandNumber: 0,
      byStreet: Object.fromEntries(STREET_KEYS.map(street => [street, emptyBucket()])),
      byPosition: {},
      recent: [],
    };
  }

  function ensureModel() {
    if (!hasState()) return emptyModel();
    if (!state.aiPlayerModel || state.aiPlayerModel.version !== VERSION) {
      state.aiPlayerModel = emptyModel();
    }
    return state.aiPlayerModel;
  }

  function reset() {
    if (!hasState()) return emptyModel();
    state.aiPlayerModel = emptyModel();
    return state.aiPlayerModel;
  }

  function beginHand(handNumber = null) {
    const model = ensureModel();
    const resolved = handNumber == null
      ? Math.max(0, Number(hasState() ? state.handNumber : 0) || 0)
      : Math.max(0, Number(handNumber) || 0);
    if (resolved > 0 && model.currentHandNumber !== resolved) {
      model.currentHandNumber = resolved;
      model.handsObserved += 1;
    }
    return model;
  }

  function normalizeAction(action) {
    const key = String(action || "").toLowerCase();
    if (key.includes("fold") || key.includes("棄牌")) return "fold";
    if (key.includes("all-in raise")) return "allin-raise";
    if (key.includes("all-in call")) return "allin-call";
    if (key.includes("all-in") || key.includes("allin")) return "allin";
    if (key.includes("raise") || key.includes("加注")) return "raise";
    if (key.includes("check") || key.includes("過牌")) return "check";
    if (key.includes("call") || key.includes("跟注")) return "call";
    return key || "unknown";
  }

  function normalizeStreet(street) {
    const key = String(street || "").toLowerCase();
    return STREET_KEYS.includes(key) ? key : "preflop";
  }

  function normalizePosition(position) {
    const key = String(position || "--").trim();
    return key || "--";
  }

  function sizeBucket(sizeFraction) {
    const value = Math.max(0, Number(sizeFraction) || 0);
    if (value <= 0.36) return "smallBets";
    if (value <= 0.76) return "mediumBets";
    if (value <= 1.16) return "largeBets";
    return "overbets";
  }

  function getPositionBucket(model, position) {
    const key = normalizePosition(position);
    if (!model.byPosition[key]) model.byPosition[key] = emptyBucket();
    return model.byPosition[key];
  }

  function updateBucket(bucket, sample) {
    bucket.actions += 1;
    if (sample.action === "fold") bucket.folds += 1;
    if (sample.action === "call" || sample.action === "allin-call") bucket.calls += 1;
    if (sample.action === "check") bucket.checks += 1;
    if (sample.action === "raise" || sample.action === "allin-raise") bucket.raises += 1;
    if (sample.action.startsWith("allin")) bucket.allIns += 1;

    if (sample.facedAggression) {
      bucket.facedAggression += 1;
      if (sample.action === "fold") bucket.foldsToAggression += 1;
      if (sample.action === "call" || sample.action === "allin-call") bucket.callsVsAggression += 1;
      if (sample.action === "raise" || sample.action === "allin-raise") bucket.raisesVsAggression += 1;
    }

    if (sample.checkedBefore && sample.facedAggression) {
      bucket.checkedThenFacedAggression += 1;
      if (sample.action === "fold") bucket.checkFolds += 1;
      if (sample.action === "call" || sample.action === "allin-call") bucket.checkCalls += 1;
      if (sample.action === "raise" || sample.action === "allin-raise") bucket.checkRaises += 1;
    }

    if (sample.action === "raise" || sample.action === "allin-raise") {
      bucket[sizeBucket(sample.sizeFraction)] += 1;
      if (sample.street === "preflop") {
        if (sample.priorRaises <= 0) bucket.opens += 1;
        else if (sample.priorRaises === 1) bucket.threeBets += 1;
        else bucket.fourBets += 1;
      }
    }

    if (sample.street === "preflop" && sample.action === "call" && sample.priorRaises <= 0) {
      bucket.limps += 1;
    }
  }

  function sanitizeSample(input = {}) {
    const street = normalizeStreet(input.street);
    const action = normalizeAction(input.action);
    const amount = Math.max(0, Number(input.amount) || 0);
    const potBefore = Math.max(1, Number(input.potBefore) || 1);
    return {
      handNumber: Math.max(0, Number(input.handNumber) || 0),
      street,
      position: normalizePosition(input.position),
      action,
      amount,
      potBefore,
      sizeFraction: clamp(input.sizeFraction == null ? amount / potBefore : input.sizeFraction, 0, 5),
      facedAggression: Boolean(input.facedAggression),
      checkedBefore: Boolean(input.checkedBefore),
      priorRaises: Math.max(0, Number(input.priorRaises) || 0),
    };
  }

  function observePublicEvent(input = {}) {
    const sample = sanitizeSample(input);
    if (!STREET_KEYS.includes(sample.street)) return null;
    if (!["fold", "call", "check", "raise", "allin", "allin-call", "allin-raise"].includes(sample.action)) return null;

    const model = beginHand(sample.handNumber);
    updateBucket(model.byStreet[sample.street], sample);
    updateBucket(getPositionBucket(model, sample.position), sample);
    model.actionsObserved += 1;
    model.recent.push(sample);
    if (model.recent.length > MAX_RECENT_EVENTS) model.recent.splice(0, model.recent.length - MAX_RECENT_EVENTS);
    return sample;
  }

  function latestPublicContext(player, action, amount) {
    const street = window.AiActionMemory?.streetKey?.() || "preflop";
    const actions = window.AiActionMemory?.actions?.(street) || [];
    const normalized = normalizeAction(action);
    const current = [...actions].reverse().find(event => event.isHuman && normalizeAction(event.action) === normalized) || null;
    const prior = current
      ? actions.filter(event => Number(event.sequence) < Number(current.sequence))
      : actions.slice(0, -1);
    const previousHeroAction = [...prior].reverse().find(event => event.isHuman) || null;
    const latestOpponentAggression = [...prior].reverse().find(event => !event.isHuman && AGGRESSIVE_ACTIONS.has(normalizeAction(event.action))) || null;
    const facedAggression = Boolean(
      latestOpponentAggression
      && (!previousHeroAction || Number(latestOpponentAggression.sequence) > Number(previousHeroAction.sequence)),
    );
    const checkedBefore = Boolean(
      previousHeroAction?.action === "check"
      && latestOpponentAggression
      && Number(latestOpponentAggression.sequence) > Number(previousHeroAction.sequence),
    );
    const priorRaises = prior.filter(event => AGGRESSIVE_ACTIONS.has(normalizeAction(event.action))).length;
    const resolvedAmount = Math.max(0, Number(amount) || 0);
    const potAfter = Math.max(0, Number(hasState() ? state.pot : 0) || 0);
    const potBefore = Math.max(1, potAfter - resolvedAmount);
    return {
      handNumber: Math.max(0, Number(hasState() ? state.handNumber : 0) || 0),
      street,
      position: typeof positionLabel === "function" ? positionLabel(player) : "--",
      action: normalized,
      amount: resolvedAmount,
      potBefore,
      facedAggression,
      checkedBefore,
      priorRaises,
    };
  }

  function recordPublicAction(player, action, amount = 0) {
    if (!player?.isHuman) return null;
    return observePublicEvent(latestPublicContext(player, action, amount));
  }

  function smoothedRate(numerator, denominator, baseline, priorWeight = 3) {
    const count = Math.max(0, Number(denominator) || 0);
    return clamp(((Number(numerator) || 0) + baseline * priorWeight) / (count + priorWeight), 0, 1);
  }

  function bucketProfile(bucket = emptyBucket()) {
    const actions = Math.max(0, Number(bucket.actions) || 0);
    const aggressionActions = (Number(bucket.raises) || 0) + (Number(bucket.allIns) || 0);
    const pressure = Math.max(0, Number(bucket.facedAggression) || 0);
    const checkedPressure = Math.max(0, Number(bucket.checkedThenFacedAggression) || 0);
    const betSamples = Math.max(0, Number(bucket.raises) || 0);
    return {
      actions,
      pressureSample: pressure,
      checkedPressureSample: checkedPressure,
      aggressionRate: smoothedRate(aggressionActions, actions, 0.27, 4),
      foldToPressure: smoothedRate(bucket.foldsToAggression, pressure, 0.36, 3),
      callVsPressure: smoothedRate(bucket.callsVsAggression, pressure, 0.43, 3),
      raiseVsPressure: smoothedRate(bucket.raisesVsAggression, pressure, 0.16, 3),
      checkFoldRate: smoothedRate(bucket.checkFolds, checkedPressure, 0.38, 3),
      checkCallRate: smoothedRate(bucket.checkCalls, checkedPressure, 0.44, 3),
      checkRaiseRate: smoothedRate(bucket.checkRaises, checkedPressure, 0.14, 3),
      smallBetRate: smoothedRate(bucket.smallBets, betSamples, 0.34, 3),
      largeBetRate: smoothedRate((bucket.largeBets || 0) + (bucket.overbets || 0), betSamples, 0.24, 3),
      openRate: smoothedRate(bucket.opens, actions, 0.24, 5),
      threeBetRate: smoothedRate(bucket.threeBets, actions, 0.08, 5),
      fourBetRate: smoothedRate(bucket.fourBets, actions, 0.025, 5),
      limpRate: smoothedRate(bucket.limps, actions, 0.12, 5),
      confidence: clamp(actions / 18, 0, 1),
      pressureConfidence: clamp(pressure / 10, 0, 1),
      checkedPressureConfidence: clamp(checkedPressure / 7, 0, 1),
    };
  }

  function blendProfiles(primary, secondary) {
    const secondaryWeight = clamp((secondary?.actions || 0) / 20, 0, 0.28);
    const primaryWeight = 1 - secondaryWeight;
    const result = { ...primary };
    for (const key of [
      "aggressionRate", "foldToPressure", "callVsPressure", "raiseVsPressure",
      "checkFoldRate", "checkCallRate", "checkRaiseRate", "smallBetRate",
      "largeBetRate", "openRate", "threeBetRate", "fourBetRate", "limpRate",
    ]) {
      result[key] = primary[key] * primaryWeight + secondary[key] * secondaryWeight;
    }
    result.positionWeight = secondaryWeight;
    return result;
  }

  function exploitProfile(street = null, position = "--") {
    const model = ensureModel();
    const resolvedStreet = normalizeStreet(street || window.AiActionMemory?.streetKey?.() || "preflop");
    const streetProfile = bucketProfile(model.byStreet[resolvedStreet]);
    const positionProfile = bucketProfile(model.byPosition[normalizePosition(position)] || emptyBucket());
    const profile = blendProfiles(streetProfile, positionProfile);
    const pressureReady = profile.pressureSample >= 4;
    const checkReady = profile.checkedPressureSample >= 3;
    const actionReady = profile.actions >= 6;
    profile.street = resolvedStreet;
    profile.position = normalizePosition(position);
    profile.handsObserved = model.handsObserved;
    profile.actionsObserved = model.actionsObserved;
    profile.tendencies = {
      overfoldToPressure: pressureReady && profile.foldToPressure >= 0.54,
      stickyCaller: pressureReady && profile.callVsPressure >= 0.54,
      fightsBack: pressureReady && profile.raiseVsPressure >= 0.25,
      checkFoldLeak: checkReady && profile.checkFoldRate >= 0.52,
      checkRaiseThreat: checkReady && profile.checkRaiseRate >= 0.24,
      passive: actionReady && profile.aggressionRate <= 0.19,
      aggressive: actionReady && profile.aggressionRate >= 0.39,
      largeSizeHeavy: actionReady && profile.largeBetRate >= 0.38,
      smallSizeHeavy: actionReady && profile.smallBetRate >= 0.52,
      looseOpener: resolvedStreet === "preflop" && actionReady && profile.openRate >= 0.34,
      frequentThreeBettor: resolvedStreet === "preflop" && actionReady && profile.threeBetRate >= 0.14,
      limper: resolvedStreet === "preflop" && actionReady && profile.limpRate >= 0.24,
    };
    return profile;
  }

  function installHooks() {
    let changed = false;

    if (!window.__aiPlayerModelLogInstalled && typeof logAction === "function") {
      const previousLogAction = logAction;
      logAction = function logActionWithAdaptivePlayerModel(player, action, amount = 0) {
        const result = previousLogAction.apply(this, arguments);
        recordPublicAction(player, action, amount);
        return result;
      };
      window.__aiPlayerModelLogInstalled = true;
      changed = true;
    }

    if (!window.__aiPlayerModelStartHandInstalled && typeof startHand === "function") {
      const previousStartHand = startHand;
      startHand = function startHandWithAdaptivePlayerModel(...args) {
        const result = previousStartHand.apply(this, args);
        beginHand(Number(state?.handNumber) || 0);
        return result;
      };
      window.__aiPlayerModelStartHandInstalled = true;
      changed = true;
    }

    return changed || (
      Boolean(window.__aiPlayerModelLogInstalled)
      && Boolean(window.__aiPlayerModelStartHandInstalled)
    );
  }

  function refresh() {
    ensureModel();
    const ready = installHooks();
    if (ready || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return ready;
  }

  window.AiPlayerModel = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      publicActionsOnly: true,
      publicPositions: true,
      publicBetSizes: true,
      revealedShowdownsOnly: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    ensureModel,
    reset,
    beginHand,
    observePublicEvent,
    recordPublicAction,
    bucketProfile,
    exploitProfile,
    refresh,
  };

  refresh();
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
