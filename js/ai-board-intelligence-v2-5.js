// AI V2.5: shared board texture, blocker/unblocker, and tiered sizing for middle and elite AI.
(() => {
  "use strict";

  if (window.AiBoardIntelligenceV25?.version) return;

  const VERSION = "2.5.0";
  const MIDDLE_NAMES = Object.freeze(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE_NAMES = Object.freeze(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const SUPPORTED_NAMES = Object.freeze([...MIDDLE_NAMES, ...ELITE_NAMES]);
  const SUITS = Object.freeze(["s", "h", "d", "c"]);

  const ROLE_CONFIG = Object.freeze({
    Ace: config("middle", 0.58, 0.5, 0.48, 0.62, 0.52),
    Momo: config("middle", 0.5, 0.38, 0.72, 0.5, 0.68),
    Nori: config("middle", 0.62, 0.48, 0.54, 0.6, 0.56),
    Bruno: config("middle", 0.68, 0.58, 0.34, 0.72, 0.5),
    Dodo: config("middle", 0.72, 0.62, 0.28, 0.54, 0.42),
    Viper: config("middle", 0.64, 0.44, 0.58, 0.68, 0.6),
    Nova: config("elite", 0.72, 0.56, 0.66, 0.72, 0.74),
    "Unit-9": config("elite", 0.9, 0.78, 0.62, 0.9, 0.82),
    Merlin: config("elite", 0.82, 0.66, 0.7, 0.78, 0.78),
    Vlad: config("elite", 0.86, 0.7, 0.76, 0.84, 0.86),
  });

  let installTimer = 0;
  let installAttempts = 0;

  function config(tier, boardDiscipline, callDiscipline, bluffSkill, sizingSkill, blockerSkill) {
    return Object.freeze({ tier, boardDiscipline, callDiscipline, bluffSkill, sizingSkill, blockerSkill });
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function normalizeSuit(card) {
    const raw = String(card?.suit ?? card?.symbol ?? "").trim().toLowerCase();
    const aliases = {
      spades: "s", spade: "s", "♠": "s", s: "s",
      hearts: "h", heart: "h", "♥": "h", h: "h",
      diamonds: "d", diamond: "d", "♦": "d", d: "d",
      clubs: "c", club: "c", "♣": "c", c: "c",
    };
    return aliases[raw] || raw;
  }

  function normalizeValue(card) {
    const raw = card?.value ?? card?.rank ?? card?.number;
    if (Number.isFinite(Number(raw))) return Number(raw);
    return { A: 14, K: 13, Q: 12, J: 11, T: 10, "10": 10 }[String(raw || "").trim().toUpperCase()] || 0;
  }

  function cardSnapshot(card) {
    const value = normalizeValue(card);
    const suit = normalizeSuit(card);
    return value && SUITS.includes(suit) ? { value, suit } : null;
  }

  function boardSnapshot(board = null) {
    const source = Array.isArray(board) ? board : (typeof state === "object" ? state?.board : []);
    return (source || []).map(cardSnapshot).filter(Boolean);
  }

  function uniqueRanks(cards = []) {
    const ranks = [...new Set(cards.map(normalizeValue).filter(Boolean))].sort((a, b) => a - b);
    if (ranks.includes(14)) ranks.unshift(1);
    return ranks;
  }

  function rankCounts(cards = []) {
    const counts = new Map();
    for (const card of cards) {
      const value = normalizeValue(card);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  }

  function suitCounts(cards = []) {
    const counts = new Map(SUITS.map(suit => [suit, 0]));
    for (const card of cards) {
      const suit = normalizeSuit(card);
      if (counts.has(suit)) counts.set(suit, counts.get(suit) + 1);
    }
    return counts;
  }

  function straightProfile(cards = []) {
    const ranks = uniqueRanks(cards);
    let bestHits = 0;
    let bestLow = 0;
    let bestHigh = 0;
    let bestMissing = [];
    for (let low = 1; low <= 10; low += 1) {
      const windowRanks = [low, low + 1, low + 2, low + 3, low + 4];
      const present = windowRanks.filter(rank => ranks.includes(rank));
      if (present.length > bestHits) {
        bestHits = present.length;
        bestLow = low;
        bestHigh = low + 4;
        bestMissing = windowRanks.filter(rank => !ranks.includes(rank));
      }
    }
    return {
      bestHits,
      bestLow,
      bestHigh,
      missingRanks: bestMissing,
      fourConnected: bestHits >= 4,
      threeConnected: bestHits >= 3,
    };
  }

  function textureCore(board = []) {
    const cards = boardSnapshot(board);
    const ranks = rankCounts(cards);
    const suits = suitCounts(cards);
    const straight = straightProfile(cards);
    const multiplicities = [...ranks.values()].sort((a, b) => b - a);
    const dominant = [...suits.entries()].sort((left, right) => right[1] - left[1])[0] || ["", 0];
    const paired = multiplicities.some(count => count >= 2);
    const doublePaired = multiplicities.filter(count => count >= 2).length >= 2;
    const tripsBoard = multiplicities.some(count => count >= 3);
    const monotone = cards.length >= 3 && dominant[1] === cards.length;
    const flushThreat = dominant[1] >= 3;
    const fourFlush = dominant[1] >= 4;
    const highCards = cards.filter(card => card.value >= 11).length;
    const broadwayDensity = cards.length ? highCards / cards.length : 0;
    const distinctRanks = new Set(cards.map(card => card.value)).size;

    let wetness = 0;
    wetness += dominant[1] >= 4 ? 0.32 : dominant[1] === 3 ? 0.2 : dominant[1] === 2 ? 0.075 : 0;
    wetness += straight.bestHits >= 4 ? 0.3 : straight.bestHits === 3 ? 0.17 : straight.bestHits === 2 ? 0.045 : 0;
    wetness += paired ? 0.08 : 0;
    wetness += doublePaired ? 0.055 : 0;
    wetness += tripsBoard ? 0.07 : 0;
    wetness += broadwayDensity * 0.1;
    wetness += cards.length >= 4 && distinctRanks >= 4 ? 0.04 : 0;
    wetness = clamp(wetness, 0, 1);

    const dryness = clamp(1 - wetness + (cards.length >= 3 && !paired && dominant[1] <= 1 && straight.bestHits <= 2 ? 0.08 : 0), 0, 1);
    const className = tripsBoard ? "trips-board"
      : doublePaired ? "double-paired"
        : paired ? "paired"
          : fourFlush ? "four-flush"
            : monotone ? "monotone"
              : straight.fourConnected ? "four-connected"
                : wetness >= 0.55 ? "wet"
                  : wetness <= 0.26 ? "dry"
                    : "mixed";

    return {
      cards,
      cardCount: cards.length,
      wetness: round(wetness),
      dryness: round(dryness),
      paired,
      doublePaired,
      tripsBoard,
      monotone,
      flushThreat,
      fourFlush,
      dominantSuit: dominant[0],
      dominantSuitCount: dominant[1],
      straight,
      broadwayDensity: round(broadwayDensity),
      className,
    };
  }

  function analyzeBoard(board = null) {
    const cards = boardSnapshot(board);
    const current = textureCore(cards);
    const prior = cards.length >= 4 ? textureCore(cards.slice(0, -1)) : null;
    let dynamicScore = 0;
    if (prior) {
      dynamicScore += Math.max(0, current.wetness - prior.wetness) * 0.62;
      if (!prior.paired && current.paired) dynamicScore += 0.18;
      if (!prior.flushThreat && current.flushThreat) dynamicScore += 0.16;
      if (!prior.fourFlush && current.fourFlush) dynamicScore += 0.18;
      if (!prior.straight.fourConnected && current.straight.fourConnected) dynamicScore += 0.2;
    }
    dynamicScore = clamp(dynamicScore, 0, 1);
    return Object.freeze({
      version: VERSION,
      ...current,
      dynamicScore: round(dynamicScore),
      dynamic: dynamicScore >= 0.16,
      priorWetness: round(prior?.wetness || 0),
      publicInformationOnly: true,
    });
  }

  function analyzeBlockers(player, board = null) {
    const hole = (player?.cards || []).map(cardSnapshot).filter(Boolean);
    const texture = analyzeBoard(board);
    const boardRanks = rankCounts(texture.cards);
    const topBoardRank = Math.max(0, ...texture.cards.map(card => card.value));
    const secondBoardRank = [...new Set(texture.cards.map(card => card.value))].sort((a, b) => b - a)[1] || 0;
    const targetSuit = texture.dominantSuit;
    const suitedHole = targetSuit ? hole.filter(card => card.suit === targetSuit) : [];
    const nutFlushBlocker = texture.flushThreat && suitedHole.some(card => card.value === 14);
    const kingFlushBlocker = texture.flushThreat && suitedHole.some(card => card.value === 13);
    const queenFlushBlocker = texture.fourFlush && suitedHole.some(card => card.value === 12);

    const straightWindows = [];
    const ranks = uniqueRanks(texture.cards);
    for (let low = 1; low <= 10; low += 1) {
      const windowRanks = [low, low + 1, low + 2, low + 3, low + 4];
      const hits = windowRanks.filter(rank => ranks.includes(rank)).length;
      if (hits >= 3) straightWindows.push({ low, high: low + 4, missing: windowRanks.filter(rank => !ranks.includes(rank)) });
    }
    const straightBlockerRanks = new Set(straightWindows.flatMap(window => window.missing));
    const nutStraightBlocker = hole.some(card => (
      straightBlockerRanks.has(card.value)
      && straightWindows.some(window => window.high === card.value || (card.value === 14 && window.high === 5))
    ));
    const straightBlocker = hole.some(card => straightBlockerRanks.has(card.value));
    const topPairBlocker = hole.some(card => card.value === topBoardRank);
    const secondPairBlocker = hole.some(card => card.value === secondBoardRank);
    const boardPairBlocker = hole.some(card => (boardRanks.get(card.value) || 0) >= 2);
    const overcardBlocker = hole.some(card => card.value > topBoardRank && card.value >= 12);

    let valueBlockerScore = 0;
    if (nutFlushBlocker) valueBlockerScore += 0.5;
    else if (kingFlushBlocker) valueBlockerScore += 0.3;
    else if (queenFlushBlocker) valueBlockerScore += 0.17;
    if (nutStraightBlocker) valueBlockerScore += 0.28;
    else if (straightBlocker) valueBlockerScore += 0.14;
    if (topPairBlocker) valueBlockerScore += 0.16;
    if (boardPairBlocker) valueBlockerScore += 0.12;
    if (overcardBlocker && texture.dryness >= 0.55) valueBlockerScore += 0.08;
    valueBlockerScore = clamp(valueBlockerScore, 0, 1);

    let bluffQuality = valueBlockerScore * 0.78;
    if (texture.cardCount === 5 && nutFlushBlocker) bluffQuality += 0.14;
    if (texture.cardCount === 5 && nutStraightBlocker) bluffQuality += 0.1;
    if (topPairBlocker && secondPairBlocker) bluffQuality -= 0.08;
    bluffQuality = clamp(bluffQuality, 0, 1);

    let bluffCatchUnblocker = 0;
    if (texture.cardCount === 5 && texture.dominantSuitCount === 3 && suitedHole.length === 0) bluffCatchUnblocker += 0.38;
    if (!topPairBlocker) bluffCatchUnblocker += 0.12;
    if (!secondPairBlocker) bluffCatchUnblocker += 0.08;
    if (!straightBlocker && texture.straight.threeConnected && !texture.straight.fourConnected) bluffCatchUnblocker += 0.12;
    bluffCatchUnblocker = clamp(bluffCatchUnblocker, 0, 1);

    let callingUnblocker = 0.15;
    if (!topPairBlocker) callingUnblocker += 0.25;
    if (!secondPairBlocker) callingUnblocker += 0.14;
    if (!boardPairBlocker) callingUnblocker += 0.08;
    if (!nutFlushBlocker && !kingFlushBlocker) callingUnblocker += 0.08;
    callingUnblocker = clamp(callingUnblocker, 0, 1);

    return Object.freeze({
      version: VERSION,
      nutFlushBlocker,
      kingFlushBlocker,
      queenFlushBlocker,
      nutStraightBlocker,
      straightBlocker,
      topPairBlocker,
      secondPairBlocker,
      boardPairBlocker,
      overcardBlocker,
      valueBlockerScore: round(valueBlockerScore),
      bluffQuality: round(bluffQuality),
      bluffCatchUnblocker: round(bluffCatchUnblocker),
      callingUnblocker: round(callingUnblocker),
      publicInformationOnly: true,
    });
  }

  function bestCandidate(decision, desiredFraction, mode = "closest") {
    const candidates = [...(decision?.candidates || [])].filter(candidate => Number(candidate?.raiseBy) > 0);
    if (!candidates.length) return null;
    if (mode === "largest") return candidates.sort((a, b) => Number(b.fraction) - Number(a.fraction))[0];
    if (mode === "smallest") return candidates.sort((a, b) => Number(a.fraction) - Number(b.fraction))[0];
    return candidates.sort((a, b) => (
      Math.abs(Number(a.fraction) - desiredFraction) - Math.abs(Number(b.fraction) - desiredFraction)
      || Number(b.ev) - Number(a.ev)
    ))[0];
  }

  function desiredValueFraction(texture, blockers, context, equity, tier, thinValue) {
    let target = thinValue ? 0.44 : 0.62;
    if (texture.wetness >= 0.58 || texture.dynamic) target += thinValue ? 0.08 : 0.18;
    if (texture.dryness >= 0.65) target -= thinValue ? 0.06 : 0.1;
    if (texture.cardCount === 5 && !thinValue) target += 0.1;
    if (texture.cardCount === 5 && thinValue) target -= 0.04;
    target += blockers.callingUnblocker * (thinValue ? 0.04 : 0.08);
    if (Number(context?.activeOpponents) >= 2) target += thinValue ? -0.05 : 0.07;
    if (tier === "elite") target += equity >= 0.84 ? 0.05 : 0;
    return clamp(target, 0.28, tier === "elite" ? 1.2 : 0.98);
  }

  function desiredBluffFraction(texture, blockers, tier) {
    let target = texture.cardCount === 5 ? 0.72 : 0.52;
    target += blockers.bluffQuality * 0.22;
    if (texture.dynamic) target += 0.08;
    if (texture.paired && texture.dryness >= 0.45) target += 0.06;
    if (tier === "elite") target += 0.06;
    return clamp(target, 0.38, tier === "elite" ? 1.15 : 0.92);
  }

  function applyPassive(decision, needed, reason, adjustment, allowCall = true) {
    decision.action = needed > 0 && !allowCall ? "fold" : "call";
    decision.raiseBy = 0;
    decision.sizeFraction = 0;
    decision.reason = reason;
    decision.boardAdjustment = adjustment;
    if (!allowCall) decision.bluffing = false;
    return decision;
  }

  function applyBoardIntelligence(player, decision, options = {}) {
    if (!decision || decision.action === "fallback" || !SUPPORTED_NAMES.includes(player?.name)) return decision;
    const context = decision.context || {};
    const street = String(context.street || "");
    if (street === "preflop" || (options.board || (typeof state === "object" ? state?.board : []) || []).length < 3) {
      decision.boardIntelligenceVersion = VERSION;
      decision.boardIntelligenceIntegrated = false;
      return decision;
    }

    const role = ROLE_CONFIG[player.name];
    const texture = options.texture || analyzeBoard(options.board || null);
    const blockers = options.blockers || analyzeBlockers(player, options.board || null);
    const needed = Math.max(0, Number(context.needed) || 0);
    const pot = Math.max(1, Number(context.pot) || 1);
    const betRatio = needed / pot;
    const equity = clamp(context.equityProxy ?? decision.equityProxy, 0, 1);
    const potOdds = clamp(context.potOdds, 0, 1);
    const draw = clamp(context.drawPotential, 0, 1);
    const valueReady = Boolean(decision.valueReady);
    const pureBluff = Boolean(decision.bluffing || decision.blockerBluff) && !valueReady && draw < 0.075;
    const semiBluff = Boolean(decision.bluffing) && !valueReady && draw >= 0.075;
    const river = texture.cardCount >= 5;
    const thinValue = valueReady && equity < (role.tier === "elite" ? 0.78 : 0.75);
    const thickValue = valueReady && !thinValue;

    const originalCallScore = Number(decision.callScore) || 0;
    const boardRisk = texture.wetness * 0.5 + texture.dynamicScore * 0.38 + (texture.fourFlush ? 0.12 : 0);
    const weakMadeHand = !valueReady && draw < 0.09 && equity < 0.6;
    let callAdjustment = 0;
    if (needed > 0 && weakMadeHand) {
      callAdjustment -= boardRisk * role.callDiscipline * (0.05 + Math.min(0.1, betRatio * 0.08));
    }
    if (river && needed > 0 && !valueReady) {
      callAdjustment += blockers.valueBlockerScore * role.blockerSkill * 0.055;
      callAdjustment += blockers.bluffCatchUnblocker * role.blockerSkill * 0.045;
    }
    decision.callScore = originalCallScore + clamp(callAdjustment, -0.13, 0.09);

    if (
      needed > 0
      && weakMadeHand
      && betRatio >= 0.48
      && decision.callScore < -0.02
      && equity < potOdds + 0.09 + boardRisk * role.callDiscipline * 0.08
    ) {
      applyPassive(
        decision,
        needed,
        `${player.name} 依統一牌面風險放棄多人／動態牌面的邊緣跟注`,
        "board-risk-fold",
        false,
      );
    }

    const blockerRequirement = clamp(
      0.58 - role.bluffSkill * 0.24 + (river ? 0.04 : 0) + (texture.fourFlush ? 0.05 : 0),
      role.tier === "elite" ? 0.3 : 0.36,
      0.62,
    );
    if (
      decision.action === "raise"
      && pureBluff
      && blockers.bluffQuality < blockerRequirement
    ) {
      const canCall = needed === 0 || (
        decision.callScore >= 0.015
        && equity >= potOdds + 0.055
      );
      applyPassive(
        decision,
        needed,
        `${player.name} 缺少關鍵 Blocker，取消低品質純詐唬`,
        "suppress-poor-blocker-bluff",
        canCall,
      );
    }

    if (
      decision.action === "fold"
      && river
      && needed > 0
      && !valueReady
      && blockers.valueBlockerScore >= (role.tier === "elite" ? 0.42 : 0.54)
      && blockers.bluffCatchUnblocker >= 0.28
      && equity >= potOdds + (role.tier === "elite" ? 0.035 : 0.06)
      && decision.callScore >= (role.tier === "elite" ? -0.015 : 0.01)
    ) {
      applyPassive(
        decision,
        needed,
        `${player.name} 利用價值 Blocker 與詐唬 Unblocker 執行 Bluff Catch`,
        "blocker-bluff-catch",
        true,
      );
    }

    if (decision.action === "raise" && (valueReady || pureBluff || semiBluff)) {
      let target = 0;
      if (valueReady) target = desiredValueFraction(texture, blockers, context, equity, role.tier, thinValue);
      else if (pureBluff) target = desiredBluffFraction(texture, blockers, role.tier);
      else target = clamp(0.44 + texture.wetness * 0.18 + draw * 0.4, 0.36, role.tier === "elite" ? 0.82 : 0.72);
      const candidate = bestCandidate(decision, target);
      if (candidate) {
        const currentDistance = Math.abs(Number(decision.sizeFraction || 0) - target);
        const candidateDistance = Math.abs(Number(candidate.fraction || 0) - target);
        const shouldResize = candidateDistance + 0.025 < currentDistance
          || (thickValue && texture.wetness >= 0.52 && Number(candidate.fraction) > Number(decision.sizeFraction || 0));
        if (shouldResize) {
          decision.raiseBy = Number(candidate.raiseBy) || 0;
          decision.sizeFraction = Number(candidate.fraction) || 0;
          decision.reason = valueReady
            ? `${player.name} 依統一牌面與 Unblocker 採用角色化價值尺寸`
            : `${player.name} 依 Blocker 與牌面極化程度調整詐唬尺寸`;
          decision.boardAdjustment = valueReady ? "texture-value-sizing" : "blocker-bluff-sizing";
        }
      }
    }

    if (
      decision.action === "call"
      && needed === 0
      && thickValue
      && context.canRaise
      && role.sizingSkill >= 0.62
    ) {
      const target = desiredValueFraction(texture, blockers, context, equity, role.tier, false);
      const candidate = bestCandidate(decision, target);
      const trapRole = player.name === "Viper" || player.name === "Merlin";
      const keepTrap = trapRole && !texture.dynamic && texture.dryness >= 0.58;
      if (candidate && !keepTrap) {
        decision.action = "raise";
        decision.raiseBy = Number(candidate.raiseBy) || 0;
        decision.sizeFraction = Number(candidate.fraction) || 0;
        decision.reason = `${player.name} 在可被跟注的牌面主動完成價值下注`;
        decision.boardAdjustment = "recover-missed-value";
      }
    }

    decision.boardIntelligenceVersion = VERSION;
    decision.boardIntelligenceIntegrated = true;
    decision.boardTexture = texture;
    decision.blockerProfile = blockers;
    decision.boardScoreAdjustments = {
      originalCallScore: round(originalCallScore),
      adjustedCallScore: round(decision.callScore),
      callAdjustment: round(callAdjustment),
      boardRisk: round(boardRisk),
      blockerRequirement: round(blockerRequirement),
    };
    decision.aiStrengthStartsAtMiddle = true;
    decision.publicInformationOnly = true;
    return decision;
  }

  function baseDecisionFor(player, options = {}) {
    if (ELITE_NAMES.includes(player?.name) && window.AiRangeDecisionIntegrationV24?.chooseDecision) {
      return window.AiRangeDecisionIntegrationV24.chooseDecision(player, options);
    }
    return window.AiCharacterStrategiesV15?.chooseDecision?.(player, options) || null;
  }

  function chooseDecision(player, options = {}) {
    if (!SUPPORTED_NAMES.includes(player?.name)) return { action: "fallback", strategyVersion: VERSION };
    const baseDecision = options.baseDecision || baseDecisionFor(player, options);
    if (!baseDecision) return { action: "fallback", strategyVersion: VERSION };
    return applyBoardIntelligence(player, baseDecision, options);
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
    say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
  }

  function performCall(player) {
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

  function executeDecision(player, decision) {
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyId: decision.strategyId || player.strategyId || "",
      strategyVersion: VERSION,
      action: decision.action,
      reason: decision.reason,
      street: decision.context?.street || "postflop",
      raiseBy: decision.raiseBy || 0,
      sizeFraction: decision.sizeFraction || 0,
      boardAdjustment: decision.boardAdjustment || "",
      boardClass: decision.boardTexture?.className || "",
      boardWetness: decision.boardTexture?.wetness || 0,
      boardDynamic: Boolean(decision.boardTexture?.dynamic),
      blockerQuality: decision.blockerProfile?.bluffQuality || 0,
      blockerValue: decision.blockerProfile?.valueBlockerScore || 0,
      rangeAdjustment: decision.rangeAdjustment || "",
      rangeTarget: decision.rangeTarget || "",
      boardIntelligenceIntegrated: Boolean(decision.boardIntelligenceIntegrated),
      aiStrengthStartsAtMiddle: true,
      publicInformationOnly: true,
    };

    if (decision.action === "fold") return performFold(player);
    if (decision.action === "raise" && decision.raiseBy > 0) return performRaise(player, decision.raiseBy);
    return performCall(player);
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const name of SUPPORTED_NAMES) {
      const profile = AI_ROSTER.find(candidate => candidate?.name === name);
      const role = ROLE_CONFIG[name];
      if (profile) Object.assign(profile, {
        boardIntelligenceIntegrated: true,
        boardIntelligenceVersion: VERSION,
        blockerAware: true,
        unblockerAware: true,
        unifiedBoardTexture: true,
        tieredSizing: true,
        strengthFromMiddleTier: true,
        boardDecisionTier: role.tier,
        publicInformationOnly: true,
      });
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[name]) {
        AI_PROFILE_META[name].boardIntelligenceVersion = VERSION;
        AI_PROFILE_META[name].strengthFromMiddleTier = true;
      }
    }
    return true;
  }

  function installDecisionLayer() {
    if (window.__aiBoardIntelligenceV25Installed) return true;
    if (
      !window.AiCharacterStrategiesV15?.version
      || !window.AiRangeDecisionIntegrationV24?.version
      || typeof botAction !== "function"
    ) return false;

    const previousBotAction = botAction;
    botAction = function botActionWithBoardIntelligence(player) {
      if (!SUPPORTED_NAMES.includes(player?.name)) return previousBotAction.apply(this, arguments);
      try {
        const decision = chooseDecision(player);
        if (!decision || decision.action === "fallback") return previousBotAction.apply(this, arguments);
        return executeDecision(player, decision);
      } catch (error) {
        console.warn("AI V2.5 board intelligence fallback", player?.name, error);
        return previousBotAction.apply(this, arguments);
      }
    };
    window.__aiBoardIntelligenceV25Installed = true;
    return true;
  }

  function refresh() {
    const profilesReady = registerProfiles();
    const installed = installDecisionLayer();
    if ((profilesReady && installed) || installAttempts >= 240) {
      if (installTimer) window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    document.documentElement.dataset.aiBoardIntelligence = installed ? "ready" : "loading";
    return profilesReady && installed;
  }

  window.AiBoardIntelligenceV25 = Object.freeze({
    version: VERSION,
    middleNames: [...MIDDLE_NAMES],
    eliteNames: [...ELITE_NAMES],
    supportedNames: [...SUPPORTED_NAMES],
    roleConfig: ROLE_CONFIG,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    supports: name => SUPPORTED_NAMES.includes(name),
    analyzeBoard,
    analyzeBlockers,
    desiredValueFraction,
    desiredBluffFraction,
    applyBoardIntelligence,
    chooseDecision,
    refresh,
  });

  refresh();
  window.setTimeout(refresh, 0);
  window.setTimeout(refresh, 80);
  window.setTimeout(refresh, 300);
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
})();
