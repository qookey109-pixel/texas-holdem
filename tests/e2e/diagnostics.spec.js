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

test("部署診斷由 Build Manifest 驅動並全部通過", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  const manifestResponse = await page.request.get("/build-manifest.json");
  expect(manifestResponse.ok()).toBe(true);

  const manifest = await manifestResponse.json();
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.buildId).toBeTruthy();
  expect(manifest.assets.length).toBeGreaterThan(0);
  expect(manifest.features.length).toBeGreaterThan(0);

  await page.goto("/diagnostics.html", { waitUntil: "networkidle" });

  const summary = page.locator("#summary");
  await expect(summary).toHaveAttribute("data-state", "pass", { timeout: 30_000 });
  await expect(summary.locator("strong")).toHaveText("全部通過");
  await expect(page.locator("#buildInfo")).toContainText(`Build ${manifest.buildId}`);
  await expect(page.locator('[data-kind="feature"]')).toHaveCount(manifest.features.length);
  await expect(page.locator('[data-kind="asset"]')).toHaveCount(manifest.assets.length);
  await expect(page.locator("#featureCount")).toHaveText(`${manifest.features.length}/${manifest.features.length} 通過`);
  await expect(page.locator("#assetCount")).toHaveText(`${manifest.assets.length}/${manifest.assets.length} 通過`);

  await page.locator("#runButton").click();
  await expect(summary).toHaveAttribute("data-state", "pass", { timeout: 30_000 });
  await expect(page.locator('[data-kind="feature"]')).toHaveCount(manifest.features.length);
  await expect(page.locator('[data-kind="asset"]')).toHaveCount(manifest.assets.length);

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
