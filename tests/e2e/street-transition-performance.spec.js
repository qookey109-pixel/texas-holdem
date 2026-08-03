import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test("翻牌不再於兩個畫面幀後重建整桌，轉牌只追加新牌", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TournamentModeVisibleEntry?.version || ""),
    { timeout: 12_000 },
  ).toBe("3.4.0");
  await expect.poll(
    () => page.evaluate(() => window.StreetTransitionPerformance?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.0.0");
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
    state.coach.enabled = false;
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

    // Flush the two post-paint frames deterministically. V2 may use them only
    // for idle coach warmup; they must never trigger the full table rebuild.
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

    const flushNextFrame = () => {
      const frame = frameQueue.shift();
      if (!frame) throw new Error("expected a queued street transition frame");
      frame.callback(performance.now());
    };

    try {
      advanceStreet();
      render();
      document.querySelectorAll("#boardCards .card").forEach((card, index) => {
        card.dataset.identity = `flop-${index}`;
      });

      const immediateFlop = {
        status: window.StreetTransitionPerformance.status(),
        queuedFrames: frameQueue.length,
        boardLength: state.board.length,
        renderedCards: document.querySelectorAll("#boardCards .card:not(.back)").length,
        previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
        stage: document.querySelector("#boardStageLabel")?.textContent || "",
        identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity),
        buttonsDisabled: ["foldButton", "callButton", "raiseButton", "allInButton"]
          .every(id => document.getElementById(id)?.disabled),
      };

      flushNextFrame();
      flushNextFrame();

      const afterTwoFrames = {
        status: window.StreetTransitionPerformance.status(),
        previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
        identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity),
      };

      render();
      const completedFlop = {
        status: window.StreetTransitionPerformance.status(),
        previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
        identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity),
      };

      advanceStreet();
      render();
      const immediateTurn = {
        status: window.StreetTransitionPerformance.status(),
        boardLength: state.board.length,
        renderedCards: document.querySelectorAll("#boardCards .card:not(.back)").length,
        identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity || ""),
        stage: document.querySelector("#boardStageLabel")?.textContent || "",
      };

      render();
      const completedTurn = {
        status: window.StreetTransitionPerformance.status(),
        identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity || ""),
      };

      return {
        immediateFlop,
        afterTwoFrames,
        completedFlop,
        immediateTurn,
        completedTurn,
      };
    } finally {
      window.StreetTransitionPerformance.cancel();
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
    }
  });

  const {
    immediateFlop,
    afterTwoFrames,
    completedFlop,
    immediateTurn,
    completedTurn,
  } = snapshots;

  expect(immediateFlop.boardLength).toBe(3);
  expect(immediateFlop.renderedCards).toBe(3);
  expect(immediateFlop.previewMarker).toBe("true");
  expect(immediateFlop.stage).toBe("FLOP");
  expect(immediateFlop.identities).toEqual(["flop-0", "flop-1", "flop-2"]);
  expect(immediateFlop.buttonsDisabled).toBe(true);
  expect(immediateFlop.status.previewCount).toBe(1);
  expect(immediateFlop.status.skippedRenderCount).toBe(1);
  expect(immediateFlop.status.scheduledFullRenderCount).toBe(0);
  expect(immediateFlop.status.pending).toBe(true);
  expect(immediateFlop.queuedFrames).toBe(1);

  expect(afterTwoFrames.status.scheduledFullRenderCount).toBe(0);
  expect(afterTwoFrames.status.pending).toBe(true);
  expect(afterTwoFrames.previewMarker).toBe("true");
  expect(afterTwoFrames.identities).toEqual(["flop-0", "flop-1", "flop-2"]);

  expect(completedFlop.status.scheduledFullRenderCount).toBe(1);
  expect(completedFlop.status.explicitFullRenderCount).toBe(1);
  expect(completedFlop.status.fallbackFullRenderCount).toBe(0);
  expect(completedFlop.status.preservedBoardRenderCount).toBeGreaterThanOrEqual(1);
  expect(completedFlop.status.pending).toBe(false);
  expect(completedFlop.previewMarker).toBe("");
  expect(completedFlop.identities).toEqual(["flop-0", "flop-1", "flop-2"]);

  expect(immediateTurn.boardLength).toBe(4);
  expect(immediateTurn.renderedCards).toBe(4);
  expect(immediateTurn.stage).toBe("TURN");
  expect(immediateTurn.identities.slice(0, 3)).toEqual(["flop-0", "flop-1", "flop-2"]);
  expect(immediateTurn.identities[3]).toBe("");
  expect(immediateTurn.status.incrementalCardAppendCount).toBeGreaterThanOrEqual(1);
  expect(immediateTurn.status.skippedRenderCount).toBe(2);
  expect(immediateTurn.status.pending).toBe(true);

  expect(completedTurn.status.scheduledFullRenderCount).toBe(2);
  expect(completedTurn.status.explicitFullRenderCount).toBe(2);
  expect(completedTurn.status.preservedBoardRenderCount).toBeGreaterThanOrEqual(2);
  expect(completedTurn.identities.slice(0, 3)).toEqual(["flop-0", "flop-1", "flop-2"]);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
