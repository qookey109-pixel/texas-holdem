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
    const url = new URL(request.url());
    const errorText = request.failure()?.errorText || "unknown";
    const expectedDiagnosticsAbort = (
      url.searchParams.has("diagnostics")
      && errorText === "net::ERR_ABORTED"
    );
    if (expectedDiagnosticsAbort) return;
    issues.push(`request failed: ${request.url()} (${errorText})`);
  });

  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.endsWith("/favicon.ico")) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return issues;
}

async function collectAssetProbeTelemetry(page) {
  const methodsByPath = new Map();
  let activeProbeHandlers = 0;
  let maxConcurrentAssetProbes = 0;

  const isAssetProbeUrl = url => (
    url.searchParams.has("diagnostics")
    && !url.pathname.endsWith("/build-manifest.json")
  );

  page.on("request", request => {
    const url = new URL(request.url());
    if (!isAssetProbeUrl(url)) return;
    const methods = methodsByPath.get(url.pathname) || [];
    methods.push(request.method());
    methodsByPath.set(url.pathname, methods);
  });

  await page.route(isAssetProbeUrl, async route => {
    activeProbeHandlers += 1;
    maxConcurrentAssetProbes = Math.max(
      maxConcurrentAssetProbes,
      activeProbeHandlers,
    );

    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      await route.continue();
    } finally {
      activeProbeHandlers -= 1;
    }
  });

  return {
    methodsByPath,
    get maxConcurrentAssetProbes() {
      return maxConcurrentAssetProbes;
    },
  };
}

test("部署診斷由 Build Manifest 驅動並全部通過", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  const probes = await collectAssetProbeTelemetry(page);
  const manifestResponse = await page.request.get("/build-manifest.json");
  expect(manifestResponse.ok()).toBe(true);

  const manifest = await manifestResponse.json();
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.buildId).toBeTruthy();
  expect(manifest.assets.length).toBeGreaterThan(0);
  expect(manifest.features.length).toBeGreaterThan(0);
  expect(manifest.assets.some(asset => /\.mp4$/i.test(asset.path))).toBe(false);

  await page.goto("/diagnostics.html", { waitUntil: "networkidle" });

  const summary = page.locator("#summary");
  await expect(summary).toHaveAttribute("data-state", "pass", { timeout: 30_000 });
  await expect(summary.locator("strong")).toHaveText("全部通過");
  await expect(page.locator("#buildInfo")).toContainText(`Build ${manifest.buildId}`);
  await expect(page.locator('[data-kind="feature"]')).toHaveCount(manifest.features.length);
  await expect(page.locator('[data-kind="asset"]')).toHaveCount(manifest.assets.length);
  await expect(page.locator("#featureCount")).toHaveText(`${manifest.features.length}/${manifest.features.length} 通過`);
  await expect(page.locator("#assetCount")).toHaveText(`${manifest.assets.length}/${manifest.assets.length} 通過`);

  expect(probes.maxConcurrentAssetProbes).toBeLessThanOrEqual(6);
  const authEntryMethods = probes.methodsByPath.get("/js/auth-entry-v2.js") || [];
  expect(authEntryMethods.length).toBeGreaterThan(0);
  expect(authEntryMethods.every(method => method === "HEAD")).toBe(true);

  await page.locator("#runButton").click();
  await expect(summary).toHaveAttribute("data-state", "pass", { timeout: 30_000 });
  await expect(page.locator('[data-kind="feature"]')).toHaveCount(manifest.features.length);
  await expect(page.locator('[data-kind="asset"]')).toHaveCount(manifest.assets.length);
  expect(probes.maxConcurrentAssetProbes).toBeLessThanOrEqual(6);

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});

test("HEAD 缺少 Content-Length 時會改用 Range GET 驗證內容", async ({ page }) => {
  const methods = [];

  await page.route(/\/README\.md\?diagnostics=/, async route => {
    const method = route.request().method();
    methods.push(method);

    if (method === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
      return;
    }

    await route.fulfill({
      status: 206,
      headers: {
        "content-type": "text/markdown",
        "content-range": "bytes 0-0/1",
      },
      body: "#",
    });
  });

  await page.goto("/diagnostics.html", { waitUntil: "networkidle" });

  const summary = page.locator("#summary");
  await expect(summary).toHaveAttribute("data-state", "pass", { timeout: 30_000 });
  expect(methods).toContain("HEAD");
  expect(methods).toContain("GET");
  expect(methods.indexOf("HEAD")).toBeLessThan(methods.indexOf("GET"));

  const readmeCard = page.locator('[data-kind="asset"]', { hasText: "README.md" });
  await expect(readmeCard).toContainText("Range GET");
});
