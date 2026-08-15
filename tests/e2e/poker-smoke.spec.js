import { expect, test } from "@playwright/test";

function collectRuntimeIssues(page) {
  const issues = [];

  page.on("pageerror", error => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", message => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });

  page.on("requestfailed", request => {
    issues.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });

  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.endsWith("/favicon.ico")) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return issues;
}

async function clickLayoutControl(page) {
  const layoutButton = page.locator("#layoutButton");

  if (!(await layoutButton.isVisible())) {
    const settingsButtons = page.getByRole("button", { name: /設定/ });
    let settingsButton = null;

    for (let index = 0; index < await settingsButtons.count(); index += 1) {
      const candidate = settingsButtons.nth(index);
      if (await candidate.isVisible()) {
        settingsButton = candidate;
        break;
      }
    }

    expect(settingsButton, "版面按鈕隱藏時應有可見的設定選單按鈕").not.toBeNull();
    await settingsButton.click();
    await expect(layoutButton).toBeVisible();
  }

  await layoutButton.click();
}

test("核心牌局與主要面板可正常操作", async ({ page }) => {
  const runtimeIssues = collectRuntimeIssues(page);

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page).toHaveTitle("德州撲克");
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#handNumber")).toHaveText("第 1 局");
  await expect(page.locator("#playerCards .card")).toHaveCount(2);
  await expect(page.locator("#opponents .seat")).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => OfficialLayoutPreset.version)).toBe("3.0.0");
  await expect.poll(() => page.evaluate(() => OfficialLayoutPreset.sizes)).toEqual({
    heroCard: 70,
    boardCard: 68,
    aiCard: 44,
    aiSeat: 176,
    aiProfile: 272,
  });
  await expect.poll(() => page.evaluate(() => OfficialLayoutPreset.potScale)).toBe(70);
  await expect.poll(() => page.evaluate(() => OfficialLayoutPreset.layout.heroCards.top)).toBe(64.57);
  await expect.poll(() => page.evaluate(() => OfficialLayoutPreset.arrows)).toEqual({
    dialogue1: "down",
    dialogue2: "up",
    dialogue3: "up",
    dialogue4: "up",
    dialogue5: "up",
    dialogue6: "down",
  });
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.left)).toBe(50);
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.top)).toBeLessThanOrEqual(64.57);
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.top)).toBeGreaterThan(61.5);

  await page.locator("#newHandButton").click();
  await expect(page.locator("#handNumber")).toHaveText("第 2 局");

  await page.locator("#tutorialButton").click();
  await expect(page.locator("#tutorialOverlay")).toBeVisible();
  await page.locator("#tutorialCloseButton").click();
  await expect(page.locator("#tutorialOverlay")).toBeHidden();

  const sideRail = page.locator(".side-rail");
  await clickLayoutControl(page);
  await expect(page.locator("#layoutEditorPanel")).toBeVisible();
  await expect(sideRail).toHaveClass(/is-layout-editor-active/);
  await expect(page.locator("#coachPanel")).toBeHidden();
  await expect(page.locator("#historyPanel")).toBeHidden();
  await expect(page.locator("#layoutSizeControls")).toBeVisible();
  await expect(page.locator("[data-layout-size]")).toHaveCount(6);
  await expect(page.locator("#resetLayoutButton")).toHaveText("⭐ 官方預設");
  await expect(page.locator("[data-layout-size='heroCard']")).toHaveValue("70");
  await expect(page.locator("[data-layout-size='boardCard']")).toHaveValue("68");
  await expect(page.locator("[data-layout-size='aiCard']")).toHaveValue("44");
  await expect(page.locator("[data-layout-size='aiSeat']")).toHaveValue("176");
  await expect(page.locator("[data-layout-size='aiProfile']")).toHaveValue("272");
  await expect(page.locator("[data-layout-size='potScale']")).toHaveValue("70");
  await page.locator("[data-layout-size='aiProfile']").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-layout-size='aiProfile']")).toBeInViewport();

  const pot = page.locator('[data-layout-key="pot"]');
  await pot.click();
  await expect(pot.locator(":scope > .layout-resize-handle")).toHaveCount(4);
  await expect(page.locator("#layoutStatus")).toContainText("拖曳四角調整大小");

  const startPotScale = await page.evaluate(() => LayoutCornerResize.getPotScale());
  const resizeHandle = pot.locator('[data-layout-resize-handle="se"]');
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 36, handleBox.y + handleBox.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => LayoutCornerResize.getPotScale())).toBeGreaterThan(startPotScale);
  await expect.poll(() => page.locator("[data-layout-size='potScale']").inputValue()).not.toBe("70");

  await expect(page.locator("#layoutEditorMoreToolsToggle")).toHaveCount(0);
  await expect(page.locator("#resetLayoutButton")).toBeVisible();
  await page.locator("#resetLayoutButton").click();
  await expect.poll(() => page.evaluate(() => LayoutCornerResize.getPotScale())).toBe(70);
  await expect.poll(() => page.locator("[data-layout-size='potScale']").inputValue()).toBe("70");
  await expect.poll(() => page.locator("[data-layout-size='heroCard']").inputValue()).toBe("70");
  await expect.poll(() => page.locator("[data-layout-size='boardCard']").inputValue()).toBe("68");
  await expect.poll(() => page.locator("[data-layout-size='aiCard']").inputValue()).toBe("44");
  await expect.poll(() => page.evaluate(() => state.layout.items.seat1.left)).toBe(2.29);
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.top)).toBeLessThanOrEqual(64.57);
  await expect.poll(() => page.evaluate(() => state.layout.items.heroCards.top)).toBeGreaterThan(61.5);
  await expect.poll(() => page.evaluate(() => state.layout.items.actions.top)).toBe(89.13);
  await expect.poll(() => page.evaluate(() => state.layout.arrows.dialogue1)).toBe("down");
  await expect.poll(() => page.evaluate(() => state.layout.arrows.dialogue6)).toBe("down");

  await clickLayoutControl(page);
  await expect(page.locator("#layoutEditorPanel")).toBeHidden();
  await expect(sideRail).not.toHaveClass(/is-layout-editor-active/);
  await expect(page.locator("#coachPanel")).toBeVisible();
  await expect(page.locator("#historyPanel")).toBeVisible();

  const profile = page.locator("#aiProfilePanel");
  const firstSeat = page.locator("#opponents .seat").first();
  await firstSeat.click();
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute("data-anchor-position", /.+/);
  await page.waitForTimeout(220);

  const firstProfilePosition = await page.evaluate(() => {
    const arena = document.querySelector("#arena").getBoundingClientRect();
    const panel = document.querySelector("#aiProfilePanel").getBoundingClientRect();
    return {
      left: panel.left - arena.left,
      top: panel.top - arena.top,
      right: panel.right - arena.left,
      bottom: panel.bottom - arena.top,
      arenaWidth: arena.width,
      arenaHeight: arena.height,
    };
  });
  expect(firstProfilePosition.left).toBeGreaterThanOrEqual(8);
  expect(firstProfilePosition.top).toBeGreaterThanOrEqual(8);
  expect(firstProfilePosition.right).toBeLessThanOrEqual(firstProfilePosition.arenaWidth - 8);
  expect(firstProfilePosition.bottom).toBeLessThanOrEqual(firstProfilePosition.arenaHeight - 8);

  await page.locator("[data-profile-close]").click();
  await expect(profile).toBeHidden();

  const lastSeat = page.locator("#opponents .seat").last();
  await lastSeat.click();
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute("data-anchor-position", /.+/);
  await page.waitForTimeout(220);

  const secondProfilePosition = await page.evaluate(() => {
    const arena = document.querySelector("#arena").getBoundingClientRect();
    const panel = document.querySelector("#aiProfilePanel").getBoundingClientRect();
    return {
      left: panel.left - arena.left,
      top: panel.top - arena.top,
      right: panel.right - arena.left,
      bottom: panel.bottom - arena.top,
      arenaWidth: arena.width,
      arenaHeight: arena.height,
    };
  });
  expect(secondProfilePosition.left).toBeGreaterThanOrEqual(8);
  expect(secondProfilePosition.top).toBeGreaterThanOrEqual(8);
  expect(secondProfilePosition.right).toBeLessThanOrEqual(secondProfilePosition.arenaWidth - 8);
  expect(secondProfilePosition.bottom).toBeLessThanOrEqual(secondProfilePosition.arenaHeight - 8);
  expect(
    Math.abs(firstProfilePosition.left - secondProfilePosition.left)
      + Math.abs(firstProfilePosition.top - secondProfilePosition.top),
  ).toBeGreaterThan(80);

  await page.locator("[data-profile-close]").click();
  await expect(profile).toBeHidden();

  const callButton = page.locator("#callButton");
  await expect(callButton).toBeEnabled({ timeout: 30_000 });
  const logBeforeAction = await page.locator("#gameLog").textContent();
  await callButton.click();
  await expect(callButton).toBeDisabled({ timeout: 5_000 });
  await expect.poll(
    () => page.locator("#gameLog").textContent(),
    { timeout: 12_000 },
  ).not.toBe(logBeforeAction);

  await page.waitForTimeout(500);
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
