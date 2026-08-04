import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test("玩家底牌每局只發一次，翻牌轉牌河牌不重建也不重播動畫", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.HeroCardRenderStability?.version || ""),
    { timeout: 12_000 },
  ).toBe("3.0.0");

  const result = await page.evaluate(async () => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    window.StreetTransitionPerformance?.cancel?.();
    clearAutoNewHandTimer();
    clearDialogueTimers();

    state.autoNewHand = false;
    state.handOver = false;
    state.waitingForHuman = false;
    state.board = [];
    state.street = "翻牌前";
    state.currentBet = 0;
    state.lastRaiseSize = currentBigBlind();
    state.lastAggressor = null;
    state.currentActorIndex = -1;
    state.deck = shuffle(createDeck());
    state.coach.enabled = false;
    state.players.forEach(player => {
      player.bet = 0;
      player.totalContribution = 0;
      player.folded = false;
      player.allIn = false;
      player.hasActed = true;
      player.raiseLocked = false;
      player.status = "已行動";
      player.lastAction = "";
    });

    render();
    window.HeroCardRenderStability.refresh();
    document.querySelectorAll("#playerCards .card").forEach(card => {
      card.getAnimations().forEach(animation => animation.cancel());
    });
    window.HeroCardRenderStability.resetMetrics();

    const playerCards = document.querySelector("#playerCards");
    const originalNodes = [...playerCards.querySelectorAll(".card")];
    originalNodes.forEach((node, index) => {
      node.dataset.heroIdentity = `hero-${index}`;
    });

    let childMutationCount = 0;
    let observedAnimationStarts = 0;
    const observer = new MutationObserver(records => {
      childMutationCount += records.filter(record => record.type === "childList").length;
    });
    observer.observe(playerCards, { childList: true, subtree: false });
    const onAnimationStart = event => {
      if (event.target?.classList?.contains("card")) observedAnimationStarts += 1;
    };
    playerCards.addEventListener("animationstart", onAnimationStart, true);

    const streetSnapshots = [];
    for (const expectedCount of [3, 4, 5]) {
      advanceStreet();
      render();
      render();
      await Promise.resolve();
      const currentNodes = [...playerCards.querySelectorAll(".card")];
      streetSnapshots.push({
        expectedCount,
        boardCount: state.board.length,
        sameNodes: originalNodes.every((node, index) => currentNodes[index] === node),
        identities: currentNodes.map(node => node.dataset.heroIdentity || ""),
      });
    }

    observer.disconnect();
    playerCards.removeEventListener("animationstart", onAnimationStart, true);
    const sameHandStatus = window.HeroCardRenderStability.status();

    const oldFirstCard = originalNodes[0];
    const oldKeys = new Set((human().cards || []).map(card => `${card.value ?? card.label ?? ""}${card.suit ?? ""}`));
    human().cards = createDeck()
      .filter(card => !oldKeys.has(`${card.value ?? card.label ?? ""}${card.suit ?? ""}`))
      .slice(0, 2);
    state.handNumber += 1;
    state.board = [];
    state.street = "翻牌前";
    state.cardMotionUntil = Date.now() + 1000;
    window.HeroCardRenderStability.resetMetrics();
    render();
    await Promise.resolve();

    const newHandNodes = [...playerCards.querySelectorAll(".card")];
    const newHandStatus = window.HeroCardRenderStability.status();

    return {
      streetSnapshots,
      childMutationCount,
      observedAnimationStarts,
      sameHandStatus,
      newHandReplacedNode: newHandNodes[0] !== oldFirstCard,
      newHandCardCount: newHandNodes.length,
      newHandStatus,
    };
  });

  expect(result.streetSnapshots).toHaveLength(3);
  for (const snapshot of result.streetSnapshots) {
    expect(snapshot.boardCount).toBe(snapshot.expectedCount);
    expect(snapshot.sameNodes).toBe(true);
    expect(snapshot.identities).toEqual(["hero-0", "hero-1"]);
  }
  expect(result.childMutationCount).toBe(0);
  expect(result.observedAnimationStarts).toBe(0);
  expect(result.sameHandStatus.suppressedWriteCount).toBeGreaterThanOrEqual(6);
  expect(result.sameHandStatus.allowedWriteCount).toBe(0);
  expect(result.sameHandStatus.matchesState).toBe(true);

  expect(result.newHandReplacedNode).toBe(true);
  expect(result.newHandCardCount).toBe(2);
  expect(result.newHandStatus.allowedWriteCount).toBe(1);
  expect(result.newHandStatus.matchesState).toBe(true);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
