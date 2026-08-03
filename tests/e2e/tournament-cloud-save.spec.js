import { expect, test } from "@playwright/test";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function testSession() {
  return {
    access_token: "cloud-save-access-token",
    refresh_token: "cloud-save-refresh-token",
    user: {
      id: USER_ID,
      email: "save@example.com",
      user_metadata: { full_name: "雲端玩家" },
    },
  };
}

function installCloudMock(page, initialRow = null) {
  return page.addInitScript(({ session, row }) => {
    window.__AUTH_TEST_SESSION__ = session;
    window.__CLOUD_SAVE_TEST__ = {
      row,
      upserts: [],
      deletes: [],
      selects: [],
    };
    let authListener = null;

    function tableBuilder(table) {
      let operation = "";
      let filter = null;
      const builder = {
        select(columns) {
          operation = "select";
          window.__CLOUD_SAVE_TEST__.selects.push({ table, columns });
          return builder;
        },
        delete() {
          operation = "delete";
          return builder;
        },
        eq(column, value) {
          filter = { column, value };
          return builder;
        },
        async maybeSingle() {
          return { data: window.__CLOUD_SAVE_TEST__.row, error: null };
        },
        upsert(value, options) {
          operation = "upsert";
          window.__CLOUD_SAVE_TEST__.upserts.push({ table, value, options });
          window.__CLOUD_SAVE_TEST__.row = {
            save_version: value.save_version,
            payload: value.payload,
            updated_at: value.updated_at,
          };
          return Promise.resolve({ data: window.__CLOUD_SAVE_TEST__.row, error: null });
        },
        then(resolve, reject) {
          if (operation === "delete") {
            window.__CLOUD_SAVE_TEST__.deletes.push({ table, filter });
            window.__CLOUD_SAVE_TEST__.row = null;
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
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
  }, { session: testSession(), row: initialRow });
}

async function waitForCloudSave(page) {
  await expect.poll(
    () => page.evaluate(() => window.TournamentCloudSave?.version || ""),
    { timeout: 12_000 },
  ).toBe("1.0.0");
  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 12_000 },
  ).toBe(true);
}

function setSettledTournamentState(page, handNumber = 7) {
  return page.evaluate(number => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer();
    clearDialogueTimers();
    state.autoNewHand = false;
    state.gameMode = "tournament";
    state.handNumber = number;
    state.handOver = true;
    state.waitingForHuman = true;
    state.currentActorIndex = 0;
    state.deck = [{ rank: "A", suit: "spades" }];
    state.board = [{ rank: "K", suit: "hearts" }];
    state.autoNewHandTimer = null;
    state.players = [
      {
        name: "雲端玩家",
        isHuman: true,
        emoji: "🦉",
        cards: [{ rank: "A", suit: "clubs" }, { rank: "A", suit: "diamonds" }],
        stack: 3120,
        wins: 3,
      },
      {
        ...AI_ROSTER.find(profile => profile.name === "Leo"),
        name: "Leo",
        isHuman: false,
        cards: [{ rank: "2", suit: "clubs" }, { rank: "3", suit: "clubs" }],
        stack: 0,
        wins: 1,
        emotion: "tilted",
        streak: -2,
      },
      {
        ...AI_ROSTER.find(profile => profile.name === "Toto"),
        name: "Toto",
        isHuman: false,
        cards: [{ rank: "4", suit: "clubs" }, { rank: "5", suit: "clubs" }],
        stack: 1880,
        wins: 2,
        emotion: "confident",
        streak: 2,
      },
    ];
    state.tournament = {
      active: true,
      started: true,
      queue: ["Ace", "Nova", "Gemini"],
      appeared: ["Leo", "Toto"],
      eliminated: ["Leo"],
      finished: false,
      result: null,
      lastEliminated: "Leo",
      lastOpponent: "",
      dealerCursor: 1,
    };
  }, handNumber);
}

test("每手結束自動儲存且快照不包含底牌與執行期物件", async ({ page }) => {
  await installCloudMock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForCloudSave(page);
  await setSettledTournamentState(page, 7);

  await expect.poll(
    () => page.evaluate(() => window.__CLOUD_SAVE_TEST__.upserts.length),
    { timeout: 10_000 },
  ).toBe(1);

  const record = await page.evaluate(() => window.__CLOUD_SAVE_TEST__.upserts[0].value);
  expect(record.user_id).toBe(USER_ID);
  expect(record.save_version).toBe(1);
  expect(record.payload.schemaVersion).toBe(1);
  expect(record.payload.mode).toBe("tournament");
  expect(record.payload.handNumber).toBe(7);
  expect(record.payload.hero).toEqual({ stack: 3120, wins: 3 });
  expect(record.payload.seats.map(seat => seat.name)).toEqual(["Leo", "Toto"]);

  const serialized = JSON.stringify(record.payload);
  expect(serialized).not.toContain("cards");
  expect(serialized).not.toContain("deck");
  expect(serialized).not.toContain("board");
  expect(serialized).not.toContain("autoNewHandTimer");
  expect(serialized).not.toContain("dialogueTimers");

  const localBackup = await page.evaluate(userId => (
    JSON.parse(localStorage.getItem(`texasHoldemTournamentSaveV1:${userId}`))
  ), USER_ID);
  expect(localBackup.handNumber).toBe(7);
});

test("進行中的淘汰賽只安排結束後暫停並儲存", async ({ page }) => {
  await installCloudMock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForCloudSave(page);

  await page.evaluate(() => {
    window.AiTimingController?.clear?.();
    window.GeminiAsyncBettingLoop?.cancelPending?.();
    clearAutoNewHandTimer();
    clearDialogueTimers();
    state.gameMode = "tournament";
    state.handOver = false;
    state.waitingForHuman = true;
    state.currentActorIndex = 0;
    state.autoNewHand = true;
    state.tournament = {
      active: true,
      started: true,
      queue: ["Ace"],
      appeared: ["Leo"],
      eliminated: [],
      finished: false,
      result: null,
      lastEliminated: "",
      lastOpponent: "",
      dealerCursor: 0,
    };
  });

  await page.evaluate(() => window.TournamentCloudSave.pauseAndSave());
  expect(await page.evaluate(() => window.TournamentCloudSave.status().pauseRequested)).toBe(true);
  expect(await page.evaluate(() => window.__CLOUD_SAVE_TEST__.upserts.length)).toBe(0);

  await setSettledTournamentState(page, 9);
  await page.evaluate(async () => {
    state.autoNewHand = true;
    await window.TournamentCloudSave.pauseAndSave();
  });

  await expect.poll(
    () => page.evaluate(() => window.__CLOUD_SAVE_TEST__.upserts.length),
    { timeout: 10_000 },
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => state.autoNewHand)).toBe(false);
  expect(await page.evaluate(() => window.TournamentCloudSave.status().lastMessage)).toContain("暫停");
});

test("登入後可恢復下一手並刪除存檔重新開始", async ({ page }) => {
  const payload = {
    schemaVersion: 1,
    mode: "tournament",
    savedAt: "2026-08-03T04:30:00.000Z",
    handNumber: 12,
    hero: { stack: 2400, wins: 4 },
    seats: [
      { name: "Leo", stack: 1600, wins: 1, emotion: "calm", streak: 0 },
      { name: "Toto", stack: 0, wins: 0, emotion: "tilted", streak: -2 },
    ],
    tournament: {
      active: true,
      started: true,
      queue: ["Ace", "Nova", "Gemini"],
      appeared: ["Leo", "Toto"],
      eliminated: [],
      finished: false,
      result: null,
      lastEliminated: "",
      lastOpponent: "",
      dealerCursor: 0,
    },
  };
  await installCloudMock(page, {
    save_version: 1,
    payload,
    updated_at: payload.savedAt,
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForCloudSave(page);

  await page.locator("#authAccountButton").click();
  await expect(page.locator("#tournamentCloudSavePanel")).toBeVisible();
  await expect(page.locator("#tournamentResumeButton")).toBeEnabled();
  await page.locator("#tournamentResumeButton").click();

  await expect.poll(
    () => page.evaluate(() => state.handNumber),
    { timeout: 10_000 },
  ).toBe(13);
  expect(await page.evaluate(() => state.gameMode)).toBe("tournament");
  expect(await page.evaluate(() => state.players[0].cards.length)).toBe(2);
  expect(await page.evaluate(() => state.board.length)).toBe(0);
  expect(await page.evaluate(() => state.players[0].name)).toBe("雲端玩家");
  expect(await page.evaluate(() => state.autoNewHand)).toBe(false);

  await page.locator("#authAccountButton").click();
  await page.locator("#tournamentDeleteSaveButton").click();
  await expect(page.locator("#tournamentSaveStatus")).toContainText("再按一次");
  await page.locator("#tournamentDeleteSaveButton").click();

  await expect.poll(
    () => page.evaluate(() => window.__CLOUD_SAVE_TEST__.deletes.length),
    { timeout: 10_000 },
  ).toBe(1);
  expect(await page.evaluate(userId => localStorage.getItem(`texasHoldemTournamentSaveV1:${userId}`), USER_ID)).toBeNull();
  expect(await page.evaluate(() => window.TournamentCloudSave.status().hasSave)).toBe(false);
});
