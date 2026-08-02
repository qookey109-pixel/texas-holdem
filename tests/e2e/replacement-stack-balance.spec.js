import { expect, test } from "@playwright/test";

test("新進角色使用桌均比例籌碼且初始角色維持完整買入", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.()),
  ).toBe(true);

  const initialStacks = await page.evaluate(() => state.players.slice(1).map(player => player.stack + player.bet));
  expect(initialStacks).toEqual([2000, 2000, 2000, 2000, 2000, 2000]);

  const levelOneTarget = await page.evaluate(() => {
    state.handNumber = 1;
    state.blindLevel = blindLevelForHand(1);
    return ReplacementStackBalance.calculate([
      { stack: 2000 },
      { stack: 2000 },
      { stack: 2000 },
      { stack: 2000 },
      { stack: 2000 },
      { stack: 2000 },
    ]);
  });
  expect(levelOneTarget).toBe(800);

  const levelTwoTarget = await page.evaluate(() => {
    state.handNumber = 10;
    state.blindLevel = blindLevelForHand(10);
    return ReplacementStackBalance.calculate([
      { stack: 2000 },
      { stack: 2000 },
      { stack: 2000 },
    ]);
  });
  expect(levelTwoTarget).toBe(1400);

  const shortLateTarget = await page.evaluate(() => {
    state.handNumber = 25;
    state.blindLevel = blindLevelForHand(25);
    return ReplacementStackBalance.calculate([
      { stack: 4000 },
      { stack: 4000 },
    ]);
  });
  expect(shortLateTarget).toBe(4000);
});

test("一般模式與挑戰賽補位角色都使用平衡籌碼", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.()),
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
      stack: player?.stack || 0,
    };
  });

  expect(normalReplacement).toEqual({
    name: "Ace",
    stack: 800,
  });

  await page.evaluate(() => {
    TournamentMode.setMode("tournament");
    state.autoNewHand = false;
  });

  await expect.poll(
    () => page.evaluate(() => TournamentMode.isActive()),
  ).toBe(true);

  const tournamentReplacement = await page.evaluate(() => {
    state.players.forEach(player => {
      player.stack = 2000;
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
      stack: player?.stack || 0,
    };
  });

  expect(["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"]).toContain(
    tournamentReplacement.name,
  );
  expect(tournamentReplacement.stack).toBe(800);
});
