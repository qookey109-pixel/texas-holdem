// Event wiring and boot sequence

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

function loadScriptOnce(selector, src, dataAttribute) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(dataAttribute, "true");
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", resolve, { once: true });
    document.body.appendChild(script);
  });
}

function loadCardThemeUi() {
  if (document.querySelector('script[data-card-theme-ui]')) return;
  const script = document.createElement("script");
  script.src = "js/card-theme-ui.js?v=two-decks-static-glow-v81";
  script.async = false;
  script.dataset.cardThemeUi = "true";
  document.body.appendChild(script);
}

async function bootGame() {
  await loadScriptOnce(
    'script[data-continuous-bgm]',
    "js/bgm-light-continuous.js?v=upbeat-loop-v2",
    "data-continuous-bgm",
  );
  await loadScriptOnce(
    'script[data-sfx-volume-engine]',
    "js/sfx-volume-engine.js?v=volume-100-v1",
    "data-sfx-volume-engine",
  );
  await loadScriptOnce(
    'script[data-split-audio-controls]',
    "js/audio-controls-split.js?v=button-popover-v4",
    "data-split-audio-controls",
  );
  await loadScriptOnce(
    'script[data-audio-recovery]',
    "js/audio-recovery.js?v=safari-sound-fix-v1",
    "data-audio-recovery",
  );
  await loadScriptOnce(
    'script[data-layout-size-controls]',
    "js/layout-size-controls.js?v=side-rail-layout-v3",
    "data-layout-size-controls",
  );
  await loadScriptOnce(
    'script[data-ai-emotion-face-ui]',
    "js/ai-emotion-face-ui.js?v=reaction-corner-badges-v85",
    "data-ai-emotion-face-ui",
  );
  await loadScriptOnce(
    'script[data-ai-timing]',
    "js/ai-timing.js?v=personality-experience-v3",
    "data-ai-timing",
  );
  await loadScriptOnce(
    'script[data-ai-turn-indicator]',
    "js/ai-turn-indicator.js?v=single-mood-top-layer-v83",
    "data-ai-turn-indicator",
  );

  Audio.setMuted?.(state.isMuted);
  if (!applyDesktopOnlyMode()) startHand();
}

applyTheme(state.theme, { persist: false });
applyLayout();
loadCardThemeUi();
bootGame();
