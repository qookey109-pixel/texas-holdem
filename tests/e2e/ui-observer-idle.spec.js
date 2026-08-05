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
  // EconomyFoldDefenseV1 is a dynamically loaded compatibility layer. Wait for
  // its final wrapper installation before establishing the observer baseline,
  // so legitimate one-time module setup is never counted as idle UI churn.
  await expect.poll(
    () => page.evaluate(() => window.EconomyFoldDefenseV1?.status?.().installed === true),
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

  // Let explicit refreshes and their queued animation-frame work settle before
  // measuring the unrelated-mutation phase. This prevents legitimate work from
  // the previous phase being attributed to the observer probe below.
  await page.waitForTimeout(420);
  const settledBaseline = await page.evaluate(ids => ({
    status: window.UiTextWriteGuard.status(),
    sameNodes: ids.every(id => (
      document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
    )),
  }), guardedIds);

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "unrelatedObserverProbe";
    document.body.appendChild(probe);
    for (let index = 0; index < 24; index += 1) {
      const node = document.createElement("span");
      node.textContent = `unrelated-${index}`;
      probe.appendChild(node);
      node.remove();
    }
    probe.remove();
  });
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(80);

  const afterUnrelatedMutations = await page.evaluate(() => window.UiTextWriteGuard.status());

  await page.waitForTimeout(420);

  const afterIdle = await page.evaluate(ids => ({
    status: window.UiTextWriteGuard.status(),
    sameNodes: ids.every(id => (
      document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
    )),
  }), guardedIds);

  const count = (snapshot, id) => snapshot.writesById[id] || 0;
  const maxIdleWrites = 12;
  // Chromium consistently performs one legitimate mode sync during the two
  // post-probe animation frames. Three requests remain far below a per-frame
  // observer loop and preserve the stricter 420 ms idle-loop budget below.
  const maxUnrelatedMutationWrites = 3;

  expect(before.supported).toBe(true);
  expect(afterRefresh.status.guardedCount).toBeGreaterThanOrEqual(guardedIds.length);
  expect(afterRefresh.status.skippedWrites).toBeGreaterThan(before.skippedWrites);
  expect(afterRefresh.sameNodes).toBe(true);
  expect(settledBaseline.sameNodes).toBe(true);
  expect(afterIdle.sameNodes).toBe(true);

  for (const id of ["tournamentModeButton", "geminiBossButton"]) {
    expect(
      count(afterUnrelatedMutations, id) - count(settledBaseline.status, id),
    ).toBeLessThanOrEqual(maxUnrelatedMutationWrites);
  }

  // Other UI modules can legitimately request several sync passes. At 60 fps,
  // an observer self-loop would approach 25 writes in this 420 ms window.
  // Staying below half that rate, while preserving text-node identity, proves
  // repeated requests are idempotent instead of rebuilding the DOM every frame.
  expect(
    count(afterIdle.status, "tournamentModeButton")
      - count(afterUnrelatedMutations, "tournamentModeButton"),
  ).toBeLessThanOrEqual(maxIdleWrites);
  expect(
    count(afterIdle.status, "geminiBossButton")
      - count(afterUnrelatedMutations, "geminiBossButton"),
  ).toBeLessThanOrEqual(maxIdleWrites);
  expect(
    count(afterIdle.status, "challengeModeButton")
      - count(afterUnrelatedMutations, "challengeModeButton"),
  ).toBeLessThanOrEqual(maxIdleWrites);

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
