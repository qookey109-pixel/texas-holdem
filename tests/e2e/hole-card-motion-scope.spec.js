import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test("翻牌轉牌河牌只發公共牌，所有玩家底牌不再重播動畫", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.HoleCardMotionScope?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
  await expect(page.locator('script[src="js/hero-card-render-stability.js?v=hero-cards-v3"]')).toHaveCount(1);
  await expect(page.locator('script[src="js/hole-card-motion-scope.js?v=hole-card-motion-v1"]')).toHaveCount(1);

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
    window.HeroCardRenderStability?.refresh?.();
    document.querySelectorAll("#playerCards .card, .seat-card-zone .card").forEach(card => {
      card.getAnimations().forEach(animation => animation.cancel());
    });

    let holeAnimationStarts = 0;
    const onAnimationStart = event => {
      if (event.target?.closest?.("#playerCards, .seat-card-zone")) holeAnimationStarts += 1;
    };
    document.addEventListener("animationstart", onAnimationStart, true);

    const snapshots = [];
    try {
      for (const expectedBoardCount of [3, 4, 5]) {
        advanceStreet();
        clearDialogueTimers();
        render();
        await new Promise(resolve => setTimeout(resolve, 40));

        const heroCards = [...document.querySelectorAll("#playerCards .card")];
        const opponentCards = [...document.querySelectorAll(".seat-card-zone .cards > .card")];
        const boardCards = [...document.querySelectorAll("#boardCards .card")];
        const latestBoardCard = boardCards.at(-1);

        snapshots.push({
          expectedBoardCount,
          boardCount: state.board.length,
          phase: document.documentElement.dataset.holeCardMotion || "",
          heroAnimationNames: heroCards.map(card => getComputedStyle(card).animationName),
          opponentAnimationNames: opponentCards.map(card => getComputedStyle(card).animationName),
          latestBoardAnimationName: latestBoardCard ? getComputedStyle(latestBoardCard).animationName : "none",
          latestBoardStatic: latestBoardCard?.classList.contains("is-static") ?? true,
        });
      }
    } finally {
      document.removeEventListener("animationstart", onAnimationStart, true);
    }

    state.board = [];
    state.street = "翻牌前";
    markCardsForMotion();
    render();

    return {
      snapshots,
      holeAnimationStarts,
      newHandPhase: document.documentElement.dataset.holeCardMotion || "",
      scopeStatus: window.HoleCardMotionScope.status(),
    };
  });

  expect(result.snapshots).toHaveLength(3);
  for (const snapshot of result.snapshots) {
    expect(snapshot.boardCount).toBe(snapshot.expectedBoardCount);
    expect(snapshot.phase).toBe("locked");
    expect(snapshot.heroAnimationNames.length).toBe(2);
    expect(snapshot.heroAnimationNames.every(name => name === "none")).toBe(true);
    expect(snapshot.opponentAnimationNames.length).toBeGreaterThan(0);
    expect(snapshot.opponentAnimationNames.every(name => name === "none")).toBe(true);
    expect(snapshot.latestBoardStatic).toBe(false);
    expect(snapshot.latestBoardAnimationName).not.toBe("none");
  }

  expect(result.holeAnimationStarts).toBe(0);
  expect(result.newHandPhase).toBe("deal");
  expect(result.scopeStatus.installed).toBe(true);
  expect(result.scopeStatus.styleInstalled).toBe(true);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
