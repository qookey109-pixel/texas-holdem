// Multi-provider AI engine for the final-boss seat.
// Official Worker remains the default. Advanced users can use a compatible
// custom Worker or an OpenAI-compatible chat-completions API with a session-only key.
(() => {
  "use strict";

  if (window.AIProviderClient?.version) return;
  if (!window.GeminiBackendClient?.version) return;

  const MODES = new Set(["official-worker", "custom-worker", "direct-api"]);
  const MODE_STORAGE_KEY = "texasHoldemAiProviderModeV1";
  const WORKER_ENDPOINT_STORAGE_KEY = "texasHoldemAiCustomWorkerEndpointV1";
  const ENGINE_LABEL_STORAGE_KEY = "texasHoldemAiEngineLabelV1";
  const DIRECT_ENDPOINT_STORAGE_KEY = "texasHoldemAiDirectEndpointV1";
  const DIRECT_MODEL_STORAGE_KEY = "texasHoldemAiDirectModelV1";
  const DIRECT_KEY_SESSION_KEY = "texasHoldemAiDirectKeySessionV1";
  const REQUEST_TIMEOUT_MS = 12_000;
  const RETRY_COOLDOWN_MS = 15_000;
  const BOSS_NAME = "Gemini";
  const workerBotAction = botAction;

  let settings = readSettings();
  let directRetryAfter = 0;
  let directConnection = {
    configured: directConfigured(settings),
    connected: false,
    model: settings.directModel,
    lastError: "",
    lastLatencyMs: null,
  };
  let syncTimer = null;

  function safeStorage(storage, method, key, value = null) {
    try {
      if (method === "get") return storage.getItem(key) || "";
      if (method === "set") storage.setItem(key, value);
      if (method === "remove") storage.removeItem(key);
    } catch (error) {
      // Continue with in-memory settings when browser storage is unavailable.
    }
    return "";
  }

  function defaultOfficialEndpoint() {
    return String(window.GEMINI_BACKEND_ENDPOINT || "").trim().replace(/\/+$/, "");
  }

  function readSettings() {
    const storedMode = safeStorage(localStorage, "get", MODE_STORAGE_KEY);
    const mode = MODES.has(storedMode) ? storedMode : "official-worker";
    return {
      mode,
      workerEndpoint: safeStorage(localStorage, "get", WORKER_ENDPOINT_STORAGE_KEY),
      engineLabel: safeStorage(localStorage, "get", ENGINE_LABEL_STORAGE_KEY) || "自訂 AI",
      directEndpoint: safeStorage(localStorage, "get", DIRECT_ENDPOINT_STORAGE_KEY),
      directModel: safeStorage(localStorage, "get", DIRECT_MODEL_STORAGE_KEY),
      apiKey: safeStorage(sessionStorage, "get", DIRECT_KEY_SESSION_KEY),
    };
  }

  function normalizeSecureUrl(value, fieldLabel) {
    const raw = String(value || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    let url;
    try {
      url = new URL(raw);
    } catch (error) {
      throw new Error(`${fieldLabel}格式不正確。`);
    }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      throw new Error(`${fieldLabel}必須使用 HTTPS；本機 localhost 可使用 HTTP。`);
    }
    if (url.username || url.password || url.hash) {
      throw new Error(`${fieldLabel}不可包含帳密或錨點。`);
    }
    return url.href.replace(/\/+$/, "");
  }

  function directConfigured(source = settings) {
    return Boolean(source.directEndpoint && source.directModel && source.apiKey);
  }

  function persistSettings() {
    safeStorage(localStorage, "set", MODE_STORAGE_KEY, settings.mode);
    if (settings.workerEndpoint) {
      safeStorage(localStorage, "set", WORKER_ENDPOINT_STORAGE_KEY, settings.workerEndpoint);
    } else {
      safeStorage(localStorage, "remove", WORKER_ENDPOINT_STORAGE_KEY);
    }
    if (settings.engineLabel) {
      safeStorage(localStorage, "set", ENGINE_LABEL_STORAGE_KEY, settings.engineLabel);
    } else {
      safeStorage(localStorage, "remove", ENGINE_LABEL_STORAGE_KEY);
    }
    if (settings.directEndpoint) {
      safeStorage(localStorage, "set", DIRECT_ENDPOINT_STORAGE_KEY, settings.directEndpoint);
    } else {
      safeStorage(localStorage, "remove", DIRECT_ENDPOINT_STORAGE_KEY);
    }
    if (settings.directModel) {
      safeStorage(localStorage, "set", DIRECT_MODEL_STORAGE_KEY, settings.directModel);
    } else {
      safeStorage(localStorage, "remove", DIRECT_MODEL_STORAGE_KEY);
    }
    if (settings.apiKey) {
      safeStorage(sessionStorage, "set", DIRECT_KEY_SESSION_KEY, settings.apiKey);
    } else {
      safeStorage(sessionStorage, "remove", DIRECT_KEY_SESSION_KEY);
    }
  }

  function applyMode({ resetConnection = true } = {}) {
    if (settings.mode === "official-worker") {
      window.GeminiBackendClient.configure(defaultOfficialEndpoint());
    } else if (settings.mode === "custom-worker") {
      window.GeminiBackendClient.configure(settings.workerEndpoint);
    } else {
      window.GeminiBackendClient.configure("");
    }

    if (resetConnection) {
      directConnection = {
        configured: directConfigured(settings),
        connected: false,
        model: settings.directModel,
        lastError: "",
        lastLatencyMs: null,
      };
      directRetryAfter = 0;
    }
    syncUi();
  }

  function status() {
    if (settings.mode !== "direct-api") {
      const workerStatus = window.GeminiBackendClient.status();
      const official = settings.mode === "official-worker";
      return {
        provider: official ? "gemini" : "custom-worker",
        mode: settings.mode,
        configured: workerStatus.configured,
        connected: workerStatus.connected,
        endpoint: workerStatus.endpoint,
        model: workerStatus.model,
        engineLabel: official ? "Gemini" : (settings.engineLabel || "自訂 Worker"),
        lastError: workerStatus.lastError,
        lastLatencyMs: workerStatus.lastLatencyMs,
        apiKeyStored: false,
      };
    }

    return {
      provider: "direct-api",
      mode: settings.mode,
      configured: directConnection.configured,
      connected: directConnection.connected,
      endpoint: settings.directEndpoint,
      model: directConnection.model || settings.directModel,
      engineLabel: settings.engineLabel || settings.directModel || "自訂 AI",
      lastError: directConnection.lastError,
      lastLatencyMs: directConnection.lastLatencyMs,
      apiKeyStored: Boolean(settings.apiKey),
    };
  }

  function setDirectConnection(patch) {
    directConnection = { ...directConnection, ...patch };
    const target = window.GeminiFinalBoss?.connection;
    if (target) {
      Object.assign(target, {
        provider: "custom-ai",
        backendRequired: true,
        configured: directConnection.configured,
        connected: directConnection.connected,
        mode: directConnection.connected ? "direct-api" : "local-fallback",
        endpoint: settings.directEndpoint,
        model: directConnection.model || settings.directModel,
        lastError: directConnection.lastError,
        lastLatencyMs: directConnection.lastLatencyMs,
      });
    }
    syncUi();
  }

  function installStyles() {
    if (document.querySelector("#aiProviderClientStyles")) return;
    const style = document.createElement("style");
    style.id = "aiProviderClientStyles";
    style.textContent = `
      #geminiBackendSettingsButton { display:none !important; }
      .ai-provider-overlay { position:fixed; z-index:126; inset:0; display:grid; place-items:center; padding:18px; background:rgba(2,7,12,.78); backdrop-filter:blur(12px); }
      .ai-provider-overlay[hidden] { display:none !important; }
      .ai-provider-modal { width:min(620px,95vw); max-height:min(760px,92vh); overflow:auto; padding:18px; border:1px solid rgba(112,216,201,.38); border-radius:16px; background:radial-gradient(circle at 8% 0%,rgba(88,226,216,.16),transparent 38%),radial-gradient(circle at 100% 100%,rgba(137,83,255,.23),transparent 46%),rgba(5,13,22,.98); box-shadow:0 26px 70px rgba(0,0,0,.54),0 0 36px rgba(90,205,196,.16); color:var(--ink); }
      .ai-provider-head { display:flex; align-items:start; justify-content:space-between; gap:14px; }
      .ai-provider-head h2 { margin:3px 0 0; }
      .ai-provider-close { min-width:38px; width:38px; min-height:38px; padding:0; }
      .ai-provider-copy { margin:12px 0; color:rgba(224,237,234,.8); font-size:.8rem; font-weight:750; line-height:1.55; }
      .ai-provider-form { display:grid; gap:11px; }
      .ai-provider-form label { display:grid; gap:6px; color:var(--gold); font-size:.72rem; font-weight:950; }
      .ai-provider-form input,.ai-provider-form select { width:100%; min-height:44px; padding:9px 11px; border:1px solid rgba(255,255,255,.16); border-radius:9px; background:rgba(255,255,255,.06); color:var(--ink); font-size:.82rem; outline:none; }
      .ai-provider-form option { color:#111; }
      .ai-provider-form input:focus,.ai-provider-form select:focus { border-color:rgba(112,216,201,.58); box-shadow:0 0 0 3px rgba(112,216,201,.1); }
      .ai-provider-section { display:grid; gap:9px; padding:12px; border:1px solid rgba(255,255,255,.1); border-radius:11px; background:rgba(255,255,255,.035); }
      .ai-provider-section[hidden] { display:none !important; }
      .ai-provider-note { margin:0; color:rgba(224,237,234,.72); font-size:.7rem; font-weight:720; line-height:1.5; }
      .ai-provider-warning { margin:0; padding:9px 10px; border-left:3px solid var(--gold); border-radius:8px; background:rgba(255,192,76,.07); color:rgba(255,231,184,.9); font-size:.7rem; font-weight:800; line-height:1.5; }
      .ai-provider-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      .ai-provider-status { padding:10px 11px; border:1px solid rgba(255,255,255,.12); border-radius:10px; background:rgba(255,255,255,.045); color:rgba(224,237,234,.82); font-size:.75rem; font-weight:800; line-height:1.45; }
      .ai-provider-status[data-tone="success"] { border-left:3px solid var(--cyan); }
      .ai-provider-status[data-tone="error"] { border-left:3px solid var(--danger); }
      .ai-provider-status[data-tone="pending"] { border-left:3px solid var(--gold); }
      #aiProviderSettingsButton[data-connected="true"] { color:var(--cyan); }
      @media (max-width:620px) { .ai-provider-actions { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function setModalStatus(message, tone = "neutral") {
    const node = document.querySelector("#aiProviderStatus");
    if (!node) return;
    setText(node, message);
    node.dataset.tone = tone;
  }

  function ensureModal() {
    let overlay = document.querySelector("#aiProviderOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("section");
    overlay.id = "aiProviderOverlay";
    overlay.className = "ai-provider-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "AI 引擎設定");
    overlay.innerHTML = `
      <div class="ai-provider-modal">
        <div class="ai-provider-head">
          <div><p class="eyebrow">AI Engine</p><h2>AI 引擎</h2></div>
          <button id="aiProviderClose" class="ghost-button ai-provider-close" type="button" aria-label="關閉">×</button>
        </div>
        <p class="ai-provider-copy">一般玩家直接使用官方 Gemini Worker。進階玩家可改用自己的 Worker，或輸入 OpenAI 相容 API 的完整網址、模型與 API Key。</p>
        <div class="ai-provider-form">
          <label for="aiProviderMode">使用模式
            <select id="aiProviderMode">
              <option value="official-worker">官方 AI（預設）</option>
              <option value="custom-worker">自訂 Worker</option>
              <option value="direct-api">直接 API（進階）</option>
            </select>
          </label>

          <section id="aiProviderOfficialSection" class="ai-provider-section">
            <p class="ai-provider-note">使用網站預設的安全後端。玩家不需要輸入網址或 API Key；後端失敗時會自動改用本地 Solver。</p>
          </section>

          <section id="aiProviderWorkerSection" class="ai-provider-section" hidden>
            <label for="aiProviderWorkerEndpoint">Worker 網址
              <input id="aiProviderWorkerEndpoint" type="url" inputmode="url" autocomplete="off" placeholder="https://your-worker.example.workers.dev" />
            </label>
            <label for="aiProviderWorkerLabel">AI 顯示名稱
              <input id="aiProviderWorkerLabel" type="text" maxlength="32" autocomplete="off" placeholder="例如：我的 AI" />
            </label>
            <p class="ai-provider-note">自訂 Worker 必須支援 <code>/health</code> 與 <code>/v1/decision</code>，並回傳與官方 Worker 相同的決策格式。供應商 API Key 應放在你自己的 Worker Secret。</p>
          </section>

          <section id="aiProviderDirectSection" class="ai-provider-section" hidden>
            <label for="aiProviderDirectEndpoint">Chat Completions 完整網址
              <input id="aiProviderDirectEndpoint" type="url" inputmode="url" autocomplete="off" placeholder="https://api.example.com/v1/chat/completions" />
            </label>
            <label for="aiProviderDirectModel">模型名稱
              <input id="aiProviderDirectModel" type="text" maxlength="120" autocomplete="off" placeholder="輸入供應商要求的模型 ID" />
            </label>
            <label for="aiProviderDirectLabel">AI 顯示名稱
              <input id="aiProviderDirectLabel" type="text" maxlength="32" autocomplete="off" placeholder="例如：Grok／自訂 AI" />
            </label>
            <label for="aiProviderApiKey">API Key（僅目前分頁）
              <input id="aiProviderApiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="關閉分頁後自動清除" />
            </label>
            <p class="ai-provider-warning">直接 API 模式會由瀏覽器把 Key 傳往你指定的 API。Key 不會寫入 GitHub或 localStorage，只保留在目前分頁的 sessionStorage。若供應商不允許瀏覽器跨網域呼叫，請改用自訂 Worker。</p>
          </section>

          <div class="ai-provider-actions">
            <button id="aiProviderSave" type="button">儲存設定</button>
            <button id="aiProviderTest" type="button">儲存並測試</button>
            <button id="aiProviderOfficial" type="button">使用官方 AI</button>
          </div>
          <div id="aiProviderStatus" class="ai-provider-status" data-tone="neutral">官方 AI 已啟用。</div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector("#aiProviderClose")?.addEventListener("click", closeSettings);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeSettings();
    });
    overlay.querySelector("#aiProviderMode")?.addEventListener("change", syncModeSections);
    overlay.querySelector("#aiProviderSave")?.addEventListener("click", () => {
      try {
        saveFromForm();
        setModalStatus(savedStatusMessage(), "pending");
      } catch (error) {
        setModalStatus(String(error?.message || error), "error");
      }
    });
    overlay.querySelector("#aiProviderTest")?.addEventListener("click", async () => {
      try {
        saveFromForm();
        await testConnection();
      } catch (error) {
        setModalStatus(String(error?.message || error), "error");
      }
    });
    overlay.querySelector("#aiProviderOfficial")?.addEventListener("click", () => {
      settings.mode = "official-worker";
      persistSettings();
      applyMode();
      fillForm();
      setModalStatus("已還原官方 AI；輪到 Gemini 時會自動連線。", "success");
    });
    return overlay;
  }

  function mountSettingsButton() {
    const panel = document.querySelector("#settingsMenuPanel");
    if (!panel) return false;

    document.querySelector("#geminiBackendSettingsButton")?.setAttribute("hidden", "");
    let button = document.querySelector("#aiProviderSettingsButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "aiProviderSettingsButton";
      button.type = "button";
      button.className = "ghost-button topbar-settings-item";
      button.textContent = "🧠 AI 引擎";
      button.addEventListener("click", openSettings);
      panel.appendChild(button);
    }
    button.dataset.connected = String(status().connected);
    return true;
  }

  function syncModeSections() {
    const overlay = ensureModal();
    const mode = overlay.querySelector("#aiProviderMode")?.value || settings.mode;
    overlay.querySelector("#aiProviderOfficialSection").hidden = mode !== "official-worker";
    overlay.querySelector("#aiProviderWorkerSection").hidden = mode !== "custom-worker";
    overlay.querySelector("#aiProviderDirectSection").hidden = mode !== "direct-api";
  }

  function fillForm() {
    const overlay = ensureModal();
    const assign = (selector, value) => {
      const input = overlay.querySelector(selector);
      if (input) input.value = value || "";
    };
    assign("#aiProviderMode", settings.mode);
    assign("#aiProviderWorkerEndpoint", settings.workerEndpoint);
    assign("#aiProviderWorkerLabel", settings.engineLabel);
    assign("#aiProviderDirectEndpoint", settings.directEndpoint);
    assign("#aiProviderDirectModel", settings.directModel);
    assign("#aiProviderDirectLabel", settings.engineLabel);
    assign("#aiProviderApiKey", settings.apiKey);
    syncModeSections();
  }

  function openSettings() {
    const overlay = ensureModal();
    window.GeminiBackendClient.closeSettings?.();
    fillForm();
    overlay.hidden = false;
    syncModalStatus();
    window.setTimeout(() => overlay.querySelector("#aiProviderMode")?.focus(), 0);
  }

  function closeSettings() {
    const overlay = document.querySelector("#aiProviderOverlay");
    if (overlay) overlay.hidden = true;
    document.querySelector("#aiProviderSettingsButton")?.focus({ preventScroll: true });
  }

  function saveFromForm() {
    const overlay = ensureModal();
    const mode = overlay.querySelector("#aiProviderMode")?.value || "official-worker";
    if (!MODES.has(mode)) throw new Error("AI 模式不正確。");

    const next = {
      mode,
      workerEndpoint: normalizeSecureUrl(
        overlay.querySelector("#aiProviderWorkerEndpoint")?.value || "",
        "Worker 網址",
      ),
      engineLabel: String(
        mode === "direct-api"
          ? overlay.querySelector("#aiProviderDirectLabel")?.value || ""
          : overlay.querySelector("#aiProviderWorkerLabel")?.value || "",
      ).trim().slice(0, 32) || "自訂 AI",
      directEndpoint: normalizeSecureUrl(
        overlay.querySelector("#aiProviderDirectEndpoint")?.value || "",
        "API 網址",
      ),
      directModel: String(overlay.querySelector("#aiProviderDirectModel")?.value || "").trim().slice(0, 120),
      apiKey: String(overlay.querySelector("#aiProviderApiKey")?.value || "").trim(),
    };

    if (next.mode === "custom-worker" && !next.workerEndpoint) {
      throw new Error("請輸入自訂 Worker 網址。");
    }
    if (next.mode === "direct-api") {
      if (!next.directEndpoint) throw new Error("請輸入 Chat Completions 完整網址。");
      if (!next.directModel) throw new Error("請輸入模型名稱。");
      if (!next.apiKey) throw new Error("請輸入 API Key；Key 只保留在目前分頁。");
    }

    settings = next;
    persistSettings();
    applyMode();
    fillForm();
    return status();
  }

  function savedStatusMessage() {
    if (settings.mode === "official-worker") return "官方 AI 已啟用；輪到 Gemini 時會自動連線。";
    if (settings.mode === "custom-worker") return "自訂 Worker 已儲存，尚未測試連線。";
    return "直接 API 設定已儲存；API Key 僅保留在目前分頁，尚未測試。";
  }

  function syncModalStatus() {
    const current = status();
    if (current.connected) {
      const latency = current.lastLatencyMs === null ? "" : ` · ${current.lastLatencyMs}ms`;
      setModalStatus(`已連線：${current.engineLabel}${current.model ? ` / ${current.model}` : ""}${latency}`, "success");
    } else if (current.lastError) {
      setModalStatus(`連線失敗：${current.lastError}，牌局會使用本地 Solver。`, "error");
    } else if (current.configured) {
      setModalStatus(savedStatusMessage(), "pending");
    } else {
      setModalStatus("目前設定不完整；牌局會使用本地 Solver。", "neutral");
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

  function directSystemPrompt() {
    return [
      "You are the decision engine for a no-limit Texas Hold'em final boss.",
      "Return exactly one JSON object and no markdown.",
      "Use only an action listed in legalActions.",
      "Schema: {\"action\":\"fold|check|call|raise|all_in\",\"raiseTo\":integer,\"dialogue\":\"short Traditional Chinese line\",\"emotion\":\"calm|confident|cautious|tilted\",\"reason\":\"short Traditional Chinese reason\"}.",
      "For actions other than raise, raiseTo must be 0.",
      "For raise, raiseTo must be between minRaiseTo and maxRaiseTo.",
      "Never invent or request hidden opponent cards. Use only the supplied state.",
    ].join(" ");
  }

  function extractMessageContent(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map(part => typeof part === "string" ? part : String(part?.text || "")).join("");
    }
    if (content && typeof content === "object") return JSON.stringify(content);
    throw new Error(payload?.error?.message || payload?.error || "API 沒有回傳可讀內容。");
  }

  function parseDecisionText(text) {
    const raw = String(text || "").trim();
    const unfenced = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 回傳內容不是有效 JSON。");
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch (error) {
      throw new Error("AI 回傳 JSON 無法解析。");
    }
  }

  async function requestDirectPayload(request) {
    if (!directConfigured(settings)) throw new Error("直接 API 設定不完整。");
    const response = await fetchWithTimeout(settings.directEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.directModel,
        messages: [
          { role: "system", content: directSystemPrompt() },
          { role: "user", content: JSON.stringify(request) },
        ],
        temperature: 0.35,
        stream: false,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.error || `HTTP ${response.status}`);
    }
    const rawDecision = parseDecisionText(extractMessageContent(payload));
    const decision = window.GeminiBackendClient.validateDecision(rawDecision, request);
    return {
      decision,
      model: String(payload?.model || settings.directModel),
      interactionId: String(payload?.id || ""),
    };
  }

  function syntheticDecisionRequest() {
    return {
      version: 1,
      requestId: "connection-test",
      handNumber: 1,
      street: "翻牌前",
      position: "BTN",
      holeCards: [{ rank: "A", suit: "spades" }, { rank: "K", suit: "hearts" }],
      board: [],
      pot: 30,
      currentBet: 20,
      callAmount: 0,
      minRaiseTo: 40,
      maxRaiseTo: 2000,
      stack: 1980,
      playerBet: 20,
      legalActions: ["check"],
      players: [],
    };
  }

  async function testConnection() {
    if (settings.mode !== "direct-api") {
      setModalStatus("正在測試 Worker…", "pending");
      const payload = await window.GeminiBackendClient.testConnection();
      syncUi();
      return payload;
    }

    setModalStatus("正在測試直接 API；此動作可能產生少量 API 用量…", "pending");
    const started = performance.now();
    try {
      const payload = await requestDirectPayload(syntheticDecisionRequest());
      const latency = Math.max(0, Math.round(performance.now() - started));
      directRetryAfter = 0;
      setDirectConnection({
        configured: true,
        connected: true,
        model: payload.model,
        lastError: "",
        lastLatencyMs: latency,
      });
      setModalStatus(`已連線：${settings.engineLabel} / ${payload.model} · ${latency}ms`, "success");
      return payload;
    } catch (error) {
      const message = error?.name === "AbortError" ? "連線逾時" : String(error?.message || error);
      setDirectConnection({
        configured: directConfigured(settings),
        connected: false,
        lastError: message,
        lastLatencyMs: null,
      });
      throw error;
    }
  }

  function isCurrentDecision(player, snapshot) {
    return state.handNumber === snapshot.handNumber
      && state.players.includes(player)
      && !state.handOver
      && !player.folded
      && !player.allIn;
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

  function applyDirectDecision(player, decision, request, metadata = {}) {
    if (!isCurrentDecision(player, request)) return false;
    const needed = amountToCall(player);
    player.emotion = decision.emotion;
    player.providerMode = "direct-api";
    player.geminiDecisionReason = decision.reason;
    player.aiDecisionReason = decision.reason;
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
      if (decision.action === "check" && needed !== 0) throw new Error("自訂 AI 嘗試在需要跟注時過牌。");
      if (decision.action === "call" && needed <= 0) throw new Error("自訂 AI 嘗試在零跟注額時跟注。");
      needed === 0 ? !state.isMuted && Audio.check() : !state.isMuted && Audio.chip();
      callPlayer(player);
    } else if (decision.action === "raise") {
      const raiseBy = decision.raiseTo - state.currentBet;
      if (raiseBy < minimumRaiseBy()) throw new Error("自訂 AI 加注低於最低加注。");
      raisePlayer(player, raiseBy);
      !state.isMuted && Audio.raise();
      logAction(player, player.allIn ? "All-in Raise" : "Raise", player.bet);
      announceAction(player.allIn ? "ALL-IN" : "RAISE", player.lastAction);
    } else if (decision.action === "all_in") {
      if (player.raiseLocked && player.stack > needed) {
        throw new Error("自訂 AI 在加注未重新開放時嘗試 All-in 加注。");
      }
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

  async function requestDirectDecision(player) {
    const request = window.GeminiBackendClient.buildDecisionRequest(player);
    const started = performance.now();
    player.status = `${settings.engineLabel || "自訂 AI"} 思考中…`;
    player.providerMode = "direct-api";
    const payload = await requestDirectPayload(request);
    if (!isCurrentDecision(player, request)) return false;
    const latency = Math.max(0, Math.round(performance.now() - started));
    directRetryAfter = 0;
    setDirectConnection({
      configured: true,
      connected: true,
      model: payload.model,
      lastError: "",
      lastLatencyMs: latency,
    });
    return applyDirectDecision(player, payload.decision, request, payload);
  }

  function botActionWithProvider(player) {
    const directMode = settings.mode === "direct-api";
    const isBoss = player?.name === BOSS_NAME && window.GeminiFinalBoss?.isBossMode?.();
    if (!directMode || !isBoss) return workerBotAction(player);

    if (!directConfigured(settings) || Date.now() < directRetryAfter) {
      player.providerMode = "local-fallback";
      return workerBotAction(player);
    }

    return requestDirectDecision(player).catch(error => {
      const message = error?.name === "AbortError" ? "自訂 AI 回應逾時" : String(error?.message || error);
      directRetryAfter = Date.now() + RETRY_COOLDOWN_MS;
      setDirectConnection({
        configured: directConfigured(settings),
        connected: false,
        lastError: message,
        lastLatencyMs: null,
      });
      if (state.players.includes(player) && !state.handOver && !player.folded && !player.allIn) {
        player.providerMode = "local-fallback";
        return workerBotAction(player);
      }
      return false;
    });
  }

  function syncProfileCard() {
    const current = status();
    const profile = document.querySelector("#aiProfilePanel.is-gemini-final-boss-profile");
    const card = profile?.querySelector(".gemini-connection-status");
    if (!card) return;
    const strong = card.querySelector("strong");
    const span = card.querySelector("span");

    if (current.connected) {
      setText(strong, `AI 核心：${current.engineLabel}`);
      const latency = current.lastLatencyMs === null ? "" : `，最近回應 ${current.lastLatencyMs}ms`;
      setText(span, `${current.model || "AI"} 已連線${latency}。`);
    } else if (current.configured) {
      setText(strong, "AI 核心：本地 Solver 備援");
      setText(
        span,
        current.lastError
          ? `${current.engineLabel} 暫時失敗：${current.lastError}`
          : `${current.engineLabel} 已設定；尚未連線時由本地 Solver 接手。`,
      );
    } else {
      setText(strong, "AI 核心：本地 Solver 備援");
      setText(span, "AI 引擎設定不完整；請從設定開啟 AI 引擎。");
    }
  }

  function syncUi() {
    installStyles();
    ensureModal();
    mountSettingsButton();
    syncProfileCard();
    if (!document.querySelector("#aiProviderOverlay")?.hidden) syncModalStatus();
  }

  function configure(next = {}) {
    const merged = { ...settings, ...next };
    if (!MODES.has(merged.mode)) throw new Error("AI 模式不正確。");
    merged.workerEndpoint = normalizeSecureUrl(merged.workerEndpoint || "", "Worker 網址");
    merged.directEndpoint = normalizeSecureUrl(merged.directEndpoint || "", "API 網址");
    merged.engineLabel = String(merged.engineLabel || "自訂 AI").trim().slice(0, 32);
    merged.directModel = String(merged.directModel || "").trim().slice(0, 120);
    merged.apiKey = String(merged.apiKey || "").trim();
    settings = merged;
    persistSettings();
    applyMode();
    fillForm();
    return status();
  }

  installStyles();
  ensureModal();
  window.GeminiBackendClient.closeSettings?.();
  applyMode();
  botAction = botActionWithProvider;
  syncTimer = window.setInterval(syncUi, 250);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncUi();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSettings();
  });
  syncUi();

  window.AIProviderClient = {
    version: "1.0.0",
    modes: [...MODES],
    configure,
    status,
    testConnection,
    openSettings,
    closeSettings,
    requestDirectPayload,
    parseDecisionText,
    clearSessionKey: () => {
      settings.apiKey = "";
      persistSettings();
      directConnection.configured = false;
      directConnection.connected = false;
      fillForm();
      syncUi();
    },
    stopUiSync: () => window.clearInterval(syncTimer),
  };
})();