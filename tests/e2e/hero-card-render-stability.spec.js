import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test("玩家手牌在同一局與街道轉場不重建，新局仍正常換牌", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.HeroCardRenderStability?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.StreetTransitionPerformance?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.0.0");

  const result = await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
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

    window.StreetTransitionPerformance.cancel();
    render();
    window.HeroCardRenderStability.refresh();
    window.HeroCardRenderStability.resetMetrics();

    const originalNodes = [...document.querySelectorAll("#playerCards .card")];
    originalNodes.forEach((card, index) => {
      card.dataset.heroIdentity = `hero-${index}`;
    });
    const initialSignature = window.HeroCardRenderStability.status().visibleCardSignature;

    render();
    render();
    const sameAfterNormalRenders = originalNodes.every(
      (node, index) => document.querySelectorAll("#playerCards .card")[index] === node,
    );

    advanceStreet();
    render();
    render();
    const afterStreetNodes = [...document.querySelectorAll("#playerCards .card")];
    const sameAfterStreet = originalNodes.every((node, index) => afterStreetNodes[index] === node);
    const identitiesAfterStreet = afterStreetNodes.map(card => card.dataset.heroIdentity || "");
    const statusAfterStreet = window.HeroCardRenderStability.status();

    const oldFirstCard = afterStreetNodes[0];
    const oldCards = human().cards || [];
    const oldKeys = new Set(oldCards.map(card => `${card.value ?? card.label ?? ""}${card.suit ?? ""}`));
    const replacementCards = createDeck()
      .filter(card => !oldKeys.has(`${card.value ?? card.label ?? ""}${card.suit ?? ""}`))
      .slice(0, 2);

    state.handNumber += 1;
    human().cards = replacementCards;
    state.board = [];
    state.street = "翻牌前";
    state.cardMotionUntil = performance.now() + 1000;
    render();

    const newNodes = [...document.querySelectorAll("#playerCards .card")];
    const statusAfterNewHand = window.HeroCardRenderStability.status();

    return {
      sameAfterNormalRenders,
      sameAfterStreet,
      identitiesAfterStreet,
      initialSignature,
      signatureAfterStreet: statusAfterStreet.visibleCardSignature,
      preservedRenderCount: statusAfterStreet.preservedRenderCount,
      refreshedRenderCount: statusAfterStreet.refreshedRenderCount,
      newHandReplacedNode: newNodes[0] !== oldFirstCard,
      newHandSignatureChanged: statusAfterNewHand.visibleCardSignature !== initialSignature,
      newHandMatchesState: statusAfterNewHand.matchesState,
      newHandCardCount: newNodes.length,
    };
  });

  expect(result.sameAfterNormalRenders).toBe(true);
  expect(result.sameAfterStreet).toBe(true);
  expect(result.identitiesAfterStreet).toEqual(["hero-0", "hero-1"]);
  expect(result.signatureAfterStreet).toBe(result.initialSignature);
  expect(result.preservedRenderCount).toBeGreaterThanOrEqual(3);
  expect(result.refreshedRenderCount).toBe(0);

  expect(result.newHandReplacedNode).toBe(true);
  expect(result.newHandSignatureChanged).toBe(true);
  expect(result.newHandMatchesState).toBe(true);
  expect(result.newHandCardCount).toBe(2);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
