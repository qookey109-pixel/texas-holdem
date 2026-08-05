import { expect, test } from "@playwright/test";

async function waitForDifficultyLayer(page) {
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV11?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.1.0");
}

test("V1.1 載入公開行動記憶、範圍工具與難度層", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForDifficultyLayer(page);

  const result = await page.evaluate(() => ({
    memoryVersion: AiActionMemory.version,
    memorySchemaVersion: AiActionMemory.schemaVersion,
    rangeVersion: AiRangeTools.version,
    difficultyVersion: AiCharacterStrategiesV11.version,
    decisionInstalled: Boolean(window.__aiCharacterStrategyV11Installed),
    memoryPolicy: AiActionMemory.fairInformationPolicy,
    rangePolicy: AiRangeTools.fairInformationPolicy,
    difficultyPolicy: AiCharacterStrategiesV11.fairInformationPolicy,
    profiles: AiCharacterStrategies.supportedNames.map(name => {
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      return {
        name,
        strategyUpgradeVersion: profile?.strategyUpgradeVersion,
        actionMemory: profile?.actionMemory,
        multiStreetPlanning: profile?.multiStreetPlanning,
        riverRangeMixing: profile?.riverRangeMixing,
        blockerAware: profile?.blockerAware,
      };
    }),
  }));

  expect(result).toMatchObject({
    memoryVersion: "1.1.0",
    memorySchemaVersion: "2.2.0",
    rangeVersion: "1.0.0",
    difficultyVersion: "1.1.0",
    decisionInstalled: true,
  });
  expect(result.memoryPolicy).toMatchObject({
    publicActionsOnly: true,
    publicPositions: true,
    publicBetSizes: true,
    publicBoardAtActionTime: true,
    hiddenCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
  expect(result.rangePolicy).toMatchObject({
    ownHoleCards: true,
    publicBoard: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
  });
  expect(result.difficultyPolicy).toMatchObject({
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
  for (const profile of result.profiles) {
    expect(profile).toMatchObject({
      strategyUpgradeVersion: "1.1.0",
      actionMemory: true,
      multiStreetPlanning: true,
      riverRangeMixing: true,
      blockerAware: true,
    });
  }
});

test("Viper 先過牌後面對同街加注會啟動真正 Check-Raise", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForDifficultyLayer(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });

    state.handNumber = 501;
    state.board = [card("9", 9, "h"), card("4", 4, "c"), card("2", 2, "d")];
    state.pot = 240;
    state.currentBet = 80;
    state.lastRaiseSize = 80;
    state.heroStyle = {
      hands: 12,
      vpip: 7,
      raises: 4,
      calls: 4,
      checks: 2,
      folds: 5,
      allIns: 1,
      showdowns: 2,
      wins: 1,
    };

    const hero = {
      ...state.players[0],
      name: "Owl",
      isHuman: true,
      position: 0,
      bet: 80,
      stack: 1400,
      folded: false,
      lastAction: "raise",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Viper");
    const viper = {
      ...state.players[1],
      ...profile,
      name: "Viper",
      position: 1,
      cards: [card("9", 9, "s"), card("9", 9, "d")],
      bet: 0,
      stack: 1600,
      folded: false,
      allIn: false,
      raiseLocked: false,
    };
    state.players = [hero, viper];

    AiActionMemory.reset(501);
    AiActionMemory.recordAction(viper, "Check", 0);
    AiActionMemory.recordAction(hero, "Raise", 80);
    const opportunity = AiActionMemory.checkedThenFacedAggression(viper, "flop");
    const decision = AiCharacterStrategiesV11.chooseDecision(viper, { random: () => 0.12 });

    return {
      opportunity,
      action: decision.action,
      reason: decision.reason,
      checkRaise: decision.checkRaise,
      raiseBy: decision.raiseBy,
      memory: decision.publicActionMemory,
      contextKeys: Object.keys(decision.context),
    };
  });

  expect(result.opportunity.ready).toBe(true);
  expect(result.action).toBe("raise");
  expect(result.checkRaise).toBe(true);
  expect(result.raiseBy).toBeGreaterThan(0);
  expect(result.reason).toContain("過牌反加");
  expect(result.memory.checkRaiseReady).toBe(true);
  expect(result.contextKeys).not.toContain("deck");
  expect(result.contextKeys).not.toContain("opponentCards");
  expect(result.contextKeys).not.toContain("futureBoard");
});

test("河牌持有堅果同花阻擋牌時可轉成混合詐唬", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForDifficultyLayer(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });

    state.handNumber = 502;
    state.board = [
      card("K", 13, "h"),
      card("9", 9, "h"),
      card("4", 4, "c"),
      card("2", 2, "d"),
      card("7", 7, "h"),
    ];
    state.pot = 320;
    state.currentBet = 0;
    state.lastRaiseSize = 20;
    state.heroStyle = {
      hands: 20,
      vpip: 11,
      raises: 4,
      calls: 7,
      checks: 5,
      folds: 10,
      allIns: 1,
      showdowns: 4,
      wins: 2,
    };

    const hero = {
      ...state.players[0],
      name: "Owl",
      isHuman: true,
      position: 0,
      bet: 0,
      stack: 1400,
      folded: false,
      lastAction: "check",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Vlad");
    const vlad = {
      ...state.players[1],
      ...profile,
      name: "Vlad",
      position: 1,
      cards: [card("A", 14, "h"), card("Q", 12, "s")],
      bet: 0,
      stack: 1800,
      folded: false,
      allIn: false,
      raiseLocked: false,
    };
    state.players = [hero, vlad];
    AiActionMemory.reset(502);

    const context = AiCharacterStrategies.publicContext(vlad);
    const analysis = AiRangeTools.publicAnalysis(vlad, context);
    const decision = AiCharacterStrategiesV11.chooseDecision(vlad, { random: () => 0.08 });

    return {
      analysis,
      action: decision.action,
      reason: decision.reason,
      blockerBluff: decision.blockerBluff,
      raiseBy: decision.raiseBy,
      contextKeys: Object.keys(decision.context),
    };
  });

  expect(result.analysis.blockers.nutFlushBlocker).toBe(true);
  expect(result.analysis.blockers.bluffScore).toBeGreaterThanOrEqual(0.45);
  expect(result.analysis.riverClass).toBe("air");
  expect(result.action).toBe("raise");
  expect(result.blockerBluff).toBe(true);
  expect(result.raiseBy).toBeGreaterThan(0);
  expect(result.reason).toContain("阻擋牌詐唬");
  expect(result.contextKeys).not.toContain("deck");
  expect(result.contextKeys).not.toContain("opponentCards");
  expect(result.contextKeys).not.toContain("futureBoard");
});

test("Merlin 的延遲計畫會在轉牌轉成施壓線", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForDifficultyLayer(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });

    state.handNumber = 503;
    state.board = [
      card("K", 13, "c"),
      card("8", 8, "d"),
      card("3", 3, "s"),
      card("J", 11, "h"),
    ];
    state.pot = 220;
    state.currentBet = 0;
    state.lastRaiseSize = 20;
    const hero = {
      ...state.players[0],
      isHuman: true,
      position: 0,
      bet: 0,
      folded: false,
      lastAction: "check",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Merlin");
    const merlin = {
      ...state.players[1],
      ...profile,
      name: "Merlin",
      position: 1,
      cards: [card("A", 14, "s"), card("Q", 12, "s")],
      bet: 0,
      stack: 1700,
      folded: false,
      allIn: false,
      raiseLocked: false,
      aiStrategyPlan: {
        handNumber: 503,
        strategyId: "merlin-delayed-pressure",
        line: "delay",
        createdStreet: "flop",
        lastStreet: "flop",
        previousStrength: 0.38,
        previousDrawPotential: 0,
        preferredSize: 0.68,
      },
    };
    state.players = [hero, merlin];
    AiActionMemory.reset(503);

    const decision = AiCharacterStrategiesV11.chooseDecision(merlin, { random: () => 0.18 });
    return {
      plan: decision.plan,
      action: decision.action,
      reason: decision.reason,
    };
  });

  expect(result.plan.line).toBe("pressure");
  expect(result.plan.history.at(-1)).toMatchObject({
    fromStreet: "flop",
    toStreet: "turn",
    fromLine: "delay",
    toLine: "pressure",
  });
  expect(["call", "raise"]).toContain(result.action);
});
