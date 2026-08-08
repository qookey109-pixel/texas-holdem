// Balance normal-mode replacements and run the isolated G1 tournament economy playtest.
(() => {
  "use strict";

  if (window.ReplacementStackBalance?.version === "2.1.0") return;

  // Normal Economy V2: base replacements on the table median so one chip leader
  // cannot distort the next entrant. Survivors retain an edge, while very short
  // tables no longer force a newcomer above the typical live stack.
  const NORMAL_TABLE_MEDIAN_RATIO = 0.80;
  const NORMAL_BUY_IN_RATIO_CAP = 0.75;
  const NORMAL_MAX_BIG_BLINDS = 60;
  const NORMAL_SOFT_FLOOR_BIG_BLINDS = 12;

  const TOURNAMENT_FULL_TABLE_TARGET_BB = 170;
  const TOURNAMENT_BLEND_RESPONSE = 0.15;
  const TOURNAMENT_LEVELS = Object.freeze([
    [1, 10, 20], [5, 15, 30], [9, 25, 50], [13, 40, 80],
    [17, 60, 120], [21, 100, 200], [25, 150, 300], [30, 200, 400],
    [35, 300, 600], [40, 400, 800], [45, 600, 1200], [50, 800, 1600],
    [55, 1200, 2400], [60, 1600, 3200], [65, 2400, 4800],
    [70, 3200, 6400], [75, 4800, 9600], [80, 6400, 12800],
    [85, 8000, 16000], [95, 12000, 24000], [105, 16000, 32000],
    [115, 24000, 48000], [125, 32000, 64000], [135, 48000, 96000],
    [145, 64000, 128000], [155, 80000, 160000],
  ]);
  const TOURNAMENT_ROLE_BB = Object.freeze({
    middle: Object.freeze({ min: 80, target: 90, max: 100 }),
    elite: Object.freeze({ min: 90, target: 105, max: 120 }),
    special: Object.freeze({ min: 100, target: 115, max: 135 }),
    gemini: Object.freeze({ min: 110, target: 130, max: 150 }),
  });
  const MIDDLE_NAMES = new Set(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE_NAMES = new Set(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  const INSTALL_RETRY_MS = 25;
  const INSTALL_RETRY_LIMIT = 240;
  const MAX_DIAGNOSTICS = 120;

  let installed = false;
  let retryCount = 0;
  let originalBuildNextAiSeats = null;
  let originalBlindLevelForHand = null;
  let originalCurrentBuyIn = null;
  const latestNormalReplacementStacks = new Map();
  const tournamentDiagnostics = [];
  let tournamentEntryContext = null;
  let handledTournamentState = null;
  let handledAppearedList = null;
  const handledTournamentAppearances = new Set();

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function positiveStacks(players) {
    return (Array.isArray(players) ? players : [])
      .filter(player => player && Number(player.stack) > 0)
      .map(player => Number(player.stack));
  }

  function median(values) {
    if (!Array.isArray(values) || !values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function isTournamentActive() {
    return Boolean(window.TournamentMode?.isActive?.());
  }

  function levelForNormalBalance(options = {}) {
    if (options.bigBlind || options.buyIn) {
      const big = Math.max(1, Number(options.bigBlind || currentBigBlind?.() || 20));
      return {
        big,
        buyIn: Math.max(big, Number(options.buyIn || currentBuyIn?.() || big * 100)),
      };
    }
    const handNumber = Math.max(1, Number(state?.handNumber || 0) + (options.nextHand ? 1 : 0));
    if (typeof originalBlindLevelForHand === "function") {
      return originalBlindLevelForHand(handNumber);
    }
    if (typeof blindLevelForHand === "function") return blindLevelForHand(handNumber);
    return {
      big: typeof currentBigBlind === "function" ? currentBigBlind() : 20,
      buyIn: 2000,
    };
  }

  function calculateNormalReplacementPlan(players = state?.players, options = {}) {
    const level = levelForNormalBalance(options);
    const bigBlind = Math.max(1, Number(level?.big || 20));
    const fullBuyIn = Math.max(bigBlind, Number(level?.buyIn || bigBlind * 100));
    const stacks = positiveStacks(players);
    const tableMedian = stacks.length ? median(stacks) : fullBuyIn;
    const rawTarget = Math.min(
      tableMedian * NORMAL_TABLE_MEDIAN_RATIO,
      fullBuyIn * NORMAL_BUY_IN_RATIO_CAP,
      bigBlind * NORMAL_MAX_BIG_BLINDS,
    );
    const softFloor = Math.min(tableMedian, bigBlind * NORMAL_SOFT_FLOOR_BIG_BLINDS);
    const boundedTarget = Math.min(tableMedian, Math.max(rawTarget, softFloor));
    const roundedDown = Math.floor(boundedTarget / bigBlind) * bigBlind;
    const minimumPlayable = Math.min(tableMedian, bigBlind);
    const stack = Math.max(minimumPlayable, roundedDown || minimumPlayable);
    return {
      strategy: "median-v2",
      bigBlind,
      fullBuyIn,
      tableMedian,
      rawTarget,
      softFloor,
      boundedTarget,
      stack,
      actualEntryBb: stack / bigBlind,
    };
  }

  function calculateNormalReplacementStack(players = state?.players, options = {}) {
    return calculateNormalReplacementPlan(players, options).stack;
  }

  function tournamentBlindLevelForHand(handNumber) {
    const safeHand = Math.max(1, Number(handNumber) || 1);
    let selectedIndex = 0;
    for (let index = 0; index < TOURNAMENT_LEVELS.length; index += 1) {
      if (safeHand < TOURNAMENT_LEVELS[index][0]) break;
      selectedIndex = index;
    }
    const selected = TOURNAMENT_LEVELS[selectedIndex];
    return {
      level: selectedIndex + 1,
      small: selected[1],
      big: selected[2],
      buyIn: 2000,
      tournamentEconomy: "G1",
    };
  }

  function tierForName(name) {
    const externalTier = window.AiTierBossSystem?.tierForName?.(name)?.key;
    if (TOURNAMENT_ROLE_BB[externalTier]) return externalTier;
    if (name === "Gemini") return "gemini";
    if (SPECIAL_NAMES.has(name)) return "special";
    if (ELITE_NAMES.has(name)) return "elite";
    if (MIDDLE_NAMES.has(name)) return "middle";
    return "middle";
  }

  function calculateTournamentEntryFromRunningChips(name, runningChips, handNumber) {
    const level = tournamentBlindLevelForHand(handNumber);
    const bigBlind = Math.max(1, Number(level.big));
    const chipUnit = Math.max(1, Number(level.small));
    const tier = tierForName(name);
    const role = TOURNAMENT_ROLE_BB[tier] || TOURNAMENT_ROLE_BB.middle;
    const currentTableBb = Math.max(0, Number(runningChips) || 0) / bigBlind;
    const tableGapBb = TOURNAMENT_FULL_TABLE_TARGET_BB - currentTableBb;
    const rawEntryBb = role.target
      + TOURNAMENT_BLEND_RESPONSE * (tableGapBb - role.target);
    const boundedEntryBb = clamp(rawEntryBb, role.min, role.max);
    const minimumStack = role.min * bigBlind;
    const maximumStack = role.max * bigBlind;
    const roundedStack = Math.round((boundedEntryBb * bigBlind) / chipUnit) * chipUnit;
    const stack = clamp(roundedStack, minimumStack, maximumStack);
    return {
      name,
      tier,
      handNumber,
      blindLevel: level.level,
      smallBlind: level.small,
      bigBlind,
      currentTableBb,
      fullTableTargetBb: TOURNAMENT_FULL_TABLE_TARGET_BB,
      tableGapBb,
      rawEntryBb,
      actualEntryBb: stack / bigBlind,
      stack,
    };
  }

  function calculateTournamentEntries(
    players = state?.players,
    candidateNames = [],
    { handNumber = Math.max(1, Number(state?.handNumber || 0) + 1) } = {},
  ) {
    let runningChips = positiveStacks(players).reduce((sum, stack) => sum + stack, 0);
    return candidateNames.map(name => {
      const plan = calculateTournamentEntryFromRunningChips(name, runningChips, handNumber);
      runningChips += plan.stack;
      return plan;
    });
  }

  function recordTournamentDiagnostic(plan) {
    tournamentDiagnostics.push({ ...plan, recordedAt: Date.now() });
    console.info("[TournamentEconomyG1]", { ...plan });
    if (tournamentDiagnostics.length > MAX_DIAGNOSTICS) {
      tournamentDiagnostics.splice(0, tournamentDiagnostics.length - MAX_DIAGNOSTICS);
    }
  }

  function currentReplacementAppearance() {
    if (!isTournamentActive()) return null;
    const players = Array.isArray(state?.players) ? state.players : [];
    if (!players.length) return null;
    const appeared = state?.tournament?.appeared;
    if (!Array.isArray(appeared) || !appeared.length) return null;

    const appearanceIndex = appeared.length - 1;
    const name = appeared[appearanceIndex];
    if (!name) return null;
    if (players.some(player => player?.name === name)) return null;
    if (state?.tournament?.eliminated?.includes?.(name)) return null;
    return { name, appearanceIndex, appeared };
  }

  function tournamentReplacementBuyIn() {
    const appearance = currentReplacementAppearance();
    if (!appearance) return null;

    const tournament = state.tournament;
    if (
      handledTournamentState !== tournament
      || handledAppearedList !== appearance.appeared
    ) {
      handledTournamentState = tournament;
      handledAppearedList = appearance.appeared;
      handledTournamentAppearances.clear();
    }

    const appearanceKey = `${appearance.appearanceIndex}:${appearance.name}`;
    if (handledTournamentAppearances.has(appearanceKey)) return null;

    const nextHandNumber = Math.max(1, Number(state?.handNumber || 0) + 1);
    const playersRef = state.players;
    if (
      !tournamentEntryContext
      || tournamentEntryContext.nextHandNumber !== nextHandNumber
      || tournamentEntryContext.playersRef !== playersRef
    ) {
      tournamentEntryContext = {
        nextHandNumber,
        playersRef,
        runningChips: positiveStacks(playersRef).reduce((sum, stack) => sum + stack, 0),
        handledAppearances: new Set(),
      };
    }

    if (tournamentEntryContext.handledAppearances.has(appearanceKey)) return null;

    const plan = calculateTournamentEntryFromRunningChips(
      appearance.name,
      tournamentEntryContext.runningChips,
      nextHandNumber,
    );
    handledTournamentAppearances.add(appearanceKey);
    tournamentEntryContext.handledAppearances.add(appearanceKey);
    tournamentEntryContext.runningChips += plan.stack;
    recordTournamentDiagnostic(plan);
    return plan.stack;
  }

  function installNormalModeBalance() {
    if (typeof buildNextAiSeats !== "function") return false;
    if (buildNextAiSeats.__replacementStackBalancedV2 === true) return true;

    originalBuildNextAiSeats = buildNextAiSeats;
    const balancedBuildNextAiSeats = function balancedBuildNextAiSeats(previousPlayers) {
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      if (!Array.isArray(previousPlayers) || !previousPlayers.length) return seats;
      const plan = calculateNormalReplacementPlan(previousPlayers);
      latestNormalReplacementStacks.clear();
      return seats.map(seat => {
        if (!seat?.replaced) return seat;
        const name = seat.profile?.name || "";
        if (name) latestNormalReplacementStacks.set(name, plan.stack);
        return {
          ...seat,
          stack: plan.stack,
          replacementStackBalanced: true,
          replacementStackPolicy: plan.strategy,
        };
      });
    };
    balancedBuildNextAiSeats.__replacementStackBalancedV2 = true;
    balancedBuildNextAiSeats.__original = originalBuildNextAiSeats;
    buildNextAiSeats = balancedBuildNextAiSeats;
    return true;
  }

  function installTournamentModeBalance() {
    if (typeof blindLevelForHand !== "function" || typeof currentBuyIn !== "function") {
      return false;
    }

    if (blindLevelForHand.__tournamentEconomyG1 !== true) {
      originalBlindLevelForHand = originalBlindLevelForHand || blindLevelForHand;
      const tournamentAwareBlindLevelForHand = function tournamentAwareBlindLevelForHand(handNumber) {
        if (isTournamentActive()) return tournamentBlindLevelForHand(handNumber);
        return originalBlindLevelForHand(handNumber);
      };
      tournamentAwareBlindLevelForHand.__tournamentEconomyG1 = true;
      tournamentAwareBlindLevelForHand.__original = originalBlindLevelForHand;
      blindLevelForHand = tournamentAwareBlindLevelForHand;
    } else if (!originalBlindLevelForHand) {
      originalBlindLevelForHand = blindLevelForHand.__original;
    }

    if (currentBuyIn.__tournamentEconomyG1 !== true) {
      originalCurrentBuyIn = originalCurrentBuyIn || currentBuyIn;
      const tournamentAwareCurrentBuyIn = function tournamentAwareCurrentBuyIn() {
        if (isTournamentActive()) {
          const replacementStack = tournamentReplacementBuyIn();
          if (Number.isFinite(replacementStack) && replacementStack > 0) {
            return replacementStack;
          }
        }
        return originalCurrentBuyIn();
      };
      tournamentAwareCurrentBuyIn.__tournamentEconomyG1 = true;
      tournamentAwareCurrentBuyIn.__original = originalCurrentBuyIn;
      currentBuyIn = tournamentAwareCurrentBuyIn;
    } else if (!originalCurrentBuyIn) {
      originalCurrentBuyIn = currentBuyIn.__original;
    }

    return Boolean(
      blindLevelForHand.__tournamentEconomyG1
      && currentBuyIn.__tournamentEconomyG1,
    );
  }

  function install() {
    const normalReady = installNormalModeBalance();
    const tournamentReady = installTournamentModeBalance();
    installed = normalReady && tournamentReady;
    if (!installed && retryCount < INSTALL_RETRY_LIMIT) {
      retryCount += 1;
      window.setTimeout(install, INSTALL_RETRY_MS);
    }
    return installed;
  }

  window.ReplacementStackBalance = {
    version: "2.1.0",
    calculate: calculateNormalReplacementStack,
    calculateNormalReplacementPlan,
    normalConfig: Object.freeze({
      version: "2.0.0",
      strategy: "median-v2",
      tableMedianRatio: NORMAL_TABLE_MEDIAN_RATIO,
      buyInRatioCap: NORMAL_BUY_IN_RATIO_CAP,
      softFloorBigBlinds: NORMAL_SOFT_FLOOR_BIG_BLINDS,
      maxBigBlinds: NORMAL_MAX_BIG_BLINDS,
    }),
    calculateTournamentEntries,
    tournamentBlindLevelForHand,
    tournamentConfig: Object.freeze({
      name: "G1",
      fullTableTargetBb: TOURNAMENT_FULL_TABLE_TARGET_BB,
      blendResponse: TOURNAMENT_BLEND_RESPONSE,
      roleProfiles: TOURNAMENT_ROLE_BB,
      theoreticalReplacementCeilingBb: 1500,
    }),
    diagnostics() {
      return tournamentDiagnostics.map(entry => ({ ...entry }));
    },
    clearDiagnostics() {
      tournamentDiagnostics.length = 0;
    },
    isInstalled() {
      return installed;
    },
    refresh: install,
  };

  document.documentElement.dataset.normalEconomy = "median-v2";
  document.documentElement.dataset.tournamentEconomyPlaytest = "G1";
  install();
})();
