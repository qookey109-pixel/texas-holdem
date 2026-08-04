// Test-only calibration lab for the fair Oracle / Chronos equity integration.
(() => {
  "use strict";

  const VERSION = "1.0.0";
  const DEFAULT_SEED = 1904;
  const DEFAULT_ITERATIONS = 4;

  const SCENARIOS = Object.freeze([
    Object.freeze({
      id: "river-nuts-facing-bet",
      label: "河牌堅果面對下注",
      cards: Object.freeze([
        Object.freeze({ value: 14, suit: "spades" }),
        Object.freeze({ value: 13, suit: "spades" }),
      ]),
      board: Object.freeze([
        Object.freeze({ value: 12, suit: "spades" }),
        Object.freeze({ value: 11, suit: "spades" }),
        Object.freeze({ value: 10, suit: "spades" }),
        Object.freeze({ value: 2, suit: "hearts" }),
        Object.freeze({ value: 3, suit: "clubs" }),
      ]),
      pot: 240,
      currentBet: 80,
      opponents: 1,
    }),
    Object.freeze({
      id: "flop-overpair-multiway",
      label: "翻牌超對多人底池",
      cards: Object.freeze([
        Object.freeze({ value: 14, suit: "hearts" }),
        Object.freeze({ value: 14, suit: "clubs" }),
      ]),
      board: Object.freeze([
        Object.freeze({ value: 9, suit: "spades" }),
        Object.freeze({ value: 7, suit: "diamonds" }),
        Object.freeze({ value: 2, suit: "clubs" }),
      ]),
      pot: 180,
      currentBet: 40,
      opponents: 3,
    }),
    Object.freeze({
      id: "turn-nut-flush-draw",
      label: "轉牌堅果同花聽牌",
      cards: Object.freeze([
        Object.freeze({ value: 14, suit: "spades" }),
        Object.freeze({ value: 5, suit: "spades" }),
      ]),
      board: Object.freeze([
        Object.freeze({ value: 13, suit: "spades" }),
        Object.freeze({ value: 9, suit: "spades" }),
        Object.freeze({ value: 2, suit: "diamonds" }),
        Object.freeze({ value: 4, suit: "clubs" }),
      ]),
      pot: 150,
      currentBet: 35,
      opponents: 2,
    }),
    Object.freeze({
      id: "river-top-pair-bluff-catch",
      label: "河牌頂對抓詐唬",
      cards: Object.freeze([
        Object.freeze({ value: 14, suit: "hearts" }),
        Object.freeze({ value: 9, suit: "diamonds" }),
      ]),
      board: Object.freeze([
        Object.freeze({ value: 14, suit: "clubs" }),
        Object.freeze({ value: 13, suit: "clubs" }),
        Object.freeze({ value: 8, suit: "spades" }),
        Object.freeze({ value: 4, suit: "diamonds" }),
        Object.freeze({ value: 2, suit: "hearts" }),
      ]),
      pot: 220,
      currentBet: 110,
      opponents: 1,
    }),
  ]);

  function cloneCards(cards) {
    return (cards || []).map(card => ({ ...card }));
  }

  function seededRandom(seed) {
    let value = (Number(seed) >>> 0) || 1;
    return () => {
      value += 0x6D2B79F5;
      let next = value;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentile(values, fraction) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
    return sorted[index];
  }

  function rounded(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function actionName(decision, needed) {
    if (decision?.action === "call" && needed <= 0) return "check";
    return decision?.action || "fallback";
  }

  function snapshotState() {
    return {
      board: state.board,
      players: state.players,
      pot: state.pot,
      currentBet: state.currentBet,
      street: state.street,
      handOver: state.handOver,
      lastAggressor: state.lastAggressor,
      currentActorIndex: state.currentActorIndex,
      dealerIndex: state.dealerIndex,
    };
  }

  function restoreState(snapshot) {
    Object.assign(state, snapshot);
  }

  function makeBoss(name, scenario) {
    return {
      name,
      cards: cloneCards(scenario.cards),
      stack: 1200,
      bet: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      raiseLocked: false,
      status: "",
      lastAction: "",
    };
  }

  function makeOpponent(index, scenario) {
    return {
      name: index === 0 ? "Owl" : `Public Opponent ${index + 1}`,
      isHuman: index === 0,
      stack: 1000,
      bet: scenario.currentBet,
      folded: false,
      allIn: false,
      hasActed: true,
      raiseLocked: false,
      status: "",
      lastAction: "raise",
    };
  }

  function installScenario(name, scenario) {
    const boss = makeBoss(name, scenario);
    const opponents = Array.from({ length: scenario.opponents }, (_, index) => makeOpponent(index, scenario));
    state.board = cloneCards(scenario.board);
    state.players = [boss, ...opponents];
    state.pot = scenario.pot;
    state.currentBet = scenario.currentBet;
    state.street = scenario.board.length === 5 ? "河牌" : (scenario.board.length === 4 ? "轉牌" : "翻牌");
    state.handOver = false;
    state.lastAggressor = opponents[0] || null;
    state.currentActorIndex = 0;
    state.dealerIndex = Math.max(0, state.players.length - 1);
    return boss;
  }

  function summarizeScenario(name, scenario, iterations) {
    const counts = { fold: 0, check: 0, call: 0, raise: 0, fallback: 0 };
    const equities = [];
    const elapsed = [];
    const methods = new Set();
    const sampleCounts = new Set();
    let fallbackCount = 0;

    for (let index = 0; index < iterations; index += 1) {
      const boss = installScenario(name, scenario);
      const started = performance.now();
      const decision = window.BossEquityIntegrationV1.decide(boss);
      elapsed.push(performance.now() - started);
      const needed = Math.max(0, scenario.currentBet - boss.bet);
      const action = actionName(decision, needed);
      counts[action] = (counts[action] || 0) + 1;
      if (decision?.equityEngine === "legacy-fallback" || action === "fallback") fallbackCount += 1;
      if (Number.isFinite(decision?.equity)) equities.push(decision.equity);
      if (decision?.equityMethod) methods.add(decision.equityMethod);
      if (Number.isFinite(decision?.equitySamples)) sampleCounts.add(decision.equitySamples);
    }

    return {
      label: scenario.label,
      iterations,
      opponentCount: scenario.opponents,
      boardCards: scenario.board.length,
      rates: {
        fold: rounded(counts.fold / iterations),
        check: rounded(counts.check / iterations),
        call: rounded(counts.call / iterations),
        raise: rounded(counts.raise / iterations),
      },
      averageEquity: rounded(equities.reduce((sum, value) => sum + value, 0) / Math.max(1, equities.length)),
      equityMethods: [...methods].sort(),
      equitySamples: [...sampleCounts].sort((left, right) => left - right),
      fallbackCount,
      timingMs: {
        median: rounded(percentile(elapsed, 0.5), 2),
        p95: rounded(percentile(elapsed, 0.95), 2),
        max: rounded(Math.max(...elapsed, 0), 2),
      },
    };
  }

  function runEquityProbes(seed) {
    const exactScenario = SCENARIOS[0];
    const exactBoss = makeBoss("Oracle", exactScenario);
    const exact = window.BossEquityEngineV1.estimate(exactBoss, {
      board: cloneCards(exactScenario.board),
      opponentCount: 1,
    });

    const multiwayScenario = SCENARIOS[1];
    const oracle = window.BossEquityEngineV1.estimate(makeBoss("Oracle", multiwayScenario), {
      board: cloneCards(multiwayScenario.board),
      opponentCount: 3,
      samples: 360,
      random: seededRandom(seed + 11),
    });
    const chronos = window.BossEquityEngineV1.estimate(makeBoss("Chronos", multiwayScenario), {
      board: cloneCards(multiwayScenario.board),
      opponentCount: 3,
      samples: 480,
      random: seededRandom(seed + 29),
    });

    return {
      exactRiverHeadsUp: {
        method: exact.method,
        combinations: exact.combinations,
        equity: rounded(exact.equity, 6),
      },
      oracleMultiway: {
        method: oracle.method,
        samples: oracle.samples,
        opponentCount: oracle.opponentCount,
        equity: rounded(oracle.equity, 6),
      },
      chronosMultiway: {
        method: chronos.method,
        samples: chronos.samples,
        opponentCount: chronos.opponentCount,
        equity: rounded(chronos.equity, 6),
      },
    };
  }

  function runFairnessProbe(seed) {
    const snapshot = snapshotState();
    let hiddenOpponentCardRead = false;
    try {
      const scenario = SCENARIOS[2];
      const boss = makeBoss("Oracle", scenario);
      const opponent = makeOpponent(0, scenario);
      Object.defineProperty(opponent, "cards", {
        configurable: true,
        get() {
          hiddenOpponentCardRead = true;
          throw new Error("Hidden opponent cards are not public information");
        },
      });
      state.players = [boss, opponent];
      state.board = cloneCards(scenario.board);
      window.BossEquityEngineV1.estimate(boss, {
        board: cloneCards(scenario.board),
        opponentCount: 1,
        samples: 64,
        random: seededRandom(seed + 71),
      });
    } finally {
      restoreState(snapshot);
    }
    return {
      hiddenOpponentCardRead,
      containsDeck: false,
      containsOpponentCards: false,
      containsFutureBoard: false,
      publicInformationOnly: !hiddenOpponentCardRead,
    };
  }

  function deterministicView(report) {
    const characters = {};
    for (const name of ["Oracle", "Chronos"]) {
      characters[name] = {};
      for (const scenario of SCENARIOS) {
        const source = report.characters[name][scenario.id];
        characters[name][scenario.id] = {
          rates: source.rates,
          averageEquity: source.averageEquity,
          equityMethods: source.equityMethods,
          equitySamples: source.equitySamples,
          fallbackCount: source.fallbackCount,
        };
      }
    }
    return {
      seed: report.seed,
      iterations: report.iterations,
      versions: report.versions,
      probes: report.probes,
      fairness: report.fairness,
      characters,
    };
  }

  function run({ seed = DEFAULT_SEED, iterations = DEFAULT_ITERATIONS } = {}) {
    if (!window.BossEquityIntegrationV1?.decide) throw new Error("BossEquityIntegrationV1 unavailable");
    if (!window.BossEquityEngineV1?.estimate) throw new Error("BossEquityEngineV1 unavailable");

    const snapshot = snapshotState();
    const originalRandom = Math.random;
    const started = performance.now();
    const normalizedSeed = Number(seed) || DEFAULT_SEED;
    const normalizedIterations = Math.max(2, Math.min(20, Math.floor(Number(iterations) || DEFAULT_ITERATIONS)));

    try {
      Math.random = seededRandom(normalizedSeed);
      const characters = {};
      for (const name of ["Oracle", "Chronos"]) {
        characters[name] = {};
        for (const scenario of SCENARIOS) {
          characters[name][scenario.id] = summarizeScenario(name, scenario, normalizedIterations);
        }
      }

      const report = {
        schemaVersion: 1,
        labVersion: VERSION,
        seed: normalizedSeed,
        iterations: normalizedIterations,
        generatedAt: new Date().toISOString(),
        versions: {
          integration: window.BossEquityIntegrationV1.version,
          equityEngine: window.BossEquityEngineV1.version,
          evAccounting: window.AiEvAccountingV1?.version || "unavailable",
          fairBoss: window.FairSpecialBosses?.version || "unavailable",
        },
        probes: runEquityProbes(normalizedSeed),
        fairness: runFairnessProbe(normalizedSeed),
        characters,
        performance: {
          totalMs: rounded(performance.now() - started, 2),
        },
      };
      report.deterministicFingerprint = JSON.stringify(deterministicView(report));
      return report;
    } finally {
      Math.random = originalRandom;
      restoreState(snapshot);
    }
  }

  function percent(value) {
    return `${Math.round((Number(value) || 0) * 100)}%`;
  }

  function toMarkdown(report) {
    const lines = [
      "# AI Calibration V1.9",
      "",
      `- Seed: \`${report.seed}\``,
      `- Iterations per scenario: \`${report.iterations}\``,
      `- Boss integration: \`${report.versions.integration}\``,
      `- Equity engine: \`${report.versions.equityEngine}\``,
      `- Total browser time: \`${report.performance.totalMs} ms\``,
      "",
      "## Equity probes",
      "",
      "| Probe | Method | Samples / combinations | Equity |",
      "| --- | --- | ---: | ---: |",
      `| River heads-up | ${report.probes.exactRiverHeadsUp.method} | ${report.probes.exactRiverHeadsUp.combinations} | ${report.probes.exactRiverHeadsUp.equity} |`,
      `| Oracle multiway | ${report.probes.oracleMultiway.method} | ${report.probes.oracleMultiway.samples} | ${report.probes.oracleMultiway.equity} |`,
      `| Chronos multiway | ${report.probes.chronosMultiway.method} | ${report.probes.chronosMultiway.samples} | ${report.probes.chronosMultiway.equity} |`,
      "",
      "## Character decision distribution",
      "",
      "| Character | Scenario | Fold | Check | Call | Raise | Avg equity | Median ms | P95 ms | Fallback |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const name of ["Oracle", "Chronos"]) {
      for (const scenario of SCENARIOS) {
        const value = report.characters[name][scenario.id];
        lines.push(`| ${name} | ${value.label} | ${percent(value.rates.fold)} | ${percent(value.rates.check)} | ${percent(value.rates.call)} | ${percent(value.rates.raise)} | ${value.averageEquity} | ${value.timingMs.median} | ${value.timingMs.p95} | ${value.fallbackCount} |`);
      }
    }

    lines.push(
      "",
      "## Fairness",
      "",
      `- Hidden opponent card read: \`${report.fairness.hiddenOpponentCardRead}\``,
      `- Public information only: \`${report.fairness.publicInformationOnly}\``,
      "",
      "> This report is a reproducible regression and tuning baseline. It is not a GTO or solver claim.",
      "",
    );
    return lines.join("\n");
  }

  window.AiCalibrationLabV19 = Object.freeze({
    version: VERSION,
    defaultSeed: DEFAULT_SEED,
    scenarios: SCENARIOS,
    run,
    toMarkdown,
  });
})();
