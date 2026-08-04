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

test("1536px Safari 尺寸下帳號在設定左側、間距一致且所有按鈕平行", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await installSignedInAuthMock(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 10_000 },
  ).toBe(true);

  const accountButton = page.locator("#authAccountButton");
  const settingsShell = page.locator("#topbarSettings");
  const settingsButton = page.locator("#settingsMenuButton");

  await expect(accountButton).toBeVisible();
  await expect(accountButton).toHaveAttribute("data-auth-placement", "topbar");
  await expect(accountButton.locator(".auth-account-label")).toBeVisible();
  await expect(settingsShell).toBeVisible();
  await expect(settingsButton).toBeVisible();
  await expect(page.locator('link[href="topbar-control-alignment-v2.css?v=settings-shell-align-v2"]')).toHaveCount(1);

  const layout = await page.evaluate(() => {
    const topbar = document.querySelector(".top-bar").getBoundingClientRect();
    const brand = document.querySelector(".brand-block").getBoundingClientRect();
    const actions = document.querySelector(".top-bar-actions").getBoundingClientRect();
    const account = document.querySelector("#authAccountButton");
    const settings = document.querySelector("#settingsMenuButton");
    const settingsShell = document.querySelector("#topbarSettings");

    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const controls = [...new Set([
      account,
      settings,
      ...document.querySelectorAll(".top-bar-actions > button"),
    ])]
      .filter(visible)
      .map(button => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          id: button.id,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          center: rect.top + rect.height / 2,
          marginTop: Number.parseFloat(style.marginTop || "0"),
          marginBottom: Number.parseFloat(style.marginBottom || "0"),
        };
      })
      .sort((a, b) => a.left - b.left);

    const gaps = controls.slice(1).map((control, index) => ({
      from: controls[index].id,
      to: control.id,
      value: control.left - controls[index].right,
    }));

    const settingsRect = settings.getBoundingClientRect();
    const accountRect = account.getBoundingClientRect();
    const shellRect = settingsShell.getBoundingClientRect();
    const shellStyle = getComputedStyle(settingsShell);

    return {
      topbar: { left: topbar.left, right: topbar.right },
      brand: { right: brand.right },
      actions: { left: actions.left, right: actions.right },
      account: {
        left: accountRect.left,
        right: accountRect.right,
        width: accountRect.width,
      },
      settingsParentId: settings.parentElement?.id || "",
      settings: {
        left: settingsRect.left,
        top: settingsRect.top,
        bottom: settingsRect.bottom,
        height: settingsRect.height,
        center: settingsRect.top + settingsRect.height / 2,
      },
      shell: {
        top: shellRect.top,
        bottom: shellRect.bottom,
        height: shellRect.height,
        center: shellRect.top + shellRect.height / 2,
        display: shellStyle.display,
        alignItems: shellStyle.alignItems,
        gap: Number.parseFloat(shellStyle.columnGap || shellStyle.gap || "0"),
      },
      controls,
      gaps,
    };
  });

  expect(layout.account.width).toBeGreaterThanOrEqual(168);
  expect(layout.account.width).toBeLessThanOrEqual(220);
  expect(layout.account.right).toBeLessThanOrEqual(layout.settings.left);
  expect(Math.abs(layout.settings.left - layout.account.right - 8)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.actions.right - layout.topbar.right)).toBeLessThanOrEqual(4);
  expect(layout.actions.left).toBeGreaterThanOrEqual(layout.brand.right + 8);
  expect(layout.settingsParentId).toBe("topbarSettings");
  expect(layout.shell.display).toBe("flex");
  expect(layout.shell.alignItems).toBe("center");
  expect(layout.shell.gap).toBe(8);
  expect(layout.shell.height).toBe(34);
  expect(layout.settings.height).toBe(34);
  expect(Math.abs(layout.shell.top - layout.settings.top)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(layout.shell.bottom - layout.settings.bottom)).toBeLessThanOrEqual(0.5);
  expect(layout.controls.length).toBeGreaterThanOrEqual(6);

  for (const control of layout.controls) {
    expect(control.height, `${control.id} height`).toBe(34);
    expect(Math.abs(control.top - layout.settings.top), `${control.id} top`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(control.bottom - layout.settings.bottom), `${control.id} bottom`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(control.center - layout.settings.center), `${control.id} center`).toBeLessThanOrEqual(0.5);
    expect(control.marginTop, `${control.id} margin-top`).toBe(0);
    expect(control.marginBottom, `${control.id} margin-bottom`).toBe(0);
  }

  for (const gap of layout.gaps) {
    expect(Math.abs(gap.value - 8), `${gap.from} → ${gap.to} gap`).toBeLessThanOrEqual(1);
  }
});
