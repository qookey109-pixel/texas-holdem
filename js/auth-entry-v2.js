// Returning-session entry sequence. Uses the original poker video when it can play,
// while keeping the layered CSS table as an immediate and reliable fallback.
(() => {
  "use strict";

  if (window.AuthEntryV2?.version) return;

  const CONFIG = Object.freeze({
    identityStorageKey: "texasHoldemPlayerIdentityV1",
    coreScriptUrl: "js/google-auth.js?v=google-auth-v1.1",
    styleUrl: "js/auth-entry-v2.css?v=auth-entry-video-trial-v1",
    videoStyleUrl: "js/auth-entry-video-trial.css?v=auth-entry-video-crop-v2",
    videoUrl: "assets/auth-entry-poker-720p.mp4?v=auth-entry-video-720p-v1",
    videoPlaybackRate: 1.55,
    minimumDurationMs: 6500,
    reducedMotionDurationMs: 900,
    authSettleTimeoutMs: 18000,
  });

  let overlay = null;
  let entryVideo = null;
  let stageTimers = [];
  let startedAt = 0;
  let active = false;
  let videoActive = false;
  let videoState = "idle";

  function cleanText(value, maxLength = 80) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function hasCachedIdentity() {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG.identityStorageKey) || "null");
      return Boolean(cleanText(value?.name));
    } catch (_) {
      return false;
    }
  }

  function hasAuthCallbackParameters() {
    return /(?:access_token|refresh_token|provider_token|error_description|[?&#]code=)/
      .test(`${location.search}&${location.hash}`);
  }

  function shouldShowEntry() {
    return hasCachedIdentity() || hasAuthCallbackParameters();
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, Math.max(0, milliseconds)));
  }

  function installStylesheet({ href, marker }) {
    if (document.querySelector(`link[${marker}]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(marker, "true");
    document.head.appendChild(link);
  }

  function installStylesheets() {
    installStylesheet({ href: CONFIG.styleUrl, marker: "data-auth-entry-v2-style" });
    installStylesheet({ href: CONFIG.videoStyleUrl, marker: "data-auth-entry-video-style" });
  }

  function chipStack(name, count = 5) {
    return `<span class="auth-entry-v2-chip-stack ${name}">${Array.from({ length: count }, (_, index) => (
      `<i style="--chip-index:${index}"></i>`
    )).join("")}</span>`;
  }

  function createOverlay() {
    installStylesheets();
    const node = document.createElement("section");
    node.id = "authEntryV2Overlay";
    node.className = "auth-entry-v2-overlay";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-label", "正在準備德州撲克牌桌");
    node.innerHTML = `
      <div class="auth-entry-v2-ambient" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="auth-entry-v2-stage">
        <div class="auth-entry-v2-video-shell" aria-hidden="true">
          <video id="authEntryV2Video" class="auth-entry-v2-video" muted autoplay playsinline preload="auto"></video>
          <span class="auth-entry-v2-video-glass"></span>
        </div>
        <div class="auth-entry-v2-halo" aria-hidden="true"></div>
        <div class="auth-entry-v2-table-wrap" aria-hidden="true">
          <div class="auth-entry-v2-table-shadow"></div>
          <div class="auth-entry-v2-table">
            <span class="auth-entry-v2-fold auth-entry-v2-fold-left"></span>
            <span class="auth-entry-v2-fold auth-entry-v2-fold-right"></span>
            <div class="auth-entry-v2-rail">
              <div class="auth-entry-v2-felt">
                <span class="auth-entry-v2-felt-line"></span>
                <span class="auth-entry-v2-table-mark"><b>NO LIMIT</b><em>TEXAS HOLD'EM</em></span>
                <span class="auth-entry-v2-dealer">D</span>
                <div class="auth-entry-v2-cards">
                  <span class="auth-entry-v2-card auth-entry-v2-card-one"><b>A</b><i>♠</i></span>
                  <span class="auth-entry-v2-card auth-entry-v2-card-two is-red"><b>K</b><i>♥</i></span>
                </div>
                <div class="auth-entry-v2-chips">
                  ${chipStack("auth-entry-v2-stack-red", 5)}
                  ${chipStack("auth-entry-v2-stack-gold", 6)}
                  ${chipStack("auth-entry-v2-stack-blue", 4)}
                </div>
                <span class="auth-entry-v2-spark auth-entry-v2-spark-one"></span>
                <span class="auth-entry-v2-spark auth-entry-v2-spark-two"></span>
                <span class="auth-entry-v2-spark auth-entry-v2-spark-three"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="auth-entry-v2-copy">
          <span class="auth-entry-v2-kicker">TEXAS HOLD'EM</span>
          <strong id="authEntryV2Title">展開牌桌</strong>
          <div class="auth-entry-v2-progress" aria-hidden="true"><span></span></div>
          <small id="authEntryV2Status">正在準備你的牌局…</small>
        </div>
      </div>`;
    document.body.appendChild(node);
    document.documentElement.dataset.authEntryV2 = "active";
    overlay = node;
    return node;
  }

  function setStage(title, status, stage) {
    if (!overlay) return;
    const titleNode = overlay.querySelector("#authEntryV2Title");
    const statusNode = overlay.querySelector("#authEntryV2Status");
    if (titleNode) titleNode.textContent = title;
    if (statusNode) statusNode.textContent = status;
    overlay.dataset.stage = stage;
  }

  function scheduleStages() {
    if (prefersReducedMotion()) {
      setStage("準備牌桌", "正在同步玩家資料…", "ready");
      return;
    }
    const stages = [
      [1250, "發出手牌", "洗牌完成，正在發出起手牌…", "cards"],
      [2800, "整理籌碼", "正在整理籌碼與座位…", "chips"],
      [4500, "確認莊位", "正在同步玩家與牌桌狀態…", "dealer"],
      [5750, "準備開局", "最後確認完成，即將進入牌桌…", "ready"],
    ];
    stageTimers = stages.map(([after, title, status, stage]) => window.setTimeout(
      () => setStage(title, status, stage),
      after,
    ));
  }

  function clearStageTimers() {
    stageTimers.forEach(timer => window.clearTimeout(timer));
    stageTimers = [];
  }

  function activateVideo(video) {
    if (!overlay || !video?.isConnected || videoActive || prefersReducedMotion()) return;
    const playAttempt = video.play();
    if (!playAttempt?.then) {
      videoActive = true;
      videoState = "playing";
      overlay.classList.add("has-video");
      return;
    }
    playAttempt.then(() => {
      if (!overlay || !video.isConnected) return;
      videoActive = true;
      videoState = "playing";
      overlay.classList.add("has-video");
    }).catch(() => {
      videoState = "fallback";
    });
  }

  function prepareVideo() {
    if (!overlay || prefersReducedMotion()) {
      videoState = prefersReducedMotion() ? "reduced-motion" : "idle";
      return;
    }

    const video = overlay.querySelector("#authEntryV2Video");
    if (!video) return;
    entryVideo = video;
    videoState = "loading";
    video.defaultPlaybackRate = CONFIG.videoPlaybackRate;
    video.playbackRate = CONFIG.videoPlaybackRate;
    video.muted = true;
    video.playsInline = true;

    const ready = () => activateVideo(video);
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("canplay", ready, { once: true });
    video.addEventListener("playing", () => {
      if (!overlay || !video.isConnected) return;
      videoActive = true;
      videoState = "playing";
      overlay.classList.add("has-video");
    }, { once: true });
    video.addEventListener("ended", () => {
      videoState = "ended";
      video.pause();
    }, { once: true });
    video.addEventListener("error", () => {
      videoState = "fallback";
      videoActive = false;
      overlay?.classList.remove("has-video");
    }, { once: true });

    video.src = CONFIG.videoUrl;
    video.load();
  }

  function loadAuthCore() {
    if (window.TexasHoldemAuth?.version) return Promise.resolve();

    const existing = document.querySelector('script[data-google-auth-core]');
    if (existing) {
      return new Promise(resolve => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
      });
    }

    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = CONFIG.coreScriptUrl;
      script.async = false;
      script.dataset.googleAuthCore = "true";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
    });
  }

  async function waitForAuthSettled() {
    const deadline = performance.now() + CONFIG.authSettleTimeoutMs;
    while (performance.now() < deadline) {
      const status = window.TexasHoldemAuth?.status?.();
      if (status && status.loading === false) return;
      await delay(80);
    }
  }

  function disposeVideo() {
    if (!entryVideo) return;
    try {
      entryVideo.pause();
      entryVideo.removeAttribute("src");
      entryVideo.load();
    } catch (_) {
      // The CSS fallback remains safe even if media cleanup is unavailable.
    }
    entryVideo = null;
    videoActive = false;
  }

  async function closeOverlay() {
    if (!overlay) return;
    overlay.classList.add("is-leaving");
    await delay(prefersReducedMotion() ? 80 : 460);
    disposeVideo();
    overlay.remove();
    overlay = null;
    active = false;
    clearStageTimers();
    delete document.documentElement.dataset.authEntryV2;
  }

  async function start() {
    const showEntry = shouldShowEntry();
    const duration = prefersReducedMotion()
      ? CONFIG.reducedMotionDurationMs
      : CONFIG.minimumDurationMs;

    if (showEntry) {
      active = true;
      startedAt = performance.now();
      createOverlay();
      scheduleStages();
      prepareVideo();
    }

    await loadAuthCore();
    if (!showEntry) return;

    const elapsed = performance.now() - startedAt;
    await Promise.all([
      delay(Math.max(0, duration - elapsed)),
      waitForAuthSettled(),
    ]);
    await closeOverlay();
  }

  window.AuthEntryV2 = Object.freeze({
    version: "2.1.1-hd",
    minimumDurationMs: CONFIG.minimumDurationMs,
    videoUrl: CONFIG.videoUrl,
    status: () => ({
      active,
      startedAt,
      stage: overlay?.dataset.stage || "",
      visible: Boolean(overlay?.isConnected),
      videoActive,
      videoState,
    }),
  });

  start();
})();
