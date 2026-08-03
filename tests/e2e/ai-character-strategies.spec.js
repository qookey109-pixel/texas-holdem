import { expect, test } from "@playwright/test";

test("中階與高階角色使用十套獨立且公平的策略", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategies?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const registry = await page.evaluate(() => {
    const names = AiCharacterStrategies.supportedNames;
    return {
      names,
      ids: names.map(name => AiCharacterStrategies.strategies[name].id),
      profiles: names.map(name => {
        const profile = AI_ROSTER.find(candidate => candidate.name === name);
        return {
          name,
          independentStrategy: profile?.independentStrategy,
          strategyId: profile?.strategyId,
          strategyVersion: profile?.strategyVersion,
          publicInformationOnly: profile?.publicInformationOnly,
        };
      }),
      policy: AiCharacterStrategies.fairInformationPolicy,
      installed: Boolean(window.__aiCharacterStrategyDecisionInstalled),
      supportChecks: {
        leo: AiCharacterStrategies.supports("Leo"),
        ace: AiCharacterStrategies.supports("Ace"),
        vlad: AiCharacterStrategies.supports("Vlad"),
        oracle: AiCharacterStrategies.supports("Oracle"),
        gemini: AiCharacterStrategies.supports("Gemini"),
      },
    };
  });

  expect(registry.names).toEqual([
    "Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper",
    "Nova", "Unit-9", "Merlin", "Vlad",
  ]);
  expect(new Set(registry.ids).size).toBe(10);
  expect(registry.profiles).toHaveLength(10);
  for (const profile of registry.profiles) {
    expect(profile).toMatchObject({
      independentStrategy: true,
      strategyVersion: "1.0.0",
      publicInformationOnly: true,
    });
    expect(profile.strategyId).toBeTruthy();
  }
  expect(registry.policy).toEqual({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    publicHeroStatistics: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
  expect(registry.installed).toBe(true);
  expect(registry.supportChecks).toEqual({
    leo: false,
    ace: true,
    vlad: true,
    oracle: false,
    gemini: false,
  });
});

test("獨立策略只建立公開資訊決策情境並產生不同下注計畫", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategies?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });

    state.handNumber = 118;
    state.board = [
      card("K", 13, "h"),
      card("9", 9, "h"),
      card("4", 4, "c"),
      card("2", 2, "d"),
    ];
    state.deck = [card("A", 14, "s"), card("A", 14, "d")];
    state.pot = 260;
    state.currentBet = 80;
    state.heroStyle = {
      hands: 12,
      vpip: 8,
      raises: 3,
      calls: 6,
      checks: 3,
      folds: 5,
      allIns: 1,
      showdowns: 3,
      wins: 1,
    };
    Object.assign(state.players[0], {
      isHuman: true,
      bet: 80,
      lastAction: "call",
      folded: false,
    });

    const decisions = {};
    const randomValues = [0.42, 0.18, 0.76, 0.31, 0.59, 0.23, 0.67, 0.35];
    for (const name of AiCharacterStrategies.supportedNames) {
      let index = 0;
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      const player = {
        ...state.players[1],
        ...profile,
        name,
        cards: [card("K", 13, "s"), card("Q", 12, "s")],
        stack: 1800,
        bet: 20,
        totalContribution: 20,
        folded: false,
        allIn: false,
        raiseLocked: false,
        position: 1,
      };
      const context = AiCharacterStrategies.publicContext(player);
      const decision = AiCharacterStrategies.chooseDecision(player, {
        random: () => randomValues[(index++) % randomValues.length],
      });
      decisions[name] = {
        action: decision.action,
        strategyId: decision.strategyId,
        plan: decision.plan.line,
        raiseBy: decision.raiseBy,
        candidates: decision.candidates.map(candidate => candidate.raiseBy),
        contextKeys: Object.keys(context),
        context,
      };
    }
    return decisions;
  });

  const strategyIds = new Set();
  const sizeSignatures = new Set();
  for (const decision of Object.values(result)) {
    expect(["fold", "call", "raise"]).toContain(decision.action);
    expect(decision.strategyId).toBeTruthy();
    expect(decision.plan).toBeTruthy();
    expect(decision.context.ownCards).toEqual([
      { value: 13, suit: "s" },
      { value: 12, suit: "s" },
    ]);
    expect(decision.context.board).toEqual([
      { value: 13, suit: "h" },
      { value: 9, suit: "h" },
      { value: 4, suit: "c" },
      { value: 2, suit: "d" },
    ]);
    expect(decision.contextKeys).not.toContain("deck");
    expect(decision.contextKeys).not.toContain("opponentCards");
    expect(decision.contextKeys).not.toContain("futureBoard");
    expect(decision.context.equityProxy).toBeGreaterThanOrEqual(0.02);
    expect(decision.context.equityProxy).toBeLessThanOrEqual(0.99);
    expect(decision.candidates.length).toBeGreaterThan(0);
    strategyIds.add(decision.strategyId);
    sizeSignatures.add(decision.candidates.join(","));
  }

  expect(strategyIds.size).toBe(10);
  expect(sizeSignatures.size).toBeGreaterThanOrEqual(6);
});
