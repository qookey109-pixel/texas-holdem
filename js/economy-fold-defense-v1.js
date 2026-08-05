// Economy V1 and low-VPIP defense using only public table information.
(() => {
  "use strict";

  if (window.EconomyFoldDefenseV1?.version) return;

  const VERSION = "1.0.0";
  const STORAGE_KEY = "texasHoldemEconomyFoldDefenseV1";
  const MIN_TIGHTNESS_HANDS = 8;
  const LOW_VPIP_THRESHOLD = 0.18;
  const PREFLOP_FOLD_THRESHOLD = 0.70;
  const HERO_LEAD_TRIGGER = 1.8;
  const NORMAL_TABLE_AVERAGE_RATIO = 0.70;
  const NORMAL_BUY_IN_RATIO_CAP = 0.60;
  const NORMAL_MIN_BIG_BLINDS = 20;
  const NORMAL_MAX_BIG_BLINDS = 50;
  const INSTALL_RETRY_MS = 25;
  const INSTALL_RETRY_LIMIT = 320;

  const OPENING_NAMES = new Set(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);
  const MIDDLE_NAMES = new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE_NAMES = new Set(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  const PRESSURE_WEIGHT = Object.freeze({
    Leo: 0.62,
    Toto: 0.18,
    Foxy: 0.68,
    Wolf: 0.40,
    Pao: 0.20,
    Shark: 0.46,
    Ace: 0.50,
    Momo: 0.58,
    Nori: 0.38,
    Bruno: 0.28,
    Dodo: 0.24,
    Viper: 0.52,
    Nova: 0.58,
    "Unit-9": 0.50,
    Merlin: 0.54,
    Vlad: 0.64,
  });
  const CATCHUP_PROFILES = Object.freeze({
    special: Object.freeze({ min: 40, target: 55, max: 75 }),
    gemini: Object.freeze({ min: 50, target: 65, max: 90 }),
  });

  let installAttempts = 0;
  let installTimer = 0;
  let sessionToken = `${Date.now()}:${Math.random()}`;
  let tracker = readTracker();

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function roundToUnit(value, unit = 10) {
    const chipUnit = Math.max(1, finite(unit, 10));
    return Math.max(0, Math.round(finite(value) / chipUnit) * chipUnit);
  }

  function normalizeAction(action) {
    const key = String(action || "").toLowerCase();
    if (key.includes("fold") || key.includes("棄牌")) return "fold";
    if (key.includes("all-in") || key.includes("allin")) return "allin";
    if (key.includes("raise") || key.includes("加注")) return "raise";
    if (key.includes("call") || key.includes("跟注")) return "call";
    if (key.includes("check") || key.includes("過牌")) return "check";
    return key;
  }

  function cleanTracker(raw = {}) {
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
      return cleanTracker(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {});
    } catch (error) {
      return cleanTracker();
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
    } catch (error) {
      // The current session still has a usable public action sample.
    }
  }

  function recordHeroPreflopAction(player, action) {
    if (!player?.isHuman) return;
    const street = window.AiActionMemory?.streetKey?.()
      || ((state?.board?.length || 0) === 0 ? "preflop" : "postflop");
    if (street !== "preflop") return;

    const handNumber = Math.max(0, Math.trunc(finite(state?.handNumber)));
    if (!handNumber) return;
    const key = `${sessionToken}:${handNumber}`;
    if (tracker.seen.has(key)) return;

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
    const previousLogAction = logAction;
    logAction = function logActionWithEconomyFoldDefense(player, action, amount = 0) {
      const result = previousLogAction.apply(this, arguments);
      recordHeroPreflopAction(player, action, amount);
      return result;
    };
    window.__economyFoldDefenseLogInstalled = true;
    return true;
  }

  function positiveStacks(players) {
    return (Array.isArray(players) ? players : [])
      .filter(player => player && finite(player.stack) > 0)
      .map(player => finite(player.stack));
  }

  function normalLevel(options = {}) {
    if (options.bigBlind || options.buyIn) {
      return {
        big: Math.max(1, finite(options.bigBlind, 20)),
        buyIn: Math.max(1, finite(options.buyIn, 2000)),
      };
    }
    const handNumber = Math.max(
      1,
      Math.trunc(finite(options.handNumber, finite(state?.handNumber, 0) + (options.nextHand ? 1 : 0))),
    );
    if (typeof blindLevelForHand === "function") return blindLevelForHand(handNumber);
    return {
      big: typeof currentBigBlind === "function" ? currentBigBlind() : 20,
      buyIn: typeof currentBuyIn === "function" ? currentBuyIn() : 2000,
    };
  }

  function calculateNormalRebuy(players = state?.players, options = {}) {
    const level = normalLevel(options);
    const bigBlind = Math.max(1, finite(level?.big, 20));
    const fullBuyIn = Math.max(bigBlind, finite(level?.buyIn, bigBlind * 100));
    const stacks = positiveStacks(players);
    const tableAverage = stacks.length
      ? stacks.reduce((sum, stack) => sum + stack, 0) / stacks.length
      : fullBuyIn;
    const minimum = bigBlind * NORMAL_MIN_BIG_BLINDS;
    const maximum = bigBlind * NORMAL_MAX_BIG_BLINDS;
    const rawTarget = Math.min(
      tableAverage * NORMAL_TABLE_AVERAGE_RATIO,
      fullBuyIn * NORMAL_BUY_IN_RATIO_CAP,
      maximum,
    );
    const roundedDown = Math.floor(rawTarget / bigBlind) * bigBlind;
    return clamp(roundedDown || minimum, minimum, maximum);
  }

  function installNormalSeatBalance() {
    if (window.__economyFoldDefenseSeatBalanceInstalled) return true;
    if (typeof buildNextAiSeats !== "function") return false;
    const previousBuildNextAiSeats = buildNextAiSeats;
    buildNextAiSeats = function buildNextAiSeatsWithSymmetricRebuy(previousPlayers) {
      const seats = previousBuildNextAiSeats.apply(this, arguments);
      if (window.TournamentMode?.isActive?.()) return seats;
      if (!Array.isArray(previousPlayers) || !previousPlayers.length || !Array.isArray(seats)) return seats;
      const replacementStack = calculateNormalRebuy(previousPlayers, {
        handNumber: Math.max(1, finite(state?.handNumber, 1)),
      });
      return seats.map(seat => seat?.replaced
        ? { ...seat, stack: replacementStack, symmetricRebuyV1: true }
        : seat);
    };
    buildNextAiSeats.__economyFoldDefenseSeatBalance = true;
    buildNextAiSeats.__original = previousBuildNextAiSeats;
    window.__economyFoldDefenseSeatBalanceInstalled = true;
    return true;
  }

  function currentTournamentCandidate() {
    if (!window.TournamentMode?.isActive?.()) return "";
    const appeared = Array.isArray(state?.tournament?.appeared) ? state.tournament.appeared : [];
    const eliminated = new Set(state?.tournament?.eliminated || []);
    const currentNames = new Set((state?.players || []).map(player => player?.name).filter(Boolean));
    for (let index = appeared.length - 1; index >= 0; index -= 1) {
      const name = String(appeared[index] || "");
      if (name && !currentNames.has(name) && !eliminated.has(name)) return name;
    }
    return "";
  }

  function tierForName(name) {
    if (name === "Gemini") return "gemini";
    if (SPECIAL_NAMES.has(name)) return "special";
    if (ELITE_NAMES.has(name)) return "elite";
    if (MIDDLE_NAMES.has(name)) return "middle";
    return "opening";
  }

  function tableLeadSnapshot(players = state?.players, bigBlind = null) {
    const resolvedBigBlind = Math.max(1, finite(
      bigBlind,
      typeof currentBigBlind === "function" ? currentBigBlind() : state?.blindLevel?.big,
    ));
    const hero = (players || []).find(player => player?.isHuman) || players?.[0] || null;
    const heroStack = Math.max(0, finite(hero?.stack) + finite(hero?.bet));
    const opponentStack = Math.max(
      resolvedBigBlind * 10,
      ...(players || [])
        .filter(player => player && !player.isHuman && finite(player.stack) > 0)
        .map(player => finite(player.stack) + finite(player.bet)),
    );
    return {
      heroStack,
      secondStack: opponentStack,
      heroLeadRatio: opponentStack > 0 ? heroStack / opponentStack : 0,
      bigBlind: resolvedBigBlind,
    };
  }

  function calculateBossCatchup({
    name,
    baseStack,
    bigBlind,
    smallBlind,
    heroStack,
    secondStack,
  } = {}) {
    const tier = tierForName(String(name || ""));
    const profile = CATCHUP_PROFILES[tier];
    const resolvedBigBlind = Math.max(1, finite(bigBlind, 20));
    const resolvedSmallBlind = Math.max(1, finite(smallBlind, Math.max(1, resolvedBigBlind / 2)));
    const resolvedBaseStack = Math.max(0, finite(baseStack));
    const leadRatio = finite(secondStack) > 0 ? finite(heroStack) / finite(secondStack) : 0;
    const baseBb = resolvedBaseStack / resolvedBigBlind;

    if (!profile || leadRatio < HERO_LEAD_TRIGGER) {
      return {
        stack: resolvedBaseStack,
        actualEntryBb: baseBb,
        adjusted: false,
        leadRatio,
        tier,
      };
    }

    const intensity = clamp((leadRatio - HERO_LEAD_TRIGGER) / 1.7, 0, 1);
    const desiredBb = profile.target + (profile.max - profile.target) * intensity;
    const actualEntryBb = clamp(Math.max(baseBb, desiredBb), profile.min, profile.max);
    const stack = roundToUnit(actualEntryBb * resolvedBigBlind, resolvedSmallBlind);
    return {
      stack,
      actualEntryBb: stack / resolvedBigBlind,
      adjusted: stack > resolvedBaseStack,
      leadRatio,
      tier,
      profile,
    };
  }

  function installTournamentCatchup() {
    if (window.__economyFoldDefenseCatchupInstalled) return true;
    if (typeof currentBuyIn !== "function" || !window.ReplacementStackBalance?.isInstalled?.()) return false;
    const previousCurrentBuyIn = currentBuyIn;
    currentBuyIn = function currentBuyInWithBossCatchup(...args) {
      const baseStack = previousCurrentBuyIn.apply(this, args);
      if (!window.TournamentMode?.isActive?.()) return baseStack;
      const name = currentTournamentCandidate();
      if (!name || (!SPECIAL_NAMES.has(name) && name !== "Gemini")) return baseStack;
      const bigBlind = Math.max(1, finite(state?.blindLevel?.big, typeof currentBigBlind === "function" ? currentBigBlind() : 20));
      const smallBlind = Math.max(1, finite(state?.blindLevel?.small, Math.max(1, bigBlind / 2)));
      const lead = tableLeadSnapshot(state?.players, bigBlind);
      const plan = calculateBossCatchup({
        name,
        baseStack,
        bigBlind,
        smallBlind,
        heroStack: lead.heroStack,
        secondStack: lead.secondStack,
      });
      if (plan.adjusted) {
        console.info("[EconomyFoldDefenseV1] boss catch-up", { name, ...plan });
      }
      return plan.stack;
    };
    currentBuyIn.__economyFoldDefenseCatchup = true;
    currentBuyIn.__original = previousCurrentBuyIn;
    window.__economyFoldDefenseCatchupInstalled = true;
    return true;
  }

  function installSymmetricHeroRebuy() {
    if (window.__economyFoldDefenseHeroRebuyInstalled) return true;
    if (typeof startHand !== "function" || typeof currentBuyIn !== "function") return false;
    const previousStartHand = startHand;
    startHand = function startHandWithSymmetricHeroRebuy(...args) {
      const normalMode = !window.TournamentMode?.isActive?.();
      const previousPlayers = Array.isArray(state?.players) ? state.players : [];
      const heroWasBusted = Boolean(previousPlayers[0] && finite(previousPlayers[0].stack) <= 0);
      if (!normalMode || !heroWasBusted) return previousStartHand.apply(this, args);

      const balancedStack = calculateNormalRebuy(previousPlayers, { nextHand: true });
      const savedCurrentBuyIn = currentBuyIn;
      currentBuyIn = function currentSymmetricRebuy() {
        return balancedStack;
      };
      try {
        return previousStartHand.apply(this, args);
      } finally {
        currentBuyIn = savedCurrentBuyIn;
      }
    };
    startHand.__economyFoldDefenseHeroRebuy = true;
    startHand.__original = previousStartHand;
    window.__economyFoldDefenseHeroRebuyInstalled = true;
    return true;
  }

  function classifyHeroTightness(input = {}) {
    const stats = input.stats || state?.heroStyle || {};
    const sampleHands = Math.max(
      0,
      Math.trunc(finite(input.hands, Math.max(finite(stats.hands), tracker.opportunities))),
    );
    const vpipHands = Math.max(
      0,
      finite(input.vpipHands, Math.max(finite(stats.vpip), tracker.voluntaryHands)),
    );
    const foldHands = Math.max(0, finite(input.preflopFolds, tracker.preflopFolds));
    const opportunities = Math.max(0, finite(input.opportunities, Math.max(tracker.opportunities, sampleHands)));
    const vpipRate = sampleHands > 0 ? clamp(vpipHands / sampleHands, 0, 1) : 0;
    const preflopFoldRate = opportunities > 0 ? clamp(foldHands / opportunities, 0, 1) : 0;
    const ready = Math.max(sampleHands, opportunities) >= MIN_TIGHTNESS_HANDS;
    const lowVpip = ready && vpipRate <= LOW_VPIP_THRESHOLD;
    const highPreflopFold = ready && preflopFoldRate >= PREFLOP_FOLD_THRESHOLD;
    const confidence = ready
      ? clamp((Math.max(sampleHands, opportunities) - MIN_TIGHTNESS_HANDS + 4) / 18, 0.22, 1)
      : 0;
    return {
      ready,
      lowVpip,
      highPreflopFold,
      tightPassive: lowVpip || highPreflopFold,
      sampleHands,
      opportunities,
      vpipRate,
      preflopFoldRate,
      confidence,
    };
  }

  function boardDryness(board = state?.board || []) {
    if (!Array.isArray(board) || board.length < 3) return 0;
    const suits = new Map();
    const values = [...new Set(board.map(card => finite(card?.value)).filter(Boolean))].sort((a, b) => a - b);
    for (const card of board) suits.set(card?.suit, (suits.get(card?.suit) || 0) + 1);
    const maxSuit = Math.max(0, ...suits.values());
    const span = values.length ? values.at(-1) - values[0] : 12;
    const paired = values.length < board.length;
    let dryness = 0.52;
    if (maxSuit <= 2) dryness += 0.18;
    else dryness -= 0.16;
    if (span >= 5) dryness += 0.12;
    else dryness -= 0.12;
    if (paired) dryness += 0.08;
    return clamp(dryness, 0, 1);
  }

  function pressureFrequency(player, profile) {
    const base = PRESSURE_WEIGHT[player?.name] || 0.32;
    return clamp(base * (0.55 + profile.confidence * 0.65), 0.08, 0.72);
  }

  function legalPressureRaise(player, desiredRaiseBy) {
    const needed = typeof amountToCall === "function" ? amountToCall(player) : 0;
    const available = Math.max(0, finite(player?.stack) - needed);
    const minimum = Math.max(
      1,
      typeof minimumRaiseBy === "function" ? minimumRaiseBy() : (typeof currentBigBlind === "function" ? currentBigBlind() : 20),
    );
    if (player?.raiseLocked || available < minimum) return 0;
    const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 20);
    const capped = Math.min(available, Math.max(minimum, roundToUnit(desiredRaiseBy, Math.max(1, bigBlind / 2))));
    if (capped >= Math.max(0, finite(player?.stack) - bigBlind)) return 0;
    return capped;
  }

  function planPressure(player, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const profile = options.profile || classifyHeroTightness();
    if (!profile.tightPassive || !profile.ready) return null;
    if (!player || player.isHuman || SPECIAL_NAMES.has(player.name) || player.name === "Gemini") return null;
    if (!(OPENING_NAMES.has(player.name) || MIDDLE_NAMES.has(player.name) || ELITE_NAMES.has(player.name))) return null;
    const hero = typeof human === "function" ? human() : state?.players?.find(candidate => candidate?.isHuman);
    if (!hero || hero.folded || hero.allIn) return null;

    const boardCount = state?.board?.length || 0;
    const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 20);
    const pot = Math.max(1, finite(state?.pot, bigBlind * 2));
    const position = typeof positionLabel === "function" ? positionLabel(player) : "--";
    const frequency = pressureFrequency(player, profile);

    if (boardCount === 0) {
      const unopened = finite(state?.currentBet) <= bigBlind;
      const latePosition = ["HJ", "CO", "BTN", "SB"].includes(position);
      const strength = typeof estimateStrength === "function" ? estimateStrength(player) : 0.5;
      const threshold = ["Leo", "Foxy", "Momo", "Nova", "Vlad"].includes(player.name) ? 0.30 : 0.36;
      if (!unopened || !latePosition || strength < threshold || random() >= frequency) return null;
      const targetMultiple = ["Toto", "Pao", "Dodo", "Bruno"].includes(player.name) ? 2.2 : 2.4;
      const targetBet = roundToUnit(bigBlind * targetMultiple, Math.max(1, bigBlind / 2));
      const raiseBy = legalPressureRaise(player, targetBet - finite(state?.currentBet));
      if (!raiseBy) return null;
      return {
        action: "raise",
        raiseBy,
        street: "preflop",
        reason: `${player.name} 針對低 VPIP／高棄牌率，以小尺寸擴張偷盲`,
        exploitApplied: "low-vpip-steal",
        profile,
        publicInformationOnly: true,
      };
    }

    const activeCount = (state?.players || []).filter(candidate => candidate && !candidate.folded).length;
    const needed = typeof amountToCall === "function" ? amountToCall(player) : 0;
    const dry = boardDryness(state?.board || []);
    const strength = typeof estimateStrength === "function" ? estimateStrength(player) : 0.5;
    if (
      boardCount >= 3
      && boardCount <= 4
      && activeCount <= 3
      && finite(state?.currentBet) === 0
      && needed === 0
      && dry >= 0.62
      && strength >= 0.27
      && random() < frequency * 0.62
    ) {
      const fraction = ["Toto", "Pao", "Dodo", "Bruno"].includes(player.name) ? 0.33 : 0.40;
      const raiseBy = legalPressureRaise(player, Math.max(bigBlind, pot * fraction));
      if (!raiseBy) return null;
      return {
        action: "raise",
        raiseBy,
        street: boardCount === 3 ? "flop" : "turn",
        reason: `${player.name} 針對高棄牌率，在乾燥牌面使用小尺寸持續施壓`,
        exploitApplied: "low-vpip-small-cbet",
        profile,
        publicInformationOnly: true,
      };
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
    say(player, player.allIn ? "allin" : "raise", {
      force: player.allIn,
      chance: 0.38,
    });
  }

  function installPressureLayer() {
    if (window.__economyFoldDefensePressureInstalled) return true;
    if (
      typeof botAction !== "function"
      || !window.AiOpeningStrategiesV23?.version
      || !window.AiCharacterStrategiesV13?.version
      || !window.AiMidEliteDecisionChainV26?.version
      || !window.AiTieredMultiwayEquityV27?.version
    ) return false;
    const previousBotAction = botAction;
    botAction = function botActionWithLowVpipDefense(player) {
      try {
        const plan = planPressure(player);
        if (plan) return executePressure(player, plan);
      } catch (error) {
        console.warn("Economy/Fold Defense pressure fallback", player?.name, error);
      }
      return previousBotAction(player);
    };
    botAction.__economyFoldDefensePressure = true;
    botAction.__original = previousBotAction;
    window.__economyFoldDefensePressureInstalled = true;
    return true;
  }

  function resetTracker({ persistent = false } = {}) {
    tracker = cleanTracker();
    sessionToken = `${Date.now()}:${Math.random()}`;
    if (persistent) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        // In-memory reset remains valid.
      }
    } else {
      persistTracker();
    }
    return classifyHeroTightness();
  }

  function refresh() {
    const actionReady = installActionTracking();
    const seatReady = installNormalSeatBalance();
    const catchupReady = installTournamentCatchup();
    const heroReady = catchupReady && installSymmetricHeroRebuy();
    const pressureReady = installPressureLayer();
    installAttempts += 1;
    const ready = actionReady && seatReady && catchupReady && heroReady && pressureReady;
    if (ready || installAttempts >= INSTALL_RETRY_LIMIT) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return ready;
  }

  window.EconomyFoldDefenseV1 = {
    version: VERSION,
    config: Object.freeze({
      normalRebuy: Object.freeze({
        tableAverageRatio: NORMAL_TABLE_AVERAGE_RATIO,
        buyInRatioCap: NORMAL_BUY_IN_RATIO_CAP,
        minBigBlinds: NORMAL_MIN_BIG_BLINDS,
        maxBigBlinds: NORMAL_MAX_BIG_BLINDS,
      }),
      tightness: Object.freeze({
        minimumHands: MIN_TIGHTNESS_HANDS,
        lowVpipThreshold: LOW_VPIP_THRESHOLD,
        preflopFoldThreshold: PREFLOP_FOLD_THRESHOLD,
      }),
      catchup: Object.freeze({
        heroLeadTrigger: HERO_LEAD_TRIGGER,
        profiles: CATCHUP_PROFILES,
      }),
    }),
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicPositions: true,
      publicBetSizes: true,
      aggregateHeroStatistics: true,
      visibleStacks: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    calculateNormalRebuy,
    calculateBossCatchup,
    classifyHeroTightness,
    tableLeadSnapshot,
    planPressure,
    tracker() {
      return {
        opportunities: tracker.opportunities,
        preflopFolds: tracker.preflopFolds,
        voluntaryHands: tracker.voluntaryHands,
        lastUpdatedAt: tracker.lastUpdatedAt,
      };
    },
    resetTracker,
    refresh,
    status() {
      return {
        version: VERSION,
        installed: Boolean(
          window.__economyFoldDefenseLogInstalled
          && window.__economyFoldDefenseSeatBalanceInstalled
          && window.__economyFoldDefenseCatchupInstalled
          && window.__economyFoldDefenseHeroRebuyInstalled
          && window.__economyFoldDefensePressureInstalled
        ),
        actionTracking: Boolean(window.__economyFoldDefenseLogInstalled),
        symmetricAiRebuy: Boolean(window.__economyFoldDefenseSeatBalanceInstalled),
        bossCatchup: Boolean(window.__economyFoldDefenseCatchupInstalled),
        symmetricHeroRebuy: Boolean(window.__economyFoldDefenseHeroRebuyInstalled),
        lowVpipPressure: Boolean(window.__economyFoldDefensePressureInstalled),
      };
    },
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 100);
  window.setTimeout(refresh, 400);
  window.setTimeout(refresh, 900);
  if (!installTimer) installTimer = window.setInterval(refresh, INSTALL_RETRY_MS);
})();
