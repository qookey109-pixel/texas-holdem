import { expect, test } from "@playwright/test";

async function waitForPreflopLayer(page) {
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV12?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.2.0");
}

test("V1.2 載入位置範圍、3-bet、4-bet、Squeeze 與盲位防守能力", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForPreflopLayer(page);

  const result = await page.evaluate(() => ({
    engineVersion: AiPreflopRangeEngine.version,
    difficultyVersion: AiCharacterStrategiesV12.version,
    installed: Boolean(window.__aiCharacterStrategyV12Installed),
    enginePolicy: AiPreflopRangeEngine.fairInformationPolicy,
    difficultyPolicy: AiCharacterStrategiesV12.fairInformationPolicy,
    supported: AiPreflopRangeEngine.supportedNames,
    profiles: AiPreflopRangeEngine.supportedNames.map(name => {
      const profile = AI_ROSTER.find(candidate => candidate.name === name);
      return {
        name,
        strategyUpgradeVersion: profile?.strategyUpgradeVersion,
        preflopStrategyVersion: profile?.preflopStrategyVersion,
        preflopRangeEngine: profile?.preflopRangeEngine,
        positionAwareOpening: profile?.positionAwareOpening,
        blindDefenseAware: profile?.blindDefenseAware,
        threeBetAware: profile?.threeBetAware,
        fourBetAware: profile?.fourBetAware,
        squeezeAware: profile?.squeezeAware,
      };
    }),
    oracleSupported: AiPreflopRangeEngine.supports("Oracle"),
    geminiSupported: AiPreflopRangeEngine.supports("Gemini"),
  }));

  expect(result).toMatchObject({
    engineVersion: "1.0.0",
    difficultyVersion: "1.2.0",
    installed: true,
    oracleSupported: false,
    geminiSupported: false,
  });
  expect(result.supported).toHaveLength(10);
  expect(result.enginePolicy).toMatchObject({
    ownHoleCards: true,
    publicPosition: true,
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
      preflopRangeEngine: true,
      positionAwareOpening: true,
      blindDefenseAware: true,
      threeBetAware: true,
      fourBetAware: true,
      squeezeAware: true,
    });
  }
});

test("同一手 J8s 在 BTN 會開池，在 UTG 會收窄", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForPreflopLayer(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const profile = AI_ROSTER.find(candidate => candidate.name === "Nori");
    const makePlayer = position => ({
      ...profile,
      name: "Nori",
      position,
      cards: [card("J", 11, "s"), card("8", 8, "s")],
      bet: 0,
      stack: 2000,
      folded: false,
      allIn: false,
      raiseLocked: false,
    });
    const dummies = Array.from({ length: 7 }, (_, position) => ({
      name: position === 1 ? "Owl" : `Seat-${position}`,
      position,
      isHuman: position === 1,
      cards: [],
      bet: position === 1 ? 10 : (position === 2 ? 20 : 0),
      stack: 2000,
      folded: false,
    }));

    state.handNumber = 601;
    state.board = [];
    state.dealerIndex = 0;
    state.pot = 30;
    state.currentBet = 20;
    state.lastRaiseSize = 20;
    state.heroStyle = { hands: 0, vpip: 0, raises: 0, calls: 0, checks: 0, folds: 0, allIns: 0 };

    const button = makePlayer(0);
    state.players = dummies.map(player => player.position === 0 ? button : player);
    AiActionMemory.reset(601);
    const buttonDecision = AiPreflopRangeEngine.chooseDecision(button, { random: () => 0.99 });

    const utg = makePlayer(3);
    state.players = dummies.map(player => player.position === 3 ? utg : player);
    AiActionMemory.reset(601);
    const utgDecision = AiPreflopRangeEngine.chooseDecision(utg, { random: () => 0.99 });

    return {
      handCode: buttonDecision.hand.code,
      handScore: buttonDecision.hand.score,
      button: {
        position: buttonDecision.context.position,
        action: buttonDecision.action,
        stage: buttonDecision.stage,
        threshold: buttonDecision.thresholds.open,
      },
      utg: {
        position: utgDecision.context.position,
        action: utgDecision.action,
        stage: utgDecision.stage,
        threshold: utgDecision.thresholds.open,
      },
      contextKeys: Object.keys(buttonDecision.context),
    };
  });

  expect(result.handCode).toBe("J8s");
  expect(result.button.position).toBe("BTN");
  expect(result.button.action).toBe("raise");
  expect(result.button.stage).toBe("open-raise");
  expect(result.utg.position).toBe("UTG");
  expect(result.utg.action).toBe("fold");
  expect(result.button.threshold).toBeLessThan(result.utg.threshold);
  expect(result.contextKeys).not.toContain("deck");
  expect(result.contextKeys).not.toContain("opponentCards");
  expect(result.contextKeys).not.toContain("futureBoard");
});

test("Unit-9 面對公開開池會用 AKs 做位置化 3-bet", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForPreflopLayer(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const hero = { name: "Owl", position: 4, isHuman: true, bet: 60, stack: 1940, folded: false };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Unit-9");
    const unit = {
      ...profile,
      name: "Unit-9",
      position: 6,
      cards: [card("A", 14, "s"), card("K", 13, "s")],
      bet: 0,
      stack: 2000,
      folded: false,
      allIn: false,
      raiseLocked: false,
    };
    const seats = Array.from({ length: 7 }, (_, position) => ({
      name: `Seat-${position}`,
      position,
      isHuman: false,
      cards: [],
      bet: 0,
      stack: 2000,
      folded: false,
    }));
    seats[4] = hero;
    seats[6] = unit;

    state.handNumber = 602;
    state.board = [];
    state.dealerIndex = 0;
    state.players = seats;
    state.pot = 110;
    state.currentBet = 60;
    state.lastRaiseSize = 40;
    state.heroStyle = { hands: 12, vpip: 7, raises: 4, calls: 3, checks: 2, folds: 5, allIns: 1 };
    AiActionMemory.reset(602);
    AiActionMemory.recordAction(hero, "Raise", 60);

    const decision = AiPreflopRangeEngine.chooseDecision(unit, { random: () => 0.9 });
    return {
      action: decision.action,
      stage: decision.stage,
      reason: decision.reason,
      raiseBy: decision.raiseBy,
      hand: decision.hand,
      raises: decision.context.raises,
      latestRaise: decision.context.latestRaise,
    };
  });

  expect(result.hand.code).toBe("AKs");
  expect(result.action).toBe("raise");
  expect(result.stage).toBe("three-bet");
  expect(result.reason).toContain("3-bet");
  expect(result.raiseBy).toBeGreaterThan(0);
  expect(result.raises).toBe(1);
  expect(result.latestRaise).toMatchObject({ actor: "Owl", isHuman: true });
});

test("Momo 面對開池加跟注會啟動 Squeeze", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForPreflopLayer(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] });
    const opener = { name: "Owl", position: 4, isHuman: true, bet: 60, stack: 1940, folded: false };
    const caller = { name: "Seat-5", position: 5, isHuman: false, bet: 60, stack: 1940, folded: false };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Momo");
    const momo = {
      ...profile,
      name: "Momo",
      position: 0,
      cards: [card("A", 14, "h"), card("5", 5, "h")],
      bet: 0,
      stack: 2000,
      folded: false,
      allIn: false,
      raiseLocked: false,
    };
    const seats = Array.from({ length: 7 }, (_, position) => ({
      name: `Seat-${position}`,
      position,
      isHuman: false,
      cards: [],
      bet: 0,
      stack: 2000,
      folded: false,
    }));
    seats[0] = momo;
    seats[4] = opener;
    seats[5] = caller;

    state.handNumber = 603;
    state.board = [];
    state.dealerIndex = 0;
    state.players = seats;
    state.pot = 170;
    state.currentBet = 60;
    state.lastRaiseSize = 40;
    state.heroStyle = { hands: 10, vpip: 7, raises: 3, calls: 5, checks: 2, folds: 4, allIns: 1 };
    AiActionMemory.reset(603);
    AiActionMemory.recordAction(opener, "Raise", 60);
    AiActionMemory.recordAction(caller, "Call", 60);

    const decision = AiPreflopRangeEngine.chooseDecision(momo, { random: () => 0.05 });
    return {
      action: decision.action,
      stage: decision.stage,
      reason: decision.reason,
      squeeze: decision.squeeze,
      raiseBy: decision.raiseBy,
      callersAfterOpen: decision.context.callersAfterOpen,
      hand: decision.hand,
    };
  });

  expect(result.hand.code).toBe("A5s");
  expect(result.action).toBe("raise");
  expect(result.stage).toBe("squeeze");
  expect(result.squeeze).toBe(true);
  expect(result.callersAfterOpen).toBe(1);
  expect(result.raiseBy).toBeGreaterThan(0);
  expect(result.reason).toContain("Squeeze");
});
