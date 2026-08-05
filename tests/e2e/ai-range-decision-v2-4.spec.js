import { expect, test } from "@playwright/test";

async function loadRangeDecision(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiRangeDecisionIntegrationV24?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.4.0");
}

function marginalCallDecision() {
  return {
    action: "call",
    raiseBy: 0,
    sizeFraction: 0,
    reason: "base",
    callScore: 0.04,
    raiseScore: 0.03,
    bluffing: false,
    valueReady: false,
    context: {
      street: "turn",
      needed: 420,
      pot: 560,
      potOdds: 0.428,
      equityProxy: 0.49,
      drawPotential: 0.02,
      canRaise: true,
    },
    candidates: [],
  };
}

test("V2.4 僅為四位高階角色接入 Combo Range 決策", async ({ page }) => {
  await loadRangeDecision(page);
  const result = await page.evaluate(() => ({
    names: window.AiRangeDecisionIntegrationV24.eliteNames,
    supportsNova: window.AiRangeDecisionIntegrationV24.supports("Nova"),
    supportsUnit9: window.AiRangeDecisionIntegrationV24.supports("Unit-9"),
    supportsAce: window.AiRangeDecisionIntegrationV24.supports("Ace"),
    policy: window.AiRangeDecisionIntegrationV24.fairInformationPolicy,
  }));

  expect(result.names).toEqual(["Nova", "Unit-9", "Merlin", "Vlad"]);
  expect(result.supportsNova).toBe(true);
  expect(result.supportsUnit9).toBe(true);
  expect(result.supportsAce).toBe(false);
  expect(result.policy.hiddenOpponentCards).toBe(false);
  expect(result.policy.opponentCardInspection).toBe(false);
});

test("強且窄的公開範圍會讓邊緣跟注收緊，弱且寬的範圍仍可繼續", async ({ page }) => {
  await loadRangeDecision(page);
  const result = await page.evaluate(base => {
    const api = window.AiRangeDecisionIntegrationV24;
    const player = { name: "Unit-9", cards: [{ value: 14, suit: "s" }, { value: 12, suit: "h" }] };
    const target = { name: "玩家", isHuman: true };
    const strong = api.enhanceDecision(player, structuredClone(base), {
      targetActor: target,
      rangeDiagnostic: {
        version: "1.0.0",
        rangeWidth: 0.12,
        rangeStrength: 0.86,
        confidence: 0.94,
        nutDensity: 0.28,
        bluffDensity: 0.05,
        aggressiveActions: 3,
        calls: 0,
      },
      weightedRange: { version: "1.0.0", weightedPreflopStrength: 0.84, rangeWidth: 0.12 },
    });
    const weak = api.enhanceDecision(player, structuredClone(base), {
      targetActor: target,
      rangeDiagnostic: {
        version: "1.0.0",
        rangeWidth: 0.86,
        rangeStrength: 0.32,
        confidence: 0.88,
        nutDensity: 0.04,
        bluffDensity: 0.3,
        aggressiveActions: 0,
        calls: 2,
      },
      weightedRange: { version: "1.0.0", weightedPreflopStrength: 0.34, rangeWidth: 0.86 },
    });
    return { strong, weak };
  }, marginalCallDecision());

  expect(result.strong.action).toBe("fold");
  expect(result.strong.rangeAdjustment).toBe("tighten-marginal-call");
  expect(result.strong.rangeSignals.rangePressure).toBeGreaterThan(0.15);
  expect(result.weak.action).toBe("call");
  expect(result.weak.callScore).toBeGreaterThan(result.strong.callScore);
  expect(result.weak.rangeSignals.rangePressure).toBeLessThan(0);
  expect(result.weak.rangeDecisionIntegrated).toBe(true);
});

test("強範圍會壓低純詐唬，但不會取消已成立的價值加注", async ({ page }) => {
  await loadRangeDecision(page);
  const result = await page.evaluate(() => {
    const api = window.AiRangeDecisionIntegrationV24;
    const player = { name: "Merlin", cards: [{ value: 14, suit: "s" }, { value: 5, suit: "s" }] };
    const target = { name: "玩家", isHuman: true };
    const options = {
      targetActor: target,
      rangeDiagnostic: {
        version: "1.0.0",
        rangeWidth: 0.1,
        rangeStrength: 0.9,
        confidence: 0.96,
        nutDensity: 0.32,
        bluffDensity: 0.04,
        aggressiveActions: 3,
        calls: 0,
      },
      weightedRange: { version: "1.0.0", weightedPreflopStrength: 0.88, rangeWidth: 0.1 },
    };
    const base = {
      action: "raise",
      raiseBy: 300,
      sizeFraction: 0.7,
      reason: "base",
      callScore: 0.02,
      raiseScore: 0.12,
      bluffing: true,
      valueReady: false,
      context: {
        street: "river",
        needed: 0,
        pot: 500,
        potOdds: 0,
        equityProxy: 0.38,
        drawPotential: 0,
        canRaise: true,
      },
      candidates: [{ raiseBy: 300, fraction: 0.7, ev: 40 }],
    };
    const bluff = api.enhanceDecision(player, structuredClone(base), options);
    const value = api.enhanceDecision(player, {
      ...structuredClone(base),
      bluffing: false,
      valueReady: true,
      context: { ...base.context, equityProxy: 0.84 },
    }, options);
    return { bluff, value };
  });

  expect(result.bluff.action).not.toBe("raise");
  expect(result.bluff.rangeAdjustment).toBe("suppress-range-bluff");
  expect(result.value.action).toBe("raise");
  expect(result.value.raiseBy).toBe(300);
});

test("Range 接線不讀取對手隱藏底牌，且中階角色不受影響", async ({ page }) => {
  await loadRangeDecision(page);
  const result = await page.evaluate(base => {
    const api = window.AiRangeDecisionIntegrationV24;
    let hiddenRead = false;
    const target = {
      name: "玩家",
      isHuman: true,
      get cards() {
        hiddenRead = true;
        throw new Error("hidden cards must not be read");
      },
    };
    const options = {
      targetActor: target,
      rangeDiagnostic: {
        version: "1.0.0",
        rangeWidth: 0.5,
        rangeStrength: 0.5,
        confidence: 0.7,
        nutDensity: 0.06,
        bluffDensity: 0.18,
        aggressiveActions: 1,
        calls: 1,
      },
      weightedRange: { version: "1.0.0", weightedPreflopStrength: 0.5, rangeWidth: 0.5 },
    };
    const elite = api.enhanceDecision(
      { name: "Vlad", cards: [{ value: 13, suit: "d" }, { value: 12, suit: "d" }] },
      structuredClone(base),
      options,
    );
    const middleBase = structuredClone(base);
    const middle = api.enhanceDecision(
      { name: "Ace", cards: [{ value: 13, suit: "c" }, { value: 11, suit: "c" }] },
      middleBase,
      options,
    );
    return {
      hiddenRead,
      eliteIntegrated: elite.rangeDecisionIntegrated,
      middleIntegrated: Boolean(middle.rangeDecisionIntegrated),
      sameMiddleObject: middle === middleBase,
    };
  }, marginalCallDecision());

  expect(result.hiddenRead).toBe(false);
  expect(result.eliteIntegrated).toBe(true);
  expect(result.middleIntegrated).toBe(false);
  expect(result.sameMiddleObject).toBe(true);
});
