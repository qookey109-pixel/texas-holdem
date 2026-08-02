// Balance replacement stacks against the surviving table instead of granting a full fresh buy-in.
(() => {
  "use strict";

  if (window.ReplacementStackBalance?.version) return;

  const TABLE_AVERAGE_RATIO = 0.70;
  const BUY_IN_RATIO_CAP = 0.60;
  const MAX_BIG_BLINDS = 40;
  const MIN_BIG_BLINDS = 10;
  const INSTALL_RETRY_MS = 25;
  const INSTALL_RETRY_LIMIT = 240;

  let installed = false;
  let retryCount = 0;
  let originalBuildNextAiSeats = null;
  let originalStartHand = null;
  let originalLog = null;
  const latestNormalReplacementStacks = new Map();

  function levelForBalance({ nextHand = false } = {}) {
    const handNumber = Math.max(
      1,
      Number(state?.handNumber || 0) + (nextHand ? 1 : 0),
    );

    if (typeof blindLevelForHand === "function") {
      return blindLevelForHand(handNumber);
    }

    return {
      big: typeof currentBigBlind === "function" ? currentBigBlind() : 20,
      buyIn: typeof currentBuyIn === "function" ? currentBuyIn() : 2000,
    };
  }

  function positiveStacks(players) {
    return (Array.isArray(players) ? players : [])
      .filter(player => player && Number(player.stack) > 0)
      .map(player => Number(player.stack));
  }

  function calculateReplacementStack(players = state?.players, options = {}) {
    const level = levelForBalance(options);
    const bigBlind = Math.max(1, Number(level?.big || 20));
    const fullBuyIn = Math.max(bigBlind, Number(level?.buyIn || bigBlind * 100));
    const stacks = positiveStacks(players);
    const tableAverage = stacks.length
      ? stacks.reduce((sum, stack) => sum + stack, 0) / stacks.length
      : fullBuyIn;

    const minimum = bigBlind * MIN_BIG_BLINDS;
    const rawTarget = Math.min(
      tableAverage * TABLE_AVERAGE_RATIO,
      fullBuyIn * BUY_IN_RATIO_CAP,
      bigBlind * MAX_BIG_BLINDS,
    );
    const roundedDown = Math.floor(rawTarget / bigBlind) * bigBlind;
    return Math.max(minimum, roundedDown || minimum);
  }

  function installNormalModeBalance() {
    if (typeof buildNextAiSeats !== "function") return false;
    if (buildNextAiSeats.__replacementStackBalanced === true) return true;

    originalBuildNextAiSeats = buildNextAiSeats;
    const balancedBuildNextAiSeats = function balancedBuildNextAiSeats(previousPlayers) {
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      if (!Array.isArray(previousPlayers) || !previousPlayers.length) return seats;

      const replacementStack = calculateReplacementStack(previousPlayers);
      latestNormalReplacementStacks.clear();

      return seats.map(seat => {
        if (!seat?.replaced) return seat;
        const name = seat.profile?.name || "";
        if (name) latestNormalReplacementStacks.set(name, replacementStack);
        return {
          ...seat,
          stack: replacementStack,
          replacementStackBalanced: true,
        };
      });
    };

    balancedBuildNextAiSeats.__replacementStackBalanced = true;
    balancedBuildNextAiSeats.__original = originalBuildNextAiSeats;
    buildNextAiSeats = balancedBuildNextAiSeats;
    return true;
  }

  function installTournamentModeBalance() {
    if (typeof startHand !== "function" || typeof currentBuyIn !== "function") return false;
    if (startHand.__replacementStackBalanced === true) return true;

    originalStartHand = startHand;
    const balancedStartHand = function balancedStartHand(...args) {
      const tournamentActive = Boolean(window.TournamentMode?.isActive?.());
      const previousPlayers = Array.isArray(state?.players) ? state.players : [];

      if (!tournamentActive || !previousPlayers.length) {
        return originalStartHand.apply(this, args);
      }

      const replacementStack = calculateReplacementStack(previousPlayers, {
        nextHand: true,
      });
      const savedCurrentBuyIn = currentBuyIn;

      currentBuyIn = function balancedTournamentBuyIn() {
        return replacementStack;
      };

      try {
        return originalStartHand.apply(this, args);
      } finally {
        currentBuyIn = savedCurrentBuyIn;
      }
    };

    balancedStartHand.__replacementStackBalanced = true;
    balancedStartHand.__original = originalStartHand;
    startHand = balancedStartHand;
    return true;
  }

  function installLogCorrection() {
    if (typeof log !== "function") return false;
    if (log.__replacementStackBalanced === true) return true;

    originalLog = log;
    const balancedLog = function balancedLog(message, ...rest) {
      let text = String(message ?? "");

      for (const [name, stack] of latestNormalReplacementStacks.entries()) {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(
          new RegExp(`(${escapedName} 帶入 )\\d+( 加入牌桌)`),
          `$1${stack}$2`,
        );
      }

      return originalLog.call(this, text, ...rest);
    };

    balancedLog.__replacementStackBalanced = true;
    balancedLog.__original = originalLog;
    log = balancedLog;
    return true;
  }

  function install() {
    if (installed) return true;

    const normalReady = installNormalModeBalance();
    const tournamentReady = installTournamentModeBalance();
    const logReady = installLogCorrection();

    if (!normalReady || !tournamentReady || !logReady) return false;

    installed = true;
    document.documentElement.dataset.replacementStackBalance = "active";
    return true;
  }

  function retryInstall() {
    if (install()) return;
    retryCount += 1;
    if (retryCount >= INSTALL_RETRY_LIMIT) return;
    window.setTimeout(retryInstall, INSTALL_RETRY_MS);
  }

  window.ReplacementStackBalance = {
    version: "1.0.0",
    install,
    calculate(players, options = {}) {
      return calculateReplacementStack(players, options);
    },
    rules: {
      tableAverageRatio: TABLE_AVERAGE_RATIO,
      buyInRatioCap: BUY_IN_RATIO_CAP,
      maxBigBlinds: MAX_BIG_BLINDS,
      minBigBlinds: MIN_BIG_BLINDS,
    },
    isInstalled() {
      return installed;
    },
  };

  retryInstall();
})();
