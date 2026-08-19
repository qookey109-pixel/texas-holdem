import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`page error: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console error: ${message.text()}`);
  });
  return issues;
}

test("config waits for the final AI V2.9.5 dispatcher and replacement economy authorities", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-ai-runtime-authority", "ready", { timeout: 15_000 });
  await expect(root).toHaveAttribute("data-replacement-stack-authority", "ready", { timeout: 15_000 });
  await expect(root).toHaveAttribute("data-config-authority-state", "ready", { timeout: 15_000 });

  const authority = await page.evaluate(() => ({
    aiVersion: window.AiOpeningBalanceV295?.version || null,
    dispatcherVersion: window.AiActionDispatcherV1?.version || null,
    dispatcherDataset: document.documentElement.dataset.aiActionDispatcherV1 || null,
    dispatcherAvailable: typeof window.AiActionDispatcherV1?.dispatch === "function",
    replacementVersion: window.ReplacementStackBalance?.version || null,
    replacementInstalled: window.ReplacementStackBalance?.isInstalled?.() === true,
  }));

  expect(authority).toEqual({
    aiVersion: "2.9.5",
    dispatcherVersion: "1.0.0",
    dispatcherDataset: "ready",
    dispatcherAvailable: true,
    replacementVersion: "2.1.0",
    replacementInstalled: true,
  });
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});

test("missing final AI dispatcher is surfaced instead of accepting the outer compatibility loader", async ({ page }) => {
  await page.route(/\/js\/ai-action-dispatcher-v1\.js(?:\?|$)/, route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-ai-runtime-authority", "failed", { timeout: 12_000 });
  await expect(root).toHaveAttribute("data-config-authority-state", "failed");
  await expect(root).toHaveAttribute("data-config-authority-failure", "AI V2.9.5 authority chain");
  await expect(page.locator("#configAuthorityFailure")).toContainText("AI V2.9.5 authority chain");

  const authority = await page.evaluate(() => ({
    outerLoaderPresent: Boolean(document.querySelector('script[data-elite-character-presentation]')),
    dispatcherReady: Boolean(window.AiActionDispatcherV1?.version),
  }));
  expect(authority.outerLoaderPresent).toBe(true);
  expect(authority.dispatcherReady).toBe(false);
});

test("replacement economy script failure is visible and cannot be mistaken for an installed authority", async ({ page }) => {
  await page.route(/\/js\/replacement-stack-balance\.js(?:\?|$)/, route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-replacement-stack-authority", "failed", { timeout: 8_000 });
  await expect(root).toHaveAttribute("data-config-authority-state", "failed");
  await expect(root).toHaveAttribute("data-config-authority-failure", "Replacement stack authority");
  await expect(page.locator("#configAuthorityFailure")).toContainText("Replacement stack authority");

  expect(await page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.() === true)).toBe(false);
});
