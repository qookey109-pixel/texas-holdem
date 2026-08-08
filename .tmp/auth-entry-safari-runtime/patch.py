from pathlib import Path
import re

def read(path):
    return Path(path).read_text()

def write(path, text):
    Path(path).write_text(text)

def replace_exact(path, old, new, expected=1):
    text = read(path)
    count = text.count(old)
    assert count == expected, f"{path}: expected {expected}, found {count}: {old!r}"
    write(path, text.replace(old, new))

js_path = 'js/auth-entry-v2.js'
js = read(js_path)
assert js.count('videoUrl: "assets/auth-entry-poker-720p.mp4?v=auth-entry-video-playback-v2",') == 1
js = js.replace(
    'videoUrl: "assets/auth-entry-poker-720p.mp4?v=auth-entry-video-playback-v2",',
    'videoUrl: "assets/auth-entry-poker-720p.mp4?v=auth-entry-video-safari-runtime-v3",',
    1,
)
assert js.count('  let videoState = "idle";\n') == 1
js = js.replace(
    '  let videoState = "idle";\n',
    '  let videoState = "idle";\n  let videoPlaybackError = "";\n  let videoWatchdogTimer = 0;\n  let videoPlayPending = false;\n',
    1,
)
assert js.count('        <div class="auth-entry-v2-halo" aria-hidden="true"></div>') == 1
js = js.replace(
    '        <div class="auth-entry-v2-halo" aria-hidden="true"></div>',
    '        <button id="authEntryV2PlayButton" class="auth-entry-v2-play-button" type="button" hidden>▶ 播放登入動畫</button>\n        <div class="auth-entry-v2-halo" aria-hidden="true"></div>',
    1,
)

new_media_block = '''  function clearVideoWatchdog() {
    if (!videoWatchdogTimer) return;
    window.clearTimeout(videoWatchdogTimer);
    videoWatchdogTimer = 0;
  }

  function currentVideoTime(video = entryVideo) {
    const value = Number(video?.currentTime || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setVideoPlaybackRate(video, rate) {
    try {
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
    } catch (_) {
      // Safari can reject rate changes while media is still negotiating metadata.
    }
  }

  function hideManualPlayButton() {
    const button = overlay?.querySelector("#authEntryV2PlayButton");
    if (button) {
      button.hidden = true;
      button.disabled = false;
      button.onclick = null;
    }
    overlay?.classList.remove("video-needs-gesture");
  }

  function showManualPlayButton(video, reason = "autoplay-blocked") {
    if (!overlay || !video?.isConnected) return;
    clearVideoWatchdog();
    videoActive = false;
    videoState = "blocked";
    videoPlaybackError = cleanText(reason, 120) || "autoplay-blocked";
    overlay.classList.remove("has-video");
    overlay.classList.add("video-needs-gesture");
    const button = overlay.querySelector("#authEntryV2PlayButton");
    if (!button) return;
    button.hidden = false;
    button.disabled = false;
    button.onclick = async () => {
      button.disabled = true;
      videoPlaybackError = "";
      setVideoPlaybackRate(video, 1);
      try {
        await video.play();
      } catch (error) {
        button.disabled = false;
        videoPlaybackError = cleanText(error?.name || error?.message || "manual-play-failed", 120);
      }
    };
  }

  function startPlaybackWatchdog(video) {
    clearVideoWatchdog();
    if (!overlay || !video?.isConnected || video.ended) return;
    const baseline = currentVideoTime(video);
    videoWatchdogTimer = window.setTimeout(async () => {
      videoWatchdogTimer = 0;
      if (!overlay || !video.isConnected || video.ended) return;
      if (currentVideoTime(video) > baseline + 0.12) return;

      videoState = "stalled";
      videoActive = false;
      const retryBaseline = currentVideoTime(video);
      setVideoPlaybackRate(video, 1);
      try {
        video.pause();
        await video.play();
        await delay(520);
        if (currentVideoTime(video) <= retryBaseline + 0.08) {
          throw new Error("playback-time-not-advancing");
        }
      } catch (error) {
        showManualPlayButton(video, error?.name || error?.message || "playback-stalled");
      }
    }, 1100);
  }

  function markVideoPlaying(video) {
    if (!overlay || !video?.isConnected) return;
    videoActive = true;
    videoState = "playing";
    videoPlaybackError = "";
    hideManualPlayButton();
    overlay.classList.add("has-video");
    setVideoPlaybackRate(video, CONFIG.videoPlaybackRate);
    startPlaybackWatchdog(video);
  }

  async function attemptVideoPlay(video) {
    if (!overlay || !video?.isConnected || videoPlayPending) return;
    videoPlayPending = true;
    try {
      setVideoPlaybackRate(video, 1);
      const playAttempt = video.play();
      if (playAttempt?.then) await playAttempt;
      markVideoPlaying(video);
    } catch (error) {
      showManualPlayButton(video, error?.name || error?.message || "autoplay-blocked");
    } finally {
      videoPlayPending = false;
    }
  }

  function activateVideo(video) {
    if (!overlay || !video?.isConnected || videoActive) return;
    void attemptVideoPlay(video);
  }

  function prepareVideo() {
    if (!overlay) {
      videoState = "idle";
      return;
    }

    const video = overlay.querySelector("#authEntryV2Video");
    if (!video) return;
    entryVideo = video;
    videoState = "loading";
    videoPlaybackError = "";
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    setVideoPlaybackRate(video, 1);

    const ready = () => activateVideo(video);
    video.addEventListener("loadedmetadata", ready, { once: true });
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("canplay", ready, { once: true });
    video.addEventListener("playing", () => markVideoPlaying(video));
    video.addEventListener("timeupdate", () => {
      if (videoState === "playing" && videoActive) startPlaybackWatchdog(video);
    });
    video.addEventListener("ended", () => {
      clearVideoWatchdog();
      videoState = "ended";
      video.pause();
    }, { once: true });
    video.addEventListener("error", () => {
      clearVideoWatchdog();
      videoState = "fallback";
      videoActive = false;
      videoPlaybackError = cleanText(video.error?.message || `media-error-${video.error?.code || 0}`, 120);
      hideManualPlayButton();
      overlay?.classList.remove("has-video");
    }, { once: true });

    video.src = CONFIG.videoUrl;
    video.load();
  }

'''
pattern = re.compile(r'  function activateVideo\(video\) \{.*?\n  function loadAuthCore\(\) \{', re.S)
js, count = pattern.subn(new_media_block + '  function loadAuthCore() {', js, count=1)
assert count == 1, f'auth media block replacement count: {count}'

old_dispose = '  function disposeVideo() {\n    if (!entryVideo) return;'
assert js.count(old_dispose) == 1
js = js.replace(
    old_dispose,
    '  function disposeVideo() {\n    clearVideoWatchdog();\n    hideManualPlayButton();\n    if (!entryVideo) return;',
    1,
)
old_duration = '''    const duration = prefersReducedMotion()
      ? CONFIG.reducedMotionDurationMs
      : CONFIG.minimumDurationMs;'''
assert js.count(old_duration) == 1
js = js.replace(
    old_duration,
    '''    // Keep the user-requested poker video available even when the OS asks
    // decorative CSS motion to be reduced.
    const duration = CONFIG.minimumDurationMs;''',
    1,
)
assert js.count('version: "2.1.2-playback-fix",') == 1
js = js.replace('version: "2.1.2-playback-fix",', 'version: "2.1.3-safari-runtime",', 1)
old_status = '''      videoActive,
      videoState,'''
assert js.count(old_status) == 1
js = js.replace(
    old_status,
    '''      videoActive,
      videoState,
      videoCurrentTime: currentVideoTime(),
      videoError: videoPlaybackError,
      reducedMotion: prefersReducedMotion(),''',
    1,
)
write(js_path, js)

css_path = 'js/auth-entry-video-trial.css'
css = read(css_path)
old_reduce = '''@media (prefers-reduced-motion: reduce) {
  .auth-entry-v2-video-shell {
    display: none !important;
  }

  .auth-entry-v2-table-wrap,
  .auth-entry-v2-halo {
    transition: none !important;
  }
}
'''
new_reduce = '''@media (prefers-reduced-motion: reduce) {
  .auth-entry-v2-video-shell,
  .auth-entry-v2-table-wrap,
  .auth-entry-v2-halo {
    transition: none !important;
  }
}
'''
assert css.count(old_reduce) == 1, 'reduced-motion video rule not found'
css = css.replace(old_reduce, new_reduce)
button_css = '''
.auth-entry-v2-play-button {
  position: absolute;
  z-index: 12;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 150px;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid rgba(234, 205, 136, .7);
  border-radius: 999px;
  background: rgba(3, 12, 17, .88);
  color: #f7f3e8;
  font: 800 13px/1 system-ui, sans-serif;
  letter-spacing: .05em;
  box-shadow: 0 12px 34px rgba(0,0,0,.48);
  cursor: pointer;
}

.auth-entry-v2-play-button[hidden] {
  display: none !important;
}

.auth-entry-v2-overlay.video-needs-gesture .auth-entry-v2-video-shell {
  opacity: .42;
}
'''
anchor = '\n@media (max-width: 620px) {'
assert css.count(anchor) == 1
css = css.replace(anchor, button_css + anchor, 1)
write(css_path, css)

test_path = 'tests/e2e/auth-entry-video-playback.spec.js'
test = read(test_path)
assert test.count('2.1.2-playback-fix') >= 1
test = test.replace('2.1.2-playback-fix', '2.1.3-safari-runtime')
test = test.replace('auth-entry-video-playback-v2', 'auth-entry-video-safari-runtime-v3')
test += '''

test("Safari/macOS 減少動態偏好仍播放主影片，只停用周邊 CSS 動效", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installReturningSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.version || ""),
    { timeout: 5_000 },
  ).toBe("2.1.3-safari-runtime");

  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().reducedMotion ?? false),
    { timeout: 5_000 },
  ).toBe(true);

  const video = page.locator("#authEntryV2Video");
  await expect(video).toHaveCount(1);
  await expect.poll(
    () => page.evaluate(() => window.AuthEntryV2?.status().videoState || ""),
    { timeout: 8_000 },
  ).toBe("playing");

  const shellDisplay = await page.locator(".auth-entry-v2-video-shell").evaluate(
    element => getComputedStyle(element).display,
  );
  expect(shellDisplay).not.toBe("none");

  const firstTime = await video.evaluate(element => element.currentTime);
  await page.waitForTimeout(900);
  const secondTime = await video.evaluate(element => element.currentTime);
  expect(secondTime).toBeGreaterThan(firstTime + 0.25);

  const animationState = await page.evaluate(() => ({
    table: getComputedStyle(document.querySelector(".auth-entry-v2-table")).animationName,
    copy: getComputedStyle(document.querySelector(".auth-entry-v2-copy")).animationName,
  }));
  expect(animationState.table).toBe("none");
  expect(animationState.copy).toBe("none");
});
'''
write(test_path, test)

replace_exact(
    'js/config.js',
    'authScript.src = "js/auth-entry-v2.js?v=auth-entry-video-playback-v2";',
    'authScript.src = "js/auth-entry-v2.js?v=auth-entry-safari-runtime-v3";',
)
replace_exact(
    'index.html',
    '<script src="js/config.js?v=tiered-multiway-equity-v2-7"></script>',
    '<script src="js/config.js?v=auth-entry-safari-runtime-v3"></script>',
)

marker = Path('.tmp/auth-entry-safari-runtime/READY')
if marker.exists():
    marker.unlink()
    try:
        marker.parent.rmdir()
    except OSError:
        pass
