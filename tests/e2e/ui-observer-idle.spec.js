import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test("模式與雲端存檔 observer 閒置後不再每幀重建相同文字", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.UiTextWriteGuard?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => Boolean(window.GameModeControlsV2?.version)),
    { timeout: 12_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => Boolean(window.TournamentCloudSave?.version)),
    { timeout: 12_000 },
  ).toBe(true);

  await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer?.();
    clearDialogueTimers?.();
    if (typeof state === "object") state.autoNewHand = false;

    if (!document.querySelector("#authSignedInView")) {
      const authView = document.createElement("div");
      authView.id = "authSignedInView";
      document.body.appendChild(authView);
    }
    window.TournamentCloudSave.refresh();
    window.UiTextWriteGuard.refresh();
  });

  const guardedIds = [
    "challengeModeButton",
    "gameModeLabel",
    "tournamentModeButton",
    "geminiBossButton",
    "tournamentSaveSource",
    "tournamentSaveMeta",
    "tournamentSaveStatus",
  ];

  await expect.poll(
    () => page.evaluate(ids => ids.every(id => window.UiTextWriteGuard.isGuarded(id)), guardedIds),
    { timeout: 5_000 },
  ).toBe(true);

  await page.waitForTimeout(180);

  const before = await page.evaluate(ids => {
    window.__uiObserverTextNodes = Object.fromEntries(
      ids.map(id => [id, document.getElementById(id)?.firstChild || null]),
    );
    return window.UiTextWriteGuard.status();
  }, guardedIds);

  await page.evaluate(() => {
    window.GameModeControlsV2.refresh();
    window.TournamentCloudSave.refresh();
    window.TournamentModeVisibleEntry?.refresh?.();
  });
  await page.waitForTimeout(180);

  const afterRefresh = await page.evaluate(ids => ({
    status: window.UiTextWriteGuard.status(),
    sameNodes: ids.every(id => (
      document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
    )),
  }), guardedIds);

  await page.waitForTimeout(420);

  const afterIdle = await page.evaluate(ids => ({
    status: window.UiTextWriteGuard.status(),
    sameNodes: ids.every(id => (
      document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
    )),
  }), guardedIds);

  const count = (snapshot, id) => snapshot.writesById[id] || 0;
  const maxIdleWrites = 12;

  expect(before.supported).toBe(true);
  expect(afterRefresh.status.guardedCount).toBeGreaterThanOrEqual(guardedIds.length);
  expect(afterRefresh.status.skippedWrites).toBeGreaterThan(before.skippedWrites);
  expect(afterRefresh.sameNodes).toBe(true);
  expect(afterIdle.sameNodes).toBe(true);

  // Other UI modules can legitimately request several sync passes. At 60 fps,
  // an observer self-loop would approach 25 writes in this 420 ms window.
  // Staying below half that rate, while preserving text-node identity, proves
  // repeated requests are idempotent instead of rebuilding the DOM every frame.
  expect(
    count(afterIdle.status, "tournamentModeButton")
      - count(afterRefresh.status, "tournamentModeButton"),
  ).toBeLessThanOrEqual(maxIdleWrites);
  expect(
    count(afterIdle.status, "geminiBossButton")
      - count(afterRefresh.status, "geminiBossButton"),
  ).toBeLessThanOrEqual(maxIdleWrites);
  expect(
    count(afterIdle.status, "challengeModeButton")
      - count(afterRefresh.status, "challengeModeButton"),
  ).toBeLessThanOrEqual(maxIdleWrites);

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
