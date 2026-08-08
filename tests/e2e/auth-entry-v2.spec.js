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

test("返回登入優先準備原始影片試播，CSS V2 保留為備援", async ({ page }) => {
  await installFastReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.1.3-safari-runtime");

  const overlay = page.locator("#authEntryV2Overlay");
  await expect(overlay).toBeVisible();
  await expect(page.locator('link[data-auth-entry-v2-style]')).toHaveAttribute(
    "href",
    /auth-entry-v2\.css\?v=auth-entry-video-trial-v1$/,
  );
  await expect(page.locator('link[data-auth-entry-video-style]')).toHaveAttribute(
    "href",
    /auth-entry-video-trial\.css\?v=auth-entry-video-crop-v2$/,
  );

  const video = overlay.locator("#authEntryV2Video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("src", /assets\/auth-entry-poker-720p\.mp4\?v=auth-entry-video-safari-runtime-v3$/);
  await expect(video).toHaveAttribute("autoplay", "");
  await expect(video).toHaveAttribute("muted", "");
  await expect(video).toHaveAttribute("playsinline", "");
  await expect(video).toHaveAttribute("preload", "auto");

  const mediaConfig = await video.evaluate(element => ({
    defaultMuted: element.defaultMuted,
    playsInline: element.playsInline,
  }));
  expect(mediaConfig.defaultMuted).toBe(true);
  expect(mediaConfig.playsInline).toBe(true);

  // Playback startup timing differs in WebKit. Actual playback progression and
  // runtime playback-rate behavior are covered by auth-entry-video-playback.spec.js.
  // This setup test only verifies durable media configuration and CSS fallback.

  // The layered table must remain in the DOM so unsupported codecs/network failures
  // never leave a blank returning-login screen.
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
    const shell = element.querySelector(".auth-entry-v2-video-shell");
    const videoElement = element.querySelector(".auth-entry-v2-video");
    const videoStyle = getComputedStyle(videoElement);
    const videoMatrix = new DOMMatrix(videoStyle.transform);
    return {
      tableAnimation: getComputedStyle(table).animationName,
      cardAnimation: getComputedStyle(firstCard).animationName,
      chipAnimation: getComputedStyle(firstStack).animationName,
      progressAnimation: getComputedStyle(progress).animationName,
      videoShellPosition: getComputedStyle(shell).position,
      videoObjectFit: videoStyle.objectFit,
      videoScale: videoMatrix.a,
    };
  });

  expect(presentation.tableAnimation).toContain("auth-entry-v2-table-open");
  expect(presentation.cardAnimation).toContain("auth-entry-v2-card-one");
  expect(presentation.chipAnimation).toContain("auth-entry-v2-chip-stack-one");
  expect(presentation.progressAnimation).toContain("auth-entry-v2-progress");
  expect(presentation.videoShellPosition).toBe("absolute");
  expect(presentation.videoObjectFit).toBe("cover");
  expect(presentation.videoScale).toBeCloseTo(1.31, 2);

  await overlay.evaluate(element => element.classList.add("has-video"));
  await expect(overlay.locator(".auth-entry-v2-kicker")).toBeHidden();
  await expect(overlay.locator(".auth-entry-v2-copy strong")).toHaveCSS("margin-top", "0px");

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 5_000 },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => performance.now() - (window.AuthEntryV2?.status().startedAt || performance.now())),
    { timeout: 7_000 },
  ).toBeGreaterThan(5_000);

  await expect(overlay).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().visible ?? true),
    { timeout: 4_000 },
  ).toBe(false);

  const elapsedAtClose = await page.evaluate(
    () => performance.now() - (window.AuthEntryV2?.status().startedAt || performance.now()),
  );
  expect(elapsedAtClose).toBeGreaterThanOrEqual(6_300);
});

test("原始影片載入失敗時仍安全使用 CSS 牌桌備援", async ({ page }) => {
  await page.route("**/assets/auth-entry-poker-720p.mp4*", route => route.abort());
  await installFastReturningSession(page, 80);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.1.3-safari-runtime");

  const overlay = page.locator("#authEntryV2Overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".auth-entry-v2-rail")).toBeVisible();

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().videoState || ""),
    { timeout: 5_000 },
  ).toBe("fallback");

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().visible ?? true),
    { timeout: 8_000 },
  ).toBe(false);
});

test("全新未登入開啟仍不增加影片或六秒等待", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.1.3-safari-runtime");

  await expect(page.locator("#authEntryV2Overlay")).toHaveCount(0);
  await expect(page.locator("#authEntryV2Video")).toHaveCount(0);
  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().loading ?? true),
    { timeout: 5_000 },
  ).toBe(false);
});