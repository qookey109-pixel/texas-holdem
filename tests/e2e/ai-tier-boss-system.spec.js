import { expect, test } from "@playwright/test";

test("中階角色有專屬框線且星等明顯分層", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.AiTierBossSystem?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const tiers = await page.evaluate(() => ({
    opening: AiTierBossSystem.tierForName("Leo"),
    middle: AiTierBossSystem.tierForName("Ace"),
    elite: AiTierBossSystem.tierForName("Nova"),
    special: AiTierBossSystem.tierForName("Oracle"),
    gemini: AiTierBossSystem.tierForName("Gemini"),
  }));

  expect(tiers).toEqual({
    opening: { key: "opening", label: "初階 AI", stars: 2 },
    middle: { key: "middle", label: "中階 AI", stars: 4 },
    elite: { key: "elite", label: "高階 AI", stars: 6 },
    special: { key: "special", label: "特殊 BOSS", stars: 7 },
    gemini: { key: "gemini", label: "FINAL BOSS", stars: 7 },
  });

  await page.evaluate(() => {
    const profile = AI_ROSTER.find(candidate => candidate.name === "Ace");
    Object.assign(state.players[1], profile, {
      name: "Ace",
      position: 1,
      isHuman: false,
      status: "準備行動",
      stack: Math.max(1, state.players[1].stack),
    });
    render();
    AiTierBossSystem.refresh();
  });

  const seat = page.locator('.seat[data-profile-position="1"]');
  await expect(seat).toHaveClass(/is-mid-tier-character/);
  await expect(seat).toHaveClass(/mid-ace/);
  await expect(seat.locator(".ai-tier-seat-badge")).toContainText("SKY SNIPER");
  await expect(seat.locator(".ai-tier-seat-badge")).toContainText("★★★★");

  await seat.click();
  const panel = page.locator("#aiProfilePanel");
  await expect(panel).toHaveClass(/is-mid-tier-character-profile/);
  await expect(panel).toHaveClass(/mid-ace-profile/);
  await expect(panel.locator(".ai-tier-profile-banner")).toContainText("空中狙擊手");
  await expect(panel.locator(".ai-tier-label")).toHaveText("中階 AI");
  await expect(panel.locator(".ai-tier-stars")).toHaveAttribute("aria-label", "難度 4 / 7 星");
  await expect(panel.locator(".ai-tier-stars b")).toHaveText("★★★★");
  await expect(panel.locator(".ai-tier-stars i")).toHaveText("☆☆☆");
});

test("特殊 Boss 記住公開攤牌並用機率範圍預測，但不讀取隱藏答案", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.FairSpecialBosses?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");

  const bossData = await page.evaluate(() => ({
    oracle: AI_ROSTER.find(profile => profile.name === "Oracle"),
    chronos: AI_ROSTER.find(profile => profile.name === "Chronos"),
    oracleMeta: AI_PROFILE_META.Oracle,
    chronosMeta: AI_PROFILE_META.Chronos,
    decisionInstalled: Boolean(window.__fairSpecialBossDecisionInstalled),
    policy: FairSpecialBosses.fairInformationPolicy,
  }));

  expect(bossData.oracle).toMatchObject({
    emoji: "🔮",
    isSpecialBoss: true,
    fairPlay: true,
    playerModeling: true,
    publicInformationOnly: true,
    publicShowdownMemory: true,
    rangeInference: true,
    tierStars: 7,
  });
  expect(bossData.oracle.omniscient).toBeUndefined();
  expect(bossData.chronos).toMatchObject({
    emoji: "⏳",
    isSpecialBoss: true,
    fairPlay: true,
    playerModeling: true,
    publicInformationOnly: true,
    publicShowdownMemory: true,
    rangeInference: true,
    tierStars: 7,
  });
  expect(bossData.chronos.omniscient).toBeUndefined();
  expect(bossData.oracleMeta.summary).toContain("曾攤牌公開");
  expect(bossData.oracleMeta.traits.join(" ")).toContain("不讀取目前隱藏底牌");
  expect(bossData.chronosMeta.summary).toContain("模擬大量可能手牌");
  expect(bossData.chronosMeta.traits.join(" ")).toContain("不預知任何確定答案");
  expect(bossData.decisionInstalled).toBe(true);
  expect(bossData.policy).toMatchObject({
    revealedShowdowns: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
    probabilisticPrediction: true,
  });

  const analysis = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });

    FairSpecialBosses.resetPublicShowdownModel();
    state.handNumber = 77;
    state.handOver = true;
    state.board = [
      card("2", 2, "c"),
      card("3", 3, "d"),
      card("4", 4, "h"),
      card("9", 9, "s"),
      card("K", 13, "d"),
    ];
    Object.assign(state.players[0], {
      cards: [card("A", 14, "s"), card("Q", 12, "s")],
      folded: false,
      totalContribution: 160,
      lastAction: "raise",
    });
    state.heroCurrentHand = {
      putMoney: true,
      raised: true,
      allIn: false,
      folded: false,
      checked: false,
      called: true,
      completed: true,
    };
    const recorded = FairSpecialBosses.recordPublicShowdown();
    const model = FairSpecialBosses.publicShowdownModel();

    state.handOver = false;
    state.board = [card("2", 2, "c"), card("3", 3, "d"), card("4", 4, "h")];
    state.deck = [card("A", 14, "h"), card("K", 13, "h"), card("Q", 12, "h")];
    state.pot = 240;
    state.currentBet = 80;
    state.heroStyle = {
      hands: 10,
      vpip: 7,
      raises: 3,
      calls: 5,
      checks: 2,
      folds: 4,
      allIns: 1,
      showdowns: 2,
      wins: 1,
    };
    state.heroCurrentHand = {
      putMoney: true,
      raised: true,
      allIn: false,
      folded: false,
      checked: false,
      called: false,
    };
    Object.assign(state.players[0], {
      bet: 80,
      totalContribution: 120,
      folded: false,
      lastAction: "raise",
    });

    const profile = AI_ROSTER.find(candidate => candidate.name === "Oracle");
    const oracle = {
      ...state.players[1],
      ...profile,
      name: "Oracle",
      cards: [card("A", 14, "c"), card("K", 13, "c")],
      stack: 1800,
      bet: 20,
      totalContribution: 20,
      folded: false,
      allIn: false,
      raiseLocked: false,
      position: 1,
    };
    const context = FairSpecialBosses.publicContext(oracle);
    const equity = FairSpecialBosses.estimateFairEquity(oracle, { samples: 32 });
    const decision = FairSpecialBosses.chooseDecision(oracle);
    const rangeTotal = Object.values(context.inferredRange).reduce((sum, value) => sum + value, 0);

    return {
      recorded,
      model,
      projected: AiTierBossSystem.projectedBoard().map(cardValue => `${cardValue.label}${cardValue.suit}`),
      context,
      rangeTotal,
      equity,
      decision: {
        action: decision.action,
        equity: decision.equity,
        hasDeck: Object.hasOwn(decision.context, "deck"),
        hasOpponentCards: Object.hasOwn(decision.context, "opponentCards"),
        hasFutureBoard: Object.hasOwn(decision.context, "futureBoard"),
      },
      habits: FairSpecialBosses.heroHabits(),
    };
  });

  expect(analysis.recorded).toBe(true);
  expect(analysis.model.samples).toHaveLength(1);
  expect(analysis.model.samples[0]).toMatchObject({
    handNumber: 77,
    bucket: "premium",
    raised: true,
    called: true,
    cards: [
      { value: 14, suit: "s" },
      { value: 12, suit: "s" },
    ],
  });
  expect(analysis.projected).toEqual(["2c", "3d", "4h"]);
  expect(analysis.context.board).toEqual([
    { value: 2, suit: "c" },
    { value: 3, suit: "d" },
    { value: 4, suit: "h" },
  ]);
  expect(analysis.context.ownCards).toEqual([
    { value: 14, suit: "c" },
    { value: 13, suit: "c" },
  ]);
  expect(analysis.context.publicShowdownSamples).toBe(1);
  expect(analysis.rangeTotal).toBeCloseTo(1, 8);
  expect(analysis.context.inferredRange.premium).toBeGreaterThan(0.08);
  expect(analysis.equity).toBeGreaterThanOrEqual(0.02);
  expect(analysis.equity).toBeLessThanOrEqual(0.98);
  expect(analysis.decision.hasDeck).toBe(false);
  expect(analysis.decision.hasOpponentCards).toBe(false);
  expect(analysis.decision.hasFutureBoard).toBe(false);
  expect(["fold", "call", "raise"]).toContain(analysis.decision.action);
  expect(analysis.decision.equity).toBeGreaterThanOrEqual(0.01);
  expect(analysis.decision.equity).toBeLessThanOrEqual(0.99);
  expect(analysis.habits).toMatchObject({
    sample: 10,
    foldRate: 0.4,
    callRate: 0.5,
    raiseRate: 0.3,
    allInRate: 0.1,
    vpipRate: 0.7,
    showdownRate: 0.2,
    publicShowdowns: 1,
  });

  await page.evaluate(() => {
    const profile = AI_ROSTER.find(candidate => candidate.name === "Oracle");
    Object.assign(state.players[1], profile, {
      name: "Oracle",
      position: 1,
      isHuman: false,
      status: "新加入",
      stack: Math.max(1, state.players[1].stack),
    });
    state.selectedProfilePosition = 1;
    render();
    AiTierBossSystem.refresh();
    FairSpecialBosses.refresh();
  });

  const seat = page.locator('.seat[data-profile-position="1"]');
  const panel = page.locator("#aiProfilePanel");
  await expect(seat).toHaveClass(/is-special-boss-character/);
  await expect(seat).toHaveClass(/special-oracle/);
  await expect(panel.locator(".ai-tier-label")).toHaveText("特殊 BOSS");
  await expect(panel.locator(".ai-tier-stars")).toHaveAttribute("aria-label", "難度 7 / 7 星");
  await expect(panel.locator(".ai-profile-summary")).toContainText("曾攤牌公開");
  await expect(page.locator("#specialBossArrivalBanner")).toContainText("公開攤牌");
});
