// Table dialogue system and adjustable local game-speed control.
(() => {
  "use strict";

  if (window.GameSpeedController?.version) return;

  const STORAGE_KEY = "texasHoldemGameSpeedV1";
  const MIN_SPEED = 1;
  const MAX_SPEED = 3;
  const nativeSetTimeout = window.setTimeout.bind(window);
  let speed = readSpeed();
  let observer = null;
  let syncScheduled = false;

  function normalizeSpeed(value) {
    const numeric = Math.round(Number(value) || MIN_SPEED);
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, numeric));
  }

  function readSpeed() {
    try {
      return normalizeSpeed(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return MIN_SPEED;
    }
  }

  function saveSpeed() {
    try {
      localStorage.setItem(STORAGE_KEY, String(speed));
    } catch (_) {
      // The selected speed still works for the current page session.
    }
  }

  function scaleDelay(milliseconds, { category = "", actorName = "" } = {}) {
    const delay = Math.max(0, Number(milliseconds) || 0);
    if (category === "gemini-request" || category === "gemini-thinking") return delay;
    if (actorName === "Gemini" && category === "ai-thinking") return delay;
    if (speed <= 1 || delay <= 0) return delay;
    return Math.max(16, Math.round(delay / speed));
  }

  function timerStack() {
    try {
      return String(new Error().stack || "");
    } catch (_) {
      return "";
    }
  }

  function isGeminiTiming(stack, delay) {
    if (/gemini-backend-client-v2\.js|gemini-async-betting-loop\.js|gemini-final-boss\.js/.test(stack)) {
      return true;
    }
    if (/ai-timing\.js/.test(stack) && delay >= 400) {
      const actor = state?.players?.[state?.currentActorIndex];
      return actor?.name === "Gemini";
    }
    return false;
  }

  function isScalableGameTimer(stack) {
    if (/ai-timing\.js/.test(stack)) return true;
    if (/dialogue\.js/.test(stack) && /\bsay\b|tableTalk/.test(stack)) return true;
    if (/showdown-actions\.js/.test(stack)
      && /scheduleAutoNewHand|showWinBanner|announceAction|pulsePot/.test(stack)) return true;
    if (/game-flow\.js/.test(stack) && /startHand/.test(stack)) return true;
    if (/tournament-mode\.js/.test(stack) && /startTournamentHand/.test(stack)) return true;
    return false;
  }

  window.setTimeout = function gameSpeedAwareSetTimeout(callback, delay = 0, ...args) {
    const numericDelay = Math.max(0, Number(delay) || 0);
    const stack = timerStack();
    const actualDelay = isScalableGameTimer(stack) && !isGeminiTiming(stack, numericDelay)
      ? scaleDelay(numericDelay)
      : numericDelay;
    return nativeSetTimeout(callback, actualDelay, ...args);
  };

  function syncControl() {
    const input = document.querySelector("#gameSpeedSlider");
    const output = document.querySelector("#gameSpeedOutput");
    const group = document.querySelector("#gameSpeedControl");
    const value = String(speed);
    const label = `×${speed}`;
    if (input && input.value !== value) input.value = value;
    if (output && output.textContent !== label) output.textContent = label;
    if (group && group.dataset.speed !== value) group.dataset.speed = value;
    if (document.documentElement.dataset.gameSpeed !== value) {
      document.documentElement.dataset.gameSpeed = value;
    }
  }

  function rescheduleCurrentFlow(previousSpeed) {
    if (previousSpeed === speed || typeof state !== "object") return;

    const actor = state.players?.[state.currentActorIndex];
    if (!state.handOver && actor && !actor.isHuman && actor.name !== "Gemini") {
      window.AiTimingController?.clear?.();
      nativeSetTimeout(() => {
        if (!state.handOver) window.continueBetting?.();
      }, 0);
    }

    if (state.handOver && state.autoNewHand) {
      window.clearAutoNewHandTimer?.();
      window.scheduleAutoNewHand?.();
    }
  }

  function setSpeed(value, { persist = true, announceChange = true } = {}) {
    const previousSpeed = speed;
    speed = normalizeSpeed(value);
    if (persist) saveSpeed();
    syncControl();
    rescheduleCurrentFlow(previousSpeed);
    if (announceChange && previousSpeed !== speed) {
      window.announce?.(`牌局速度 ×${speed}`);
    }
    return speed;
  }

  function installStyles() {
    if (document.querySelector("#gameSpeedControlStyles")) return;
    const style = document.createElement("style");
    style.id = "gameSpeedControlStyles";
    style.textContent = `
      #settingsMenuPanel .game-speed-control {
        display: grid;
        gap: 7px;
        width: 100%;
        min-width: 0;
        padding: 10px 11px;
        border: 1px solid rgba(112,216,201,.22);
        border-radius: 10px;
        background: rgba(14,37,42,.34);
      }
      .game-speed-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        color: var(--ink);
        font-size: .7rem;
        font-weight: 900;
      }
      .game-speed-head output {
        color: var(--gold);
        font-size: .78rem;
        font-variant-numeric: tabular-nums;
      }
      .game-speed-control input[type="range"] {
        width: 100%;
        min-width: 0;
        accent-color: var(--gold);
      }
      .game-speed-ticks {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        color: var(--muted);
        font-size: .58rem;
        font-weight: 850;
      }
      .game-speed-ticks span:nth-child(2) { text-align: center; }
      .game-speed-ticks span:last-child { text-align: right; }
      .game-speed-note {
        margin: 0;
        color: var(--muted);
        font-size: .57rem;
        line-height: 1.4;
      }
      :root[data-theme="light"] #settingsMenuPanel .game-speed-control {
        background: rgba(229,243,239,.7);
        border-color: rgba(45,111,105,.2);
      }
    `;
    document.head.appendChild(style);
  }

  function mountControl() {
    const panel = document.querySelector("#settingsMenuPanel");
    if (!panel) return false;

    let control = document.querySelector("#gameSpeedControl");
    if (!control) {
      control = document.createElement("section");
      control.id = "gameSpeedControl";
      control.className = "game-speed-control";
      control.setAttribute("aria-label", "牌局速度設定");
      control.innerHTML = `
        <label class="game-speed-head" for="gameSpeedSlider">
          <span>⚡ 牌局速度</span>
          <output id="gameSpeedOutput" for="gameSpeedSlider">×1</output>
        </label>
        <input id="gameSpeedSlider" type="range" min="1" max="3" step="1" value="1" aria-label="牌局速度，1 到 3 倍" />
        <div class="game-speed-ticks" aria-hidden="true"><span>×1</span><span>×2</span><span>×3</span></div>
        <p class="game-speed-note">加速本地 AI、發牌與下一局；Gemini 模型思考與網路等待維持原速。</p>
      `;
      control.querySelector("#gameSpeedSlider")?.addEventListener("input", event => {
        setSpeed(event.target.value);
      });
    }

    if (control.parentElement !== panel) panel.appendChild(control);
    syncControl();
    return true;
  }

  function syncUi() {
    installStyles();
    mountControl();
    syncControl();
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncUi();
    });
  }

  syncUi();
  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleSync, { passive: true });

  window.GameSpeedController = {
    version: "1.0.0",
    getSpeed: () => speed,
    setSpeed,
    scaleDelay,
    refresh: syncUi,
    usesNativeGeminiTiming: true,
  };
})();

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clearDialogueTimers() {
  state.dialogueTimers.forEach(timer => window.clearTimeout(timer));
  state.dialogueTimers = [];
}

function dialogueLinesFor(player, event) {
  return DIALOGUE_BANK[player.name]?.[event] || DIALOGUE_BANK.default?.[event] || [];
}

function say(player, event, { force = false, chance = 1 } = {}) {
  if (!player || player.isHuman) return false;
  const lines = dialogueLinesFor(player, event);
  if (!lines.length) return false;
  const now = Date.now();
  const cooldown = window.GameSpeedController?.scaleDelay?.(DIALOGUE_COOLDOWN_MS, {
    category: "dialogue-cooldown",
    actorName: player.name,
  }) ?? DIALOGUE_COOLDOWN_MS;
  if (!force && Math.random() > chance) return false;
  if (!force && player.lastDialogueAt && now - player.lastDialogueAt < cooldown) return false;
  if (!force && state.streetDialogueCount >= MAX_DIALOGUE_PER_STREET) return false;

  const line = randomItem(lines);
  player.dialogue = line;
  player.dialogueTone = event;
  player.lastDialogueAt = now;
  if (!force) state.streetDialogueCount += 1;

  const timer = window.setTimeout(() => {
    if (player.dialogue === line) {
      player.dialogue = "";
      player.dialogueTone = "";
      render();
    }
  }, DIALOGUE_DISPLAY_MS);
  state.dialogueTimers.push(timer);
  return true;
}

function tableTalk(event, { actor = null, force = false, chance = 0.35, exclude = [] } = {}) {
  if (actor && !actor.isHuman) return say(actor, event, { force, chance });
  if (!force && Math.random() > chance) return false;

  const excluded = new Set(exclude);
  const candidates = state.players
    .slice(1)
    .filter(player => !player.folded && !excluded.has(player))
    .sort(() => Math.random() - 0.5);

  for (const player of candidates) {
    if (say(player, event, { force, chance: 1 })) return true;
  }
  return false;
}
