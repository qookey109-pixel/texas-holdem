import { expect, test } from "@playwright/test";

async function waitForRangeFilter(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiRangeHistoryFilterV1?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
}

test.describe("AI V2.2 range history filter foundation", () => {
  test("loads a public-history-only diagnostic API without decision integration", async ({ page }) => {
    await waitForRangeFilter(page);

    const result = await page.evaluate(() => ({
      version: AiRangeHistoryFilterV1.version,
      historySchemaVersion: AiRangeHistoryFilterV1.historySchemaVersion,
      policy: AiRangeHistoryFilterV1.fairInformationPolicy,
      api: [
        "normalizeStreet",
        "actionKind",
        "eventSizeFraction",
        "analyzeEvents",
        "actorEventsFromHistory",
        "analyzeActor",
        "analyzeAll",
      ].filter(key => typeof AiRangeHistoryFilterV1[key] === "function"),
      ready: document.documentElement.dataset.aiRangeHistoryFilter,
    }));

    expect(result.version).toBe("1.0.0");
    expect(result.historySchemaVersion).toBe("2.2.0");
    expect(result.api).toHaveLength(7);
    expect(result.ready).toBe("ready");
    expect(result.policy).toMatchObject({
      publicActionHistoryOnly: true,
      publicPositions: true,
      publicBetSizes: true,
      hiddenOpponentCards: false,
      opponentCardInspection: false,
      actualDeckOrder: false,
      futureBoardAnswer: false,
      predeterminedWinner: false,
    });
  });

  test("a polarized river betting line narrows much more than a passive check line", async ({ page }) => {
    await waitForRangeFilter(page);

    const result = await page.evaluate(() => {
      const event = (sequence, street, action, options = {}) => ({
        sequence,
        streetActionIndex: sequence,
        handNumber: 801,
        street,
        actor: "Viper",
        positionLabel: options.positionLabel || "BTN",
        action,
        isAggressive: ["raise", "allin-raise"].includes(action),
        isForcedBet: false,
        isAllIn: action.startsWith("allin"),
        contribution: options.contribution || 0,
        amountToCallBefore: options.amountToCallBefore || 0,
        raiseBy: options.raiseBy || 0,
        potBefore: options.potBefore || 100,
        contributionPotFraction: options.size || 0,
        raiseByPotFraction: 0,
        activeOpponentCount: 1,
        publicInformationOnly: true,
      });

      const aggressive = [
        event(1, "preflop", "raise", {
          positionLabel: "BTN",
          size: 0.8,
          amountToCallBefore: 20,
          contribution: 60,
          potBefore: 30,
        }),
        event(2, "flop", "raise", {
          size: 0.5,
          amountToCallBefore: 0,
          contribution: 60,
          potBefore: 120,
        }),
        event(3, "turn", "check"),
        event(4, "river", "raise", {
          size: 1,
          amountToCallBefore: 0,
          contribution: 300,
          potBefore: 300,
        }),
      ];
      const passive = [
        event(1, "preflop", "call", {
          positionLabel: "BTN",
          size: 0.5,
          amountToCallBefore: 20,
          contribution: 20,
          potBefore: 40,
        }),
        event(2, "flop", "check"),
        event(3, "turn", "check"),
        event(4, "river", "check"),
      ];

      return {
        aggressive: AiRangeHistoryFilterV1.analyzeEvents("Viper", aggressive, { street: "river" }),
        passive: AiRangeHistoryFilterV1.analyzeEvents("Viper", passive, { street: "river" }),
      };
    });

    expect(result.aggressive.rangeWidth).toBeLessThan(0.2);
    expect(result.passive.rangeWidth).toBeGreaterThan(0.35);
    expect(result.aggressive.rangeWidth).toBeLessThan(result.passive.rangeWidth);
    expect(result.aggressive.rangeStrength).toBeGreaterThan(result.passive.rangeStrength);
    expect(result.aggressive.nutDensity).toBeGreaterThan(result.passive.nutDensity);
    expect(result.aggressive.valueDensity).toBeGreaterThan(result.passive.valueDensity);
    expect(result.aggressive.bluffDensity).toBeGreaterThan(0.02);
    expect(result.aggressive.decisionIntegrated).toBe(false);

    const widths = [
      result.aggressive.preflopWidth,
      result.aggressive.flopWidth,
      result.aggressive.turnWidth,
      result.aggressive.riverWidth,
    ];
    expect(widths.every((width, index) => index === 0 || width <= widths[index - 1])).toBe(true);
  });

  test("larger public call prices retain fewer combinations than small calls", async ({ page }) => {
    await waitForRangeFilter(page);

    const result = await page.evaluate(() => {
      const line = size => ([
        {
          sequence: 1,
          streetActionIndex: 1,
          handNumber: 802,
          street: "preflop",
          actor: "Ace",
          positionLabel: "CO",
          action: "raise",
          isAggressive: true,
          amountToCallBefore: 20,
          contribution: 60,
          potBefore: 30,
          contributionPotFraction: 0.8,
          publicInformationOnly: true,
        },
        {
          sequence: 2,
          streetActionIndex: 1,
          handNumber: 802,
          street: "flop",
          actor: "Ace",
          positionLabel: "CO",
          action: "call",
          amountToCallBefore: Math.round(100 * size),
          contribution: Math.round(100 * size),
          potBefore: 100,
          contributionPotFraction: size,
          publicInformationOnly: true,
        },
      ]);

      return {
        small: AiRangeHistoryFilterV1.analyzeEvents("Ace", line(0.25), { street: "flop" }),
        large: AiRangeHistoryFilterV1.analyzeEvents("Ace", line(1), { street: "flop" }),
      };
    });

    expect(result.large.rangeWidth).toBeLessThan(result.small.rangeWidth);
    expect(result.large.rangeStrength).toBeGreaterThan(result.small.rangeStrength);
    expect(result.large.confidence).toBeGreaterThan(result.small.confidence);
  });

  test("reads Action History schema 2.2.0 and exposes a per-street diagnostic chain", async ({ page }) => {
    await waitForRangeFilter(page);

    const result = await page.evaluate(() => {
      const history = {
        version: "1.1.0",
        schemaVersion: "2.2.0",
        handNumber: 803,
        publicInformationOnly: true,
        streets: {
          preflop: [{
            sequence: 1,
            streetActionIndex: 1,
            handNumber: 803,
            street: "preflop",
            actor: "Nori",
            positionLabel: "HJ",
            action: "raise",
            isAggressive: true,
            amountToCallBefore: 20,
            contribution: 60,
            potBefore: 30,
            contributionPotFraction: 0.8,
            publicInformationOnly: true,
          }],
          flop: [{
            sequence: 2,
            streetActionIndex: 1,
            handNumber: 803,
            street: "flop",
            actor: "Nori",
            positionLabel: "HJ",
            action: "raise",
            isAggressive: true,
            amountToCallBefore: 0,
            contribution: 70,
            potBefore: 140,
            contributionPotFraction: 0.5,
            publicInformationOnly: true,
          }],
          turn: [{
            sequence: 3,
            streetActionIndex: 1,
            handNumber: 803,
            street: "turn",
            actor: "Nori",
            positionLabel: "HJ",
            action: "call",
            amountToCallBefore: 180,
            contribution: 180,
            potBefore: 360,
            contributionPotFraction: 0.5,
            publicInformationOnly: true,
          }],
          river: [],
        },
      };

      return AiRangeHistoryFilterV1.analyzeActor("Nori", {
        history,
        street: "turn",
      });
    });

    expect(result.actor).toBe("Nori");
    expect(result.historySchemaVersion).toBe("2.2.0");
    expect(result.streets.preflop.actionCount).toBe(1);
    expect(result.streets.flop.actionCount).toBe(1);
    expect(result.streets.turn.actionCount).toBe(1);
    expect(result.riverWidth).toBeNull();
    expect(result.events.map(event => event.actionKind)).toEqual(["raise", "bet", "call"]);
    expect(result.events.every(event => event.publicInformationOnly)).toBe(true);
  });

  test("does not inspect player cards, hidden event fields, deck order or future board", async ({ page }) => {
    await waitForRangeFilter(page);

    const result = await page.evaluate(() => {
      const actor = { name: "Oracle" };
      Object.defineProperty(actor, "cards", {
        get() {
          throw new Error("opponent hidden cards were read");
        },
      });

      const publicEvent = {
        sequence: 1,
        streetActionIndex: 1,
        handNumber: 804,
        street: "flop",
        actor: "Oracle",
        positionLabel: "BB",
        action: "check",
        potBefore: 120,
        publicInformationOnly: true,
      };
      Object.defineProperty(publicEvent, "hiddenCards", {
        get() {
          throw new Error("hidden event cards were read");
        },
      });

      const history = {
        schemaVersion: "2.2.0",
        streets: {
          preflop: [],
          flop: [publicEvent],
          turn: [],
          river: [],
        },
      };
      Object.defineProperty(history, "actualDeckOrder", {
        get() {
          throw new Error("actual deck order was read");
        },
      });
      Object.defineProperty(history, "futureBoard", {
        get() {
          throw new Error("future board answer was read");
        },
      });

      Object.defineProperty(state, "deck", {
        configurable: true,
        get() {
          throw new Error("global deck was read");
        },
      });
      Object.defineProperty(state, "futureBoard", {
        configurable: true,
        get() {
          throw new Error("global future board was read");
        },
      });

      try {
        return {
          analysis: AiRangeHistoryFilterV1.analyzeActor(actor, {
            history,
            street: "flop",
          }),
          policy: AiRangeHistoryFilterV1.fairInformationPolicy,
        };
      } finally {
        delete state.deck;
        delete state.futureBoard;
      }
    });

    expect(result.analysis.actor).toBe("Oracle");
    expect(result.analysis.publicInformationOnly).toBe(true);
    expect(result.analysis.decisionIntegrated).toBe(false);
    expect(result.policy.hiddenOpponentCards).toBe(false);
    expect(result.policy.actualDeckOrder).toBe(false);
    expect(result.policy.futureBoardAnswer).toBe(false);
    expect(result.policy.predeterminedWinner).toBe(false);
  });
});
