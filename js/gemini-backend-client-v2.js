// Stable secure browser client for the Gemini final-boss Worker.
(() => {
  "use strict";

  if (window.GeminiBackendClient?.version) return;

  const ENDPOINT_STORAGE_KEY = "texasHoldemGeminiEndpointV1";
  const REQUEST_TIMEOUT_MS = 10_000;
  const RETRY_COOLDOWN_MS = 15_000;
  const BOSS_NAME = "Gemini";
  const VALID_ACTIONS = new Set(["fold", "check", "call", "raise", "all_in"]);
  const VALID_EMOTIONS = new Set(["calm", "confident", "cautious", "tilted"]);
  const originalBotAction = botAction;

  let endpoint = readEndpoint();
  let retryAfter = 0;
  let syncTimer = null;

  function readEndpoint() {
    try {
      return normalizeEndpoint(localStorage.getItem(ENDPOINT_STORAGE_KEY) || window.GEMINI_BACKEND_ENDPOINT || "");
    } catch (error) {
      return "";
    }
  }

  function normalizeEndpoint(value) {
    const raw = String(value || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    let url;
    try {
      url = new URL(raw);
    } catch (error) {
      throw new Error("後端網址格式不正確。");
    }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      throw new Error("正式後端必須使用 HTTPS。");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("後端網址不可包含帳密、查詢字串或錨點。");
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }

  function connectionObject() {
    return window.GeminiFinalBoss?.connection || null;
  }

  function setConnection(patch) {
    const target = connectionObject();
    if (target) Object.assign(target, patch, { provider: "gemini", backendRequired: true });
    syncUi();
  }

  function status() {
    const current = connectionObject() || {};
    return {
      provider: "gemini",
      backendRequired: true,
      configured: Boolean(endpoint),
      connected: Boolean(current.connected),
      mode: current.mode || (endpoint ? "backend-unverified" : "local-fallback"),
      endpoint,
      model: current.model || "",
      lastError: current.lastError || "",
      lastLatencyMs: Number.isFinite(current.lastLatencyMs) ? current.lastLatencyMs : null,
    };
  }

  function saveEndpoint(value) {
    endpoint = normalizeEndpoint(value);
    try {
      if (endpoint) localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint);
      else localStorage.removeItem(ENDPOINT_STORAGE_KEY);
    } catch (error) {
      // Continue with the in-memory endpoint when storage is unavailable.
    }
    retryAfter = 0;
    setConnection({
      configured: Boolean(endpoint),
      connected: false,
      mode: endpoint ? "backend-unverified" : "local-fallback",
      endpoint,
      model: "",
      lastError: "",
      lastLatencyMs: null,
    });
    return endpoint;
  }

  function installStyles() {
    if (document.querySelector("#geminiBackendClientStyles")) return;
    const style = document.createElement("style");
    style.id = "geminiBackendClientStyles";
    style.textContent = `
      .gemini-backend-overlay { position:fixed; z-index:120; inset:0; display:grid; place-items:center; padding:18px; background:rgba(2,7,12,.74); backdrop-filter:blur(12px); }
      .gemini-backend-overlay[hidden] { display:none !important; }
      .gemini-backend-modal { width:min(520px,94vw); padding:18px; border:1px solid rgba(163,137,255,.48); border-radius:16px; background:radial-gradient(circle at 10% 0%,rgba(88,226,216,.17),transparent 38%),radial-gradient(circle at 100% 100%,rgba(137,83,255,.24),transparent 46%),rgba(5,13,22,.98); box-shadow:0 26px 70px rgba(0,0,0,.52),0 0 36px rgba(128,92,255,.2); color:var(--ink); }
      .gemini-backend-head { display:flex; align-items:start; justify-content:space-between; gap:14px; }
      .gemini-backend-head h2 { margin:3px 0 0; }
      .gemini-backend-close { min-width:38px; width:38px; min-height:38px; padding:0; }
      .gemini-backend-copy { margin:14px 0; color:rgba(224,237,234,.8); font-size:.82rem; font-weight:750; line-height:1.55; }
      .gemini-backend-form { display:grid; gap:8px; }
      .gemini-backend-form label { color:var(--gold); font-size:.72rem; font-weight:950; }
      .gemini-backend-form input { width:100%; min-height:44px; padding:9px 11px; border:1px solid rgba(255,255,255,.16); border-radius:9px; background:rgba(255,255,255,.06); color:var(--ink); font-size:.82rem; outline:none; }
      .gemini-backend-form input:focus { border-color:rgba(112,216,201,.58); box-shadow:0 0 0 3px rgba(112,216,201,.1); }
      .gemini-backend-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; }
      .gemini-backend-status { margin-top:12px; padding:10px 11px; border:1px solid rgba(255,255,255,.12); border-radius:10px; background:rgba(255,255,255,.045); color:rgba(224,237,234,.82); font-size:.75rem; font-weight:800; line-height:1.45; }
      .gemini-backend-status[data-tone="success"] { border-left:3px solid var(--cyan); }
      .gemini-backend-status[data-tone="error"] { border-left:3px solid var(--danger); }
      .gemini-backend-status[data-tone="pending"] { border-left:3px solid var(--gold); }
      .gemini-last-decision { display:grid; gap:3px; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.09); }
      .gemini-last-decision strong { color:var(--gold); font-size:.64rem; }
      .gemini-last-decision span { color:rgba(224,237,234,.76); font-size:.62rem; line-height:1.4; }
      #geminiBackendSettingsButton[data-connected="true"] { color:var(--cyan); }
      @media (max-width:560px) { .gemini-backend-actions { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function setModalStatus(message, tone = "neutral") {
    const node = document.querySelector("#geminiBackendStatus");
    if (!node) return;
    setText(node, message);
    if (node.dataset.tone !== tone) node.dataset.tone = tone;
  }

  function ensureModal() {
    let overlay = document.querySelector("#geminiBackendOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("section");
    overlay.id = "geminiBackendOverlay";
    overlay.className = "gemini-backend-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Gemini 後端設定");
    overlay.innerHTML = `
      <div class="gemini-backend-modal">
        <div class="gemini-backend-head">
          <div><p class="eyebrow">Secure AI Backend</p><h2>Gemini 後端</h2></div>
          <button id="geminiBackendClose" class="ghost-button gemini-backend-close" type="button" aria-label="關閉">×</button>
        </div>
        <p class="gemini-backend-copy">貼上 Cloudflare Worker 網址。Gemini API Key 只放在 Worker Secret，這裡不會要求或保存 API Key。</p>
        <div class="gemini-backend-form">
          <label for="geminiBackendEndpoint">Worker 網址</label>
          <input id="geminiBackendEndpoint" type="url" inputmode="url" autocomplete="off" placeholder="https://texas-holdem-gemini.你的帳號.workers.dev" />
          <div class="gemini-backend-actions">
            <button id="geminiBackendSave" type="button">儲存網址</button>
            <button id="geminiBackendTest" type="button">儲存並測試</button>
          </div>
        </div>
        <div id="geminiBackendStatus" class="gemini-backend-status" data-tone="neutral">尚未設定後端，Gemini 目前使用本地 AI 備援。</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#geminiBackendClose")?.addEventListener("click", closeSettings);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeSettings();
    });
    overlay.querySelector("#geminiBackendSave")?.addEventListener("click", () => {
      try {
        saveEndpoint(overlay.querySelector("#geminiBackendEndpoint")?.value || "");
        setModalStatus(endpoint ? "網址已儲存，尚未測試連線。" : "已清除後端網址，將使用本地 AI。", endpoint ? "pending" : "neutral");
      } catch (error) {
        setModalStatus(error.message, "error");
      }
    });
    overlay.querySelector("#geminiBackendTest")?.addEventListener("click", async () => {
      try {
        saveEndpoint(overlay.querySelector("#geminiBackendEndpoint")?.value || "");
        await testConnection();
      } catch (error) {
        setModalStatus(error.message, "error");
      }
    });
    return overlay;
  }

  function mountSettingsButton() {
    const panel = document.querySelector("#settingsMenuPanel");
    if (!panel) return false;
    let button = document.querySelector("#geminiBackendSettingsButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "geminiBackendSettingsButton";
      button.type = "button";
      button.className = "ghost-button topbar-settings-item";
      button.textContent = "🔌 Gemini 後端";
      button.addEventListener("click", openSettings);
      panel.appendChild(button);
    }
    const connected = String(status().connected);
    if (button.dataset.connected !== connected) button.dataset.connected = connected;
    return true;
  }

  function openSettings() {
    const overlay = ensureModal();
    const input = overlay.querySelector("#geminiBackendEndpoint");
    if (input) input.value = endpoint;
    overlay.hidden = false;
    syncModalStatus();
    window.setTimeout(() => input?.focus(), 0);
  }

  function closeSettings() {
    const overlay = document.querySelector("#geminiBackendOverlay");
    if (overlay) overlay.hidden = true;
  }

  function syncModalStatus() {
    const current = status();
    if (current.connected) {
      const latency = current.lastLatencyMs === null ? "" : ` · ${current.lastLatencyMs}ms`;
      setModalStatus(`已連線：${current.model || "Gemini"}${latency}`, "success");
    } else if (current.lastError) {
      setModalStatus(`連線失敗：${current.lastError}，牌局會使用本地 AI。`, "error");
    } else if (endpoint) {
      setModalStatus("後端網址已設定，尚未完成連線測試。", "pending");
    } else {
      setModalStatus("尚未設定後端，Gemini 目前使用本地 AI 備援。", "neutral");
    }
  }

  async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function testConnection() {
    if (!endpoint) throw new Error("請先輸入 Worker 網址。");
    setModalStatus("正在測試 Worker 與 Gemini Secret…", "pending");
    const started = performance.now();
    try {
      const response = await fetchWithTimeout(`${endpoint}/health`, { headers: { accept: "application/json" } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (!payload.configured) throw new Error("Worker 已上線，但尚未設定 GEMINI_API_KEY Secret。");
      const latency = Math.max(0, Math.round(performance.now() - started));
      retryAfter = 0;
      setConnection({ configured: true, connected: true, mode: "gemini-backend", model: payload.model || "Gemini", lastError: "", lastLatencyMs: latency });
      setModalStatus(`已連線：${payload.model || "Gemini"} · ${latency}ms`, "success");
      return payload;
    } catch (error) {
      const message = error?.name === "AbortError" ? "連線逾時" : String(error?.message || error);
      setConnection({ connected: false, mode: "local-fallback", lastError: message });
      setModalStatus(`連線失敗：${message}`, "error");
      throw error;
    }
  }

  function cardForApi(card) {
    const suits = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
    return { rank: String(card?.label || ""), suit: suits[card?.suit] || String(card?.suitSymbol || card?.suit || "") };
  }

  function legalContext(player) {
    const callAmount = amountToCall(player);
    const availableRaise = Math.max(0, player.stack - callAmount);
    const canRaise = !player.raiseLocked && availableRaise >= minimumRaiseBy();
    const canAllIn = player.stack > 0 && (!player.raiseLocked || player.stack <= callAmount);
    const legalActions = callAmount > 0 ? ["fold", "call"] : ["check"];
    if (canRaise) legalActions.push("raise");
    if (canAllIn) legalActions.push("all_in");
    return { callAmount, minRaiseTo: canRaise ? minRaiseTo() : 0, maxRaiseTo: player.bet + player.stack, legalActions };
  }

  function buildDecisionRequest(player) {
    const context = legalContext(player);
    return {
      version: 1,
      requestId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      handNumber: state.handNumber,
      street: state.street,
      position: positionLabel(player),
      holeCards: player.cards.map(cardForApi),
      board: state.board.map(cardForApi),
      pot: state.pot,
      currentBet: state.currentBet,
      callAmount: context.callAmount,
      minRaiseTo: context.minRaiseTo,
      maxRaiseTo: context.maxRaiseTo,
      stack: player.stack,
      playerBet: player.bet,
      legalActions: context.legalActions,
      players: state.players.map(candidate => ({
        name: candidate.name,
        position: positionLabel(candidate),
        stack: candidate.stack,
        bet: candidate.bet,
        folded: candidate.folded,
        allIn: candidate.allIn,
        lastAction: candidate.lastAction || "",
        isHuman: Boolean(candidate.isHuman),
      })),
    };
  }

  function isCurrentDecision(player, snapshot) {
    return state.handNumber === snapshot.handNumber && state.players.includes(player) && !state.handOver && !player.folded && !player.allIn;
  }

  function validateDecision(decision, request) {
    if (!decision || typeof decision !== "object") throw new Error("後端沒有回傳有效決策。");
    const action = String(decision.action || "");
    if (!VALID_ACTIONS.has(action) || !request.legalActions.includes(action)) throw new Error("後端回傳了不合法的動作。");
    let raiseTo = Number(decision.raiseTo || 0);
    if (!Number.isInteger(raiseTo)) throw new Error("後端回傳了不合法的加注金額。");
    if (action === "raise" && (raiseTo < request.minRaiseTo || raiseTo > request.maxRaiseTo)) throw new Error("後端加注超出合法範圍。");
    if (action !== "raise") raiseTo = 0;
    return {
      action,
      raiseTo,
      dialogue: String(decision.dialogue || "").replace(/\s+/g, " ").trim().slice(0, 96),
      emotion: VALID_EMOTIONS.has(String(decision.emotion)) ? String(decision.emotion) : "calm",
      reason: String(decision.reason || "").replace(/\s+/g, " ").trim().slice(0, 180),
    };
  }

  function speakRemoteLine(player, text, tone) {
    const line = String(text || "").trim();
    if (!line) return say(player, tone, { force: true });
    player.dialogue = line;
    player.dialogueTone = tone;
    player.lastDialogueAt = Date.now();
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

  function applyDecision(player, decision, request, metadata = {}) {
    if (!isCurrentDecision(player, request)) return false;
    const needed = amountToCall(player);
    player.emotion = decision.emotion;
    player.providerMode = "gemini-backend";
    player.geminiDecisionReason = decision.reason;
    player.geminiInteractionId = metadata.interactionId || "";

    if (decision.action === "fold") {
      player.folded = true;
      player.hasActed = true;
      player.raiseLocked = false;
      player.status = "棄牌";
      player.lastAction = "fold";
      !state.isMuted && Audio.fold();
      logAction(player, "Fold");
      announceAction("FOLD", "fold");
    } else if (decision.action === "check" || decision.action === "call") {
      if (decision.action === "check" && needed !== 0) throw new Error("Gemini 嘗試在需要跟注時過牌。");
      if (decision.action === "call" && needed <= 0) throw new Error("Gemini 嘗試在零跟注額時跟注。");
      needed === 0 ? !state.isMuted && Audio.check() : !state.isMuted && Audio.chip();
      callPlayer(player);
    } else if (decision.action === "raise") {
      const raiseBy = decision.raiseTo - state.currentBet;
      if (raiseBy < minimumRaiseBy()) throw new Error("Gemini 加注低於最低加注。");
      raisePlayer(player, raiseBy);
      !state.isMuted && Audio.raise();
      logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
      announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    } else if (decision.action === "all_in") {
      if (player.raiseLocked && player.stack > needed) throw new Error("Gemini 在加注未重新開放時嘗試 All-in 加注。");
      const previousBet = state.currentBet;
      pay(player, player.stack);
      player.hasActed = true;
      player.raiseLocked = false;
      const isRaise = applyBetIncrease(player, previousBet);
      player.status = "ALL-IN " + player.bet;
      player.lastAction = "allin";
      !state.isMuted && Audio.raise();
      logAction(player, isRaise ? "All-in Raise" : "All-in", player.bet);
      announceAction("ALL-IN", "allin");
    }

    speakRemoteLine(player, decision.dialogue, player.lastAction || decision.action);
    return true;
  }

  async function requestDecision(player) {
    const request = buildDecisionRequest(player);
    const started = performance.now();
    player.status = "Gemini 思考中…";
    player.providerMode = "gemini-backend";
    const response = await fetchWithTimeout(`${endpoint}/v1/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    const decision = validateDecision(payload.decision, request);
    if (!isCurrentDecision(player, request)) return false;
    const latency = Math.max(0, Math.round(performance.now() - started));
    retryAfter = 0;
    setConnection({ configured: true, connected: true, mode: "gemini-backend", model: payload.model || "Gemini", lastError: "", lastLatencyMs: latency });
    return applyDecision(player, decision, request, payload);
  }

  function botActionWithBackend(player) {
    if (player?.name !== BOSS_NAME || !window.GeminiFinalBoss?.isBossMode?.()) return originalBotAction(player);
    if (!endpoint || Date.now() < retryAfter) {
      player.providerMode = "local-fallback";
      return originalBotAction(player);
    }
    return requestDecision(player).catch(error => {
      const message = error?.name === "AbortError" ? "Gemini 回應逾時" : String(error?.message || error);
      retryAfter = Date.now() + RETRY_COOLDOWN_MS;
      setConnection({ connected: false, mode: "local-fallback", lastError: message });
      if (state.players.includes(player) && !state.handOver && !player.folded && !player.allIn) {
        player.providerMode = "local-fallback";
        return originalBotAction(player);
      }
      return false;
    });
  }

  function syncConnectionCard() {
    const current = status();
    const profile = document.querySelector("#aiProfilePanel.is-gemini-final-boss-profile");
    const card = profile?.querySelector(".gemini-connection-status");
    if (!card) return;
    let strong = card.querySelector("strong");
    let span = card.querySelector("span");
    if (!strong) {
      strong = document.createElement("strong");
      card.appendChild(strong);
    }
    if (!span) {
      span = document.createElement("span");
      card.appendChild(span);
    }
    if (current.connected) {
      setText(strong, `AI 核心：${current.model || "Gemini 後端"}`);
      setText(span, current.lastLatencyMs === null ? "安全後端已連線，Gemini 正式負責決策。" : `安全後端已連線，最近回應 ${current.lastLatencyMs}ms。`);
    } else if (endpoint) {
      setText(strong, "AI 核心：本地 Solver 備援");
      setText(span, current.lastError ? `Gemini 後端暫時失敗：${current.lastError}` : "後端網址已設定；尚未連線時由本地 Solver 接手。");
    } else {
      setText(strong, "AI 核心：本地 Solver 備援");
      setText(span, "Gemini 後端尚未設定；請從設定開啟 Gemini 後端。");
    }

    const boss = state.players.find(player => player.name === BOSS_NAME);
    let last = profile.querySelector(".gemini-last-decision");
    if (boss?.geminiDecisionReason) {
      if (!last) {
        last = document.createElement("div");
        last.className = "gemini-last-decision";
        last.innerHTML = "<strong>最近決策依據</strong><span></span>";
        card.appendChild(last);
      }
      setText(last.querySelector("span"), boss.geminiDecisionReason);
    } else {
      last?.remove();
    }
  }

  function syncUi() {
    installStyles();
    ensureModal();
    mountSettingsButton();
    syncConnectionCard();
    syncModalStatus();
  }

  installStyles();
  ensureModal();
  botAction = botActionWithBackend;
  setConnection({ configured: Boolean(endpoint), connected: false, mode: endpoint ? "backend-unverified" : "local-fallback", endpoint, model: "", lastError: "", lastLatencyMs: null });
  syncTimer = window.setInterval(syncUi, 800);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncUi();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSettings();
  });
  syncUi();

  window.GeminiBackendClient = {
    version: "1.1.0",
    configure: saveEndpoint,
    endpoint: () => endpoint,
    status,
    testConnection,
    buildDecisionRequest,
    validateDecision,
    openSettings,
    closeSettings,
    stopUiSync: () => window.clearInterval(syncTimer),
  };
})();
