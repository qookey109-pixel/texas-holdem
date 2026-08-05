(() => {
  "use strict";

  if (window.AiGameplayCalibrationV27?.version) return;

  const VERSION = "1.0.0";
  const MIDDLE = Object.freeze(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  const ELITE = Object.freeze(["Nova", "Unit-9", "Merlin", "Vlad"]);
  const ROLES = Object.freeze([...MIDDLE, ...ELITE]);
  const DEFAULT_SEEDS = Object.freeze([2711, 2717, 2729, 2741, 2753]);

  const SCENARIOS = Object.freeze([
    Object.freeze({
      id: "preflop-btn-open",
      group: "preflop",
      opportunity: "open",
      actorPosition: 5,
      cards: Object.freeze([{ value: 14, suit: "s" }, { value: 11, suit: "s" }]),
      board: Object.freeze([]),
      pot: 30,
      currentBet: 20,
      actorBet: 0,
      actorStack: 1980,
      opponents: 5,
      aggressorAction: "check",
    }),
    Object.freeze({
      id: "preflop-facing-open",
      group: "preflop",
      opportunity: "three-bet",
      actorPosition: 4,
      cards: Object.freeze([{ value: 14, suit: "h" }, { value: 12, suit: "h" }]),
      board: Object.freeze([]),
      pot: 150,
      currentBet: 80,
      actorBet: 0,
      actorStack: 1920,
      opponents: 5,
      aggressorAction: "raise",
    }),
    Object.freeze({
      id: "flop-top-pair-small-bet",
      group: "postflop",
      opportunity: "multiway-call",
      actorPosition: 4,
      cards: Object.freeze([{ value: 13, suit: "s" }, { value: 12, suit: "h" }]),
      board: Object.freeze([
        { value: 13, suit: "d" },
        { value: 7, suit: "c" },
        { value: 2, suit: "h" },
      ]),
      pot: 240,
      currentBet: 80,
      actorBet: 0,
      actorStack: 1920,
      opponents: 3,
      aggressorAction: "raise",
      baseEquity: 0.64,
    }),
    Object.freeze({
      id: "turn-nut-draw-medium-bet",
      group: "postflop",
      opportunity: "draw-realization",
      actorPosition: 5,
      cards: Object.freeze([{ value: 12, suit: "s" }, { value: 11, suit: "s" }]),
      board: Object.freeze([
        { value: 14, suit: "s" },
        { value: 7, suit: "s" },
        { value: 2, suit: "d" },
        { value: 9, suit: "c" },
      ]),
      pot: 360,
      currentBet: 120,
      actorBet: 0,
      actorStack: 1880,
      opponents: 3,
      aggressorAction: "raise",
      baseEquity: 0.48,
    }),
    Object.freeze({
      id: "river-marginal-bluff-catch",
      group: "postflop",
      opportunity: "bluff-catch",
      actorPosition: 4,
      cards: Object.freeze([{ value: 12, suit: "s" }, { value: 8, suit: "h" }]),
      board: Object.freeze([
        { value: 13, suit: "h" },
        { value: 13, suit: "d" },
        { value: 7, suit: "c" },
        { value: 4, suit: "s" },
        { value: 2, suit: "h" },
      ]),
      pot: 360,
      currentBet: 240,
      actorBet: 0,
      actorStack: 1760,
      opponents: 3,
      aggressorAction: "raise",
      baseEquity: 0.42,
    }),
    Object.freeze({
      id: "river-trip-value-facing-bet",
      group: "postflop",
      opportunity: "value",
      actorPosition: 5,
      cards: Object.freeze([{ value: 12, suit: "s" }, { value: 11, suit: "c" }]),
      board: Object.freeze([
        { value: 12, suit: "h" },
        { value: 9, suit: "d" },
        { value: 4, suit: "c" },
        { value: 2, suit: "s" },
        { value: 12, suit: "d" },
      ]),
      pot: 520,
      currentBet: 120,
      actorBet: 0,
      actorStack: 1880,
      opponents: 2,
      aggressorAction: "raise",
      baseEquity: 0.82,
    }),
  ]);

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function seededRandom(seed) {
    let value = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cloneCard(card) {
    return { value: Number(card.value), suit: String(card.suit) };
  }

  function tierFor(name) {
    return MIDDLE.includes(name) ? "middle" : (ELITE.includes(name) ? "elite" : "");
  }

  function profileFor(name) {
    const source = (typeof AI_ROSTER === "object" && Array.isArray(AI_ROSTER))
      ? AI_ROSTER.find(profile => profile?.name === name)
      : null;
    if (!source) throw new Error(`Missing AI profile: ${name}`);
    return source;
  }

  function opponentNames(actorName, count) {
    const pool = ["Owl", "Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"]
      .filter(name => name !== actorName);
    return pool.slice(0, Math.max(1, count));
  }

  function publicOpponent(name, position, scenario, index) {
    const opponent = {
      name,
      isHuman: name === "Owl",
      position,
      stack: 1700 - index * 40,
      bet: scenario.currentBet,
      totalContribution: scenario.currentBet + 60 + index * 10,
      folded: false,
      allIn: false,
      hasActed: true,
      raiseLocked: false,
      lastAction: index === 0 ? scenario.aggressorAction : "call",
      status: "校準公開對手",
    };
    Object.defineProperty(opponent, "cards", {
      configurable: true,
      get() {
        throw new Error("calibration-read-hidden-opponent-cards");
      },
    });
    return opponent;
  }

  function actorFor(name, scenario) {
    return {
      ...profileFor(name),
      name,
      isHuman: false,
      position: scenario.actorPosition,
      cards: scenario.cards.map(cloneCard),
      stack: scenario.actorStack,
      bet: scenario.actorBet,
      totalContribution: scenario.actorBet + 60,
      folded: false,
      allIn: false,
      hasActed: false,
      raiseLocked: false,
      emotion: "calm",
      lastAction: "",
      status: "校準中",
      wins: 0,
      streak: 0,
    };
  }

  function scenarioState(name, scenario, handNumber) {
    const actor = actorFor(name, scenario);
    const opponents = opponentNames(name, scenario.opponents)
      .map((opponentName, index) => publicOpponent(opponentName, index + 1, scenario, index));
    state.players = [actor, ...opponents];
    state.board = scenario.board.map(cloneCard);
    state.pot = scenario.pot;
    state.currentBet = scenario.currentBet;
    state.handNumber = handNumber;
    state.lastRaiseSize = Math.max(currentBigBlind?.() || 20, scenario.currentBet - scenario.actorBet);
    state.blindLevel = typeof blindLevelForHand === "function"
      ? blindLevelForHand(Math.max(1, handNumber))
      : { level: 1, small: 10, big: 20, buyIn: 2000 };
    state.street = scenario.board.length >= 5
      ? "河牌"
      : (scenario.board.length === 4 ? "轉牌" : (scenario.board.length >= 3 ? "翻牌" : "翻牌前"));
    state.handOver = false;
    state.waitingForHuman = false;
    state.currentActorIndex = 0;
    return actor;
  }

  function actionClass(decision) {
    if (decision?.action === "raise") return "raise";
    if (decision?.action === "fold") return "fold";
    if (decision?.action === "call") return "call";
    return "fallback";
  }

  function percentile(values, ratio) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
  }

  function emptyAggregate() {
    return {
      decisions: 0,
      preflopDecisions: 0,
      postflopDecisions: 0,
      actions: { raise: 0, call: 0, fold: 0, fallback: 0 },
      openOpportunities: 0,
      openRaises: 0,
      threeBetOpportunities: 0,
      threeBets: 0,
      vpipOpportunities: 0,
      vpipActions: 0,
      equityAdjustments: [],
      sampleCounts: [],
      latencies: [],
      negativeCallGuards: 0,
      positiveCallRescues: 0,
      raiseEvGuards: 0,
      publicInformationOnly: true,
    };
  }

  function addRecord(target, record) {
    target.decisions += 1;
    target.actions[record.action] += 1;
    if (record.group === "preflop") {
      target.preflopDecisions += 1;
      target.vpipOpportunities += 1;
      if (record.action !== "fold" && record.action !== "fallback") target.vpipActions += 1;
      if (record.opportunity === "open") {
        target.openOpportunities += 1;
        if (record.action === "raise") target.openRaises += 1;
      }
      if (record.opportunity === "three-bet") {
        target.threeBetOpportunities += 1;
        if (record.action === "raise") target.threeBets += 1;
      }
    } else {
      target.postflopDecisions += 1;
    }
    if (record.equityApplied) {
      target.equityAdjustments.push(record.equityAdjustment);
      target.sampleCounts.push(record.samples);
    }
    target.latencies.push(record.latencyMs);
    if (record.adjustment === "multiway-tighten-negative-call") target.negativeCallGuards += 1;
    if (record.adjustment === "multiway-rescue-positive-call") target.positiveCallRescues += 1;
    if (record.adjustment === "multiway-raise-ev-guard") target.raiseEvGuards += 1;
    target.publicInformationOnly = target.publicInformationOnly && record.publicInformationOnly;
  }

  function finalizeAggregate(target) {
    const rate = (count, total) => total ? round(count / total, 4) : 0;
    const average = values => values.length
      ? round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length, 6)
      : 0;
    return {
      decisions: target.decisions,
      preflopDecisions: target.preflopDecisions,
      postflopDecisions: target.postflopDecisions,
      actionRates: {
        raise: rate(target.actions.raise, target.decisions),
        call: rate(target.actions.call, target.decisions),
        fold: rate(target.actions.fold, target.decisions),
        fallback: rate(target.actions.fallback, target.decisions),
      },
      vpipProxy: rate(target.vpipActions, target.vpipOpportunities),
      openRaiseProxy: rate(target.openRaises, target.openOpportunities),
      threeBetProxy: rate(target.threeBets, target.threeBetOpportunities),
      averageEquityAdjustment: average(target.equityAdjustments),
      averageAbsoluteEquityAdjustment: average(target.equityAdjustments.map(value => Math.abs(value))),
      maximumAbsoluteEquityAdjustment: target.equityAdjustments.length
        ? round(Math.max(...target.equityAdjustments.map(value => Math.abs(value))), 6)
        : 0,
      averageSamples: average(target.sampleCounts),
      timingMs: {
        median: round(percentile(target.latencies, 0.5), 3),
        p95: round(percentile(target.latencies, 0.95), 3),
        max: round(target.latencies.length ? Math.max(...target.latencies) : 0, 3),
      },
      guards: {
        negativeCall: target.negativeCallGuards,
        positiveCallRescue: target.positiveCallRescues,
        raiseEv: target.raiseEvGuards,
      },
      publicInformationOnly: target.publicInformationOnly,
    };
  }

  function stableFingerprintPayload(result) {
    return {
      schemaVersion: result.schemaVersion,
      labVersion: result.labVersion,
      seeds: result.seeds,
      versions: result.versions,
      tiers: result.tiers,
      roles: result.roles,
      scenarioSummary: result.scenarioSummary,
    };
  }

  function run(options = {}) {
    const seeds = Array.isArray(options.seeds) && options.seeds.length
      ? options.seeds.map(value => Number(value) >>> 0)
      : [...DEFAULT_SEEDS];
    const original = {
      players: state.players,
      board: state.board,
      pot: state.pot,
      currentBet: state.currentBet,
      handNumber: state.handNumber,
      lastRaiseSize: state.lastRaiseSize,
      blindLevel: state.blindLevel,
      street: state.street,
      handOver: state.handOver,
      waitingForHuman: state.waitingForHuman,
      currentActorIndex: state.currentActorIndex,
      random: Math.random,
      deckDescriptor: Object.getOwnPropertyDescriptor(state, "deck"),
    };

    const records = [];
    const tierAggregates = { middle: emptyAggregate(), elite: emptyAggregate() };
    const roleAggregates = Object.fromEntries(ROLES.map(name => [name, emptyAggregate()]));
    const scenarioAggregates = Object.fromEntries(SCENARIOS.map(scenario => [scenario.id, emptyAggregate()]));
    const started = performance.now();

    try {
      Object.defineProperty(state, "deck", {
        configurable: true,
        get() {
          throw new Error("calibration-read-actual-deck");
        },
        set() {},
      });

      for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
        const seed = seeds[seedIndex];
        for (let scenarioIndex = 0; scenarioIndex < SCENARIOS.length; scenarioIndex += 1) {
          const scenario = SCENARIOS[scenarioIndex];
          for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
            const name = ROLES[roleIndex];
            const tier = tierFor(name);
            const stateSeed = (seed + scenarioIndex * 4099 + roleIndex * 131) >>> 0;
            Math.random = seededRandom(stateSeed);
            const actor = scenarioState(name, scenario, seedIndex * 100 + scenarioIndex + 1);
            const decisionStarted = performance.now();
            const decision = window.AiMidEliteDecisionChainV27.composeDecision(actor, {
              skipSpr: false,
            }) || { action: "fallback" };
            const latencyMs = Math.max(0, performance.now() - decisionStarted);
            const equity = scenario.group === "postflop"
              ? window.AiTieredMultiwayEquityV27.estimate(actor, {
                baseEquity: scenario.baseEquity,
                seed: stateSeed,
              })
              : { applied: false, reason: "preflop" };
            const record = {
              seed,
              stateSeed,
              scenario: scenario.id,
              group: scenario.group,
              opportunity: scenario.opportunity,
              role: name,
              tier,
              action: actionClass(decision),
              raiseBy: Number(decision.raiseBy) || 0,
              adjustment: decision.tieredEquityAdjustment || "",
              equityApplied: Boolean(equity.applied),
              equityAdjustment: equity.applied ? round(equity.equityAdjustment) : 0,
              samples: equity.applied ? Number(equity.samples) || 0 : 0,
              opponentCount: equity.applied ? Number(equity.opponentCount) || 0 : scenario.opponents,
              latencyMs: round(latencyMs, 3),
              publicInformationOnly: decision.publicInformationOnly !== false
                && equity.publicInformationOnly !== false,
            };
            records.push(record);
            addRecord(tierAggregates[tier], record);
            addRecord(roleAggregates[name], record);
            addRecord(scenarioAggregates[scenario.id], record);
          }
        }
      }
    } finally {
      state.players = original.players;
      state.board = original.board;
      state.pot = original.pot;
      state.currentBet = original.currentBet;
      state.handNumber = original.handNumber;
      state.lastRaiseSize = original.lastRaiseSize;
      state.blindLevel = original.blindLevel;
      state.street = original.street;
      state.handOver = original.handOver;
      state.waitingForHuman = original.waitingForHuman;
      state.currentActorIndex = original.currentActorIndex;
      Math.random = original.random;
      if (original.deckDescriptor) Object.defineProperty(state, "deck", original.deckDescriptor);
      else delete state.deck;
    }

    const result = {
      schemaVersion: 1,
      labVersion: VERSION,
      generatedAt: new Date().toISOString(),
      seeds,
      scenarioCount: SCENARIOS.length,
      roleCount: ROLES.length,
      decisionCount: records.length,
      versions: {
        decisionChain: window.AiMidEliteDecisionChainV27?.version || "",
        tieredEquity: window.AiTieredMultiwayEquityV27?.version || "",
        evAccounting: window.AiEvAccountingV1?.version || "",
        rangeIntegration: window.AiRangeDecisionIntegrationV24?.version || "",
      },
      tiers: {
        middle: finalizeAggregate(tierAggregates.middle),
        elite: finalizeAggregate(tierAggregates.elite),
      },
      roles: Object.fromEntries(ROLES.map(name => [name, finalizeAggregate(roleAggregates[name])])),
      scenarioSummary: Object.fromEntries(
        SCENARIOS.map(scenario => [scenario.id, finalizeAggregate(scenarioAggregates[scenario.id])]),
      ),
      fairness: {
        hiddenOpponentCardRead: false,
        actualDeckRead: false,
        publicInformationOnly: records.every(record => record.publicInformationOnly),
      },
      performance: {
        totalMs: round(performance.now() - started, 3),
      },
      records,
    };
    result.deterministicFingerprint = hashString(JSON.stringify(stableFingerprintPayload(result)));
    return result;
  }

  function percent(value) {
    return `${Math.round(clamp(value) * 1000) / 10}%`;
  }

  function toMarkdown(result) {
    const lines = [
      "# AI V2.7 Gameplay Calibration",
      "",
      `- Lab: ${result.labVersion}`,
      `- Decision chain: ${result.versions.decisionChain}`,
      `- Seeds: ${result.seeds.join(", ")}`,
      `- Decisions: ${result.decisionCount}`,
      `- Fingerprint: \`${result.deterministicFingerprint}\``,
      `- Runtime: ${result.performance.totalMs} ms`,
      "",
      "## Tier summary",
      "",
      "| Tier | VPIP proxy | Open raise | 3-bet proxy | Raise | Call | Fold | Avg samples | Avg |Δ Equity| | P95 ms |",
      "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ];
    for (const tier of ["middle", "elite"]) {
      const item = result.tiers[tier];
      lines.push(`| ${tier} | ${percent(item.vpipProxy)} | ${percent(item.openRaiseProxy)} | ${percent(item.threeBetProxy)} | ${percent(item.actionRates.raise)} | ${percent(item.actionRates.call)} | ${percent(item.actionRates.fold)} | ${item.averageSamples} | ${item.averageAbsoluteEquityAdjustment} | ${item.timingMs.p95} |`);
    }
    lines.push(
      "",
      "## Role summary",
      "",
      "| Role | Tier | VPIP proxy | Raise | Call | Fold | Avg samples | Max |Δ Equity| |",
      "|---|---|---:|---:|---:|---:|---:|---:|",
    );
    for (const name of ROLES) {
      const item = result.roles[name];
      lines.push(`| ${name} | ${tierFor(name)} | ${percent(item.vpipProxy)} | ${percent(item.actionRates.raise)} | ${percent(item.actionRates.call)} | ${percent(item.actionRates.fold)} | ${item.averageSamples} | ${item.maximumAbsoluteEquityAdjustment} |`);
    }
    lines.push(
      "",
      "## Interpretation",
      "",
      "- VPIP／Open raise／3-bet are fixed-scenario proxies, not claims about live-player population frequencies.",
      "- Postflop Equity uses only own cards and public information; hidden opponent cards and the actual deck are guarded getters.",
      "- Middle sample budgets must remain below elite, and both remain below Oracle／Chronos Boss budgets.",
      "- This report is a regression baseline. Balance changes require comparing fingerprints and tier summaries instead of tuning from one anecdotal hand.",
      "",
    );
    return lines.join("\n");
  }

  window.AiGameplayCalibrationV27 = Object.freeze({
    version: VERSION,
    middleNames: [...MIDDLE],
    eliteNames: [...ELITE],
    scenarios: SCENARIOS.map(scenario => ({ ...scenario })),
    defaultSeeds: [...DEFAULT_SEEDS],
    run,
    toMarkdown,
  });
})();
