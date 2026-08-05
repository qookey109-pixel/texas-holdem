// Opening-roster independent strategies with public-information-only risk control.
(() => {
  "use strict";

  if (window.AiOpeningStrategiesV23?.version) return;

  const VERSION = "2.3.0";
  const OPENING_NAMES = Object.freeze(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);
  const POSITION_BONUS = Object.freeze({ BTN: 0.055, CO: 0.04, HJ: 0.022, MP: 0.008, UTG: -0.035, SB: -0.018, BB: 0 });
  const PROFILES = Object.freeze({
    Toto: profile("岩石耐心", "rock", 0.69, 0.018, 0.025, 0.34, [0.28, 0.38, 0.5], 0.18, 0.29, 0.18, 0.3, 0.8, 0.73),
    Pao: profile("黏性控池", "calling-station", 0.64, 0.085, 0.035, 0.36, [0.3, 0.42, 0.56], 0.23, 0.38, 0.23, 0.39, 0.82, 0.7),
    Leo: profile("主動施壓", "pressure", 0.57, 0.035, 0.19, 0.82, [0.36, 0.52, 0.72], 0.27, 0.44, 0.2, 0.34, 0.8, 0.68),
    Foxy: profile("位置詐唬", "trickster", 0.59, 0.03, 0.25, 0.7, [0.32, 0.48, 0.68], 0.25, 0.42, 0.19, 0.33, 0.81, 0.69),
    Wolf: profile("位置獵手", "tag", 0.61, 0.045, 0.095, 0.67, [0.33, 0.5, 0.66], 0.24, 0.4, 0.19, 0.32, 0.8, 0.69),
    Shark: profile("精準守門", "precision", 0.625, 0.052, 0.075, 0.64, [0.34, 0.52, 0.7], 0.24, 0.41, 0.18, 0.31, 0.79, 0.67),
  });
  const FAIR_INFORMATION_POLICY = Object.freeze({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    publicPosition: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });

  let installAttempts = 0;
  let installTimer = 0;

  function profile(title, family, valueThreshold, callMargin, bluffRate, aggression, sizes, earlyRaiseCap, normalRaiseCap, softRisk, hardRisk, premiumStrength, jamStrength) {
    return Object.freeze({
      title,
      family,
      valueThreshold,
      callMargin,
      bluffRate,
      aggression,
      sizes: Object.freeze([...sizes]),
      earlyRaiseCap,
      normalRaiseCap,
      softRisk,
      hardRisk,
      premiumStrength,
      jamStrength,
    });
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function roundToChip(value) {
    return Math.max(0, Math.floor((Number(value) || 0) / 10) * 10);
  }

  function supports(playerOrName) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    return OPENING_NAMES.includes(name);
  }

  function boardTexture(board = []) {
    const cards = Array.isArray(board) ? board : [];
    const suitCounts = new Map();
    const rankCounts = new Map();
    for (const card of cards) {
      suitCounts.set(card?.suit, (suitCounts.get(card?.suit) || 0) + 1);
      rankCounts.set(Number(card?.value) || 0, (rankCounts.get(Number(card?.value) || 0) || 0) + 1);
    }
    const ranks = [...new Set(cards.map(card => Number(card?.value) || 0).filter(Boolean))].sort((a, b) => a - b);
    if (ranks.includes(14)) ranks.unshift(1);
    let connected = false;
    for (let low = 1; low <= 10; low += 1) {
      if (ranks.filter(rank => rank >= low && rank <= low + 4).length >= 3) connected = true;
    }
    const monotone = cards.length >= 3 && [...suitCounts.values()].some(count => count >= 3);
    const twoTone = cards.length >= 3 && [...suitCounts.values()].some(count => count === 2);
    const paired = [...rankCounts.values()].some(count => count >= 2);
    const wetness = clamp((monotone ? 0.38 : 0) + (twoTone ? 0.16 : 0) + (connected ? 0.24 : 0) + (paired ? 0.07 : 0));
    return Object.freeze({ monotone, twoTone, connected, paired, wetness, dry: wetness < 0.24 });
  }

  function riskPremium(profileData, context) {
    const risk = clamp(context.callRiskFraction);
    if (risk <= profileData.softRisk) return 0;
    const firstSpan = Math.max(0.01, profileData.hardRisk - profileData.softRisk);
    if (risk <= profileData.hardRisk) {
      return ((risk - profileData.softRisk) / firstSpan) * 0.105 + (context.openingPhase ? 0.018 : 0);
    }
    return 0.105 + clamp((risk - profileData.hardRisk) / Math.max(0.01, 1 - profileData.hardRisk)) * 0.16 + (context.openingPhase ? 0.032 : 0);
  }

  function roleAdjustments(name, context, randomValue) {
    let strengthDelta = 0;
    let raiseDelta = 0;
    let bluffDelta = 0;
    let callDelta = 0;

    switch (name) {
      case "Toto":
        if (context.multiway) strengthDelta -= 0.015;
        if (context.texture.wetness > 0.45) raiseDelta -= 0.06;
        break;
      case "Pao":
        if (context.callRiskFraction <= 0.2) callDelta += 0.045;
        if (context.drawPotential >= 0.08) callDelta += 0.035;
        raiseDelta -= 0.035;
        break;
      case "Leo":
        raiseDelta += context.position === "BTN" || context.position === "CO" ? 0.065 : 0.02;
        bluffDelta += context.texture.dry ? 0.045 : -0.035;
        break;
      case "Foxy":
        bluffDelta += context.texture.dry && ["BTN", "CO", "HJ"].includes(context.position) ? 0.11 : -0.055;
        raiseDelta += randomValue < 0.34 ? 0.04 : -0.01;
        break;
      case "Wolf":
        strengthDelta += POSITION_BONUS[context.position] || 0;
        raiseDelta += ["BTN", "CO"].includes(context.position) ? 0.055 : -0.015;
        break;
      case "Shark":
        strengthDelta += context.multiway ? -0.025 : 0.015;
        if (context.potOdds <= 0.25) callDelta += 0.02;
        if (context.texture.wetness > 0.5 && context.baseStrength < 0.62) callDelta -= 0.035;
        break;
      default:
        break;
    }

    return { strengthDelta, raiseDelta, bluffDelta, callDelta };
  }

  function normalizeScenario(name, scenario = {}) {
    const profileData = PROFILES[name];
    if (!profileData) throw new Error(`Unsupported opening AI: ${name}`);
    const stack = Math.max(0, Number(scenario.stack) || 0);
    const effectiveStack = Math.max(1, Math.min(stack || 1, Number(scenario.effectiveStack) || stack || 1));
    const needed = Math.max(0, Math.min(stack, Number(scenario.needed) || 0));
    const pot = Math.max(1, Number(scenario.pot) || 1);
    const bigBlind = Math.max(1, Number(scenario.bigBlind) || 20);
    const minimumRaise = Math.max(bigBlind, Number(scenario.minimumRaise) || bigBlind);
    const activeOpponents = Math.max(1, Number(scenario.activeOpponents) || 1);
    const handNumber = Math.max(1, Number(scenario.handNumber) || 1);
    const openingPhase = scenario.openingPhase ?? handNumber <= 10;
    const texture = scenario.texture || boardTexture(scenario.board || []);
    const baseStrength = clamp(scenario.baseStrength);
    const drawPotential = clamp(scenario.drawPotential, 0, 0.2);
    const position = scenario.position || "--";
    const callRiskFraction = needed / effectiveStack;
    const potOdds = needed / Math.max(1, pot + needed);
    const availableRaise = Math.max(0, stack - needed);
    const capFraction = openingPhase ? profileData.earlyRaiseCap : profileData.normalRaiseCap;
    const maximumCommitted = roundToChip(effectiveStack * capFraction);
    const maxRaise = roundToChip(Math.min(availableRaise, Math.max(0, maximumCommitted - needed)));

    return Object.freeze({
      name,
      handNumber,
      openingPhase,
      street: scenario.street || "preflop",
      position,
      stack,
      effectiveStack,
      needed,
      pot,
      potOdds,
      bigBlind,
      minimumRaise,
      activeOpponents,
      multiway: activeOpponents > 1,
      baseStrength,
      drawPotential,
      texture,
      callRiskFraction,
      capFraction,
      maximumCommitted,
      availableRaise,
      maxRaise,
      canRaise: scenario.canRaise !== false && maxRaise >= minimumRaise,
      stackInBigBlinds: stack / bigBlind,
    });
  }

  function evaluateScenario(name, scenario = {}, randomValue = 0.5) {
    const profileData = PROFILES[name];
    const context = normalizeScenario(name, scenario);
    const random = clamp(randomValue);
    const role = roleAdjustments(name, context, random);
    const multiwayPenalty = Math.max(0, context.activeOpponents - 1) * 0.022;
    const wetPenalty = context.texture.wetness * Math.max(0, 0.58 - context.baseStrength) * 0.1;
    const adjustedStrength = clamp(
      context.baseStrength
      + context.drawPotential
      + (POSITION_BONUS[context.position] || 0) * 0.55
      + role.strengthDelta
      - multiwayPenalty
      - wetPenalty,
    );
    const premium = adjustedStrength >= profileData.premiumStrength;
    const requiredCall = clamp(
      context.potOdds
      - profileData.callMargin
      - role.callDelta
      + riskPremium(profileData, context),
      0.08,
      0.95,
    );
    const hardRiskFold = context.needed > 0
      && context.callRiskFraction > profileData.hardRisk
      && !premium
      && adjustedStrength < requiredCall + 0.075;
    const bluffChance = clamp(profileData.bluffRate + role.bluffDelta, 0, name === "Foxy" ? 0.34 : 0.26);
    const bluffEligible = context.canRaise
      && context.stackInBigBlinds > 14
      && context.callRiskFraction <= 0.14
      && context.texture.dry
      && random < bluffChance;
    const valueReady = adjustedStrength >= profileData.valueThreshold;
    const shortStackJam = context.stackInBigBlinds <= 10
      && adjustedStrength >= profileData.jamStrength;

    let action = context.needed > 0 ? "fold" : "check";
    let raiseBy = 0;
    let sizeFraction = 0;
    let reason = "風險與牌力不足";

    if (shortStackJam && context.availableRaise > 0) {
      action = "raise";
      raiseBy = context.availableRaise;
      sizeFraction = 1;
      reason = "短碼高權益 All-in";
    } else if (!hardRiskFold && context.canRaise && (valueReady || bluffEligible)) {
      const sizeIndex = Math.min(
        profileData.sizes.length - 1,
        Math.floor(random * profileData.sizes.length),
      );
      const baseFraction = profileData.sizes[sizeIndex];
      const raiseScore = adjustedStrength
        - profileData.valueThreshold
        + profileData.aggression * 0.09
        + role.raiseDelta
        + (bluffEligible ? 0.065 : 0)
        - context.callRiskFraction * 0.12;
      const raiseGate = valueReady ? -0.015 : 0.055;
      if (raiseScore >= raiseGate) {
        const desired = roundToChip(Math.max(context.minimumRaise, context.pot * baseFraction));
        raiseBy = Math.min(context.maxRaise, Math.max(context.minimumRaise, desired));
        if (raiseBy >= context.minimumRaise) {
          action = "raise";
          sizeFraction = baseFraction;
          reason = bluffEligible && !valueReady ? "有條件位置詐唬" : "受風險上限保護的價值加注";
        }
      }
    }

    if (action !== "raise") {
      if (context.needed === 0) {
        action = "check";
        reason = valueReady ? "控制底池保留後續價值" : "免費過牌";
      } else if (!hardRiskFold && (premium || adjustedStrength >= requiredCall)) {
        action = "call";
        reason = premium ? "強牌承擔重大底池" : "牌力通過價格與籌碼風險門檻";
      } else {
        action = "fold";
        reason = hardRiskFold ? "大額跟注風險超過角色容忍" : "牌力低於跟注門檻";
      }
    }

    return Object.freeze({
      version: VERSION,
      name,
      title: profileData.title,
      family: profileData.family,
      action,
      raiseBy,
      sizeFraction,
      adjustedStrength,
      requiredCall,
      premium,
      valueReady,
      bluffEligible,
      hardRiskFold,
      reason,
      context,
      publicInformationOnly: true,
    });
  }

  function liveScenario(player) {
    const board = state?.board || [];
    const opponents = (state?.players || []).filter(candidate => candidate !== player && !candidate?.folded && !candidate?.eliminated);
    const opponentMaxStack = opponents.reduce((maximum, candidate) => Math.max(maximum, Number(candidate?.stack) || 0), 0);
    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    const bigBlind = Math.max(1, typeof currentBigBlind === "function" ? currentBigBlind() : 20);
    const baseStrength = typeof estimateStrength === "function" ? estimateStrength(player) : 0.5;
    const position = typeof positionLabel === "function" ? positionLabel(player) : "--";
    const minimumRaise = Math.max(bigBlind, typeof minimumRaiseBy === "function" ? minimumRaiseBy() : bigBlind);
    let drawPotential = 0;
    if (window.AiRangeToolsV1?.drawPotential) {
      try {
        drawPotential = Number(window.AiRangeToolsV1.drawPotential(player, board)) || 0;
      } catch (error) {
        drawPotential = 0;
      }
    }
    return {
      handNumber: Number(state?.handNumber) || 1,
      street: board.length >= 5 ? "river" : board.length === 4 ? "turn" : board.length >= 3 ? "flop" : "preflop",
      position,
      stack: Number(player?.stack) || 0,
      effectiveStack: Math.min(Number(player?.stack) || 0, opponentMaxStack || Number(player?.stack) || 1),
      needed,
      pot: Math.max(1, Number(state?.pot) || 1),
      bigBlind,
      minimumRaise,
      activeOpponents: Math.max(1, opponents.length),
      baseStrength,
      drawPotential,
      texture: boardTexture(board),
      canRaise: !player?.raiseLocked,
    };
  }

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
    say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.4 });
  }

  function performCall(player, needed) {
    const paid = pay(player, needed);
    player.hasActed = true;
    player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : (paid === 0 ? "過牌" : `跟注 ${paid}`);
    if (paid === 0) {
      if (!state.isMuted) Audio.check();
    } else if (!state.isMuted) {
      Audio.chip();
    }
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: paid === 0 ? 0.15 : 0.2 });
  }

  function executeDecision(player, decision) {
    player.lastStrategyDecision = {
      strategyId: `opening-${decision.family}-v2-3`,
      strategyVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      adjustedStrength: decision.adjustedStrength,
      requiredCall: decision.requiredCall,
      callRiskFraction: decision.context.callRiskFraction,
      openingPhase: decision.context.openingPhase,
      maximumCommitted: decision.context.maximumCommitted,
      publicInformationOnly: true,
    };
    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player, typeof amountToCall === "function" ? amountToCall(player) : 0);
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const entity of AI_ROSTER) {
      const profileData = PROFILES[entity?.name];
      if (!profileData) continue;
      entity.independentOpeningStrategy = true;
      entity.openingStrategyVersion = VERSION;
      entity.openingStrategyTitle = profileData.title;
      entity.publicInformationOnly = true;
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[entity.name]) {
        AI_PROFILE_META[entity.name].strategyId = `opening-${profileData.family}-v2-3`;
        AI_PROFILE_META[entity.name].strategyTitle = profileData.title;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    if (window.__aiOpeningStrategiesV23Installed) return true;
    if (typeof botAction !== "function") return false;
    const previousBotAction = botAction;
    window.__aiOpeningStrategiesV23PreviousBotAction = previousBotAction;
    botAction = function botActionWithOpeningStrategies(player) {
      if (!supports(player)) return previousBotAction(player);
      try {
        return executeDecision(player, evaluateScenario(player.name, liveScenario(player), Math.random()));
      } catch (error) {
        console.warn("Opening AI strategy fallback", player?.name, error);
        return previousBotAction(player);
      }
    };
    window.__aiOpeningStrategiesV23Installed = true;
    return true;
  }

  function refresh() {
    const profilesReady = registerProfiles();
    const decisionReady = installDecisionLayer();
    if (profilesReady && decisionReady && installTimer) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    return profilesReady && decisionReady;
  }

  window.AiOpeningStrategiesV23 = Object.freeze({
    version: VERSION,
    openingNames: [...OPENING_NAMES],
    profiles: PROFILES,
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    supports,
    boardTexture,
    riskPremium(name, scenario = {}) {
      const context = normalizeScenario(name, scenario);
      return riskPremium(PROFILES[name], context);
    },
    evaluateScenario,
    refresh,
  });

  refresh();
  installTimer = window.setInterval(() => {
    installAttempts += 1;
    refresh();
    if (installAttempts >= 40 && installTimer) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
  }, 100);
})();
