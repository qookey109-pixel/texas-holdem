import { expect, test } from "@playwright/test";

function installFastReturningSession(page, delayMs = 120) {
  return page.addInitScript(({ sessionDelay }) => {
    const session = {
      access_token: "auth-entry-v2-access-token",
      refresh_token: "auth-entry-v2-refresh-token",
      user: {
        id: "88888888-2222-3333-4444-555555555555",
        email: "entry-v2@example.com",
        user_metadata: { full_name: "Entry V2 Player" },
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

test("返回登入顯示精細牌桌 V2，快速驗證也至少保留約六秒", async ({ page }) => {
  await installFastReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.0.0");

  const overlay = page.locator("#authEntryV2Overlay");
  await expect(overlay).toBeVisible();
  await expect(page.locator('link[data-auth-entry-v2-style]')).toHaveAttribute(
    "href",
    /auth-entry-v2\.css\?v=auth-entry-v2-1$/,
  );

  await expect(overlay.locator(".auth-entry-v2-rail")).toBeVisible();
  await expect(overlay.locator(".auth-entry-v2-felt")).toBeVisible();
  await expect(overlay.locator(".auth-entry-v2-card")).toHaveCount(2);
  await expect(overlay.locator(".auth-entry-v2-chip-stack")).toHaveCount(3);
  await expect(overlay.locator(".auth-entry-v2-chip-stack i")).toHaveCount(15);
  await expect(overlay.locator(".auth-entry-v2-dealer")).toHaveText("D");
  await expect(overlay.locator(".auth-entry-v2-table-mark")).toContainText("TEXAS HOLD'EM");

  const presentation = await overlay.evaluate(element => {
    const table = element.querySelector(".auth-entry-v2-table");
    const firstCard = element.querySelector(".auth-entry-v2-card-one");
    const firstStack = element.querySelector(".auth-entry-v2-stack-red");
    const progress = element.querySelector(".auth-entry-v2-progress span");
    return {
      tableAnimation: getComputedStyle(table).animationName,
      cardAnimation: getComputedStyle(firstCard).animationName,
      chipAnimation: getComputedStyle(firstStack).animationName,
      progressAnimation: getComputedStyle(progress).animationName,
    };
  });

  expect(presentation.tableAnimation).toContain("auth-entry-v2-table-open");
  expect(presentation.cardAnimation).toContain("auth-entry-v2-card-one");
  expect(presentation.chipAnimation).toContain("auth-entry-v2-chip-stack-one");
  expect(presentation.progressAnimation).toContain("auth-entry-v2-progress");

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 5_000 },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => performance.now() - (window.AuthEntryV2?.status().startedAt || performance.now())),
    { timeout: 6_000 },
  ).toBeGreaterThan(4_500);

  await expect(overlay).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().visible ?? true),
    { timeout: 4_000 },
  ).toBe(false);

  const elapsedAtClose = await page.evaluate(
    () => performance.now() - (window.AuthEntryV2?.status().startedAt || performance.now()),
  );
  expect(elapsedAtClose).toBeGreaterThanOrEqual(5_800);
});

test("全新未登入開啟仍不增加六秒等待", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.0.0");

  await expect(page.locator("#authEntryV2Overlay")).toHaveCount(0);
  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().loading ?? true),
    { timeout: 5_000 },
  ).toBe(false);
});
