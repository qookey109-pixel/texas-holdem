import { expect, test } from "@playwright/test";

function installDelayedReturningSession(page, delayMs = 900) {
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

test("返回登入驗證期間顯示牌桌動畫，完成後立即收起", async ({ page }) => {
  await installDelayedReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => document.querySelector("#authAccountStatus")?.dataset.tone || ""),
    { timeout: 5_000 },
  ).toBe("pending");

  const overlay = page.locator("#authAccountOverlay");
  const table = overlay.locator(".auth-account-modal");
  await expect(overlay).toHaveAttribute("hidden", "");
  await expect(overlay).toBeVisible();
  await expect(table).toBeVisible();
  await expect(page.locator("#authAccountStatus")).toContainText("正在連接登入服務");

  const presentation = await table.evaluate(element => {
    const style = getComputedStyle(element);
    const before = getComputedStyle(element, "::before");
    const after = getComputedStyle(element, "::after");
    return {
      borderRadius: style.borderRadius,
      tableAnimation: style.animationName,
      cardsContent: before.content,
      cardsAnimation: before.animationName,
      chipsContent: after.content,
      chipsAnimation: after.animationName,
    };
  });

  expect(presentation.borderRadius).not.toBe("0px");
  expect(presentation.tableAnimation).toContain("auth-table-unfold");
  expect(presentation.cardsContent).not.toBe("none");
  expect(presentation.cardsAnimation).toContain("auth-cards-deal");
  expect(presentation.chipsContent).not.toBe("none");
  expect(presentation.chipsAnimation).toContain("auth-chips-drop");

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 5_000 },
  ).toBe(true);
  await expect(overlay).toBeHidden();
});

test("沒有返回工作階段時不增加額外開場等待", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().loading ?? true),
    { timeout: 5_000 },
  ).toBe(false);

  await expect(page.locator("#authAccountOverlay")).toBeHidden();
  await expect(page.locator("#authAccountStatus")).not.toHaveAttribute("data-tone", "pending");
});
