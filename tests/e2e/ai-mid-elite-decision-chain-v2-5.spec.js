import { expect, test } from "@playwright/test";

async function loadDecisionChain(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.AiMidEliteDecisionChainV25?.version || ""),
    { timeout: 12_000 },
  ).toBe("2.5.1");
}

test("V2.5 完整決策鏈保留淨 EV、角色校準與 Board Intelligence", async ({ page }) => {
  await loadDecisionChain(page);
  const result = await page.evaluate(() => {
    const baseDecision = {
      action: "call",
      raiseBy: 0,
      sizeFraction: 0,
      reason: "base",
      callScore: 0.12,
      raiseScore: 0.04,
      bluffing: false,
      valueReady: false,
      equityProxy: 0.64,
      context: {
        street: "turn",
        needed: 80,
        pot: 360,
        potOdds: 80 / 440,
        equityProxy: 0.64,
        drawPotential: 0.02,
        canRaise: false,
        activeOpponents: 1,
      },
      candidates: [],
    };
    return window.AiMidEliteDecisionChainV25.composeDecision(
      { name: "Bruno", cards: [{ value: 14, suit: "c" }, { value: 11, suit: "d" }] },
      {
        baseDecision,
        skipSpr: true,
        board: [
          { value: 13, suit: "s" }, { value: 8, suit: "h" },
          { value: 3, suit: "d" }, { value: 2, suit: "c" },
        ],
      },
    );
  });

  expect(result.evAccountingVersion).toBe("1.0.1");
  expect(result.roleStrength.rating).toBeGreaterThan(0);
  expect(result.boardIntelligenceIntegrated).toBe(true);
  expect(result.decisionChainIntegrated).toBe(true);
  expect(result.decisionChainOrder).toEqual([
    "range/multiway", "net-ev", "role", "board/blocker", "spr",
  ]);
});

test("Board 尺寸修正後仍受淨 EV 安全閘約束", async ({ page }) => {
  await loadDecisionChain(page);
  const result = await page.evaluate(() => window.AiMidEliteDecisionChainV25.guardNetEv({
    action: "raise",
    raiseBy: 300,
    sizeFraction: 0.75,
    reason: "board resize",
    evAccountingVersion: "1.0.1",
    callEv: 20,
    bluffing: true,
    context: { needed: 0 },
    candidates: [{ raiseBy: 300, fraction: 0.75, ev: 10 }],
  }));

  expect(result.action).toBe("call");
  expect(result.raiseBy).toBe(0);
  expect(result.decisionChainAdjustment).toBe("net-ev-guard");
});

test("深 SPR 控制邊緣加注，淺 SPR 取消無聽牌純詐唬", async ({ page }) => {
  await loadDecisionChain(page);
  const result = await page.evaluate(() => {
    const api = window.AiMidEliteDecisionChainV25;
    const deep = api.applySprGuard({ name: "Ace" }, {
      action: "raise",
      raiseBy: 260,
      sizeFraction: 0.65,
      bluffing: false,
      valueReady: false,
      context: { street: "turn", needed: 0, equityProxy: 0.52, drawPotential: 0.08 },
    }, {
      sprContext: { effectiveSpr: 9.5, sprBand: "deep", effectiveBehind: 3800 },
    });
    const shallow = api.applySprGuard({ name: "Vlad" }, {
      action: "raise",
      raiseBy: 300,
      sizeFraction: 0.9,
      bluffing: true,
      valueReady: false,
      context: { street: "river", needed: 120, equityProxy: 0.35, drawPotential: 0 },
    }, {
      sprContext: { effectiveSpr: 1.4, sprBand: "shallow", effectiveBehind: 420 },
    });
    return { deep, shallow };
  });

  expect(result.deep.action).toBe("call");
  expect(result.deep.decisionChainAdjustment).toBe("deep-spr-pot-control");
  expect(result.shallow.action).toBe("fold");
  expect(result.shallow.decisionChainAdjustment).toBe("shallow-spr-suppress-air");
});

test("完整決策鏈只支援中階與高階，公平資訊限制保持關閉隱藏牌", async ({ page }) => {
  await loadDecisionChain(page);
  const result = await page.evaluate(() => ({
    supportsAce: window.AiMidEliteDecisionChainV25.supports("Ace"),
    supportsUnit9: window.AiMidEliteDecisionChainV25.supports("Unit-9"),
    supportsLeo: window.AiMidEliteDecisionChainV25.supports("Leo"),
    supportsOracle: window.AiMidEliteDecisionChainV25.supports("Oracle"),
    policy: window.AiMidEliteDecisionChainV25.fairInformationPolicy,
  }));

  expect(result.supportsAce).toBe(true);
  expect(result.supportsUnit9).toBe(true);
  expect(result.supportsLeo).toBe(false);
  expect(result.supportsOracle).toBe(false);
  expect(result.policy.hiddenOpponentCards).toBe(false);
  expect(result.policy.actualDeckOrder).toBe(false);
  expect(result.policy.futureBoardAnswer).toBe(false);
});
