// Tournament elimination mode: permanent knockouts, tiered rotation, and shrinking tables.
(() => {
  "use strict";

  if (window.TournamentMode?.version) return;
  if (
    typeof state !== "object"
    || typeof startHand !== "function"
    || typeof resetGameSession !== "function"
    || typeof shouldShowSessionSummary !== "function"
    || typeof renderSessionSummary !== "function"
  ) {
    return;
  }

  const MODE_STORAGE_KEY = "texasHoldemGameModeV1";
  const NORMAL_MODE = "normal";
  const TOURNAMENT_MODE = "tournament";
  const TOTAL_AI_COUNT = 16;

  const OPENING_NAMES = ["Leo", "Toto", "Foxy", "Wolf", "Pao", "Shark"];
  const MIDDLE_NAMES = ["Ace", "Momo", "Nori", "Bruno", "Dodo", "Viper"];
  const ELITE_NAMES = ["Nova", "Unit-9", "Merlin"];
  const FINAL_NAME = "Gemini";

  const originalStartHand = startHand;
  const originalResetGameSession = resetGameSession;
  const originalShouldShowSessionSummary = shouldShowSessionSummary;
  const originalRenderSessionSummary = renderSessionSummary;
  const originalCloseSessionSummaryAndRestart = closeSessionSummaryAndRestart;

  let syncScheduled = false;
  let observer = null;

  function readSavedMode() {
    try {
      return localStorage.getItem(MODE_STORAGE_KEY) === TOURNAMENT_MODE
        ? TOURNAMENT_MODE
        : NORMAL_MODE;
    } catch (error) {
      return NORMAL_MODE;
    }
  }

  function saveMode(mode) {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch (error) {
      // The current session can still use the selected mode.
    }
  }

  function isTournamentMode() {
    return state.gameMode === TOURNAMENT_MODE;
  }

  function shuffleNames(names) {
    const result = [...names];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function profileForName(name) {
    return AI_ROSTER.find(profile => profile.name === name)
      || (name === FINAL_NAME ? window.GeminiFinalBoss?.profile : null)
      || null;
  }

  function createTournamentState() {
    return {
      active: true,
      started: false,
      queue: [
        ...shuffleNames(MIDDLE_NAMES),
        ...shuffleNames(ELITE_NAMES),
        FINAL_NAME,
      ],
      appeared: [],
      eliminated: [],
      finished: false,
      result: null,
      lastEliminated: "",
      lastOpponent: "",
      dealerCursor: -1,
    };
  }

  function initializeTournamentState() {
    state.tournament = createTournamentState();
    return state.tournament;
  }

  function tournamentState() {
    if (!state.tournament || !state.tournament.active) {
      return initializeTournamentState();
    }
    return state.tournament;
  }

  function rememberAppeared(name) {
    const tournament = tournamentState();
    if (name && !tournament.appeared.includes(name)) {
      tournament.appeared.push(name);
    }
  }

  function rememberEliminated(name) {
    const tournament = tournamentState();
    if (!name || tournament.eliminated.includes(name)) return false;
    tournament.eliminated.push(name);
    tournament.lastEliminated = name;
    return true;
  }

  function recordBustedAi(players = state.players) {
    for (const player of players || []) {
      if (!player?.isHuman && player.stack <= 0) {
        rememberEliminated(player.name);
      }
    }
  }

  function createFreshSeat(name, replaced = null) {
    const profile = profileForName(name);
    if (!profile) return null;

    rememberAppeared(name);
    return {
      profile,
      stack: currentBuyIn(),
      wins: 0,
      emotion: "fresh",
      streak: 0,
      replaced,
      bossArrival: name === FINAL_NAME,
    };
  }

  function preserveSeat(player) {
    const profile = profileForName(player.name);
    if (!profile) return null;
    rememberAppeared(player.name);
    return {
      profile,
      stack: player.stack,
      wins: player.wins || 0,
      emotion: player.emotion || "calm",
      streak: player.streak || 0,
      replaced: null,
      bossArrival: false,
    };
  }

  function takeNextCandidate() {
    const tournament = tournamentState();

    while (tournament.queue.length) {
      const name = tournament.queue.shift();
      if (!name) continue;
      if (tournament.eliminated.includes(name)) continue;
      if (tournament.appeared.includes(name)) continue;
      return name;
    }

    return "";
  }

  function buildTournamentAiSeats(previousPlayers) {
    const tournament = tournamentState();

    if (!previousPlayers.length) {
      const openingSeats = OPENING_NAMES
        .map(name => createFreshSeat(name))
        .filter(Boolean);

      tournament.started = true;
      return openingSeats;
    }

    const previousAi = previousPlayers.filter(player => !player.isHuman);
    const nextSeats = [];

    for (const previous of previousAi) {
      if (previous.stack > 0) {
        const retained = preserveSeat(previous);
        if (retained) nextSeats.push(retained);
        continue;
      }

      rememberEliminated(previous.name);
      const replacementName = takeNextCandidate();
      const replacement = replacementName
        ? createFreshSeat(replacementName, previous)
        : null;

      if (replacement) nextSeats.push(replacement);
    }

    return nextSeats;
  }

  function currentAliveAi() {
    return (state.players || []).filter(player => !player.isHuman && player.stack > 0);
  }

  function inferLastOpponent() {
    const winnerName = Array.isArray(state.winners)
      ? state.winners.find(name => name && name !== "Owl")
      : "";

    if (winnerName) return winnerName;

    const alive = currentAliveAi()
      .slice()
      .sort((a, b) => b.stack - a.stack);

    return alive[0]?.name
      || tournamentState().lastEliminated
      || "";
  }

  function evaluateTournamentEnd() {
    if (!isTournamentMode()) return false;

    const tournament = tournamentState();
    if (tournament.finished) return true;

    recordBustedAi();

    const hero = typeof human === "function" ? human() : state.players?.[0];
    if (hero && hero.stack <= 0) {
      tournament.finished = true;
      tournament.result = "loss";
      tournament.lastOpponent = inferLastOpponent();
      return true;
    }

    if (tournament.queue.length === 0 && currentAliveAi().length === 0) {
      tournament.finished = true;
      tournament.result = "win";
      tournament.lastOpponent = tournament.lastEliminated || FINAL_NAME;
      return true;
    }

    return false;
  }

  function nextDealerIndex(playerCount) {
    const tournament = tournamentState();
    if (playerCount <= 0) return 0;
    tournament.dealerCursor = (tournament.dealerCursor + 1 + playerCount) % playerCount;
    return tournament.dealerCursor;
  }

  function startTournamentHand() {
    const tournament = tournamentState();

    if (tournament.finished) {
      state.handOver = true;
      maybeShowSessionSummary();
      return false;
    }

    const previousPlayers = state.players || [];
    recordBustedAi(previousPlayers);

    if (previousPlayers[0]?.stack <= 0) {
      state.handOver = true;
      evaluateTournamentEnd();
      maybeShowSessionSummary();
      return false;
    }

    const nextAiSeats = buildTournamentAiSeats(previousPlayers);

    if (previousPlayers.length && nextAiSeats.length === 0 && tournament.queue.length === 0) {
      state.handOver = true;
      evaluateTournamentEnd();
      maybeShowSessionSummary();
      return false;
    }

    Audio.cleanup();
    clearAutoNewHandTimer();
    clearDialogueTimers();

    state.handNumber += 1;
    const previousBlindLevel = state.blindLevel;
    state.blindLevel = blindLevelForHand(state.handNumber);

    const seatCount = Math.max(2, nextAiSeats.length + 1);
    state.dealerIndex = nextDealerIndex(seatCount);

    const buyIn = currentBuyIn();
    const smallBlind = currentSmallBlind();
    const bigBlind = currentBigBlind();
    const humanStack = previousPlayers[0]?.stack > 0
      ? previousPlayers[0].stack
      : buyIn;

    state.deck = shuffle(createDeck());
    state.board = [];
    state.pot = 0;
    state.currentBet = 0;
    state.street = "翻牌前";
    state.handOver = false;
    state.winners = [];
    state.waitingForHuman = false;
    state.potDelta = 0;
    state.actionPulse = null;
    state.winAmount = 0;
    state.streetDialogueCount = 0;
    state.currentActorIndex = 0;
    state.lastAggressor = null;
    state.lastRaiseSize = bigBlind;
    state.heroCurrentHand = createHeroHandTracker();
    markCardsForMotion();
    state.coach.lastBoardKey = "";
    state.coach.previousWinRate = null;
    state.coach.lastWinRate = null;
    state.coach.analysisCache = { key: "", data: null };

    if (els.showdownBanner) {
      els.showdownBanner.classList.remove("is-visible");
    }

    state.players = [
      {
        name: "Owl",
        isHuman: true,
        emoji: "🦉",
        cards: [state.deck.pop(), state.deck.pop()],
        stack: humanStack,
        bet: 0,
        totalContribution: 0,
        folded: false,
        allIn: false,
        hasActed: false,
        raiseLocked: false,
        status: "等待行動",
        position: 0,
        wins: previousPlayers[0]?.wins || 0,
        dialogue: "",
        dialogueTone: "",
        lastDialogueAt: 0,
      },
      ...nextAiSeats.map(({
        profile,
        stack,
        wins,
        replaced,
        emotion,
        streak,
        bossArrival,
      }, index) => ({
        ...profile,
        isHuman: false,
        cards: [state.deck.pop(), state.deck.pop()],
        stack,
        bet: 0,
        totalContribution: 0,
        folded: false,
        allIn: false,
        hasActed: false,
        raiseLocked: false,
        status: replaced ? "新加入" : "準備行動",
        position: index + 1,
        wins,
        emotion,
        streak,
        dialogue: "",
        dialogueTone: "",
        lastDialogueAt: 0,
        bossArrival,
      })),
    ];

    if (
      state.selectedProfilePosition
      && !state.players.some(player => player.position === state.selectedProfilePosition)
    ) {
      state.selectedProfilePosition = null;
    }

    state.players.forEach((_, index) => {
      setTimeout(() => {
        if (!state.isMuted) Audio.deal();
      }, index * 120);
    });

    const headsUp = state.players.length === 2;
    const smallBlindIndex = headsUp
      ? state.dealerIndex
      : (state.dealerIndex + 1) % state.players.length;
    const bigBlindIndex = headsUp
      ? (state.dealerIndex + 1) % state.players.length
      : (state.dealerIndex + 2) % state.players.length;
    const firstActorIndex = headsUp
      ? state.dealerIndex
      : (state.dealerIndex + 3) % state.players.length;

    const smallBlindPlayer = state.players[smallBlindIndex];
    const bigBlindPlayer = state.players[bigBlindIndex];

    postBlind(smallBlindPlayer, smallBlind, "小盲");
    postBlind(bigBlindPlayer, bigBlind, "大盲");
    state.currentBet = Math.max(smallBlindPlayer.bet, bigBlindPlayer.bet);
    state.lastRaiseSize = bigBlind;
    state.lastAggressor = bigBlindPlayer.position;

    if (previousBlindLevel && previousBlindLevel.level !== state.blindLevel.level) {
      log(`盲注升級：第 ${state.blindLevel.level} 級，盲注 ${smallBlind} / ${bigBlind}。`);
      announce(`盲注升級 ${smallBlind} / ${bigBlind}`);
    }

    const replacements = nextAiSeats
      .map((seat, index) => ({
        ...seat,
        player: state.players[index + 1],
      }))
      .filter(seat => seat.replaced);

    replacements.forEach(({ replaced, player, bossArrival }) => {
      log(`${replaced.emoji} ${replaced.name} 籌碼歸零，永久淘汰。${player.emoji} ${player.name} 加入淘汰賽。`);
      if (bossArrival || player.name === FINAL_NAME) {
        log("👑 最終候補 Gemini 已進入牌桌。");
        announce("FINAL BOSS：GEMINI");
      }
    });

    if (!previousPlayers.length) {
      log("🏆 淘汰賽開始：16 位 AI，淘汰後不再回歸。");
      announce("淘汰賽開始");
    } else if (replacements[0]) {
      say(replacements[0].player, "join", { force: true });
    }

    log(`🃏 新牌局開始，盲注 ${smallBlind} / ${bigBlind}。`);
    if (!previousBlindLevel || previousBlindLevel.level === state.blindLevel.level) {
      announce("新牌局開始");
    }

    updateTournamentUi();
    beginBettingRound(firstActorIndex);
    continueBetting();
    return true;
  }

  startHand = function startHandWithGameMode(...args) {
    if (!isTournamentMode()) {
      return originalStartHand.apply(this, args);
    }
    return startTournamentHand();
  };

  resetGameSession = function resetGameSessionWithMode(...args) {
    const result = originalResetGameSession.apply(this, args);
    if (isTournamentMode()) initializeTournamentState();
    else state.tournament = null;
    scheduleSync();
    return result;
  };

  shouldShowSessionSummary = function shouldShowSessionSummaryWithTournament() {
    if (!isTournamentMode()) return originalShouldShowSessionSummary();
    return Boolean(evaluateTournamentEnd() && !state.sessionEnded);
  };

  renderSessionSummary = function renderSessionSummaryWithTournament() {
    originalRenderSessionSummary();

    if (!isTournamentMode() || !els.sessionSummaryContent) return;

    const tournament = tournamentState();
    const won = tournament.result === "win";
    const defeated = tournament.eliminated.length;
    const remaining = Math.max(
      0,
      tournament.queue.length + currentAliveAi().length,
    );
    const title = won ? "淘汰賽冠軍" : "淘汰賽結束";
    const description = won
      ? "你淘汰了全部 16 位 AI，成為最後存活者。"
      : `你擊敗 ${defeated} / ${TOTAL_AI_COUNT} 位 AI，本次挑戰到此結束。`;
    const lastOpponent = tournament.lastOpponent
      || tournament.lastEliminated
      || "—";

    const heading = els.sessionSummaryContent.querySelector(".session-hero h2");
    const descriptionNode = els.sessionSummaryContent.querySelector(".session-hero > div > span");
    const grid = els.sessionSummaryContent.querySelector(".session-grid");
    const restartButton = els.sessionSummaryContent.querySelector("[data-session-restart]");

    if (heading) heading.textContent = title;
    if (descriptionNode) descriptionNode.textContent = description;
    if (restartButton) restartButton.textContent = "重新開始淘汰賽";

    grid?.insertAdjacentHTML("afterbegin", `
      <div class="session-card tournament-summary-card">
        <h3>${won ? "🏆 完整通關" : "🏁 挑戰紀錄"}</h3>
        <div class="session-key-stats">
          ${renderKeyStat("永久淘汰", defeated, " / 16")}
          ${renderKeyStat("尚未擊敗", remaining, " 位")}
          ${renderKeyStat(won ? "最後對手" : "淘汰你的人", escapeTournamentHtml(lastOpponent), "")}
        </div>
        <p>${won
          ? "所有候補角色都已登場，沒有任何角色回歸。"
          : "本場已淘汰角色不會回歸；重新開始後會重新洗牌中階與高階候補順序。"
        }</p>
      </div>
    `);

    els.sessionSummaryOverlay?.classList.add("is-tournament-summary");
  };

  closeSessionSummaryAndRestart = function closeSessionSummaryAndRestartWithMode() {
    if (!isTournamentMode()) {
      return originalCloseSessionSummaryAndRestart();
    }

    if (els.sessionSummaryOverlay) {
      els.sessionSummaryOverlay.hidden = true;
      els.sessionSummaryOverlay.classList.remove("is-tournament-summary");
    }

    resetGameSession();
    startHand();
    return true;
  };

  function escapeTournamentHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setMode(mode, { restart = true, persist = true } = {}) {
    const nextMode = mode === TOURNAMENT_MODE
      ? TOURNAMENT_MODE
      : NORMAL_MODE;

    state.gameMode = nextMode;
    if (persist) saveMode(nextMode);

    if (nextMode === TOURNAMENT_MODE) {
      window.GeminiFinalBoss?.disable?.({
        restart: false,
        persist: true,
      });
    }

    if (restart) {
      if (els.sessionSummaryOverlay) {
        els.sessionSummaryOverlay.hidden = true;
        els.sessionSummaryOverlay.classList.remove("is-tournament-summary");
      }
      resetGameSession();
      startHand();
      announce(nextMode === TOURNAMENT_MODE ? "淘汰賽模式" : "一般模式");
    } else if (nextMode === TOURNAMENT_MODE) {
      initializeTournamentState();
    } else {
      state.tournament = null;
    }

    scheduleSync();
    return nextMode;
  }

  function toggleMode() {
    return setMode(isTournamentMode() ? NORMAL_MODE : TOURNAMENT_MODE);
  }

  function mountModeButton() {
    const settingsPanel = document.querySelector("#settingsMenuPanel");
    const fallback = document.querySelector(".top-bar-actions");
    const target = settingsPanel || fallback;
    if (!target) return false;

    let button = document.querySelector("#tournamentModeButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "tournamentModeButton";
      button.type = "button";
      button.className = settingsPanel
        ? "ghost-button topbar-settings-item"
        : "ghost-button tool-button";
      button.addEventListener("click", toggleMode);
    }

    if (button.parentElement !== target) target.appendChild(button);

    if (settingsPanel) {
      button.className = "ghost-button topbar-settings-item";
    }

    button.setAttribute("aria-pressed", String(isTournamentMode()));
    const label = isTournamentMode()
      ? "🏆 淘汰賽進行中"
      : "🏆 淘汰賽模式";
    if (button.textContent !== label) button.textContent = label;
    return true;
  }

  function mountProgressBadge() {
    const stats = document.querySelector(".table-corner-stats");
    if (!stats) return false;

    let badge = document.querySelector("#tournamentProgressBadge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "tournamentProgressBadge";
      badge.innerHTML = "<em>淘汰賽</em><strong>0 / 16</strong>";
      stats.appendChild(badge);
    }

    return true;
  }

  function syncGeminiChallengeLock() {
    const button = document.querySelector("#geminiBossButton");
    if (!button) return;

    button.disabled = isTournamentMode();
    button.title = isTournamentMode()
      ? "淘汰賽中 Gemini 會依候補順序最後登場"
      : "";

    if (isTournamentMode()) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
  }

  function updateTournamentUi() {
    mountModeButton();
    mountProgressBadge();
    syncGeminiChallengeLock();

    const badge = document.querySelector("#tournamentProgressBadge");
    const tournament = state.tournament;
    const defeated = tournament?.eliminated?.length || 0;

    if (badge) {
      badge.hidden = !isTournamentMode();
      const value = badge.querySelector("strong");
      const progressText = `${defeated} / ${TOTAL_AI_COUNT}`;
      if (value && value.textContent !== progressText) value.textContent = progressText;
      badge.title = isTournamentMode()
        ? `已永久淘汰 ${defeated} 位；剩餘 ${Math.max(0, TOTAL_AI_COUNT - defeated)} 位`
        : "";
    }

    document.body.classList.toggle("is-tournament-mode", isTournamentMode());
  }

  function installStyles() {
    if (document.querySelector("#tournamentModeStyles")) return;

    const style = document.createElement("style");
    style.id = "tournamentModeStyles";
    style.textContent = `
      #tournamentModeButton[aria-pressed="true"] {
        border-color: rgba(240,194,94,.62);
        background:
          linear-gradient(90deg, rgba(135,80,28,.34), rgba(106,44,37,.28)),
          rgba(8,15,25,.72);
        color: #ffe5a3;
        box-shadow: 0 0 18px rgba(240,194,94,.18);
      }
      #tournamentProgressBadge {
        border-color: rgba(240,194,94,.34);
        background: rgba(85,48,17,.34);
      }
      #tournamentProgressBadge strong {
        color: #ffe2a0;
      }
      #tournamentProgressBadge[hidden] {
        display: none;
      }
      #geminiBossButton:disabled {
        cursor: not-allowed;
        opacity: .58;
      }
      .tournament-summary-card {
        grid-column: 1 / -1;
        border-color: rgba(240,194,94,.34);
        background:
          radial-gradient(circle at 15% 0%, rgba(240,194,94,.14), transparent 42%),
          rgba(255,255,255,.04);
      }
      .tournament-summary-card > p {
        margin: 12px 0 0;
        color: var(--muted);
        font-size: .72rem;
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      updateTournamentUi();
    });
  }

  document.addEventListener("click", event => {
    if (!isTournamentMode()) return;
    const geminiButton = event.target.closest("#geminiBossButton");
    if (!geminiButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    announce("淘汰賽中 Gemini 會最後登場");
  }, true);

  state.gameMode = readSavedMode();
  if (isTournamentMode()) {
    window.GeminiFinalBoss?.disable?.({
      restart: false,
      persist: true,
    });
    initializeTournamentState();
  } else {
    state.tournament = null;
  }

  installStyles();
  updateTournamentUi();

  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  if (isTournamentMode() && state.players.length) {
    resetGameSession();
    startHand();
  }

  window.TournamentMode = {
    version: "1.0.0",
    modes: {
      normal: NORMAL_MODE,
      tournament: TOURNAMENT_MODE,
    },
    setMode,
    toggle: toggleMode,
    isActive: isTournamentMode,
    refresh: updateTournamentUi,
    snapshot() {
      const tournament = state.tournament;
      return {
        mode: state.gameMode,
        queue: [...(tournament?.queue || [])],
        appeared: [...(tournament?.appeared || [])],
        eliminated: [...(tournament?.eliminated || [])],
        finished: Boolean(tournament?.finished),
        result: tournament?.result || null,
        alive: currentAliveAi().map(player => player.name),
      };
    },
  };
})();
