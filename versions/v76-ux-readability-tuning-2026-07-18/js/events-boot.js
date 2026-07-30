// Event wiring and boot sequence

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
if (els.layoutPanelHandle) {
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

applyTheme(state.theme, { persist: false });
applyLayout();
if (!applyDesktopOnlyMode()) startHand();
