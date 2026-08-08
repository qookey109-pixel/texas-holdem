import { expect, test } from "@playwright/test";

test("G1 同手雙淘汰會依前一位補位後的桌面籌碼依序計算", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.version || ""),
    { timeout: 10_000 },
  ).toBe("2.1.0");

  await page.evaluate(() => {
    TournamentMode.setMode("tournament");
    state.autoNewHand = false;
    ReplacementStackBalance.clearDiagnostics();
  });
  await expect.poll(() => page.evaluate(() => TournamentMode.isActive())).toBe(true);

  const result = await page.evaluate(() => {
    state.players.forEach(player => {
      player.stack = 2000;
      player.bet = 0;
      player.allIn = false;
    });
    state.players[5].stack = 0;
    state.players[5].allIn = true;
    state.players[6].stack = 0;
    state.players[6].allIn = true;
    state.handOver = true;
    state.waitingForHuman = false;
    startHand();

    const diagnostics = ReplacementStackBalance.diagnostics().slice(-2);
    return {
      diagnostics,
      replacements: diagnostics.map(entry => {
        const player = state.players.find(candidate => candidate.name === entry.name);
        return {
          name: entry.name,
          totalStack: (player?.stack || 0) + (player?.bet || 0),
        };
      }),
    };
  });

  expect(result.diagnostics).toHaveLength(2);
  expect(result.diagnostics.map(entry => entry.tier)).toEqual(["middle", "middle"]);
  expect(result.diagnostics[1].currentTableBb).toBeGreaterThan(
    result.diagnostics[0].currentTableBb,
  );
  expect(result.diagnostics.every(entry => entry.actualEntryBb >= 80)).toBe(true);
  expect(result.replacements.map(entry => entry.totalStack)).toEqual(
    result.diagnostics.map(entry => entry.stack),
  );
});

test("G1 第 2 級高籌碼桌的 Momo 補位仍保底 80BB", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.()),
    { timeout: 10_000 },
  ).toBe(true);

  const plan = await page.evaluate(() => ReplacementStackBalance.calculateTournamentEntries(
    [
      { stack: 6450 },
      { stack: 2050 },
      { stack: 1990 },
      { stack: 1930 },
      { stack: 1570 },
      { stack: 465 },
    ],
    ["Momo"],
    { handNumber: 5 },
  )[0]);

  expect(plan).toMatchObject({
    name: "Momo",
    tier: "middle",
    bigBlind: 30,
    actualEntryBb: 80,
    stack: 2400,
  });
});
