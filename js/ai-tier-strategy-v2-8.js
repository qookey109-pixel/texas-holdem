// AI V2.8: tier targets, EV guards, adaptive sizing, and fair Boss precision.
(() => {
  "use strict";
  if (window.AiTierStrategyV28?.version) return;

  const VERSION = "2.8.0";
  const OPENING = ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"];
  const MIDDLE = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"];
  const ELITE = ["Nova", "Unit-9", "Merlin", "Vlad"];
  const SPECIAL = ["Oracle", "Chronos"];
  const TARGETS = Object.freeze({
    Toto: target(6.6, "opening"), Pao: target(6.7, "opening"),
    Leo: target(7.0, "opening"), Foxy: target(7.1, "opening"),
    Wolf: target(7.4, "opening"), Shark: target(7.5, "opening"),
    Dodo: target(8.0, "middle"), Momo: target(8.0, "middle"),
    Ace: target(8.1, "middle"), Bruno: target(8.1, "middle"),
    Nori: target(8.2, "middle"), Viper: target(8.3, "middle"),
    Nova: target(9.0, "elite"), Merlin: target(9.1, "elite"),
    "Unit-9": target(9.2, "elite"), Vlad: target(9.3, "elite"),
    Oracle: target(9.6, "special"), Chronos: target(9.8, "special"),
  });
  const OPENING_SIZES = Object.freeze({
    Toto: [0.32, 0.52], Pao: [0.34, 0.55], Leo: [0.42, 0.68, 0.92],
    Foxy: [0.33, 0.64, 0.96], Wolf: [0.33, 0.56, 0.76],
    Shark: [0.30, 0.50, 0.72, 0.95],
  });
  const BOSS = Object.freeze({
    Oracle: { samples: 560, sizes: [0.28, 0.48, 0.72, 1.05], margin: 0.004, mix: 0.012 },
    Chronos: { samples: 800, sizes: [0.25, 0.45, 0.68, 0.95, 1.28], margin: 0.002, mix: 0.008 },
  });
  let previousBotAction = null;
  let wrappedBotAction = null;
  let timer = 0;
  let attempts = 0;
  let profileFrame = 0;

  function target(score10, tier) {
    return Object.freeze({ score10, rating100: Math.round(score10 * 10), tier });
  }
  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }
  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }
  function chip(value) {
    return Math.max(0, Math.floor((Number(value) || 0) / 10) * 10);
  }
  function street() {
    const count = state?.board?.length || 0;
    return count >= 5 ? "river" : count === 4 ? "turn" : count >= 3 ? "flop" : "preflop";
  }
  function opponents(player) {
    return Math.max(1, (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded && !candidate.eliminated
    )).length);
  }
  function cardKey(card) {
    return `${Number(card?.value ?? card?.rank ?? 0) || 0}:${String(card?.suit || "")}`;
  }
  function hash(text) {
    let value = 2166136261;
    for (const character of String(text || "")) {
      value ^= character.charCodeAt(0);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }
  function seededRandom(seed) {
    let value = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
      value += 0x6d2b79f5;
      let output = value;
      output = Math.imul(output ^ (output >>> 15), output | 1);
      output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
      return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
    };
  }
  function publicRandom(player, label) {
    const publicOpponents = (state?.players || [])
      .filter(candidate => candidate && candidate !== player && !candidate.folded)
      .map(candidate => [candidate.name, candidate.position, candidate.bet, candidate.stack, candidate.lastAction]);
    return seededRandom(hash(JSON.stringify({
      version: VERSION, label, actor: player?.name, hand: state?.handNumber,
      street: street(), cards: (player?.cards || []).map(cardKey).sort(),
      board: (state?.board || []).map(cardKey), pot: state?.pot,
      currentBet: state?.currentBet, opponents: publicOpponents,
    })));
  }
  function texture() {
    const result = window.AiBoardTextureEngineV1?.analyze?.(state?.board || []);
    if (result) return { wet: clamp(result.wetness), dry: clamp(result.dryness) };
    return { wet: 0.3, dry: 0.7 };
  }
  function draw(player) {
    if (typeof aiDrawPotential === "function") return clamp(aiDrawPotential(player), 0, 0.24);
    return 0;
  }
  function callEv(equity, pot, needed) {
    return window.AiEvAccountingV1?.callEv?.({ equity, pot, callAmount: needed })
      ?? equity * (pot + needed) - needed;
  }
  function raiseEv(equity, pot, needed, raiseBy, foldEquity, calledBy = 1) {
    return window.AiEvAccountingV1?.raiseEv?.({
      equity, pot, callAmount: needed, raiseBy, foldEquity, calledBy,
    }) ?? 0;
  }
  function legalRaise(player, needed) {
    const bigBlind = Math.max(1, currentBigBlind());
    const available = Math.max(0, Number(player?.stack) - needed);
    const minimum = Math.max(bigBlind, minimumRaiseBy());
    return { bigBlind, available, minimum, canRaise: !player?.raiseLocked && available >= minimum };
  }
  function foldBase(player) {
    const stats = state?.heroStyle || {};
    const hands = Math.max(1, Number(stats.hands) || 0);
    const confidence = clamp((Number(stats.hands) || 0) / 24);
    const observed = (Number(stats.folds) || 0) / hands;
    const position = positionLabel(player);
    const positionBonus = { BTN: 0.055, CO: 0.04, HJ: 0.02, MP: 0.008, UTG: -0.02, SB: -0.01, BB: 0 }[position] || 0;
    return clamp(0.27 + (observed - 0.31) * 0.28 * confidence + positionBonus, 0.08, 0.64);
  }
  function candidates(player, equity, sizes, options = {}) {
    const pot = Math.max(1, Number(options.pot ?? state?.pot) || 1);
    const needed = Math.max(0, Number(options.needed ?? amountToCall(player)) || 0);
    const legal = legalRaise(player, needed);
    const cap = Number(options.cap) > 0 ? Math.min(legal.available, Number(options.cap)) : legal.available;
    if (!legal.canRaise || cap < legal.minimum) return [];
    const board = texture();
    const fractions = [...sizes];
    if (street() !== "preflop" && board.dry >= 0.66) fractions.push(0.3);
    if (street() !== "preflop" && board.wet >= 0.52) fractions.push(0.86);
    if (options.tier === "elite" && street() === "river") fractions.push(1.18);
    if (options.tier === "special") fractions.push(board.wet >= 0.58 ? 1.12 : 0.36);
    if (Number(player?.stack) / Math.max(1, pot + needed) <= 1.35) fractions.push(1.5);
    const active = opponents(player);
    const calledBy = clamp(options.calledBy ?? 1, 1, active);
    const base = clamp(options.foldBase ?? foldBase(player));
    return [...new Set(fractions.map(value => round(clamp(value, 0.22, 1.5), 3)))]
      .map(fraction => {
        const raiseBy = Math.min(cap, Math.max(legal.minimum, chip(pot * fraction)));
        const pressure = clamp((fraction - 0.35) * 0.17, -0.025, 0.18);
        const foldEquity = clamp(base + pressure - Math.max(0, active - 1) * 0.065, 0.025, 0.82);
        return { fraction, raiseBy, foldEquity, ev: raiseEv(equity, pot, needed, raiseBy, foldEquity, calledBy) };
      })
      .filter(candidate => candidate.raiseBy >= legal.minimum)
      .sort((left, right) => right.ev - left.ev);
  }
  function mixedChoice(list, tolerance, random) {
    if (!list.length) return null;
    const close = list.filter(candidate => list[0].ev - candidate.ev <= tolerance);
    return close[Math.min(close.length - 1, Math.floor(random() * close.length))] || list[0];
  }

  function openingScenario(player) {
    const active = (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded && !candidate.eliminated
    ));
    const stack = Math.max(0, Number(player?.stack) || 0);
    const maxOpponentStack = active.reduce((max, candidate) => Math.max(max, Number(candidate.stack) || 0), 0);
    return {
      handNumber: Number(state?.handNumber) || 1,
      street: street(), position: positionLabel(player), stack,
      effectiveStack: Math.min(stack || 1, maxOpponentStack || stack || 1),
      needed: Math.max(0, amountToCall(player)), pot: Math.max(1, Number(state?.pot) || 1),
      bigBlind: Math.max(1, currentBigBlind()), minimumRaise: Math.max(currentBigBlind(), minimumRaiseBy()),
      activeOpponents: Math.max(1, active.length), baseStrength: estimateStrength(player),
      drawPotential: draw(player),
      texture: window.AiOpeningStrategiesV23.boardTexture(state?.board || []),
      canRaise: !player?.raiseLocked,
    };
  }
  function chooseOpeningDecision(player, options = {}) {
    const engine = window.AiOpeningStrategiesV23;
    if (!engine?.supports?.(player)) return { action: "fallback", version: VERSION };
    const random = options.random || publicRandom(player, "opening");
    const base = engine.evaluateScenario(player.name, openingScenario(player), random());
    const context = base.context;
    const equity = clamp(base.adjustedStrength, 0.01, 0.99);
    const currentCallEv = callEv(equity, context.pot, context.needed);
    const active = Math.max(1, context.activeOpponents);
    const list = candidates(player, equity, OPENING_SIZES[player.name], {
      pot: context.pot, needed: context.needed, cap: context.maxRaise,
      tier: "opening", calledBy: 1 + Math.max(0, active - 1) * 0.34,
    });
    const best = mixedChoice(list, context.pot * 0.018, random);
    const value = Boolean(base.valueReady || base.premium);
    const semiBluff = context.drawPotential >= 0.085 && equity >= context.potOdds - 0.015;
    const bluff = Boolean(base.bluffEligible || semiBluff);
    let action = base.action === "check" ? "call" : base.action;
    let raiseBy = action === "raise" ? base.raiseBy : 0;
    let sizeFraction = action === "raise" ? base.sizeFraction : 0;
    let reason = `V2.8 保留 V2.3 ${base.reason}`;
    if (context.needed > 0 && currentCallEv < -Math.max(1, context.bigBlind * 0.04) && !value && !semiBluff) {
      action = "fold"; raiseBy = 0; sizeFraction = 0;
      reason = "V2.8 初階停止明顯負期望跟注";
    } else if (best && action !== "fold" && (value || bluff) && best.ev > Math.max(0, currentCallEv) + context.pot * 0.012) {
      action = "raise"; raiseBy = best.raiseBy; sizeFraction = best.fraction;
      reason = value ? "V2.8 初階自適應價值尺寸" : "V2.8 初階有界半詐唬尺寸";
    } else if (action === "raise" && (!best || best.ev <= Math.max(0, currentCallEv))) {
      action = context.needed > 0 && currentCallEv < 0 ? "fold" : "call";
      raiseBy = 0; sizeFraction = 0;
      reason = "V2.8 初階取消不優於跟注／過牌的加注";
    }
    return {
      action, raiseBy, sizeFraction, reason, version: VERSION, tier: "opening",
      targetScore10: TARGETS[player.name].score10, equityProxy: round(equity),
      potOdds: round(context.potOdds), callEv: round(currentCallEv), candidates: list,
      valueReady: value, bluffing: bluff, publicInformationOnly: true,
    };
  }

  function sizingFit(candidate, decision, tier) {
    const board = texture();
    const fraction = Number(candidate.fraction) || 0;
    let targetSize = board.dry >= 0.66 ? 0.33 : board.wet >= 0.52 ? 0.78 : 0.55;
    if (decision.context?.street === "river") targetSize += tier === "elite" ? 0.18 : 0.08;
    if (Number(decision.context?.spr) <= 1.5) targetSize = 1.2;
    return 1 - Math.min(1, Math.abs(fraction - targetSize));
  }
  function enhanceTierDecision(player, decision, options = {}) {
    const tier = TARGETS[player?.name]?.tier;
    if (!decision || !["middle", "elite"].includes(tier)) return decision;
    const random = options.random || publicRandom(player, tier);
    const pot = Math.max(1, Number(decision.context?.pot) || Number(state?.pot) || 1);
    const needed = Math.max(0, Number(decision.context?.needed) || 0);
    const equity = clamp(decision.raiseCalledEquity ?? decision.equityProxy ?? decision.context?.equityProxy, 0.001, 0.999);
    const currentCallEv = callEv(clamp(decision.equityProxy ?? equity), pot, needed);
    const config = tier === "elite"
      ? { negative: 0.008, positive: 0.010, margin: 0.006, mix: 0.014, size: 0.085 }
      : { negative: 0.018, positive: 0.018, margin: 0.012, mix: 0.028, size: 0.055 };
    const ranked = [...(decision.candidates || [])]
      .filter(candidate => Number(candidate.raiseBy) > 0)
      .map(candidate => ({
        ...candidate,
        rawEv: Number(candidate.ev),
        fit: sizingFit(candidate, decision, tier),
        ev: Number(candidate.ev) + pot * config.size * sizingFit(candidate, decision, tier),
      }))
      .sort((left, right) => right.ev - left.ev);
    const best = mixedChoice(ranked, pot * config.mix, random);
    const rawRaiseEv = Number(best?.rawEv ?? Number.NEGATIVE_INFINITY);
    const drawValue = clamp(decision.context?.drawPotential);
    if (needed > 0 && currentCallEv < -Math.max(1, pot * config.negative) && !decision.valueReady && drawValue < 0.09) {
      Object.assign(decision, { action: "fold", raiseBy: 0, sizeFraction: 0, bluffing: false });
      decision.reason = "V2.8 分級 EV 防守閘停止負期望投入";
      decision.v28Adjustment = "negative-call-guard";
    } else if (decision.action === "fold" && currentCallEv > Math.max(1, pot * config.positive)) {
      Object.assign(decision, { action: "call", raiseBy: 0, sizeFraction: 0 });
      decision.reason = "V2.8 恢復正期望防守";
      decision.v28Adjustment = "positive-defense-rescue";
    }
    if (best && rawRaiseEv > Math.max(0, currentCallEv) + pot * config.margin
      && (decision.valueReady || decision.bluffing || drawValue >= 0.095)) {
      Object.assign(decision, { action: "raise", raiseBy: best.raiseBy, sizeFraction: best.fraction });
      decision.reason = "V2.8 採用最佳 EV／牌面尺寸";
      decision.v28Adjustment = "adaptive-best-raise";
    } else if (decision.action === "raise" && rawRaiseEv <= Math.max(0, currentCallEv)) {
      Object.assign(decision, { action: needed > 0 && currentCallEv < 0 ? "fold" : "call", raiseBy: 0, sizeFraction: 0, bluffing: false });
      decision.reason = "V2.8 取消不優於跟注／過牌的加注";
      decision.v28Adjustment = "raise-utility-guard";
    }
    decision.strategyVersion = VERSION;
    decision.decisionChainVersion = VERSION;
    decision.v28Tier = tier;
    decision.v28TargetScore10 = TARGETS[player.name].score10;
    decision.v28CallEv = round(currentCallEv);
    decision.v28RankedCandidates = ranked.map(candidate => ({
      fraction: candidate.fraction, raiseBy: candidate.raiseBy,
      ev: round(candidate.rawEv), sizingFit: round(candidate.fit), utility: round(candidate.ev),
    }));
    decision.publicInformationOnly = true;
    return decision;
  }

  function chooseBossDecision(player, options = {}) {
    const config = BOSS[player?.name];
    if (!config) return { action: "fallback", version: VERSION };
    const random = options.random || publicRandom(player, "boss");
    const context = window.FairSpecialBosses.publicContext(player);
    const active = opponents(player);
    const pot = Math.max(1, Number(state?.pot) || 1);
    const needed = Math.max(0, amountToCall(player));
    const result = window.BossEquityEngineV1.estimate(player, {
      board: state?.board || [], opponentCount: active, samples: config.samples,
      random, rangeModel: true, raisePressure: player.name === "Chronos" ? 0.82 : 0.7,
    });
    const equity = clamp(result?.equity ?? estimateStrength(player), 0.001, 0.999);
    const calledEquity = clamp(result?.raiseCalledEquity ?? equity, 0.001, 0.999);
    const currentCallEv = callEv(equity, pot, needed);
    const habits = context.habits || {};
    const confidence = clamp((Number(habits.sample) || 0) / 30);
    const observedFold = 0.24 + (clamp(habits.foldRate) - 0.3) * 0.32 * confidence;
    const baseFold = clamp(observedFold * 0.62 + clamp(result?.rangeFoldEquity) * 0.38, 0.04, 0.74);
    const list = candidates(player, calledEquity, config.sizes, {
      pot, needed, foldBase: baseFold, tier: "special",
      calledBy: 1 + Math.max(0, active - 1) * 0.46,
    });
    const best = mixedChoice(list, pot * config.mix, random);
    const potOdds = needed / Math.max(1, pot + needed);
    const drawValue = draw(player);
    const value = calledEquity >= (street() === "preflop" ? 0.67 : 0.58);
    const premium = calledEquity >= (street() === "preflop" ? 0.82 : 0.76);
    const legal = legalRaise(player, needed);
    const bluffRate = clamp(0.04 + baseFold * 0.17 - clamp(habits.callRate) * 0.07, 0.04, player.name === "Oracle" ? 0.26 : 0.20);
    const bluff = legal.canRaise && !value && legal.available / legal.bigBlind > 18
      && needed <= legal.available * 0.12 && (drawValue >= 0.09 || random() < bluffRate);
    let action = "call";
    let raiseBy = 0;
    let sizeFraction = 0;
    let reason = "V2.8 Boss 保留最高 EV 跟注／過牌";
    if (needed > 0 && currentCallEv < -Math.max(1, pot * 0.004) && !value && !bluff) {
      action = "fold"; reason = "V2.8 Boss 精確停止負期望跟注";
    } else if (legal.canRaise && premium && legal.available / legal.bigBlind <= 12) {
      action = "raise"; raiseBy = legal.available; sizeFraction = legal.available / pot;
      reason = "V2.8 Boss 低 SPR 最大價值推進";
    } else if (best && best.ev > Math.max(0, currentCallEv) + pot * config.margin && (value || bluff || drawValue >= 0.1)) {
      action = "raise"; raiseBy = best.raiseBy; sizeFraction = best.fraction;
      reason = player.name === "Chronos" ? "V2.8 Chronos 高精度 EV／尺寸解算" : "V2.8 Oracle 範圍剝削與混合尺寸";
    } else if (needed > 0 && equity < potOdds - 0.012 && currentCallEv < 0) {
      action = "fold"; reason = "V2.8 Boss Equity 不足以支付價格";
    }
    return {
      action, raiseBy, sizeFraction, reason, version: VERSION, tier: "special",
      targetScore10: TARGETS[player.name].score10, equity: round(equity),
      raiseCalledEquity: round(calledEquity), potOdds: round(potOdds),
      callEv: round(currentCallEv), foldEquity: round(baseFold), candidates: list,
      valueReady: value, bluffing: bluff, publicInformationOnly: true,
      equityResult: result ? {
        method: result.method, samples: Number(result.samples || result.combinations) || 0,
        rangeConditioned: Boolean(result.rangeConditioned),
        rangeModelVersion: result.rangeModelVersion || "uniform",
      } : null,
    };
  }

  function perform(player, decision) {
    player.status = "Thinking...";
    player.lastStrategyDecision = {
      strategyVersion: VERSION, decisionChainVersion: VERSION,
      action: decision.action, reason: decision.reason,
      raiseBy: Number(decision.raiseBy) || 0, sizeFraction: Number(decision.sizeFraction) || 0,
      tier: decision.tier || TARGETS[player.name]?.tier || "",
      targetScore10: TARGETS[player.name]?.score10 || 0,
      equityProxy: decision.equityProxy ?? decision.equity ?? 0,
      potOdds: decision.potOdds ?? 0, callEv: decision.callEv ?? decision.v28CallEv ?? 0,
      v28Adjustment: decision.v28Adjustment || "", publicInformationOnly: true,
    };
    if (decision.equityResult) player.lastStrategyDecision.bossEquity = { ...decision.equityResult };
    if (decision.action === "fold") {
      Object.assign(player, { folded: true, hasActed: true, raiseLocked: false, status: "棄牌", lastAction: "fold" });
      if (!state.isMuted) Audio.fold();
      logAction(player, "Fold"); announceAction("FOLD", "fold"); say(player, "fold", { chance: 0.22 });
      return;
    }
    if (decision.action === "raise" && Number(decision.raiseBy) > 0) {
      raisePlayer(player, decision.raiseBy);
      if (!state.isMuted) Audio.raise();
      logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
      announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
      say(player, player.allIn ? "allin" : "raise", { force: player.allIn, chance: 0.42 });
      return;
    }
    const paid = pay(player, Math.max(0, amountToCall(player)));
    player.hasActed = true; player.raiseLocked = false;
    player.status = player.allIn && paid > 0 ? `ALL-IN ${player.bet}` : (paid === 0 ? "過牌" : `跟注 ${paid}`);
    if (paid === 0) { if (!state.isMuted) Audio.check(); } else if (!state.isMuted) Audio.chip();
    player.lastAction = player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call");
    logAction(player, player.allIn && paid > 0 ? "All-in Call" : (paid === 0 ? "Check" : "Call"), paid);
    announceAction(player.allIn && paid > 0 ? "ALL-IN" : (paid === 0 ? "CHECK" : "CALL"), player.lastAction);
    say(player, player.allIn && paid > 0 ? "allin" : (paid === 0 ? "check" : "call"), { chance: 0.2 });
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const entity of [...AI_ROSTER, ...(state?.players || [])]) {
      if (!entity || entity.isHuman || !TARGETS[entity.name]) continue;
      const value = TARGETS[entity.name];
      entity.roleStrengthRating = value.rating100;
      entity.strengthScore10 = value.score10;
      entity.aiTierTargetV28 = value.tier;
      entity.aiTierStrategyVersion = VERSION;
      entity.publicInformationOnly = true;
      if (SPECIAL.includes(entity.name)) {
        delete entity.omniscient;
        entity.fairPlay = true;
        entity.rangeInference = true;
      }
      if (typeof AI_PROFILE_META !== "undefined" && AI_PROFILE_META[entity.name]) {
        Object.assign(AI_PROFILE_META[entity.name], {
          strengthRating: value.rating100,
          strengthScore10: value.score10,
          aiTierStrategyVersion: VERSION,
        });
      }
    }
    return true;
  }
  function install() {
    if (typeof botAction !== "function") return false;
    if (wrappedBotAction === botAction) return true;
    previousBotAction = botAction;
    wrappedBotAction = function botActionWithTierStrategyV28(player) {
      try {
        if (OPENING.includes(player?.name)) return perform(player, chooseOpeningDecision(player));
        if (MIDDLE.includes(player?.name) || ELITE.includes(player?.name)) {
          const base = window.AiMidEliteDecisionChainV27.composeDecision(player);
          if (base && base.action !== "fallback") return perform(player, enhanceTierDecision(player, base));
        }
        if (SPECIAL.includes(player?.name)) return perform(player, chooseBossDecision(player));
      } catch (error) {
        console.warn("AI V2.8 tier strategy fallback", player?.name, error);
      }
      return previousBotAction.apply(this, arguments);
    };
    wrappedBotAction.__aiTierStrategyV28Wrapper = true;
    botAction = wrappedBotAction;
    return true;
  }
  function ready() {
    return Boolean(
      window.AiOpeningStrategiesV23?.version
      && window.AiMidEliteDecisionChainV27?.version
      && window.AiEvAccountingV1?.version
      && window.BossPublicRangeModelV1?.version
      && window.BossEquityEngineV1?.version
      && window.FairSpecialBosses?.version
    );
  }
  function refresh() {
    registerProfiles();
    const installed = ready() && install();
    document.documentElement.dataset.aiTierStrategyV28 = installed ? "ready" : "loading";
    attempts += 1;
    if ((installed || attempts >= 360) && timer) {
      clearInterval(timer); timer = 0;
    }
    return installed;
  }

  window.AiTierStrategyV28 = Object.freeze({
    version: VERSION,
    openingNames: [...OPENING], middleNames: [...MIDDLE], eliteNames: [...ELITE], specialNames: [...SPECIAL],
    targetRatings: TARGETS,
    qualityTargets: Object.freeze({
      opening: Object.freeze({ minimum: 6.6, maximum: 7.5 }),
      middle: Object.freeze({ minimum: 8.0 }), elite: Object.freeze({ minimum: 9.0 }),
      special: Object.freeze({ minimum: 9.5, maximum: 10.0 }),
    }),
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true, publicBoard: true, publicActions: true, publicBetSizes: true,
      publicStacks: true, revealedShowdowns: true, hiddenOpponentCards: false,
      opponentCardInspection: false, actualDeckOrder: false, futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    chooseOpeningDecision, enhanceTierDecision, chooseBossDecision,
    composeTierDecision(player) {
      return enhanceTierDecision(player, window.AiMidEliteDecisionChainV27?.composeDecision?.(player));
    },
    refresh,
  });

  const initiallyReady = refresh();
  setTimeout(refresh, 0); setTimeout(refresh, 80); setTimeout(refresh, 300);
  if (!initiallyReady) timer = setInterval(refresh, 25);
  if (document.body && typeof MutationObserver === "function") {
    new MutationObserver(() => {
      if (profileFrame) return;
      profileFrame = requestAnimationFrame(() => {
        profileFrame = 0;
        registerProfiles();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();