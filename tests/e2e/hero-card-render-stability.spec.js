import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  return issues;
}

test("玩家新底牌先繪製、完整牌桌延後，同一局不重建手牌", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.HeroCardRenderStability?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.0.0");
  await expect.poll(
    () => page.evaluate(() => window.HeroCardRenderStability?.status().pendingDeal || false),
    { timeout: 12_000 },
  ).toBe(false);
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
    window.HeroCardRenderStability.cancel();
    render();
    window.HeroCardRenderStability.flush();
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

    window.StreetTransitionPerformance.cancel();
    window.HeroCardRenderStability.cancel();

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
      if (!frame) throw new Error("expected a queued hero-card paint frame");
      frame.callback(performance.now());
    };

    try {
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
      state.pot = 777;
      state.cardMotionUntil = Date.now() + 1000;
      document.querySelector("#tablePotValue").textContent = "sentinel";
      window.HeroCardRenderStability.resetMetrics();

      render();

      const previewNodes = [...document.querySelectorAll("#playerCards .card")];
      const previewStatus = window.HeroCardRenderStability.status();
      const immediate = {
        newHandReplacedNode: previewNodes[0] !== oldFirstCard,
        cardCount: previewNodes.length,
        potText: document.querySelector("#tablePotValue")?.textContent || "",
        previewMarker: document.querySelector("#playerCards")?.dataset.heroDealPreview || "",
        rootMarker: document.documentElement.dataset.heroDealPreviewPending || "",
        queuedFrames: frameQueue.length,
        animationName: getComputedStyle(previewNodes[0]).animationName,
        status: previewStatus,
      };

      flushNextFrame();
      const afterFirstFrame = {
        potText: document.querySelector("#tablePotValue")?.textContent || "",
        pending: window.HeroCardRenderStability.status().pendingDeal,
        queuedFrames: frameQueue.length,
      };

      flushNextFrame();
      const completedNodes = [...document.querySelectorAll("#playerCards .card")];
      const completed = {
        potText: document.querySelector("#tablePotValue")?.textContent || "",
        previewMarker: document.querySelector("#playerCards")?.dataset.heroDealPreview || "",
        rootMarker: document.documentElement.dataset.heroDealPreviewPending || "",
        samePreviewNodes: previewNodes.every((node, index) => completedNodes[index] === node),
        status: window.HeroCardRenderStability.status(),
      };

      return {
        sameAfterNormalRenders,
        sameAfterStreet,
        identitiesAfterStreet,
        initialSignature,
        signatureAfterStreet: statusAfterStreet.visibleCardSignature,
        preservedRenderCount: statusAfterStreet.preservedRenderCount,
        immediate,
        afterFirstFrame,
        completed,
      };
    } finally {
      window.HeroCardRenderStability.cancel();
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
    }
  });

  expect(result.sameAfterNormalRenders).toBe(true);
  expect(result.sameAfterStreet).toBe(true);
  expect(result.identitiesAfterStreet).toEqual(["hero-0", "hero-1"]);
  expect(result.signatureAfterStreet).toBe(result.initialSignature);
  expect(result.preservedRenderCount).toBeGreaterThanOrEqual(3);

  expect(result.immediate.newHandReplacedNode).toBe(true);
  expect(result.immediate.cardCount).toBe(2);
  expect(result.immediate.potText).toBe("sentinel");
  expect(result.immediate.previewMarker).toBe("true");
  expect(result.immediate.rootMarker).toBe("true");
  expect(result.immediate.queuedFrames).toBe(1);
  expect(result.immediate.animationName).toContain("heroDealInV2");
  expect(result.immediate.status.pendingDeal).toBe(true);
  expect(result.immediate.status.earlyPaintCount).toBe(1);
  expect(result.immediate.status.deferredFullRenderCount).toBe(0);

  expect(result.afterFirstFrame.potText).toBe("sentinel");
  expect(result.afterFirstFrame.pending).toBe(true);
  expect(result.afterFirstFrame.queuedFrames).toBe(1);

  expect(result.completed.potText).toBe("777");
  expect(result.completed.previewMarker).toBe("");
  expect(result.completed.rootMarker).toBe("");
  expect(result.completed.samePreviewNodes).toBe(true);
  expect(result.completed.status.pendingDeal).toBe(false);
  expect(result.completed.status.matchesState).toBe(true);
  expect(result.completed.status.earlyPaintCount).toBe(1);
  expect(result.completed.status.deferredFullRenderCount).toBe(1);

  await page.waitForTimeout(100);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
