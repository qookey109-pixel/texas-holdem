import { expect, test } from "@playwright/test";

async function loadMiddleRange(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiMiddleRangeDecisionV26?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.6.0");
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

function strongRangeOptions() {
  return {
    targetActor: { name: "玩家", isHuman: true },
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
  };
}

function weakRangeOptions() {
  return {
    targetActor: { name: "玩家", isHuman: true },
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
  };
}

test("V2.6 只強化六位中階，初階、高階與 Boss 不由此模組改寫", async ({ page }) => {
  await loadMiddleRange(page);
  const result = await page.evaluate(() => ({
    names: window.AiMiddleRangeDecisionV26.middleNames,
    supportsAce: window.AiMiddleRangeDecisionV26.supports("Ace"),
    supportsDodo: window.AiMiddleRangeDecisionV26.supports("Dodo"),
    supportsLeo: window.AiMiddleRangeDecisionV26.supports("Leo"),
    supportsNova: window.AiMiddleRangeDecisionV26.supports("Nova"),
    supportsOracle: window.AiMiddleRangeDecisionV26.supports("Oracle"),
    policy: window.AiMiddleRangeDecisionV26.fairInformationPolicy,
  }));

  expect(result.names).toEqual(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  expect(result.supportsAce).toBe(true);
  expect(result.supportsDodo).toBe(true);
  expect(result.supportsLeo).toBe(false);
  expect(result.supportsNova).toBe(false);
  expect(result.supportsOracle).toBe(false);
  expect(result.policy.hiddenOpponentCards).toBe(false);
  expect(result.policy.actualDeckOrder).toBe(false);
});

test("強且窄的公開 Range 讓中階收緊邊緣 Call，弱且寬的 Range 仍可防守", async ({ page }) => {
  await loadMiddleRange(page);
  const result = await page.evaluate(({ base, strong, weak }) => {
    const api = window.AiMiddleRangeDecisionV26;
    const player = { name: "Dodo", cards: [{ value: 14, suit: "c" }, { value: 11, suit: "d" }] };
    return {
      strong: api.enhanceDecision(player, structuredClone(base), strong),
      weak: api.enhanceDecision(player, structuredClone(base), weak),
    };
  }, {
    base: marginalCallDecision(),
    strong: strongRangeOptions(),
    weak: weakRangeOptions(),
  });

  expect(result.strong.action).toBe("fold");
  expect(result.strong.rangeAdjustment).toBe("middle-tighten-marginal-call");
  expect(result.strong.middleRangeDecisionIntegrated).toBe(true);
  expect(result.weak.action).toBe("call");
  expect(result.weak.callScore).toBeGreaterThan(result.strong.callScore);
  expect(result.weak.middleRangeSignals.appliedPressure).toBeLessThan(0);
});

test("公開樣本不足時中階不套用 Range 推測，翻牌前也維持既有策略", async ({ page }) => {
  await loadMiddleRange(page);
  const result = await page.evaluate(base => {
    const api = window.AiMiddleRangeDecisionV26;
    const player = { name: "Ace", cards: [{ value: 13, suit: "s" }, { value: 12, suit: "h" }] };
    const lowSample = api.enhanceDecision(player, structuredClone(base), {
      targetActor: { name: "玩家", isHuman: true },
      rangeDiagnostic: {
        version: "1.0.0",
        rangeWidth: 0.2,
        rangeStrength: 0.82,
        confidence: 0.12,
        nutDensity: 0.2,
        bluffDensity: 0.05,
        aggressiveActions: 0,
        calls: 0,
      },
      weightedRange: { version: "1.0.0", weightedPreflopStrength: 0.8, rangeWidth: 0.2 },
    });
    const preflop = api.enhanceDecision(player, {
      ...structuredClone(base),
      context: { ...base.context, street: "preflop" },
    }, {
      ...strongRangeOptions(),
    });
    return { lowSample, preflop };
  }, marginalCallDecision());

  expect(result.lowSample.action).toBe("call");
  expect(result.lowSample.callScore).toBe(0.04);
  expect(result.lowSample.middleRangeDecisionIntegrated).toBe(false);
  expect(result.lowSample.middleRangeDecisionSkipped).toBe("insufficient-public-sample");
  expect(result.preflop.middleRangeDecisionIntegrated).toBeUndefined();
  expect(result.preflop.callScore).toBe(0.04);
});

test("強 Range 會取消中階低品質純詐唬", async ({ page }) => {
  await loadMiddleRange(page);
  const result = await page.evaluate(options => {
    const base = {
      action: "raise",
      raiseBy: 300,
      sizeFraction: 0.7,
      reason: "base bluff",
      callScore: 0.02,
      raiseScore: 0.07,
      bluffing: true,
      valueReady: false,
      context: {
        street: "river",
        needed: 0,
        pot: 500,
        potOdds: 0,
        equityProxy: 0.36,
        drawPotential: 0,
        canRaise: true,
      },
      candidates: [{ raiseBy: 300, fraction: 0.7, ev: 35 }],
    };
    return window.AiMiddleRangeDecisionV26.enhanceDecision(
      { name: "Momo", cards: [{ value: 9, suit: "c" }, { value: 8, suit: "d" }] },
      base,
      options,
    );
  }, strongRangeOptions());

  expect(result.action).toBe("call");
  expect(result.raiseBy).toBe(0);
  expect(result.rangeAdjustment).toBe("middle-suppress-range-bluff");
  expect(result.bluffing).toBe(false);
});

test("中階 Range 修正幅度明顯小於高階，且不讀取對手隱藏底牌", async ({ page }) => {
  await loadMiddleRange(page);
  const result = await page.evaluate(({ base, options }) => {
    let hiddenRead = false;
    const target = {
      name: "玩家",
      isHuman: true,
      get cards() {
        hiddenRead = true;
        throw new Error("hidden cards must not be read");
      },
    };
    const safeOptions = { ...options, targetActor: target };
    const middle = window.AiMiddleRangeDecisionV26.enhanceDecision(
      { name: "Dodo", cards: [{ value: 14, suit: "s" }, { value: 12, suit: "h" }] },
      structuredClone(base),
      safeOptions,
    );
    const elite = window.AiRangeDecisionIntegrationV24.enhanceDecision(
      { name: "Unit-9", cards: [{ value: 14, suit: "s" }, { value: 12, suit: "h" }] },
      structuredClone(base),
      safeOptions,
    );
    return { hiddenRead, middle, elite };
  }, { base: marginalCallDecision(), options: strongRangeOptions() });

  expect(result.hiddenRead).toBe(false);
  expect(Math.abs(result.middle.rangeScoreAdjustments.call)).toBeLessThan(
    Math.abs(result.elite.rangeScoreAdjustments.call),
  );
  expect(result.middle.rangeDecisionTier).toBe("middle");
  expect(result.elite.rangeDecisionTier).toBeUndefined();
});

test("V2.6 完整決策鏈會在淨 EV 與 Board 前套用中階 Range", async ({ page }) => {
  await loadMiddleRange(page);
  await expect.poll(
    () => page.evaluate(() => window.AiMidEliteDecisionChainV26?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.6.0");

  const result = await page.evaluate(options => {
    const baseDecision = {
      action: "call",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "base",
      callScore: 0.12,
      raiseScore: 0.04,
      bluffing: false,
      valueReady: false,
      equityProxy: 0.64,
      context: {
        street: "turn",
        needed: 80,
        pot: 360,
        potOdds: 80 / 440,
        equityProxy: 0.64,
        drawPotential: 0.02,
        canRaise: false,
        activeOpponents: 1,
      },
      candidates: [],
    };
    return window.AiMidEliteDecisionChainV26.composeDecision(
      { name: "Bruno", cards: [{ value: 14, suit: "c" }, { value: 11, suit: "d" }] },
      {
        ...options,
        baseDecision,
        skipSpr: true,
        board: [
          { value: 13, suit: "s" }, { value: 8, suit: "h" },
          { value: 3, suit: "d" }, { value: 2, suit: "c" },
        ],
      },
    );
  }, strongRangeOptions());

  expect(result.middleRangeDecisionIntegrated).toBe(true);
  expect(result.rangeDecisionTier).toBe("middle");
  expect(result.evAccountingVersion).toBe("1.0.1");
  expect(result.boardIntelligenceIntegrated).toBe(true);
  expect(result.decisionChainVersion).toBe("2.6.0");
  expect(result.decisionChainOrder).toEqual([
    "range/multiway", "net-ev", "role", "board/blocker", "spr",
  ]);
});