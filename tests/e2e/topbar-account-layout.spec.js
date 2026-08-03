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

test("1536px Safari 尺寸下登入名稱不會推歪頂部按鈕列", async ({ page }) => {
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
    const alignedControls = [
      "settingsMenuButton",
      "tutorialButton",
      "autoNewHandButton",
      "newHandButton",
    ].map(id => {
      const rect = document.querySelector(`#${id}`).getBoundingClientRect();
      return {
        id,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        center: rect.top + rect.height / 2,
      };
    });
    return {
      topbar: { left: topbar.left, right: topbar.right },
      brand: { right: brand.right },
      actions: { left: actions.left, right: actions.right },
      account: { width: account.width },
      buttons,
      alignedControls,
    };
  });

  expect(layout.account.width).toBeLessThanOrEqual(40);
  expect(Math.abs(layout.actions.right - layout.topbar.right)).toBeLessThanOrEqual(4);
  expect(layout.actions.left).toBeGreaterThanOrEqual(layout.brand.right + 8);

  const firstTop = layout.buttons[0].top;
  for (const button of layout.buttons) {
    expect(Math.abs(button.top - firstTop), button.id).toBeLessThanOrEqual(2);
  }

  const settings = layout.alignedControls.find(control => control.id === "settingsMenuButton");
  const tutorial = layout.alignedControls.find(control => control.id === "tutorialButton");
  expect(settings.height).toBe(tutorial.height);
  for (const control of layout.alignedControls.filter(control => control.id !== settings.id)) {
    expect(Math.abs(control.top - settings.top), `${control.id} top`).toBeLessThanOrEqual(1);
    expect(Math.abs(control.bottom - settings.bottom), `${control.id} bottom`).toBeLessThanOrEqual(1);
    expect(Math.abs(control.center - settings.center), `${control.id} center`).toBeLessThanOrEqual(1);
  }
});
