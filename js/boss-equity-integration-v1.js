// Integrate the fair exact-river / true-multiway equity engine into Oracle and Chronos.
(() => {
  "use strict";

  if (window.BossEquityIntegrationV1?.version === "1.0.0") return;

  const VERSION = "1.0.0";
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  let installTimer = 0;
  let installAttempts = 0;
  let lastDecision = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function fallbackDecision(player, error) {
    const fallback = window.FairSpecialBosses?.chooseDecision?.(player) || null;
    if (fallback) {
      fallback.equityEngine = "legacy-fallback";
      fallback.equityEngineError = String(error?.message || error || "unavailable");
    }
    return fallback;
  }

  function estimate(player) {
    const engine = window.BossFairEquityEngineV1;
    if (!engine?.estimate) throw new Error("BossFairEquityEngineV1 unavailable");
    const opponents = engine.activeOpponentCount(player);
    const boardCards = Array.isArray(state?.board) ? state.board.length : 0;
    const samples = player?.name === "Chronos" ? 480 : 360;
    return engine.estimate(player, {
      opponentCount: opponents,
      samples,
      exactRiverHeadsUp: boardCards === 5 && opponents === 1,
    });
  }

  function decide(player) {
    try {
      const context = window.FairSpecialBosses?.publicContext?.(player);
      if (!context) throw new Error("FairSpecialBosses context unavailable");
      const result = estimate(player);
      const equity = clamp(result.equity, 0.001, 0.999);
      const needed = Math.max(0, Number(context.needed) || 0);
      const pot = Math.max(0, Number(context.pot) || 0);
      const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 1);
      const stack = Math.max(0, Number(player?.stack) || 0);
      const availableRaise = Math.max(0, stack - needed);
      const minRaise = Math.max(1, typeof minimumRaiseBy === "function" ? minimumRaiseBy() : bigBlind);
      const canRaise = !player?.raiseLocked && availableRaise >= minRaise;
      const potOdds = needed / Math.max(1, pot + needed);
      const habits = context.habits || {};
      const sampleWeight = clamp((Number(habits.sample) || 0) / 20, 0, 1);
      const foldExploit = ((Number(habits.foldRate) || 0) - 0.3) * 0.24 * sampleWeight;
      const callPenalty = Math.max(0, (Number(habits.callRate) || 0) - 0.36) * 0.18 * sampleWeight;
      let foldEquity = clamp(0.24 + foldExploit - callPenalty, 0.08, 0.62);
      if (player?.name === "Chronos") foldEquity = foldEquity * 0.7 + 0.1;

      const callEv = window.AiEvAccountingV1?.callEv
        ? window.AiEvAccountingV1.callEv({ equity, pot, callAmount: needed })
        : equity * (pot + needed) - needed;
      const raiseFactor = player?.name === "Chronos" ? 0.72 : 0.62;
      const raiseBy = canRaise
        ? Math.min(availableRaise, Math.max(minRaise, Math.round((pot * raiseFactor + bigBlind) / 10) * 10))
        : 0;
      const raiseEv = canRaise
        ? (window.AiEvAccountingV1?.raiseEv
          ? window.AiEvAccountingV1.raiseEv({ equity, pot, callAmount: needed, raiseBy, foldEquity })
          : foldEquity * pot + (1 - foldEquity) * (equity * (pot + needed + raiseBy) - (needed + raiseBy)))
        : Number.NEGATIVE_INFINITY;

      const strongValue = equity >= ((state?.board?.length || 0) >= 3 ? 0.57 : 0.7);
      const premiumValue = equity >= ((state?.board?.length || 0) >= 3 ? 0.74 : 0.84);
      const stackBb = stack / bigBlind;
      const bluffFrequency = clamp(
        (player?.name === "Oracle" ? 0.17 : 0.12) + foldExploit - callPenalty,
        0.04,
        player?.name === "Oracle" ? 0.36 : 0.28,
      );
      const mixedBluff = canRaise
        && equity < 0.46
        && needed <= stack * 0.12
        && stackBb > 18
        && Math.random() < bluffFrequency;
      const trap = needed === 0
        && strongValue
        && player?.name === "Chronos"
        && Math.random() < 0.2;
      const jam = canRaise && premiumValue && stackBb <= 13 && Math.random() < 0.72;

      let action = "call";
      let chosenRaiseBy = 0;
      if (needed > 0 && callEv < -(bigBlind * 0.08) && !mixedBluff) {
        action = "fold";
      } else if (!trap && canRaise && (jam || mixedBluff || (strongValue && raiseEv > callEv))) {
        action = "raise";
        chosenRaiseBy = jam ? availableRaise : raiseBy;
      }

      lastDecision = {
        actor: player?.name || "",
        action,
        raiseBy: chosenRaiseBy,
        equity,
        rawEquity: result.equity,
        equityMethod: result.method,
        equitySamples: result.samples,
        opponentCount: result.opponentCount,
        potOdds,
        foldEquity,
        callEv,
        raiseEv,
        context,
        equityEngine: VERSION,
        fairPublicInformationOnly: true,
      };
      return lastDecision;
    } catch (error) {
      return fallbackDecision(player, error);
    }
  }

  function perform(player, decision) {
    if (!decision) return window.__bossEquityIntegrationPreviousBotAction?.(player);
    if (decision.action === "fold") {
      player.folded = true;
      player.hasActed = true;
      player.raiseLocked = false;
      player.status = "棄牌";
      player.lastAction = "fold";
      if (!state.isMuted) Audio.fold();
      logAction(player, "Fold");
      announceAction("FOLD", "fold");
      say(player, "fold", { chance: 0.22 });
      return;
    }
    if (decision.action === "raise") {
      raisePlayer(player, decision.raiseBy);
      if (!state.isMuted) Audio.raise();
      logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
      announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
      say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
      return;
    }
    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    const paid = pay(player, needed);
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : (paid === 0 ? "過牌" : `跟注 ${paid}`);
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    if (paid === 0) {
      if (!state.isMuted) Audio.check();
    } else if (!state.isMuted) Audio.chip();
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: 0.2 });
  }

  function install() {
    if (typeof botAction !== "function" || !window.FairSpecialBosses?.version || !window.BossFairEquityEngineV1?.version) return false;
    if (window.__bossEquityIntegrationInstalled === VERSION) return true;
    const previous = botAction;
    window.__bossEquityIntegrationPreviousBotAction = previous;
    botAction = function botActionWithBossEquityIntegration(player) {
      if (!SPECIAL_NAMES.has(player?.name)) return previous.apply(this, arguments);
      player.status = "Thinking...";
      const decision = decide(player);
      player.lastStrategyDecision = { ...(player.lastStrategyDecision || {}), ...decision };
      return perform(player, decision);
    };
    window.__bossEquityIntegrationInstalled = VERSION;
    document.documentElement.dataset.bossEquityIntegration = "ready";
    return true;
  }

  window.BossEquityIntegrationV1 = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActiveSeats: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    estimate,
    decide,
    getLastDecision: () => lastDecision,
    refresh: install,
  };

  function boot() {
    if (install()) return;
    window.clearInterval(installTimer);
    installTimer = window.setInterval(() => {
      installAttempts += 1;
      if (!install() && installAttempts < 240) return;
      window.clearInterval(installTimer);
      installTimer = 0;
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
