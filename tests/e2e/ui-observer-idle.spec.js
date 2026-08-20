import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`));
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
  // The compatibility layer also schedules bounded 0/100/400/900 ms retries.
  // Installation may become true before the final retry executes, so let all
  // one-time retries settle while preserving the strict idle budget below.
  await page.waitForTimeout(960);

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
  const modeObserverIds = [
    "challengeModeButton",
    "tournamentModeButton",
    "geminiBossButton",
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
  // measuring the unrelated-mutation phase. TournamentCloudSave also performs a
  // legitimate 250 ms background sync, so the contract is bounded/idempotent
  // activity rather than complete silence.
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

  const afterUnrelatedMutations = await page.evaluate(ids => ({
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
  const skippedCount = (snapshot, id) => snapshot.skippedById[id] || 0;
  const maxIdleWrites = 12;

  expect(before.supported).toBe(true);
  expect(afterRefresh.status.guardedCount).toBeGreaterThanOrEqual(guardedIds.length);
  expect(afterRefresh.status.skippedWrites).toBeGreaterThan(before.skippedWrites);
  expect(afterRefresh.sameNodes).toBe(true);
  expect(settledBaseline.sameNodes).toBe(true);
  expect(afterUnrelatedMutations.sameNodes).toBe(true);
  expect(afterIdle.sameNodes).toBe(true);

  // MutationObserver/rAF batching is browser-scheduler dependent, so do not
  // constrain how many same-value refresh requests are coalesced from the probe.
  // Every request must still be idempotent: no guarded text node may be rebuilt,
  // and every mode-control text write caused while the probe settles must skip.
  let probeWriteAttempts = 0;
  for (const id of modeObserverIds) {
    const writeAttempts = count(afterUnrelatedMutations.status, id)
      - count(settledBaseline.status, id);
    const skippedAttempts = skippedCount(afterUnrelatedMutations.status, id)
      - skippedCount(settledBaseline.status, id);
    probeWriteAttempts += writeAttempts;
    expect(skippedAttempts).toBe(writeAttempts);
  }
  expect(probeWriteAttempts).toBeGreaterThan(0);

  // A real observer self-loop would approach roughly 25 writes at 60 fps during
  // this 420 ms window. Keep the established sub-half-frame-rate ceiling while
  // allowing the legitimate 250 ms cloud-save sync to request bounded passes.
  for (const id of modeObserverIds) {
    expect(
      count(afterIdle.status, id) - count(afterUnrelatedMutations.status, id),
    ).toBeLessThanOrEqual(maxIdleWrites);
  }

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
