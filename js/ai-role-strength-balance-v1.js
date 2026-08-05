// Per-role difficulty calibration without hidden-information access.
(() => {
  "use strict";

  if (window.AiRoleStrengthBalanceV1?.version) return;

  const VERSION = "1.0.0";
  const SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);
  const FINAL_NAMES = new Set(["Gemini"]);
  const OPENING_NAMES = new Set(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);
  const SUPPORTED_STRATEGY_NAMES = new Set([
    "Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper",
    "Nova", "Unit-9", "Merlin", "Vlad",
  ]);

  const ROLE_PROFILES = Object.freeze({
    Toto: profile(18, 1, "opening", 0.34, 0.065, 0.020, -0.030, 0.72, 0.88, 0.03),
    Pao: profile(22, 1, "opening", 0.36, 0.072, -0.030, -0.026, 0.78, 0.90, -0.05),
    Leo: profile(30, 2, "opening", 0.42, 0.060, -0.018, 0.006, 1.10, 1.03, -0.03),
    Foxy: profile(34, 2, "opening", 0.44, 0.064, -0.010, 0.010, 1.16, 1.02, -0.03),
    Wolf: profile(42, 3, "opening", 0.52, 0.047, 0.004, 0.005, 1.00, 1.02, 0.01),
    Shark: profile(48, 3, "opening", 0.58, 0.038, 0.010, 0.010, 0.96, 1.03, 0.03),

    Dodo: profile(46, 3, "middle", 0.56, 0.034, 0.018, -0.008, 0.78, 0.94, 0.04),
    Momo: profile(52, 4, "middle", 0.60, 0.030, -0.010, 0.004, 1.10, 1.04, -0.03),
    Ace: profile(56, 4, "middle", 0.64, 0.025, 0.006, 0.008, 0.95, 1.03, 0.03),
    Bruno: profile(58, 4, "middle", 0.66, 0.023, 0.012, 0.006, 0.80, 1.02, 0.04),
    Nori: profile(60, 4, "middle", 0.68, 0.021, 0.008, 0.010, 1.00, 1.04, 0.03),
    Viper: profile(66, 5, "middle", 0.74, 0.017, 0.006, 0.014, 1.02, 1.05, 0.04),

    Nova: profile(74, 6, "elite", 0.82, 0.013, 0.006, 0.018, 1.05, 1.06, 0.03),
    Merlin: profile(78, 6, "elite", 0.86, 0.011, 0.008, 0.020, 1.00, 1.05, 0.05),
    "Unit-9": profile(82, 6, "elite", 0.90, 0.008, 0.012, 0.022, 0.95, 1.06, 0.07),
    Vlad: profile(86, 6, "elite", 0.92, 0.006, 0.010, 0.024, 1.02, 1.08, 0.06),

    Oracle: profile(91, 7, "special", 0.95, 0.004, 0.012, 0.026, 1.00, 1.00, 0),
    Chronos: profile(94, 7, "special", 0.97, 0.003, 0.014, 0.028, 1.00, 1.00, 0),
    Gemini: profile(98, 7, "gemini", 0.99, 0.002, 0.016, 0.030, 1.00, 1.00, 0),
  });

  let installTimer = 0;
  let installAttempts = 0;
  let observer = null;
  let refreshFrame = 0;

  function profile(rating, stars, tier, precision, noiseAmplitude, callThresholdDelta, raiseScoreDelta, bluffMultiplier, aggressionMultiplier, patienceDelta) {
    return Object.freeze({
      rating,
      stars,
      tier,
      precision,
      noiseAmplitude,
      callThresholdDelta,
      raiseScoreDelta,
      bluffMultiplier,
      aggressionMultiplier,
      patienceDelta,
    });
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function profileFor(playerOrName) {
    const name = typeof playerOrName === "string" ? playerOrName : playerOrName?.name;
    return ROLE_PROFILES[name] || null;
  }

  function publicSeed(context = {}) {
    const text = [
      context.name || "",
      context.handNumber || 0,
      context.street || "preflop",
      context.position || "",
      Math.round(Number(context.pot) || 0),
      Math.round(Number(context.needed) || 0),
      Math.round(Number(context.currentBet) || 0),
      Number(context.activeOpponents) || 0,
    ].join("|");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function decisionSignals(playerOrName, context = {}) {
    const resolved = profileFor(playerOrName);
    if (!resolved) {
      return Object.freeze({
        version: VERSION,
        rating: 50,
        stars: 3,
        tier: "neutral",
        precision: 0.5,
        noise: 0,
        callThresholdDelta: 0,
        raiseScoreDelta: 0,
        bluffMultiplier: 1,
        aggressionMultiplier: 1,
        patienceDelta: 0,
        publicInformationOnly: true,
      });
    }
    const centered = publicSeed({ ...context, name: typeof playerOrName === "string" ? playerOrName : playerOrName?.name }) * 2 - 1;
    return Object.freeze({
      version: VERSION,
      rating: resolved.rating,
      stars: resolved.stars,
      tier: resolved.tier,
      precision: resolved.precision,
      noise: centered * resolved.noiseAmplitude,
      callThresholdDelta: resolved.callThresholdDelta,
      raiseScoreDelta: resolved.raiseScoreDelta,
      bluffMultiplier: resolved.bluffMultiplier,
      aggressionMultiplier: resolved.aggressionMultiplier,
      patienceDelta: resolved.patienceDelta,
      publicInformationOnly: true,
    });
  }

  function contextFromDecision(player, decision = {}) {
    const context = decision.context || {};
    return {
      handNumber: Number(context.handNumber) || 0,
      street: context.street || "preflop",
      position: context.position || "",
      pot: Number(context.pot) || 0,
      needed: Number(context.needed) || 0,
      currentBet: Number(context.currentBet) || 0,
      activeOpponents: Number(context.activeOpponents) || 0,
      name: player?.name || "",
    };
  }

  function bestRaiseCandidate(decision) {
    return [...(decision?.candidates || [])]
      .filter(candidate => Number(candidate?.raiseBy) > 0)
      .sort((left, right) => Number(right.ev) - Number(left.ev))[0] || null;
  }

  function calibrateStrategyDecision(player, decision) {
    if (!decision || decision.action === "fallback") return decision;
    const resolved = profileFor(player);
    if (!resolved || !SUPPORTED_STRATEGY_NAMES.has(player?.name)) return decision;

    const signals = decisionSignals(player, contextFromDecision(player, decision));
    const rawCallScore = Number(decision.callScore) || 0;
    const rawRaiseScore = Number(decision.raiseScore) || 0;
    const callScore = rawCallScore - signals.callThresholdDelta + signals.noise;
    const raiseScore = rawRaiseScore + signals.raiseScoreDelta - Math.abs(signals.noise) * 0.15;
    const needed = Math.max(0, Number(decision.context?.needed) || 0);
    const bestRaise = bestRaiseCandidate(decision);
    const raiseGate = Math.max(callScore, 0.035 - signals.raiseScoreDelta * 0.35);

    decision.rawCallScore = rawCallScore;
    decision.rawRaiseScore = rawRaiseScore;
    decision.callScore = callScore;
    decision.raiseScore = raiseScore;
    decision.roleStrength = signals;

    if (decision.action === "call" && needed > 0 && callScore < -0.045 && !decision.bluffing && !decision.valueReady) {
      decision.action = "fold";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依角色強度校準放棄負 EV 跟注`;
      return decision;
    }

    if (decision.action === "fold" && needed > 0 && callScore >= 0.008 && !decision.bluffing) {
      decision.action = "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依角色強度校準保留正 EV 跟注`;
    }

    if (
      bestRaise
      && decision.action !== "raise"
      && (decision.valueReady || decision.bluffing)
      && raiseScore > raiseGate
    ) {
      decision.action = "raise";
      decision.raiseBy = Number(bestRaise.raiseBy) || 0;
      decision.sizeFraction = Number(bestRaise.fraction) || 0;
      decision.reason = `${player.name} 依角色強度校準採用較佳加注線`;
    } else if (
      decision.action === "raise"
      && !decision.valueReady
      && !decision.bluffing
      && raiseScore <= raiseGate
    ) {
      decision.action = needed > 0 && callScore < -0.02 ? "fold" : "call";
      decision.raiseBy = 0;
      decision.sizeFraction = 0;
      decision.reason = `${player.name} 依角色強度校準取消低品質加注`;
    }

    return decision;
  }

  function tuneEntity(entity) {
    const resolved = profileFor(entity);
    if (!entity || !resolved) return false;
    if (!entity.__roleStrengthBase) {
      entity.__roleStrengthBase = {
        bluffRate: Number(entity.bluffRate) || 0,
        aggression: Number(entity.aggression) || 0,
        patience: Number(entity.patience) || 0,
      };
    }
    const base = entity.__roleStrengthBase;
    entity.bluffRate = clamp(base.bluffRate * resolved.bluffMultiplier, 0, 0.55);
    entity.aggression = clamp(base.aggression * resolved.aggressionMultiplier, 0.18, 0.98);
    entity.patience = clamp(base.patience + resolved.patienceDelta, 0.2, 0.995);
    entity.roleStrengthVersion = VERSION;
    entity.roleStrengthRating = resolved.rating;
    entity.decisionPrecision = resolved.precision;
    entity.tierStars = resolved.stars;
    entity.aiTier = resolved.tier;
    return true;
  }

  function registerProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const entity of AI_ROSTER) tuneEntity(entity);
    for (const entity of state?.players || []) {
      if (!entity?.isHuman) tuneEntity(entity);
    }
    if (typeof AI_PROFILE_META !== "undefined") {
      for (const [name, resolved] of Object.entries(ROLE_PROFILES)) {
        if (!AI_PROFILE_META[name]) continue;
        AI_PROFILE_META[name].stars = resolved.stars;
        AI_PROFILE_META[name].strengthRating = resolved.rating;
        AI_PROFILE_META[name].roleStrengthVersion = VERSION;
      }
    }
    return true;
  }

  function patchStrategyRoot() {
    const root = window.AiCharacterStrategies;
    if (!root?.chooseDecision || root.__roleStrengthPatched) return Boolean(root?.__roleStrengthPatched);
    const originalChooseDecision = root.chooseDecision.bind(root);
    root.chooseDecision = function chooseDecisionWithRoleStrength(player, options = {}) {
      return calibrateStrategyDecision(player, originalChooseDecision(player, options));
    };
    root.__roleStrengthPatched = true;
    return true;
  }

  function installBotDiagnostics() {
    if (window.__aiRoleStrengthBotWrapped || typeof botAction !== "function") return Boolean(window.__aiRoleStrengthBotWrapped);
    const previousBotAction = botAction;
    botAction = function botActionWithRoleStrength(player) {
      tuneEntity(player);
      const result = previousBotAction(player);
      const resolved = profileFor(player);
      if (resolved && player) {
        const diagnostic = {
          version: VERSION,
          rating: resolved.rating,
          stars: resolved.stars,
          tier: resolved.tier,
          precision: resolved.precision,
          publicInformationOnly: true,
        };
        if (player.lastStrategyDecision) player.lastStrategyDecision.roleStrength = diagnostic;
        if (player.lastStrengthEstimate) player.lastStrengthEstimate.roleStrength = diagnostic;
      }
      return result;
    };
    window.__aiRoleStrengthBotWrapped = true;
    return true;
  }

  function granularTierForName(name) {
    const resolved = profileFor(name);
    if (!resolved) return window.__aiRoleStrengthOriginalTierForName?.(name) || { key: "opening", label: "初階 AI", stars: 2 };
    const label = SPECIAL_NAMES.has(name)
      ? "特殊 BOSS"
      : FINAL_NAMES.has(name)
        ? "FINAL BOSS"
        : resolved.tier === "elite"
          ? "高階 AI"
          : resolved.tier === "middle"
            ? "中階 AI"
            : "初階 AI";
    return { key: resolved.tier, label, stars: resolved.stars };
  }

  function patchTierApi() {
    const tierSystem = window.AiTierBossSystem;
    if (!tierSystem?.tierForName || tierSystem.__roleStrengthTierPatched) return Boolean(tierSystem?.__roleStrengthTierPatched);
    window.__aiRoleStrengthOriginalTierForName = tierSystem.tierForName.bind(tierSystem);
    tierSystem.tierForName = granularTierForName;
    tierSystem.__roleStrengthTierPatched = true;
    return true;
  }

  function syncVisibleStars() {
    document.querySelectorAll(".seat[data-profile-position]").forEach(seat => {
      const position = Number(seat.dataset.profilePosition);
      const player = state?.players?.find(candidate => candidate.position === position);
      const resolved = profileFor(player);
      if (!resolved) return;
      seat.dataset.aiStars = String(resolved.stars);
      const badgeStars = seat.querySelector(".ai-tier-seat-badge small");
      if (badgeStars) badgeStars.textContent = "★".repeat(resolved.stars);
    });

    const panel = document.querySelector("#aiProfilePanel");
    const selected = state?.players?.find(player => !player.isHuman && player.position === state.selectedProfilePosition);
    const resolved = profileFor(selected);
    if (!panel || panel.hidden || !resolved) return;
    panel.dataset.aiStars = String(resolved.stars);
    const stars = panel.querySelector(".ai-tier-stars");
    if (stars) {
      const filled = stars.querySelector("b");
      const empty = stars.querySelector("i");
      if (filled) filled.textContent = "★".repeat(resolved.stars);
      if (empty) empty.textContent = "☆".repeat(7 - resolved.stars);
      stars.setAttribute("aria-label", `難度 ${resolved.stars} / 7 星`);
      stars.title = `角色強度 ${resolved.rating} / 100 · 難度 ${resolved.stars} / 7 星`;
    }
  }

  function refresh() {
    const profilesReady = registerProfiles();
    const strategyReady = patchStrategyRoot();
    const botReady = installBotDiagnostics();
    patchTierApi();
    syncVisibleStars();
    document.documentElement.dataset.aiRoleStrengthBalance = profilesReady ? "ready" : "loading";
    return profilesReady && strategyReady && botReady;
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  window.AiRoleStrengthBalanceV1 = {
    version: VERSION,
    profiles: ROLE_PROFILES,
    fairInformationPolicy: Object.freeze({
      publicRoleName: true,
      publicDecisionContext: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
    profileFor,
    decisionSignals,
    calibrateStrategyDecision,
    tierForName: granularTierForName,
    refresh,
  };

  refresh();
  observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  if (!installTimer) {
    installTimer = window.setInterval(() => {
      const ready = refresh();
      installAttempts += 1;
      if (ready || installAttempts >= 240) {
        window.clearInterval(installTimer);
        installTimer = 0;
      }
    }, 25);
  }
})();
