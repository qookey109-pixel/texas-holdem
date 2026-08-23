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
  await expect.poll(
    () => page.evaluate(() => window.EconomyFoldDefenseV1?.status?.().installed === true),
    { timeout: 12_000 },
  ).toBe(true);
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

  await page.evaluate(ids => {
    window.__observerRefreshProbe = { gameMode: 0, cloudSave: 0, visibleEntry: 0 };
    window.__observerWriteStacks = Object.fromEntries(ids.map(id => [id, []]));
    window.__observerProbePhase = "setup";

    const wrapRefresh = (target, key, counter) => {
      const original = target?.[key];
      if (typeof original !== "function" || original.__observerIdleProbeWrapped) return;
      const wrapped = function (...args) {
        window.__observerRefreshProbe[counter] += 1;
        return original.apply(this, args);
      };
      wrapped.__observerIdleProbeWrapped = true;
      target[key] = wrapped;
    };

    wrapRefresh(window.GameModeControlsV2, "refresh", "gameMode");
    wrapRefresh(window.TournamentCloudSave, "refresh", "cloudSave");
    wrapRefresh(window.TournamentModeVisibleEntry, "refresh", "visibleEntry");

    for (const id of ids) {
      const element = document.getElementById(id);
      const descriptor = element && Object.getOwnPropertyDescriptor(element, "textContent");
      if (!descriptor?.get || !descriptor?.set || descriptor.set.__observerIdleProbeWrapped) continue;
      const originalSet = descriptor.set;
      const wrappedSet = function (value) {
        if (window.__observerProbePhase === "idle") {
          const stacks = window.__observerWriteStacks[id];
          if (stacks.length < 6) stacks.push(new Error(`observer-write:${id}`).stack || "");
        }
        return originalSet.call(this, value);
      };
      wrappedSet.__observerIdleProbeWrapped = true;
      Object.defineProperty(element, "textContent", {
        ...descriptor,
        set: wrappedSet,
      });
    }
  }, modeObserverIds);

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
  const settledBaseline = await page.evaluate(ids => ({
    status: window.UiTextWriteGuard.status(),
    sameNodes: ids.every(id => (
      document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
    )),
    refreshProbe: { ...window.__observerRefreshProbe },
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
    refreshProbe: { ...window.__observerRefreshProbe },
  }), guardedIds);

  await page.evaluate(() => {
    window.__observerProbePhase = "idle";
    for (const key of Object.keys(window.__observerWriteStacks)) {
      window.__observerWriteStacks[key] = [];
    }
  });
  await page.waitForTimeout(420);

  const afterIdle = await page.evaluate(ids => ({
    status: window.UiTextWriteGuard.status(),
    sameNodes: ids.every(id => (
      document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
    )),
    refreshProbe: { ...window.__observerRefreshProbe },
    writeStacks: structuredClone(window.__observerWriteStacks),
  }), guardedIds);

  const count = (snapshot, id) => snapshot.writesById[id] || 0;
  const skippedCount = (snapshot, id) => snapshot.skippedById[id] || 0;
  const maxIdleWrites = 12;
  const diagnosticRows = modeObserverIds.map(id => ({
    id,
    idleWrites: count(afterIdle.status, id) - count(afterUnrelatedMutations.status, id),
    refreshDelta: Object.fromEntries(Object.keys(afterIdle.refreshProbe).map(key => [
      key,
      afterIdle.refreshProbe[key] - afterUnrelatedMutations.refreshProbe[key],
    ])),
    stacks: afterIdle.writeStacks[id],
  }));
  console.log(`[observer-idle-diagnostics] ${JSON.stringify(diagnosticRows)}`);

  expect(before.supported).toBe(true);
  expect(afterRefresh.status.guardedCount).toBeGreaterThanOrEqual(guardedIds.length);
  expect(afterRefresh.status.skippedWrites).toBeGreaterThan(before.skippedWrites);
  expect(afterRefresh.sameNodes).toBe(true);
  expect(settledBaseline.sameNodes).toBe(true);
  expect(afterUnrelatedMutations.sameNodes).toBe(true);
  expect(afterIdle.sameNodes).toBe(true);

  for (const id of modeObserverIds) {
    const writeAttempts = count(afterUnrelatedMutations.status, id)
      - count(settledBaseline.status, id);
    const skippedAttempts = skippedCount(afterUnrelatedMutations.status, id)
      - skippedCount(settledBaseline.status, id);
    expect(skippedAttempts).toBe(writeAttempts);
  }

  for (const row of diagnosticRows) {
    expect(row.idleWrites, JSON.stringify(row, null, 2)).toBeLessThanOrEqual(maxIdleWrites);
  }

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
