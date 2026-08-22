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

test("返回登入使用純 DOM/CSS 高解析開場，不再載入低解析影片", async ({ page }) => {
  let mediaRequests = 0;
  page.on("request", request => {
    if (/auth-entry-poker.*\.mp4/i.test(request.url())) mediaRequests += 1;
  });

  await installFastReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("3.0.0-vector-opening-v2");

  const overlay = page.locator("#authEntryV2Overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-render-mode", "vector");
  await expect(page.locator('link[data-auth-entry-v2-style][href^="js/auth-entry-v2.css"]')).toHaveCount(1);
  await expect(page.locator('link[data-auth-entry-presentation-style][href^="js/auth-entry-video-trial.css"]')).toHaveCount(1);

  await expect(overlay.locator("video, img, canvas")).toHaveCount(0);
  await expect(overlay.locator(".auth-entry-v2-rail")).toHaveCount(1);
  await expect(overlay.locator(".auth-entry-v2-felt")).toHaveCount(1);
  await expect(overlay.locator(".auth-entry-v2-card")).toHaveCount(2);
  await expect(overlay.locator(".auth-entry-v2-chip-stack")).toHaveCount(3);
  await expect(overlay.locator(".auth-entry-v2-chip-stack i")).toHaveCount(15);
  await expect(overlay.locator(".auth-entry-v2-pot i")).toHaveCount(5);
  await expect(overlay.locator(".auth-entry-v2-dealer")).toHaveText("D");
  await expect(overlay.locator(".auth-entry-v2-table-mark")).toContainText("TEXAS HOLD'EM");

  const presentation = await overlay.evaluate(element => {
    const table = element.querySelector(".auth-entry-v2-table");
    const firstCard = element.querySelector(".auth-entry-v2-card-one");
    const firstStack = element.querySelector(".auth-entry-v2-stack-red");
    const progress = element.querySelector(".auth-entry-v2-progress span");
    const overlayStyle = getComputedStyle(element);
    return {
      tableAnimation: getComputedStyle(table).animationName,
      cardAnimation: getComputedStyle(firstCard).animationName,
      chipAnimation: getComputedStyle(firstStack).animationName,
      progressAnimation: getComputedStyle(progress).animationName,
      backdropFilter: overlayStyle.backdropFilter || overlayStyle.webkitBackdropFilter || "none",
      renderMode: element.dataset.renderMode,
    };
  });

  expect(presentation.tableAnimation).toContain("auth-entry-v2-table-open");
  expect(presentation.cardAnimation).toContain("auth-entry-v2-card-one");
  expect(presentation.chipAnimation).toContain("auth-entry-v2-chip-stack-one");
  expect(presentation.progressAnimation).toContain("auth-entry-v2-progress");
  expect(presentation.backdropFilter).toBe("none");
  expect(presentation.renderMode).toBe("vector");

  await page.waitForTimeout(2_450);
  await expect(overlay.locator(".auth-entry-v2-card-one")).toHaveCSS("opacity", "1");
  await expect(overlay.locator(".auth-entry-v2-card-two")).toHaveCSS("opacity", "1");

  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().signedIn || false),
    { timeout: 5_000 },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().visible ?? true),
    { timeout: 6_000 },
  ).toBe(false);

  expect(mediaRequests).toBe(0);
});

test("Retina 2x 仍使用純向量結構，不依賴 raster media", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await installFastReturningSession(page, 80);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("3.0.0-vector-opening-v2");

  const density = await page.locator("#authEntryV2Overlay").evaluate(element => {
    const table = element.querySelector(".auth-entry-v2-table-wrap");
    const rect = table.getBoundingClientRect();
    return {
      dpr: window.devicePixelRatio,
      tableWidth: rect.width,
      rasterNodes: element.querySelectorAll("video, img, canvas").length,
      renderMode: element.dataset.renderMode,
    };
  });

  expect(density.dpr).toBe(2);
  expect(density.tableWidth).toBeLessThanOrEqual(650.5);
  expect(density.rasterNodes).toBe(0);
  expect(density.renderMode).toBe("vector");
  await context.close();
});

test("全新未登入開啟仍不增加六秒開場等待", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("3.0.0-vector-opening-v2");

  await expect(page.locator("#authEntryV2Overlay")).toHaveCount(0);
  await expect.poll(
    () => page.evaluate(() => window.TexasHoldemAuth?.status().loading ?? true),
    { timeout: 5_000 },
  ).toBe(false);
});