// Rich, character-aware AI emotion and action emoji badges.
(() => {
  "use strict";

  const CHARACTER_NAMES = Object.freeze({
    Leo: "獅王",
    Toto: "龜龜",
    Foxy: "狐狸",
    Wolf: "灰狼",
    Pao: "熊貓",
    Shark: "鯊魚",
    Ace: "獵鷹",
    Momo: "猴王",
    Nori: "貓咪",
    Bruno: "棕熊",
    Dodo: "小鹿",
    Viper: "毒蛇",
    Nova: "外星人",
    "Unit-9": "機器人",
    Merlin: "魔法師",
  });

  const CHARACTER_MOODS = Object.freeze({
    Leo: {
      fresh: ["✨", "🌟"], calm: ["🍃", "😌"], confident: ["👑", "🔥"], tilted: ["💢", "😡", "🔥"], cautious: ["🛡️", "👀"],
    },
    Toto: {
      fresh: ["🌱", "✨"], calm: ["🍵", "🌿"], confident: ["🏅", "💚"], tilted: ["💢", "😤"], cautious: ["🛡️", "🫣"],
    },
    Foxy: {
      fresh: ["✨", "🎭"], calm: ["🎭", "🫥"], confident: ["😏", "🎩"], tilted: ["🌀", "💢"], cautious: ["👀", "🫣"],
    },
    Wolf: {
      fresh: ["🌙", "✨"], calm: ["🌙", "🐾"], confident: ["🎯", "🌕"], tilted: ["💢", "⚡"], cautious: ["👂", "👀"],
    },
    Pao: {
      fresh: ["🧋", "✨"], calm: ["🧋", "😌"], confident: ["😋", "🍀"], tilted: ["😵", "💢"], cautious: ["🫣", "☂️"],
    },
    Shark: {
      fresh: ["🌊", "✨"], calm: ["🧊", "📊"], confident: ["🩸", "📈"], tilted: ["🦷", "💢"], cautious: ["📉", "👀"],
    },
    Ace: {
      fresh: ["🪽", "✨"], calm: ["👁️", "🔭"], confident: ["🎯", "⚡"], tilted: ["💢", "🔥"], cautious: ["🛡️", "👀"],
    },
    Momo: {
      fresh: ["🍌", "🎉"], calm: ["🍌", "😌"], confident: ["🤪", "🎉"], tilted: ["🌀", "💥"], cautious: ["🙈", "🫣"],
    },
    Nori: {
      fresh: ["🐾", "✨"], calm: ["🐾", "😌"], confident: ["😼", "🌟"], tilted: ["😾", "💢"], cautious: ["👀", "🫣"],
    },
    Bruno: {
      fresh: ["🌲", "✨"], calm: ["🪨", "🌲"], confident: ["💪", "🏔️"], tilted: ["💥", "💢"], cautious: ["🧱", "🛡️"],
    },
    Dodo: {
      fresh: ["🌿", "✨"], calm: ["🌿", "😌"], confident: ["🌟", "🦋"], tilted: ["😵", "💢"], cautious: ["😰", "🫣"],
    },
    Viper: {
      fresh: ["✨", "🌙"], calm: ["🌙", "👁️"], confident: ["🕸️", "☠️"], tilted: ["💢", "⚡"], cautious: ["👁️", "🫥"],
    },
    Nova: {
      fresh: ["🛸", "✨"], calm: ["🛸", "🌌"], confident: ["👾", "🌠"], tilted: ["⚡", "💥"], cautious: ["📡", "👁️"],
    },
    "Unit-9": {
      fresh: ["🔋", "✨"], calm: ["🧮", "✅"], confident: ["📈", "🤖"], tilted: ["⚠️", "💥"], cautious: ["🛡️", "🔍"],
    },
    Merlin: {
      fresh: ["✨", "🪄"], calm: ["🔮", "🌙"], confident: ["✨", "🪄"], tilted: ["⚡", "💥"], cautious: ["📜", "👁️"],
    },
  });

  const DEFAULT_MOODS = Object.freeze({
    fresh: ["✨", "🤩"],
    calm: ["😌", "🍃"],
    confident: ["😎", "👑"],
    tilted: ["💢", "😤", "🔥"],
    cautious: ["😰", "👀", "🛡️"],
  });

  const REACTION_VISIBLE_MS = 2600;
  const reactionSeen = new Map();
  let reactionRefreshTimer = 0;

  const ACTION_VISUALS = Object.freeze({
    thinking: { icons: ["💭", "🤔", "🧠"], label: "正在思考", tone: "thinking" },
    allin: { icons: ["🚨", "🔥", "💥"], label: "全押爆發", tone: "allin" },
    raise: { icons: ["📈", "💢", "🔥"], label: "主動施壓", tone: "raise" },
    call: { icons: ["🤝", "👀", "🧩"], label: "跟注觀察", tone: "call" },
    check: { icons: ["👌", "👁️", "🧘"], label: "過牌觀望", tone: "check" },
    fold: { icons: ["💨", "🙈", "🫥"], label: "暫時退場", tone: "fold" },
    win: { icons: ["🏆", "👑", "🎉"], label: "贏下底池", tone: "win" },
  });

  const MOOD_PHRASES = Object.freeze({
    fresh: "精神滿滿",
    calm: "冷靜觀察",
    confident: "氣勢全開",
    tilted: "正在發怒",
    cautious: "提高警戒",
  });

  function stableNumber(text) {
    let hash = 0;
    for (const char of String(text)) hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
    return Math.abs(hash);
  }

  function pick(items, player, stateKey) {
    if (!items?.length) return "😌";
    const seed = `${player.name}|${stateKey}|${state.handNumber}|${player.streak || 0}|${player.position}`;
    return items[stableNumber(seed) % items.length];
  }

  function moodMeta(player) {
    const emotion = player.emotion || "calm";
    const character = CHARACTER_NAMES[player.name] || player.name;
    const icons = CHARACTER_MOODS[player.name]?.[emotion] || DEFAULT_MOODS[emotion] || DEFAULT_MOODS.calm;
    const systemMeta = typeof aiEmotionMeta === "function" ? aiEmotionMeta(emotion) : null;
    const phrase = MOOD_PHRASES[emotion] || systemMeta?.label || "冷靜觀察";
    return {
      icon: pick(icons, player, emotion),
      label: `${character}${phrase}${systemMeta?.detail ? `｜${systemMeta.detail}` : ""}`,
      tone: emotion,
    };
  }

  function actionMeta(player) {
    const character = CHARACTER_NAMES[player.name] || player.name;
    const isWinner = Boolean(state.winners?.includes(player.name));
    const isThinking = String(player.status || "").includes("Thinking");
    const actionKey = isWinner
      ? "win"
      : player.folded
        ? "fold"
        : isThinking
          ? "thinking"
          : player.lastAction === "allin"
            ? "allin"
            : player.lastAction === "raise"
              ? "raise"
              : player.lastAction === "call"
                ? "call"
                : player.lastAction === "check"
                  ? "check"
                  : null;

    if (!actionKey) return null;
    const action = ACTION_VISUALS[actionKey];
    return {
      icon: pick(action.icons, player, actionKey),
      label: `${character}${action.label}`,
      tone: action.tone,
    };
  }

  function reactionKey(player, action) {
    return `${state.handNumber}:${player.position}:${action.tone}:${player.lastAction || ""}:${player.status || ""}:${player.folded ? "folded" : "live"}`;
  }

  function scheduleReactionRefresh(delay) {
    clearTimeout(reactionRefreshTimer);
    reactionRefreshTimer = setTimeout(() => {
      reactionRefreshTimer = 0;
      decorateEmotionFaces();
    }, Math.max(80, delay));
  }

  function visibleActionMeta(player, action) {
    if (!action) return null;
    if (action.tone === "thinking" || action.tone === "win") return action;

    const now = Date.now();
    const memoryKey = `${player.name}:${player.position}`;
    const signature = reactionKey(player, action);
    let memory = reactionSeen.get(memoryKey);
    if (!memory || memory.signature !== signature) {
      memory = { signature, until: now + REACTION_VISIBLE_MS };
      reactionSeen.set(memoryKey, memory);
    }

    if (now <= memory.until) {
      scheduleReactionRefresh(memory.until - now + 40);
      return action;
    }
    return null;
  }

  function badgeMetas(player) {
    const mood = moodMeta(player);
    const action = visibleActionMeta(player, actionMeta(player));
    const emotion = player.emotion || "calm";
    const showMood = Boolean(action) || !["calm", "fresh"].includes(emotion);
    return [
      ...(showMood ? [{ ...mood, slot: "mood" }] : []),
      ...(action ? [{ ...action, slot: "action" }] : []),
    ];
  }

  function createBadge(visual, profile = false) {
    const badge = document.createElement("span");
    badge.className = `ai-emotion-face-badge tone-${visual.tone} slot-${visual.slot}${profile ? " is-profile" : ""}`;
    badge.textContent = visual.icon;
    badge.title = visual.label;
    badge.setAttribute("aria-label", visual.label);
    badge.dataset.emotionTone = visual.tone;
    return badge;
  }

  function decorateSeat(seat) {
    const position = Number(seat.dataset.profilePosition);
    const player = state.players?.find(candidate => !candidate.isHuman && candidate.position === position);
    if (!player) return;

    seat.querySelector(".seat-header > .emotion-chip")?.remove();
    const avatar = seat.querySelector(".player-emoji");
    if (!avatar) return;

    avatar.querySelectorAll(".ai-emotion-face-badge").forEach(badge => badge.remove());
    badgeMetas(player).forEach(meta => avatar.appendChild(createBadge(meta)));
  }

  function decorateProfile() {
    const panel = document.querySelector("#aiProfilePanel");
    if (!panel || panel.hidden) return;
    const player = state.players?.find(candidate => !candidate.isHuman && candidate.position === state.selectedProfilePosition);
    if (!player) return;

    panel.querySelector(".ai-profile-tags .emotion-chip")?.remove();
    panel.querySelectorAll(".ai-profile-now > span").forEach(item => {
      if (item.textContent.trim().startsWith("情緒")) item.remove();
    });

    const avatar = panel.querySelector(".ai-profile-avatar");
    if (!avatar) return;
    avatar.querySelectorAll(".ai-emotion-face-badge").forEach(badge => badge.remove());
    badgeMetas(player).forEach(meta => avatar.appendChild(createBadge(meta, true)));
  }

  function decorateEmotionFaces() {
    document.querySelectorAll(".seat[data-profile-position]").forEach(decorateSeat);
    decorateProfile();
  }

  function installStyles() {
    if (document.querySelector("#aiEmotionFaceStyles")) return;
    const style = document.createElement("style");
    style.id = "aiEmotionFaceStyles";
    style.textContent = `
      html body .seat-header {
        grid-template-rows: repeat(2, 23px) !important;
        min-height: 66px !important;
      }
      html body .seat-header .seat-identity {
        grid-row: 1 / 3 !important;
      }
      html body .seat-header .seat-status {
        grid-row: 2 !important;
      }
      html body .seat-header > .emotion-chip {
        display: none !important;
      }
      html body .player-emoji,
      html body .ai-profile-avatar {
        position: relative !important;
        overflow: visible !important;
      }
      .ai-emotion-face-badge {
        position: absolute;
        z-index: 4;
        top: -24px;
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border: 1px solid rgba(255,255,255,.68);
        border-radius: 999px;
        background: rgba(5,13,16,.95);
        font-size: .9rem;
        line-height: 1;
        box-shadow: 0 4px 11px rgba(0,0,0,.34);
        pointer-events: none;
        transform-origin: center;
      }
      .ai-emotion-face-badge.slot-mood {
        left: -12px;
      }
      .ai-emotion-face-badge.slot-action {
        right: -12px;
      }
      .ai-emotion-face-badge.is-profile {
        top: -27px;
        width: 28px;
        height: 28px;
        font-size: 1.02rem;
      }
      .ai-emotion-face-badge.is-profile.slot-mood {
        left: -12px;
      }
      .ai-emotion-face-badge.is-profile.slot-action {
        right: -12px;
      }
      .ai-emotion-face-badge.tone-confident,
      .ai-emotion-face-badge.tone-win {
        border-color: rgba(255,215,105,.88);
        box-shadow: 0 4px 11px rgba(0,0,0,.34), 0 0 12px rgba(255,200,70,.34);
      }
      .ai-emotion-face-badge.tone-tilted,
      .ai-emotion-face-badge.tone-allin,
      .ai-emotion-face-badge.tone-raise {
        border-color: rgba(255,113,76,.9);
        box-shadow: 0 4px 11px rgba(0,0,0,.34), 0 0 13px rgba(255,90,45,.38);
      }
      .ai-emotion-face-badge.tone-call,
      .ai-emotion-face-badge.tone-check,
      .ai-emotion-face-badge.tone-thinking {
        border-color: rgba(112,216,201,.78);
        box-shadow: 0 4px 11px rgba(0,0,0,.34), 0 0 12px rgba(112,216,201,.22);
      }
      .ai-emotion-face-badge.tone-cautious {
        border-color: rgba(140,205,255,.72);
      }
      .ai-emotion-face-badge.tone-fold {
        opacity: .72;
        filter: grayscale(.25);
      }
      .ai-profile-tags .emotion-chip,
      .ai-profile-now > span[data-emotion],
      .seat-header > .emotion-chip {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  const originalRender = window.render;
  if (typeof originalRender === "function") {
    window.render = function renderWithEmotionFaces(...args) {
      const result = originalRender.apply(this, args);
      decorateEmotionFaces();
      return result;
    };
  }

  installStyles();
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", decorateEmotionFaces, { once: true })
    : decorateEmotionFaces();

  window.AiEmotionFaceUI = {
    characterMoods: CHARACTER_MOODS,
    refresh: decorateEmotionFaces,
  };
})();
