// Realistic AI action pacing based on personality, table pressure, and accumulated experience.
(() => {
  "use strict";

  if (typeof window.continueBetting !== "function" || typeof window.botAction !== "function") return;

  const EXPERIENCE_KEY = "texasHoldemAiExperienceV1";
  const originalBotAction = window.botAction;
  const portraitMedia = window.matchMedia("(max-width: 900px) and (orientation: portrait)");
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const recordedHands = new Set();
  let experience = readExperience();
  let thinkingTimer = null;
  let followTimer = null;
  let scheduledHandNumber = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function readExperience() {
    try {
      const value = JSON.parse(localStorage.getItem(EXPERIENCE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) {
      return {};
    }
  }

  function saveExperience() {
    try {
      localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(experience));
    } catch (_) {
      // Timing still works for the current session when storage is unavailable.
    }
  }

  function statsFor(player) {
    const name = player?.name || "Unknown";
    if (!experience[name]) {
      experience[name] = {
        hands: 0,
        decisions: 0,
        pressureDecisions: 0,
        raises: 0,
        calls: 0,
        folds: 0,
        checks: 0,
      };
    }
    return experience[name];
  }

  function recordHandIfNeeded(player) {
    const key = `${sessionId}:${state.handNumber}:${player.name}`;
    if (recordedHands.has(key)) return statsFor(player);
    recordedHands.add(key);
    const stats = statsFor(player);
    stats.hands += 1;
    saveExperience();
    return stats;
  }

  function experienceLabel(stats) {
    if (stats.decisions >= 160) return "老練";
    if (stats.decisions >= 80) return "熟手";
    if (stats.decisions >= 30) return "常客";
    if (stats.decisions >= 10) return "適應中";
    return "新上桌";
  }

  function recordDecision(player, context) {
    const stats = statsFor(player);
    const action = player.lastAction || "check";
    stats.decisions += 1;
    if (context.pressureScore >= 2) stats.pressureDecisions += 1;
    if (action === "raise" || action === "allin") stats.raises += 1;
    else if (action === "call") stats.calls += 1;
    else if (action === "fold") stats.folds += 1;
    else stats.checks += 1;
    player.aiExperienceHands = stats.hands;
    player.aiExperienceDecisions = stats.decisions;
    player.aiExperienceLabel = experienceLabel(stats);
    saveExperience();
  }

  function personalityTiming(player) {
    const style = String(player.style || "").toLowerCase();
    const aggression = clamp(Number(player.aggression) || 0.5, 0, 1);
    const patience = clamp(Number(player.patience) || 0.5, 0, 1);
    let base = 720 + patience * 860 - aggression * 260;
    let variance = 420 + patience * 360;
    let tableGap = 310 + patience * 190;

    if (["aggro", "maniac", "alien"].includes(style)) {
      base -= 190;
      variance += 110;
      tableGap -= 60;
    }
    if (["nit", "rock", "cautious"].includes(style)) {
      base += 230;
      variance += 150;
      tableGap += 90;
    }
    if (["solver", "pro", "sniper", "trap", "mage"].includes(style)) {
      base += 160;
      tableGap += 55;
    }
    if (style === "call") base -= 70;
    if (style === "bluff") variance += 170;

    return { base, variance, tableGap, style };
  }

  function decisionContext(player) {
    const needed = amountToCall(player);
    const bigBlind = Math.max(1, currentBigBlind());
    const stack = Math.max(1, player.stack);
    const potInBigBlinds = state.pot / bigBlind;
    const callShare = needed / stack;
    const strength = estimateStrength(player);
    let extra = 0;
    let pressureScore = 0;

    if (needed === 0) extra -= 150;
    else {
      extra += 120;
      pressureScore += 1;
    }

    if (callShare >= 0.08) extra += 160;
    if (callShare >= 0.18) {
      extra += 360;
      pressureScore += 1;
    }
    if (callShare >= 0.35) {
      extra += 520;
      pressureScore += 1;
    }
    if (potInBigBlinds >= 20) extra += 180;
    if (potInBigBlinds >= 45) {
      extra += 260;
      pressureScore += 1;
    }
    if (state.board.length === 3) extra += 90;
    if (state.board.length === 4) extra += 210;
    if (state.board.length === 5) {
      extra += 360;
      pressureScore += 1;
    }
    if (player.raiseLocked) extra += 170;
    if (player.stack / bigBlind <= 10) extra += 190;

    return { needed, callShare, potInBigBlinds, strength, extra, pressureScore };
  }

  function thinkingDelay(player) {
    const timing = personalityTiming(player);
    const context = decisionContext(player);
    const stats = recordHandIfNeeded(player);
    const familiarity = clamp(Math.log2(stats.decisions + 1) / 7.2, 0, 1);
    const experienceFactor = 1.08 - familiarity * 0.22;
    const contextFactor = 1 - familiarity * 0.12;
    let delay = timing.base * experienceFactor
      + context.extra * contextFactor
      + random(-timing.variance * 0.35, timing.variance * 0.65);

    // Fast personalities sometimes snap-act in simple spots.
    if (["aggro", "maniac", "alien"].includes(timing.style)
      && context.pressureScore === 0
      && Math.random() < 0.42) {
      delay -= random(160, 300);
    }

    // Trap and bluff personalities sometimes pause longer to sell a story.
    if (["trap", "mage", "bluff"].includes(timing.style)
      && context.strength >= 0.58
      && Math.random() < 0.38) {
      delay += random(360, 760);
    }

    // Experienced solver-like players are fast in routine spots but still tank in big pots.
    if (["solver", "pro", "sniper"].includes(timing.style)
      && familiarity >= 0.55
      && context.pressureScore === 0) {
      delay -= 170;
    }

    player.aiExperienceHands = stats.hands;
    player.aiExperienceDecisions = stats.decisions;
    player.aiExperienceLabel = experienceLabel(stats);
    player.aiThinkingMs = Math.round(clamp(delay, 560, 3400));
    return { delay: player.aiThinkingMs, context, tableGap: timing.tableGap };
  }

  function clearTimers() {
    clearTimeout(thinkingTimer);
    clearTimeout(followTimer);
    thinkingTimer = null;
    followTimer = null;
    scheduledHandNumber = null;
  }

  function scheduleFollowUp(delay, handNumber) {
    scheduledHandNumber = handNumber;
    followTimer = setTimeout(() => {
      followTimer = null;
      scheduledHandNumber = null;
      window.continueBetting();
    }, delay);
  }

  function isScheduledActorStillValid(actor, handNumber) {
    return state.handNumber === handNumber
      && !state.handOver
      && state.players[actor.position] === actor
      && state.currentActorIndex === actor.position
      && needsAction(actor);
  }

  function scheduleBotAction(actor) {
    const timing = thinkingDelay(actor);
    const handNumber = state.handNumber;
    const position = actor.position;
    actor.status = "Thinking...";
    state.waitingForHuman = false;
    scheduledHandNumber = handNumber;
    render();

    thinkingTimer = setTimeout(() => {
      thinkingTimer = null;
      scheduledHandNumber = null;

      if (!isScheduledActorStillValid(actor, handNumber)) {
        window.continueBetting();
        return;
      }

      originalBotAction(actor);
      recordDecision(actor, timing.context);
      state.currentActorIndex = nextPendingActor(position);
      render();

      // Keep only a tiny visual beat between consecutive AI actions.
      const gap = random(80, 100);
      scheduleFollowUp(gap, handNumber);
    }, timing.delay);
  }

  function realisticContinueBetting() {
    if (portraitMedia.matches) {
      clearTimers();
      return;
    }

    if ((thinkingTimer || followTimer) && scheduledHandNumber === state.handNumber) return;
    if ((thinkingTimer || followTimer) && scheduledHandNumber !== state.handNumber) clearTimers();

    let guard = 0;
    state.waitingForHuman = false;

    while (!state.handOver && guard < 140) {
      if (finishByFoldIfNeeded()) break;
      if (shouldRunOutAllIn()) {
        runOutAllInBoard();
        break;
      }

      if (isBettingRoundComplete()) {
        const boardCountBefore = state.board.length;
        advanceStreet();
        guard += 1;

        if (!state.handOver && state.board.length !== boardCountBefore) {
          render();
          scheduleFollowUp(state.board.length === 3 ? 980 : 760, state.handNumber);
          return;
        }
        continue;
      }

      if (state.currentActorIndex < 0 || !needsAction(state.players[state.currentActorIndex])) {
        state.currentActorIndex = nextPendingActor(state.currentActorIndex);
      }

      const actor = state.players[state.currentActorIndex];
      if (!actor) break;

      if (actor.isHuman) {
        promptHumanAction(actor);
        render();
        return;
      }

      scheduleBotAction(actor);
      return;
    }

    if (!state.handOver && guard >= 140) {
      log("系統：下注輪推進中止，請開新牌局。");
      state.waitingForHuman = !human().folded && !human().allIn;
    }

    render();
  }

  window.continueBetting = realisticContinueBetting;
  window.AiTimingController = {
    clear: clearTimers,
    getExperience(name) {
      return name ? { ...statsFor({ name }) } : JSON.parse(JSON.stringify(experience));
    },
    resetExperience() {
      experience = {};
      recordedHands.clear();
      try { localStorage.removeItem(EXPERIENCE_KEY); } catch (_) {}
    },
  };

  const stopWhenHidden = () => {
    if (document.visibilityState === "hidden" || portraitMedia.matches) clearTimers();
    else if (state.players?.length && !state.handOver) window.continueBetting();
  };

  document.addEventListener("visibilitychange", stopWhenHidden);
  if (portraitMedia.addEventListener) portraitMedia.addEventListener("change", stopWhenHidden);
  else portraitMedia.addListener(stopWhenHidden);
})();