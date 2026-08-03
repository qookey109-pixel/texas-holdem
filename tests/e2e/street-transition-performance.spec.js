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

  const immediateFlop = await page.evaluate(() => {
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
    advanceStreet();
    render();

    document.querySelectorAll("#boardCards .card").forEach((card, index) => {
      card.dataset.identity = `flop-${index}`;
    });

    return {
      status: window.StreetTransitionPerformance.status(),
      boardLength: state.board.length,
      renderedCards: document.querySelectorAll("#boardCards .card:not(.back)").length,
      previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
      stage: document.querySelector("#boardStageLabel")?.textContent || "",
      identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity),
      buttonsDisabled: ["foldButton", "callButton", "raiseButton", "allInButton"]
        .every(id => document.getElementById(id)?.disabled),
    };
  });

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

  // V1 rebuilt the whole table after about two frames. V2 must keep the preview intact
  // until the normal AI pacing layer requests its next render.
  await page.waitForTimeout(140);
  const beforeAiRender = await page.evaluate(() => ({
    status: window.StreetTransitionPerformance.status(),
    identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity),
    previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
  }));
  expect(beforeAiRender.status.scheduledFullRenderCount).toBe(0);
  expect(beforeAiRender.status.pending).toBe(true);
  expect(beforeAiRender.previewMarker).toBe("true");
  expect(beforeAiRender.identities).toEqual(["flop-0", "flop-1", "flop-2"]);

  const afterAiRender = await page.evaluate(() => {
    render();
    return {
      status: window.StreetTransitionPerformance.status(),
      identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity),
      previewMarker: document.querySelector("#boardCards")?.dataset.streetPreview || "",
    };
  });
  expect(afterAiRender.status.scheduledFullRenderCount).toBe(1);
  expect(afterAiRender.status.explicitFullRenderCount).toBe(1);
  expect(afterAiRender.status.fallbackFullRenderCount).toBe(0);
  expect(afterAiRender.status.preservedBoardRenderCount).toBeGreaterThanOrEqual(1);
  expect(afterAiRender.status.pending).toBe(false);
  expect(afterAiRender.previewMarker).toBe("");
  expect(afterAiRender.identities).toEqual(["flop-0", "flop-1", "flop-2"]);

  const immediateTurn = await page.evaluate(() => {
    advanceStreet();
    render();
    return {
      status: window.StreetTransitionPerformance.status(),
      boardLength: state.board.length,
      renderedCards: document.querySelectorAll("#boardCards .card:not(.back)").length,
      identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity || ""),
      stage: document.querySelector("#boardStageLabel")?.textContent || "",
    };
  });

  expect(immediateTurn.boardLength).toBe(4);
  expect(immediateTurn.renderedCards).toBe(4);
  expect(immediateTurn.stage).toBe("TURN");
  expect(immediateTurn.identities.slice(0, 3)).toEqual(["flop-0", "flop-1", "flop-2"]);
  expect(immediateTurn.identities[3]).toBe("");
  expect(immediateTurn.status.incrementalCardAppendCount).toBeGreaterThanOrEqual(1);
  expect(immediateTurn.status.skippedRenderCount).toBe(2);
  expect(immediateTurn.status.pending).toBe(true);

  const completedTurn = await page.evaluate(() => {
    render();
    return {
      status: window.StreetTransitionPerformance.status(),
      identities: [...document.querySelectorAll("#boardCards .card")].map(card => card.dataset.identity || ""),
    };
  });
  expect(completedTurn.status.scheduledFullRenderCount).toBe(2);
  expect(completedTurn.status.explicitFullRenderCount).toBe(2);
  expect(completedTurn.status.preservedBoardRenderCount).toBeGreaterThanOrEqual(2);
  expect(completedTurn.identities.slice(0, 3)).toEqual(["flop-0", "flop-1", "flop-2"]);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
