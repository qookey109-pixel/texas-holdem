// Unlockable playing-card collection with an original storybook starter deck.
(() => {
  "use strict";

  const root = document.documentElement;
  const EQUIPPED_KEY = "texasHoldemEquippedDeckV2";
  const UNLOCKED_KEY = "texasHoldemUnlockedDecksV2";
  const SEEN_KEY = "texasHoldemSeenDeckUnlocksV2";
  const LEGACY_THEME_KEY = "texasHoldemCardThemeV1";
  const LEGACY_BACK_KEY = "texasHoldemCardBackV1";
  const STARTER_DECKS = ["classic", "midnight"];
  const COLLECTION_DECKS = ["classic", "midnight"];

  const decks = [
    {
      id: "classic",
      name: "童趣手繪牌組",
      rarity: "初始",
      theme: "storybook",
      back: "storybook",
      symbol: "♥",
      description: "原創童話手繪風：柔和紙張、彩色外框與可愛宮廷人物。",
      condition: "初始擁有",
      starter: true,
    },
    {
      id: "midnight",
      name: "午夜牌組",
      rarity: "初始",
      theme: "dark",
      back: "violet",
      symbol: "☾",
      description: "適合深色牌桌的高對比夜間牌。",
      condition: "初始擁有",
      starter: true,
    },
    {
      id: "sepia",
      name: "老派賭場",
      rarity: "成就",
      theme: "sepia",
      back: "sunset",
      symbol: "✦",
      description: "帶有老紙張質感的復古棕色牌組。",
      condition: "完成 5 局牌局",
      unlock: stats => stats.hands >= 5,
    },
    {
      id: "four-color",
      name: "四色戰術",
      rarity: "成就",
      theme: "light-4color",
      back: "emerald",
      symbol: "♣",
      description: "四種花色各自配色，快速辨識牌力。",
      condition: "累積贏得 3 局",
      unlock: stats => stats.wins >= 3,
    },
    {
      id: "boss-crown",
      name: "王冠霸主",
      rarity: "Boss",
      theme: "boss-crown",
      back: "black-gold",
      symbol: "♛",
      description: "擊敗牌桌 Boss 後取得的黑金牌組。",
      condition: "打倒第一位 Boss",
      unlock: stats => stats.bossWins >= 1,
    },
    {
      id: "hidden-monochrome",
      name: "???",
      revealedName: "逆轉黑桃",
      rarity: "隱藏",
      theme: "light-1color",
      back: "ruby",
      symbol: "?",
      revealedSymbol: "♠",
      description: "達成特殊逆轉條件後才會現身。",
      revealedDescription: "從高壓底池逆轉而生的隱藏單色牌組。",
      condition: "隱藏條件",
      hidden: true,
      unlock: stats => stats.allIns >= 1 && stats.wins >= 1 && stats.biggestPot >= 1000,
    },
  ];

  const deckMap = new Map(decks.map(deck => [deck.id, deck]));
  const collectionDeckIds = new Set(COLLECTION_DECKS);

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // The session still works if storage is blocked.
    }
  }

  function readText(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeText(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      // The session still works if storage is blocked.
    }
  }

  function normalizeUnlocked(value) {
    const result = new Set(STARTER_DECKS);
    if (Array.isArray(value)) {
      value.forEach(id => {
        if (collectionDeckIds.has(id) && deckMap.has(id)) result.add(id);
      });
    }
    return result;
  }

  let unlocked = normalizeUnlocked(readJson(UNLOCKED_KEY, STARTER_DECKS));
  let seenUnlocks = new Set(readJson(SEEN_KEY, STARTER_DECKS));
  let equippedId = readText(EQUIPPED_KEY, "classic");
  if (!deckMap.has(equippedId) || !unlocked.has(equippedId)) equippedId = "classic";

  function gameStats() {
    let hero = {};
    try {
      if (typeof state !== "undefined" && state?.heroStyle) hero = state.heroStyle;
    } catch (_) {
      hero = {};
    }

    let bossWins = 0;
    try {
      bossWins = Number(localStorage.getItem("texasHoldemBossWinsV1")) || 0;
    } catch (_) {
      bossWins = 0;
    }

    return {
      hands: Number(hero.hands) || 0,
      wins: Number(hero.wins) || 0,
      allIns: Number(hero.allIns) || 0,
      biggestPot: Number(hero.biggestPot) || 0,
      bossWins,
    };
  }

  function toast(message) {
    try {
      if (typeof announce === "function") {
        announce(message);
        return;
      }
    } catch (_) {
      // Fall through to the toast element.
    }

    const node = document.querySelector("#actionToast");
    if (!node) return;
    node.textContent = message;
    node.classList.remove("is-visible");
    void node.offsetWidth;
    node.classList.add("is-visible");
  }

  function displayName(deck) {
    return deck.hidden && deck.revealedName ? deck.revealedName : deck.name;
  }

  function displayDescription(deck) {
    return deck.hidden && deck.revealedDescription ? deck.revealedDescription : deck.description;
  }

  function displaySymbol(deck) {
    return deck.hidden && deck.revealedSymbol ? deck.revealedSymbol : deck.symbol;
  }

  function applyDeck(id, { notify = false } = {}) {
    const deck = deckMap.get(id);
    if (!deck || !collectionDeckIds.has(id) || !unlocked.has(id)) return false;

    equippedId = id;
    root.dataset.cardTheme = deck.theme;
    root.dataset.cardBack = deck.back;
    root.dataset.cardDeck = deck.id;
    writeText(EQUIPPED_KEY, id);

    try {
      localStorage.removeItem(LEGACY_THEME_KEY);
      localStorage.removeItem(LEGACY_BACK_KEY);
    } catch (_) {
      // Nothing else is required if legacy preferences cannot be cleared.
    }

    refreshCollection();
    if (notify) toast(`已裝備：${displayName(deck)}`);
    return true;
  }

  function evaluateUnlocks({ announceUnlocks = true } = {}) {
    refreshCollection();
    return [];
  }

  function previewMarkup(deck) {
    const suits = ["A♠", "K♥", "Q♦", "J♣"];
    return `
      <div class="deck-card-preview" data-preview-theme="${deck.theme}" aria-hidden="true">
        ${suits.map(label => `<i>${label}</i>`).join("")}
      </div>`;
  }

  function deckCard(deck) {
    const equipped = equippedId === deck.id;
    return `
      <article class="deck-collection-item ${equipped ? "is-equipped" : ""}" data-deck-card="${deck.id}">
        <div class="deck-showcase">
          ${previewMarkup(deck)}
          <span class="deck-back-mini" data-back="${deck.back}" data-symbol="${displaySymbol(deck)}"></span>
        </div>
        <div class="deck-item-copy">
          <div class="deck-item-title">
            <div><small>${deck.rarity}</small><h3>${displayName(deck)}</h3></div>
            ${equipped ? "<span>使用中</span>" : ""}
          </div>
          <p>${displayDescription(deck)}</p>
          <button type="button" class="deck-equip-button" data-equip-deck="${deck.id}" ${equipped ? "disabled" : ""}>
            ${equipped ? "目前使用" : "裝備牌組"}
          </button>
        </div>
      </article>`;
  }

  function refreshCollection() {
    const ownedDecks = COLLECTION_DECKS
      .map(id => deckMap.get(id))
      .filter(deck => deck && unlocked.has(deck.id));
    const grid = document.querySelector("#deckCollectionGrid");
    if (grid) grid.innerHTML = ownedDecks.map(deckCard).join("");

    const count = document.querySelector("#deckOwnedCount");
    if (count) count.textContent = `${ownedDecks.length} 套`;

    const trigger = document.querySelector("#cardStyleButton");
    if (trigger) trigger.textContent = "🎴 收藏";
  }

  function closePanel() {
    const panel = document.querySelector("#cardStylePanel");
    const trigger = document.querySelector("#cardStyleButton");
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openPanel() {
    evaluateUnlocks({ announceUnlocks: true });
    const panel = document.querySelector("#cardStylePanel");
    const trigger = document.querySelector("#cardStyleButton");
    if (!panel || !trigger) return;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    panel.querySelector(".card-style-close")?.focus();
  }

  function build() {
    const actions = document.querySelector(".top-bar-actions");
    const arena = document.querySelector("#arena");
    if (!actions || !arena || document.querySelector("#cardStyleButton")) return;

    const trigger = document.createElement("button");
    trigger.id = "cardStyleButton";
    trigger.className = "ghost-button tool-button";
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "cardStylePanel");
    trigger.textContent = "🎴 收藏";
    actions.insertBefore(trigger, document.querySelector("#layoutButton"));

    const panel = document.createElement("section");
    panel.id = "cardStylePanel";
    panel.className = "card-style-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "牌組收藏");
    panel.innerHTML = `
      <header class="card-style-head">
        <div>
          <p>Deck Collection</p>
        <h2>牌組收藏</h2>
        <span>目前先開放兩套牌組，之後再慢慢加入新風格。</span>
        </div>
        <button class="card-style-close" type="button" aria-label="關閉牌組收藏">×</button>
      </header>
      <div class="deck-collection-summary">
        <span>已收集</span>
        <strong id="deckOwnedCount">${COLLECTION_DECKS.length} 套</strong>
        <small>先保留精簡選單</small>
      </div>
      <div id="deckCollectionGrid" class="deck-collection-grid"></div>
      <footer class="card-style-footer">先保留兩套常用牌組，避免收藏面板太滿。</footer>`;
    arena.appendChild(panel);

    trigger.addEventListener("click", () => {
      if (panel.hidden) openPanel();
      else closePanel();
    });

    panel.querySelector(".card-style-close")?.addEventListener("click", closePanel);
    panel.addEventListener("click", event => {
      const button = event.target.closest("[data-equip-deck]");
      if (button) applyDeck(button.dataset.equipDeck, { notify: true });
    });

    document.addEventListener("click", event => {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) closePanel();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !panel.hidden) closePanel();
    });
  }

  function injectStyles() {
    if (document.querySelector("#cardCollectionStylesV3")) return;

    document.querySelector("#pixelCardThemeStyles")?.remove();
    document.querySelector("#ownedDecksOnlyStyles")?.remove();

    const style = document.createElement("style");
    style.id = "cardCollectionStylesV3";
    style.textContent = `
      #cardStyleButton { min-width: 92px; }
      #cardStyleButton[aria-expanded="true"] {
        border-color: rgba(112,216,201,.55);
        background: rgba(112,216,201,.13);
        color: var(--cyan);
      }

      .card-style-panel {
        position: absolute;
        z-index: 24;
        top: 12px;
        right: 12px;
        width: min(560px, calc(100% - 24px));
        max-height: calc(100% - 24px);
        overflow: auto;
        padding: 14px;
        border: 1px solid rgba(112,216,201,.32);
        border-radius: 14px;
        background: radial-gradient(circle at 14% 0, rgba(112,216,201,.16), transparent 38%), rgba(5,13,17,.97);
        color: var(--ink);
        box-shadow: 0 24px 60px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.13);
        backdrop-filter: blur(18px) saturate(132%);
      }
      .card-style-panel[hidden] { display: none; }
      :root[data-theme="light"] .card-style-panel {
        background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(246,237,219,.97));
        border-color: rgba(81,63,40,.2);
      }

      .card-style-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
      .card-style-head p, .card-style-head h2, .card-style-head span { margin: 0; }
      .card-style-head p { color: var(--gold); font-size: .64rem; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
      .card-style-head h2 { margin-top: 2px; font-size: 1.08rem; }
      .card-style-head span { display: block; margin-top: 4px; color: var(--muted); font-size: .7rem; line-height: 1.4; }
      .card-style-close { width: 30px; min-width: 30px; min-height: 30px; padding: 0; border-radius: 999px; background: rgba(255,255,255,.08); color: var(--ink); box-shadow: none; }

      .deck-collection-summary {
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 7px;
        margin-bottom: 9px;
        padding: 8px 10px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 9px;
        background: rgba(255,255,255,.045);
      }
      .deck-collection-summary span, .deck-collection-summary small { color: var(--muted); font-size: .67rem; }
      .deck-collection-summary strong { color: var(--cyan); font-size: .84rem; }
      .deck-collection-summary small { text-align: right; }

      .deck-collection-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
      .deck-collection-item {
        display: grid;
        grid-template-columns: 104px minmax(0,1fr);
        gap: 9px;
        min-width: 0;
        padding: 9px;
        border: 1px solid rgba(255,255,255,.11);
        border-radius: 11px;
        background: linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.025));
      }
      .deck-collection-item.is-equipped {
        border-color: rgba(112,216,201,.66);
        box-shadow: inset 0 0 0 1px rgba(112,216,201,.16), 0 0 20px rgba(112,216,201,.09);
      }
      :root[data-theme="light"] .deck-collection-item {
        border-color: rgba(69,49,27,.16);
        background: rgba(255,255,255,.64);
      }

      .deck-showcase { position: relative; display: grid; grid-template-columns: 1fr 31px; align-items: center; gap: 5px; min-width: 0; }
      .deck-card-preview {
        --s: #24324a;
        --h: #df5455;
        --d: #d76555;
        --c: #315e45;
        --bg: #fffdf5;
        --edge: #d55d57;
        display: grid;
        grid-template-columns: repeat(4,1fr);
        gap: 2px;
      }
      .deck-card-preview i {
        display: grid;
        place-items: center;
        aspect-ratio: 5/7;
        border: 1.5px solid var(--edge);
        border-radius: 4px 5px 3px 6px;
        background: var(--bg);
        font-style: normal;
        font: 900 .47rem "Comic Sans MS", "Bradley Hand", cursive;
        transform: rotate(var(--tilt, 0deg));
      }
      .deck-card-preview i:nth-child(1) { color: var(--s); --tilt: -1deg; }
      .deck-card-preview i:nth-child(2) { color: var(--h); --tilt: 1deg; }
      .deck-card-preview i:nth-child(3) { color: var(--d); --tilt: -.7deg; }
      .deck-card-preview i:nth-child(4) { color: var(--c); --tilt: .8deg; }
      .deck-card-preview[data-preview-theme="dark"] { --bg: #151a23; --edge: #6d7890; --s: #d6deeb; --h: #ff6973; --d: #ff934d; --c: #86c974; }
      .deck-card-preview[data-preview-theme="sepia"] { --bg: #f1d4a1; --edge: #8a522c; --s: #61351f; --h: #773a25; --d: #8c4b28; --c: #623923; }
      .deck-card-preview[data-preview-theme="light-4color"] { --edge: #3c7659; --d: #e55c25; --c: #1f7f55; }
      .deck-card-preview[data-preview-theme="light-1color"] { --edge: #25304f; --s: #25304f; --h: #25304f; --d: #25304f; --c: #25304f; }
      .deck-card-preview[data-preview-theme="boss-crown"] { --bg: #17191f; --edge: #d5ad4e; --s: #f3cf69; --h: #f08b69; --d: #e4b24b; --c: #85c987; }

      .deck-back-mini {
        --main: #375d86;
        --edge: #f5ead0;
        position: relative;
        display: block;
        width: 31px;
        aspect-ratio: 5/7;
        border: 2px solid var(--edge);
        border-radius: 4px;
        background: repeating-linear-gradient(45deg, rgba(255,255,255,.16) 0 3px, transparent 3px 8px), var(--main);
        box-shadow: inset 0 0 0 2px rgba(0,0,0,.2);
      }
      .deck-back-mini::after {
        content: attr(data-symbol);
        position: absolute;
        left: 50%;
        top: 50%;
        display: grid;
        place-items: center;
        width: 60%;
        aspect-ratio: 1;
        border: 1px solid rgba(255,255,255,.65);
        border-radius: 50%;
        background: rgba(0,0,0,.1);
        color: #fff;
        font-size: .68rem;
        transform: translate(-50%,-50%);
      }
      .deck-back-mini[data-back="storybook"] { --main: #c94f56; --edge: #7ea54b; }
      .deck-back-mini[data-back="violet"] { --main: #663c85; --edge: #e0caef; }
      .deck-back-mini[data-back="sunset"] { --main: #d66b2d; --edge: #ffe0a8; }
      .deck-back-mini[data-back="emerald"] { --main: #207447; --edge: #bfe7c9; }
      .deck-back-mini[data-back="black-gold"] { --main: #17191f; --edge: #d5ad4e; }
      .deck-back-mini[data-back="ruby"] { --main: #a72435; --edge: #f5c5bf; }

      .deck-item-copy { min-width: 0; }
      .deck-item-title { display: flex; justify-content: space-between; align-items: start; gap: 6px; }
      .deck-item-title small { display: block; color: var(--gold); font-size: .55rem; font-weight: 950; letter-spacing: .06em; }
      .deck-item-title h3 { margin: 2px 0 0; font-size: .82rem; line-height: 1.1; }
      .deck-item-title > span { padding: 2px 6px; border-radius: 999px; background: rgba(112,216,201,.13); color: var(--cyan); font-size: .55rem; font-weight: 900; }
      .deck-item-copy p { min-height: 2.5em; margin: 5px 0; color: var(--muted); font-size: .61rem; line-height: 1.35; }
      .deck-equip-button { width: 100%; min-height: 28px; margin-top: 7px; padding: 0 8px; border-radius: 6px; font-size: .63rem; }
      .deck-equip-button:disabled { background: rgba(112,216,201,.09); color: var(--cyan); opacity: 1; }
      .card-style-footer { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.09); color: var(--muted); font-size: .62rem; text-align: center; }

      html[data-card-theme="storybook"] .card:not(.back) {
        border-width: 2px;
        border-style: solid;
        border-radius: 8px 9px 7px 10px;
        background:
          radial-gradient(circle at 18% 12%, rgba(255,255,255,.7), transparent 22%),
          repeating-linear-gradient(0deg, rgba(126,91,49,.025) 0 1px, transparent 1px 5px),
          linear-gradient(180deg, #fffef9, #f8f1df);
        box-shadow:
          0 8px 13px rgba(0,0,0,.24),
          inset 0 0 0 2px rgba(255,255,255,.78),
          inset 0 -3px 0 rgba(112,78,43,.06);
        color: #263548;
        image-rendering: auto;
      }
      html[data-card-theme="storybook"] .card.suit-h,
      html[data-card-theme="storybook"] .card.suit-s { border-color: #df625c; }
      html[data-card-theme="storybook"] .card.suit-d,
      html[data-card-theme="storybook"] .card.suit-c { border-color: #7da34d; }
      html[data-card-theme="storybook"] .card.suit-s { color: #2c3540; }
      html[data-card-theme="storybook"] .card.suit-h { color: #dc4d4d; }
      html[data-card-theme="storybook"] .card.suit-d { color: #d65a4f; }
      html[data-card-theme="storybook"] .card.suit-c { color: #2e5d42; }
      html[data-card-theme="storybook"] .card::before {
        inset: 4px;
        border: 1px dashed currentColor;
        border-radius: 5px 6px 4px 7px;
        opacity: .18;
      }
      html[data-card-theme="storybook"] .card::after {
        inset: 8px;
        background: radial-gradient(circle at 50% 44%, rgba(255,220,157,.14), transparent 52%);
        opacity: 1;
      }
      html[data-card-theme="storybook"] .rank,
      html[data-card-theme="storybook"] .corner-suit,
      html[data-card-theme="storybook"] .pip,
      html[data-card-theme="storybook"] .face-rank,
      html[data-card-theme="storybook"] .face-suit {
        font-family: "Comic Sans MS", "Bradley Hand", "Marker Felt", cursive;
        font-weight: 900;
        text-shadow: .7px .7px 0 rgba(255,255,255,.72);
      }
      html[data-card-theme="storybook"] .pip { filter: drop-shadow(0 1px 0 rgba(74,42,30,.14)); }
      html[data-card-theme="storybook"] .ace-emblem span {
        transform: rotate(-2deg) scale(1.03);
        filter: drop-shadow(2px 2px 0 rgba(74,42,30,.1));
      }
      html[data-card-theme="storybook"] .face-emblem {
        inset: 13% 8% 9% 27%;
        border: 1px solid rgba(87,62,42,.15);
        border-radius: 46% 44% 43% 47% / 38% 42% 45% 41%;
        background: linear-gradient(180deg, rgba(255,248,226,.9), rgba(244,224,186,.72));
        transform: rotate(-1deg);
      }
      html[data-card-theme="storybook"] .pixel-portrait { image-rendering: auto; }
      html[data-card-theme="storybook"] .pixel-head {
        left: 31%;
        top: 7%;
        width: 35%;
        height: 27%;
        border: 2px solid #5c463b;
        border-radius: 48% 46% 43% 45%;
        background: #e4ad79;
        box-shadow: inset 5px 0 0 rgba(255,235,199,.38), inset -4px 0 0 rgba(97,62,44,.12);
      }
      html[data-card-theme="storybook"] .pixel-head::before,
      html[data-card-theme="storybook"] .pixel-head::after {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #4f352b;
      }
      html[data-card-theme="storybook"] .pixel-body {
        left: 12%;
        right: 5%;
        bottom: 0;
        height: 58%;
        border: 2px solid #5c463b;
        border-radius: 42% 42% 12% 12% / 24% 24% 10% 10%;
        background: linear-gradient(135deg, currentColor 0 48%, #efd28f 49% 69%, #5f82a0 70% 100%);
      }
      html[data-card-theme="storybook"] .pixel-prop {
        right: 0;
        top: 28%;
        width: 19%;
        height: 44%;
        border: 2px solid #5c463b;
        border-radius: 999px 999px 3px 3px;
        background: #d5a441;
        opacity: .92;
        transform: rotate(12deg);
      }
      html[data-card-theme="storybook"] .face-k .pixel-head {
        background: #8a5a40;
        box-shadow: inset 0 -7px 0 rgba(71,44,33,.3), inset 5px 0 0 rgba(255,225,185,.18);
      }
      html[data-card-theme="storybook"] .face-q .pixel-head {
        border-radius: 50% 50% 42% 42%;
        background: #d89563;
      }
      html[data-card-theme="storybook"] .face-k .pixel-portrait::before,
      html[data-card-theme="storybook"] .face-q .pixel-portrait::before {
        content: "";
        position: absolute;
        z-index: 3;
        left: 25%;
        top: 0;
        width: 48%;
        height: 13%;
        background: #e7b43f;
        clip-path: polygon(0 100%, 0 38%, 18% 68%, 34% 8%, 52% 68%, 70% 4%, 100% 68%, 100% 100%);
        filter: drop-shadow(1px 1px 0 #6b4b31);
      }
      html[data-card-theme="storybook"] .face-j .pixel-body { background: linear-gradient(135deg, #cf624f 0 48%, #efd28f 49% 69%, #557c91 70% 100%); }
      html[data-card-theme="storybook"] .face-q .pixel-body { background: linear-gradient(135deg, #d86b65 0 48%, #f0d8a7 49% 69%, #7a699b 70% 100%); }
      html[data-card-theme="storybook"] .face-k .pixel-body { background: linear-gradient(135deg, #b64c45 0 48%, #efce80 49% 69%, #557654 70% 100%); }

      html[data-card-back="storybook"] .card.back {
        border-color: #789f4c;
        border-radius: 8px 9px 7px 10px;
        background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.03)), #c84e55;
        box-shadow: 0 8px 13px rgba(0,0,0,.24), inset 0 0 0 3px #f5ead0;
      }
      html[data-card-back="storybook"] .card-back-pattern {
        inset: 7px;
        border: 2px solid #f4dfb4;
        border-radius: 5px;
        background:
          radial-gradient(circle at 50% 50%, #f5dfaa 0 9%, transparent 10%),
          radial-gradient(circle at 50% 50%, transparent 0 22%, rgba(245,223,170,.78) 23% 25%, transparent 26%),
          repeating-linear-gradient(45deg, transparent 0 7px, rgba(255,255,255,.15) 7px 10px),
          repeating-linear-gradient(-45deg, transparent 0 7px, rgba(68,91,50,.17) 7px 10px),
          #b9434b;
      }

      html[data-card-theme="dark"] .card:not(.back) {
        border-color: #56627a;
        background: linear-gradient(180deg, #171c25, #10141c);
        color: #c6d0e1;
      }
      html[data-card-theme="dark"] .card.suit-h { color: #ff5f68; border-color: #a83d47; }
      html[data-card-theme="dark"] .card.suit-d { color: #ff8b39; border-color: #a85a30; }
      html[data-card-theme="dark"] .card.suit-c { color: #79bc62; border-color: #4f7745; }
      html[data-card-theme="dark"] .card.suit-s { color: #c6d0e1; }
      html[data-card-theme="dark"] .rank,
      html[data-card-theme="dark"] .corner-suit,
      html[data-card-theme="dark"] .pip,
      html[data-card-theme="dark"] .face-rank,
      html[data-card-theme="dark"] .face-suit { font-family: "Courier New", monospace; font-weight: 950; text-shadow: 1px 1px 0 rgba(0,0,0,.5); }

      html[data-card-back="violet"] .card.back { border-color: #8066a3; background: linear-gradient(180deg, #754b95, #45285e); }
      html[data-card-back="violet"] .card-back-pattern { border-color: #e0caef; background: radial-gradient(circle at 50% 50%, #ead8f5 0 8%, transparent 9%), repeating-linear-gradient(45deg, transparent 0 7px, rgba(255,255,255,.16) 7px 10px), #563370; }

      @media (max-width: 980px) {
        .deck-collection-grid { grid-template-columns: 1fr; }
        .card-style-panel { width: min(520px, calc(100% - 18px)); right: 9px; top: 9px; }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    build();
    evaluateUnlocks({ announceUnlocks: false });
    applyDeck(equippedId);
    refreshCollection();
  }

  window.CardThemeUI = Object.freeze({
    init,
    open: openPanel,
    close: closePanel,
    setDeck: id => applyDeck(id, { notify: true }),
    evaluateUnlocks,
    getOwnedDeckIds: () => [...unlocked],
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
