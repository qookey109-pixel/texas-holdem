// Symmetric rebuys, bounded boss catch-up, and public low-VPIP counterplay.
(() => {
  "use strict";

  if (window.EconomyFoldDefenseV1?.version) return;

  const VERSION = "1.1.1";
  const STORAGE_KEY = "texasHoldemEconomyFoldDefenseV1";
  const OPENING = new Set(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);
  const MIDDLE = new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE = new Set(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const SPECIAL = new Set(["Oracle", "Chronos"]);
  const PRESSURE_WEIGHT = Object.freeze({
    Leo: .62, Toto: .18, Foxy: .68, Wolf: .40, Pao: .20, Shark: .46,
    Ace: .50, Momo: .58, Nori: .38, Bruno: .28, Dodo: .24, Viper: .52,
    Nova: .58, "Unit-9": .50, Merlin: .54, Vlad: .64,
  });
  const CATCHUP = Object.freeze({
    special: Object.freeze({ min: 40, warning: 50, target: 55, pressure: 60, max: 75 }),
    gemini: Object.freeze({ min: 50, warning: 58, target: 65, pressure: 72, max: 90 }),
  });
  const CONFIG = Object.freeze({
    normal: Object.freeze({ median: .80, buyInCap: .75, softFloorBb: 12, maxBb: 60 }),
    tight: Object.freeze({ hands: 8, vpip: .18, preflopFold: .70 }),
    lead: Object.freeze({ warning: 1.7, standard: 1.8, target: 2.0, pressure: 2.2, maximum: 3.5 }),
  });

  let attempts = 0;
  let installTimer = 0;
  let sessionToken = `${Date.now()}:${Math.random()}`;
  let tracker = readTracker();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function median(values) {
    if (!Array.isArray(values) || !values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function roundUnit(value, unit = 10) {
    const chipUnit = Math.max(1, finite(unit, 10));
    return Math.max(0, Math.round(finite(value) / chipUnit) * chipUnit);
  }

  function interpolate(start, end, progress) {
    return start + (end - start) * clamp(progress, 0, 1);
  }

  function normalizeAction(action) {
    const value = String(action || "").toLowerCase();
    if (value.includes("fold") || value.includes("棄牌")) return "fold";
    if (value.includes("all-in") || value.includes("allin")) return "allin";
    if (value.includes("raise") || value.includes("加注")) return "raise";
    if (value.includes("call") || value.includes("跟注")) return "call";
    if (value.includes("check") || value.includes("過牌")) return "check";
    return value;
  }

  function freshTracker(raw = {}) {
    return {
      opportunities: Math.max(0, Math.trunc(finite(raw.opportunities))),
      preflopFolds: Math.max(0, Math.trunc(finite(raw.preflopFolds))),
      voluntaryHands: Math.max(0, Math.trunc(finite(raw.voluntaryHands))),
      lastUpdatedAt: Math.max(0, Math.trunc(finite(raw.lastUpdatedAt))),
      seen: new Set(),
    };
  }

  function readTracker() {
    try {
      return freshTracker(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {});
    } catch (_) {
      return freshTracker();
    }
  }

  function persistTracker() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        opportunities: tracker.opportunities,
        preflopFolds: tracker.preflopFolds,
        voluntaryHands: tracker.voluntaryHands,
        lastUpdatedAt: tracker.lastUpdatedAt,
      }));
    } catch (_) {
      // Session memory remains available when storage is blocked.
    }
  }

  function recordHeroPreflop(player, action) {
    if (!player?.isHuman) return;
    const street = window.AiActionMemory?.streetKey?.()
      || ((state?.board?.length || 0) === 0 ? "preflop" : "postflop");
    if (street !== "preflop") return;
    const hand = Math.max(0, Math.trunc(finite(state?.handNumber)));
    const key = `${sessionToken}:${hand}`;
    if (!hand || tracker.seen.has(key)) return;

    tracker.seen.add(key);
    tracker.opportunities += 1;
    const normalized = normalizeAction(action);
    if (normalized === "fold") tracker.preflopFolds += 1;
    if (["call", "raise", "allin"].includes(normalized)) tracker.voluntaryHands += 1;
    tracker.lastUpdatedAt = Date.now();
    persistTracker();
  }

  function installActionTracking() {
    if (window.__economyFoldDefenseLogInstalled) return true;
    if (typeof logAction !== "function") return false;
    const previous = logAction;
    logAction = function logActionWithEconomyFoldDefense(player, action, amount = 0) {
      const result = previous.apply(this, arguments);
      recordHeroPreflop(player, action, amount);
      return result;
    };
    window.__economyFoldDefenseLogInstalled = true;
    return true;
  }

  function normalLevel(options = {}) {
    if (options.bigBlind || options.buyIn) {
      return { big: Math.max(1, finite(options.bigBlind, 20)), buyIn: Math.max(1, finite(options.buyIn, 2000)) };
    }
    const hand = Math.max(1, Math.trunc(finite(
      options.handNumber,
      finite(state?.handNumber) + (options.nextHand ? 1 : 0),
    )));
    if (typeof blindLevelForHand === "function") return blindLevelForHand(hand);
    return { big: currentBigBlind?.() || 20, buyIn: currentBuyIn?.() || 2000 };
  }

  function calculateNormalRebuy(players = state?.players, options = {}) {
    const sharedCalculator = window.ReplacementStackBalance?.calculate;
    if (typeof sharedCalculator === "function") {
      return sharedCalculator(players, options);
    }

    // Compatibility fallback while the shared allocator is still loading.
    const level = normalLevel(options);
    const bb = Math.max(1, finite(level?.big, 20));
    const buyIn = Math.max(bb, finite(level?.buyIn, bb * 100));
    const stacks = (Array.isArray(players) ? players : [])
      .map(player => finite(player?.stack))
      .filter(stack => stack > 0);
    const tableMedian = stacks.length ? median(stacks) : buyIn;
    const raw = Math.min(
      tableMedian * CONFIG.normal.median,
      buyIn * CONFIG.normal.buyInCap,
      bb * CONFIG.normal.maxBb,
    );
    const softFloor = Math.min(tableMedian, bb * CONFIG.normal.softFloorBb);
    const target = Math.min(tableMedian, Math.max(raw, softFloor));
    const rounded = Math.floor(target / bb) * bb;
    return Math.max(Math.min(tableMedian, bb), rounded || Math.min(tableMedian, bb));
  }

  function installAiRebuy() {
    if (window.__economyFoldDefenseSeatBalanceInstalled) return true;
    if (!window.ReplacementStackBalance?.isInstalled?.() || typeof window.ReplacementStackBalance?.calculate !== "function") {
      return false;
    }
    // ReplacementStackBalance is the single source of truth for normal AI
    // replacements. Do not wrap buildNextAiSeats a second time here.
    window.__economyFoldDefenseSeatBalanceInstalled = true;
    return true;
  }

  function candidateName() {
    if (!window.TournamentMode?.isActive?.()) return "";
    const appeared = Array.isArray(state?.tournament?.appeared) ? state.tournament.appeared : [];
    const eliminated = new Set(state?.tournament?.eliminated || []);
    const seated = new Set((state?.players || []).map(player => player?.name).filter(Boolean));
    for (let index = appeared.length - 1; index >= 0; index -= 1) {
      const name = String(appeared[index] || "");
      if (name && !seated.has(name) && !eliminated.has(name)) return name;
    }
    return "";
  }

  function tierFor(name) {
    if (name === "Gemini") return "gemini";
    if (SPECIAL.has(name)) return "special";
    if (ELITE.has(name)) return "elite";
    if (MIDDLE.has(name)) return "middle";
    return "opening";
  }

  function tableLeadSnapshot(players = state?.players, bigBlind = null) {
    const bb = Math.max(1, finite(bigBlind, currentBigBlind?.() || state?.blindLevel?.big || 20));
    const hero = (players || []).find(player => player?.isHuman) || players?.[0];
    const heroStack = Math.max(0, finite(hero?.stack) + finite(hero?.bet));
    const aiStacks = (players || [])
      .filter(player => player && !player.isHuman && finite(player.stack) > 0)
      .map(player => finite(player.stack) + finite(player.bet));
    const secondStack = Math.max(bb * 10, ...aiStacks);
    return { heroStack, secondStack, heroLeadRatio: heroStack / secondStack, bigBlind: bb };
  }

  function calculateBossCatchup({ name, baseStack, bigBlind, smallBlind, heroStack, secondStack } = {}) {
    const tier = tierFor(String(name || ""));
    const profile = CATCHUP[tier];
    const bb = Math.max(1, finite(bigBlind, 20));
    const sb = Math.max(1, finite(smallBlind, bb / 2));
    const base = Math.max(0, finite(baseStack));
    const baseBb = base / bb;
    const ratio = finite(secondStack) > 0 ? finite(heroStack) / finite(secondStack) : 0;
    if (!profile || ratio < CONFIG.lead.warning) {
      return {
        stack: base,
        actualEntryBb: baseBb,
        adjusted: false,
        leadRatio: ratio,
        tier,
        catchupPhase: "inactive",
      };
    }

    let desired = baseBb;
    let catchupPhase = "warning";
    if (ratio < CONFIG.lead.standard) {
      desired = interpolate(
        baseBb,
        profile.warning,
        (ratio - CONFIG.lead.warning) / (CONFIG.lead.standard - CONFIG.lead.warning),
      );
    } else if (ratio < CONFIG.lead.target) {
      catchupPhase = "standard";
      desired = interpolate(
        profile.warning,
        profile.target,
        (ratio - CONFIG.lead.standard) / (CONFIG.lead.target - CONFIG.lead.standard),
      );
    } else if (ratio < CONFIG.lead.pressure) {
      catchupPhase = "target";
      desired = interpolate(
        profile.target,
        profile.pressure,
        (ratio - CONFIG.lead.target) / (CONFIG.lead.pressure - CONFIG.lead.target),
      );
    } else {
      catchupPhase = "maximum";
      desired = interpolate(
        profile.pressure,
        profile.max,
        (ratio - CONFIG.lead.pressure) / (CONFIG.lead.maximum - CONFIG.lead.pressure),
      );
    }

    const actual = Math.max(baseBb, clamp(desired, profile.min, profile.max));
    const stack = roundUnit(actual * bb, sb);
    return {
      stack,
      actualEntryBb: stack / bb,
      desiredEntryBb: desired,
      adjusted: stack > base,
      leadRatio: ratio,
      tier,
      catchupPhase,
      profile,
    };
  }

  function installBossCatchup() {
    if (window.__economyFoldDefenseCatchupInstalled) return true;
    if (!window.ReplacementStackBalance?.isInstalled?.() || typeof currentBuyIn !== "function") return false;
    const previous = currentBuyIn;
    currentBuyIn = function currentBuyInWithBossCatchup(...args) {
      const baseStack = previous.apply(this, args);
      if (!window.TournamentMode?.isActive?.()) return baseStack;
      const name = candidateName();
      if (!SPECIAL.has(name) && name !== "Gemini") return baseStack;
      const bb = Math.max(1, finite(state?.blindLevel?.big, currentBigBlind?.() || 20));
      const sb = Math.max(1, finite(state?.blindLevel?.small, bb / 2));
      const lead = tableLeadSnapshot(state?.players, bb);
      return calculateBossCatchup({
        name,
        baseStack,
        bigBlind: bb,
        smallBlind: sb,
        heroStack: lead.heroStack,
        secondStack: lead.secondStack,
      }).stack;
    };
    currentBuyIn.__economyFoldDefenseCatchup = true;
    currentBuyIn.__original = previous;
    window.__economyFoldDefenseCatchupInstalled = true;
    return true;
  }

  function installHeroRebuy() {
    if (window.__economyFoldDefenseHeroRebuyInstalled) return true;
    if (!window.__economyFoldDefenseCatchupInstalled || typeof startHand !== "function") return false;
    const previous = startHand;
    startHand = function startHandWithBalancedNormalBuyIn(...args) {
      const players = Array.isArray(state?.players) ? state.players : [];
      if (window.TournamentMode?.isActive?.() || !players.length) return previous.apply(this, args);
      const balanced = calculateNormalRebuy(players, { nextHand: true });
      if (!Number.isFinite(balanced) || balanced <= 0) return previous.apply(this, args);
      const saved = currentBuyIn;
      currentBuyIn = () => balanced;
      try {
        return previous.apply(this, args);
      } finally {
        currentBuyIn = saved;
      }
    };
    startHand.__economyFoldDefenseHeroRebuy = true;
    startHand.__original = previous;
    window.__economyFoldDefenseHeroRebuyInstalled = true;
    return true;
  }

  function classifyHeroTightness(input = {}) {
    const stats = input.stats || state?.heroStyle || {};
    const hands = Math.max(0, Math.trunc(finite(input.hands, Math.max(finite(stats.hands), tracker.opportunities))));
    const opportunities = Math.max(0, finite(input.opportunities, Math.max(tracker.opportunities, hands)));
    const vpipHands = Math.max(0, finite(input.vpipHands, Math.max(finite(stats.vpip), tracker.voluntaryHands)));
    const folds = Math.max(0, finite(input.preflopFolds, tracker.preflopFolds));
    const vpipRate = hands ? clamp(vpipHands / hands, 0, 1) : 0;
    const preflopFoldRate = opportunities ? clamp(folds / opportunities, 0, 1) : 0;
    const sample = Math.max(hands, opportunities);
    const ready = sample >= CONFIG.tight.hands;
    const lowVpip = ready && vpipRate <= CONFIG.tight.vpip;
    const highPreflopFold = ready && preflopFoldRate >= CONFIG.tight.preflopFold;
    return {
      ready,
      lowVpip,
      highPreflopFold,
      tightPassive: lowVpip || highPreflopFold,
      sampleHands: hands,
      opportunities,
      vpipRate,
      preflopFoldRate,
      confidence: ready ? clamp((sample - CONFIG.tight.hands + 4) / 18, .22, 1) : 0,
    };
  }

  function dryness(board = state?.board || []) {
    if (!Array.isArray(board) || board.length < 3) return 0;
    const suits = new Map();
    const values = [...new Set(board.map(card => finite(card?.value)).filter(Boolean))].sort((a, b) => a - b);
    board.forEach(card => suits.set(card?.suit, (suits.get(card?.suit) || 0) + 1));
    let score = .52;
    score += Math.max(...suits.values()) <= 2 ? .18 : -.16;
    score += values.at(-1) - values[0] >= 5 ? .12 : -.12;
    if (values.length < board.length) score += .08;
    return clamp(score, 0, 1);
  }

  function legalRaise(player, desired) {
    const needed = amountToCall?.(player) || 0;
    const available = Math.max(0, finite(player?.stack) - needed);
    const bb = Math.max(1, currentBigBlind?.() || 20);
    const minimum = Math.max(bb, minimumRaiseBy?.() || bb);
    if (player?.raiseLocked || available < minimum) return 0;
    const raiseBy = Math.min(available, Math.max(minimum, roundUnit(desired, Math.max(1, bb / 2))));
    return raiseBy >= Math.max(0, finite(player?.stack) - bb) ? 0 : raiseBy;
  }

  function planPressure(player, options = {}) {
    const profile = options.profile || classifyHeroTightness();
    const random = typeof options.random === "function" ? options.random : Math.random;
    if (!profile.ready || !profile.tightPassive || !player || player.isHuman) return null;
    if (SPECIAL.has(player.name) || player.name === "Gemini") return null;
    if (!(OPENING.has(player.name) || MIDDLE.has(player.name) || ELITE.has(player.name))) return null;
    const hero = human?.() || state?.players?.find(candidate => candidate?.isHuman);
    if (!hero || hero.folded || hero.allIn) return null;

    const boardCount = state?.board?.length || 0;
    const bb = Math.max(1, currentBigBlind?.() || 20);
    const pot = Math.max(1, finite(state?.pot, bb * 2));
    const position = positionLabel?.(player) || "--";
    const base = PRESSURE_WEIGHT[player.name] || .32;
    const frequency = clamp(base * (.55 + profile.confidence * .65), .08, .72);
    const strength = estimateStrength?.(player) ?? .5;

    if (boardCount === 0) {
      const unopened = finite(state?.currentBet) <= bb;
      const late = ["HJ", "CO", "BTN", "SB"].includes(position);
      const threshold = ["Leo", "Foxy", "Momo", "Nova", "Vlad"].includes(player.name) ? .30 : .36;
      if (!unopened || !late || strength < threshold || random() >= frequency) return null;
      const multiple = ["Toto", "Pao", "Dodo", "Bruno"].includes(player.name) ? 2.2 : 2.4;
      const raiseBy = legalRaise(player, roundUnit(bb * multiple, bb / 2) - finite(state?.currentBet));
      return raiseBy ? {
        action: "raise", raiseBy, street: "preflop", exploitApplied: "low-vpip-steal", profile,
        reason: `${player.name} 針對低 VPIP／高棄牌率，以小尺寸擴張偷盲`, publicInformationOnly: true,
      } : null;
    }

    const active = (state?.players || []).filter(candidate => candidate && !candidate.folded).length;
    const needed = amountToCall?.(player) || 0;
    if (
      boardCount <= 4 && active <= 3 && finite(state?.currentBet) === 0 && needed === 0
      && dryness(state?.board) >= .62 && strength >= .27 && random() < frequency * .62
    ) {
      const fraction = ["Toto", "Pao", "Dodo", "Bruno"].includes(player.name) ? .33 : .40;
      const raiseBy = legalRaise(player, Math.max(bb, pot * fraction));
      return raiseBy ? {
        action: "raise", raiseBy, street: boardCount === 3 ? "flop" : "turn",
        exploitApplied: "low-vpip-small-cbet", profile,
        reason: `${player.name} 針對高棄牌率，在乾燥牌面使用小尺寸持續施壓`, publicInformationOnly: true,
      } : null;
    }
    return null;
  }

  function executePressure(player, plan) {
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyId: "economy-fold-defense-v1",
      strategyVersion: VERSION,
      action: plan.action,
      reason: plan.reason,
      street: plan.street,
      raiseBy: plan.raiseBy,
      exploitApplied: plan.exploitApplied,
      heroVpipRate: plan.profile.vpipRate,
      heroPreflopFoldRate: plan.profile.preflopFoldRate,
      modelConfidence: plan.profile.confidence,
      fairPublicModel: true,
    };
    raisePlayer(player, plan.raiseBy);
    if (!state.isMuted) Audio.raise();
    logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
    announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: .38 });
  }

  function installPressure() {
    if (window.__economyFoldDefensePressureInstalled) return true;
    // Loaded immediately before V2.7 so the V2.7 diagnostics wrapper stays outermost.
    if (window.AiTieredMultiwayEquityV27?.version || typeof botAction !== "function") return false;
    const previous = botAction;
    botAction = function botActionWithLowVpipDefense(player) {
      try {
        const plan = planPressure(player);
        if (plan) return executePressure(player, plan);
      } catch (error) {
        console.warn("Economy/Fold Defense pressure fallback", player?.name, error);
      }
      return previous.apply(this, arguments);
    };
    botAction.__economyFoldDefensePressure = true;
    botAction.__original = previous;
    window.__economyFoldDefensePressureInstalled = true;
    return true;
  }

  function resetTracker({ persistent = false } = {}) {
    tracker = freshTracker();
    sessionToken = `${Date.now()}:${Math.random()}`;
    if (persistent) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* local reset remains valid */ }
    } else persistTracker();
    return classifyHeroTightness();
  }

  function refresh() {
    const pressure = installPressure();
    const action = installActionTracking();
    const aiRebuy = installAiRebuy();
    const catchup = installBossCatchup();
    const heroRebuy = catchup && installHeroRebuy();
    const ready = pressure && action && aiRebuy && catchup && heroRebuy;
    attempts += 1;
    if (ready || attempts >= 320) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return ready;
  }

  window.EconomyFoldDefenseV1 = {
    version: VERSION,
    config: Object.freeze({
      normalRebuy: Object.freeze({
        source: "ReplacementStackBalance.normalConfig",
        strategy: "median-v2",
        tableMedianRatio: .80,
        buyInRatioCap: .75,
        softFloorBigBlinds: 12,
        maxBigBlinds: 60,
      }),
      tightness: Object.freeze({ minimumHands: 8, lowVpipThreshold: .18, preflopFoldThreshold: .70 }),
      catchup: Object.freeze({
        heroLeadTrigger: CONFIG.lead.warning,
        softWarningRange: Object.freeze([CONFIG.lead.warning, CONFIG.lead.standard]),
        targetLeadRatio: CONFIG.lead.target,
        pressureLeadRatio: CONFIG.lead.pressure,
        maximumLeadRatio: CONFIG.lead.maximum,
        profiles: CATCHUP,
      }),
    }),
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true, publicBoard: true, publicActions: true, publicPositions: true,
      publicBetSizes: true, aggregateHeroStatistics: true, visibleStacks: true,
      hiddenOpponentCards: false, actualDeckOrder: false, futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    calculateNormalRebuy,
    calculateBossCatchup,
    classifyHeroTightness,
    tableLeadSnapshot,
    planPressure,
    tracker: () => ({
      opportunities: tracker.opportunities,
      preflopFolds: tracker.preflopFolds,
      voluntaryHands: tracker.voluntaryHands,
      lastUpdatedAt: tracker.lastUpdatedAt,
    }),
    resetTracker,
    refresh,
    status: () => ({
      version: VERSION,
      installed: Boolean(
        window.__economyFoldDefensePressureInstalled
        && window.__economyFoldDefenseLogInstalled
        && window.__economyFoldDefenseSeatBalanceInstalled
        && window.__economyFoldDefenseCatchupInstalled
        && window.__economyFoldDefenseHeroRebuyInstalled
      ),
      pressurePrecedesV27: Boolean(
        window.__economyFoldDefensePressureInstalled
        && window.AiTieredMultiwayEquityV27?.version
        && botAction?.__aiTieredMultiwayEquityV27Wrapper
      ),
      normalRebuySource: window.ReplacementStackBalance?.normalConfig?.strategy || "compatibility-fallback",
      symmetricAiRebuy: Boolean(window.__economyFoldDefenseSeatBalanceInstalled),
      symmetricHeroRebuy: Boolean(window.__economyFoldDefenseHeroRebuyInstalled),
      bossCatchup: Boolean(window.__economyFoldDefenseCatchupInstalled),
      lowVpipPressure: Boolean(window.__economyFoldDefensePressureInstalled),
    }),
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 100);
  window.setTimeout(refresh, 400);
  window.setTimeout(refresh, 900);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();