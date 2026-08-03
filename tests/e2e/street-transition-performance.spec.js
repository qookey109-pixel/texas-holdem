import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`));
  });
  return issues;
}

test("翻牌先完成輕量繪製，再於後續畫面幀更新完整牌桌", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.StreetTransitionPerformance?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.StreetTransitionPerformance?.status().installed || false),
    { timeout: 12_000 },
  ).toBe(true);

  const snapshots = await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer();
    clearDialogueTimers();

    state.autoNewHand = false;
    state.handOver = false;
    state.waitingForHuman = false;
    state.board = [];
    state.street = "翻牌前";
    state.pot = 400;
    state.currentBet = 0;
    state.lastRaiseSize = currentBigBlind();
    state.lastAggressor = null;
    state.dealerIndex = 0;
    state.currentActorIndex = -1;
    state.deck = shuffle(createDeck());
    state.players.forEach(player => {
      player.stack = Math.max(2000, Number(player.stack) || 0);
      player.bet = 0;
      player.totalContribution = 0;
      player.folded = false;
      player.allIn = false;
      player.hasActed = true;
      player.raiseLocked = false;
      player.status = "已行動";
      player.lastAction = "";
    });

    window.StreetTransitionPerformance.cancel();
    window.StreetTransitionPerformance.resetMetrics();

    // CI runners can throttle real animation frames under load. Queue and flush
    // the two frames within one event turn so background AI cannot change hands
    // between the preview snapshot and the full-render assertion.
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;
    let frameId = 0;
    let frameQueue = [];
    window.requestAnimationFrame = callback => {
      const id = ++frameId;
      frameQueue.push({ id, callback });
      return id;
    };
    window.cancelAnimationFrame = id => {
      frameQueue = frameQueue.filter(frame => frame.id !== id);
    };

    try {
      advanceStreet();
      render();

      const immediate = {
        status: window.StreetTransitionPerformance.status(),
        queuedFrames: frameQueue.length,
        boardLength: state.board.length,
        renderedCards: document.querySelectorAll("#boardCards .card:not(.back)").length,
        previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
        stage: document.querySelector("#boardStageLabel")?.textContent || "",
        buttonsDisabled: ["foldButton", "callButton", "raiseButton", "allInButton"]
          .every(id => document.getElementById(id)?.disabled),
      };

      const flushNextFrame = () => {
        const frame = frameQueue.shift();
        if (!frame) throw new Error("expected a queued street transition frame");
        frame.callback(performance.now());
      };
      flushNextFrame();
      flushNextFrame();

      const completed = {
        status: window.StreetTransitionPerformance.status(),
        previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
        renderedCards: document.querySelectorAll("#boardCards .card:not(.back)").length,
      };

      return { immediate, completed };
    } finally {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
    }
  });

  const { immediate, completed } = snapshots;
  expect(immediate.boardLength).toBe(3);
  expect(immediate.renderedCards).toBe(3);
  expect(immediate.previewMarker).toBe("true");
  expect(immediate.stage).toBe("FLOP");
  expect(immediate.buttonsDisabled).toBe(true);
  expect(immediate.status.previewCount).toBe(1);
  expect(immediate.status.skippedRenderCount).toBe(1);
  expect(immediate.status.scheduledFullRenderCount).toBe(0);
  expect(immediate.status.pending).toBe(true);
  expect(immediate.queuedFrames).toBe(1);

  expect(completed.status.scheduledFullRenderCount).toBe(1);
  expect(completed.status.pending).toBe(false);
  expect(completed.previewMarker).toBe("");
  expect(completed.renderedCards).toBe(3);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
