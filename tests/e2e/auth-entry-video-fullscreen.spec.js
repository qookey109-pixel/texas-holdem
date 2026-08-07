import { expect, test } from "@playwright/test";

function installReturningSession(page) {
  return page.addInitScript(() => {
    const session = {
      access_token: "auth-entry-fullscreen-access-token",
      refresh_token: "auth-entry-fullscreen-refresh-token",
      user: {
        id: "99999999-2222-3333-4444-555555555555",
        email: "fullscreen-entry@example.com",
        user_metadata: { full_name: "Fullscreen Entry Player" },
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
  });
}

test("返回登入影片啟用後覆蓋整個 viewport 並使用 cover", async ({ page }) => {
  await installReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const overlay = page.locator("#authEntryV2Overlay");
  await expect(overlay).toBeVisible();
  await expect(page.locator(".auth-entry-v2-video-shell")).toHaveCount(1);

  await page.evaluate(() => {
    document.querySelector("#authEntryV2Overlay")?.classList.add("has-video");
  });

  const geometry = await page.locator(".auth-entry-v2-video-shell").evaluate(element => {
    const rect = element.getBoundingClientRect();
    const video = element.querySelector("video");
    const style = getComputedStyle(element);
    const videoStyle = getComputedStyle(video);
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position: style.position,
      borderRadius: style.borderRadius,
      objectFit: videoStyle.objectFit,
    };
  });

  expect(geometry.position).toBe("fixed");
  expect(Math.abs(geometry.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.width - geometry.viewportWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.height - geometry.viewportHeight)).toBeLessThanOrEqual(1);
  expect(geometry.borderRadius).toBe("0px");
  expect(geometry.objectFit).toBe("cover");

  await expect(page.locator(".auth-entry-v2-copy")).toHaveCSS("opacity", "0");
});
