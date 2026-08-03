import { expect, test } from "@playwright/test";

const AI_STORAGE_KEYS = [
  "texasHoldemAiProviderModeV1",
  "texasHoldemAiCustomWorkerEndpointV1",
  "texasHoldemAiEngineLabelV1",
  "texasHoldemAiDirectEndpointV1",
  "texasHoldemAiDirectModelV1",
  "texasHoldemGeminiEndpointV1",
];

function clearAiSettings() {
  AI_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  sessionStorage.removeItem("texasHoldemAiDirectKeySessionV1");
}

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

test("AI 引擎預設使用官方 Worker，並可切換自訂 Worker", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.addInitScript(clearAiSettings);

  await page.route("https://custom-worker.example/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, configured: true, model: "Custom Worker Model" }),
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.AIProviderClient?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.0.0");

  const official = await page.evaluate(() => AIProviderClient.status());
  expect(official).toMatchObject({
    mode: "official-worker",
    provider: "gemini",
    configured: true,
    endpoint: "https://texas-holdem-gemini.q-oo109.workers.dev",
    engineLabel: "Gemini",
  });

  await expect(page.locator("#aiProviderSettingsButton")).toHaveCount(1);
  await expect(page.locator("#geminiBackendSettingsButton")).toBeHidden();

  await page.evaluate(() => AIProviderClient.openSettings());
  await expect(page.locator("#aiProviderOverlay")).toBeVisible();
  await page.locator("#aiProviderMode").selectOption("custom-worker");
  await expect(page.locator("#aiProviderWorkerSection")).toBeVisible();
  await page.locator("#aiProviderWorkerEndpoint").fill("https://custom-worker.example");
  await page.locator("#aiProviderWorkerLabel").fill("我的 Worker AI");
  await page.locator("#aiProviderTest").click();

  await expect(page.locator("#aiProviderStatus")).toContainText("已連線");
  await expect.poll(
    () => page.evaluate(() => AIProviderClient.status()),
    { timeout: 5_000 },
  ).toMatchObject({
    mode: "custom-worker",
    connected: true,
    endpoint: "https://custom-worker.example",
    engineLabel: "我的 Worker AI",
    model: "Custom Worker Model",
  });

  const persisted = await page.evaluate(() => ({
    mode: localStorage.getItem("texasHoldemAiProviderModeV1"),
    worker: localStorage.getItem("texasHoldemAiCustomWorkerEndpointV1"),
    legacyEndpoint: localStorage.getItem("texasHoldemGeminiEndpointV1"),
  }));
  expect(persisted).toEqual({
    mode: "custom-worker",
    worker: "https://custom-worker.example",
    legacyEndpoint: "https://custom-worker.example",
  });

  await page.evaluate(() => AIProviderClient.closeSettings());
  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});

test("直接 API 模式使用 session-only Key 並支援 OpenAI 相容回傳", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  const requests = [];
  const directEndpoint = "https://direct-ai.example/v1/chat/completions";
  const secret = "session-only-secret-key";

  await page.addInitScript(clearAiSettings);
  await page.route(`${directEndpoint}`, async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type",
        },
      });
      return;
    }

    requests.push({
      authorization: request.headers().authorization,
      body: request.postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({
        id: "chatcmpl-test",
        model: "custom-model-1",
        choices: [{
          message: {
            role: "assistant",
            content: JSON.stringify({
              action: "check",
              raiseTo: 0,
              dialogue: "先觀察這一輪。",
              emotion: "calm",
              reason: "測試連線使用合法過牌。",
            }),
          },
        }],
      }),
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => AIProviderClient.openSettings());
  await page.locator("#aiProviderMode").selectOption("direct-api");
  await expect(page.locator("#aiProviderDirectSection")).toBeVisible();
  await page.locator("#aiProviderDirectEndpoint").fill(directEndpoint);
  await page.locator("#aiProviderDirectModel").fill("custom-model-1");
  await page.locator("#aiProviderDirectLabel").fill("我的自訂 AI");
  await page.locator("#aiProviderApiKey").fill(secret);
  await page.locator("#aiProviderTest").click();

  await expect(page.locator("#aiProviderStatus")).toContainText("已連線");
  expect(requests).toHaveLength(1);
  expect(requests[0].authorization).toBe(`Bearer ${secret}`);
  expect(requests[0].body.model).toBe("custom-model-1");
  expect(requests[0].body.messages[0].role).toBe("system");
  expect(requests[0].body.messages[1].content).toContain("\"legalActions\":[\"check\"]");

  const directStatus = await page.evaluate(() => AIProviderClient.status());
  expect(directStatus).toMatchObject({
    mode: "direct-api",
    configured: true,
    connected: true,
    endpoint: directEndpoint,
    model: "custom-model-1",
    engineLabel: "我的自訂 AI",
    apiKeyStored: true,
  });

  const storage = await page.evaluate(secretValue => ({
    sessionKey: sessionStorage.getItem("texasHoldemAiDirectKeySessionV1"),
    localValues: Object.keys(localStorage).map(key => localStorage.getItem(key)),
    workerEndpoint: GeminiBackendClient.endpoint(),
    containsSecret: Object.keys(localStorage).some(
      key => String(localStorage.getItem(key) || "").includes(secretValue),
    ),
  }), secret);
  expect(storage.sessionKey).toBe(secret);
  expect(storage.containsSecret).toBe(false);
  expect(storage.workerEndpoint).toBe("");
  expect(storage.localValues).not.toContain(secret);

  await page.locator("#aiProviderOfficial").click();
  await expect(page.locator("#aiProviderStatus")).toContainText("已還原官方 AI");
  await expect.poll(
    () => page.evaluate(() => AIProviderClient.status()),
    { timeout: 5_000 },
  ).toMatchObject({
    mode: "official-worker",
    endpoint: "https://texas-holdem-gemini.q-oo109.workers.dev",
    engineLabel: "Gemini",
  });

  await page.evaluate(() => AIProviderClient.closeSettings());
  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});