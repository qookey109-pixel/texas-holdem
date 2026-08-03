// V1.2 difficulty layer: position-aware opens, blind defense, 3-bets, 4-bets, and squeezes.
(() => {
  "use strict";

  if (window.AiCharacterStrategiesV12?.version) return;

  const VERSION = "1.2.0";
  let installTimer = 0;
  let installAttempts = 0;

  function performFold(player) {
    player.folded = true;
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = "棄牌";
    player.lastAction = "fold";
    if (!state.isMuted) Audio.fold();
    logAction(player, "Fold");
    announceAction("FOLD", "fold");
    say(player, "fold", { chance: 0.24 });
  }

  function performRaise(player, raiseBy) {
    raisePlayer(player, raiseBy);
    if (!state.isMuted) Audio.raise();
    logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
    announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    say(player, player.allIn ? "allin" : "raise", {
      force: player.allIn,
      chance: 0.42,
    });
  }

  function performCall(player, needed) {
    const paid = pay(player, needed);
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : (paid === 0 ? "過牌" : `跟注 ${paid}`);
    if (paid === 0) {
      if (!state.isMuted) Audio.check();
    } else if (!state.isMuted) Audio.chip();
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), {
      chance: player.allIn && paid > 0 ? 0.3 : (paid === 0 ? 0.15 : 0.2),
    });
  }

  function executeDecision(player, decision) {
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyId: player.strategyId || "",
      strategyVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      stage: decision.stage,
      handCode: decision.hand?.code || "--",
      handScore: decision.hand?.score || 0,
      position: decision.context?.position || "",
      raiseBy: decision.raiseBy || 0,
      steal: Boolean(decision.steal),
      bluff: Boolean(decision.bluff),
      squeeze: Boolean(decision.squeeze),
      allInIntent: Boolean(decision.allInIntent),
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player, amountToCall(player));
  }

  function chooseDecision(player, options = {}) {
    const engine = window.AiPreflopRangeEngine;
    if (!engine?.supports?.(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    if ((state?.board?.length || 0) > 0) {
      return window.AiCharacterStrategiesV11?.chooseDecision?.(player, options)
        || { action: "fallback", strategyVersion: VERSION };
    }
    return engine.chooseDecision(player, options);
  }

  function registerProfiles() {
    const engine = window.AiPreflopRangeEngine;
    if (!engine?.supportedNames || typeof AI_ROSTER === "undefined") return false;
    for (const name of engine.supportedNames) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      if (!profile) continue;
      Object.assign(profile, {
        strategyUpgradeVersion: VERSION,
        preflopRangeEngine: true,
        positionAwareOpening: true,
        blindDefenseAware: true,
        threeBetAware: true,
        fourBetAware: true,
        squeezeAware: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].strategyUpgradeVersion = VERSION;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    const engine = window.AiPreflopRangeEngine;
    if (window.__aiCharacterStrategyV12Installed) return true;
    if (!engine?.version || typeof botAction !== "function") return false;

    const previousBotAction = botAction;
    window.__aiCharacterStrategyV12PreviousBotAction = previousBotAction;
    botAction = function botActionWithPreflopRanges(player) {
      if (!engine.supports(player?.name) || (state?.board?.length || 0) > 0) {
        return previousBotAction(player);
      }
      try {
        const decision = chooseDecision(player);
        if (decision.action === "fallback") return previousBotAction(player);
        return executeDecision(player, decision);
      } catch (error) {
        console.warn("AI strategy V1.2 fallback", player?.name, error);
        return previousBotAction(player);
      }
    };
    window.__aiCharacterStrategyV12Installed = true;
    return true;
  }

  function refresh() {
    window.AiActionMemory?.refresh?.();
    const profilesReady = registerProfiles();
    const installed = installDecisionLayer();
    if ((profilesReady && installed) || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return profilesReady && installed;
  }

  window.AiCharacterStrategiesV12 = {
    version: VERSION,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicPosition: true,
      publicActions: true,
      publicBetSizes: true,
      publicHeroStatistics: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    chooseDecision,
    refresh,
  };

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
