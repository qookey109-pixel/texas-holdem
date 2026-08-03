import { expect, test } from "@playwright/test";

const SIGNED_IN_SESSION = {
  access_token: "topbar-layout-access-token",
  refresh_token: "topbar-layout-refresh-token",
  user: {
    id: "99999999-8888-4777-8666-555555555555",
    email: "layout@example.com",
    user_metadata: {
      full_name: "吳宗霖測試玩家超長名稱",
    },
  },
};

function installSignedInAuthMock(page) {
  return page.addInitScript(({ session }) => {
    window.__AUTH_TEST_SESSION__ = session;
    window.__SUPABASE_AUTH_TEST_CLIENT__ = {
      auth: {
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async getSession() {
          return { data: { session: window.__AUTH_TEST_SESSION__ }, error: null };
        },
        async signInWithOAuth() {
          return { data: { url: "https://accounts.google.com/mock" }, error: null };
        },
        async signOut() {
          return { error: null };
        },
      },
    };
    localStorage.setItem("texasHoldemPlayerIdentityV1", JSON.stringify({
      userId: session.user.id,
      name: session.user.user_metadata.full_name,
      email: session.user.email,
      avatarUrl: "",
    }));
  }, { session: SIGNED_IN_SESSION });
}

test("1536px Safari 尺寸下頂部按鈕列保持置中", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await installSignedInAuthMock(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 10_000 },
  ).toBe(true);

  const accountButton = page.locator("#authAccountButton");
  await expect(accountButton).toBeVisible();
  await expect(accountButton).toHaveAttribute("data-auth-placement", "topbar");
  await expect(accountButton.locator(".auth-account-label")).toBeHidden();

  const layout = await page.evaluate(() => {
    const topbar = document.querySelector(".top-bar").getBoundingClientRect();
    const brand = document.querySelector(".brand-block").getBoundingClientRect();
    const actions = document.querySelector(".top-bar-actions").getBoundingClientRect();
    const account = document.querySelector("#authAccountButton").getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".top-bar-actions > button")]
      .filter(button => getComputedStyle(button).display !== "none")
      .map(button => {
        const rect = button.getBoundingClientRect();
        return { id: button.id, top: rect.top, bottom: rect.bottom };
      });
    return {
      topbar: { left: topbar.left, right: topbar.right },
      brand: { right: brand.right },
      actions: { left: actions.left, right: actions.right },
      account: { width: account.width },
      buttons,
    };
  });

  const topbarCenter = (layout.topbar.left + layout.topbar.right) / 2;
  const actionsCenter = (layout.actions.left + layout.actions.right) / 2;

  expect(layout.account.width).toBeLessThanOrEqual(40);
  expect(Math.abs(actionsCenter - topbarCenter)).toBeLessThanOrEqual(4);
  expect(layout.actions.left).toBeGreaterThanOrEqual(layout.brand.right + 8);

  const firstTop = layout.buttons[0].top;
  for (const button of layout.buttons) {
    expect(Math.abs(button.top - firstTop), button.id).toBeLessThanOrEqual(2);
  }
});
