import { expect, test } from "@playwright/test";

function installReturningSession(page) {
  return page.addInitScript(() => {
    const session = {
      access_token: "auth-video-playback-access-token",
      refresh_token: "auth-video-playback-refresh-token",
      user: {
        id: "77777777-2222-3333-4444-555555555555",
        email: "auth-video-playback@example.com",
        user_metadata: { full_name: "Playback Test Player" },
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

test("返回登入影片在瀏覽器中真的持續播放而非停在單一畫面", async ({ page }) => {
  await installReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.1.2-playback-fix");

  const video = page.locator("#authEntryV2Video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute(
    "src",
    /assets\/auth-entry-poker-720p\.mp4\?v=auth-entry-video-playback-v2$/,
  );

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().videoState || ""),
    { timeout: 8_000 },
  ).toBe("playing");

  const firstTime = await video.evaluate(element => element.currentTime);
  await page.waitForTimeout(900);
  const secondTime = await video.evaluate(element => element.currentTime);

  expect(secondTime).toBeGreaterThan(firstTime + 0.25);
  expect(secondTime).toBeGreaterThan(0.25);

  const runtime = await video.evaluate(element => ({
    paused: element.paused,
    ended: element.ended,
    readyState: element.readyState,
    networkState: element.networkState,
    currentTime: element.currentTime,
    videoWidth: element.videoWidth,
    videoHeight: element.videoHeight,
  }));

  expect(runtime.paused).toBe(false);
  expect(runtime.ended).toBe(false);
  expect(runtime.readyState).toBeGreaterThanOrEqual(2);
  expect(runtime.currentTime).toBeGreaterThan(0.25);
  expect(runtime.videoWidth).toBe(1280);
  expect(runtime.videoHeight).toBe(720);
});
