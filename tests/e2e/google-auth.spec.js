import { expect, test } from "@playwright/test";

function installAuthMock(page, session = null) {
  return page.addInitScript(({ initialSession }) => {
    window.__AUTH_TEST_SESSION__ = initialSession;
    window.__AUTH_TEST__ = { oauthCalls: [], signOutCalls: [] };
    let listener = null;

    window.__SUPABASE_AUTH_TEST_CLIENT__ = {
      auth: {
        onAuthStateChange(callback) {
          listener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async getSession() {
          return { data: { session: window.__AUTH_TEST_SESSION__ }, error: null };
        },
        async signInWithOAuth(options) {
          window.__AUTH_TEST__.oauthCalls.push(options);
          return { data: { url: "https://accounts.google.com/mock" }, error: null };
        },
        async signOut(options) {
          window.__AUTH_TEST__.signOutCalls.push(options);
          window.__AUTH_TEST_SESSION__ = null;
          listener?.("SIGNED_OUT", null);
          return { error: null };
        },
      },
    };

    if (initialSession?.user) {
      const metadata = initialSession.user.user_metadata || {};
      localStorage.setItem("texasHoldemPlayerIdentityV1", JSON.stringify({
        userId: initialSession.user.id,
        name: metadata.full_name || metadata.name || "測試玩家",
        email: initialSession.user.email || "",
        avatarUrl: "",
      }));
    }
  }, { initialSession: session });
}

async function openAccountFromTopbar(page) {
  const accountButton = page.locator("#authAccountButton");
  const settingsButton = page.locator("#settingsMenuButton");
  await expect(accountButton).toBeVisible();
  await expect(accountButton).toHaveAttribute("data-auth-placement", "topbar");
  await expect(accountButton.locator("xpath=..")).toHaveAttribute("id", "topbarSettings");

  const placement = await page.evaluate(() => {
    const account = document.querySelector("#authAccountButton").getBoundingClientRect();
    const settings = document.querySelector("#settingsMenuButton").getBoundingClientRect();
    return {
      accountRight: account.right,
      settingsLeft: settings.left,
      gap: settings.left - account.right,
    };
  });
  expect(placement.accountRight).toBeLessThanOrEqual(placement.settingsLeft);
  expect(Math.abs(placement.gap - 8)).toBeLessThanOrEqual(1);

  await accountButton.click();
  await expect(page.locator("#authAccountOverlay")).toBeVisible();
  return accountButton;
}

test("Google 登入入口使用 Supabase OAuth 與正式返回網址", async ({ page }) => {
  await installAuthMock(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.1.0");

  const accountButton = await openAccountFromTopbar(page);
  await expect(accountButton).toContainText("玩家登入");
  await expect(page.locator("#googleSignInButton")).toHaveText(/使用 Google 登入/);
  await page.locator("#googleSignInButton").click();

  await expect.poll(
    () => page.evaluate(() => window.__AUTH_TEST__.oauthCalls.length),
  ).toBe(1);

  const oauthCall = await page.evaluate(() => window.__AUTH_TEST__.oauthCalls[0]);
  expect(oauthCall.provider).toBe("google");
  expect(oauthCall.options.scopes).toBe("openid email profile");
  expect(oauthCall.options.redirectTo).toBe("http://127.0.0.1:4173/");

  await page.keyboard.press("Escape");
  await expect(page.locator("#authAccountOverlay")).toBeHidden();
  await expect(accountButton).toHaveAttribute("aria-expanded", "false");
  await expect(accountButton).toBeFocused();
});

test("Google 工作階段更新玩家名稱並只登出目前裝置", async ({ page }) => {
  const session = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    user: {
      id: "11111111-2222-3333-4444-555555555555",
      email: "poker@example.com",
      user_metadata: {
        full_name: "測試玩家",
      },
    },
  };

  await installAuthMock(page, session);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 10_000 },
  ).toBe(true);

  await expect(page.locator("#authAccountButton")).toContainText("測試玩家");
  await expect(page.locator("#playerName")).toContainText("測試玩家");
  expect(await page.evaluate(() => state.players[0].name)).toBe("測試玩家");

  await openAccountFromTopbar(page);
  await expect(page.locator("#authSignedInView")).toBeVisible();
  await expect(page.locator("#authProfileName")).toHaveText("測試玩家");
  await expect(page.locator("#authProfileEmail")).toHaveText("poker@example.com");

  await page.locator("#googleSignOutButton").click();

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth.status().signedIn),
  ).toBe(false);
  await expect(page.locator("#authAccountButton")).toContainText("玩家登入");
  await expect(page.locator("#playerName")).toContainText("Owl");
  expect(await page.evaluate(() => state.players[0].name)).toBe("Owl");
  expect(await page.evaluate(() => window.__AUTH_TEST__.signOutCalls[0])).toEqual({ scope: "local" });
  expect(await page.evaluate(() => localStorage.getItem("texasHoldemPlayerIdentityV1"))).toBeNull();
});
