import { expect, test } from "@playwright/test";

function installDelayedReturningSession(page, delayMs = 2500) {
  return page.addInitScript(({ sessionDelay }) => {
    const session = {
      access_token: "loader-access-token",
      refresh_token: "loader-refresh-token",
      user: {
        id: "99999999-2222-3333-4444-555555555555",
        email: "loader@example.com",
        user_metadata: { full_name: "Loader Player" },
      },
    };

    localStorage.setItem("texasHoldemPlayerIdentityV1", JSON.stringify({
      userId: session.user.id,
      name: session.user.user_metadata.full_name,
      email: session.user.email,
      avatarUrl: "",
    }));

    window.__SUPABASE_AUTH_TEST_CLIENT__ = {
      auth: {
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async getSession() {
          await new Promise(resolve => setTimeout(resolve, sessionDelay));
          return { data: { session }, error: null };
        },
        async signInWithOAuth() {
          return { data: {}, error: null };
        },
        async signOut() {
          return { error: null };
        },
      },
    };
  }, { sessionDelay: delayMs });
}

test("返回登入驗證期間顯示專用牌桌動畫，完成後立即收起", async ({ page }) => {
  await installDelayedReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.2.0-opening-polish-v1");

  const entryOverlay = page.locator("#authEntryV2Overlay");
  const accountOverlay = page.locator("#authAccountOverlay");

  await expect(entryOverlay).toBeVisible();
  await expect(entryOverlay.locator(".auth-entry-v2-table")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-auth-entry-v2", "active");

  // Returning-session loading belongs to the dedicated AuthEntryV2 surface.
  // The player-account dialog stays closed unless the user explicitly opens it.
  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().loading ?? false),
    { timeout: 5_000 },
  ).toBe(true);
  await expect(accountOverlay).toBeHidden();

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 7_000 },
  ).toBe(true);

  // Auth may settle before the minimum returning-entry presentation duration.
  await expect(entryOverlay).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().visible ?? true),
    { timeout: 7_000 },
  ).toBe(false);
  await expect(accountOverlay).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-auth-entry-v2", "active");
});

test("沒有返回工作階段時不增加額外開場等待", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().loading ?? true),
    { timeout: 5_000 },
  ).toBe(false);

  await expect(page.locator("#authEntryV2Overlay")).toHaveCount(0);
  await expect(page.locator("#authAccountOverlay")).toBeHidden();
  await expect(page.locator("#authAccountStatus")).not.toHaveAttribute("data-tone", "pending");
});
