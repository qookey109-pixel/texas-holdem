import { expect, test } from "@playwright/test";

test("一般模式使用中位數補位策略，淘汰賽 G1 與公平重買入模組完成安裝", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.1.0");
  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.()),
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.EconomyFoldDefenseV1?.status?.().installed === true),
  ).toBe(true);

  const initialStacks = await page.evaluate(
    () => state.players.slice(1).map(player => player.stack + player.bet),
  );
  expect(initialStacks).toEqual([2000, 2000, 2000, 2000, 2000, 2000]);

  const normalTargets = await page.evaluate(() => {
    state.handNumber = 1;
    state.blindLevel = blindLevelForHand(1);
    const levelOne = ReplacementStackBalance.calculate(Array.from({ length: 6 }, () => ({ stack: 2000 })));

    state.handNumber = 10;
    state.blindLevel = blindLevelForHand(10);
    const levelTwo = ReplacementStackBalance.calculate(Array.from({ length: 3 }, () => ({ stack: 2000 })));

    state.handNumber = 25;
    state.blindLevel = blindLevelForHand(25);
    const shortLate = ReplacementStackBalance.calculate([{ stack: 4000 }, { stack: 4000 }]);

    const healthyPlan = ReplacementStackBalance.calculateNormalReplacementPlan(
      Array.from({ length: 6 }, () => ({ stack: 2000 })),
      { bigBlind: 20, buyIn: 2000 },
    );
    const chipLeaderOutlierPlan = ReplacementStackBalance.calculateNormalReplacementPlan([
      { stack: 16000 },
      { stack: 500 },
      { stack: 500 },
      { stack: 500 },
      { stack: 500 },
      { stack: 500 },
    ], { bigBlind: 20, buyIn: 2000 });
    const veryShortTablePlan = ReplacementStackBalance.calculateNormalReplacementPlan([
      { stack: 100 },
      { stack: 100 },
    ], { bigBlind: 20, buyIn: 2000 });

    return {
      levelOne,
      levelTwo,
      shortLate,
      healthyPlan,
      chipLeaderOutlierPlan,
      veryShortTablePlan,
      normalConfig: ReplacementStackBalance.normalConfig,
      normalDataset: document.documentElement.dataset.normalEconomy,
      blindWrapped: blindLevelForHand.__tournamentEconomyG1 === true,
      buyInWrapped: Boolean(
        currentBuyIn.__economyFoldDefenseCatchup === true
        && currentBuyIn.__original?.__tournamentEconomyG1 === true
      ),
      economyInstalled: window.EconomyFoldDefenseV1?.status?.().installed === true,
    };
  });

  expect(normalTargets.levelOne).toBe(1200);
  expect(normalTargets.levelTwo).toBe(1600);
  expect(normalTargets.shortLate).toBe(4000);
  expect(normalTargets.normalConfig).toEqual({
    version: "2.0.0",
    strategy: "median-v2",
    tableMedianRatio: 0.8,
    buyInRatioCap: 0.75,
    softFloorBigBlinds: 12,
    maxBigBlinds: 60,
  });
  expect(normalTargets.normalDataset).toBe("median-v2");
  expect(normalTargets.healthyPlan).toMatchObject({
    strategy: "median-v2",
    tableMedian: 2000,
    stack: 1200,
    actualEntryBb: 60,
  });
  expect(normalTargets.chipLeaderOutlierPlan).toMatchObject({
    tableMedian: 500,
    stack: 400,
    actualEntryBb: 20,
  });
  expect(normalTargets.veryShortTablePlan).toMatchObject({
    tableMedian: 100,
    stack: 100,
    actualEntryBb: 5,
  });
  expect(normalTargets.blindWrapped).toBe(true);
  expect(normalTargets.buyInWrapped).toBe(true);
  expect(normalTargets.economyInstalled).toBe(true);

  const tournamentConfig = await page.evaluate(() => ({
    ...ReplacementStackBalance.tournamentConfig,
    roleProfiles: ReplacementStackBalance.tournamentConfig.roleProfiles,
    level85: ReplacementStackBalance.tournamentBlindLevelForHand(85),
    level100: ReplacementStackBalance.tournamentBlindLevelForHand(100),
    level155: ReplacementStackBalance.tournamentBlindLevelForHand(155),
  }));

  expect(tournamentConfig.name).toBe("G1");
  expect(tournamentConfig.fullTableTargetBb).toBe(170);
  expect(tournamentConfig.blendResponse).toBe(0.15);
  expect(tournamentConfig.theoreticalReplacementCeilingBb).toBe(660);
  expect(tournamentConfig.roleProfiles.special).toEqual({ min: 35, target: 45, max: 60 });
  expect(tournamentConfig.level85.big).toBe(16000);
  expect(tournamentConfig.level100.big).toBe(24000);
  expect(tournamentConfig.level155.big).toBe(160000);
});

test("一般模式玩家與 AI 使用相同 median-v2 重買入，挑戰賽補位維持 G1 動態 BB", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.EconomyFoldDefenseV1?.status?.().installed === true),
    { timeout: 10_000 },
  ).toBe(true);

  const normalReplacement = await page.evaluate(() => {
    state.autoNewHand = false;
    state.handNumber = 1;
    state.blindLevel = blindLevelForHand(1);
    state.handOver = true;
    state.waitingForHuman = false;
    state.players.forEach(player => {
      player.stack = 2000;
      player.allIn = false;
    });
    state.players[6].stack = 0;
    state.players[6].allIn = true;
    startHand();

    const player = state.players.find(candidate => candidate.name === "Ace");
    return {
      name: player?.name || "",
      totalStack: (player?.stack || 0) + (player?.bet || 0),
      expectedStack: EconomyFoldDefenseV1.calculateNormalRebuy([
        { stack: 2000 },
        { stack: 2000 },
        { stack: 2000 },
        { stack: 2000 },
        { stack: 2000 },
        { stack: 2000 },
        { stack: 0 },
      ], { bigBlind: 20, buyIn: 2000 }),
      source: EconomyFoldDefenseV1.status().normalRebuySource,
    };
  });

  expect(normalReplacement).toEqual({
    name: "Ace",
    totalStack: 1200,
    expectedStack: 1200,
    source: "median-v2",
  });

  await page.evaluate(() => {
    TournamentMode.setMode("tournament");
    state.autoNewHand = false;
    ReplacementStackBalance.clearDiagnostics();
  });

  await expect.poll(() => page.evaluate(() => TournamentMode.isActive())).toBe(true);

  const tournamentReplacement = await page.evaluate(() => {
    state.players.forEach(player => {
      player.stack = 2000;
      player.bet = 0;
      player.allIn = false;
    });
    state.players[6].stack = 0;
    state.players[6].allIn = true;
    state.handOver = true;
    state.waitingForHuman = false;
    startHand();

    const openingNames = new Set(["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"]);
    const player = state.players.find(
      candidate => !candidate.isHuman && !openingNames.has(candidate.name),
    );
    return {
      name: player?.name || "",
      totalStack: (player?.stack || 0) + (player?.bet || 0),
      bigBlind: state.blindLevel.big,
      economy: state.blindLevel.tournamentEconomy,
      diagnostic: ReplacementStackBalance.diagnostics().at(-1) || null,
    };
  });

  expect(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]).toContain(
    tournamentReplacement.name,
  );
  expect(tournamentReplacement.totalStack).toBe(500);
  expect(tournamentReplacement.bigBlind).toBe(20);
  expect(tournamentReplacement.economy).toBe("G1");
  expect(tournamentReplacement.diagnostic).toMatchObject({
    tier: "middle",
    bigBlind: 20,
    actualEntryBb: 25,
    stack: 500,
    fullTableTargetBb: 170,
  });
});

test("G1 依正式 19 位角色階級計算多位補位", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.()),
    { timeout: 10_000 },
  ).toBe(true);

  const plans = await page.evaluate(() => ReplacementStackBalance.calculateTournamentEntries(
    [
      { stack: 8000 },
      { stack: 6000 },
      { stack: 4000 },
      { stack: 0 },
    ],
    ["Ace", "Vlad", "Oracle", "Chronos", "Gemini"],
    { handNumber: 55 },
  ));

  expect(plans.map(plan => plan.tier)).toEqual([
    "middle",
    "elite",
    "special",
    "special",
    "gemini",
  ]);
  expect(plans.every(plan => plan.bigBlind === 2400)).toBe(true);

  const bounds = {
    middle: [25, 45],
    elite: [30, 50],
    special: [35, 60],
    gemini: [40, 70],
  };
  for (const plan of plans) {
    expect(plan.actualEntryBb).toBeGreaterThanOrEqual(bounds[plan.tier][0]);
    expect(plan.actualEntryBb).toBeLessThanOrEqual(bounds[plan.tier][1]);
    expect(plan.stack).toBeGreaterThan(0);
  }
  expect(plans[1].currentTableBb).toBeGreaterThan(plans[0].currentTableBb);
  expect(plans[4].name).toBe("Gemini");
});
