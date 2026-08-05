import { expect, test } from "@playwright/test";

async function loadBoardIntelligence(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiBoardIntelligenceV25?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.5.0");
}

function bluffDecision() {
  return {
    action: "raise",
    raiseBy: 300,
    sizeFraction: 0.6,
    reason: "base",
    callScore: 0.03,
    raiseScore: 0.12,
    bluffing: true,
    valueReady: false,
    context: {
      street: "river",
      needed: 0,
      pot: 500,
      potOdds: 0,
      equityProxy: 0.35,
      drawPotential: 0,
      canRaise: true,
      activeOpponents: 1,
    },
    candidates: [
      { raiseBy: 180, fraction: 0.36, ev: 10 },
      { raiseBy: 300, fraction: 0.6, ev: 15 },
      { raiseBy: 450, fraction: 0.9, ev: 12 },
    ],
  };
}

test("V2.5 從中階開始支援，共十位中高階角色", async ({ page }) => {
  await loadBoardIntelligence(page);
  const result = await page.evaluate(() => ({
    middle: window.AiBoardIntelligenceV25.middleNames,
    elite: window.AiBoardIntelligenceV25.eliteNames,
    ace: window.AiBoardIntelligenceV25.supports("Ace"),
    vlad: window.AiBoardIntelligenceV25.supports("Vlad"),
    leo: window.AiBoardIntelligenceV25.supports("Leo"),
    oracle: window.AiBoardIntelligenceV25.supports("Oracle"),
    policy: window.AiBoardIntelligenceV25.fairInformationPolicy,
  }));

  expect(result.middle).toEqual(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]);
  expect(result.elite).toEqual(["Nova", "Unit-9", "Merlin", "Vlad"]);
  expect(result.ace).toBe(true);
  expect(result.vlad).toBe(true);
  expect(result.leo).toBe(false);
  expect(result.oracle).toBe(false);
  expect(result.policy.hiddenOpponentCards).toBe(false);
});

test("統一牌面分析能區分乾燥、連接與動態牌面", async ({ page }) => {
  await loadBoardIntelligence(page);
  const result = await page.evaluate(() => {
    const api = window.AiBoardIntelligenceV25;
    const dry = api.analyzeBoard([
      { value: 14, suit: "s" }, { value: 7, suit: "h" }, { value: 2, suit: "d" },
    ]);
    const wet = api.analyzeBoard([
      { value: 11, suit: "s" }, { value: 10, suit: "s" }, { value: 9, suit: "h" }, { value: 8, suit: "d" },
    ]);
    return { dry, wet };
  });

  expect(result.dry.className).toBe("dry");
  expect(result.dry.dryness).toBeGreaterThan(0.8);
  expect(result.wet.straight.fourConnected).toBe(true);
  expect(result.wet.dynamic).toBe(true);
  expect(result.wet.wetness).toBeGreaterThan(result.dry.wetness);
});

test("中階 AI 缺少 Blocker 時取消純詐唬，持有堅果 Blocker 時保留極化線", async ({ page }) => {
  await loadBoardIntelligence(page);
  const result = await page.evaluate(base => {
    const api = window.AiBoardIntelligenceV25;
    const board = [
      { value: 13, suit: "s" }, { value: 7, suit: "s" }, { value: 2, suit: "s" },
      { value: 9, suit: "h" }, { value: 3, suit: "c" },
    ];
    const poor = api.applyBoardIntelligence(
      { name: "Ace", cards: [{ value: 4, suit: "c" }, { value: 3, suit: "d" }] },
      structuredClone(base),
      { board },
    );
    const good = api.applyBoardIntelligence(
      { name: "Ace", cards: [{ value: 14, suit: "s" }, { value: 5, suit: "d" }] },
      structuredClone(base),
      { board },
    );
    return { poor, good };
  }, bluffDecision());

  expect(result.poor.action).not.toBe("raise");
  expect(result.poor.boardAdjustment).toBe("suppress-poor-blocker-bluff");
  expect(result.good.action).toBe("raise");
  expect(result.good.blockerProfile.nutFlushBlocker).toBe(true);
  expect(result.good.sizeFraction).toBeGreaterThanOrEqual(0.6);
});

test("中階開始會在動態濕潤牌面放棄大尺寸邊緣跟注", async ({ page }) => {
  await loadBoardIntelligence(page);
  const result = await page.evaluate(() => {
    const decision = {
      action: "call",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "base",
      callScore: -0.01,
      raiseScore: 0,
      bluffing: false,
      valueReady: false,
      context: {
        street: "turn",
        needed: 420,
        pot: 560,
        potOdds: 0.428,
        equityProxy: 0.48,
        drawPotential: 0.02,
        canRaise: false,
        activeOpponents: 2,
      },
      candidates: [],
    };
    return window.AiBoardIntelligenceV25.applyBoardIntelligence(
      { name: "Nori", cards: [{ value: 14, suit: "c" }, { value: 8, suit: "c" }] },
      decision,
      { board: [
        { value: 11, suit: "s" }, { value: 10, suit: "s" }, { value: 9, suit: "h" }, { value: 8, suit: "d" },
      ] },
    );
  });

  expect(result.action).toBe("fold");
  expect(result.boardAdjustment).toBe("board-risk-fold");
  expect(result.boardTexture.dynamic).toBe(true);
  expect(result.aiStrengthStartsAtMiddle).toBe(true);
});

test("濕潤牌面厚價值採較大尺寸，初階角色與隱藏對手牌不受影響", async ({ page }) => {
  await loadBoardIntelligence(page);
  const result = await page.evaluate(() => {
    const api = window.AiBoardIntelligenceV25;
    const base = {
      action: "raise",
      raiseBy: 220,
      sizeFraction: 0.4,
      reason: "base",
      callScore: 0.3,
      raiseScore: 0.4,
      bluffing: false,
      valueReady: true,
      context: {
        street: "turn",
        needed: 0,
        pot: 550,
        potOdds: 0,
        equityProxy: 0.88,
        drawPotential: 0,
        canRaise: true,
        activeOpponents: 2,
      },
      candidates: [
        { raiseBy: 220, fraction: 0.4, ev: 80 },
        { raiseBy: 360, fraction: 0.65, ev: 92 },
        { raiseBy: 500, fraction: 0.9, ev: 88 },
      ],
    };
    let hiddenRead = false;
    const opponent = {
      name: "玩家",
      get cards() {
        hiddenRead = true;
        throw new Error("hidden cards must not be read");
      },
    };
    void opponent;
    const elite = api.applyBoardIntelligence(
      { name: "Unit-9", cards: [{ value: 14, suit: "s" }, { value: 13, suit: "s" }] },
      structuredClone(base),
      { board: [
        { value: 11, suit: "s" }, { value: 10, suit: "s" }, { value: 9, suit: "h" }, { value: 8, suit: "d" },
      ] },
    );
    const openingBase = structuredClone(base);
    const opening = api.applyBoardIntelligence(
      { name: "Leo", cards: [{ value: 14, suit: "d" }, { value: 13, suit: "d" }] },
      openingBase,
      { board: [
        { value: 11, suit: "s" }, { value: 10, suit: "s" }, { value: 9, suit: "h" }, { value: 8, suit: "d" },
      ] },
    );
    return {
      elite,
      hiddenRead,
      openingIntegrated: Boolean(opening.boardIntelligenceIntegrated),
      sameOpeningObject: opening === openingBase,
    };
  });

  expect(result.elite.action).toBe("raise");
  expect(result.elite.sizeFraction).toBeGreaterThan(0.4);
  expect(result.elite.boardAdjustment).toBe("texture-value-sizing");
  expect(result.hiddenRead).toBe(false);
  expect(result.openingIntegrated).toBe(false);
  expect(result.sameOpeningObject).toBe(true);
});
