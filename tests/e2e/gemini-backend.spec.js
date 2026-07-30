import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", request => {
    const url = request.url();
    if (!url.includes("gemini-worker.example")) {
      issues.push(`request failed: ${url} (${request.failure()?.errorText || "unknown"})`);
    }
  });
  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.endsWith("/favicon.ico")) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return issues;
}

test("Gemini Boss 會透過安全後端決策且不傳送其他玩家底牌", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  const decisionRequests = [];

  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemGeminiEndpointV1", "https://gemini-worker.example");
    localStorage.removeItem("texasHoldemGeminiBossModeV1");
  });

  await page.route("https://gemini-worker.example/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        service: "texas-holdem-gemini",
        configured: true,
        model: "gemini-3.6-flash",
      }),
    });
  });

  await page.route("https://gemini-worker.example/v1/decision", async route => {
    const request = route.request().postDataJSON();
    decisionRequests.push(request);
    const legal = request.legalActions;
    const action = legal.includes("call")
      ? "call"
      : legal.includes("check")
        ? "check"
        : legal.includes("fold")
          ? "fold"
          : "all_in";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        model: "gemini-3.6-flash",
        interactionId: "interaction-test-1",
        decision: {
          action,
          raiseTo: 0,
          dialogue: "終局運算完成。",
          emotion: "confident",
          reason: "依照公開底池價格與有效籌碼繼續。",
        },
      }),
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.GeminiBackendClient?.version || ""),
    { timeout: 8_000 },
  ).toBe("1.1.0");
  await expect.poll(
    () => page.evaluate(() => window.GeminiAsyncBettingLoop?.version || ""),
    { timeout: 8_000 },
  ).toBe("1.0.0");

  const health = await page.evaluate(() => GeminiBackendClient.testConnection());
  expect(health).toMatchObject({ configured: true, model: "gemini-3.6-flash" });
  await expect(page.locator("#geminiBackendSettingsButton")).toHaveAttribute("data-connected", "true");

  await page.evaluate(() => GeminiFinalBoss.enable({ restart: true, persist: false }));
  await expect(page.locator(".seat.is-gemini-final-boss")).toHaveCount(1, { timeout: 8_000 });

  const result = await page.evaluate(async () => {
    const boss = state.players.find(player => player.name === "Gemini");
    state.pot = 120;
    state.currentBet = 20;
    boss.bet = 0;
    boss.stack = Math.max(200, boss.stack);
    boss.folded = false;
    boss.allIn = false;
    boss.hasActed = false;
    boss.raiseLocked = false;
    const stackBefore = boss.stack;
    await botAction(boss);
    return {
      lastAction: boss.lastAction,
      providerMode: boss.providerMode,
      emotion: boss.emotion,
      reason: boss.geminiDecisionReason,
      stackSpent: stackBefore - boss.stack,
      connection: GeminiBackendClient.status(),
    };
  });

  expect(result).toMatchObject({
    lastAction: "call",
    providerMode: "gemini-backend",
    emotion: "confident",
    reason: "依照公開底池價格與有效籌碼繼續。",
    stackSpent: 20,
  });
  expect(result.connection).toMatchObject({
    connected: true,
    mode: "gemini-backend",
    model: "gemini-3.6-flash",
  });

  expect(decisionRequests.length).toBeGreaterThan(0);
  const latest = decisionRequests.at(-1);
  expect(latest.holeCards).toHaveLength(2);
  expect(latest.board.length).toBeLessThanOrEqual(5);
  expect(latest.legalActions).toContain("call");
  expect(latest.players.length).toBe(7);
  for (const player of latest.players) {
    expect(player).not.toHaveProperty("cards");
    expect(player).not.toHaveProperty("holeCards");
  }

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
