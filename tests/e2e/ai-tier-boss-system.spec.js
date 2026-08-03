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

test("特殊 Boss 只使用公開資訊、自己的底牌與玩家歷史習慣", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.FairSpecialBosses?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const bossData = await page.evaluate(() => ({
    oracle: AI_ROSTER.find(profile => profile.name === "Oracle"),
    chronos: AI_ROSTER.find(profile => profile.name === "Chronos"),
    oracleMeta: AI_PROFILE_META.Oracle,
    chronosMeta: AI_PROFILE_META.Chronos,
    decisionInstalled: Boolean(window.__fairSpecialBossDecisionInstalled),
  }));

  expect(bossData.oracle).toMatchObject({
    emoji: "🔮",
    isSpecialBoss: true,
    fairPlay: true,
    playerModeling: true,
    publicInformationOnly: true,
    tierStars: 7,
  });
  expect(bossData.oracle.omniscient).toBeUndefined();
  expect(bossData.chronos).toMatchObject({
    emoji: "⏳",
    isSpecialBoss: true,
    fairPlay: true,
    playerModeling: true,
    publicInformationOnly: true,
    tierStars: 7,
  });
  expect(bossData.chronos.omniscient).toBeUndefined();
  expect(bossData.oracleMeta.summary).toContain("公開行動紀錄");
  expect(bossData.oracleMeta.traits.join(" ")).toContain("不讀取玩家隱藏底牌");
  expect(bossData.chronosMeta.summary).toContain("範圍");
  expect(bossData.chronosMeta.traits.join(" ")).toContain("不預知任何未發出的牌");
  expect(bossData.decisionInstalled).toBe(true);

  const analysis = await page.evaluate(() => {
    const card = (label, value, suit) => ({
      label,
      value,
      suit,
      suitSymbol: { s: "♠", h: "♥", d: "♦", c: "♣" }[suit],
    });
    state.board = [card("2", 2, "c"), card("3", 3, "d"), card("4", 4, "h")];
    state.deck = [card("A", 14, "s"), card("9", 9, "c"), card("K", 13, "s"), card("Q", 12, "d")];
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
    const profile = AI_ROSTER.find(candidate => candidate.name === "Oracle");
    const oracle = {
      ...state.players[1],
      ...profile,
      name: "Oracle",
      cards: [card("A", 14, "c"), card("K", 13, "c")],
      stack: 1800,
      bet: 0,
      folded: false,
      allIn: false,
      raiseLocked: false,
      position: 1,
    };
    const context = FairSpecialBosses.publicContext(oracle);
    const decision = FairSpecialBosses.chooseDecision(oracle);
    return {
      projected: AiTierBossSystem.projectedBoard().map(cardValue => `${cardValue.label}${cardValue.suit}`),
      context,
      decision: {
        action: decision.action,
        hasDeck: Object.hasOwn(decision.context, "deck"),
        hasOpponentCards: Object.hasOwn(decision.context, "opponentCards"),
      },
      habits: FairSpecialBosses.heroHabits(),
    };
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
  expect(analysis.decision.hasDeck).toBe(false);
  expect(analysis.decision.hasOpponentCards).toBe(false);
  expect(["fold", "call", "raise"]).toContain(analysis.decision.action);
  expect(analysis.habits).toMatchObject({
    sample: 10,
    foldRate: 0.4,
    callRate: 0.5,
    raiseRate: 0.3,
    allInRate: 0.1,
    vpipRate: 0.7,
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
  await expect(panel.locator(".ai-profile-summary")).toContainText("公開行動紀錄");
  await expect(page.locator("#specialBossArrivalBanner")).toContainText("公開紀錄、玩家習慣");
});
