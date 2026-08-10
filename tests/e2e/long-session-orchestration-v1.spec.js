import { expect, test } from "@playwright/test";

async function loadOrchestrator(page) {
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
    window.__longSessionOrchProductionRefs = {
      startHand,
      showdown,
      awardPot,
      finishShowdown,
      buildNextAiSeats,
      normalPlan: window.ReplacementStackBalance.calculateNormalReplacementPlan,
      tournamentSetMode: window.TournamentMode.setMode,
    };
    window.__longSessionOrchRuntimeBefore = {
      gameMode: state.gameMode || "normal",
      handOver: state.handOver,
      handNumber: state.handNumber,
      blindLevel: { ...state.blindLevel },
      playerStacks: state.players.map(player => player.stack),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    };
  });

  await page.addScriptTag({ url: "/tests/support/long-session-orchestration-v1.js" });
  await expect.poll(
    () => page.evaluate(() => window.LongSessionOrchestrationPrototypeV1?.version || ""),
  ).toBe("0.1.0");
}

function completedHand(heroStack, handNumber = 1) {
  return {
    gameMode: "normal",
    handOver: true,
    handNumber,
    heroPresent: true,
    heroStack,
    opponentStacks: [2000, 1800, 2200, 1600, 2400, 1900],
  };
}

test("orchestration prototype is inert and leaves production runtime identities untouched", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => ({
    scope: window.LongSessionOrchestrationPrototypeV1.scope,
    identities: {
      startHand: startHand === window.__longSessionOrchProductionRefs.startHand,
      showdown: showdown === window.__longSessionOrchProductionRefs.showdown,
      awardPot: awardPot === window.__longSessionOrchProductionRefs.awardPot,
      finishShowdown: finishShowdown === window.__longSessionOrchProductionRefs.finishShowdown,
      buildNextAiSeats: buildNextAiSeats === window.__longSessionOrchProductionRefs.buildNextAiSeats,
      normalPlan:
        window.ReplacementStackBalance.calculateNormalReplacementPlan
        === window.__longSessionOrchProductionRefs.normalPlan,
      tournamentSetMode: window.TournamentMode.setMode === window.__longSessionOrchProductionRefs.tournamentSetMode,
    },
    before: window.__longSessionOrchRuntimeBefore,
    after: {
      gameMode: state.gameMode || "normal",
      handOver: state.handOver,
      handNumber: state.handNumber,
      blindLevel: { ...state.blindLevel },
      playerStacks: state.players.map(player => player.stack),
      normalConfig: { ...window.ReplacementStackBalance.normalConfig },
    },
  }));

  expect(result.scope).toBe("test-only-orchestration");
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

test("runtime observation remains public-state only and cannot read deck, board, or hole cards", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionOrchestrationPrototypeV1;
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
  expect(result.snapshot.heroPresent).toBe(true);
  expect(Array.isArray(result.snapshot.opponentStacks)).toBe(true);
});

test("primary UI decisions complete a T1-to-T5 journey with exact wealth and 100BB fresh seats", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionOrchestrationPrototypeV1;
    const roster = AI_ROSTER;
    let session = api.createSession({ tableIndex: 0, bankroll: 0, tableStack: 2000 });
    const rows = [];

    const step = (heroStack, handNumber) => {
      const before = { ...session };
      const completed = {
        gameMode: "normal",
        handOver: true,
        handNumber,
        heroPresent: true,
        heroStack,
        opponentStacks: [2000, 1800, 2200, 1600, 2400, 1900],
      };
      const envelope = api.propose({ enabled: true, completedHand: completed, session, roster });
      const model = api.renderDecision(envelope);
      let committed;
      if (model) {
        document.querySelector('[data-orch-action="primary"]')?.click();
        committed = api.uiSnapshot().selection.commit;
      } else {
        committed = api.commit(envelope, "auto");
      }
      session = committed.session;
      rows.push({ before, completed, envelope, model, committed, after: { ...session } });
    };

    step(4300, 1);   // T1 -> T2, bankroll 300
    step(9800, 2);   // T2 -> T3, total 10,100, bankroll 100
    step(19900, 3);  // T3 -> T4, total 20,000, bankroll 0
    step(40100, 4);  // T4 -> T5, total 40,100, bankroll 100
    step(45000, 5);  // stay at T5, no fresh AI injection
    step(0, 6);      // bust at T5 with only 100 bankroll -> session ended

    return rows;
  });

  expect(result.map(row => row.envelope.proposal.transition)).toEqual([
    "move-up", "move-up", "move-up", "move-up", "stay", "session-ended",
  ]);
  expect(result.slice(0, 4).map(row => row.after.tableIndex)).toEqual([1, 2, 3, 4]);
  expect(result.slice(0, 4).map(row => row.after.tableStack)).toEqual([4000, 10000, 20000, 40000]);
  expect(result.slice(0, 4).map(row => row.envelope.proposal.targetTable.entryBb)).toEqual([100, 100, 100, 100]);

  for (const row of result.slice(0, 4)) {
    expect(row.envelope.proposal.aiSeats).toHaveLength(6);
    expect(row.envelope.proposal.aiSeats.every(seat => (
      seat.stackBb === 100
      && seat.stack === row.envelope.proposal.targetTable.entry
      && seat.source === "declared-standard-entry"
    ))).toBe(true);
    expect(row.after.totalWealth).toBe(row.envelope.proposal.observedTotalWealth);
    expect(row.committed.action).toBe("primary");
  }

  expect(result[0].after).toMatchObject({ tableIndex: 1, bankroll: 300, tableStack: 4000, totalWealth: 4300 });
  expect(result[1].after).toMatchObject({ tableIndex: 2, bankroll: 100, tableStack: 10000, totalWealth: 10100 });
  expect(result[2].after).toMatchObject({ tableIndex: 3, bankroll: 0, tableStack: 20000, totalWealth: 20000 });
  expect(result[3].after).toMatchObject({ tableIndex: 4, bankroll: 100, tableStack: 40000, totalWealth: 40100 });

  expect(result[4].model).toBeNull();
  expect(result[4].envelope.proposal.aiSeats).toEqual([]);
  expect(result[4].after).toMatchObject({ tableIndex: 4, bankroll: 100, tableStack: 45000, totalWealth: 45100 });

  expect(result[5].model).not.toBeNull();
  expect(result[5].committed).toMatchObject({ action: "primary", transition: "session-ended", status: "ended" });
  expect(result[5].after).toMatchObject({ tableIndex: 4, bankroll: 100, tableStack: 0, totalWealth: 100, status: "ended" });
});

test("declining a funded move keeps all Hero chips at the current table and never injects AI", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionOrchestrationPrototypeV1;
    const session = api.createSession({ tableIndex: 0, bankroll: 0, tableStack: 2000 });
    const envelope = api.propose({
      enabled: true,
      completedHand: {
        gameMode: "normal",
        handOver: true,
        handNumber: 9,
        heroPresent: true,
        heroStack: 9000,
        opponentStacks: [1900, 2100, 1800, 2200, 1700, 2300],
      },
      session,
      roster: AI_ROSTER,
    });
    const model = api.renderDecision(envelope);
    const productionBefore = {
      handNumber: state.handNumber,
      handOver: state.handOver,
      stacks: state.players.map(player => player.stack),
    };
    document.querySelector('[data-orch-action="secondary"]')?.click();
    const selection = api.uiSnapshot().selection;
    const productionAfter = {
      handNumber: state.handNumber,
      handOver: state.handOver,
      stacks: state.players.map(player => player.stack),
    };
    return { envelope, model, selection, productionBefore, productionAfter };
  });

  expect(result.envelope.proposal.transition).toBe("move-up");
  expect(result.model).toMatchObject({ totalWealth: 9000, tableEntry: 4000, bankrollAfter: 5000, aiEntry: 4000, entryBb: 100 });
  expect(result.selection).toMatchObject({ action: "secondary" });
  expect(result.selection.commit).toMatchObject({ transition: "stay", status: "active" });
  expect(result.selection.commit.session).toMatchObject({ tableIndex: 0, bankroll: 0, tableStack: 9000, totalWealth: 9000 });
  expect(result.productionAfter).toEqual(result.productionBefore);
});

test("bust re-entry and declined re-entry preserve bankroll semantics without production mutation", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionOrchestrationPrototypeV1;
    const makeEnvelope = () => api.propose({
      enabled: true,
      completedHand: {
        gameMode: "normal",
        handOver: true,
        handNumber: 12,
        heroPresent: true,
        heroStack: 0,
        opponentStacks: [10000, 9000, 11000, 8000, 12000, 9500],
      },
      session: api.createSession({ tableIndex: 2, bankroll: 15000, tableStack: 10000 }),
      roster: AI_ROSTER,
    });

    const primaryEnvelope = makeEnvelope();
    api.renderDecision(primaryEnvelope);
    document.querySelector('[data-orch-action="primary"]')?.click();
    const primary = api.uiSnapshot().selection;

    const secondaryEnvelope = makeEnvelope();
    api.renderDecision(secondaryEnvelope);
    document.querySelector('[data-orch-action="secondary"]')?.click();
    const secondary = api.uiSnapshot().selection;

    return { primaryEnvelope, primary, secondaryEnvelope, secondary };
  });

  expect(result.primaryEnvelope.proposal.transition).toBe("reentry");
  expect(result.primaryEnvelope.proposal.aiSeats).toHaveLength(6);
  expect(result.primaryEnvelope.proposal.aiSeats.every(seat => seat.stack === 10000 && seat.stackBb === 100)).toBe(true);
  expect(result.primary.commit.session).toMatchObject({ tableIndex: 2, bankroll: 5000, tableStack: 10000, totalWealth: 15000 });
  expect(result.secondary.commit).toMatchObject({ transition: "paused", status: "paused" });
  expect(result.secondary.commit.session).toMatchObject({ tableIndex: 2, bankroll: 15000, tableStack: 0, totalWealth: 15000 });
});

test("disabled and non-completed/non-Normal boundaries never produce a transition UI", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionOrchestrationPrototypeV1;
    const session = api.createSession({ tableIndex: 0, bankroll: 0, tableStack: 2000 });
    const base = {
      gameMode: "normal",
      handOver: true,
      handNumber: 1,
      heroPresent: true,
      heroStack: 5000,
      opponentStacks: [2000, 2000, 2000, 2000, 2000, 2000],
    };
    const disabled = api.propose({ enabled: false, completedHand: base, session, roster: AI_ROSTER });
    const active = api.propose({ enabled: true, completedHand: { ...base, handOver: false }, session, roster: AI_ROSTER });
    const tournament = api.propose({ enabled: true, completedHand: { ...base, gameMode: "tournament" }, session, roster: AI_ROSTER });
    const missingHero = api.propose({ enabled: true, completedHand: { ...base, heroPresent: false, heroStack: 0 }, session, roster: AI_ROSTER });
    return {
      disabled: { status: disabled.status, reason: disabled.reason, ui: api.toUiModel(disabled) },
      active: { status: active.status, reason: active.reason, ui: api.toUiModel(active) },
      tournament: { status: tournament.status, reason: tournament.reason, ui: api.toUiModel(tournament) },
      missingHero: { status: missingHero.status, reason: missingHero.reason, ui: api.toUiModel(missingHero) },
    };
  });

  expect(result.disabled).toEqual({ status: "disabled", reason: "long-session-off", ui: null });
  expect(result.active).toEqual({ status: "blocked", reason: "hand-still-active", ui: null });
  expect(result.tournament).toEqual({ status: "blocked", reason: "non-normal-mode", ui: null });
  expect(result.missingHero).toEqual({ status: "blocked", reason: "hero-missing", ui: null });
});

test("10k deterministic orchestration decisions preserve one-step stakes, wealth, and fresh-seat depth", async ({ page }) => {
  await loadOrchestrator(page);

  const result = await page.evaluate(() => {
    const api = window.LongSessionOrchestrationPrototypeV1;
    const roster = AI_ROSTER;
    let seed = 0x1872026;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let session = api.createSession({ tableIndex: 0, bankroll: 120000, tableStack: 2000 });
    let decisions = 0;
    let movesAccepted = 0;
    let movesDeclined = 0;
    let reentries = 0;
    let stays = 0;
    let ended = 0;
    let paused = 0;
    const failures = [];

    while (decisions < 10000) {
      const currentTable = api.tableAt(session.tableIndex);
      const forceBust = random() < 0.03;
      const swing = forceBust
        ? -session.tableStack
        : Math.round((random() * 1.45 - 0.50) * currentTable.entry);
      const heroStack = Math.max(0, session.tableStack + swing);
      const observedWealth = session.bankroll + heroStack;
      const completed = {
        gameMode: "normal",
        handOver: true,
        handNumber: decisions + 1,
        heroPresent: true,
        heroStack,
        opponentStacks: Array.from({ length: 6 }, () => Math.round(currentTable.entry * (0.5 + random()))),
      };
      const inputIndex = session.tableIndex;
      const envelope = api.propose({ enabled: true, completedHand: completed, session, roster });
      const proposal = envelope.proposal;
      decisions += 1;

      if (!proposal) {
        failures.push("missing-proposal");
        break;
      }
      if (proposal.observedTotalWealth !== observedWealth) failures.push("observed-wealth-drift");
      if (proposal.proposedTotalWealth !== observedWealth) failures.push("proposed-wealth-drift");
      if (proposal.targetTable.index > inputIndex + 1) failures.push("skipped-table");
      if (proposal.targetTable.index < inputIndex) failures.push("backward-table");
      if (proposal.aiSeats.some(seat => seat.stackBb !== 100 || seat.stack !== proposal.targetTable.entry)) {
        failures.push("fresh-ai-depth-drift");
      }

      let committed;
      if (proposal.transition === "move-up") {
        const action = random() < 0.68 ? "primary" : "secondary";
        committed = api.commit(envelope, action);
        if (action === "primary") movesAccepted += 1;
        else movesDeclined += 1;
      } else if (proposal.transition === "reentry") {
        const action = random() < 0.90 ? "primary" : "secondary";
        committed = api.commit(envelope, action);
        if (action === "primary") reentries += 1;
        else paused += 1;
      } else if (proposal.transition === "session-ended") {
        committed = api.commit(envelope, "primary");
        ended += 1;
      } else {
        committed = api.commit(envelope, "auto");
        stays += 1;
      }

      if (committed.session.totalWealth !== observedWealth) failures.push("committed-wealth-drift");
      if (committed.session.tableIndex > inputIndex + 1) failures.push("committed-skip");
      if (committed.session.tableIndex < inputIndex) failures.push("committed-backward");
      if (committed.transition === "move-up" && committed.session.tableStack !== api.tableAt(committed.session.tableIndex).entry) {
        failures.push("committed-entry-drift");
      }

      if (committed.status === "ended" || committed.status === "paused") {
        session = api.createSession({ tableIndex: 0, bankroll: 120000, tableStack: 2000 });
      } else {
        session = committed.session;
      }
    }

    return { decisions, movesAccepted, movesDeclined, reentries, stays, ended, paused, failures };
  });

  expect(result.decisions).toBe(10000);
  expect(result.movesAccepted).toBeGreaterThan(0);
  expect(result.movesDeclined).toBeGreaterThan(0);
  expect(result.reentries).toBeGreaterThan(0);
  expect(result.stays).toBeGreaterThan(0);
  expect(result.failures).toEqual([]);
});
