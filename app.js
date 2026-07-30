// Main game state and DOM references

const state = {
  deck: [], board: [], pot: 0, currentBet: 0,
  street: "翻牌前", handOver: false, players: [], lastEvent: "新牌局開始",
  isMuted: false,
  theme: readSavedTheme(),
  autoNewHand: false,
  autoNewHandTimer: null,
  winners: [],
  handNumber: 0,
  dealerIndex: 0,
  waitingForHuman: false,
  potDelta: 0,
  actionPulse: null,
  winAmount: 0,
  dialogueTimers: [],
  streetDialogueCount: 0,
  currentActorIndex: 0,
  lastAggressor: null,
  lastRaiseSize: BIG_BLIND,
  blindLevel: blindLevelForHand(1),
  cardMotionUntil: 0,
  selectedProfilePosition: null,
  heroStyle: readSavedHeroStyleStats(),
  heroCurrentHand: createHeroHandTracker(),
  sessionEnded: false,
  coach: {
    enabled: true,
    odds: true,
    advice: true,
    lastBoardKey: "",
    previousWinRate: null,
    lastWinRate: null,
    analysisCache: { key: "", data: null },
  },
  layout: {
    editing: false,
    locked: false,
    items: readSavedLayout(),
    arrows: readSavedDialogueArrows(),
    drag: null,
    panel: readSavedPanelPosition(),
    panelDrag: null,
    selectedKey: "heroCards",
  },
  tutorial: {
    activePage: "start",
  },
};

function createHeroHandTracker() {
  return {
    putMoney: false,
    raised: false,
    allIn: false,
    folded: false,
    checked: false,
    called: false,
  };
}

function createHeroStyleStats() {
  return {
    hands: 0,
    vpip: 0,
    raises: 0,
    calls: 0,
    checks: 0,
    folds: 0,
    allIns: 0,
    showdowns: 0,
    wins: 0,
    maxStack: STARTING_STACK,
    biggestPot: 0,
    bestWin: 0,
  };
}

function readSavedHeroStyleStats() {
  try {
    const raw = localStorage.getItem(HERO_STYLE_STORAGE_KEY);
    if (!raw) return createHeroStyleStats();
    return { ...createHeroStyleStats(), ...JSON.parse(raw) };
  } catch (error) {
    return createHeroStyleStats();
  }
}

function saveHeroStyleStats() {
  try {
    localStorage.setItem(HERO_STYLE_STORAGE_KEY, JSON.stringify(state.heroStyle));
  } catch (error) {
    // Local storage can be unavailable in private browsing; the session stats still work.
  }
}

function recordHeroAction(action, amount = 0) {
  const tracker = state.heroCurrentHand;
  if (!tracker) return;

  if (action === "fold") tracker.folded = true;
  if (action === "check") tracker.checked = true;
  if (action === "call") tracker.called = true;
  if (action === "raise") tracker.raised = true;
  if (action === "allin") tracker.allIn = true;
  if (["call", "raise", "allin"].includes(action) && amount > 0) tracker.putMoney = true;
}

function completeHeroStyleHand({ showdown = false, won = false, potSize = 0, wonAmount = 0 } = {}) {
  const tracker = state.heroCurrentHand;
  if (!tracker || tracker.completed) return;
  tracker.completed = true;

  const stats = state.heroStyle;
  stats.hands += 1;
  if (tracker.putMoney) stats.vpip += 1;
  if (tracker.raised) stats.raises += 1;
  if (tracker.called) stats.calls += 1;
  if (tracker.checked) stats.checks += 1;
  if (tracker.folded) stats.folds += 1;
  if (tracker.allIn) stats.allIns += 1;
  if (showdown) stats.showdowns += 1;
  if (won) stats.wins += 1;
  stats.maxStack = Math.max(stats.maxStack || 0, human()?.stack || 0);
  stats.biggestPot = Math.max(stats.biggestPot || 0, potSize || 0);
  stats.bestWin = Math.max(stats.bestWin || 0, won ? wonAmount || 0 : 0);
  saveHeroStyleStats();
}

function resetHeroStyleStats() {
  state.heroStyle = createHeroStyleStats();
  state.heroCurrentHand = createHeroHandTracker();
  try {
    localStorage.removeItem(HERO_STYLE_STORAGE_KEY);
  } catch (error) {
    // Nothing to clear if storage is blocked.
  }
}

function resetGameSession() {
  clearAutoNewHandTimer();
  clearDialogueTimers();
  state.sessionEnded = false;
  state.handNumber = 0;
  state.dealerIndex = 0;
  state.blindLevel = blindLevelForHand(1);
  state.players = [];
  state.winners = [];
  state.pot = 0;
  state.currentBet = 0;
  state.handOver = false;
  state.waitingForHuman = false;
  resetHeroStyleStats();
}

function heroStyleProfile() {
  const stats = state.heroStyle || createHeroStyleStats();
  if (!stats.hands) {
    return { label: "觀察中", detail: "打一手後更新", tone: "neutral" };
  }

  const hands = Math.max(1, stats.hands);
  const vpip = stats.vpip / hands;
  const raiseRate = stats.raises / hands;
  const callRate = stats.calls / hands;
  const foldRate = stats.folds / hands;
  const allInRate = stats.allIns / hands;

  if (allInRate >= 0.22 && stats.hands >= 3) return { label: "短碼亂流", detail: "All-in 偏多", tone: "danger" };
  if (raiseRate >= 0.42) return { label: "激進型", detail: "主動加注多", tone: "raise" };
  if (callRate >= 0.46 && raiseRate < 0.22) return { label: "跟注型", detail: "愛看下一張", tone: "call" };
  if (foldRate >= 0.48 && vpip < 0.45) return { label: "謹慎型", detail: "收手很快", tone: "fold" };
  if (vpip < 0.34 && raiseRate < 0.24) return { label: "穩健型", detail: "挑牌入池", tone: "steady" };
  return { label: "均衡型", detail: "打法平均", tone: "neutral" };
}

function heroStyleRatios() {
  const stats = state.heroStyle || createHeroStyleStats();
  const hands = Math.max(1, stats.hands || 0);
  return [
    { key: "vpip", label: "入池", value: Math.round((stats.vpip / hands) * 100) },
    { key: "raise", label: "加注", value: Math.round((stats.raises / hands) * 100) },
    { key: "call", label: "跟注", value: Math.round((stats.calls / hands) * 100) },
    { key: "fold", label: "棄牌", value: Math.round((stats.folds / hands) * 100) },
    { key: "allin", label: "All-in", value: Math.round((stats.allIns / hands) * 100) },
    { key: "showdown", label: "攤牌", value: Math.round((stats.showdowns / hands) * 100) },
    { key: "win", label: "勝率", value: Math.round((stats.wins / hands) * 100) },
  ];
}

const els = {
  table: document.querySelector(".table"),
  arena: document.querySelector("#arena"),
  fxLayer: document.querySelector("#fxLayer"),
  showdownBanner: document.querySelector("#showdownBanner"),
  actionToast: document.querySelector("#actionToast"),
  opponents: document.querySelector("#opponents"),
  aiProfilePanel: document.querySelector("#aiProfilePanel"),
  boardZone: document.querySelector(".board-zone"),
  boardCards: document.querySelector("#boardCards"),
  boardStageLabel: document.querySelector("#boardStageLabel"),
  potChips: document.querySelector("#potChips"),
  potChip: document.querySelector(".pot-chip"),
  potDelta: document.querySelector("#potDelta"),
  playerCards: document.querySelector("#playerCards"),
  playerZone: document.querySelector(".player-zone"),
  potValue: document.querySelector("#potValue"),
  tablePotValue: document.querySelector("#tablePotValue"),
  currentBetValue: document.querySelector("#currentBetValue"),
  streetValue: document.querySelector("#streetValue"),
  cornerHandValue: document.querySelector("#cornerHandValue"),
  cornerDealerValue: document.querySelector("#cornerDealerValue"),
  cornerBlindsValue: document.querySelector("#cornerBlindsValue"),
  handNumber: document.querySelector("#handNumber"),
  playerName: document.querySelector("#playerName"),
  playerPanel: document.querySelector(".player-panel"),
  playerStyle: document.querySelector("#playerStyle"),
  heroTableStack: document.querySelector("#heroTableStack"),
  playerStack: document.querySelector("#playerStack"),
  playerStackChips: document.querySelector("#playerStackChips"),
  playerHandRank: document.querySelector("#playerHandRank"),
  playerTurnMarker: document.querySelector("#playerTurnMarker"),
  foldButton: document.querySelector("#foldButton"),
  callButton: document.querySelector("#callButton"),
  raiseButton: document.querySelector("#raiseButton"),
  allInButton: document.querySelector("#allInButton"),
  raiseAmount: document.querySelector("#raiseAmount"),
  raiseAmountValue: document.querySelector("#raiseAmountValue"),
  quickBets: document.querySelector(".quick-bets"),
  newHandButton: document.querySelector("#newHandButton"),
  themeButton: document.querySelector("#themeButton"),
  layoutButton: document.querySelector("#layoutButton"),
  tutorialButton: document.querySelector("#tutorialButton"),
  tutorialOverlay: document.querySelector("#tutorialOverlay"),
  tutorialCloseButton: document.querySelector("#tutorialCloseButton"),
  tutorialNav: document.querySelector("#tutorialNav"),
  tutorialContent: document.querySelector("#tutorialContent"),
  layoutEditorPanel: document.querySelector("#layoutEditorPanel"),
  layoutPanelHandle: document.querySelector("[data-layout-panel-handle]"),
  layoutStatus: document.querySelector("#layoutStatus"),
  saveLayoutButton: document.querySelector("#saveLayoutButton"),
  autoLayoutButton: document.querySelector("#autoLayoutButton"),
  resetLayoutButton: document.querySelector("#resetLayoutButton"),
  lockLayoutButton: document.querySelector("#lockLayoutButton"),
  layoutNudgeButtons: document.querySelectorAll("[data-layout-nudge]"),
  dialogueArrowControls: document.querySelector("#dialogueArrowControls"),
  dialogueArrowButtons: document.querySelectorAll("[data-dialogue-arrow]"),
  gameLog: document.querySelector("#gameLog"),
  muteButton: document.querySelector("#muteButton"),
  autoNewHandButton: document.querySelector("#autoNewHandButton"),
  coachPanel: document.querySelector("#coachPanel"),
  coachEnabled: document.querySelector("#coachEnabled"),
  coachToggleText: document.querySelector(".coach-main-toggle span"),
  coachOddsToggle: document.querySelector("#coachOddsToggle"),
  coachAdviceToggle: document.querySelector("#coachAdviceToggle"),
  coachContent: document.querySelector("#coachContent"),
  coachOddsCard: document.querySelector('[data-coach-card="odds"]'),
  coachAdviceCard: document.querySelector('[data-coach-card="advice"]'),
  coachWinRate: document.querySelector("#coachWinRate"),
  coachWinMeter: document.querySelector("#coachWinMeter"),
  coachOuts: document.querySelector("#coachOuts"),
  coachPotOdds: document.querySelector("#coachPotOdds"),
  coachTrend: document.querySelector("#coachTrend"),
  coachBestAction: document.querySelector("#coachBestAction"),
  coachStars: document.querySelector("#coachStars"),
  coachAdviceText: document.querySelector("#coachAdviceText"),
  sessionSummaryOverlay: document.querySelector("#sessionSummaryOverlay"),
  sessionSummaryClose: document.querySelector("#sessionSummaryClose"),
  sessionSummaryContent: document.querySelector("#sessionSummaryContent"),
};
