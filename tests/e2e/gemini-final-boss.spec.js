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

test("Gemini 最終 Boss 預設安全後端並保留本地備援策略", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);

  await page.addInitScript(() => {
    localStorage.removeItem("texasHoldemGeminiBossModeV1");
    localStorage.removeItem("texasHoldemGeminiEndpointV1");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.GeminiFinalBoss?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.GeminiBackendClient?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.1.0");

  const defaultBackend = await page.evaluate(() => GeminiBackendClient.status());
  expect(defaultBackend).toMatchObject({
    configured: true,
    connected: false,
    mode: "backend-unverified",
    endpoint: "https://texas-holdem-gemini.q-oo109.workers.dev",
  });

  await page.evaluate(() => GeminiBackendClient.openSettings());
  await expect(page.locator("#geminiBackendEndpoint")).toHaveValue(
    "https://texas-holdem-gemini.q-oo109.workers.dev",
  );
  await expect(page.locator("#geminiBackendStatus")).toContainText("後端網址已設定");
  await page.evaluate(() => {
    GeminiBackendClient.closeSettings();
    GeminiBackendClient.configure("");
  });
  await expect.poll(
    () => page.evaluate(() => GeminiBackendClient.status().configured),
    { timeout: 5_000 },
  ).toBe(false);

  const registration = await page.evaluate(() => ({
    rosterName: AI_ROSTER.at(-1)?.name,
    title: AI_PROFILE_META.Gemini?.title,
    provider: GeminiFinalBoss.connection.provider,
    connected: GeminiFinalBoss.connection.connected,
    backendRequired: GeminiFinalBoss.connection.backendRequired,
  }));

  expect(registration).toEqual({
    rosterName: "Gemini",
    title: "終局雙生者",
    provider: "gemini",
    connected: false,
    backendRequired: true,
  });

  await expect(page.locator("#geminiBossButton")).toHaveCount(1, { timeout: 5_000 });
  await page.evaluate(() => GeminiFinalBoss.enable({ restart: true, persist: false }));

  const bossSeat = page.locator(".seat.is-gemini-final-boss");
  await expect(bossSeat).toHaveCount(1, { timeout: 5_000 });
  await expect(bossSeat.locator("h2")).toHaveText("Gemini");
  await expect(bossSeat.locator(".gemini-boss-badge")).toHaveText("FINAL BOSS");
  await expect(bossSeat).toHaveAttribute("data-ai-provider", "gemini");
  await expect(page.locator("#arena")).toHaveClass(/has-gemini-final-boss/);
  await expect(page.locator(".seat")).toHaveCount(6);

  const bossState = await page.evaluate(() => {
    const boss = state.players.find(player => player.name === "Gemini");
    return {
      isBoss: boss?.isBoss,
      provider: boss?.aiProvider,
      providerMode: boss?.providerMode,
      stack: boss?.stack,
      style: boss?.style,
      active: GeminiFinalBoss.isActive(),
      mode: GeminiFinalBoss.isBossMode(),
    };
  });

  expect(bossState).toMatchObject({
    isBoss: true,
    provider: "gemini",
    providerMode: "local-fallback",
    style: "Final Boss",
    active: true,
    mode: true,
  });
  expect(bossState.stack).toBeGreaterThan(0);

  await bossSeat.click();
  const profile = page.locator("#aiProfilePanel");
  await expect(profile).toBeVisible();
  await expect(profile).toHaveClass(/is-gemini-final-boss-profile/);
  await expect(profile.locator("h3")).toHaveText("Gemini");
  await expect(profile.locator(".ai-profile-title strong")).toHaveText("終局雙生者");
  await expect(profile.locator(".gemini-connection-status strong")).toHaveText("AI 核心：本地 Solver 備援");
  await expect(profile.locator(".gemini-connection-status span")).toContainText("Gemini 後端尚未設定");

  await page.evaluate(() => GeminiFinalBoss.disable({ restart: true, persist: false }));
  await expect(page.locator(".seat.is-gemini-final-boss")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator("#arena")).not.toHaveClass(/has-gemini-final-boss/);

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
