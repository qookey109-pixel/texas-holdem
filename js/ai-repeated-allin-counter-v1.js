// Public-information counter-strategy for repeated preflop hero All-ins.
(() => {
  "use strict";

  if (window.AiRepeatedAllInCounterV1?.version) return;

  const VERSION = "1.6.1";
  const WINDOW_HANDS = 12;
  const DECAY = 0.88;
  const EXCLUDED_NAMES = new Set(["Oracle", "Chronos", "Gemini"]);
  const BEGINNER_NAMES = new Set(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);
  const MIDDLE_NAMES = new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE_NAMES = new Set(["Nova", "Unit-9", "Merlin", "Vlad"]);

  const TIER_CONFIG = Object.freeze({
    beginner: Object.freeze({ minHands: 5, minJams: 4, cap: 0.07, marginChance: 0.58 }),
    middle: Object.freeze({ minHands: 4, minJams: 3, cap: 0.11, marginChance: 0.72 }),
    elite: Object.freeze({ minHands: 3, minJams: 2, cap: 0.15, marginChance: 0.86 }),
  });

  const CHARACTER_RESPONSE = Object.freeze({
    Leo: 0.72,
    Toto: 0.78,
    Foxy: 0.9,
    Wolf: 0.94,
    Pao: 0.82,
    Shark: 1.0,
    Ace: 1.04,
    Momo: 1.0,
    Nori: 0.78,
    Bruno: 0.72,
    Dodo: 0.8,
    Viper: 1.02,
    Nova: 1.12,
    "Unit-9": 1.2,
    Merlin: 1.08,
    Vlad: 1.22,
  });

  let installTimer = 0;
  let installAttempts = 0;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function hasState() {
    return typeof state !== "undefined" && Boolean(state);
  }

  function currentHandNumber() {
    return Math.max(0, Number(hasState() ? state.handNumber : 0) || 0);
  }

  function createStore(handNumber = currentHandNumber()) {
    return {
      version: VERSION,
      sessionStartHand: Math.max(0, Number(handNumber) || 0),
      lastHandNumber: Math.max(0, Number(handNumber) || 0),
      entries: [],
    };
  }

  function ensureStore() {
    if (!hasState()) return createStore();
    const handNumber = currentHandNumber();
    if (
      !state.aiRepeatedAllInCounter
      || state.aiRepeatedAllInCounter.version !== VERSION
      || handNumber < Number(state.aiRepeatedAllInCounter.lastHandNumber || 0)
    ) {
      state.aiRepeatedAllInCounter = createStore(handNumber);
    }
    const store = state.aiRepeatedAllInCounter;
    if (store.sessionStartHand <= 0 && handNumber > 0) store.sessionStartHand = handNumber;
    store.lastHandNumber = handNumber;
    const earliest = Math.max(1, handNumber - WINDOW_HANDS - 2);
    store.entries = (store.entries || []).filter(entry => Number(entry.handNumber) >= earliest);
    return store;
  }

  function reset(handNumber = currentHandNumber()) {
    if (!hasState()) return createStore(handNumber);
    state.aiRepeatedAllInCounter = createStore(handNumber);
    return state.aiRepeatedAllInCounter;
  }

  function normalizeAction(action) {
    const key = String(action || "").toLowerCase();
    if (key.includes("all-in raise")) return "allin-raise";
    if (key.includes("all-in call")) return "allin-call";
    if (key.includes("all-in") || key.includes("allin")) return "allin";
    if (key.includes("raise") || key.includes("加注")) return "raise";
    if (key.includes("call") || key.includes("跟注")) return "call";
    if (key.includes("fold") || key.includes("棄牌")) return "fold";
    return key;
  }

  function jamEvidence(riskInBigBlinds, priorRaises = 0) {
    const risk = Math.max(0, Number(riskInBigBlinds) || 0);
    let weight = risk >= 20 ? 1 : risk >= 12 ? 0.78 : risk >= 8 ? 0.45 : 0.16;
    if (Number(priorRaises) > 0) weight *= 0.72;
    return clamp(weight, 0, 1);
  }

  function observeHeroJam(input = {}) {
    const handNumber = Math.max(1, Number(input.handNumber) || currentHandNumber() || 1);
    const bigBlind = Math.max(1, Number(input.bigBlind) || (typeof currentBigBlind === "function" ? currentBigBlind() : 1));
    const amount = Math.max(0, Number(input.amount) || 0);
    const priorRaises = Math.max(0, Number(input.priorRaises) || 0);
    const riskInBigBlinds = input.riskInBigBlinds == null ? amount / bigBlind : Number(input.riskInBigBlinds) || 0;
    const evidence = input.evidence == null
      ? jamEvidence(riskInBigBlinds, priorRaises)
      : clamp(input.evidence, 0, 1);
    const store = ensureStore();
    const existing = store.entries.find(entry => Number(entry.handNumber) === handNumber);
    const entry = {
      handNumber,
      evidence,
      riskInBigBlinds: Math.max(0, riskInBigBlinds),
      priorRaises,
      openJam: priorRaises === 0,
    };
    if (existing) Object.assign(existing, entry, { evidence: Math.max(Number(existing.evidence) || 0, evidence) });
    else store.entries.push(entry);
    store.entries.sort((left, right) => left.handNumber - right.handNumber);
    return entry;
  }

  function recentProfile(handNumber = currentHandNumber()) {
    const store = ensureStore();
    const current = Math.max(1, Number(handNumber) || 1);
    const sessionStart = Math.max(1, Number(store.sessionStartHand) || current);
    const observedHands = Math.max(1, Math.min(WINDOW_HANDS, current - sessionStart + 1));
    const firstHand = current - observedHands + 1;
    const entries = (store.entries || []).filter(entry => (
      Number(entry.handNumber) >= firstHand && Number(entry.handNumber) <= current
    ));
    const byHand = new Map(entries.map(entry => [Number(entry.handNumber), entry]));

    let weightedEvidence = 0;
    let weightedOpportunity = 0;
    for (let offset = 0; offset < observedHands; offset += 1) {
      const hand = current - offset;
      const decay = DECAY ** offset;
      weightedOpportunity += decay;
      weightedEvidence += (Number(byHand.get(hand)?.evidence) || 0) * decay;
    }

    let consecutiveJams = 0;
    for (let hand = current; hand >= firstHand; hand -= 1) {
      if ((Number(byHand.get(hand)?.evidence) || 0) < 0.4) break;
      consecutiveJams += 1;
    }

    return {
      windowHands: WINDOW_HANDS,
      observedHands,
      firstHand,
      currentHand: current,
      jamHands: entries.filter(entry => Number(entry.evidence) >= 0.4).length,
      weightedJamRate: weightedOpportunity > 0 ? weightedEvidence / weightedOpportunity : 0,
      consecutiveJams,
      entries: entries.map(entry => ({ ...entry })),
    };
  }

  function tierFor(player) {
    const name = String(player?.name || "");
    if (ELITE_NAMES.has(name)) return "elite";
    if (MIDDLE_NAMES.has(name)) return "middle";
    return "beginner";
  }

  function supports(player) {
    const name = String(player?.name || "");
    return Boolean(player && !player.isHuman && !EXCLUDED_NAMES.has(name));
  }

  function currentStreet() {
    const boardCount = Number(hasState() ? state.board?.length : 0) || 0;
    return boardCount > 0 ? "postflop" : "preflop";
  }

  function latestHeroJam() {
    const latest = window.AiActionMemory?.latestAggression?.("preflop") || null;
    if (latest?.isHuman && latest.action === "allin-raise") return latest;
    const hero = typeof human === "function" ? human() : state?.players?.find(player => player?.isHuman);
    if (hero?.lastAction === "allin" && Number(state?.currentBet || 0) > 0) {
      return {
        actor: hero.name || "Owl",
        isHuman: true,
        action: "allin-raise",
        amount: Number(hero.bet) || Number(state.currentBet) || 0,
        bet: Number(hero.bet) || Number(state.currentBet) || 0,
      };
    }
    return null;
  }

  function defenseContext(player) {
    if (!hasState() || currentStreet() !== "preflop" || !supports(player)) return null;
    const jam = latestHeroJam();
    if (!jam) return null;
    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    if (needed <= 0) return null;

    const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 1);
    const hero = typeof human === "function" ? human() : state.players.find(candidate => candidate?.isHuman);
    const active = (state.players || []).filter(candidate => candidate && !candidate.folded);
    const otherContenders = active.filter(candidate => candidate !== player && candidate !== hero && !candidate.allIn);
    const playerPosition = typeof positionLabel === "function" ? positionLabel(player) : "--";
    const heroPosition = typeof positionLabel === "function" ? positionLabel(hero) : "--";
    const blindVsBlind = [playerPosition, heroPosition].includes("SB") && [playerPosition, heroPosition].includes("BB");
    const pot = Math.max(1, Number(state.pot) || 0);
    const riskInBigBlinds = Math.min(Math.max(0, Number(player.stack) || 0), needed) / bigBlind;

    return {
      jam,
      needed,
      bigBlind,
      pot,
      potOdds: needed / Math.max(1, pot + needed),
      riskInBigBlinds,
      activePlayers: active.length,
      otherContenders: otherContenders.length,
      headsUp: active.length === 2,
      blindVsBlind,
      playerPosition,
      heroPosition,
    };
  }

  function classifyOwnHand(player) {
    const classified = window.AiPreflopRangeEngine?.classifyHand?.(player);
    if (classified?.score != null) return classified;
    const score = typeof estimateStrength === "function" ? estimateStrength(player) : 0;
    return { code: "--", score: clamp(score, 0, 1) };
  }

  function baselineThreshold(player, context) {
    const risk = Number(context.riskInBigBlinds) || 0;
    let threshold = risk <= 8 ? 0.58 : risk <= 12 ? 0.62 : risk <= 20 ? 0.68 : risk <= 30 ? 0.74 : 0.8;
    const tier = tierFor(player);
    if (tier === "beginner") threshold += 0.025;
    if (tier === "elite") threshold -= 0.02;
    if (context.blindVsBlind) threshold -= 0.035;
    if (context.otherContenders > 0) threshold += Math.min(0.09, context.otherContenders * 0.035);
    threshold -= clamp((0.5 - Number(context.potOdds || 0)) * 0.18, -0.015, 0.035);
    return clamp(threshold, 0.48, 0.88);
  }

  function adaptationFor(player, context, profile) {
    const tier = tierFor(player);
    const config = TIER_CONFIG[tier];
    if (profile.observedHands < config.minHands || profile.jamHands < config.minJams) return 0;

    const rateSignal = clamp((profile.weightedJamRate - 0.22) / 0.58, 0, 1);
    const streakSignal = clamp((profile.consecutiveJams - 1) / 3, 0, 1);
    const sampleSignal = clamp((profile.observedHands - config.minHands + 1) / 5, 0.35, 1);
    const riskFactor = context.riskInBigBlinds <= 12
      ? 1.08
      : context.riskInBigBlinds <= 20
        ? 1
        : context.riskInBigBlinds <= 30
          ? 0.76
          : 0.5;
    const tableFactor = context.otherContenders > 0 ? 0.62 : 1;
    const blindFactor = context.blindVsBlind ? 1.12 : 1;
    const characterFactor = CHARACTER_RESPONSE[player?.name] || 0.85;
    const intensity = Math.max(rateSignal, streakSignal * 0.9) * sampleSignal;
    return clamp(config.cap * intensity * riskFactor * tableFactor * blindFactor * characterFactor, 0, config.cap);
  }

  function planDefense(player, options = {}) {
    const context = options.context || defenseContext(player);
    if (!context) return { action: "fallback", reason: "未面對玩家翻牌前 All-in" };
    const profile = options.profile || recentProfile();
    const tier = tierFor(player);
    const config = TIER_CONFIG[tier];
    const hand = options.hand || classifyOwnHand(player);
    const baseline = baselineThreshold(player, context);
    const adjustment = adaptationFor(player, context, profile);
    const adjustedThreshold = clamp(baseline - adjustment, 0.42, baseline);
    const score = Number(hand.score) || 0;
    const result = {
      action: "fallback",
      reason: "維持原本 All-in 防守範圍",
      tier,
      hand,
      context,
      profile,
      baselineThreshold: baseline,
      adjustedThreshold,
      adjustment,
      strategyVersion: VERSION,
      publicRepeatedAllInCounter: true,
    };

    if (adjustment <= 0 || score < adjustedThreshold || score >= baseline) return result;

    const span = Math.max(0.001, baseline - adjustedThreshold);
    const location = clamp((score - adjustedThreshold) / span, 0, 1);
    const chance = clamp(
      config.marginChance + location * 0.18 + profile.consecutiveJams * 0.025,
      config.marginChance,
      0.97,
    );
    const random = typeof options.random === "function" ? options.random : Math.random;
    if (random() < chance) {
      result.action = "call";
      result.reason = `${player.name} 依最近 ${profile.observedHands} 局公開 All-in 頻率放寬跟注`;
      result.callChance = chance;
      result.exploitApplied = "repeated-preflop-allin";
    }
    return result;
  }

  function executeCall(player, decision) {
    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    player.status = "Thinking...";
    const paid = typeof pay === "function" ? pay(player, needed) : 0;
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : `跟注 ${paid}`;
    player.lastAction = player.allIn && paid > 0 ? "allin" : "call";
    player.lastStrategyDecision = {
      strategyVersion: VERSION,
      action: "call",
      reason: decision.reason,
      handCode: decision.hand?.code || "--",
      handScore: Number(decision.hand?.score) || 0,
      baselineThreshold: decision.baselineThreshold,
      adjustedThreshold: decision.adjustedThreshold,
      adjustment: decision.adjustment,
      observedHands: decision.profile?.observedHands || 0,
      weightedJamRate: decision.profile?.weightedJamRate || 0,
      consecutiveJams: decision.profile?.consecutiveJams || 0,
      exploitApplied: decision.exploitApplied || "",
    };
    if (paid > 0 && !state.isMuted) Audio.chip();
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : "Call", paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : "CALL", player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : "call", { chance: 0.3 });
  }

  function recordHeroAction(player, action, amount = 0) {
    if (!player?.isHuman || currentStreet() !== "preflop") return null;
    if (normalizeAction(action) !== "allin-raise") return null;
    const actions = window.AiActionMemory?.actions?.("preflop") || [];
    const current = [...actions].reverse().find(event => event.isHuman && event.action === "allin-raise") || null;
    const priorRaises = current
      ? actions.filter(event => Number(event.sequence) < Number(current.sequence) && ["raise", "allin-raise"].includes(event.action)).length
      : Math.max(0, actions.filter(event => ["raise", "allin-raise"].includes(event.action)).length - 1);
    return observeHeroJam({
      handNumber: currentHandNumber(),
      amount: Math.max(Number(player.bet) || 0, Number(amount) || 0),
      bigBlind: typeof currentBigBlind === "function" ? currentBigBlind() : 1,
      priorRaises,
    });
  }

  function installHooks() {
    let changed = false;

    if (!window.__aiRepeatedAllInCounterLogInstalled && typeof logAction === "function") {
      const previousLogAction = logAction;
      logAction = function logActionWithRepeatedAllInCounter(player, action, amount = 0) {
        const result = previousLogAction.apply(this, arguments);
        recordHeroAction(player, action, amount);
        return result;
      };
      window.__aiRepeatedAllInCounterLogInstalled = true;
      changed = true;
    }

    if (!window.__aiRepeatedAllInCounterBotInstalled && typeof botAction === "function") {
      const previousBotAction = botAction;
      botAction = function botActionWithRepeatedAllInCounter(player) {
        if (!supports(player)) return previousBotAction.apply(this, arguments);
        try {
          const decision = planDefense(player);
          if (decision.action === "call") return executeCall(player, decision);
        } catch (error) {
          console.warn("Repeated All-in counter fallback", player?.name, error);
        }
        return previousBotAction.apply(this, arguments);
      };
      window.__aiRepeatedAllInCounterBotInstalled = true;
      changed = true;
    }

    return changed || (
      Boolean(window.__aiRepeatedAllInCounterLogInstalled)
      && Boolean(window.__aiRepeatedAllInCounterBotInstalled)
    );
  }

  function refresh() {
    ensureStore();
    const ready = installHooks();
    if (ready || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return ready;
  }

  window.AiRepeatedAllInCounterV1 = {
    version: VERSION,
    windowHands: WINDOW_HANDS,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicHeroActionsOnly: true,
      publicBetSizes: true,
      publicPositions: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    supports,
    tierFor,
    reset,
    observeHeroJam,
    recentProfile,
    defenseContext,
    baselineThreshold,
    adaptationFor,
    planDefense,
    recordHeroAction,
    refresh,
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
