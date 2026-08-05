// Public-information-only postflop policy adjustments for AI V2.1.
(() => {
  "use strict";

  if (window.AiPostflopTexturePolicyV1?.version) return;

  const VERSION = "1.0.0";

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function includesTag(texture, tag) {
    return Array.isArray(texture?.textureTags) && texture.textureTags.includes(tag);
  }

  function adjust(context = {}) {
    const texture = context.texture || {};
    const activeOpponents = Math.max(1, Number(context.activeOpponents) || 1);
    const strength = clamp(context.strength, 0, 1);
    const drawPotential = clamp(context.drawPotential, 0, 0.25);
    const facingBet = Math.max(0, Number(context.amountToCall) || 0) > 0;
    const isDry = includesTag(texture, "dry");
    const isWet = includesTag(texture, "wet");
    const isDynamic = includesTag(texture, "dynamic");
    const isPaired = Number(texture.pairedLevel) > 0;
    const isMultiway = activeOpponents > 1;
    const madeHand = strength >= 0.62;
    const strongMadeHand = strength >= 0.72;
    const hasMeaningfulDraw = drawPotential >= 0.1;

    let strengthDelta = 0;
    let bluffMultiplier = 1;
    let aggressionMultiplier = 1;
    let callMarginDelta = 0;
    let protectionPressure = 0;

    if (isDry) {
      bluffMultiplier += 0.14;
      if (!facingBet) aggressionMultiplier += 0.06;
      if (!madeHand) strengthDelta += 0.012;
    }

    if (isWet || isDynamic) {
      bluffMultiplier -= hasMeaningfulDraw ? 0.06 : 0.2;
      if (strongMadeHand || hasMeaningfulDraw) {
        aggressionMultiplier += 0.08;
        protectionPressure += 0.1;
        strengthDelta += strongMadeHand ? 0.022 : 0.014;
      } else {
        aggressionMultiplier -= 0.08;
        callMarginDelta -= 0.018;
      }
    }

    if (isPaired) {
      bluffMultiplier -= 0.06;
      if (madeHand) callMarginDelta += 0.008;
    }

    if (isMultiway) {
      const extraOpponents = Math.min(4, activeOpponents - 1);
      bluffMultiplier -= extraOpponents * 0.12;
      aggressionMultiplier -= extraOpponents * 0.045;
      callMarginDelta -= extraOpponents * 0.012;
      if (isWet || isDynamic) strengthDelta -= extraOpponents * 0.01;
    }

    return Object.freeze({
      version: VERSION,
      strengthDelta: clamp(strengthDelta, -0.08, 0.08),
      bluffMultiplier: clamp(bluffMultiplier, 0.35, 1.3),
      aggressionMultiplier: clamp(aggressionMultiplier, 0.55, 1.25),
      callMarginDelta: clamp(callMarginDelta, -0.08, 0.05),
      protectionPressure: clamp(protectionPressure, 0, 0.2),
      publicInformationOnly: true,
      tags: Object.freeze([
        isDry ? "dry-policy" : null,
        isWet ? "wet-policy" : null,
        isDynamic ? "dynamic-policy" : null,
        isMultiway ? "multiway-policy" : null,
      ].filter(Boolean)),
    });
  }

  window.AiPostflopTexturePolicyV1 = Object.freeze({
    version: VERSION,
    adjust,
    fairInformationPolicy: Object.freeze({
      publicBoard: true,
      publicActions: true,
      hiddenOpponentCards: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    }),
  });
})();
