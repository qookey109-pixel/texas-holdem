// Shared net-EV accounting for middle/elite AI and fair special bosses.
(() => {
  "use strict";

  if (window.AiEvAccountingV1?.version) return;

  const VERSION = "1.0.0";
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  let installTimer = 0;
  let basePatched = false;
  let bossPatched = false;
  let wrappedBotAction = null;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function callEv({ equity, pot, callAmount }) {
    const safeEquity = clamp(equity);
    const safePot = Math.max(0, Number(pot) || 0);
    const safeCall = Math.max(0, Number(callAmount) || 0);
    return safeEquity * (safePot + safeCall) - safeCall;
  }

  function showdownEv({ equity, finalPot, investment }) {
    const safeEquity = clamp(equity);
    const safeFinalPot = Math.max(0, Number(finalPot) || 0);
    const safeInvestment = Math.max(0, Number(investment) || 0);
    return safeEquity * safeFinalPot - safeInvestment;
  }

  function raiseEv({ equity, pot, callAmount, raiseBy, foldEquity }) {
    const safePot = Math.max(0, Number(pot) || 0);
    const safeCall = Math.max(0, Number(callAmount) || 0);
    const safeRaise = Math.max(0, Number(raiseBy) || 0);
    const safeFoldEquity = clamp(foldEquity);
    const investment = safeCall + safeRaise;
    const finalPot = safePot + investment;
    const calledEv = showdownEv({ equity, finalPot, investment });
    return safeFoldEquity * safePot + (1 - safeFoldEquity) * calledEv;
  }

  function repriceStrategyDecision(decision) {
    if (!decision?.context) return decision;
    const context = decision.context;
    const equity = clamp(decision.equityProxy ?? context.equityProxy);
    const pot = Math.max(0, Number(context.pot) || 0);
    const needed = Math.max(0, Number(context.needed) || 0);
    const correctedCallEv = callEv({ equity, pot, callAmount: needed });
    const candidates = (decision.candidates || []).map(candidate => {
      const correctedEv = raiseEv({
        equity,
        pot,
        callAmount: needed,
        raiseBy: candidate.raiseBy,
        foldEquity: candidate.foldEquity,
      });
      return {
        ...candidate,
        legacyEv: candidate.ev,
        ev: correctedEv,
        netEvAccounting: true,
      };
    }).sort((left, right) => Number(right.ev) - Number(left.ev));

    const bestRaise = candidates[0] || null;
    decision.candidates = candidates;
    decision.callEv = correctedCallEv;
    decision.bestRaiseEv = bestRaise?.ev ?? Number.NEGATIVE_INFINITY;
    decision.evAccountingVersion = VERSION;

    if (decision.action === "raise" && bestRaise) {
      decision.raiseBy = bestRaise.raiseBy;
      decision.sizeFraction = bestRaise.fraction;
      if (bestRaise.ev <= Math.max(0, correctedCallEv)) {
        decision.action = needed > 0 && correctedCallEv < 0 ? "fold" : "call";
        decision.raiseBy = 0;
        decision.sizeFraction = 0;
        decision.reason = needed > 0 && correctedCallEv < 0
          ? "修正淨 EV 後停止負期望投入"
          : "修正淨 EV 後保留跟注／過牌線";
      }
    }
    return decision;
  }

  function repriceBossDecision(decision) {
    if (!decision?.context) return decision;
    const context = decision.context;
    const equity = clamp(decision.equity);
    const pot = Math.max(0, Number(context.pot) || 0);
    const needed = Math.max(0, Number(context.needed) || 0);
    const correctedCallEv = callEv({ equity, pot, callAmount: needed });
    const correctedRaiseEv = decision.raiseBy > 0
      ? raiseEv({
        equity,
        pot,
        callAmount: needed,
        raiseBy: decision.raiseBy,
        foldEquity: decision.foldEquity,
      })
      : Number.NEGATIVE_INFINITY;

    decision.legacyCallEv = decision.callEv;
    decision.legacyRaiseEv = decision.raiseEv;
    decision.callEv = correctedCallEv;
    decision.raiseEv = correctedRaiseEv;
    decision.evAccountingVersion = VERSION;

    if (decision.action === "raise" && correctedRaiseEv <= Math.max(0, correctedCallEv)) {
      decision.action = needed > 0 && correctedCallEv < 0 ? "fold" : "call";
      decision.raiseBy = 0;
    }
    return decision;
  }

  function patchBaseStrategy() {
    const base = window.AiCharacterStrategies;
    if (!base?.chooseDecision || base.__evAccountingPatched) return Boolean(base?.__evAccountingPatched);
    const originalChooseDecision = base.chooseDecision.bind(base);
    base.chooseDecision = function chooseDecisionWithNetEv(player, options = {}) {
      return repriceStrategyDecision(originalChooseDecision(player, options));
    };
    base.__evAccountingPatched = true;
    base.evAccountingVersion = VERSION;
    basePatched = true;
    return true;
  }

  function performBossDecision(player, decision) {
    player.status = "Thinking...";
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
    if (decision.action === "raise" && decision.raiseBy > 0) {
      raisePlayer(player, decision.raiseBy);
      if (!state.isMuted) Audio.raise();
      logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
      announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
      say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
      return;
    }
    const needed = Math.max(0, amountToCall(player));
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
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: 0.2 });
  }

  function patchBossStrategy() {
    const bosses = window.FairSpecialBosses;
    if (!bosses?.chooseDecision || typeof botAction !== "function") return false;
    if (!bosses.__evAccountingPatched) {
      const originalChooseDecision = bosses.chooseDecision.bind(bosses);
      bosses.chooseDecision = function chooseBossDecisionWithNetEv(player) {
        return repriceBossDecision(originalChooseDecision(player));
      };
      bosses.__evAccountingPatched = true;
      bosses.evAccountingVersion = VERSION;
    }

    if (wrappedBotAction !== botAction) {
      const previousBotAction = botAction;
      const wrapper = function botActionWithNetEvBosses(player) {
        if (SPECIAL_NAMES.has(player?.name)) {
          const decision = bosses.chooseDecision(player);
          return performBossDecision(player, decision);
        }
        return previousBotAction(player);
      };
      wrapper.__aiEvAccountingWrapper = true;
      wrappedBotAction = wrapper;
      botAction = wrapper;
    }
    bossPatched = true;
    return true;
  }

  function refresh() {
    patchBaseStrategy();
    patchBossStrategy();
    const ready = basePatched && bossPatched;
    document.documentElement.dataset.aiEvAccounting = ready ? "ready" : "loading";
    if (ready && installTimer) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return ready;
  }

  window.AiEvAccountingV1 = {
    version: VERSION,
    callEv,
    showdownEv,
    raiseEv,
    repriceStrategyDecision,
    repriceBossDecision,
    refresh,
  };

  if (!refresh()) installTimer = window.setInterval(refresh, 50);
})();
