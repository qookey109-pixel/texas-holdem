import { expect, test } from "@playwright/test";

const USER_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

function testSession() {
  return {
    access_token: "ai-memory-access-token",
    refresh_token: "ai-memory-refresh-token",
    user: {
      id: USER_ID,
      email: "memory@example.com",
      user_metadata: { full_name: "記憶玩家" },
    },
  };
}

function tournamentPayload() {
  return {
    schemaVersion: 2,
    mode: "tournament",
    savedAt: "2026-08-03T15:20:00.000Z",
    handNumber: 8,
    hero: { stack: 2600, wins: 3 },
    heroStyle: {
      hands: 8,
      vpip: 5,
      raises: 3,
      calls: 3,
      checks: 2,
      folds: 3,
      allIns: 1,
      showdowns: 3,
      wins: 3,
      maxStack: 6200,
      biggestPot: 4800,
      bestWin: 2600,
    },
    seats: [
      { name: "Ace", stack: 1900, wins: 1, emotion: "calm", streak: 0 },
      { name: "Nova", stack: 2100, wins: 1, emotion: "confident", streak: 1 },
    ],
    tournament: {
      active: true,
      started: true,
      queue: ["Unit-9", "Vlad", "Gemini"],
      appeared: ["Ace", "Nova"],
      eliminated: [],
      finished: false,
      result: null,
      lastEliminated: "",
      lastOpponent: "",
      dealerCursor: 1,
    },
  };
}

function installCloudMock(page) {
  const payload = tournamentPayload();
  return page.addInitScript(({ session, initialRow }) => {
    window.__AUTH_TEST_SESSION__ = session;
    window.__AI_MEMORY_CLOUD_TEST__ = {
      row: initialRow,
      upserts: [],
      selects: [],
    };
    let authListener = null;

    function tableBuilder(table) {
      const builder = {
        select(columns) {
          window.__AI_MEMORY_CLOUD_TEST__.selects.push({ table, columns });
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return { data: window.__AI_MEMORY_CLOUD_TEST__.row, error: null };
        },
        upsert(value, options) {
          window.__AI_MEMORY_CLOUD_TEST__.upserts.push({ table, value, options });
          window.__AI_MEMORY_CLOUD_TEST__.row = {
            save_version: value.save_version,
            payload: value.payload,
            updated_at: value.updated_at,
          };
          return Promise.resolve({ data: window.__AI_MEMORY_CLOUD_TEST__.row, error: null });
        },
        delete() {
          return builder;
        },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return builder;
    }

    const client = {
      auth: {
        onAuthStateChange(callback) {
          authListener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async getSession() {
          return { data: { session: window.__AUTH_TEST_SESSION__ }, error: null };
        },
        async signInWithOAuth() {
          return { data: { url: "https://accounts.google.com/mock" }, error: null };
        },
        async signOut() {
          window.__AUTH_TEST_SESSION__ = null;
          authListener?.("SIGNED_OUT", null);
          return { error: null };
        },
      },
      from: tableBuilder,
    };

    window.__SUPABASE_AUTH_TEST_CLIENT__ = client;
    window.__SUPABASE_CLOUD_SAVE_TEST_CLIENT__ = client;
    localStorage.setItem("texasHoldemPlayerIdentityV1", JSON.stringify({
      userId: session.user.id,
      name: session.user.user_metadata.full_name,
      email: session.user.email,
      avatarUrl: "",
    }));
  }, {
    session: testSession(),
    initialRow: {
      save_version: 2,
      payload,
      updated_at: payload.savedAt,
    },
  });
}

async function waitForMemory(page) {
  await expect.poll(
    () => page.evaluate(() => window.AiPlayerModelMemory?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.AiCharacterStrategiesV13?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.3.0");
}

function publicSample(overrides = {}) {
  return {
    handNumber: 42,
    street: "flop",
    position: "BTN",
    action: "fold",
    amount: 0,
    potBefore: 300,
    sizeFraction: 0,
    facedAggression: true,
    checkedBefore: true,
    priorRaises: 1,
    ...overrides,
  };
}

test("V1.4 載入長期玩家記憶且只允許聚合公開資訊", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForMemory(page);

  const result = await page.evaluate(() => ({
    version: AiPlayerModelMemory.version,
    snapshotVersion: AiPlayerModelMemory.snapshotVersion,
    policy: AiPlayerModelMemory.fairInformationPolicy,
    modelVersion: AiPlayerModel.version,
  }));

  expect(result).toMatchObject({
    version: "1.0.0",
    snapshotVersion: 1,
    modelVersion: "1.0.0",
  });
  expect(result.policy).toMatchObject({
    aggregatePublicActionsOnly: true,
    rawActionHistoryPersisted: false,
    holeCardsPersisted: false,
    boardCardsPersisted: false,
    opponentDataPersisted: false,
    actualDeckOrderPersisted: false,
    futureBoardPersisted: false,
  });
  await expect(page.locator('script[src^="js/ai-player-model-memory-v1.js"]')).toHaveCount(1);
});

test("聚合玩家模型在重新整理後保留，逐步行動不會被保存", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForMemory(page);

  const beforeReload = await page.evaluate(async sample => {
    await AiPlayerModelMemory.clear();
    for (let index = 0; index < 7; index += 1) {
      AiPlayerModel.observePublicEvent({ ...sample, handNumber: 50 + index });
    }
    const snapshot = AiPlayerModelMemory.persist();
    const key = AiPlayerModelMemory.status().localKey;
    return {
      snapshot,
      key,
      stored: JSON.parse(localStorage.getItem(key)),
    };
  }, publicSample());

  expect(beforeReload.snapshot.actionsObserved).toBe(7);
  expect(beforeReload.stored.byStreet.flop.checkFolds).toBe(7);
  const serialized = JSON.stringify(beforeReload.stored);
  expect(serialized).not.toContain("recent");
  expect(serialized).not.toContain("cards");
  expect(serialized).not.toContain("deck");
  expect(serialized).not.toContain("board");

  await page.reload({ waitUntil: "networkidle" });
  await waitForMemory(page);

  const restored = await page.evaluate(() => ({
    snapshot: AiPlayerModelMemory.exportSnapshot(),
    recentLength: AiPlayerModel.ensureModel().recent.length,
    profile: AiPlayerModel.exploitProfile("flop", "BTN"),
  }));
  expect(restored.snapshot.actionsObserved).toBe(7);
  expect(restored.snapshot.byStreet.flop.checkFolds).toBe(7);
  expect(restored.recentLength).toBe(0);
  expect(restored.profile.tendencies.checkFoldLeak).toBe(true);
});

test("外部快照會被白名單清洗並限制異常數值", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForMemory(page);

  const snapshot = await page.evaluate(() => AiPlayerModelMemory.sanitizeSnapshot({
    schemaVersion: 999,
    actionsObserved: 999999999,
    handsObserved: -8,
    recent: [{ cards: ["As", "Ah"], deck: ["Ks"], futureBoard: ["Qs"] }],
    opponentCards: ["Kd", "Kc"],
    byStreet: {
      flop: {
        actions: 4,
        folds: 99,
        facedAggression: 99,
        foldsToAggression: 99,
        checkFolds: 99,
      },
    },
    byPosition: {
      "__proto__": { actions: 99 },
      BTN: { actions: 3, raises: 8 },
    },
  }));

  expect(snapshot.schemaVersion).toBe(1);
  expect(snapshot.actionsObserved).toBe(100000);
  expect(snapshot.handsObserved).toBe(0);
  expect(snapshot.byStreet.flop.folds).toBe(4);
  expect(snapshot.byStreet.flop.facedAggression).toBe(4);
  expect(snapshot.byStreet.flop.foldsToAggression).toBe(4);
  expect(snapshot.byStreet.flop.checkFolds).toBe(0);
  expect(snapshot.byPosition.BTN.raises).toBe(3);
  const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toContain("recent");
  expect(serialized).not.toContain("opponentCards");
  expect(serialized).not.toContain("futureBoard");
  expect(serialized).not.toContain("deck");
});

test("登入淘汰賽會把安全玩家模型同步到雲端並可反向恢復", async ({ page }) => {
  await installCloudMock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForMemory(page);

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status?.().signedIn || false),
    { timeout: 12_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.TournamentCloudSave?.status?.().hasSave || false),
    { timeout: 12_000 },
  ).toBe(true);

  await page.evaluate(async sample => {
    await AiPlayerModelMemory.clear();
    for (let index = 0; index < 9; index += 1) {
      AiPlayerModel.observePublicEvent({
        ...sample,
        handNumber: 100 + index,
        action: index < 6 ? "call" : "raise",
        checkedBefore: false,
      });
    }
    AiPlayerModelMemory.persist();
    await AiPlayerModelMemory.syncCloud();
  }, publicSample({ street: "river", position: "BB", facedAggression: true }));

  const cloud = await page.evaluate(() => window.__AI_MEMORY_CLOUD_TEST__.row.payload.aiPlayerModel);
  expect(cloud.actionsObserved).toBe(9);
  expect(cloud.byStreet.river.actions).toBe(9);
  expect(JSON.stringify(cloud)).not.toContain("recent");
  expect(JSON.stringify(cloud)).not.toContain("cards");
  expect(JSON.stringify(cloud)).not.toContain("deck");

  const restored = await page.evaluate(async () => {
    await AiPlayerModelMemory.clear();
    const empty = AiPlayerModelMemory.exportSnapshot().actionsObserved;
    await AiPlayerModelMemory.syncCloud();
    return {
      empty,
      snapshot: AiPlayerModelMemory.exportSnapshot(),
      local: JSON.parse(localStorage.getItem(AiPlayerModelMemory.status().localKey)),
    };
  });

  expect(restored.empty).toBe(0);
  expect(restored.snapshot.actionsObserved).toBe(9);
  expect(restored.snapshot.byStreet.river.actions).toBe(9);
  expect(restored.local.actionsObserved).toBe(9);
  expect(await page.evaluate(() => window.__AI_MEMORY_CLOUD_TEST__.upserts.length)).toBeGreaterThan(0);
});