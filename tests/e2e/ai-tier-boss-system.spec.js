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

test("特殊 Boss 只使用公開紀錄、範圍推理與公平七星策略", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.FairSpecialBossStrategy?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.0.0");

  const bossData = await page.evaluate(() => ({
    oracle: AI_ROSTER.find(profile => profile.name === "Oracle"),
    chronos: AI_ROSTER.find(profile => profile.name === "Chronos"),
    oracleMeta: aiProfileMeta(AI_ROSTER.find(profile => profile.name === "Oracle")),
    chronosMeta: aiProfileMeta(AI_ROSTER.find(profile => profile.name === "Chronos")),
    fairAudit: FairSpecialBossStrategy.fairnessAudit(),
    projectedBoardType: typeof AiTierBossSystem.projectedBoard,
    decisionInstalled: Boolean(window.__fairSpecialBossDecisionInstalled),
    fairStyleCount: document.querySelectorAll("#fairSpecialBossStylesV2").length,
  }));

  expect(bossData.oracle).toMatchObject({
    emoji: "🔮",
    isSpecialBoss: true,
    omniscient: false,
    usesHiddenInformation: false,
    fairPlay: true,
    tierStars: 7,
  });
  expect(bossData.chronos).toMatchObject({
    emoji: "⏳",
    isSpecialBoss: true,
    omniscient: false,
    usesHiddenInformation: false,
    fairPlay: true,
    tierStars: 7,
  });
  expect(bossData.oracleMeta.summary).toContain("已公開");
  expect(bossData.oracleMeta.summary).toContain("玩家累積習慣");
  expect(bossData.oracleMeta.summary).not.toContain("未公開底牌");
  expect(bossData.oracleMeta.summary).not.toContain("牌順序");
  expect(bossData.chronosMeta.traits.join(" ")).toContain("範圍");
  expect(bossData.chronosMeta.traits.join(" ")).toContain("不知道任何未公開卡牌");
  expect(bossData.fairAudit).toMatchObject({
    fairPlay: true,
    usesHiddenInformation: false,
    readsDeck: false,
    readsOpponentCards: false,
    readsFutureBoard: false,
  });
  expect(bossData.projectedBoardType).toBe("undefined");
  expect(bossData.decisionInstalled).toBe(true);
  expect(bossData.fairStyleCount).toBe(1);

  const analysis = await page.evaluate(() => {
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
    return FairSpecialBossStrategy.publicPlayerModel();
  });

  expect(analysis).toMatchObject({
    sample: 10,
    foldRate: 0.4,
    callRate: 0.5,
    raiseRate: 0.3,
    allInRate: 0.1,
    vpipRate: 0.7,
  });
  expect(analysis.confidence).toBeGreaterThan(0.8);

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
    FairSpecialBossStrategy.refresh();
  });

  const seat = page.locator('.seat[data-profile-position="1"]');
  const panel = page.locator("#aiProfilePanel");
  await expect(seat).toHaveClass(/is-special-boss-character/);
  await expect(seat).toHaveClass(/special-oracle/);
  await expect(panel).toHaveClass(/is-special-boss-character-profile/);
  await expect(panel.locator(".ai-tier-label")).toHaveText("特殊 BOSS");
  await expect(panel.locator(".ai-tier-stars")).toHaveAttribute("aria-label", "難度 7 / 7 星");
  await expect(panel.locator(".ai-tier-stars b")).toHaveText("★★★★★★★");
  await expect(panel.locator(".ai-profile-summary")).toContainText("已公開的牌面");
  await expect(panel.locator(".ai-profile-summary")).not.toContainText("未公開底牌");
});

test("特殊 Boss 策略分析不讀牌堆與其他玩家未公開底牌", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => Boolean(window.__fairSpecialBossDecisionInstalled)),
    { timeout: 10_000 },
  ).toBe(true);

  const result = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });
    const oracleProfile = AI_ROSTER.find(candidate => candidate.name === "Oracle");
    const oracle = state.players[1];
    Object.assign(oracle, oracleProfile, {
      name: "Oracle",
      isHuman: false,
      position: 1,
      cards: [card("A", 14, "s"), card("K", 13, "s")],
      stack: 1600,
      bet: 20,
      totalContribution: 20,
      folded: false,
      allIn: false,
      hasActed: false,
      raiseLocked: false,
      emotion: "calm",
      status: "準備行動",
    });
    state.board = [card("Q", 12, "s"), card("7", 7, "d"), card("2", 2, "c")];
    state.pot = 180;
    state.currentBet = 40;
    state.lastRaiseSize = 20;
    state.heroStyle = {
      hands: 14,
      vpip: 9,
      raises: 5,
      calls: 5,
      checks: 4,
      folds: 6,
      allIns: 1,
      showdowns: 4,
      wins: 2,
    };

    const originalDeck = state.deck;
    const opponentCards = state.players
      .filter(candidate => candidate !== oracle)
      .map(opponent => ({ opponent, cards: opponent.cards }));
    let analysis;
    let audit;

    try {
      for (const { opponent } of opponentCards) {
        Object.defineProperty(opponent, "cards", {
          configurable: true,
          enumerable: true,
          get() { throw new Error("Special Boss accessed hidden opponent cards"); },
        });
      }
      Object.defineProperty(state, "deck", {
        configurable: true,
        enumerable: true,
        get() { throw new Error("Special Boss accessed deck order"); },
        set() {},
      });

      analysis = FairSpecialBossStrategy.evaluateActions(oracle);
      audit = FairSpecialBossStrategy.fairnessAudit();
    } finally {
      Object.defineProperty(state, "deck", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: originalDeck,
      });
      for (const { opponent, cards } of opponentCards) {
        Object.defineProperty(opponent, "cards", {
          configurable: true,
          enumerable: true,
          writable: true,
          value: cards,
        });
      }
    }

    return {
      actionTypes: analysis.actions.map(action => action.type),
      audit,
    };
  });

  expect(result.actionTypes.length).toBeGreaterThan(0);
  expect(result.actionTypes.every(type => ["fold", "check", "call", "raise"].includes(type))).toBe(true);
  expect(result.audit).toMatchObject({
    fairPlay: true,
    usesHiddenInformation: false,
    readsDeck: false,
    readsOpponentCards: false,
    readsFutureBoard: false,
  });
  expect(result.audit.lastDecision).toMatchObject({
    boss: "Oracle",
    readsDeck: false,
    readsOpponentCards: false,
    readsFutureBoard: false,
  });
});
