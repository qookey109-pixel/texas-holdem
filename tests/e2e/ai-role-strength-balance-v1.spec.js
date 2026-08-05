import { expect, test } from "@playwright/test";

async function waitForRoleStrength(page) {
  await expect.poll(
    () => page.evaluate(() => window.AiRoleStrengthBalanceV1?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");
}

test("19 位角色具有獨立強度、星級與精準度梯度", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRoleStrength(page);

  const result = await page.evaluate(() => {
    const names = [
      "Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark",
      "Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper",
      "Nova", "Unit-9", "Merlin", "Vlad", "Oracle", "Chronos", "Gemini",
    ];
    return {
      version: AiRoleStrengthBalanceV1.version,
      profiles: Object.fromEntries(names.map(name => [name, AiRoleStrengthBalanceV1.profileFor(name)])),
      tiers: {
        toto: AiRoleStrengthBalanceV1.tierForName("Toto"),
        shark: AiRoleStrengthBalanceV1.tierForName("Shark"),
        dodo: AiRoleStrengthBalanceV1.tierForName("Dodo"),
        viper: AiRoleStrengthBalanceV1.tierForName("Viper"),
        unit9: AiRoleStrengthBalanceV1.tierForName("Unit-9"),
        gemini: AiRoleStrengthBalanceV1.tierForName("Gemini"),
      },
      publicTierApi: {
        dodo: AiTierBossSystem.tierForName("Dodo"),
        viper: AiTierBossSystem.tierForName("Viper"),
      },
      policy: AiRoleStrengthBalanceV1.fairInformationPolicy,
    };
  });

  expect(Object.keys(result.profiles)).toHaveLength(19);
  expect(result.profiles.Toto).toMatchObject({ rating: 18, stars: 1, tier: "opening" });
  expect(result.profiles.Shark).toMatchObject({ rating: 48, stars: 3, tier: "opening" });
  expect(result.profiles.Dodo).toMatchObject({ rating: 46, stars: 3, tier: "middle" });
  expect(result.profiles.Viper).toMatchObject({ rating: 66, stars: 5, tier: "middle" });
  expect(result.profiles["Unit-9"]).toMatchObject({ rating: 82, stars: 6, tier: "elite" });
  expect(result.profiles.Gemini).toMatchObject({ rating: 98, stars: 7, tier: "gemini" });
  expect(result.profiles.Toto.precision).toBeLessThan(result.profiles.Shark.precision);
  expect(result.profiles.Shark.precision).toBeLessThan(result.profiles.Viper.precision);
  expect(result.profiles.Viper.precision).toBeLessThan(result.profiles["Unit-9"].precision);
  expect(result.profiles["Unit-9"].precision).toBeLessThan(result.profiles.Gemini.precision);
  expect(result.profiles.Toto.noiseAmplitude).toBeGreaterThan(result.profiles.Viper.noiseAmplitude);
  expect(result.profiles.Viper.noiseAmplitude).toBeGreaterThan(result.profiles["Unit-9"].noiseAmplitude);

  expect(result.tiers).toEqual({
    toto: { key: "opening", label: "初階 AI", stars: 1 },
    shark: { key: "opening", label: "初階 AI", stars: 3 },
    dodo: { key: "middle", label: "中階 AI", stars: 3 },
    viper: { key: "middle", label: "中階 AI", stars: 5 },
    unit9: { key: "elite", label: "高階 AI", stars: 6 },
    gemini: { key: "gemini", label: "FINAL BOSS", stars: 7 },
  });
  expect(result.publicTierApi).toEqual({
    dodo: { key: "middle", label: "中階 AI", stars: 3 },
    viper: { key: "middle", label: "中階 AI", stars: 5 },
  });
  expect(result.policy).toMatchObject({
    publicRoleName: true,
    publicDecisionContext: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
});

test("角色參數調整保留原本個性，不把所有角色改成同一打法", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRoleStrength(page);

  const result = await page.evaluate(() => {
    AiRoleStrengthBalanceV1.refresh();
    const pick = name => {
      const role = AI_ROSTER.find(candidate => candidate.name === name);
      return {
        name,
        bluffRate: role?.bluffRate,
        aggression: role?.aggression,
        patience: role?.patience,
        rating: role?.roleStrengthRating,
        stars: role?.tierStars,
        precision: role?.decisionPrecision,
        version: role?.roleStrengthVersion,
      };
    };
    return {
      toto: pick("Toto"),
      pao: pick("Pao"),
      leo: pick("Leo"),
      foxy: pick("Foxy"),
      shark: pick("Shark"),
      dodo: pick("Dodo"),
      viper: pick("Viper"),
    };
  });

  expect(result.toto.version).toBe("1.0.0");
  expect(result.toto.stars).toBe(1);
  expect(result.shark.stars).toBe(3);
  expect(result.dodo.stars).toBe(3);
  expect(result.viper.stars).toBe(5);

  expect(result.foxy.bluffRate).toBeGreaterThan(result.leo.bluffRate);
  expect(result.leo.bluffRate).toBeGreaterThan(result.toto.bluffRate);
  expect(result.pao.aggression).toBeLessThan(result.shark.aggression);
  expect(result.toto.patience).toBeGreaterThan(result.leo.patience);
  expect(result.viper.precision).toBeGreaterThan(result.dodo.precision);
});

test("策略決策會寫入角色強度校準，且只使用公開決策上下文", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRoleStrength(page);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({ label, value, suit });
    state.handNumber = 8801;
    state.board = [card("J", 11, "s"), card("8", 8, "d"), card("3", 3, "c")];
    state.pot = 240;
    state.currentBet = 60;
    state.lastRaiseSize = 40;
    state.dealerIndex = 0;

    const hero = {
      ...state.players[0],
      name: "Owl",
      isHuman: true,
      position: 0,
      cards: [card("2", 2, "s"), card("2", 2, "h")],
      stack: 1600,
      bet: 60,
      folded: false,
      allIn: false,
      lastAction: "raise",
    };
    const profile = AI_ROSTER.find(candidate => candidate.name === "Unit-9");
    const unit9 = {
      ...state.players[1],
      ...profile,
      name: "Unit-9",
      isHuman: false,
      position: 1,
      cards: [card("A", 14, "s"), card("J", 11, "d")],
      stack: 1800,
      bet: 20,
      folded: false,
      allIn: false,
      raiseLocked: false,
    };
    state.players = [hero, unit9];

    const decision = AiCharacterStrategies.chooseDecision(unit9, { random: () => 0.5 });
    const directSignals = AiRoleStrengthBalanceV1.decisionSignals("Unit-9", {
      handNumber: 8801,
      street: "flop",
      position: "BB",
      pot: 240,
      needed: 40,
      currentBet: 60,
      activeOpponents: 1,
    });
    return {
      decision: {
        action: decision.action,
        callScore: decision.callScore,
        raiseScore: decision.raiseScore,
        rawCallScore: decision.rawCallScore,
        rawRaiseScore: decision.rawRaiseScore,
        roleStrength: decision.roleStrength,
        contextKeys: Object.keys(decision.context),
      },
      directSignals,
    };
  });

  expect(result.decision.roleStrength).toMatchObject({
    version: "1.0.0",
    rating: 82,
    stars: 6,
    tier: "elite",
    precision: 0.9,
    publicInformationOnly: true,
  });
  expect(result.decision.callScore).toBeCloseTo(
    result.decision.rawCallScore
      - result.decision.roleStrength.callThresholdDelta
      + result.decision.roleStrength.noise,
    8,
  );
  expect(result.decision.raiseScore).toBeCloseTo(
    result.decision.rawRaiseScore
      + result.decision.roleStrength.raiseScoreDelta
      - Math.abs(result.decision.roleStrength.noise) * 0.15,
    8,
  );
  expect(result.directSignals).toEqual(result.decision.roleStrength);
  expect(result.decision.contextKeys).not.toContain("deck");
  expect(result.decision.contextKeys).not.toContain("opponentCards");
  expect(result.decision.contextKeys).not.toContain("futureBoard");
});

test("純校準函式不讀取全域隱藏牌、牌堆或未來公共牌", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForRoleStrength(page);

  const result = await page.evaluate(() => {
    const originalState = window.state;
    const forbidden = new Set(["deck", "players", "futureBoard", "winner"]);
    let forbiddenReads = 0;
    try {
      window.state = new Proxy({}, {
        get(_target, property) {
          if (forbidden.has(String(property))) {
            forbiddenReads += 1;
            throw new Error(`forbidden:${String(property)}`);
          }
          return undefined;
        },
      });
      const signals = AiRoleStrengthBalanceV1.decisionSignals("Viper", {
        handNumber: 19,
        street: "turn",
        position: "CO",
        pot: 420,
        needed: 120,
        currentBet: 120,
        activeOpponents: 2,
      });
      const decision = AiRoleStrengthBalanceV1.calibrateStrategyDecision(
        { name: "Viper" },
        {
          action: "call",
          callScore: 0.04,
          raiseScore: 0.03,
          bluffing: false,
          valueReady: false,
          raiseBy: 0,
          sizeFraction: 0,
          candidates: [],
          context: {
            handNumber: 19,
            street: "turn",
            position: "CO",
            pot: 420,
            needed: 120,
            currentBet: 120,
            activeOpponents: 2,
          },
        },
      );
      return { forbiddenReads, signals, decisionRoleStrength: decision.roleStrength };
    } finally {
      window.state = originalState;
    }
  });

  expect(result.forbiddenReads).toBe(0);
  expect(result.signals).toMatchObject({
    rating: 66,
    stars: 5,
    tier: "middle",
    publicInformationOnly: true,
  });
  expect(result.decisionRoleStrength).toEqual(result.signals);
});
