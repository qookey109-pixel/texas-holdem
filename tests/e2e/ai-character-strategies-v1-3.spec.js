import { expect, test } from "@playwright/test";

async function waitForAdaptiveLayer(page) {
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV13?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.3.0");
}

test("V1.3 載入分街玩家模型與公開資訊自適應層", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForAdaptiveLayer(page);

  const result = await page.evaluate(() => ({
    playerModelVersion: AiPlayerModel.version,
    adaptiveVersion: AiCharacterStrategiesV13.version,
    installed: Boolean(window.__aiCharacterStrategyV13Installed),
    supported: AiCharacterStrategiesV13.supportedNames,
    playerModelPolicy: AiPlayerModel.fairInformationPolicy,
    adaptivePolicy: AiCharacterStrategiesV13.fairInformationPolicy,
    oracleSupported: AiCharacterStrategiesV13.supports("Oracle"),
    chronosSupported: AiCharacterStrategiesV13.supports("Chronos"),
    geminiSupported: AiCharacterStrategiesV13.supports("Gemini"),
    profiles: AiCharacterStrategiesV13.supportedNames.map(name => {
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      return {
        name,
        strategyUpgradeVersion: profile?.strategyUpgradeVersion,
        preflopStrategyVersion: profile?.preflopStrategyVersion,
        adaptiveStrategyVersion: profile?.adaptiveStrategyVersion,
        adaptivePlayerModel: profile?.adaptivePlayerModel,
        streetSpecificExploits: profile?.streetSpecificExploits,
        positionSpecificReads: profile?.positionSpecificReads,
        publicSizeTellAware: profile?.publicSizeTellAware,
      };
    }),
  }));

  expect(result).toMatchObject({
    playerModelVersion: "1.0.0",
    adaptiveVersion: "1.3.0",
    installed: true,
    oracleSupported: false,
    chronosSupported: false,
    geminiSupported: false,
  });
  expect(result.supported).toHaveLength(10);
  expect(result.playerModelPolicy).toMatchObject({
    publicActionsOnly: true,
    publicPositions: true,
    publicBetSizes: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
  expect(result.adaptivePolicy).toMatchObject({
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
  for (const profile of result.profiles) {
    expect(profile).toMatchObject({
      strategyUpgradeVersion: "1.1.0",
      preflopStrategyVersion: "1.2.0",
      adaptiveStrategyVersion: "1.3.0",
      adaptivePlayerModel: true,
      streetSpecificExploits: true,
      positionSpecificReads: true,
      publicSizeTellAware: true,
    });
  }
});

test("玩家模型只在有足夠樣本的街道辨識過度棄牌與 Check-Fold 漏洞", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForAdaptiveLayer(page);

  const result = await page.evaluate(() => {
    AiPlayerModel.reset();
    for (let index = 0; index < 6; index += 1) {
      AiPlayerModel.observePublicEvent({
        handNumber: 610 + index,
        street: "flop",
        position: "BTN",
        action: "fold",
        amount: 0,
        potBefore: 180,
        facedAggression: true,
        checkedBefore: true,
        priorRaises: 0,
      });
    }
    return {
      flop: AiPlayerModel.exploitProfile("flop", "BTN"),
      turn: AiPlayerModel.exploitProfile("turn", "BTN"),
      model: AiPlayerModel.ensureModel(),
    };
  });

  expect(result.flop.pressureSample).toBe(6);
  expect(result.flop.checkedPressureSample).toBe(6);
  expect(result.flop.foldToPressure).toBeGreaterThan(0.7);
  expect(result.flop.checkFoldRate).toBeGreaterThan(0.7);
  expect(result.flop.tendencies.overfoldToPressure).toBe(true);
  expect(result.flop.tendencies.checkFoldLeak).toBe(true);
  expect(result.turn.tendencies.overfoldToPressure).toBe(false);
  expect(result.turn.tendencies.checkFoldLeak).toBe(false);
  expect(result.model.recent).toHaveLength(6);
  expect(Object.keys(result.model)).not.toContain("cards");
  expect(Object.keys(result.model)).not.toContain("deck");
  expect(Object.keys(result.model)).not.toContain("futureBoard");
});

test("Ace 會針對翻牌 Check-Fold 漏洞用公開資訊主動施壓", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForAdaptiveLayer(page);

  const result = await page.evaluate(() => {
    AiPlayerModel.reset();
    for (let index = 0; index < 6; index += 1) {
      AiPlayerModel.observePublicEvent({
        handNumber: 700 + index,
        street: "flop",
        position: "BTN",
        action: "fold",
        potBefore: 200,
        facedAggression: true,
        checkedBefore: true,
      });
    }

    const player = { name: "Ace", stack: 1600, raiseLocked: false };
    const decision = {
      action: "call",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "原始控制線",
      valueReady: false,
      bluffing: false,
      callScore: 0.02,
      context: {
        street: "flop",
        position: "BTN",
        needed: 0,
        pot: 200,
        canRaise: true,
        activeOpponents: 1,
        equityProxy: 0.38,
        drawPotential: 0.08,
        potOdds: 0,
        texture: { dry: true, wetness: 0.12 },
      },
      rangeAnalysis: { riverClass: "not-river" },
      candidates: [
        { fraction: 0.5, raiseBy: 100, ev: 12 },
        { fraction: 0.8, raiseBy: 160, ev: 10 },
      ],
    };

    const enhanced = AiCharacterStrategiesV13.enhanceDecision(player, decision, { random: () => 0.01 });
    return {
      action: enhanced.action,
      raiseBy: enhanced.raiseBy,
      reason: enhanced.reason,
      exploitApplied: enhanced.exploitApplied,
      profile: enhanced.playerExploitProfile,
    };
  });

  expect(result.action).toBe("raise");
  expect(result.raiseBy).toBeGreaterThan(0);
  expect(result.reason).toContain("施壓");
  expect(["check-fold-leak", "overfold-pressure"]).toContain(result.exploitApplied);
  expect(result.profile.tendencies.checkFoldLeak).toBe(true);
});

test("河牌跟注站會讓 AI 取消阻擋牌詐唬並保留公平決策", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForAdaptiveLayer(page);

  const result = await page.evaluate(() => {
    AiPlayerModel.reset();
    for (let index = 0; index < 6; index += 1) {
      AiPlayerModel.observePublicEvent({
        handNumber: 800 + index,
        street: "river",
        position: "BB",
        action: "call",
        amount: 120,
        potBefore: 280,
        facedAggression: true,
        checkedBefore: false,
      });
    }

    const player = { name: "Vlad", stack: 1800, raiseLocked: false };
    const decision = {
      action: "raise",
      raiseBy: 240,
      sizeFraction: 0.8,
      reason: "河牌阻擋牌詐唬",
      valueReady: false,
      bluffing: true,
      blockerBluff: true,
      callScore: -0.03,
      context: {
        street: "river",
        position: "BB",
        needed: 0,
        pot: 300,
        canRaise: true,
        activeOpponents: 1,
        equityProxy: 0.24,
        drawPotential: 0,
        potOdds: 0,
        texture: { dry: false, wetness: 0.4 },
      },
      rangeAnalysis: {
        riverClass: "air",
        blockers: { bluffScore: 0.7 },
      },
      candidates: [{ fraction: 0.8, raiseBy: 240, ev: 8 }],
    };

    const enhanced = AiCharacterStrategiesV13.enhanceDecision(player, decision, { random: () => 0.9 });
    return {
      action: enhanced.action,
      raiseBy: enhanced.raiseBy,
      blockerBluff: enhanced.blockerBluff,
      bluffing: enhanced.bluffing,
      reason: enhanced.reason,
      exploitApplied: enhanced.exploitApplied,
      profile: enhanced.playerExploitProfile,
      profileKeys: Object.keys(enhanced.playerExploitProfile),
    };
  });

  expect(result.profile.tendencies.stickyCaller).toBe(true);
  expect(result.action).toBe("call");
  expect(result.raiseBy).toBe(0);
  expect(result.blockerBluff).toBe(false);
  expect(result.bluffing).toBe(false);
  expect(result.reason).toContain("取消");
  expect(result.exploitApplied).toBe("sticky-suppress-bluff");
  expect(result.profileKeys).not.toContain("opponentCards");
  expect(result.profileKeys).not.toContain("deck");
  expect(result.profileKeys).not.toContain("futureBoard");
});

test("高侵略玩家會讓 Unit-9 擴張合理 Bluff Catch", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForAdaptiveLayer(page);

  const result = await page.evaluate(() => {
    AiPlayerModel.reset();
    for (let index = 0; index < 8; index += 1) {
      AiPlayerModel.observePublicEvent({
        handNumber: 900 + index,
        street: "river",
        position: "CO",
        action: "raise",
        amount: 180,
        potBefore: 260,
        facedAggression: false,
      });
    }

    const player = { name: "Unit-9", stack: 1500, raiseLocked: false };
    const decision = {
      action: "fold",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "原始河牌棄牌",
      valueReady: false,
      bluffing: false,
      callScore: -0.02,
      context: {
        street: "river",
        position: "CO",
        needed: 60,
        pot: 200,
        canRaise: true,
        activeOpponents: 1,
        equityProxy: 0.4,
        drawPotential: 0,
        potOdds: 0.23,
        texture: { dry: true, wetness: 0.1 },
      },
      rangeAnalysis: { riverClass: "bluff-catcher" },
      candidates: [],
    };

    const enhanced = AiCharacterStrategiesV13.enhanceDecision(player, decision, { random: () => 0.8 });
    return {
      action: enhanced.action,
      reason: enhanced.reason,
      exploitApplied: enhanced.exploitApplied,
      profile: enhanced.playerExploitProfile,
    };
  });

  expect(result.profile.tendencies.aggressive).toBe(true);
  expect(result.action).toBe("call");
  expect(result.reason).toContain("Bluff Catch");
  expect(result.exploitApplied).toBe("aggressive-bluff-catch");
});
