import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];

  page.on("pageerror", error => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });

  page.on("requestfailed", request => {
    issues.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });

  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.endsWith("/favicon.ico")) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return issues;
}

function attachedBetGeometry() {
  const element = document.querySelector(".seat.has-street-bet .seat-street-bet");
  const seat = element?.closest(".seat");
  const header = seat?.querySelector(".seat-header");
  const betRect = element?.getBoundingClientRect();
  const headerRect = header?.getBoundingClientRect();
  const seatRect = seat?.getBoundingClientRect();
  const styles = element ? getComputedStyle(element) : null;

  return {
    connected: Boolean(element?.isConnected && seat?.isConnected && header?.isConnected),
    visible: Boolean(betRect && betRect.width > 0 && betRect.height > 0),
    verticalGap: betRect && headerRect ? Math.abs(betRect.top - headerRect.bottom) : 999,
    widthRatio: betRect && seatRect?.width ? betRect.width / seatRect.width : 0,
    borderTopWidth: Number.parseFloat(styles?.borderTopWidth || "0"),
    radius: styles?.borderBottomLeftRadius || "0",
  };
}

test("頂部設定會收合且本輪下注會貼合玩家資訊卡", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);

  await expect.poll(
    () => page.evaluate(() => window.TopbarSeatPolish?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.1.0");

  const settingsButton = page.locator("#settingsMenuButton");
  const settingsPanel = page.locator("#settingsMenuPanel");
  await expect(settingsButton).toBeVisible();
  await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
  await expect(settingsPanel).toBeHidden();

  await expect(page.locator(".top-bar-actions > button:visible")).toHaveCount(4);
  await expect(page.locator("#challengeModeButton")).toBeVisible();
  await expect(page.locator(".top-bar-actions > .topbar-settings > #settingsMenuButton:visible")).toHaveCount(1);

  await settingsButton.click();
  await expect(settingsButton).toHaveAttribute("aria-expanded", "true");
  await expect(settingsPanel).toBeVisible();
  await expect(settingsPanel.locator("#muteButton")).toBeVisible();
  await expect(settingsPanel.locator("#bgmButton")).toBeVisible();
  await expect(settingsPanel.locator("#audioVolumeButton")).toBeVisible();
  await expect(settingsPanel.locator("#themeButton")).toBeVisible();
  await expect(settingsPanel.locator("#cardStyleButton")).toBeVisible();
  await expect(settingsPanel.locator("#layoutButton")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(settingsPanel).toBeHidden();

  // Freeze the table and render one deterministic street bet. The normal game can
  // replace seat nodes between a visibility assertion and geometry measurement.
  await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer?.();
    clearDialogueTimers?.();
    state.autoNewHand = false;
    state.handOver = false;

    const player = state.players.find(candidate => !candidate?.isHuman) || state.players[1];
    player.folded = false;
    player.allIn = false;
    player.bet = Math.max(20, Number(player.bet) || 0);
    state.currentBet = Math.max(Number(state.currentBet) || 0, player.bet);
    render();
    window.TopbarSeatPolish?.refresh?.();
  });

  await expect.poll(
    () => page.evaluate(attachedBetGeometry),
    { timeout: 10_000 },
  ).toMatchObject({
    connected: true,
    visible: true,
  });

  await expect.poll(
    () => page.evaluate(attachedBetGeometry).then(geometry => geometry.widthRatio),
    { timeout: 10_000 },
  ).toBeGreaterThan(0.82);

  const geometry = await page.evaluate(attachedBetGeometry);

  // Chromium and WebKit both render the intended shadow seam at a stable 3px.
  expect(geometry.verticalGap).toBeLessThanOrEqual(3);
  expect(geometry.widthRatio).toBeGreaterThan(0.82);
  expect(geometry.borderTopWidth).toBe(0);
  expect(Number.parseFloat(geometry.radius)).toBeGreaterThanOrEqual(7);

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
