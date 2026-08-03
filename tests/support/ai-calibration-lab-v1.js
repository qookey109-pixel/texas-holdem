// Deterministic calibration harness for AI V1.1-V1.5.
// This file is test-only and is not loaded by the production page.
(() => {
  "use strict";

  if (window.AiCalibrationLab?.version) return;

  const VERSION = "1.0.0";
  const SUPPORTED_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper", "Nova", "Unit-9", "Merlin", "Vlad"];
  const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const POSITION_SEATS = Object.freeze({ BTN: 0, SB: 1, BB: 2, UTG: 3, MP: 4, HJ: 5, CO: 6 });
  const LABELS = Object.freeze({ 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" });

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function roundRate(value) {
    return Number(clamp(value).toFixed(4));
  }

  function rankLabel(value) {
    return LABELS[value] || String(value);
  }

  function card(value, suit) {
    return {
      label: rankLabel(value),
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] || "",
    };
  }

  function handClasses() {
    const result = [];
    for (let highIndex = 0; highIndex < RANKS.length; highIndex += 1) {
      const high = RANKS[highIndex];
      result.push({
        code: `${rankLabel(high)}${rankLabel(high)}`,
        cards: [card(high, "s"), card(high, "h")],
        weight: 6,
        pair: true,
        suited: false,
      });
      for (let lowIndex = highIndex + 1; lowIndex < RANKS.length; lowIndex += 1) {
        const low = RANKS[lowIndex];
        result.push({
          code: `${rankLabel(high)}${rankLabel(low)}s`,
          cards: [card(high, "s"), card(low, "s")],
          weight: 4,
          pair: false,
          suited: true,
        });
        result.push({
          code: `${rankLabel(high)}${rankLabel(low)}o`,
          cards: [card(high, "s"), card(low, "h")],
          weight: 12,
          pair: false,
          suited: false,
        });
      }
    }
    return result;
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let stateValue = (Number(seed) || 1) >>> 0;
    return () => {
      stateValue += 0x6D2B79F5;
      let value = stateValue;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function neutralHeroStyle() {
    return { hands: 0, vpip: 0, raises: 0, calls: 0, checks: 0, folds: 0, allIns: 0 };
  }

  function profileFor(name) {
    return AI_ROSTER.find(candidate => candidate?.name === name) || { name };
  }

  function baseSeat(position) {
    return {
      name: `Seat-${position}`,
      position,
      cards: [],
      bet: 0,
      stack: 4000,
      folded: false,
      allIn: false,
      raiseLocked: false,
      hasActed: false,
      lastAction: "",
      status: "",
    };
  }

  function firstAvailableSeat(blocked, preferred = []) {
    for (const seat of preferred) {
      if (!blocked.has(seat)) return seat;
    }
    for (let seat = 0; seat < 7; seat += 1) {
      if (!blocked.has(seat)) return seat;
    }
    return -1;
  }

  function preparePreflop(name, hand, scenario, position, handNumber, throwOnOpponentCards = false) {
    const targetSeat = POSITION_SEATS[position] ?? POSITION_SEATS.BTN;
    const seats = Array.from({ length: 7 }, (_, index) => baseSeat(index));
    const player = {
      ...profileFor(name),
      ...baseSeat(targetSeat),
      name,
      cards: hand.cards.map(item => ({ ...item })),
      aiStrategyPlan: null,
    };
    seats[targetSeat] = player;

    const blocked = new Set([targetSeat]);
    const heroSeat = firstAvailableSeat(blocked, [3, 4, 5, 6, 0]);
    blocked.add(heroSeat);
    const hero = {
      ...baseSeat(heroSeat),
      name: "Owl",
      isHuman: true,
    };
    seats[heroSeat] = hero;

    if (throwOnOpponentCards) {
      for (const opponent of seats) {
        if (opponent === player) continue;
        Object.defineProperty(opponent, "cards", {
          configurable: true,
          get() {
            throw new Error("calibration detected hidden opponent card access");
          },
        });
      }
    }

    seats[1].bet = 10;
    seats[2].bet = 20;
    state.handNumber = handNumber;
    state.players = seats;
    state.board = [];
    state.dealerIndex = 0;
    state.currentBet = 20;
    state.lastRaiseSize = 20;
    state.pot = 30;
    state.heroStyle = neutralHeroStyle();
    state.handOver = false;
    state.waitingForHuman = false;
    window.AiActionMemory?.reset?.(handNumber);

    if (scenario === "facing-open" || scenario === "squeeze") {
      const openerSeat = firstAvailableSeat(blocked, [3, 4, 5, 6]);
      blocked.add(openerSeat);
      const opener = seats[openerSeat];
      opener.name = opener === hero ? "Owl" : `Opener-${openerSeat}`;
      opener.isHuman = opener === hero;
      opener.bet = 60;
      opener.lastAction = "raise";
      state.currentBet = 60;
      state.lastRaiseSize = 40;
      state.pot = 90;
      window.AiActionMemory?.recordAction?.(opener, "Raise", 60);

      if (scenario === "squeeze") {
        const callerSeat = firstAvailableSeat(blocked, [4, 5, 6, 0, 3]);
        blocked.add(callerSeat);
        const caller = seats[callerSeat];
        caller.name = `Caller-${callerSeat}`;
        caller.bet = 60;
        caller.lastAction = "call";
        state.pot = 150;
        window.AiActionMemory?.recordAction?.(caller, "Call", 60);
      }
    } else if (scenario === "facing-three-bet") {
      player.bet = 60;
      player.lastAction = "raise";
      window.AiActionMemory?.recordAction?.(player, "Raise", 60);
      const threeBettorSeat = firstAvailableSeat(blocked, [5, 6, 4, 3]);
      const threeBettor = seats[threeBettorSeat];
      threeBettor.name = `ThreeBettor-${threeBettorSeat}`;
      threeBettor.bet = 180;
      threeBettor.lastAction = "raise";
      state.currentBet = 180;
      state.lastRaiseSize = 120;
      state.pot = 270;
      window.AiActionMemory?.recordAction?.(threeBettor, "Raise", 180);
    }

    return player;
  }

  function finalPreflopDecision(player, random) {
    let result = window.AiPreflopRangeEngine.chooseDecision(player, { random });
    if (window.AiCharacterStrategiesV13?.enhanceDecision) {
      result = window.AiCharacterStrategiesV13.enhanceDecision(player, result, { random });
    }
    if (window.AiCharacterStrategiesV15?.enhanceDecision && window.AiMultiwayRangeModel?.analyze) {
      const analysis = window.AiMultiwayRangeModel.analyze(player, {
        street: "preflop",
        equityProxy: result?.hand?.score || 0,
      });
      result = window.AiCharacterStrategiesV15.enhanceDecision(player, result, {
        random,
        multiwayAnalysis: analysis,
      });
    }
    return result;
  }

  function weightedRate(entries, predicate) {
    let totalWeight = 0;
    let hitWeight = 0;
    for (const entry of entries) {
      totalWeight += entry.weight;
      if (predicate(entry.decision)) hitWeight += entry.weight;
    }
    return totalWeight ? roundRate(hitWeight / totalWeight) : 0;
  }

  function averageRaiseSize(entries) {
    let totalWeight = 0;
    let weightedSize = 0;
    for (const entry of entries) {
      if (entry.decision?.action !== "raise" || !(Number(entry.decision.raiseBy) > 0)) continue;
      totalWeight += entry.weight;
      weightedSize += entry.weight * Number(entry.decision.raiseBy);
    }
    return totalWeight ? Number((weightedSize / totalWeight).toFixed(2)) : 0;
  }

  const PREMIUM_CODES = new Set(["AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs", "AQo"]);

  function preflopCharacterReport(name, classes, seed, handNumberStart) {
    let handNumber = handNumberStart;
    const openByPosition = {};
    for (const position of ["UTG", "CO", "BTN", "SB"]) {
      const entries = classes.map(hand => {
        const player = preparePreflop(name, hand, "unopened", position, handNumber++);
        const random = seededRandom(hashString(`${seed}|${name}|open|${position}|${hand.code}`));
        return { weight: hand.weight, code: hand.code, decision: finalPreflopDecision(player, random) };
      });
      openByPosition[position] = {
        openRate: weightedRate(entries, decision => decision?.action === "raise"),
        vpipRate: weightedRate(entries, decision => ["raise", "call"].includes(decision?.action)),
        averageRaiseBy: averageRaiseSize(entries),
      };
    }

    const facingOpen = classes.map(hand => {
      const player = preparePreflop(name, hand, "facing-open", "BTN", handNumber++);
      const random = seededRandom(hashString(`${seed}|${name}|facing-open|${hand.code}`));
      return { weight: hand.weight, code: hand.code, decision: finalPreflopDecision(player, random) };
    });
    const facingThreeBet = classes.map(hand => {
      const player = preparePreflop(name, hand, "facing-three-bet", "BTN", handNumber++);
      const random = seededRandom(hashString(`${seed}|${name}|facing-three-bet|${hand.code}`));
      return { weight: hand.weight, code: hand.code, decision: finalPreflopDecision(player, random) };
    });
    const squeeze = classes.map(hand => {
      const player = preparePreflop(name, hand, "squeeze", "BTN", handNumber++);
      const random = seededRandom(hashString(`${seed}|${name}|squeeze|${hand.code}`));
      return { weight: hand.weight, code: hand.code, decision: finalPreflopDecision(player, random) };
    });

    const premium = facingThreeBet.filter(entry => PREMIUM_CODES.has(entry.code));
    const result = {
      openByPosition,
      versusOpen: {
        foldRate: weightedRate(facingOpen, decision => decision?.action === "fold"),
        callRate: weightedRate(facingOpen, decision => decision?.action === "call"),
        threeBetRate: weightedRate(facingOpen, decision => decision?.action === "raise"),
      },
      versusThreeBet: {
        foldRate: weightedRate(facingThreeBet, decision => decision?.action === "fold"),
        continueRate: weightedRate(facingThreeBet, decision => ["call", "raise"].includes(decision?.action)),
        fourBetRate: weightedRate(facingThreeBet, decision => decision?.action === "raise"),
        premiumContinueRate: weightedRate(premium, decision => ["call", "raise"].includes(decision?.action)),
      },
      squeezeRate: weightedRate(squeeze, decision => decision?.action === "raise"),
    };
    result.fingerprint = [
      result.openByPosition.UTG.openRate,
      result.openByPosition.BTN.openRate,
      result.versusOpen.threeBetRate,
      result.versusOpen.callRate,
      result.versusThreeBet.fourBetRate,
      result.squeezeRate,
    ].join("|");
    return result;
  }

  const POSTFLOP_SCENARIOS = Object.freeze([
    {
      id: "heads-up-air-flop",
      cards: [card(8, "s"), card(3, "h")],
      board: [card(14, "h"), card(13, "c"), card(2, "d")],
      pot: 240,
      bet: 0,
      opponents: 1,
      heroAction: "check",
      category: "airAggressionRate",
    },
    {
      id: "strong-draw-flop",
      cards: [card(11, "s"), card(10, "s")],
      board: [card(12, "s"), card(9, "s"), card(2, "d")],
      pot: 300,
      bet: 0,
      opponents: 1,
      heroAction: "check",
      category: "drawAggressionRate",
    },
    {
      id: "river-thin-value",
      cards: [card(12, "s"), card(11, "d")],
      board: [card(12, "c"), card(8, "h"), card(4, "s"), card(2, "d"), card(7, "c")],
      pot: 360,
      bet: 0,
      opponents: 1,
      heroAction: "check",
      category: "thinValueAggressionRate",
    },
    {
      id: "river-bluff-catch",
      cards: [card(12, "s"), card(11, "d")],
      board: [card(12, "c"), card(8, "h"), card(4, "s"), card(2, "d"), card(7, "c")],
      pot: 360,
      bet: 160,
      opponents: 1,
      heroAction: "raise",
      category: "bluffCatchContinueRate",
    },
    {
      id: "multiway-air-river",
      cards: [card(8, "s"), card(3, "h")],
      board: [card(14, "h"), card(13, "c"), card(7, "d"), card(4, "s"), card(2, "c")],
      pot: 620,
      bet: 0,
      opponents: 3,
      heroAction: "check",
      category: "multiwayAirAggressionRate",
    },
    {
      id: "multiway-strong-value",
      cards: [card(14, "s"), card(14, "d")],
      board: [card(14, "h"), card(13, "c"), card(7, "d"), card(4, "s"), card(2, "c")],
      pot: 620,
      bet: 0,
      opponents: 3,
      heroAction: "check",
      category: "multiwayValueAggressionRate",
    },
  ]);

  function preparePostflop(name, scenario, handNumber) {
    const seats = Array.from({ length: 7 }, (_, index) => ({ ...baseSeat(index), folded: true }));
    const player = {
      ...profileFor(name),
      ...baseSeat(0),
      name,
      cards: scenario.cards.map(item => ({ ...item })),
      aiStrategyPlan: null,
    };
    seats[0] = player;
    const activeSeats = [3, 4, 5].slice(0, scenario.opponents);
    activeSeats.forEach((seat, index) => {
      seats[seat] = {
        ...baseSeat(seat),
        name: index === 0 ? "Owl" : `PublicOpponent-${index}`,
        isHuman: index === 0,
        folded: false,
        bet: index === 0 ? scenario.bet : 0,
        lastAction: index === 0 ? scenario.heroAction : "",
      };
    });

    state.handNumber = handNumber;
    state.players = seats;
    state.board = scenario.board.map(item => ({ ...item }));
    state.dealerIndex = 0;
    state.pot = scenario.pot;
    state.currentBet = scenario.bet;
    state.lastRaiseSize = Math.max(20, scenario.bet);
    state.heroStyle = neutralHeroStyle();
    state.handOver = false;
    state.waitingForHuman = false;
    window.AiActionMemory?.reset?.(handNumber);
    const hero = seats[activeSeats[0]];
    if (scenario.heroAction === "raise") window.AiActionMemory?.recordAction?.(hero, "Raise", scenario.bet);
    else window.AiActionMemory?.recordAction?.(hero, "Check", 0);
    return player;
  }

  function finalPostflopDecision(player, random) {
    let result = window.AiCharacterStrategiesV11.chooseDecision(player, { random });
    if (window.AiCharacterStrategiesV13?.enhanceDecision) {
      result = window.AiCharacterStrategiesV13.enhanceDecision(player, result, { random });
    }
    if (window.AiCharacterStrategiesV15?.enhanceDecision && window.AiMultiwayRangeModel?.analyze) {
      const analysis = window.AiMultiwayRangeModel.analyze(player, {
        street: result?.context?.street,
        equityProxy: result?.context?.equityProxy || 0,
      });
      result = window.AiCharacterStrategiesV15.enhanceDecision(player, result, {
        random,
        multiwayAnalysis: analysis,
      });
    }
    return result;
  }

  function postflopCharacterReport(name, seed, iterations, handNumberStart) {
    const counters = Object.fromEntries(POSTFLOP_SCENARIOS.map(scenario => [scenario.category, { hits: 0, total: 0, size: 0 }]));
    let handNumber = handNumberStart;
    for (const scenario of POSTFLOP_SCENARIOS) {
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const player = preparePostflop(name, scenario, handNumber++);
        window.AiPlayerModel?.reset?.();
        const random = seededRandom(hashString(`${seed}|${name}|${scenario.id}|${iteration}`));
        const decision = finalPostflopDecision(player, random);
        const counter = counters[scenario.category];
        counter.total += 1;
        const aggressive = decision?.action === "raise" && Number(decision.raiseBy) > 0;
        const continueAction = ["call", "raise"].includes(decision?.action);
        const hit = scenario.category === "bluffCatchContinueRate" ? continueAction : aggressive;
        if (hit) {
          counter.hits += 1;
          counter.size += Number(decision.sizeFraction) || 0;
        }
      }
    }

    const result = {};
    for (const [key, counter] of Object.entries(counters)) {
      result[key] = roundRate(counter.hits / Math.max(1, counter.total));
      if (key !== "bluffCatchContinueRate") {
        result[`${key.replace(/Rate$/, "")}AverageSize`] = counter.hits
          ? Number((counter.size / counter.hits).toFixed(3))
          : 0;
      }
    }
    return result;
  }

  function fairnessProbe(seed) {
    const hand = handClasses().find(item => item.code === "AKs");
    let hiddenRead = false;
    let decision = null;
    let analysis = null;
    try {
      const player = preparePreflop("Unit-9", hand, "squeeze", "BTN", 990001, true);
      const random = seededRandom(hashString(`${seed}|fairness-probe`));
      decision = finalPreflopDecision(player, random);
      analysis = window.AiMultiwayRangeModel?.analyze?.(player, {
        street: "preflop",
        equityProxy: decision?.hand?.score || 0,
      });
    } catch (error) {
      hiddenRead = String(error?.message || error).includes("hidden opponent card access");
      if (!hiddenRead) throw error;
    }
    const serialized = JSON.stringify({ decision, analysis });
    return {
      hiddenOpponentCardRead: hiddenRead,
      containsDeck: serialized.includes("deck"),
      containsOpponentCards: serialized.includes("opponentCards"),
      containsFutureBoard: serialized.includes("futureBoard"),
    };
  }

  function ensureReady() {
    const required = [
      ["AiPreflopRangeEngine", window.AiPreflopRangeEngine?.version],
      ["AiCharacterStrategiesV11", window.AiCharacterStrategiesV11?.version],
      ["AiCharacterStrategiesV13", window.AiCharacterStrategiesV13?.version],
      ["AiMultiwayRangeModel", window.AiMultiwayRangeModel?.version],
      ["AiCharacterStrategiesV15", window.AiCharacterStrategiesV15?.version],
      ["AiActionMemory", window.AiActionMemory?.version],
    ];
    const missing = required.filter(([, version]) => !version).map(([name]) => name);
    if (missing.length) throw new Error(`AI calibration dependencies missing: ${missing.join(", ")}`);
  }

  function run(options = {}) {
    ensureReady();
    const seed = Number(options.seed) || 1604;
    const iterations = Math.max(4, Math.min(80, Number(options.postflopIterations) || 24));
    const allClasses = handClasses();
    const limit = Math.max(0, Math.min(allClasses.length, Number(options.handClassLimit) || allClasses.length));
    const classes = allClasses.slice(0, limit);
    window.AiPlayerModel?.reset?.();

    const preflop = {};
    const postflop = {};
    let handNumber = 10000;
    for (const name of SUPPORTED_NAMES) {
      preflop[name] = preflopCharacterReport(name, classes, seed, handNumber);
      handNumber += classes.length * 8 + 100;
      postflop[name] = postflopCharacterReport(name, seed, iterations, handNumber);
      handNumber += POSTFLOP_SCENARIOS.length * iterations + 100;
    }

    const report = {
      schemaVersion: 1,
      labVersion: VERSION,
      strategyVersions: {
        preflop: window.AiCharacterStrategiesV12?.version || "",
        adaptive: window.AiCharacterStrategiesV13?.version || "",
        multiway: window.AiCharacterStrategiesV15?.version || "",
      },
      seed,
      postflopIterations: iterations,
      handClassCount: classes.length,
      weightedCombinationCount: classes.reduce((sum, item) => sum + item.weight, 0),
      supportedNames: [...SUPPORTED_NAMES],
      preflop,
      postflop,
      fairness: fairnessProbe(seed),
    };
    return report;
  }

  function toMarkdown(report) {
    const lines = [
      "# AI Calibration V1.6",
      "",
      `- Lab: ${report.labVersion}`,
      `- Seed: ${report.seed}`,
      `- Hand classes: ${report.handClassCount}`,
      `- Weighted combinations: ${report.weightedCombinationCount}`,
      `- Postflop iterations: ${report.postflopIterations}`,
      "",
      "| Character | UTG Open | BTN Open | 3-bet | 4-bet | Squeeze | HU Air | Multiway Air | Multiway Value |",
      "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ];
    for (const name of report.supportedNames) {
      const pre = report.preflop[name];
      const post = report.postflop[name];
      lines.push(`| ${name} | ${pre.openByPosition.UTG.openRate} | ${pre.openByPosition.BTN.openRate} | ${pre.versusOpen.threeBetRate} | ${pre.versusThreeBet.fourBetRate} | ${pre.squeezeRate} | ${post.airAggressionRate} | ${post.multiwayAirAggressionRate} | ${post.multiwayValueAggressionRate} |`);
    }
    return `${lines.join("\n")}\n`;
  }

  window.AiCalibrationLab = {
    version: VERSION,
    supportedNames: [...SUPPORTED_NAMES],
    handClassCount: handClasses().length,
    run,
    toMarkdown,
    fairInformationPolicy: Object.freeze({
      ownHoleCards: true,
      publicBoard: true,
      publicActions: true,
      publicPositions: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
  };
})();
