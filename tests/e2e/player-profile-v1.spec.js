import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("guest can rename Hero, choose an avatar, and keep the profile after reload", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("playerProfileGuestPersistenceInit") === "1") return;
    localStorage.removeItem("texasHoldemGuestProfileV1");
    localStorage.removeItem("texasHoldemPlayerIdentityV1");
    sessionStorage.setItem("playerProfileGuestPersistenceInit", "1");
  });

  await page.goto("/");
  await expect(page.locator("#playerProfileButton")).toBeVisible();
  await page.locator("#playerProfileButton").click();
  await expect(page.locator("#playerProfileOverlay")).toBeVisible();
  await page.locator("#playerProfileNameInput").fill("Guest Ace");
  await page.locator('[data-profile-preset="fox"]').click();
  await page.locator("#playerProfileSave").click();

  await expect(page.locator("#playerName")).toHaveText("Guest Ace");
  await expect(page.locator('[data-profile-avatar-shell="hero"] .player-profile-avatar-fallback')).toHaveText("🦊");
  await expect.poll(async () => page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("texasHoldemGuestProfileV1") || "null");
    return value && {
      name: value.displayName,
      kind: value.avatarKind,
      avatar: value.avatarValue,
      nameCustomized: value.nameCustomized,
      avatarCustomized: value.avatarCustomized,
    };
  })).toEqual({
    name: "Guest Ace",
    kind: "preset",
    avatar: "fox",
    nameCustomized: true,
    avatarCustomized: true,
  });

  await page.reload();
  await expect(page.locator("#playerProfileButton")).toBeVisible();
  await expect(page.locator("#playerName")).toHaveText("Guest Ace");
  await expect(page.locator('[data-profile-avatar-shell="hero"] .player-profile-avatar-fallback')).toHaveText("🦊");
});

test("guest photo upload is cropped into a local avatar without changing poker state", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("texasHoldemGuestProfileV1");
    localStorage.removeItem("texasHoldemPlayerIdentityV1");
  });

  await page.goto("/");
  const before = await page.evaluate(() => ({
    pot: state.pot,
    handNumber: state.handNumber,
    stack: state.players?.[0]?.stack,
    mode: state.gameMode || "normal",
  }));

  await page.locator("#playerProfileButton").click();
  await page.locator("#playerProfileAvatarInput").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await expect(page.locator("#playerProfileStatus")).toContainText("圖片已裁切完成");
  await page.locator("#playerProfileSave").click();
  await expect(page.locator('[data-profile-avatar-shell="hero"] img')).toBeVisible();
  await expect(page.locator('[data-profile-avatar-shell="hero"] img')).toHaveAttribute("src", /^data:image\/(?:webp|jpeg);base64,/);

  const after = await page.evaluate(() => ({
    pot: state.pot,
    handNumber: state.handNumber,
    stack: state.players?.[0]?.stack,
    mode: state.gameMode || "normal",
  }));
  expect(after).toEqual(before);
});

test("Google-bound profile uses cloud data and restores the separate guest profile after sign-out", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("texasHoldemGuestProfileV1", JSON.stringify({
      displayName: "本機遊客",
      avatarKind: "preset",
      avatarValue: "panda",
      nameCustomized: true,
      avatarCustomized: true,
    }));

    let signedIn = true;
    let session = {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "hero@example.com",
        user_metadata: {
          full_name: "Google 原名",
          avatar_url: "https://example.com/google-avatar.png",
        },
      },
    };
    let remote = {
      display_name: "雲端玩家",
      avatar_kind: "preset",
      avatar_value: "robot",
      updated_at: "2026-08-24T00:00:00.000Z",
    };
    const writes = [];

    window.__PLAYER_PROFILE_TEST__ = {
      writes,
      signOut() {
        signedIn = false;
        session = null;
      },
    };

    window.TexasHoldemAuth = {
      version: "test-auth",
      status: () => ({
        configured: true,
        signedIn,
        cached: signedIn,
        loading: false,
        name: signedIn ? "Google 原名" : "Owl",
        email: signedIn ? "hero@example.com" : "",
        lastError: "",
      }),
      signInWithGoogle: async () => {},
      openAccount: () => {},
    };

    const tableBuilder = {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: remote, error: null }; },
      async upsert(value) {
        writes.push(JSON.parse(JSON.stringify(value)));
        remote = {
          display_name: value.display_name,
          avatar_kind: value.avatar_kind,
          avatar_value: value.avatar_value,
          updated_at: value.updated_at,
        };
        return { error: null };
      },
    };

    window.__SUPABASE_PLAYER_PROFILE_TEST_CLIENT__ = {
      auth: {
        async getSession() { return { data: { session }, error: null }; },
      },
      from(table) {
        if (table !== "player_profiles") throw new Error(`unexpected table ${table}`);
        return Object.create(tableBuilder);
      },
      storage: {
        from(bucket) {
          if (bucket !== "player-avatars") throw new Error(`unexpected bucket ${bucket}`);
          return {
            async upload() { return { error: null }; },
            async remove() { return { error: null }; },
            getPublicUrl() {
              return { data: { publicUrl: "https://iphhyjutbrahvfnsvdfn.supabase.co/storage/v1/object/public/player-avatars/11111111-1111-4111-8111-111111111111/avatar" } };
            },
          };
        },
      },
    };
  });

  await page.goto("/");
  await expect.poll(async () => page.evaluate(() => window.TexasHoldemPlayerProfile?.status?.())).toMatchObject({
    source: "cloud",
    signedIn: true,
    displayName: "雲端玩家",
    avatarKind: "preset",
  });
  await expect(page.locator("#playerName")).toHaveText("雲端玩家");
  await expect(page.locator('[data-profile-avatar-shell="hero"] .player-profile-avatar-fallback')).toHaveText("🤖");

  await page.locator("#playerProfileButton").click();
  await page.locator("#playerProfileNameInput").fill("我的牌桌名");
  await page.locator('[data-profile-preset="tiger"]').click();
  await page.locator("#playerProfileSave").click();
  await expect(page.locator("#playerName")).toHaveText("我的牌桌名");
  await expect.poll(async () => page.evaluate(() => window.__PLAYER_PROFILE_TEST__.writes.at(-1))).toMatchObject({
    user_id: "11111111-1111-4111-8111-111111111111",
    display_name: "我的牌桌名",
    avatar_kind: "preset",
    avatar_value: "tiger",
  });

  await page.evaluate(() => window.__PLAYER_PROFILE_TEST__.signOut());
  await expect.poll(async () => page.evaluate(() => window.TexasHoldemPlayerProfile?.status?.())).toMatchObject({
    source: "guest",
    signedIn: false,
    displayName: "本機遊客",
    avatarKind: "preset",
  });
  await expect(page.locator("#playerName")).toHaveText("本機遊客");
  await expect(page.locator('[data-profile-avatar-shell="hero"] .player-profile-avatar-fallback')).toHaveText("🐼");
});