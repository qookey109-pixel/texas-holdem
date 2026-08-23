import { expect, test } from "@playwright/test";

function installReturningSession(page) {
  return page.addInitScript(() => {
    const session = {
      access_token: "auth-vector-animation-access-token",
      refresh_token: "auth-vector-animation-refresh-token",
      user: {
        id: "77777777-2222-3333-4444-555555555555",
        email: "auth-vector-animation@example.com",
        user_metadata: { full_name: "Vector Animation Player" },
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

test("返回登入向量開場保留動畫 contract 並推進牌桌階段", async ({ page }) => {
  await installReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("3.0.0-vector-opening-v2");

  await expect(page.locator("#authEntryV2Overlay video")).toHaveCount(0);

  const animationState = await page.locator(".auth-entry-v2-table").evaluate(element => {
    const animation = element.getAnimations()[0];
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationDelay: style.animationDelay,
      currentTime: Number(animation?.currentTime || 0),
      playState: animation?.playState || "",
    };
  });

  expect(animationState.animationName).toBe("auth-entry-v2-table-open");
  expect(animationState.animationDuration).toBe("1.45s");
  expect(animationState.animationDelay).toBe("0.08s");
  expect(animationState.currentTime).toBeGreaterThan(0);
  expect(["running", "finished"]).toContain(animationState.playState);

  // The table-opening animation is intentionally short (1.45 s + 80 ms delay).
  // On slower WebKit runners it can already be finished by the time the auth
  // module is observable, so currentTime is allowed to saturate at its endpoint.
  // Stage progression is the stable user-visible contract we actually need.
  await expect.poll(
    () => page.evaluate(() => {
      const rank = { "": 0, cards: 1, chips: 2, dealer: 3, ready: 4 };
      return rank[window.AuthEntryV2?.status().stage || ""] ?? 0;
    }),
    { timeout: 6_500 },
  ).toBeGreaterThanOrEqual(1);

  const status = await page.evaluate(() => window.AuthEntryV2?.status());
  expect(status.renderMode).toBe("vector");
  expect(status.videoState).toBe("disabled");
  expect(status.videoActive).toBe(false);
});

test("減少動態偏好停用裝飾動畫，但仍保持清晰向量牌桌", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("3.0.0-vector-opening-v2");

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().reducedMotion ?? false),
    { timeout: 5_000 },
  ).toBe(true);

  await expect(page.locator("#authEntryV2Overlay video, #authEntryV2Overlay img, #authEntryV2Overlay canvas"))
    .toHaveCount(0);

  const animationState = await page.evaluate(() => ({
    table: getComputedStyle(document.querySelector(".auth-entry-v2-table")).animationName,
    copy: getComputedStyle(document.querySelector(".auth-entry-v2-copy")).animationName,
    potOpacity: getComputedStyle(document.querySelector(".auth-entry-v2-pot")).opacity,
    stage: window.AuthEntryV2?.status().stage || "",
  }));

  expect(animationState.table).toBe("none");
  expect(animationState.copy).toBe("none");
  expect(animationState.potOpacity).toBe("1");
  expect(animationState.stage).toBe("ready");
});
