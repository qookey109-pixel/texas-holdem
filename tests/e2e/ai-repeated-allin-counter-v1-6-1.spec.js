import { expect, test } from "@playwright/test";

test.describe("AI repeated All-in counter V1.6.1", () => {
  test("最近 12 局滑動窗口會分級啟動並在玩家收斂後衰減", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => window.AiRepeatedAllInCounterV1?.version || ""),
      { timeout: 12_000 },
    ).toBe("1.6.1");

    const result = await page.evaluate(() => {
      const counter = window.AiRepeatedAllInCounterV1;
      state.handNumber = 1;
      counter.reset(1);
      for (const handNumber of [1, 2, 3]) {
        state.handNumber = handNumber;
        counter.observeHeroJam({ handNumber, riskInBigBlinds: 25, priorRaises: 0 });
      }
      const afterThree = counter.recentProfile(3);
      const elite = { name: "Unit-9", isHuman: false };
      const beginner = { name: "Leo", isHuman: false };
      const context = {
        riskInBigBlinds: 18,
        blindVsBlind: false,
        otherContenders: 0,
        potOdds: 0.48,
      };
      const eliteAdjustment = counter.adaptationFor(elite, context, afterThree);
      const beginnerAdjustment = counter.adaptationFor(beginner, context, afterThree);

      for (const handNumber of [4, 5]) {
        state.handNumber = handNumber;
        counter.observeHeroJam({ handNumber, riskInBigBlinds: 25, priorRaises: 0 });
      }
      const afterFive = counter.recentProfile(5);
      const beginnerAfterFive = counter.adaptationFor(beginner, context, afterFive);

      state.handNumber = 17;
      const afterTwelveQuietHands = counter.recentProfile(17);
      const eliteAfterQuiet = counter.adaptationFor(elite, context, afterTwelveQuietHands);

      return {
        afterThree,
        eliteAdjustment,
        beginnerAdjustment,
        afterFive,
        beginnerAfterFive,
        afterTwelveQuietHands,
        eliteAfterQuiet,
      };
    });

    expect(result.afterThree.observedHands).toBe(3);
    expect(result.afterThree.consecutiveJams).toBe(3);
    expect(result.eliteAdjustment).toBeGreaterThan(0);
    expect(result.beginnerAdjustment).toBe(0);
    expect(result.afterFive.jamHands).toBe(5);
    expect(result.beginnerAfterFive).toBeGreaterThan(0);
    expect(result.afterTwelveQuietHands.jamHands).toBe(0);
    expect(result.afterTwelveQuietHands.weightedJamRate).toBe(0);
    expect(result.eliteAfterQuiet).toBe(0);
  });

  test("高階角色反制更快、保守角色仍較緊，且不讀取玩家隱藏底牌", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => window.AiRepeatedAllInCounterV1?.version || ""),
      { timeout: 12_000 },
    ).toBe("1.6.1");

    const result = await page.evaluate(() => {
      const counter = window.AiRepeatedAllInCounterV1;
      state.handNumber = 5;
      counter.reset(1);
      for (const handNumber of [1, 2, 3, 4, 5]) {
        state.handNumber = handNumber;
        counter.observeHeroJam({ handNumber, riskInBigBlinds: 20, priorRaises: 0 });
      }

      const hero = {
        name: "Owl",
        isHuman: true,
        position: 0,
        folded: false,
        allIn: true,
        lastAction: "allin",
        bet: 400,
      };
      Object.defineProperty(hero, "cards", {
        configurable: true,
        get() {
          throw new Error("AI must not read hero hidden cards");
        },
      });
      const makeAi = name => ({
        name,
        isHuman: false,
        position: 1,
        folded: false,
        allIn: false,
        lastAction: "",
        bet: 20,
        stack: 380,
        cards: [
          { value: 14, suit: "spades" },
          { value: 9, suit: "spades" },
        ],
      });
      const unit = makeAi("Unit-9");
      const bruno = makeAi("Bruno");
      const leo = makeAi("Leo");
      state.players = [hero, unit];
      state.board = [];
      state.currentBet = 400;
      state.pot = 440;
      state.blindLevel = { smallBlind: 10, bigBlind: 20, level: 1 };

      const profile = counter.recentProfile(5);
      const context = {
        needed: 380,
        bigBlind: 20,
        pot: 440,
        potOdds: 380 / 820,
        riskInBigBlinds: 19,
        activePlayers: 2,
        otherContenders: 0,
        headsUp: true,
        blindVsBlind: true,
        playerPosition: "BB",
        heroPosition: "SB",
        jam: { isHuman: true, action: "allin-raise" },
      };
      const strongHand = window.AiPreflopRangeEngine.classifyHand(unit);
      const strongPlans = {
        unit: counter.planDefense(unit, { profile, context, hand: strongHand, random: () => 0 }),
        bruno: counter.planDefense(bruno, { profile, context, hand: strongHand, random: () => 0 }),
        leo: counter.planDefense(leo, { profile, context, hand: strongHand, random: () => 0 }),
      };
      const marginalHand = {
        code: "counter-margin",
        score: (strongPlans.unit.baselineThreshold + strongPlans.unit.adjustedThreshold) / 2,
      };
      const marginalUnit = counter.planDefense(unit, {
        profile,
        context,
        hand: marginalHand,
        random: () => 0,
      });

      return {
        strongHandScore: strongHand.score,
        unitAdjustment: strongPlans.unit.adjustment,
        brunoAdjustment: strongPlans.bruno.adjustment,
        leoAdjustment: strongPlans.leo.adjustment,
        unitThreshold: strongPlans.unit.adjustedThreshold,
        brunoThreshold: strongPlans.bruno.adjustedThreshold,
        leoThreshold: strongPlans.leo.adjustedThreshold,
        unitBaseline: strongPlans.unit.baselineThreshold,
        unitStrongAction: strongPlans.unit.action,
        marginalScore: marginalHand.score,
        marginalUnitAction: marginalUnit.action,
        fair: counter.fairInformationPolicy,
        bosses: [
          counter.supports({ name: "Oracle", isHuman: false }),
          counter.supports({ name: "Chronos", isHuman: false }),
          counter.supports({ name: "Gemini", isHuman: false }),
        ],
      };
    });

    expect(result.unitAdjustment).toBeGreaterThan(result.brunoAdjustment);
    expect(result.brunoAdjustment).toBeGreaterThan(result.leoAdjustment);
    expect(result.unitThreshold).toBeLessThan(result.brunoThreshold);
    expect(result.brunoThreshold).toBeLessThanOrEqual(result.leoThreshold);
    expect(result.strongHandScore).toBeGreaterThanOrEqual(result.unitBaseline);
    expect(result.unitStrongAction).toBe("fallback");
    expect(result.marginalScore).toBeGreaterThan(result.unitThreshold);
    expect(result.marginalScore).toBeLessThan(result.unitBaseline);
    expect(result.marginalUnitAction).toBe("call");
    expect(result.fair.hiddenOpponentCards).toBe(false);
    expect(result.fair.actualDeckOrder).toBe(false);
    expect(result.fair.futureBoardAnswer).toBe(false);
    expect(result.bosses).toEqual([false, false, false]);
  });
});
