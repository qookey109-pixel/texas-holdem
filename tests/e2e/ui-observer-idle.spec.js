import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

async function waitForWriteQuiescence(page, ids, { quietMs = 700, timeoutMs = 5_000 } = {}) {
  return page.evaluate(async ({ ids, quietMs, timeoutMs }) => {
    const readCounts = () => {
      const status = window.UiTextWriteGuard.status();
      return Object.fromEntries(ids.map(id => [id, status.writesById[id] || 0]));
    };

    let counts = readCounts();
    let signature = JSON.stringify(counts);
    let stableSince = performance.now();
    const deadline = stableSince + timeoutMs;

    while (performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const nextCounts = readCounts();
      const nextSignature = JSON.stringify(nextCounts);

      if (nextSignature !== signature) {
        counts = nextCounts;
        signature = nextSignature;
        stableSince = performance.now();
        continue;
      }

      counts = nextCounts;
      if (performance.now() - stableSince >= quietMs) {
        return {
          quiescent: true,
          counts,
          status: window.UiTextWriteGuard.status(),
        };
      }
    }

    return {
      quiescent: false,
      counts: readCounts(),
      status: window.UiTextWriteGuard.status(),
    };
  }, { ids, quietMs, timeoutMs });
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
  // one-time retries settle before the observer-specific quiescence checks.
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

  // Establish the observer baseline by behavior rather than a fixed sleep.
  // WebKit can batch the final one-time MutationObserver/rAF work differently
  // from Chromium, so require the mode-control counters to remain unchanged for
  // a full quiet window before the unrelated-mutation probe begins.
  const settledBaseline = await waitForWriteQuiescence(page, modeObserverIds);
  const baselineNodesStable = await page.evaluate(ids => ids.every(id => (
    document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
  )), guardedIds);

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

  // A real observer self-loop would keep these counters growing every frame and
  // can never satisfy this quiescence condition. The exact number of coalesced
  // refresh requests before quiescence is intentionally not a browser contract.
  const afterProbeSettled = await waitForWriteQuiescence(page, modeObserverIds);
  const afterProbeNodesStable = await page.evaluate(ids => ids.every(id => (
    document.getElementById(id)?.firstChild === window.__uiObserverTextNodes[id]
  )), guardedIds);

  const count = (snapshot, id) => snapshot.writesById[id] || 0;
  const skippedCount = (snapshot, id) => snapshot.skippedById[id] || 0;

  expect(before.supported).toBe(true);
  expect(afterRefresh.status.guardedCount).toBeGreaterThanOrEqual(guardedIds.length);
  expect(afterRefresh.status.skippedWrites).toBeGreaterThan(before.skippedWrites);
  expect(afterRefresh.sameNodes).toBe(true);
  expect(settledBaseline.quiescent).toBe(true);
  expect(baselineNodesStable).toBe(true);
  expect(afterProbeSettled.quiescent).toBe(true);
  expect(afterProbeNodesStable).toBe(true);

  // Any mode-control writes triggered while the unrelated mutation burst settles
  // must be same-value writes. The guard should skip every one of them, regardless
  // of whether a browser coalesces the burst into one callback or several.
  for (const id of modeObserverIds) {
    const writeAttempts = count(afterProbeSettled.status, id)
      - count(settledBaseline.status, id);
    const skippedAttempts = skippedCount(afterProbeSettled.status, id)
      - skippedCount(settledBaseline.status, id);
    expect(skippedAttempts).toBe(writeAttempts);
  }

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
