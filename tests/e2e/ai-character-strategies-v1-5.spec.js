import { expect, test } from "@playwright/test";

async function waitForV15(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV15?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.5.0");
  await expect.poll(
    () => page.evaluate(() => window.AiMultiwayRangeModel?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
}

function baseAnalysis(overrides = {}) {
  return {
    version: "1.0.0",
    street: "flop",
    opponentCount: 3,
    multiway: true,
    profiles: [],
    strongestRange: 0.74,
    averageRange: 0.61,
    averageNutDensity: 0.28,
    aggressiveOpponents: 1,
    callingOpponents: 1,
    allInOpponents: 0,
    rangePressure: 0.68,
    requiredShowdownStrength: 0.61,
    thinValueThreshold: 0.72,
    strongValueThreshold: 0.81,
    bluffSuccessModifier: 0.34,
    rangeAdvantage: -0.12,
    publicInformationOnly: true,
    ...overrides,
  };
}

function candidate(fraction, raiseBy, ev = 10) {
  return { fraction, raiseBy, ev, foldEquity: 0.25 };
}

test("V1.5 模組、角色能力與公平資訊政策正確註冊", async ({ page }) => {
  await waitForV15(page);

  const snapshot = await page.evaluate(() => ({
    strategyVersion: window.AiCharacterStrategiesV15.version,
    rangeVersion: window.AiMultiwayRangeModel.version,
    names: window.AiCharacterStrategiesV15.supportedNames,
    strategyPolicy: window.AiCharacterStrategiesV15.fairInformationPolicy,
    rangePolicy: window.AiMultiwayRangeModel.fairInformationPolicy,
    profiles: AI_ROSTER
      .filter(profile => window.AiCharacterStrategiesV15.supports(profile.name))
      .map(profile => ({
        name: profile.name,
        version: profile.multiwayStrategyVersion,
        rangeAware: profile.multiwayRangeAware,
      })),
  }));

  expect(snapshot.names).toHaveLength(10);
  expect(snapshot.profiles).toHaveLength(10);
  expect(snapshot.profiles.every(profile => profile.version === "1.5.0" && profile.rangeAware)).toBe(true);
  expect(snapshot.strategyPolicy.hiddenOpponentCards).toBe(false);
  expect(snapshot.strategyPolicy.opponentCardInspection).toBe(false);
  expect(snapshot.rangePolicy.hiddenOpponentCards).toBe(false);
  expect(snapshot.rangePolicy.opponentCardInspection).toBe(false);
  await expect(page.locator('script[src^="js/ai-multiway-range-model-v1.js"]')).toHaveCount(1);
  await expect(page.locator('script[src^="js/ai-character-strategies-v1-5.js"]')).toHaveCount(1);
});

test("公開加注與尺寸會提高對手範圍壓力，且不讀取底牌", async ({ page }) => {
  await waitForV15(page);

  const analysis = await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    clearAutoNewHandTimer?.();
    clearDialogueTimers?.();

    const ai = { ...AI_ROSTER.find(profile => profile.name === "Unit-9"), name: "Unit-9", position: 0, folded: false, allIn: false, stack: 2200 };
    const hero = { name: "Owl", isHuman: true, position: 1, folded: false, allIn: false, stack: 2100 };
    const caller = { ...AI_ROSTER.find(profile => profile.name === "Leo"), name: "Leo", position: 2, folded: false, allIn: false, stack: 1800 };
    Object.defineProperty(hero, "cards", { get() { throw new Error("opponent cards must not be read"); } });
    Object.defineProperty(caller, "cards", { get() { throw new Error("opponent cards must not be read"); } });

    state.handNumber = 901;
    state.players = [ai, hero, caller];
    state.board = [];
    state.pot = 260;
    state.currentBet = 120;
    window.AiActionMemory.reset(901);
    window.AiActionMemory.recordAction(hero, "Raise", 120);
    window.AiActionMemory.recordAction(caller, "Call", 120);

    state.board = [
      { value: 13, suit: "spades" },
      { value: 9, suit: "hearts" },
      { value: 4, suit: "clubs" },
    ];
    state.pot = 720;
    state.currentBet = 300;
    window.AiActionMemory.recordAction(hero, "Raise", 300);
    window.AiActionMemory.recordAction(caller, "Call", 300);

    return window.AiMultiwayRangeModel.analyze(ai, {
      street: "flop",
      equityProxy: 0.55,
    });
  });

  expect(analysis.multiway).toBe(true);
  expect(analysis.opponentCount).toBe(2);
  expect(analysis.aggressiveOpponents).toBeGreaterThanOrEqual(1);
  expect(analysis.strongestRange).toBeGreaterThan(0.65);
  expect(analysis.rangePressure).toBeGreaterThan(0.5);
  expect(analysis.profiles.find(profile => profile.name === "Owl").rangeStrength)
    .toBeGreaterThan(analysis.profiles.find(profile => profile.name === "Leo").rangeStrength);
  const serialized = JSON.stringify(analysis);
  expect(serialized).not.toContain("cards");
  expect(serialized).not.toContain("deck");
  expect(serialized).not.toContain("futureBoard");
});

test("多人底池取消低成功率純詐唬", async ({ page }) => {
  await waitForV15(page);

  const result = await page.evaluate(analysis => {
    const player = { name: "Ace", stack: 2000, raiseLocked: false };
    const decision = {
      action: "raise",
      raiseBy: 420,
      sizeFraction: 0.7,
      reason: "base bluff",
      bluffing: true,
      blockerBluff: false,
      valueReady: false,
      callScore: -0.02,
      context: {
        street: "flop",
        needed: 0,
        pot: 600,
        potOdds: 0,
        equityProxy: 0.31,
        drawPotential: 0.02,
        canRaise: true,
        position: "BTN",
        texture: { wetness: 0.28 },
      },
      rangeAnalysis: { riverClass: "not-river", blockers: { bluffScore: 0 } },
      candidates: [
        { fraction: 0.4, raiseBy: 240, ev: 8 },
        { fraction: 0.7, raiseBy: 420, ev: 12 },
      ],
    };
    return window.AiCharacterStrategiesV15.enhanceDecision(player, decision, { multiwayAnalysis: analysis });
  }, baseAnalysis());

  expect(result.action).toBe("call");
  expect(result.raiseBy).toBe(0);
  expect(result.bluffing).toBe(false);
  expect(result.multiwayAdjustment).toBe("suppress-pure-bluff");
});

test("多人濕牌面強價值牌改用合理厚價值尺寸", async ({ page }) => {
  await waitForV15(page);

  const result = await page.evaluate(analysis => {
    const player = { name: "Bruno", stack: 2600, raiseLocked: false };
    const decision = {
      action: "call",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "base trap",
      bluffing: false,
      blockerBluff: false,
      valueReady: true,
      callScore: 0.42,
      context: {
        street: "turn",
        needed: 0,
        pot: 900,
        potOdds: 0,
        equityProxy: 0.9,
        drawPotential: 0,
        canRaise: true,
        position: "HJ",
        texture: { wetness: 0.72 },
      },
      rangeAnalysis: { riverClass: "not-river", blockers: { bluffScore: 0 } },
      candidates: [
        { fraction: 0.35, raiseBy: 320, ev: 20 },
        { fraction: 0.65, raiseBy: 590, ev: 33 },
        { fraction: 0.9, raiseBy: 810, ev: 31 },
        { fraction: 1.2, raiseBy: 1080, ev: 28 },
      ],
    };
    return window.AiCharacterStrategiesV15.enhanceDecision(player, decision, { multiwayAnalysis: analysis });
  }, baseAnalysis({ street: "turn", callingOpponents: 2, strongValueThreshold: 0.82 }));

  expect(result.action).toBe("raise");
  expect(result.sizeFraction).toBeGreaterThanOrEqual(0.58);
  expect(result.sizeFraction).toBeLessThanOrEqual(0.96);
  expect(result.multiwayAdjustment).toBe("multiway-thick-value");
});

test("多人面對大尺寸與多個強範圍時放棄邊緣 Bluff Catch", async ({ page }) => {
  await waitForV15(page);

  const result = await page.evaluate(analysis => {
    const player = { name: "Dodo", stack: 1800, raiseLocked: false };
    const decision = {
      action: "call",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "base call",
      bluffing: false,
      blockerBluff: false,
      valueReady: false,
      callScore: 0.04,
      context: {
        street: "river",
        needed: 480,
        pot: 620,
        potOdds: 480 / 1100,
        equityProxy: 0.49,
        drawPotential: 0,
        canRaise: true,
        position: "BB",
        texture: { wetness: 0.48 },
      },
      rangeAnalysis: { riverClass: "bluff-catcher", blockers: { bluffScore: 0.2 } },
      candidates: [],
    };
    return window.AiCharacterStrategiesV15.enhanceDecision(player, decision, { multiwayAnalysis: analysis });
  }, baseAnalysis({
    street: "river",
    opponentCount: 3,
    aggressiveOpponents: 2,
    rangePressure: 0.78,
    requiredShowdownStrength: 0.66,
  }));

  expect(result.action).toBe("fold");
  expect(result.multiwayAdjustment).toBe("fold-marginal-versus-large-size");
});

test("翻牌前多人 Cold Call 收緊，但頂端範圍保留", async ({ page }) => {
  await waitForV15(page);

  const results = await page.evaluate(analysis => {
    const player = { name: "Nori", stack: 2000, raiseLocked: false };
    const context = {
      street: "preflop",
      raises: 1,
      callersAfterOpen: 2,
      needed: 100,
      pot: 360,
      potOdds: 100 / 460,
      bigBlind: 20,
      position: "HJ",
    };
    const thresholds = { call: 0.54, threeBet: 0.77, fourBet: 0.9 };
    const marginal = window.AiCharacterStrategiesV15.enhanceDecision(player, {
      action: "call",
      reason: "base cold call",
      stage: "defend-open",
      raiseBy: 0,
      hand: { score: 0.57, pair: false, suited: false, suitedConnector: false, broadwayCount: 1 },
      thresholds,
      context,
    }, { multiwayAnalysis: analysis });
    const premium = window.AiCharacterStrategiesV15.enhanceDecision(player, {
      action: "call",
      reason: "premium continue",
      stage: "defend-open",
      raiseBy: 0,
      hand: { score: 0.88, pair: true, suited: false, suitedConnector: false, broadwayCount: 0 },
      thresholds,
      context,
    }, { multiwayAnalysis: analysis });
    return { marginal, premium };
  }, baseAnalysis({ street: "preflop", opponentCount: 3, aggressiveOpponents: 1, rangePressure: 0.67 }));

  expect(results.marginal.action).toBe("fold");
  expect(results.marginal.multiwayAdjustment).toBe("tighten-cold-call");
  expect(results.premium.action).toBe("call");
});

test("單挑底池維持 V1.3 原決策不被 V1.5 改寫", async ({ page }) => {
  await waitForV15(page);

  const result = await page.evaluate(analysis => {
    const decision = {
      action: "raise",
      raiseBy: 300,
      sizeFraction: 0.6,
      reason: "heads-up base decision",
      valueReady: false,
      bluffing: true,
      context: { street: "flop", equityProxy: 0.34 },
    };
    return window.AiCharacterStrategiesV15.enhanceDecision({ name: "Momo" }, decision, { multiwayAnalysis: analysis });
  }, baseAnalysis({ opponentCount: 1, multiway: false }));

  expect(result.action).toBe("raise");
  expect(result.raiseBy).toBe(300);
  expect(result.reason).toBe("heads-up base decision");
  expect(result.multiwayAdjustment).toBeUndefined();
});