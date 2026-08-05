(() => {
  "use strict";

  const base = window.AiGameplayCalibrationV27;
  if (!base?.version || base.fingerprintVersion) return;

  const SCENARIO_VERSION = "1.0.2";
  const FINGERPRINT_VERSION = "1.0.1";

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function withoutTiming(value = {}) {
    const { timingMs, ...stable } = value;
    return stable;
  }

  function stableMap(values = {}) {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, withoutTiming(value)]),
    );
  }

  function fingerprintPayload(result) {
    return {
      schemaVersion: result.schemaVersion,
      labVersion: result.labVersion,
      scenarioVersion: SCENARIO_VERSION,
      fingerprintVersion: FINGERPRINT_VERSION,
      seeds: result.seeds,
      versions: result.versions,
      tiers: stableMap(result.tiers),
      roles: stableMap(result.roles),
      scenarioSummary: stableMap(result.scenarioSummary),
      records: (result.records || []).map(({ latencyMs, ...record }) => record),
    };
  }

  function setPublicState(player, values) {
    Object.assign(player, values);
  }

  function normalizeCalibrationScenario(actor) {
    if (!actor || !Array.isArray(state.players)) return;

    actor.position = 0;
    state.dealerIndex = 0;
    state.currentActorIndex = 0;

    const opponents = state.players.slice(1);
    opponents.forEach((player, index) => {
      player.position = index + 1;
    });

    if (state.board.length > 0) return;

    const facingOpen = state.currentBet >= 80;
    if (!facingOpen) {
      actor.cards = [
        { value: 14, suit: "s" },
        { value: 14, suit: "h" },
      ];
    }

    opponents.forEach((player, index) => {
      const position = index + 1;
      if (position === 1) {
        setPublicState(player, {
          bet: 10,
          totalContribution: 10,
          folded: false,
          hasActed: false,
          lastAction: "",
          status: "小盲",
        });
        return;
      }
      if (position === 2) {
        setPublicState(player, {
          bet: 20,
          totalContribution: 20,
          folded: false,
          hasActed: false,
          lastAction: "",
          status: "大盲",
        });
        return;
      }
      if (facingOpen && position === 5) {
        setPublicState(player, {
          bet: state.currentBet,
          totalContribution: state.currentBet,
          folded: false,
          hasActed: true,
          lastAction: "raise",
          status: "公開加注",
        });
        return;
      }
      setPublicState(player, {
        bet: 0,
        totalContribution: 0,
        folded: true,
        hasActed: true,
        lastAction: "fold",
        status: "已棄牌",
      });
    });
  }

  function runWithNormalizedScenarios(options = {}) {
    const originalChain = window.AiMidEliteDecisionChainV27;
    if (!originalChain?.composeDecision) return base.run(options);

    window.AiMidEliteDecisionChainV27 = Object.freeze({
      ...originalChain,
      composeDecision(actor, composeOptions = {}) {
        normalizeCalibrationScenario(actor);
        return originalChain.composeDecision(actor, composeOptions);
      },
    });

    try {
      return base.run(options);
    } finally {
      window.AiMidEliteDecisionChainV27 = originalChain;
    }
  }

  function run(options = {}) {
    const result = runWithNormalizedScenarios(options);
    result.scenarioVersion = SCENARIO_VERSION;
    result.fingerprintVersion = FINGERPRINT_VERSION;
    result.deterministicFingerprint = hashString(JSON.stringify(fingerprintPayload(result)));
    return result;
  }

  window.AiGameplayCalibrationV27 = Object.freeze({
    ...base,
    scenarioVersion: SCENARIO_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    run,
  });
})();
