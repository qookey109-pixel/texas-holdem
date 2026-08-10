import { expect, test } from "@playwright/test";

async function loadUi(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.() === true),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    window.__longSessionUiProductionRefs = {
      startHand,
      showdown,
      awardPot,
      finishShowdown,
      buildNextAiSeats,
      normalPlan: window.ReplacementStackBalance.calculateNormalReplacementPlan,
    };
    window.__longSessionUiRuntimeBefore = {
      handOver: state.handOver,
      handNumber: state.handNumber,
      gameMode: state.gameMode || "normal",
      blindLevel: { ...state.blindLevel },
      playerStacks: state.players.map(player => player.stack),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    };
  });

  await page.addScriptTag({ url: "/tests/support/long-session-transition-ui-v1.js" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionTransitionUiPrototypeV1?.version || ""),
  ).toBe("0.1.0");
}

function moveUpModel() {
  return {
    transition: "move-up",
    currentTable: { index: 0, key: "table-1", smallBlind: 10, bigBlind: 20, entry: 2000 },
    nextTable: { index: 1, key: "table-2", smallBlind: 20, bigBlind: 40, entry: 4000 },
    totalWealth: 4300,
    bankrollAfter: 300,
    aiEntry: 4000,
  };
}

test("UI prototype injection is inert and does not mutate the running game", async ({ page }) => {
  await loadUi(page);

  const result = await page.evaluate(model => {
    const api = window.LongSessionTransitionUiPrototypeV1;
    const before = JSON.stringify(window.__longSessionUiRuntimeBefore);
    api.render(model);
    const afterRuntime = {
      handOver: state.handOver,
      handNumber: state.handNumber,
      gameMode: state.gameMode || "normal",
      blindLevel: { ...state.blindLevel },
      playerStacks: state.players.map(player => player.stack),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    };
    return {
      before,
      after: JSON.stringify(afterRuntime),
      identities: {
        startHand: startHand === window.__longSessionUiProductionRefs.startHand,
        showdown: showdown === window.__longSessionUiProductionRefs.showdown,
        awardPot: awardPot === window.__longSessionUiProductionRefs.awardPot,
        finishShowdown: finishShowdown === window.__longSessionUiProductionRefs.finishShowdown,
        buildNextAiSeats: buildNextAiSeats === window.__longSessionUiProductionRefs.buildNextAiSeats,
        normalPlan:
          window.ReplacementStackBalance.calculateNormalReplacementPlan
          === window.__longSessionUiProductionRefs.normalPlan,
      },
      scope: api.scope,
    };
  }, moveUpModel());

  expect(result.scope).toBe("test-only-ui");
  expect(result.after).toBe(result.before);
  expect(result.identities).toEqual({
    startHand: true,
    showdown: true,
    awardPot: true,
    finishShowdown: true,
    buildNextAiSeats: true,
    normalPlan: true,
  });
});

test("move-up screen explains total wealth, 100BB table entry, bankroll remainder, and equal AI entry", async ({ page }, testInfo) => {
  await loadUi(page);
  await page.evaluate(model => window.LongSessionTransitionUiPrototypeV1.render(model), moveUpModel());

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "解鎖更高級別牌桌" })).toBeVisible();
  await expect(dialog).toContainText("10/20");
  await expect(dialog).toContainText("20/40");
  await expect(dialog).toContainText("你的總資產");
  await expect(dialog.locator("[data-ls-total]")).toHaveText("4,300");
  await expect(dialog.locator("[data-ls-entry]")).toHaveText("4,000 · 100BB");
  await expect(dialog.locator("[data-ls-bankroll]")).toHaveText("300");
  await expect(dialog.locator("[data-ls-ai]")).toHaveText("4,000 / 位 · 100BB");
  await expect(dialog).toContainText("不會因為 Hero 贏很多就偷偷替 AI 加籌碼");
  await expect(page.getByRole("button", { name: "升級到 20/40" })).toBeFocused();

  await page.screenshot({
    path: `long-session-transition-ui-artifacts/move-up-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("primary and secondary actions are explicit but never call production game functions", async ({ page }) => {
  await loadUi(page);
  await page.evaluate(model => window.LongSessionTransitionUiPrototypeV1.render(model), moveUpModel());

  const result = await page.evaluate(() => {
    const capture = () => ({
      handNumber: state.handNumber,
      handOver: state.handOver,
      playerStacks: state.players.map(player => player.stack),
    });
    const before = capture();
    document.querySelector('[data-ls-action="primary"]')?.click();
    document.querySelector('[data-ls-action="secondary"]')?.click();
    const after = capture();
    const snapshot = window.LongSessionTransitionUiPrototypeV1.snapshot();
    return { before, after, snapshot };
  });

  expect(result.snapshot.lastAction).toBe("secondary");
  expect(result.snapshot.actionLog.slice(-2).map(entry => ({
    action: entry.action,
    transition: entry.transition,
  }))).toEqual([
    { action: "primary", transition: "move-up" },
    { action: "secondary", transition: "move-up" },
  ]);
  expect(result.after).toEqual(result.before);
});

test("re-entry and insufficient-bankroll screens use unambiguous player-facing language", async ({ page }, testInfo) => {
  await loadUi(page);

  await page.evaluate(() => window.LongSessionTransitionUiPrototypeV1.render({
    transition: "reentry",
    currentTable: { index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 },
    nextTable: { index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 },
    totalWealth: 15000,
    bankrollAfter: 5000,
    aiEntry: 10000,
  }));

  let dialog = page.getByRole("dialog");
  await expect(page.getByRole("heading", { name: "重新買入，繼續挑戰" })).toBeVisible();
  await expect(dialog.locator("[data-ls-entry]")).toHaveText("10,000 · 100BB");
  await expect(dialog.locator("[data-ls-bankroll]")).toHaveText("5,000");
  await expect(page.getByRole("button", { name: "重新買入 50/100" })).toBeVisible();

  await page.evaluate(() => window.LongSessionTransitionUiPrototypeV1.render({
    transition: "session-ended",
    currentTable: { index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 },
    nextTable: { index: 2, key: "table-3", smallBlind: 50, bigBlind: 100, entry: 10000 },
    totalWealth: 9000,
    bankrollAfter: 9000,
  }));

  dialog = page.getByRole("dialog");
  await expect(page.getByRole("heading", { name: "Long Session 本輪結束" })).toBeVisible();
  await expect(dialog).toContainText("不足以支付這個級別的標準買入");
  await expect(dialog.locator("[data-ls-total]")).toHaveText("9,000");
  await expect(dialog.locator("[data-ls-bankroll]")).toHaveText("9,000");
  await expect(page.getByRole("button", { name: "返回模式選擇" })).toBeVisible();

  await page.screenshot({
    path: `long-session-transition-ui-artifacts/session-ended-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("mobile landscape keeps the complete decision surface visible and tappable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await loadUi(page);
  await page.evaluate(model => window.LongSessionTransitionUiPrototypeV1.render(model), moveUpModel());

  const dialog = page.getByRole("dialog", { name: "解鎖更高級別牌桌" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "解鎖更高級別牌桌" })).toBeVisible();
  await expect(dialog).toContainText("10/20");
  await expect(dialog).toContainText("20/40");
  await expect(dialog.locator("[data-ls-total]")).toBeVisible();
  await expect(dialog.locator("[data-ls-entry]")).toBeVisible();
  await expect(dialog.locator("[data-ls-bankroll]")).toBeVisible();
  await expect(dialog.locator("[data-ls-ai]")).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollTop)).toBe(0);

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(844);
  expect(box.y + box.height).toBeLessThanOrEqual(390);

  const primary = page.getByRole("button", { name: "升級到 20/40" });
  const secondary = page.getByRole("button", { name: "留在 10/20" });
  await expect(primary).toBeVisible();
  await expect(secondary).toBeVisible();
  const primaryBox = await primary.boundingBox();
  const secondaryBox = await secondary.boundingBox();
  expect(primaryBox.height).toBeGreaterThanOrEqual(44);
  expect(secondaryBox.height).toBeGreaterThanOrEqual(44);

  await page.screenshot({
    path: `long-session-transition-ui-artifacts/mobile-landscape-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
