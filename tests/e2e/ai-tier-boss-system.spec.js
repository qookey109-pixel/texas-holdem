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

test("特殊 Boss 使用全知資料、七星外觀與玩家習慣", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.AiTierBossSystem?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  const bossData = await page.evaluate(() => ({
    oracle: AI_ROSTER.find(profile => profile.name === "Oracle"),
    chronos: AI_ROSTER.find(profile => profile.name === "Chronos"),
    oracleMeta: AI_PROFILE_META.Oracle,
    chronosMeta: AI_PROFILE_META.Chronos,
    decisionInstalled: Boolean(window.__aiTierBossDecisionInstalled),
  }));

  expect(bossData.oracle).toMatchObject({
    emoji: "🔮",
    style: "Future Sight",
    isSpecialBoss: true,
    omniscient: true,
    tierStars: 7,
  });
  expect(bossData.chronos).toMatchObject({
    emoji: "⏳",
    style: "Timeline Control",
    isSpecialBoss: true,
    omniscient: true,
    tierStars: 7,
  });
  expect(bossData.oracleMeta.summary).toContain("未公開底牌");
  expect(bossData.oracleMeta.summary).toContain("公共牌順序");
  expect(bossData.chronosMeta.traits.join(" ")).toContain("最終牌型");
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
    return {
      board: AiTierBossSystem.projectedBoard().map(cardValue => `${cardValue.label}${cardValue.suit}`),
      habits: AiTierBossSystem.heroHabits(),
    };
  });

  expect(analysis.board).toEqual(["2c", "3d", "4h", "Qd", "Ks"]);
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
  });

  const seat = page.locator('.seat[data-profile-position="1"]');
  const panel = page.locator("#aiProfilePanel");
  await expect(seat).toHaveClass(/is-special-boss-character/);
  await expect(seat).toHaveClass(/special-oracle/);
  await expect(seat.locator(".ai-tier-seat-badge")).toContainText("OMNISCIENT EYE");
  await expect(panel).toHaveClass(/is-special-boss-character-profile/);
  await expect(panel.locator(".ai-tier-label")).toHaveText("特殊 BOSS");
  await expect(panel.locator(".ai-tier-stars")).toHaveAttribute("aria-label", "難度 7 / 7 星");
  await expect(panel.locator(".ai-tier-stars b")).toHaveText("★★★★★★★");
  await expect(page.locator("#specialBossArrivalBanner")).toContainText("Oracle｜全域預言者");
});
