import { expect, test } from "@playwright/test";

const OPENING_NAMES = ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"];

async function loadOpeningStrategies(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiOpeningStrategiesV23?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.3.0");
}

test("AI V2.3 開局六位使用獨立公開資訊策略", async ({ page }) => {
  await loadOpeningStrategies(page);

  const snapshot = await page.evaluate(() => ({
    names: window.AiOpeningStrategiesV23.openingNames,
    profileCount: Object.keys(window.AiOpeningStrategiesV23.profiles).length,
    families: Object.values(window.AiOpeningStrategiesV23.profiles).map(profile => profile.family),
    policy: window.AiOpeningStrategiesV23.fairInformationPolicy,
    installed: Boolean(window.__aiOpeningStrategiesV23Installed),
  }));

  expect(snapshot.names).toEqual(OPENING_NAMES);
  expect(snapshot.profileCount).toBe(6);
  expect(new Set(snapshot.families).size).toBe(6);
  expect(snapshot.installed).toBe(true);
  expect(snapshot.policy).toMatchObject({
    ownHoleCards: true,
    publicBoard: true,
    publicActions: true,
    hiddenOpponentCards: false,
    actualDeckOrder: false,
    futureBoardAnswer: false,
    predeterminedWinner: false,
  });
});

test("前十手限制一般加注投入，後段恢復角色侵略空間", async ({ page }) => {
  await loadOpeningStrategies(page);

  const result = await page.evaluate(() => {
    const api = window.AiOpeningStrategiesV23;
    const base = {
      stack: 2000,
      effectiveStack: 2000,
      needed: 0,
      pot: 1200,
      bigBlind: 20,
      minimumRaise: 40,
      activeOpponents: 1,
      baseStrength: 0.82,
      position: "BTN",
      texture: { wetness: 0.08, dry: true },
      canRaise: true,
    };
    return Object.fromEntries(api.openingNames.map(name => {
      const early = api.evaluateScenario(name, { ...base, handNumber: 4 }, 0.99);
      const later = api.evaluateScenario(name, { ...base, handNumber: 14 }, 0.99);
      return [name, {
        earlyAction: early.action,
        earlyRaiseBy: early.raiseBy,
        earlyCap: early.context.maximumCommitted,
        earlyFraction: early.context.capFraction,
        laterRaiseBy: later.raiseBy,
        laterCap: later.context.maximumCommitted,
        laterFraction: later.context.capFraction,
      }];
    }));
  });

  for (const name of OPENING_NAMES) {
    const value = result[name];
    expect(value.earlyFraction).toBeLessThanOrEqual(0.27);
    expect(value.laterFraction).toBeGreaterThan(value.earlyFraction);
    expect(value.earlyRaiseBy).toBeLessThanOrEqual(value.earlyCap);
    expect(value.laterCap).toBeGreaterThan(value.earlyCap);
  }
});

test("弱牌面對重大籌碼風險會棄牌，強牌仍可繼續", async ({ page }) => {
  await loadOpeningStrategies(page);

  const result = await page.evaluate(() => {
    const api = window.AiOpeningStrategiesV23;
    const base = {
      handNumber: 3,
      stack: 1400,
      effectiveStack: 1400,
      needed: 600,
      pot: 900,
      bigBlind: 30,
      minimumRaise: 60,
      activeOpponents: 1,
      position: "CO",
      texture: { wetness: 0.2, dry: true },
      canRaise: true,
    };
    return Object.fromEntries(api.openingNames.map(name => [name, {
      weak: api.evaluateScenario(name, { ...base, baseStrength: 0.5 }, 0.5),
      strong: api.evaluateScenario(name, { ...base, baseStrength: 0.9 }, 0.5),
    }]));
  });

  for (const name of OPENING_NAMES) {
    expect(result[name].weak.action).toBe("fold");
    expect(result[name].weak.hardRiskFold).toBe(true);
    expect(result[name].strong.action).not.toBe("fold");
    expect(result[name].strong.premium).toBe(true);
  }
});

test("角色差異保留：Leo、Foxy、Wolf 主動，Toto 與 Pao 偏控池", async ({ page }) => {
  await loadOpeningStrategies(page);

  const decisions = await page.evaluate(() => {
    const scenario = {
      handNumber: 4,
      stack: 2000,
      effectiveStack: 2000,
      needed: 0,
      pot: 120,
      bigBlind: 20,
      minimumRaise: 40,
      activeOpponents: 2,
      baseStrength: 0.63,
      position: "BTN",
      texture: { wetness: 0.1, dry: true },
      canRaise: true,
    };
    const api = window.AiOpeningStrategiesV23;
    return Object.fromEntries(api.openingNames.map(name => [name, api.evaluateScenario(name, scenario, 0.1).action]));
  });

  expect(decisions.Leo).toBe("raise");
  expect(decisions.Foxy).toBe("raise");
  expect(decisions.Wolf).toBe("raise");
  expect(decisions.Toto).toBe("check");
  expect(decisions.Pao).toBe("check");
});
