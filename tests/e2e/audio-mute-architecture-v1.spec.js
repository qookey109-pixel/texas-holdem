import { expect, test } from "@playwright/test";

async function waitForSfxVolumeEngine(page) {
  await expect.poll(
    () => page.evaluate(() => window.SfxVolumeEngineV1?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.1.0");
}

test("final audio recovery keeps SFX mute independent from BGM and volume", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await waitForSfxVolumeEngine(page);

  await expect.poll(
    () => page.evaluate(() => typeof Audio.cleanupAll),
    { timeout: 10_000 },
  ).toBe("function");

  await page.evaluate(() => Audio.setSfxVolume(0.43));
  const before = await page.evaluate(() => ({
    bgmEnabled: Audio.isBgmEnabled(),
    sfxVolume: Audio.getSfxVolume(),
    stateMuted: state.isMuted,
  }));
  expect(before.stateMuted).toBe(false);
  expect(before.sfxVolume).toBeCloseTo(0.43, 5);

  await page.locator("#muteButton").click();
  await expect.poll(() => page.evaluate(() => state.isMuted)).toBe(true);

  const muted = await page.evaluate(() => ({
    bgmEnabled: Audio.isBgmEnabled(),
    sfxVolume: Audio.getSfxVolume(),
    setMutedResult: Audio.setMuted(true),
  }));
  expect(muted.setMutedResult).toBe(true);
  expect(muted.bgmEnabled).toBe(before.bgmEnabled);
  expect(muted.sfxVolume).toBeCloseTo(0.43, 5);

  await page.locator("#muteButton").click();
  await expect.poll(() => page.evaluate(() => state.isMuted)).toBe(false);
  expect(await page.evaluate(() => Audio.setMuted(false))).toBe(false);
});

test("SFX mute and cleanup remain functional when audio recovery fails to load", async ({ page }) => {
  await page.route("**/js/audio-recovery.js*", route => route.abort("failed"));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#arena")).toBeVisible();
  await waitForSfxVolumeEngine(page);

  await expect.poll(
    () => page.evaluate(() => typeof Audio.cleanupAll),
    { timeout: 5_000 },
  ).toBe("undefined");

  await page.evaluate(() => Audio.setSfxVolume(0.41));
  const bgmBefore = await page.evaluate(() => Audio.isBgmEnabled());

  await page.locator("#muteButton").click();
  await expect.poll(
    () => page.evaluate(() => ({
      stateMuted: state.isMuted,
      engineMuted: window.SfxVolumeEngineV1.status().muted,
    })),
  ).toEqual({ stateMuted: true, engineMuted: true });

  const mutedSnapshot = await page.evaluate(() => ({
    bgmEnabled: Audio.isBgmEnabled(),
    sfxVolume: Audio.getSfxVolume(),
    setMutedResult: Audio.setMuted(true),
  }));
  expect(mutedSnapshot.setMutedResult).toBe(true);
  expect(mutedSnapshot.bgmEnabled).toBe(bgmBefore);
  expect(mutedSnapshot.sfxVolume).toBeCloseTo(0.41, 5);

  await page.locator("#muteButton").click();
  await expect.poll(
    () => page.evaluate(() => window.SfxVolumeEngineV1.status().muted),
  ).toBe(false);

  const activeBeforeCleanup = await page.evaluate(() => {
    Audio.allIn();
    return window.SfxVolumeEngineV1.status().activeSourceCount;
  });
  expect(activeBeforeCleanup).toBeGreaterThan(0);

  await page.evaluate(() => Audio.cleanup());
  expect(await page.evaluate(() => window.SfxVolumeEngineV1.status().activeSourceCount)).toBe(0);
});
