import { expect, test } from "@playwright/test";

async function loadShadow(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(
    () => page.evaluate(() => window.ReplacementStackBalance?.isInstalled?.() === true),
    { timeout: 10_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => Boolean(window.TournamentMode?.version)),
    { timeout: 10_000 },
  ).toBe(true);

  await page.evaluate(() => {
    window.__longSessionShadowProductionRefs = {
      startHand,
      showdown,
      awardPot,
      finishShowdown,
      buildNextAiSeats,
      normalPlan: window.ReplacementStackBalance.calculateNormalReplacementPlan,
      tournamentSetMode: window.TournamentMode.setMode,
    };
    window.__longSessionShadowRuntimeBefore = {
      gameMode: state.gameMode || "normal",
      handOver: state.handOver,
      handNumber: state.handNumber,
      blindLevel: { ...state.blindLevel },
      playerStacks: state.players.map(player => player.stack),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    };
  });

  await page.addScriptTag({ url: "/tests/support/long-session-game-state-shadow-v1.js" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionGameStateShadowV1?.version || ""),
  ).toBe("0.1.0");
}

test("shadow adapter is inert: production hand, settlement, AI, tournament, and Normal economy identities stay untouched", async ({ page }) => {
  await loadShadow(page);

  const result = await page.evaluate(() => ({
    version: window.LongSessionGameStateShadowV1.version,
    scope: window.LongSessionGameStateShadowV1.scope,
    identities: {
      startHand: startHand === window.__longSessionShadowProductionRefs.startHand,
      showdown: showdown === window.__longSessionShadowProductionRefs.showdown,
      awardPot: awardPot === window.__longSessionShadowProductionRefs.awardPot,
      finishShowdown: finishShowdown === window.__longSessionShadowProductionRefs.finishShowdown,
      buildNextAiSeats: buildNextAiSeats === window.__longSessionShadowProductionRefs.buildNextAiSeats,
      normalPlan:
        window.ReplacementStackBalance.calculateNormalReplacementPlan
        === window.__longSessionShadowProductionRefs.normalPlan,
      tournamentSetMode: window.TournamentMode.setMode === window.__longSessionShadowProductionRefs.tournamentSetMode,
    },
    before: window.__longSessionShadowRuntimeBefore,
    after: {
      gameMode: state.gameMode || "normal",
      handOver: state.handOver,
      handNumber: state.handNumber,
      blindLevel: { ...state.blindLevel },
      playerStacks: state.players.map(player => player.stack),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    },
  }));

  expect(result.version).toBe("0.1.0");
  expect(result.scope).toBe("test-only-shadow");
  expect(result.identities).toEqual({
    startHand: true,
    showdown: true,
    awardPot: true,
    finishShowdown: true,
    buildNextAiSeats: true,
    normalPlan: true,
    tournamentSetMode: true,
  });
  expect(result.after).toEqual(result.before);
});

test("public-state capture cannot read deck, board, or hole cards", async ({ page }) => {
  await loadShadow(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionGameStateShadowV1;
    const accesses = [];
    const forbidden = [];
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
    return { snapshot, accesses, forbidden };
  });

  expect(result.forbidden).toEqual([]);
  expect(result.accesses).not.toContain("state.deck");
  expect(result.accesses).not.toContain("state.board");
  expect(result.accesses).not.toContain("player.cards");
  expect(result.snapshot).toMatchObject({
    gameMode: "normal",
    heroPresent: true,
  });
  expect(Number.isFinite(result.snapshot.heroStack)).toBe(true);
  expect(Array.isArray(result.snapshot.opponentStacks)).toBe(true);
});

test("completed public state proposes one-table progression at declared 100BB with Hero-independent fresh AI entries", async ({ page }) => {
  await loadShadow(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionGameStateShadowV1;
    const roster = AI_ROSTER;
    const session = api.createShadowSession({ tableIndex: 0, bankroll: 0 });
    const sessionBefore = JSON.stringify(session);
    const base = {
      gameMode: "normal",
      handOver: true,
      handNumber: 42,
      heroPresent: true,
      opponentStacks: [1200, 2400, 1800, 3100, 900, 2700],
      productionBlind: { level: 5, smallBlind: 200, bigBlind: 400, buyIn: 15000 },
    };

    const normalLead = api.proposeNextHand({
      enabled: true,
      completedHand: { ...base, heroStack: 4300 },
      session,
      roster,
    });
    const hugeLead = api.proposeNextHand({
      enabled: true,
      completedHand: { ...base, heroStack: 9000 },
      session,
      roster,
    });

    return {
      normalLead,
      hugeLead,
      sessionBefore,
      sessionAfter: JSON.stringify(session),
      expectedNames: AI_ROSTER.filter(profile => profile.name !== "Gemini").slice(0, 6).map(profile => profile.name),
    };
  });

  expect(result.sessionAfter).toBe(result.sessionBefore);
  expect(result.normalLead.status).toBe("proposed");
  expect(result.normalLead.proposal).toMatchObject({
    transition: "move-up",
    bankroll: 300,
    tableStack: 4000,
    totalWealth: 4300,
    table: {
      index: 1,
      key: "table-2",
      smallBlind: 20,
      bigBlind: 40,
      entry: 4000,
      entryBb: 100,
    },
  });
  expect(result.normalLead.proposal.aiSeats).toHaveLength(6);
  expect(result.normalLead.proposal.aiSeats.map(seat => seat.name)).toEqual(result.expectedNames);
  expect(result.normalLead.proposal.aiSeats.every(seat => seat.stack === 4000 && seat.stackBb === 100)).toBe(true);
  expect(result.normalLead.proposal.aiSeats.every(seat => seat.source === "declared-standard-entry")).toBe(true);

  expect(result.hugeLead.proposal.transition).toBe("move-up");
  expect(result.hugeLead.proposal.table).toEqual(result.normalLead.proposal.table);
  expect(result.hugeLead.proposal.aiSeats).toEqual(result.normalLead.proposal.aiSeats);
  expect(result.hugeLead.proposal.bankroll).toBe(5000);
  expect(result.hugeLead.proposal.totalWealth).toBe(9000);
});

test("shadow progression uses observed completed-hand stack, conserves wealth, and never skips a stake level", async ({ page }) => {
  await loadShadow(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionGameStateShadowV1;
    const roster = AI_ROSTER;
    const rows = [];
    let session = api.createShadowSession({ tableIndex: 0, bankroll: 0 });

    const apply = heroStack => {
      const inputSession = { ...session };
      const completedHand = {
        gameMode: "normal",
        handOver: true,
        handNumber: rows.length + 1,
        heroPresent: true,
        heroStack,
        opponentStacks: [2000, 1800, 2300, 1700, 2100, 1900],
      };
      const result = api.proposeNextHand({ enabled: true, completedHand, session, roster });
      rows.push({ inputSession, completedHand, result });
      if (result.proposal && result.proposal.transition !== "session-ended") {
        session = api.createShadowSession({
          tableIndex: result.proposal.table.index,
          bankroll: result.proposal.bankroll,
        });
      }
      return result;
    };

    apply(3500); // stay table 1: total 3500 < table-2 entry 4000
    apply(4500); // move table 1 -> 2, bankroll 500
    apply(9200); // table 2 total 9700 < table-3 entry 10000
    apply(9800); // table 2 total 10300 -> table 3, bankroll 300
    apply(25000); // table 3 total 25300 -> table 4 only, not table 5

    return rows;
  });

  const transitions = result.map(row => row.result.proposal.transition);
  expect(transitions).toEqual(["stay", "move-up", "stay", "move-up", "move-up"]);
  expect(result[0].result.proposal.table.index).toBe(0);
  expect(result[1].result.proposal.table.index).toBe(1);
  expect(result[2].result.proposal.table.index).toBe(1);
  expect(result[3].result.proposal.table.index).toBe(2);
  expect(result[4].result.proposal.table.index).toBe(3);

  for (const row of result) {
    const expectedTotal = row.inputSession.bankroll + row.completedHand.heroStack;
    expect(row.result.proposal.totalWealth).toBe(expectedTotal);
    expect(row.result.proposal.bankroll + row.result.proposal.tableStack).toBe(expectedTotal);
    expect(row.result.proposal.table.entryBb).toBe(100);
  }
});

test("disabled, active-hand, tournament, missing-Hero, re-entry, and session-end boundaries are explicit", async ({ page }) => {
  await loadShadow(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionGameStateShadowV1;
    const roster = AI_ROSTER;
    const session = api.createShadowSession({ tableIndex: 2, bankroll: 15000 });
    const base = {
      gameMode: "normal",
      handOver: true,
      handNumber: 88,
      heroPresent: true,
      heroStack: 0,
      opponentStacks: [9000, 12000, 13000, 8000, 16000, 7000],
    };
    const call = (enabled, completedHand, inputSession = session) => api.proposeNextHand({
      enabled,
      completedHand,
      session: inputSession,
      roster,
    });

    return {
      disabled: call(false, base),
      active: call(true, { ...base, handOver: false, heroStack: 10000 }),
      tournament: call(true, { ...base, gameMode: "tournament", heroStack: 10000 }),
      missingHero: call(true, { ...base, heroPresent: false, heroStack: 0 }),
      reentry: call(true, base),
      ended: call(true, base, api.createShadowSession({ tableIndex: 2, bankroll: 9000 })),
    };
  });

  expect(result.disabled).toMatchObject({ status: "disabled", reason: "long-session-off", proposal: null });
  expect(result.active).toMatchObject({ status: "blocked", reason: "hand-still-active", proposal: null });
  expect(result.tournament).toMatchObject({ status: "blocked", reason: "non-normal-mode", proposal: null });
  expect(result.missingHero).toMatchObject({ status: "blocked", reason: "hero-missing", proposal: null });

  expect(result.reentry.status).toBe("proposed");
  expect(result.reentry.proposal).toMatchObject({
    transition: "reentry",
    bankroll: 5000,
    tableStack: 10000,
    totalWealth: 15000,
    table: { index: 2, entry: 10000, bigBlind: 100, entryBb: 100 },
  });
  expect(result.reentry.proposal.aiSeats).toHaveLength(6);
  expect(result.reentry.proposal.aiSeats.every(seat => seat.stack === 10000 && seat.stackBb === 100)).toBe(true);

  expect(result.ended.status).toBe("proposed");
  expect(result.ended.proposal).toMatchObject({
    transition: "session-ended",
    bankroll: 9000,
    tableStack: 0,
    totalWealth: 9000,
  });
  expect(result.ended.proposal.aiSeats).toEqual([]);
});

test("10k synthetic completed-hand shadow decisions preserve accounting, one-step progression, and fixed fresh-seat depth", async ({ page }) => {
  await loadShadow(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionGameStateShadowV1;
    const roster = AI_ROSTER;
    let seed = 0x1852026;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let decisions = 0;
    let moves = 0;
    let reentries = 0;
    let ended = 0;
    let stays = 0;
    const failures = [];

    for (let sessionIndex = 0; sessionIndex < 200; sessionIndex += 1) {
      let session = api.createShadowSession({ tableIndex: 0, bankroll: 120000 });
      let tableStack = api.tableAt(0).entry;

      for (let handIndex = 0; handIndex < 50; handIndex += 1) {
        const currentTable = api.tableAt(session.tableIndex);
        const beforeTotal = session.bankroll + tableStack;
        const forceBust = random() < 0.035;
        const swing = forceBust
          ? -tableStack
          : Math.round((random() * 1.4 - 0.48) * currentTable.entry);
        const observedHeroStack = Math.max(0, tableStack + swing);
        const expectedObservedWealth = session.bankroll + observedHeroStack;
        const completedHand = {
          gameMode: "normal",
          handOver: true,
          handNumber: handIndex + 1,
          heroPresent: true,
          heroStack: observedHeroStack,
          opponentStacks: Array.from({ length: 6 }, () => Math.round(currentTable.entry * (0.5 + random()))),
        };

        const inputIndex = session.tableIndex;
        const decision = api.proposeNextHand({ enabled: true, completedHand, session, roster });
        decisions += 1;
        if (decision.status !== "proposed" || !decision.proposal) failures.push("missing-proposal");
        const proposal = decision.proposal;
        if (proposal.totalWealth !== expectedObservedWealth) failures.push("total-wealth-drift");
        if (proposal.bankroll + proposal.tableStack !== expectedObservedWealth) failures.push("wealth-sum-drift");
        if (proposal.table.entryBb !== 100) failures.push("table-depth-drift");
        if (proposal.table.index > inputIndex + 1) failures.push("skipped-table");
        if (proposal.table.index < inputIndex) failures.push("backward-table");

        if (proposal.transition === "move-up") {
          moves += 1;
          if (proposal.table.index !== inputIndex + 1) failures.push("invalid-move-step");
          if (proposal.tableStack !== proposal.table.entry) failures.push("move-entry-drift");
          if (proposal.aiSeats.length !== 6) failures.push("move-seat-count");
          if (proposal.aiSeats.some(seat => seat.stackBb !== 100 || seat.stack !== proposal.table.entry)) {
            failures.push("move-ai-depth-drift");
          }
        } else if (proposal.transition === "reentry") {
          reentries += 1;
          if (proposal.table.index !== inputIndex) failures.push("reentry-table-drift");
          if (proposal.tableStack !== proposal.table.entry) failures.push("reentry-entry-drift");
          if (proposal.aiSeats.some(seat => seat.stackBb !== 100 || seat.stack !== proposal.table.entry)) {
            failures.push("reentry-ai-depth-drift");
          }
        } else if (proposal.transition === "session-ended") {
          ended += 1;
          break;
        } else if (proposal.transition === "stay") {
          stays += 1;
          if (proposal.table.index !== inputIndex) failures.push("stay-table-drift");
          if (proposal.tableStack !== observedHeroStack) failures.push("stay-stack-drift");
          if (proposal.aiSeats.length !== 0) failures.push("stay-fresh-ai-injection");
        } else {
          failures.push("unknown-transition");
        }

        if (proposal.transition !== "session-ended") {
          session = api.createShadowSession({
            tableIndex: proposal.table.index,
            bankroll: proposal.bankroll,
          });
          tableStack = proposal.tableStack;
        }

        if (beforeTotal < 0) failures.push("negative-prior-total");
      }
    }

    return { decisions, moves, reentries, ended, stays, failures };
  });

  expect(result.decisions).toBe(10_000);
  expect(result.moves).toBeGreaterThan(0);
  expect(result.reentries).toBeGreaterThan(0);
  expect(result.stays).toBeGreaterThan(0);
  expect(result.failures).toEqual([]);
});
