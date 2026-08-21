// Event wiring and boot sequence

function revealStableTableLayout() {
  document.documentElement.dataset.layoutReady = "true";
}

const layoutRevealFallbackTimer = window.setTimeout(revealStableTableLayout, 1800);

function dockLayoutEditorInSideRail() {
  const panel = els.layoutEditorPanel;
  const sideRail = document.querySelector(".side-rail");
  const historyPanel = document.querySelector("#historyPanel");
  if (!panel || !sideRail) return;

  if (!sideRail.contains(panel)) sideRail.insertBefore(panel, historyPanel || null);
  panel.classList.add("is-side-rail-layout-panel");

  const dockLabel = panel.querySelector(".layout-panel-head > span");
  if (dockLabel) dockLabel.textContent = "右側欄";

  if (!document.querySelector("#sideRailLayoutEditorStyles")) {
    const style = document.createElement("style");
    style.id = "sideRailLayoutEditorStyles";
    style.textContent = `
      html body .side-rail .layout-editor-panel {
        position: relative !important;
        z-index: auto !important;
        left: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        width: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        overflow: visible !important;
        transform: none !important;
        border-radius: 12px !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 12px 26px rgba(0,0,0,.2) !important;
      }
      html body .side-rail .layout-panel-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 8px;
        padding-right: 0 !important;
        cursor: default !important;
        user-select: text !important;
        touch-action: auto !important;
      }
      html body .side-rail .layout-panel-head > p,
      html body .side-rail .layout-panel-head > strong {
        grid-column: 1;
      }
      html body .side-rail .layout-panel-head > span {
        position: static !important;
        grid-column: 2;
        grid-row: 1 / 3;
        align-self: start;
        white-space: nowrap;
      }
      html body .side-rail .layout-editor-panel.is-panel-dragging,
      html body .side-rail .layout-editor-panel.is-panel-dragging .layout-panel-head {
        cursor: default !important;
      }
    `;
    document.head.appendChild(style);
  }
}

dockLayoutEditorInSideRail();

els.foldButton.addEventListener("click", () => playerAction("fold"));
els.callButton.addEventListener("click", () => playerAction("call"));
els.raiseButton.addEventListener("click", () => playerAction("raise"));
els.allInButton.addEventListener("click", () => playerAction("allin"));
els.newHandButton.addEventListener("click", startHand);
els.raiseAmount.addEventListener("input", () => {
  syncRaiseControl();
});
els.quickBets.addEventListener("click", event => {
  const button = event.target.closest("button[data-bet]");
  if (!button) return;
  setQuickBet(button.dataset.bet);
});

if (els.muteButton) {
  els.muteButton.addEventListener("click", () => {
    state.isMuted = !state.isMuted;
    Audio.setMuted?.(state.isMuted);
    render();
  });
}

if (els.autoNewHandButton) {
  els.autoNewHandButton.addEventListener("click", () => {
    state.autoNewHand = !state.autoNewHand;
    if (!state.autoNewHand) clearAutoNewHandTimer();
    if (state.autoNewHand && state.handOver) scheduleAutoNewHand();
    render();
  });
}

if (els.themeButton) {
  els.themeButton.addEventListener("click", () => {
    applyTheme(state.theme === "light" ? "dark" : "light");
  });
}

if (els.layoutButton) {
  els.layoutButton.addEventListener("click", () => {
    setLayoutEditing(!state.layout.editing);
    if (state.layout.editing) {
      requestAnimationFrame(() => {
        els.layoutEditorPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  });
}

if (els.tutorialButton) {
  els.tutorialButton.addEventListener("click", () => {
    openTutorial();
  });
}

if (els.tutorialCloseButton) {
  els.tutorialCloseButton.addEventListener("click", closeTutorial);
}

if (els.tutorialOverlay) {
  els.tutorialOverlay.addEventListener("click", event => {
    if (event.target === els.tutorialOverlay) closeTutorial();
  });
}

if (els.sessionSummaryClose) {
  els.sessionSummaryClose.addEventListener("click", closeSessionSummaryAndRestart);
}

if (els.sessionSummaryOverlay) {
  els.sessionSummaryOverlay.addEventListener("click", event => {
    if (event.target === els.sessionSummaryOverlay || event.target.closest("[data-session-restart]")) {
      closeSessionSummaryAndRestart();
    }
  });
}

if (els.tutorialNav) {
  els.tutorialNav.addEventListener("click", event => {
    const button = event.target.closest("button[data-tutorial-page]");
    if (!button) return;
    renderTutorial(button.dataset.tutorialPage);
  });
}

document.addEventListener("keydown", event => {
  handleLayoutKeyboard(event);
  if (event.key === "Escape" && els.tutorialOverlay && !els.tutorialOverlay.hidden) {
    closeTutorial();
  }
  if (event.key === "Escape" && els.sessionSummaryOverlay && !els.sessionSummaryOverlay.hidden) {
    closeSessionSummaryAndRestart();
  }
});

if (els.saveLayoutButton) els.saveLayoutButton.addEventListener("click", saveLayout);
if (els.autoLayoutButton) els.autoLayoutButton.addEventListener("click", autoArrangeLayout);
if (els.resetLayoutButton) els.resetLayoutButton.addEventListener("click", resetLayout);
if (els.lockLayoutButton) els.lockLayoutButton.addEventListener("click", toggleLayoutLock);
els.layoutNudgeButtons?.forEach(button => {
  button.addEventListener("click", () => nudgeSelectedLayout(button.dataset.layoutNudge));
});
els.dialogueArrowButtons?.forEach(button => {
  button.addEventListener("click", () => setSelectedDialogueArrow(button.dataset.dialogueArrow));
});
if (els.layoutPanelHandle && !els.layoutEditorPanel?.classList.contains("is-side-rail-layout-panel")) {
  els.layoutPanelHandle.addEventListener("pointerdown", beginLayoutPanelDrag);
  els.layoutPanelHandle.addEventListener("pointermove", moveLayoutPanelDrag);
  els.layoutPanelHandle.addEventListener("pointerup", endLayoutPanelDrag);
  els.layoutPanelHandle.addEventListener("pointercancel", endLayoutPanelDrag);
  window.addEventListener("pointermove", moveLayoutPanelDrag);
  window.addEventListener("pointerup", endLayoutPanelDrag);
  window.addEventListener("pointercancel", endLayoutPanelDrag);
}

if (els.arena) {
  els.arena.addEventListener("click", handleAiProfileClick);
  els.arena.addEventListener("keydown", handleAiProfileKeydown);
  els.arena.addEventListener("pointerdown", beginLayoutDrag);
  els.arena.addEventListener("pointermove", moveLayoutDrag);
  els.arena.addEventListener("pointerup", endLayoutDrag);
  els.arena.addEventListener("pointercancel", endLayoutDrag);
}

function handleAiProfileClick(event) {
  if (event.target.closest("[data-profile-close]")) {
    state.selectedProfilePosition = null;
    render();
    return;
  }

  if (event.target.closest("#aiProfilePanel")) return;

  const seat = event.target.closest(".seat[data-profile-position]");
  if (seat && !state.layout.editing) {
    state.selectedProfilePosition = Number(seat.dataset.profilePosition);
    render();
    return;
  }

  if (!state.layout.editing && state.selectedProfilePosition) {
    state.selectedProfilePosition = null;
    render();
  }
}

function handleAiProfileKeydown(event) {
  const seat = event.target.closest(".seat[data-profile-position]");
  if (!seat || state.layout.editing) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  state.selectedProfilePosition = Number(seat.dataset.profilePosition);
  render();
}

function syncCoachSettings() {
  if (!els.coachPanel) return;
  state.coach.enabled = els.coachEnabled.checked;
  state.coach.odds = els.coachOddsToggle.checked;
  state.coach.advice = els.coachAdviceToggle.checked;
  renderCoach();
}

[els.coachEnabled, els.coachOddsToggle, els.coachAdviceToggle].forEach(input => {
  if (input) input.addEventListener("change", syncCoachSettings);
});

const desktopOnlyMedia = window.matchMedia("(max-width: 900px) and (orientation: portrait)");

function applyDesktopOnlyMode() {
  const blocked = desktopOnlyMedia.matches;
  document.body.classList.toggle("is-desktop-only-blocked", blocked);

  if (blocked) {
    Audio.cleanup();
    clearAutoNewHandTimer();
    clearDialogueTimers();
    state.waitingForHuman = false;
  }

  return blocked;
}

function handleDesktopOnlyChange() {
  if (applyDesktopOnlyMode()) return;
  if (!state.players.length) {
    startHand();
    return;
  }
  render();
}

if (desktopOnlyMedia.addEventListener) {
  desktopOnlyMedia.addEventListener("change", handleDesktopOnlyChange);
} else {
  desktopOnlyMedia.addListener(handleDesktopOnlyChange);
}

function loadScriptOnce(selector, src, dataAttribute, { critical = false, label = src } = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      if (existing.dataset.loadState === "failed" && critical) {
        reject(new Error(`${label}載入失敗`));
      } else {
        resolve(existing);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(dataAttribute, "true");
    script.dataset.loadState = "loading";
    script.addEventListener("load", () => {
      script.dataset.loadState = "loaded";
      resolve(script);
    }, { once: true });
    script.addEventListener("error", () => {
      script.dataset.loadState = "failed";
      const error = new Error(`${label}載入失敗`);
      if (critical) {
        reject(error);
        return;
      }
      console.warn(`[boot] Optional script failed to load: ${src}`);
      resolve(null);
    }, { once: true });
    document.body.appendChild(script);
  });
}

function reportBootFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.gameBootState = "failed";
  window.clearTimeout(layoutRevealFallbackTimer);
  revealStableTableLayout();
  console.error(`[boot] Critical boot failure: ${message}`);

  let notice = document.querySelector("#gameBootFailure");
  if (!notice) {
    notice = document.createElement("section");
    notice.id = "gameBootFailure";
    notice.setAttribute("role", "alert");
    notice.setAttribute("aria-live", "assertive");
    notice.style.cssText = [
      "position:fixed",
      "z-index:10000",
      "left:50%",
      "top:18px",
      "transform:translateX(-50%)",
      "width:min(560px,calc(100% - 28px))",
      "padding:14px 16px",
      "border:1px solid rgba(255,120,120,.65)",
      "border-radius:12px",
      "background:rgba(72,12,18,.96)",
      "color:#fff",
      "box-shadow:0 16px 40px rgba(0,0,0,.42)",
      "font:600 14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    ].join(";");
    notice.innerHTML = `
      <strong style="display:block;font-size:15px;margin-bottom:4px">遊戲載入失敗</strong>
      <span>必要版面模組載入失敗，請重新整理頁面。</span>
      <button type="button" style="margin-left:10px;padding:5px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;cursor:pointer">重新整理</button>
    `;
    notice.querySelector("button")?.addEventListener("click", () => window.location.reload());
    document.body.appendChild(notice);
  }
}

function loadCardThemeUi() {
  if (document.querySelector('script[data-card-theme-ui]')) return;
  const script = document.createElement("script");
  script.src = "js/card-theme-ui.js?v=runtime-20260821-r1";
  script.async = false;
  script.dataset.cardThemeUi = "true";
  document.body.appendChild(script);
}

function applyStoredLayoutDimensions() {
  const savedSizes = window.LayoutSizeController?.getSizes?.();
  if (savedSizes) {
    Object.entries(savedSizes).forEach(([key, value]) => {
      window.LayoutSizeController?.setSize?.(key, value, { persist: false });
    });
  }

  let potScale = Number(window.OfficialLayoutPreset?.potScale) || 70;
  try {
    const storedPotScale = Number(localStorage.getItem("texasHoldemPotScaleV1"));
    if (Number.isFinite(storedPotScale) && storedPotScale > 0) potScale = storedPotScale;
  } catch (_) {
    // Keep the official scale when storage is unavailable.
  }
  document.documentElement.style.setProperty("--layout-pot-scale", (potScale / 100).toFixed(3));
}

async function bootGame() {
  document.documentElement.dataset.gameBootState = "loading";
  await loadScriptOnce(
    'script[data-layout-size-controls]',
    "js/layout-size-controls.js?v=runtime-20260821-r1",
    "data-layout-size-controls",
    { critical: true, label: "必要版面模組" },
  );

  applyStoredLayoutDimensions();
  applyLayout();
  requestAnimationFrame(() => {
    window.clearTimeout(layoutRevealFallbackTimer);
    revealStableTableLayout();
  });

  await loadScriptOnce(
    'script[data-continuous-bgm]',
    "js/bgm-light-continuous.js?v=runtime-20260821-r1",
    "data-continuous-bgm",
  );
  await loadScriptOnce(
    'script[data-sfx-volume-engine]',
    "js/sfx-volume-engine.js?v=runtime-20260821-r1",
    "data-sfx-volume-engine",
  );
  await loadScriptOnce(
    'script[data-split-audio-controls]',
    "js/audio-controls-split.js?v=runtime-20260821-r1",
    "data-split-audio-controls",
  );
  await loadScriptOnce(
    'script[data-audio-recovery]',
    "js/audio-recovery.js?v=runtime-20260821-r1",
    "data-audio-recovery",
  );
  await loadScriptOnce(
    'script[data-ai-emotion-face-ui]',
    "js/ai-emotion-face-ui.js?v=runtime-20260821-r1",
    "data-ai-emotion-face-ui",
  );
  await loadScriptOnce(
    'script[data-ai-timing]',
    "js/ai-timing.js?v=runtime-20260821-r1",
    "data-ai-timing",
  );
  await loadScriptOnce(
    'script[data-ai-turn-indicator]',
    "js/ai-turn-indicator.js?v=runtime-20260821-r1",
    "data-ai-turn-indicator",
  );

  Audio.setMuted?.(state.isMuted);
  document.documentElement.dataset.gameBootState = "ready";
  if (!applyDesktopOnlyMode()) startHand();
}

applyTheme(state.theme, { persist: false });
applyLayout();
loadCardThemeUi();
bootGame().catch(reportBootFailure);

// Mobile V1 keeps the desktop game engine intact and only changes presentation.
(() => {
  const landscapeMedia = window.matchMedia("(orientation: landscape) and (max-width: 1180px) and (max-height: 650px)");
  const portraitMedia = window.matchMedia("(orientation: portrait) and (max-width: 900px)");
  const sideRail = document.querySelector(".side-rail");
  const coachPanel = document.querySelector("#coachPanel");
  const historyPanel = document.querySelector("#historyPanel");
  const controls = document.querySelector(".controls");
  const raiseControl = document.querySelector(".raise-control");
  const noticeCard = document.querySelector("#desktopOnlyNotice > div");

  if (!sideRail || !coachPanel || !historyPanel || !controls) return;

  const coachAnchor = document.createComment("mobile-v1-coach-anchor");
  const historyAnchor = document.createComment("mobile-v1-history-anchor");
  sideRail.insertBefore(coachAnchor, coachPanel);
  sideRail.insertBefore(historyAnchor, historyPanel);

  const dock = document.createElement("nav");
  dock.className = "mobile-v1-dock";
  dock.setAttribute("aria-label", "手機版工具");
  dock.innerHTML = `
    <button type="button" data-mobile-panel="coach" aria-pressed="false">教練</button>
    <button type="button" data-mobile-panel="history" aria-pressed="false">紀錄</button>
    <button type="button" data-mobile-panel="settings" aria-pressed="false">設定</button>
  `;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "mobile-v1-backdrop";
  backdrop.setAttribute("aria-label", "關閉手機工具抽屜");

  const drawer = document.createElement("section");
  drawer.className = "mobile-v1-drawer";
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-label", "手機工具抽屜");
  drawer.innerHTML = `
    <header class="mobile-v1-drawer-header">
      <strong id="mobileV1DrawerTitle">手機工具</strong>
      <button type="button" class="mobile-v1-drawer-close" aria-label="關閉">×</button>
    </header>
    <div class="mobile-v1-drawer-content"></div>
  `;

  document.body.append(backdrop, drawer, dock);

  const drawerTitle = drawer.querySelector("#mobileV1DrawerTitle");
  const drawerContent = drawer.querySelector(".mobile-v1-drawer-content");
  const closeButton = drawer.querySelector(".mobile-v1-drawer-close");

  const betToggle = document.createElement("button");
  betToggle.type = "button";
  betToggle.className = "mobile-v1-bet-toggle";
  betToggle.textContent = "下注額";
  betToggle.setAttribute("aria-expanded", "false");
  betToggle.setAttribute("aria-controls", "raiseAmount");
  controls.insertBefore(betToggle, raiseControl || null);

  const portraitActions = document.createElement("div");
  portraitActions.className = "mobile-v1-portrait-actions";
  portraitActions.innerHTML = `
    <button type="button" data-mobile-portrait-action="tutorial">📘 新手教學</button>
    <button type="button" data-mobile-portrait-action="theme">☀ 明暗模式</button>
    <button type="button" data-mobile-portrait-action="account">👤 登入／存檔設定</button>
  `;
  noticeCard?.appendChild(portraitActions);

  function restorePanels() {
    if (coachPanel.parentNode !== sideRail) coachAnchor.parentNode?.insertBefore(coachPanel, coachAnchor.nextSibling);
    if (historyPanel.parentNode !== sideRail) historyAnchor.parentNode?.insertBefore(historyPanel, historyAnchor.nextSibling);
  }

  function settingsMarkup() {
    return `
      <div class="mobile-v1-settings-grid">
        <button type="button" data-mobile-proxy="themeButton">☀ 明暗模式</button>
        <button type="button" data-mobile-proxy="muteButton">🔊 音效</button>
        <button type="button" data-mobile-proxy="tutorialButton">📘 新手教學</button>
        <button type="button" data-mobile-proxy="autoNewHandButton">▶ 自動牌局</button>
        <button type="button" data-mobile-proxy="newHandButton">🃏 新牌局</button>
        <button type="button" data-mobile-proxy="authAccountButton">👤 登入／帳號</button>
      </div>
    `;
  }

  function setDockState(activePanel = "") {
    dock.querySelectorAll("[data-mobile-panel]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.mobilePanel === activePanel));
    });
  }

  function closeDrawer({ restore = true } = {}) {
    document.body.classList.remove("mobile-v1-drawer-open");
    drawer.dataset.panel = "";
    setDockState();
    if (restore) restorePanels();
  }

  function openDrawer(panelName) {
    restorePanels();
    drawerContent.replaceChildren();
    drawer.dataset.panel = panelName;

    if (panelName === "coach") {
      drawerTitle.textContent = "撲克教練";
      drawerContent.appendChild(coachPanel);
    } else if (panelName === "history") {
      drawerTitle.textContent = "牌局紀錄";
      drawerContent.appendChild(historyPanel);
    } else {
      drawerTitle.textContent = "快速設定";
      drawerContent.innerHTML = settingsMarkup();
    }

    document.body.classList.add("mobile-v1-drawer-open");
    setDockState(panelName);
  }

  function syncMobileMode() {
    const isLandscape = landscapeMedia.matches;
    const isPortrait = portraitMedia.matches;
    document.body.classList.toggle("is-mobile-v1-landscape", isLandscape);
    document.body.classList.toggle("is-mobile-v1-portrait", isPortrait);
    document.documentElement.dataset.mobileV1Ready = "true";

    if (!isLandscape) {
      document.body.classList.remove("mobile-v1-bet-sizing-open");
      betToggle.setAttribute("aria-expanded", "false");
      closeDrawer();
    }
  }

  betToggle.addEventListener("click", () => {
    const open = !document.body.classList.contains("mobile-v1-bet-sizing-open");
    document.body.classList.toggle("mobile-v1-bet-sizing-open", open);
    betToggle.setAttribute("aria-expanded", String(open));
  });

  dock.addEventListener("click", event => {
    const button = event.target.closest("[data-mobile-panel]");
    if (!button) return;
    const panelName = button.dataset.mobilePanel;
    const alreadyOpen = document.body.classList.contains("mobile-v1-drawer-open") && drawer.dataset.panel === panelName;
    if (alreadyOpen) closeDrawer();
    else openDrawer(panelName);
  });

  drawerContent.addEventListener("click", event => {
    const proxy = event.target.closest("[data-mobile-proxy]");
    if (!proxy) return;
    const targetId = proxy.dataset.mobileProxy;
    const target = document.querySelector(`#${targetId}`) || (targetId === "authAccountButton" ? document.querySelector("#settingsMenuButton") : null);
    target?.click();
    if (!["autoNewHandButton", "muteButton", "themeButton"].includes(targetId)) closeDrawer();
  });

  portraitActions.addEventListener("click", event => {
    const button = event.target.closest("[data-mobile-portrait-action]");
    if (!button) return;
    const action = button.dataset.mobilePortraitAction;
    if (action === "tutorial") els.tutorialButton?.click();
    if (action === "theme") els.themeButton?.click();
    if (action === "account") {
      const accountButton = document.querySelector("#authAccountButton");
      const settingsButton = document.querySelector("#settingsMenuButton");
      (accountButton || settingsButton)?.click();
    }
  });

  closeButton.addEventListener("click", () => closeDrawer());
  backdrop.addEventListener("click", () => closeDrawer());
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.body.classList.contains("mobile-v1-drawer-open")) closeDrawer();
  });

  [landscapeMedia, portraitMedia].forEach(media => {
    if (media.addEventListener) media.addEventListener("change", syncMobileMode);
    else media.addListener(syncMobileMode);
  });
  window.addEventListener("resize", syncMobileMode, { passive: true });
  window.addEventListener("orientationchange", syncMobileMode, { passive: true });

  syncMobileMode();

  window.MobileV1 = Object.freeze({
    openDrawer,
    closeDrawer,
    sync: syncMobileMode,
  });
})();
