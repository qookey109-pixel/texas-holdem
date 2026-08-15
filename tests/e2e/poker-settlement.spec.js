import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];

  page.on("pageerror", error => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });

  page.on("requestfailed", request => {
    issues.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });

  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.endsWith("/favicon.ico")) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return issues;
}

async function openFreshTable(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#playerCards .card")).toHaveCount(2);
  await expect(page.locator("#opponents .seat")).toHaveCount(6);
}

test("固定牌面攤牌會發出五張公共牌、分配底池並顯示勝者", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);
  await openFreshTable(page);

  const coachToggle = page.locator("#coachEnabled");
  await expect(coachToggle).not.toBeChecked();
  await coachToggle.check();
  await expect.poll(() => page.evaluate(() => state.coach.enabled)).toBe(true);

  await expect.poll(
    () => page.evaluate(() => Boolean(window.CoachReviewPlacement?.version)),
    { timeout: 5_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.CoachHandReviewIntegration?.version || ""),
    { timeout: 5_000 },
  ).toBe("1.0.1");

  await page.evaluate(() => {
    const suitSymbols = { s: "♠", h: "♥", d: "♦", c: "♣" };
    const card = (label, value, suit) => ({ label, value, suit, suitSymbol: suitSymbols[suit] });

    Audio.cleanup();
    clearAutoNewHandTimer();
    clearDialogueTimers();

    state.players.forEach(player => {
      player.folded = true;
      player.allIn = false;
      player.bet = 0;
      player.totalContribution = 0;
      player.hasActed = true;
      player.raiseLocked = false;
    });

    const hero = state.players[0];
    const opponent = state.players[1];

    hero.folded = false;
    hero.stack = 800;
    hero.cards = [card("A", 14, "s"), card("K", 13, "d")];
    hero.totalContribution = 100;

    opponent.folded = false;
    opponent.stack = 800;
    opponent.cards = [card("9", 9, "h"), card("9", 9, "d")];
    opponent.totalContribution = 100;

    state.board = [
      card("2", 2, "c"),
      card("3", 3, "d"),
      card("4", 4, "h"),
      card("5", 5, "s"),
      card("9", 9, "c"),
    ];
    state.pot = 200;
    state.currentBet = 100;
    state.street = "河牌";
    state.handOver = false;
    state.waitingForHuman = false;
    state.sessionEnded = false;
    state.heroCurrentHand = createHeroHandTracker();

    HandReview.beginCurrentHand({ startingStack: 800 });
    recordHeroAction("raise", 100);
    showdown();
  });

  await expect(page.locator("#boardCards .card")).toHaveCount(5);
  await expect(page.locator("#showdownBanner")).toHaveClass(/is-visible/);
  await expect(page.locator("#showdownBanner")).toContainText("Owl");
  await expect(page.locator("#showdownBanner")).toContainText("順子");
  await expect(page.locator("#gameLog")).toContainText(/Owl.*順子.*底池 200/);

  const review = page.locator("#handReviewPanel");
  await expect(review).toBeVisible();
  await expect(review).toHaveAttribute("data-review-owner", "coach");
  await expect(page.locator("#coachReviewMount > #handReviewPanel")).toHaveCount(1);
  await expect(page.locator("#historyPanel > #handReviewPanel")).toHaveCount(0);
  await expect(review).toContainText("本手覆盤");
  await expect(review).toContainText(/A♠\s*K♦/);
  await expect(review).toContainText("順子");
  await expect(review).toContainText(/河牌\s*加注 100/);
  await expect(review).toContainText("教練總結");
  await expect(review.locator(".hand-review-quality")).toHaveText("良好");
  await expect(review).toContainText("牌力與尺寸協調");
  await expect(review.locator("#handReviewOpponents [data-review-opponent]")).toHaveCount(1);
  await expect(review.locator("[data-review-opponent]")).toContainText(/9♥\s*9♦/);

  const result = await page.evaluate(() => {
    const reviewPanel = document.querySelector("#handReviewPanel");
    const coachPanel = document.querySelector("#coachPanel");
    const historyPanel = document.querySelector("#historyPanel");
    const reviewRect = reviewPanel?.getBoundingClientRect();
    const historyRect = historyPanel?.getBoundingClientRect();

    return {
      pot: state.pot,
      handOver: state.handOver,
      street: state.street,
      winners: [...state.winners],
      heroStack: human().stack,
      reviewNet: HandReview.latest()?.net,
      reviewOpponentCount: HandReview.latest()?.opponents.length,
      reviewDecisionScore: HandReview.latest()?.decisionAnalyses?.[0]?.score,
      reviewDecisionLabel: HandReview.latest()?.decisionAnalyses?.[0]?.qualityLabel,
      reviewAnalysisVersion: HandReviewAnalysis?.version,
      reviewPlacementVersion: CoachReviewPlacement?.version,
      reviewParentId: reviewPanel?.parentElement?.id,
      reviewInsideCoach: Boolean(reviewPanel?.closest("#coachPanel") === coachPanel),
      reviewInsideHistory: Boolean(reviewPanel?.closest("#historyPanel")),
      reviewAboveHistory: Boolean(reviewRect && historyRect && reviewRect.top < historyRect.top),
    };
  });

  expect(result).toEqual({
    pot: 0,
    handOver: true,
    street: "結算",
    winners: ["Owl"],
    heroStack: 1000,
    reviewNet: 200,
    reviewOpponentCount: 1,
    reviewDecisionScore: 82,
    reviewDecisionLabel: "良好",
    reviewAnalysisVersion: "2.0.0",
    reviewPlacementVersion: "2.0.0",
    reviewParentId: "coachReviewMount",
    reviewInsideCoach: true,
    reviewInsideHistory: false,
    reviewAboveHistory: true,
  });

  await page.waitForTimeout(300);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});