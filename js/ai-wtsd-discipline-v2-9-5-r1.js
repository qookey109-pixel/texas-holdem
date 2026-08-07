// AI V2.9.5 recovery R1: tighten late-street calls for Foxy, Leo and Wolf.
(() => {
  "use strict";

  if (window.AiWtsdDisciplineV295R1?.version) return;

  const VERSION = "2.9.5-r1";
  const TARGETS = Object.freeze({
    Foxy: Object.freeze({
      turnPriceEdge: 0.12,
      riverPriceEdge: 0.18,
      turnEvPot: 0.03,
      riverEvPot: 0.06,
      strongValueFloor: 0.70,
      strongValueMargin: 0.17,
      marginalValuePremium: 0.035,
      multiwayStep: 0.012,
    }),
    Leo: Object.freeze({
      turnPriceEdge: 0.14,
      riverPriceEdge: 0.21,
      turnEvPot: 0.04,
      riverEvPot: 0.07,
      strongValueFloor: 0.72,
      strongValueMargin: 0.19,
      marginalValuePremium: 0.045,
      multiwayStep: 0.014,
    }),
    Wolf: Object.freeze({
      turnPriceEdge: 0.18,
      riverPriceEdge: 0.28,
      turnEvPot: 0.06,
      riverEvPot: 0.10,
      strongValueFloor: 0.76,
      strongValueMargin: 0.23,
      marginalValuePremium: 0.060,
      multiwayStep: 0.018,
    }),
  });
  const FAIR_INFORMATION_POLICY = Object.freeze({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    publicBetSizes: true,
    publicStacks: true,
    publicPosition: true,
    hiddenOpponentCards: false,
    opponentCardInspection: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });

  let installTimer = 0;
  let attempts = 0;
  let installedApi = null;
  let evidence = createEvidence();

  function createRoleEvidence() {
    return {
      inspectedCalls: 0,
      disciplinedFolds: 0,
      protectedStrongValue: 0,
      equityPriceFolds: 0,
      callEvFolds: 0,
    };
  }

  function createEvidence() {
    return {
      version: VERSION,
      inspectedCalls: 0,
      disciplinedFolds: 0,
      roles: Object.fromEntries(Object.keys(TARGETS).map(name => [name, createRoleEvidence()])),
    };
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function currentStreet() {
    const count = state?.board?.length || 0;
    return count >= 5 ? "river" : count === 4 ? "turn" : count >= 3 ? "flop" : "preflop";
  }

  function liveOpponents(player) {
    return Math.max(1, (state?.players || []).filter(candidate => (
      candidate && candidate !== player && !candidate.folded && !candidate.eliminated
    )).length);
  }

  function tightenDecision(player, source) {
    const guard = TARGETS[player?.name];
    if (!guard || !source || source.action !== "call") return source;

    const street = currentStreet();
    if (street !== "turn" && street !== "river") return source;

    const needed = Math.max(0, typeof amountToCall === "function" ? amountToCall(player) : 0);
    if (needed <= 0) return source;

    const pot = Math.max(1, Number(state?.pot) || 1);
    const opponents = liveOpponents(player);
    const potOdds = needed / Math.max(1, pot + needed);
    const equity = clamp(source.equityProxy ?? source.equity, 0.001, 0.999);
    const callEv = Number(source.callEv);
    const priceEdge = street === "river" ? guard.riverPriceEdge : guard.turnPriceEdge;
    const evPot = street === "river" ? guard.riverEvPot : guard.turnEvPot;
    const multiwayPremium = Math.max(0, opponents - 1) * guard.multiwayStep;
    const baseEquityFloor = clamp(potOdds + priceEdge + multiwayPremium, 0.05, 0.94);
    const marginalValuePremium = source.valueReady ? guard.marginalValuePremium : 0;
    const equityFloor = clamp(baseEquityFloor + marginalValuePremium, 0.05, 0.94);
    const evFloor = pot * evPot;
    const strongValueFloor = clamp(
      Math.max(guard.strongValueFloor, baseEquityFloor + guard.strongValueMargin),
      0.10,
      0.97,
    );
    const protectedStrongValue = Boolean(source.valueReady && equity >= strongValueFloor);
    const roleEvidence = evidence.roles[player.name];

    evidence.inspectedCalls += 1;
    roleEvidence.inspectedCalls += 1;

    if (protectedStrongValue) {
      roleEvidence.protectedStrongValue += 1;
      return {
        ...source,
        v295R1EquityFloor: equityFloor,
        v295R1EvFloor: evFloor,
        v295R1StrongValueFloor: strongValueFloor,
        v295R1MarginalValuePremium: marginalValuePremium,
        v295R1ProtectedStrongValue: true,
        publicInformationOnly: true,
      };
    }

    const callEvFailed = Number.isFinite(callEv) && callEv < evFloor;
    const equityFailed = equity < equityFloor;
    if (!callEvFailed && !equityFailed) {
      return {
        ...source,
        v295R1EquityFloor: equityFloor,
        v295R1EvFloor: evFloor,
        v295R1StrongValueFloor: strongValueFloor,
        v295R1MarginalValuePremium: marginalValuePremium,
        v295R1ProtectedStrongValue: false,
        publicInformationOnly: true,
      };
    }

    evidence.disciplinedFolds += 1;
    roleEvidence.disciplinedFolds += 1;
    if (callEvFailed) roleEvidence.callEvFolds += 1;
    else roleEvidence.equityPriceFolds += 1;

    return {
      ...source,
      action: "fold",
      raiseBy: 0,
      sizeFraction: 0,
      bluffing: false,
      reason: street === "river"
        ? "V2.9.5 R1 河牌拒絕超出角色支付範圍的跟注"
        : "V2.9.5 R1 轉牌拒絕低報酬追擊",
      v295R1Adjustment: callEvFailed
        ? `${street}-call-ev-discipline-r1`
        : `${street}-equity-price-discipline-r1`,
      v295R1EquityFloor: equityFloor,
      v295R1EvFloor: evFloor,
      v295R1StrongValueFloor: strongValueFloor,
      v295R1MarginalValuePremium: marginalValuePremium,
      v295R1ProtectedStrongValue: false,
      publicInformationOnly: true,
    };
  }

  function install() {
    const current = window.AiTierStrategyV28;
    if (!current?.version || typeof current.chooseOpeningDecision !== "function") return false;
    if (current.__aiWtsdDisciplineV295R1) {
      installedApi = current;
      return true;
    }

    const previousChoose = current.chooseOpeningDecision.bind(current);
    installedApi = Object.freeze({
      ...current,
      __aiWtsdDisciplineV295R1: true,
      __previousAiTierStrategyV28: current,
      chooseOpeningDecision(player) {
        return tightenDecision(player, previousChoose(player));
      },
    });
    window.AiTierStrategyV28 = installedApi;
    return true;
  }

  function refresh() {
    const installed = install();
    document.documentElement.dataset.aiWtsdDisciplineV295R1 = installed ? "ready" : "loading";
    attempts += 1;
    if ((installed || attempts >= 600) && installTimer) {
      clearInterval(installTimer);
      installTimer = 0;
    }
    return installed;
  }

  window.AiWtsdDisciplineV295R1 = Object.freeze({
    version: VERSION,
    targetNames: Object.keys(TARGETS),
    guards: TARGETS,
    fairInformationPolicy: FAIR_INFORMATION_POLICY,
    refresh,
    resetEvidence() {
      evidence = createEvidence();
      return JSON.parse(JSON.stringify(evidence));
    },
    evidence() {
      return JSON.parse(JSON.stringify(evidence));
    },
    tightenDecision,
  });

  document.documentElement.dataset.aiWtsdDisciplineV295R1 = "loading";
  setTimeout(() => {
    if (!refresh() && !installTimer) installTimer = setInterval(refresh, 25);
  }, 1_050);
})();
