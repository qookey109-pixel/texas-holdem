import { expect, test } from "@playwright/test";

async function waitForRangeContinuation(page) {
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV13?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.3.0");
}

test("V1.3 載入翻牌後範圍延續、C-bet、Probe 與 Barrel 能力", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRangeContinuation(page);

  const result = await page.evaluate(() => ({
    continuationVersion: AiRangeContinuation.version,
    difficultyVersion: AiCharacterStrategiesV13.version,
    installed: Boolean(window.__aiCharacterStrategyV13Installed),
    supported: AiRangeContinuation.supportedNames,
    continuationPolicy: AiRangeContinuation.fairInformationPolicy,
    difficultyPolicy: AiCharacterStrategiesV13.fairInformationPolicy,
    profiles: AiRangeContinuation.supportedNames.map(name => {
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      return {
        name,
        strategyUpgradeVersion: profile?.strategyUpgradeVersion,
        preflopStrategyVersion: profile?.preflopStrategyVersion,
        postflopStrategyVersion: profile?.postflopStrategyVersion,
        rangeContinuation: profile?.rangeContinuation,
        rangeAdvantageAware: profile?.rangeAdvantageAware,
        cbetAware: profile?.cbetAware,
        delayedCbetAware: profile?.delayedCbetAware,
        barrelAware: profile?.barrelAware,
        probeAware: profile?.probeAware,
      };
    }),
    oracleSupported: AiRangeContinuation.supports("Oracle"),
    chronosSupported: AiRangeContinuation.supports("Chronos"),
    geminiSupported: AiRangeContinuation.supports("Gemini"),
  }));

  expect(result).toMatchObject({
    continuationVersion: "1.0.0",
    difficultyVersion: "1.3.0",
    installed: true,
    oracleSupported: false,
    chronosSupported: false,
    geminiSupported: false,
  });
  expect(result.supported).toHaveLength(10);
  expect(result.continuationPolicy).toMatchObject({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    publicBetSizes: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
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
      preflopStrategyVersion: "1.2.0",
      postflopStrategyVersion: "1.3.0",
      rangeContinuation: true,
      rangeAdvantageAware: true,
      cbetAware: true,
      delayedCbetAware: true,
      barrelAware: true,
      probeAware: true,
    });
  }
});

test("Unit-9 會把翻牌前開池範圍延續成乾燥牌面 C-bet", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRangeContinuation(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const hero = {
      name: "Owl", position: 1, isHuman: true,
      cards: [], bet: 0, stack: 1800, folded: false, allIn: false, lastAction: "check",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Unit-9");
    const unit = {
      ...profile,
      name: "Unit-9", position: 0,
      cards: [card("K", 13, "s"), card("Q", 12, "s")],
      bet: 0, stack: 1800, folded: false, allIn: false, raiseLocked: false,
      aiStrategyPlan: null,
    };

    state.handNumber = 701;
    state.dealerIndex = 0;
    state.players = [unit, hero];
    state.board = [];
    state.pot = 180;
    state.currentBet = 0;
    state.lastRaiseSize = 20;
    state.heroStyle = { hands: 12, vpip: 7, raises: 3, calls: 5, checks: 3, folds: 5, allIns: 0 };
    AiActionMemory.reset(701);
    unit.bet = 60;
    AiActionMemory.recordAction(unit, "Raise", 60);
    hero.bet = 60;
    AiActionMemory.recordAction(hero, "Call", 60);

    unit.bet = 0;
    hero.bet = 0;
    state.board = [card("A", 14, "h"), card("7", 7, "c"), card("2", 2, "d")];
    const decision = AiCharacterStrategiesV13.chooseDecision(unit, { random: () => 0.05 });
    return {
      action: decision.action,
      reason: decision.reason,
      cbet: decision.cbet,
      rangeLine: decision.rangeLine,
      sizeFraction: decision.sizeFraction,
      range: decision.rangeContinuation,
      contextKeys: Object.keys(decision.context),
    };
  });

  expect(result.range.actorRange.role).toBe("opener");
  expect(result.range.heroRange.role).toBe("blind-defender");
  expect(result.range.cbetOpportunity).toBe(true);
  expect(result.range.board.dry).toBe(true);
  expect(result.action).toBe("raise");
  expect(result.cbet).toBe(true);
  expect(result.rangeLine).toBe("cbet");
  expect(result.sizeFraction).toBeGreaterThan(0);
  expect(result.reason).toContain("C-bet");
  expect(result.contextKeys).not.toContain("deck");
  expect(result.contextKeys).not.toContain("opponentCards");
  expect(result.contextKeys).not.toContain("futureBoard");
});

test("Merlin 翻牌 Check-Back 後會在轉牌啟動延遲 C-bet", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRangeContinuation(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const hero = {
      name: "Owl", position: 1, isHuman: true,
      cards: [], bet: 0, stack: 1700, folded: false, allIn: false, lastAction: "check",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Merlin");
    const merlin = {
      ...profile,
      name: "Merlin", position: 0,
      cards: [card("A", 14, "s"), card("Q", 12, "s")],
      bet: 0, stack: 1700, folded: false, allIn: false, raiseLocked: false,
      aiStrategyPlan: null,
    };

    state.handNumber = 702;
    state.dealerIndex = 0;
    state.players = [merlin, hero];
    state.board = [];
    state.pot = 220;
    state.currentBet = 0;
    state.lastRaiseSize = 20;
    state.heroStyle = { hands: 16, vpip: 9, raises: 4, calls: 6, checks: 5, folds: 7, allIns: 1 };
    AiActionMemory.reset(702);
    merlin.bet = 60;
    AiActionMemory.recordAction(merlin, "Raise", 60);
    hero.bet = 60;
    AiActionMemory.recordAction(hero, "Call", 60);

    merlin.bet = 0;
    hero.bet = 0;
    state.board = [card("K", 13, "c"), card("8", 8, "d"), card("3", 3, "s")];
    AiActionMemory.recordAction(merlin, "Check", 0);
    AiActionMemory.recordAction(hero, "Check", 0);

    state.board = [...state.board, card("J", 11, "h")];
    const decision = AiCharacterStrategiesV13.chooseDecision(merlin, { random: () => 0.05 });
    return {
      action: decision.action,
      reason: decision.reason,
      delayedCbet: decision.delayedCbet,
      rangeLine: decision.rangeLine,
      opportunity: decision.rangeContinuation.delayedCbetOpportunity,
      role: decision.rangeContinuation.actorRange.role,
    };
  });

  expect(result.role).toBe("opener");
  expect(result.opportunity).toBe(true);
  expect(result.action).toBe("raise");
  expect(result.delayedCbet).toBe(true);
  expect(result.rangeLine).toBe("delayed-cbet");
  expect(result.reason).toContain("延遲 C-bet");
});

test("Nova 在對手錯過 C-bet 後會以公開範圍啟動 Probe", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRangeContinuation(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const hero = {
      name: "Owl", position: 0, isHuman: true,
      cards: [], bet: 0, stack: 1700, folded: false, allIn: false, lastAction: "check",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Nova");
    const nova = {
      ...profile,
      name: "Nova", position: 1,
      cards: [card("J", 11, "s"), card("T", 10, "s")],
      bet: 0, stack: 1700, folded: false, allIn: false, raiseLocked: false,
      aiStrategyPlan: null,
    };

    state.handNumber = 703;
    state.dealerIndex = 0;
    state.players = [hero, nova];
    state.board = [];
    state.pot = 220;
    state.currentBet = 0;
    state.lastRaiseSize = 20;
    state.heroStyle = { hands: 18, vpip: 11, raises: 6, calls: 7, checks: 6, folds: 8, allIns: 1 };
    AiActionMemory.reset(703);
    hero.bet = 60;
    AiActionMemory.recordAction(hero, "Raise", 60);
    nova.bet = 60;
    AiActionMemory.recordAction(nova, "Call", 60);

    hero.bet = 0;
    nova.bet = 0;
    state.board = [card("Q", 12, "h"), card("7", 7, "c"), card("2", 2, "d")];
    AiActionMemory.recordAction(hero, "Check", 0);
    AiActionMemory.recordAction(nova, "Check", 0);

    state.board = [...state.board, card("9", 9, "h")];
    const decision = AiCharacterStrategiesV13.chooseDecision(nova, { random: () => 0.05 });
    return {
      action: decision.action,
      reason: decision.reason,
      probeBet: decision.probeBet,
      rangeLine: decision.rangeLine,
      opportunity: decision.rangeContinuation.probeOpportunity,
      role: decision.rangeContinuation.actorRange.role,
      drawPotential: decision.context.drawPotential,
    };
  });

  expect(result.role).toBe("blind-defender");
  expect(result.opportunity).toBe(true);
  expect(result.drawPotential).toBeGreaterThanOrEqual(0.09);
  expect(result.action).toBe("raise");
  expect(result.probeBet).toBe(true);
  expect(result.rangeLine).toBe("probe");
  expect(result.reason).toContain("Probe");
});

test("Momo 翻牌下注被跟注後會在合適轉牌延續第二槍", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRangeContinuation(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const hero = {
      name: "Owl", position: 1, isHuman: true,
      cards: [], bet: 0, stack: 1500, folded: false, allIn: false, lastAction: "call",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Momo");
    const momo = {
      ...profile,
      name: "Momo", position: 0,
      cards: [card("A", 14, "h"), card("Q", 12, "h")],
      bet: 0, stack: 1500, folded: false, allIn: false, raiseLocked: false,
      aiStrategyPlan: null,
    };

    state.handNumber = 704;
    state.dealerIndex = 0;
    state.players = [momo, hero];
    state.board = [];
    state.pot = 360;
    state.currentBet = 0;
    state.lastRaiseSize = 20;
    state.heroStyle = { hands: 20, vpip: 13, raises: 5, calls: 10, checks: 6, folds: 8, allIns: 2 };
    AiActionMemory.reset(704);
    momo.bet = 70;
    AiActionMemory.recordAction(momo, "Raise", 70);
    hero.bet = 70;
    AiActionMemory.recordAction(hero, "Call", 70);

    momo.bet = 0;
    hero.bet = 0;
    state.board = [card("A", 14, "c"), card("8", 8, "h"), card("3", 3, "s")];
    momo.bet = 100;
    AiActionMemory.recordAction(momo, "Raise", 100);
    hero.bet = 100;
    AiActionMemory.recordAction(hero, "Call", 100);

    momo.bet = 0;
    hero.bet = 0;
    state.board = [...state.board, card("T", 10, "h")];
    const decision = AiCharacterStrategiesV13.chooseDecision(momo, { random: () => 0.05 });
    return {
      action: decision.action,
      reason: decision.reason,
      doubleBarrel: decision.doubleBarrel,
      rangeLine: decision.rangeLine,
      opportunity: decision.rangeContinuation.doubleBarrelOpportunity,
    };
  });

  expect(result.opportunity).toBe(true);
  expect(result.action).toBe("raise");
  expect(result.doubleBarrel).toBe(true);
  expect(result.rangeLine).toBe("double-barrel");
  expect(result.reason).toContain("第二槍");
});
