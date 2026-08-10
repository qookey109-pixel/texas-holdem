(() => {
  "use strict";

  const VERSION = "1.2.0";
  const BAND_KEYS = ["under3x", "threeTo5x", "fivePlus"];
  const ACTION_KEYS = ["fold", "check", "call", "raise", "allin", "other"];
  const SPR_KEYS = ["shallow", "medium", "deep", "unknown"];
  const PRESSURE_KEYS = ["free", "low", "medium", "high"];

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function emptyCounts(keys) {
    return Object.fromEntries(keys.map(key => [key, 0]));
  }

  function newPressureCell() {
    return {
      actions: emptyCounts(ACTION_KEYS),
      totalActions: 0,
      voluntaryActions: 0,
      potOddsTotal: 0,
      neededBbTotal: 0,
    };
  }

  function newSprCell() {
    return {
      actions: emptyCounts(ACTION_KEYS),
      totalActions: 0,
      voluntaryActions: 0,
      byPressure: Object.fromEntries(PRESSURE_KEYS.map(key => [key, newPressureCell()])),
    };
  }

  function newBand() {
    return {
      actions: emptyCounts(ACTION_KEYS),
      sprBands: emptyCounts(SPR_KEYS),
      bySpr: Object.fromEntries(SPR_KEYS.map(key => [key, newSprCell()])),
      totalActions: 0,
      voluntaryActions: 0,
      heroLeadRatioTotal: 0,
      actorStackBbTotal: 0,
      effectiveStackBbTotal: 0,
      effectiveSprTotal: 0,
    };
  }

  const telemetry = {
    totalActions: 0,
    publicInformationOnly: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
    bands: Object.fromEntries(BAND_KEYS.map(key => [key, newBand()])),
    samples: [],
  };

  function reset() {
    telemetry.totalActions = 0;
    telemetry.bands = Object.fromEntries(BAND_KEYS.map(key => [key, newBand()]));
    telemetry.samples.length = 0;
    return true;
  }

  function normalizeAction(action) {
    const value = String(action || "").trim().toLowerCase();
    if (value.includes("allin") || value.includes("all-in")) return "allin";
    if (value.includes("raise") || value.includes("bet")) return "raise";
    if (value.includes("call")) return "call";
    if (value.includes("check")) return "check";
    if (value.includes("fold")) return "fold";
    return "other";
  }

  function bandForRatio(ratio) {
    if (ratio >= 5) return "fivePlus";
    if (ratio >= 3) return "threeTo5x";
    return "under3x";
  }

  function pressureFor(needed, potOdds) {
    if (needed <= 0) return "free";
    if (potOdds <= 0.25) return "low";
    if (potOdds <= 0.40) return "medium";
    return "high";
  }

  function heroAndMedian() {
    const players = Array.isArray(state?.players) ? state.players : [];
    const hero = players.find(player => player?.isHuman) || null;
    const opponentStacks = players
      .filter(player => player && !player.isHuman && finite(player.stack) > 0)
      .map(player => finite(player.stack));
    const opponentMedian = median(opponentStacks);
    return {
      hero,
      heroStack: Math.max(0, finite(hero?.stack)),
      opponentMedian,
      ratio: opponentMedian > 0 ? Math.max(0, finite(hero?.stack)) / opponentMedian : 0,
    };
  }

  function recordAction(player, action) {
    if (!player || player.isHuman) return false;
    const stacks = heroAndMedian();
    if (!stacks.hero || stacks.opponentMedian <= 0) return false;

    const bigBlind = Math.max(1, finite(typeof currentBigBlind === "function" ? currentBigBlind() : 1, 1));
    const normalized = normalizeAction(action);
    const bandKey = bandForRatio(stacks.ratio);
    const band = telemetry.bands[bandKey];
    const spr = window.AiEffectiveStackSprV1?.effectiveStackContext?.(player, { bigBlind }) || null;
    const sprBand = SPR_KEYS.includes(spr?.sprBand) ? spr.sprBand : "unknown";
    const sprCell = band.bySpr[sprBand];
    const actorStackBb = Math.max(0, finite(player.stack)) / bigBlind;
    const effectiveStackBb = Math.max(0, finite(spr?.effectiveStackInBigBlinds));
    const effectiveSpr = Math.max(0, finite(spr?.effectiveSpr));
    const needed = Math.max(0, finite(typeof amountToCall === "function" ? amountToCall(player) : 0));
    const pot = Math.max(1, finite(state?.pot, 1));
    const potOdds = needed > 0 ? needed / Math.max(1, pot + needed) : 0;
    const pressureBand = pressureFor(needed, potOdds);
    const pressureCell = sprCell.byPressure[pressureBand];
    const voluntary = ["fold", "call", "raise", "allin"].includes(normalized);

    band.actions[normalized] += 1;
    band.sprBands[sprBand] += 1;
    band.totalActions += 1;
    if (voluntary) band.voluntaryActions += 1;
    band.heroLeadRatioTotal += stacks.ratio;
    band.actorStackBbTotal += actorStackBb;
    band.effectiveStackBbTotal += effectiveStackBb;
    band.effectiveSprTotal += effectiveSpr;

    sprCell.actions[normalized] += 1;
    sprCell.totalActions += 1;
    if (voluntary) sprCell.voluntaryActions += 1;

    pressureCell.actions[normalized] += 1;
    pressureCell.totalActions += 1;
    if (voluntary) pressureCell.voluntaryActions += 1;
    pressureCell.potOddsTotal += potOdds;
    pressureCell.neededBbTotal += needed / bigBlind;

    telemetry.totalActions += 1;

    if (stacks.ratio >= 5 && telemetry.samples.length < 240) {
      telemetry.samples.push({
        handNumber: Math.max(0, finite(state?.handNumber)),
        player: String(player.name || ""),
        action: normalized,
        heroLeadRatio: round(stacks.ratio, 6),
        heroStackBb: round(stacks.heroStack / bigBlind, 4),
        opponentMedianBb: round(stacks.opponentMedian / bigBlind, 4),
        actorStackBb: round(actorStackBb, 4),
        effectiveStackBb: round(effectiveStackBb, 4),
        effectiveSpr: round(effectiveSpr, 6),
        sprBand,
        pressureBand,
        neededBb: round(needed / bigBlind, 4),
        potOdds: round(potOdds, 6),
      });
    }
    return true;
  }

  function summarizePressureCell(cell) {
    const decisions = Math.max(0, cell.voluntaryActions);
    const aggression = cell.actions.raise + cell.actions.allin;
    return {
      totalActions: cell.totalActions,
      voluntaryActions: decisions,
      actions: { ...cell.actions },
      foldRate: decisions ? round(cell.actions.fold / decisions, 6) : 0,
      callRate: decisions ? round(cell.actions.call / decisions, 6) : 0,
      raiseRate: decisions ? round(cell.actions.raise / decisions, 6) : 0,
      allInRate: decisions ? round(cell.actions.allin / decisions, 6) : 0,
      aggressionRate: decisions ? round(aggression / decisions, 6) : 0,
      averagePotOdds: cell.totalActions ? round(cell.potOddsTotal / cell.totalActions, 6) : 0,
      averageNeededBb: cell.totalActions ? round(cell.neededBbTotal / cell.totalActions, 4) : 0,
    };
  }

  function summarizeSprCell(cell) {
    const decisions = Math.max(0, cell.voluntaryActions);
    const aggression = cell.actions.raise + cell.actions.allin;
    return {
      totalActions: cell.totalActions,
      voluntaryActions: decisions,
      actions: { ...cell.actions },
      byPressure: Object.fromEntries(PRESSURE_KEYS.map(key => [key, summarizePressureCell(cell.byPressure[key])])),
      foldRate: decisions ? round(cell.actions.fold / decisions, 6) : 0,
      callRate: decisions ? round(cell.actions.call / decisions, 6) : 0,
      raiseRate: decisions ? round(cell.actions.raise / decisions, 6) : 0,
      allInRate: decisions ? round(cell.actions.allin / decisions, 6) : 0,
      aggressionRate: decisions ? round(aggression / decisions, 6) : 0,
    };
  }

  function summarizeBand(band) {
    const decisions = Math.max(0, band.voluntaryActions);
    const aggression = band.actions.raise + band.actions.allin;
    return {
      totalActions: band.totalActions,
      voluntaryActions: decisions,
      actions: { ...band.actions },
      sprBands: { ...band.sprBands },
      bySpr: Object.fromEntries(SPR_KEYS.map(key => [key, summarizeSprCell(band.bySpr[key])])),
      foldRate: decisions ? round(band.actions.fold / decisions, 6) : 0,
      callRate: decisions ? round(band.actions.call / decisions, 6) : 0,
      raiseRate: decisions ? round(band.actions.raise / decisions, 6) : 0,
      allInRate: decisions ? round(band.actions.allin / decisions, 6) : 0,
      aggressionRate: decisions ? round(aggression / decisions, 6) : 0,
      shallowShare: band.totalActions ? round(band.sprBands.shallow / band.totalActions, 6) : 0,
      averageHeroLeadRatio: band.totalActions ? round(band.heroLeadRatioTotal / band.totalActions, 6) : 0,
      averageActorStackBb: band.totalActions ? round(band.actorStackBbTotal / band.totalActions, 4) : 0,
      averageEffectiveStackBb: band.totalActions ? round(band.effectiveStackBbTotal / band.totalActions, 4) : 0,
      averageEffectiveSpr: band.totalActions ? round(band.effectiveSprTotal / band.totalActions, 6) : 0,
    };
  }

  function snapshot() {
    return {
      version: VERSION,
      schemaVersion: 1,
      totalActions: telemetry.totalActions,
      publicInformationOnly: telemetry.publicInformationOnly,
      hiddenOpponentCards: telemetry.hiddenOpponentCards,
      actualDeckOrder: telemetry.actualDeckOrder,
      futureBoardAnswer: telemetry.futureBoardAnswer,
      predeterminedWinner: telemetry.predeterminedWinner,
      bands: Object.fromEntries(BAND_KEYS.map(key => [key, summarizeBand(telemetry.bands[key])])),
      samples: telemetry.samples.map(sample => ({ ...sample })),
    };
  }

  window.AiStackPressureAuditV1 = {
    version: VERSION,
    recordAction,
    snapshot,
    reset,
  };
})();
