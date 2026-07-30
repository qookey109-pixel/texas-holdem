// Game configuration
const STARTING_STACK = 3000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_RAISE = 20;
const HANDS_PER_BLIND_LEVEL = 5;
const BLIND_LEVELS = [
  { level: 1, small: 10, big: 20, buyIn: 3000 },
  { level: 2, small: 20, big: 40, buyIn: 4500 },
  { level: 3, small: 50, big: 100, buyIn: 7000 },
  { level: 4, small: 100, big: 200, buyIn: 10000 },
  { level: 5, small: 200, big: 400, buyIn: 15000 },
];
const SHORT_STACK_JAM_BB = 10;
const NORMAL_RAISE_STACK_CAP = 0.32;
const AUTO_NEW_HAND_DELAY = 3000;
const MAX_LOG_ENTRIES = 36;
const DIALOGUE_DISPLAY_MS = 3300;
const DIALOGUE_COOLDOWN_MS = 6500;
const MAX_DIALOGUE_PER_STREET = 3;
const CARD_MOTION_MS = 620;
const THEME_STORAGE_KEY = "texasHoldemTheme";
const LAYOUT_STORAGE_KEY = "texasHoldemTableLayoutV2";
const LAYOUT_PANEL_STORAGE_KEY = "texasHoldemLayoutPanelPositionV1";
const LAYOUT_ARROW_STORAGE_KEY = "texasHoldemDialogueArrowsV1";
const HERO_STYLE_STORAGE_KEY = "texasHoldemHeroStyleStatsV1";
const DEFAULT_LAYOUT = {
  seat1: { left: 4, top: 53 },
  seat2: { left: 7.2, top: 25.5 },
  seat3: { left: 27, top: 7 },
  seat4: { left: 60.5, top: 7 },
  seat5: { left: 79.5, top: 25.5 },
  seat6: { left: 82, top: 53 },
  seatCards1: { left: 14, top: 63 },
  seatCards2: { left: 16, top: 39 },
  seatCards3: { left: 36, top: 20 },
  seatCards4: { left: 64, top: 20 },
  seatCards5: { left: 84, top: 39 },
  seatCards6: { left: 84, top: 63 },
  dialogue1: { left: 22, top: 48 },
  dialogue2: { left: 19, top: 24 },
  dialogue3: { left: 33, top: 18 },
  dialogue4: { left: 66, top: 18 },
  dialogue5: { left: 78, top: 24 },
  dialogue6: { left: 78, top: 48 },
  board: { left: 50, top: 53 },
  pot: { left: 50, top: 35 },
  stage: { left: 50, top: 43 },
  hero: { left: 50, top: 88 },
  heroCards: { left: 43, top: 88 },
  heroPanel: { left: 61, top: 88 },
  heroStack: { left: 50, top: 77 },
  actions: { left: 82, top: 86 },
};
const DEFAULT_DIALOGUE_ARROWS = {
  dialogue1: "left",
  dialogue2: "left",
  dialogue3: "up",
  dialogue4: "up",
  dialogue5: "right",
  dialogue6: "right",
};
const DIALOGUE_ARROW_DIRECTIONS = new Set(["up", "down", "left", "right"]);
const CENTERED_LAYOUT_KEYS = new Set([
  "board",
  "pot",
  "stage",
  "hero",
  "heroCards",
  "heroPanel",
  "heroStack",
  "actions",
  "seatCards1",
  "seatCards2",
  "seatCards3",
  "seatCards4",
  "seatCards5",
  "seatCards6",
  "dialogue1",
  "dialogue2",
  "dialogue3",
  "dialogue4",
  "dialogue5",
  "dialogue6",
]);
const LAYOUT_SNAP_POINTS = [25, 50, 75];
const LAYOUT_SNAP_THRESHOLD = 0.8;
const LAYOUT_NUDGE_STEP = 0.5;
const LAYOUT_NUDGE_FAST_STEP = 2;
const DEFAULT_LAYOUT_PANEL = { left: null, top: 14 };
const STREET_LABELS = {
  "翻牌前": "PREFLOP",
  "翻牌": "FLOP",
  "轉牌": "TURN",
  "河牌": "RIVER",
  "結算": "SHOWDOWN",
};

function blindLevelForHand(handNumber) {
  const index = Math.min(
    BLIND_LEVELS.length - 1,
    Math.max(0, Math.floor((Math.max(1, handNumber) - 1) / HANDS_PER_BLIND_LEVEL))
  );
  return BLIND_LEVELS[index];
}

function currentBlindLevel() {
  return state?.blindLevel || blindLevelForHand(state?.handNumber || 1);
}

function currentSmallBlind() {
  return currentBlindLevel().small;
}

function currentBigBlind() {
  return currentBlindLevel().big;
}

function currentBuyIn() {
  return currentBlindLevel().buyIn;
}
