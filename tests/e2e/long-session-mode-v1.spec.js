import { expect, test } from "@playwright/test";

async function loadLongSession(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionModeV1?.isInstalled?.() === true),
    { timeout: 12_000 },
  ).toBe(true);
}

test("Long Session boots OFF and preserves production Normal economy", async ({ page }) => {
  await loadLongSession(page);

  const result = await page.evaluate(() => ({
    active: window.LongSessionModeV1.isActive(),
    snapshot: window.LongSessionModeV1.snapshot(),
    buttonPressed: document.querySelector("#longSessionModeButton")?.getAttribute("aria-pressed"),
    levels: [1, 6, 11, 16, 21].map(hand => {
      const level = blindLevelForHand(hand);
      return [level.small, level.big, level.buyIn, Boolean(level.longSession)];
    }),
    normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    stateMode: state.gameMode || "normal",
    blindMetadata: {
      tournamentEconomyG1: blindLevelForHand.__tournamentEconomyG1 === true,
      longSessionModeV1: blindLevelForHand.__longSessionModeV1 === true,
    },
  }));

  expect(result.active).toBe(false);
  expect(result.snapshot.session).toBeNull();
  expect(result.buttonPressed).toBe("false");
  expect(result.stateMode).toBe("normal");
  expect(result.blindMetadata).toEqual({ tournamentEconomyG1: true, longSessionModeV1: true });
  expect(result.levels).toEqual([
    [10, 20, 2000, false],
    [20, 40, 4500, false],
    [50, 100, 7000, false],
    [100, 200, 10000, false],
    [200, 400, 15000, false],
  ]);
  expect(result.normalConfig).toMatchObject({
    strategy: "median-v2",
    tableMedianRatio: 0.8,
    buyInRatioCap: 0.75,
    softFloorBigBlinds: 12,
    maxBigBlinds: 60,
  });
});

test("Long Session completed-hand observation is public-state only", async ({ page }) => {
  await loadLongSession(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionModeV1;
    const forbidden = [];
    const accesses = [];
    const wrappedPlayers = state.players.map(player => new Proxy(player, {
      get(target, property, receiver) {
        accesses.push(`player.${String(property)}`);
        if (property === "cards") {
          forbidden.push("cards");
          throw new Error("FORBIDDEN_HOLE_CARD_READ");
        }
        return Reflect.get(target, property, receiver);
      },
    }));
    const wrappedState = new Proxy(state, {
      get(target, property, receiver) {
        accesses.push(`state.${String(property)}`);
        if (property === "deck" || property === "board") {
          forbidden.push(String(property));
          throw new Error(`FORBIDDEN_${String(property).toUpperCase()}_READ`);
        }
        if (property === "players") return wrappedPlayers;
        return Reflect.get(target, property, receiver);
      },
    });
    const snapshot = api.captureCompletedHandPublicState(wrappedState);
    return { forbidden, accesses, snapshot };
  });

  expect(result.forbidden).toEqual([]);
  expect(result.accesses).not.toContain("state.deck");
  expect(result.accesses).not.toContain("state.board");
  expect(result.accesses).not.toContain("player.cards");
  expect(result.snapshot.gameMode).toBe("normal");
  expect(result.snapshot.heroPresent).toBe(true);
  expect(result.snapshot.opponentStacks).toHaveLength(6);
});

test("five-table ladder conserves Hero wealth and always proposes 100BB entries", async ({ page }) => {
  await loadLongSession(page);

  const rows = await page.evaluate(() => {
    const api = window.LongSessionModeV1;
    let session = api.createSession({ tableIndex: 0, bankroll: 0, tableStack: 2000 });
    const inputs = [4300, 9800, 19900, 40100];
    return inputs.map((heroStack, index) => {
      const completedHand = {
        gameMode: "normal",
        handOver: true,
        handNumber: index + 1,
        heroPresent: true,
        heroStack,
        opponentStacks: [2000, 1900, 2100, 1800, 2200, 2000],
      };
      const envelope = api.propose({ completedHand, inputSession: session });
      const result = api.commit(envelope, "primary");
      session = result.session;
      return {
        transition: envelope.proposal.transition,
        observed: envelope.proposal.observedTotalWealth,
        proposed: envelope.proposal.proposedTotalWealth,
        target: envelope.proposal.targetTable,
        session: { ...session },
      };
    });
  });

  expect(rows.map(row => row.transition)).toEqual(["move-up", "move-up", "move-up", "move-up"]);
  expect(rows.map(row => [row.target.small, row.target.big, row.target.entry])).toEqual([
    [20, 40, 4000],
    [50, 100, 10000],
    [100, 200, 20000],
    [200, 400, 40000],
  ]);
  rows.forEach(row => {
    expect(row.target.entry / row.target.big).toBe(100);
    expect(row.proposed).toBe(row.observed);
    expect(row.session.totalWealth).toBe(row.observed);
  });
});

test("runtime opt-in starts T1 with six ordinary 100BB seats and can commit a T2 move", async ({ page }) => {
  await loadLongSession(page);

  await page.evaluate(() => window.LongSessionModeV1.enableNow({ restart: true }));
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.snapshot().session?.tableIndex)).toBe(0);

  const opening = await page.evaluate(() => ({
    active: window.LongSessionModeV1.isActive(),
    mode: state.gameMode || "normal",
    blind: { ...state.blindLevel },
    hero: state.players[0].stack + state.players[0].totalContribution,
    ais: state.players.slice(1).map(player => ({
      name: player.name,
      chips: player.stack + player.totalContribution,
    })),
  }));

  expect(opening.active).toBe(true);
  expect(opening.mode).toBe("normal");
  expect(opening.blind).toMatchObject({ small: 10, big: 20, buyIn: 2000, longSession: true });
  expect(opening.hero).toBe(2000);
  expect(opening.ais).toHaveLength(6);
  expect(opening.ais.every(seat => seat.name !== "Gemini" && seat.chips === 2000)).toBe(true);

  await page.evaluate(() => {
    clearAutoNewHandTimer();
    state.players[0].stack = 4300;
    state.players[0].totalContribution = 0;
    state.handOver = true;
    maybeShowSessionSummary();
  });
  await expect(page.locator("#longSessionDecisionRoot")).toBeVisible();
  await expect(page.locator("#longSessionDecisionRoot")).toContainText("20/40");
  await page.locator('[data-long-session-action="primary"]').click();
  await expect.poll(() => page.evaluate(() => window.LongSessionModeV1.snapshot().session?.tableIndex)).toBe(1);

  const moved = await page.evaluate(() => ({
    blind: { ...state.blindLevel },
    session: window.LongSessionModeV1.snapshot().session,
    hero: state.players[0].stack + state.players[0].totalContribution,
    ais: state.players.slice(1).map(player => ({
      name: player.name,
      chips: player.stack + player.totalContribution,
    })),
  }));

  expect(moved.session).toMatchObject({ tableIndex: 1, bankroll: 300, tableStack: 4000, totalWealth: 4300 });
  expect(moved.blind).toMatchObject({ small: 20, big: 40, buyIn: 4000, longSession: true });
  expect(moved.hero).toBe(4000);
  expect(moved.ais.every(seat => seat.name !== "Gemini" && seat.chips === 4000)).toBe(true);
});

test("disabling Long Session restores Normal blind schedule without touching its economy config", async ({ page }) => {
  await loadLongSession(page);
  await page.evaluate(() => window.LongSessionModeV1.enableNow({ restart: true }));
  await page.evaluate(() => window.LongSessionModeV1.disableNow({ restart: true }));

  const result = await page.evaluate(() => ({
    active: window.LongSessionModeV1.isActive(),
    blind: { ...state.blindLevel },
    level11: { ...blindLevelForHand(11) },
    normalConfig: { ...window.ReplacementStackBalance.normalConfig },
  }));

  expect(result.active).toBe(false);
  expect(result.blind.longSession).not.toBe(true);
  expect(result.blind).toMatchObject({ small: 10, big: 20, buyIn: 2000 });
  expect(result.level11).toMatchObject({ small: 50, big: 100, buyIn: 7000 });
  expect(result.normalConfig).toMatchObject({
    strategy: "median-v2",
    tableMedianRatio: 0.8,
    buyInRatioCap: 0.75,
    softFloorBigBlinds: 12,
    maxBigBlinds: 60,
  });
});

test("disabling Long Session releases Gemini control-state ownership", async ({ page }) => {
  await loadLongSession(page);

  await page.evaluate(() => window.LongSessionModeV1.enableNow({ restart: true }));
  await expect.poll(() => page.evaluate(() => ({
    disabled: document.querySelector("#geminiBossButton")?.disabled,
    title: document.querySelector("#geminiBossButton")?.title,
  }))).toEqual({
    disabled: true,
    title: "Long Session 使用固定普通 AI 牌桌；請先結束 Long Session",
  });

  await page.evaluate(() => window.LongSessionModeV1.disableNow({ restart: true }));
  await expect.poll(() => page.evaluate(() => ({
    disabled: document.querySelector("#geminiBossButton")?.disabled,
    title: document.querySelector("#geminiBossButton")?.title,
  }))).toEqual({
    disabled: false,
    title: "",
  });
});
