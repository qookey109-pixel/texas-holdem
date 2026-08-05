import { expect, test } from "@playwright/test";

async function waitForModule(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiRangeWeightV1?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
}

test.describe("AI V2.2 range weight foundation", () => {
  test("builds exactly 1,326 unique two-card combos", async ({ page }) => {
    await waitForModule(page);
    const result = await page.evaluate(() => {
      const combos = AiRangeWeightV1.buildAllCombos();
      return {
        count: combos.length,
        unique: new Set(combos.map(combo => [...combo.keys].sort().join("|"))).size,
        deck: AiRangeWeightV1.buildDeck().length,
      };
    });
    expect(result).toEqual({ count: 1326, unique: 1326, deck: 52 });
  });

  test("removes only known own cards and public board cards", async ({ page }) => {
    await waitForModule(page);
    const result = await page.evaluate(() => AiRangeWeightV1.analyze("Viper", {
      ownCards: [{ value: 14, suit: "s" }, { value: 13, suit: "s" }],
      board: [{ value: 2, suit: "h" }, { value: 7, suit: "d" }, { value: 9, suit: "c" }],
      rangeDiagnostic: {
        actor: "Viper",
        targetStreet: "flop",
        positionLabel: "BTN",
        rangeWidth: 0.35,
        rangeStrength: 0.68,
        bluffDensity: 0.14,
        events: [],
      },
    }));
    expect(result.totalDeckCombos).toBe(1326);
    expect(result.blockedCardCount).toBe(5);
    expect(result.availableComboCount).toBe(1081);
    expect(result.normalizedWeightTotal).toBe(1);
    expect(result.decisionIntegrated).toBe(false);
  });

  test("a narrow aggressive line weights premium classes more than a passive wide line", async ({ page }) => {
    await waitForModule(page);
    const result = await page.evaluate(() => {
      const analyze = rangeDiagnostic => AiRangeWeightV1.analyze("Oracle", {
        ownCards: [{ value: 2, suit: "s" }, { value: 3, suit: "h" }],
        board: [],
        topN: 30,
        rangeDiagnostic,
      });
      return {
        aggressive: analyze({
          actor: "Oracle", targetStreet: "preflop", positionLabel: "UTG",
          rangeWidth: 0.12, rangeStrength: 0.88, bluffDensity: 0.08,
          aggressiveActions: 2, calls: 0,
          events: [{ actionKind: "raise", sizeFraction: 1.2 }],
        }),
        passive: analyze({
          actor: "Oracle", targetStreet: "preflop", positionLabel: "BTN",
          rangeWidth: 0.68, rangeStrength: 0.46, bluffDensity: 0.18,
          aggressiveActions: 0, calls: 1,
          events: [{ actionKind: "call", sizeFraction: 0.3 }],
        }),
      };
    });
    expect(result.aggressive.weightedPreflopStrength).toBeGreaterThan(result.passive.weightedPreflopStrength);
    expect(result.aggressive.topCombos.some(combo => ["AA", "KK", "QQ", "AKs"].includes(combo.class))).toBe(true);
  });

  test("weights are deterministic and class totals remain normalized", async ({ page }) => {
    await waitForModule(page);
    const result = await page.evaluate(() => {
      const options = {
        ownCards: [{ value: 14, suit: "h" }, { value: 10, suit: "h" }],
        board: [{ value: 8, suit: "s" }, { value: 7, suit: "s" }, { value: 2, suit: "d" }],
        rangeDiagnostic: {
          actor: "Unit-9", targetStreet: "flop", positionLabel: "CO",
          rangeWidth: 0.28, rangeStrength: 0.71, bluffDensity: 0.16,
          aggressiveActions: 1, calls: 0,
          events: [{ actionKind: "bet", sizeFraction: 0.5 }],
        },
      };
      const first = AiRangeWeightV1.analyze("Unit-9", options);
      const second = AiRangeWeightV1.analyze("Unit-9", options);
      return {
        first: first.topCombos,
        second: second.topCombos,
        classTotal: first.classSummary.reduce((sum, item) => sum + item.weight, 0),
      };
    });
    expect(result.first).toEqual(result.second);
    expect(result.classTotal).toBeCloseTo(1, 4);
  });

  test("does not inspect opponent cards, deck order or future board", async ({ page }) => {
    await waitForModule(page);
    const result = await page.evaluate(() => {
      const actor = { name: "Chronos" };
      Object.defineProperty(actor, "cards", {
        get() { throw new Error("opponent cards were read"); },
      });
      const history = { streets: { preflop: [], flop: [], turn: [], river: [] } };
      Object.defineProperty(history, "actualDeckOrder", {
        get() { throw new Error("deck order was read"); },
      });
      Object.defineProperty(history, "futureBoard", {
        get() { throw new Error("future board was read"); },
      });
      const analysis = AiRangeWeightV1.analyze(actor, {
        ownCards: [{ value: 4, suit: "c" }, { value: 5, suit: "d" }],
        board: [{ value: 9, suit: "h" }, { value: 9, suit: "s" }, { value: 2, suit: "c" }],
        history,
        street: "flop",
      });
      return { analysis, policy: AiRangeWeightV1.fairInformationPolicy };
    });
    expect(result.analysis.publicInformationOnly).toBe(true);
    expect(result.analysis.decisionIntegrated).toBe(false);
    expect(result.policy.hiddenOpponentCards).toBe(false);
    expect(result.policy.actualDeckOrder).toBe(false);
    expect(result.policy.futureBoardAnswer).toBe(false);
  });
});
