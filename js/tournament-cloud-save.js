// Authenticated tournament cloud save with local fallback.
(() => {
  "use strict";

  if (window.TournamentCloudSave?.version) return;

  const CONFIG = Object.freeze({
    projectUrl: "https://iphhyjutbrahvfnsvdfn.supabase.co",
    publishableKey: "sb_publishable_MbNQVDLJkB-_1Z05aQ1FRA_V3XCNfMx",
    clientModuleUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
    table: "tournament_saves",
    localPrefix: "texasHoldemTournamentSaveV1:",
    schemaVersion: 1,
  });

  const NORMAL_MODE = "normal";
  const TOURNAMENT_MODE = "tournament";
  const MAX_STACK = 1_000_000_000;
  const MAX_HAND_NUMBER = 1_000_000;
  const EMOTIONS = new Set(["fresh", "calm", "confident", "tilted", "cautious"]);

  let clientPromise = null;
  let remoteSave = null;
  let remoteUpdatedAt = "";
  let saveSource = "none";
  let busy = false;
  let pauseRequested = false;
  let deleteArmedUntil = 0;
  let lastAuthUserId = "";
  let lastSettlementKey = "";
  let statusText = "登入後可使用淘汰賽雲端存檔。";
  let statusTone = "neutral";
  let observer = null;
  let syncScheduled = false;

  function cleanText(value, maxLength = 80) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function cleanInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number)) return minimum;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function uniqueNames(values, allowedNames) {
    const result = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const name = cleanText(value, 40);
      if (!name || !allowedNames.has(name) || seen.has(name)) continue;
      seen.add(name);
      result.push(name);
    }
    return result;
  }

  function knownAiNames() {
    const names = new Set(
      (typeof AI_ROSTER === "object" && Array.isArray(AI_ROSTER) ? AI_ROSTER : [])
        .map(profile => cleanText(profile?.name, 40))
        .filter(Boolean),
    );
    const geminiName = cleanText(window.GeminiFinalBoss?.profile?.name || "Gemini", 40);
    if (geminiName) names.add(geminiName);
    return names;
  }

  function normalizeSeat(raw, allowedNames) {
    const name = cleanText(raw?.name, 40);
    if (!name || !allowedNames.has(name)) return null;
    return {
      name,
      stack: cleanInteger(raw?.stack, 0, MAX_STACK),
      wins: cleanInteger(raw?.wins, 0, MAX_HAND_NUMBER),
      emotion: EMOTIONS.has(raw?.emotion) ? raw.emotion : "calm",
      streak: cleanInteger(raw?.streak, -9999, 9999),
    };
  }

  function normalizePayload(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (Number(raw.schemaVersion) !== CONFIG.schemaVersion) return null;
    if (raw.mode !== TOURNAMENT_MODE) return null;

    const allowedNames = knownAiNames();
    const seats = [];
    const seenSeats = new Set();
    for (const rawSeat of Array.isArray(raw.seats) ? raw.seats : []) {
      const seat = normalizeSeat(rawSeat, allowedNames);
      if (!seat || seenSeats.has(seat.name)) continue;
      seenSeats.add(seat.name);
      seats.push(seat);
    }

    const tournamentRaw = raw.tournament;
    if (!tournamentRaw || typeof tournamentRaw !== "object" || Array.isArray(tournamentRaw)) return null;
    const result = tournamentRaw.result === "win" || tournamentRaw.result === "loss"
      ? tournamentRaw.result
      : null;

    return {
      schemaVersion: CONFIG.schemaVersion,
      mode: TOURNAMENT_MODE,
      savedAt: cleanText(raw.savedAt, 40) || new Date().toISOString(),
      handNumber: cleanInteger(raw.handNumber, 0, MAX_HAND_NUMBER),
      hero: {
        stack: cleanInteger(raw.hero?.stack, 0, MAX_STACK),
        wins: cleanInteger(raw.hero?.wins, 0, MAX_HAND_NUMBER),
      },
      seats,
      tournament: {
        active: true,
        started: Boolean(tournamentRaw.started),
        queue: uniqueNames(tournamentRaw.queue, allowedNames),
        appeared: uniqueNames(tournamentRaw.appeared, allowedNames),
        eliminated: uniqueNames(tournamentRaw.eliminated, allowedNames),
        finished: Boolean(tournamentRaw.finished),
        result,
        lastEliminated: allowedNames.has(cleanText(tournamentRaw.lastEliminated, 40))
          ? cleanText(tournamentRaw.lastEliminated, 40)
          : "",
        lastOpponent: allowedNames.has(cleanText(tournamentRaw.lastOpponent, 40))
          ? cleanText(tournamentRaw.lastOpponent, 40)
          : "",
        dealerCursor: cleanInteger(tournamentRaw.dealerCursor, -1, 1000),
      },
    };
  }

  function exportCurrentSave() {
    if (typeof state !== "object") return null;
    if (!window.TournamentMode?.isActive?.() || state.gameMode !== TOURNAMENT_MODE) return null;
    if (!state.handOver || !state.tournament?.active) return null;

    const hero = state.players?.find(player => player?.isHuman) || state.players?.[0];
    if (!hero) return null;

    return normalizePayload({
      schemaVersion: CONFIG.schemaVersion,
      mode: TOURNAMENT_MODE,
      savedAt: new Date().toISOString(),
      handNumber: state.handNumber,
      hero: {
        stack: hero.stack,
        wins: hero.wins,
      },
      seats: (state.players || [])
        .filter(player => player && !player.isHuman)
        .map(player => ({
          name: player.name,
          stack: player.stack,
          wins: player.wins,
          emotion: player.emotion,
          streak: player.streak,
        })),
      tournament: {
        active: true,
        started: state.tournament.started,
        queue: state.tournament.queue,
        appeared: state.tournament.appeared,
        eliminated: state.tournament.eliminated,
        finished: state.tournament.finished,
        result: state.tournament.result,
        lastEliminated: state.tournament.lastEliminated,
        lastOpponent: state.tournament.lastOpponent,
        dealerCursor: state.tournament.dealerCursor,
      },
    });
  }

  function localKey(userId) {
    return `${CONFIG.localPrefix}${cleanText(userId, 80)}`;
  }

  function writeLocalSave(userId, payload) {
    if (!userId || !payload) return false;
    try {
      localStorage.setItem(localKey(userId), JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readLocalSave(userId) {
    if (!userId) return null;
    try {
      return normalizePayload(JSON.parse(localStorage.getItem(localKey(userId)) || "null"));
    } catch (_) {
      return null;
    }
  }

  function removeLocalSave(userId) {
    if (!userId) return;
    try {
      localStorage.removeItem(localKey(userId));
    } catch (_) {
      // Cloud deletion can still succeed when local storage is blocked.
    }
  }

  async function createClient() {
    if (window.__SUPABASE_CLOUD_SAVE_TEST_CLIENT__) {
      return window.__SUPABASE_CLOUD_SAVE_TEST_CLIENT__;
    }
    if (window.__SUPABASE_AUTH_TEST_CLIENT__) {
      if (typeof window.__SUPABASE_AUTH_TEST_CLIENT__.from === "function") {
        return window.__SUPABASE_AUTH_TEST_CLIENT__;
      }
      throw new Error("cloud-save-test-client-unavailable");
    }
    const module = await import(CONFIG.clientModuleUrl);
    if (typeof module.createClient !== "function") throw new Error("雲端存檔模組載入失敗");
    return module.createClient(CONFIG.projectUrl, CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function ensureClient() {
    if (!clientPromise) {
      clientPromise = createClient().catch(error => {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  async function authenticatedContext() {
    const authStatus = window.TexasHoldemAuth?.status?.();
    if (!authStatus?.signedIn) return null;
    const client = await ensureClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data?.session?.user;
    return user?.id ? { client, user } : null;
  }

  function chooseNewestSave(remote, local) {
    if (!remote) return { payload: local, source: local ? "local" : "none" };
    if (!local) return { payload: remote, source: "cloud" };
    const remoteTime = Date.parse(remote.savedAt || "") || 0;
    const localTime = Date.parse(local.savedAt || "") || 0;
    return localTime > remoteTime
      ? { payload: local, source: "local" }
      : { payload: remote, source: "cloud" };
  }

  async function loadAvailableSave() {
    const context = await authenticatedContext();
    if (!context) {
      remoteSave = null;
      remoteUpdatedAt = "";
      saveSource = "none";
      statusText = "登入後可使用淘汰賽雲端存檔。";
      statusTone = "neutral";
      renderPanel();
      return null;
    }

    const local = readLocalSave(context.user.id);
    busy = true;
    statusText = "正在讀取淘汰賽存檔…";
    statusTone = "pending";
    renderPanel();

    try {
      const { data, error } = await context.client
        .from(CONFIG.table)
        .select("save_version,payload,updated_at")
        .eq("user_id", context.user.id)
        .maybeSingle();
      if (error) throw error;

      const cloud = normalizePayload(data?.payload);
      const chosen = chooseNewestSave(cloud, local);
      remoteSave = chosen.payload;
      saveSource = chosen.source;
      remoteUpdatedAt = cleanText(data?.updated_at, 40) || remoteSave?.savedAt || "";
      if (remoteSave) {
        writeLocalSave(context.user.id, remoteSave);
        statusText = chosen.source === "local"
          ? "已找到較新的本機備份，可繼續淘汰賽。"
          : "已找到雲端淘汰賽存檔。";
        statusTone = "success";
      } else {
        statusText = "目前沒有淘汰賽存檔。";
        statusTone = "neutral";
      }
      return remoteSave;
    } catch (error) {
      remoteSave = local;
      saveSource = local ? "local" : "none";
      remoteUpdatedAt = local?.savedAt || "";
      statusText = local
        ? "雲端暫時無法讀取，已改用本機備份。"
        : "雲端存檔暫時無法使用，牌局不受影響。";
      statusTone = local ? "pending" : "error";
      return local;
    } finally {
      busy = false;
      renderPanel();
    }
  }

  async function savePayload(payload, reason = "auto") {
    const normalized = normalizePayload(payload);
    if (!normalized) return null;

    const context = await authenticatedContext();
    if (!context) {
      statusText = "請先使用 Google 登入，再儲存淘汰賽。";
      statusTone = "pending";
      renderPanel();
      return null;
    }

    writeLocalSave(context.user.id, normalized);
    remoteSave = normalized;
    saveSource = "local";
    remoteUpdatedAt = normalized.savedAt;
    busy = true;
    statusText = reason === "pause" ? "正在暫停並儲存…" : "正在儲存本手淘汰賽進度…";
    statusTone = "pending";
    renderPanel();

    try {
      const { error } = await context.client.from(CONFIG.table).upsert({
        user_id: context.user.id,
        save_version: CONFIG.schemaVersion,
        payload: normalized,
        updated_at: normalized.savedAt,
      }, { onConflict: "user_id" });
      if (error) throw error;
      saveSource = "cloud";
      statusText = reason === "pause"
        ? "已暫停並同步到雲端。"
        : "本手進度已同步到雲端。";
      statusTone = "success";
      return normalized;
    } catch (error) {
      statusText = "雲端同步失敗，已保留本機備份。";
      statusTone = "pending";
      return normalized;
    } finally {
      busy = false;
      renderPanel();
    }
  }

  async function saveCurrent(reason = "manual") {
    const payload = exportCurrentSave();
    if (!payload) {
      statusText = window.TournamentMode?.isActive?.()
        ? "目前這手牌尚未結束；只會在兩手牌之間儲存。"
        : "只有淘汰賽模式可以建立雲端存檔。";
      statusTone = "pending";
      renderPanel();
      return null;
    }
    return savePayload(payload, reason);
  }

  function minimalPlayerFromSeat(seat, position) {
    const profile = (typeof AI_ROSTER === "object" && Array.isArray(AI_ROSTER)
      ? AI_ROSTER.find(candidate => candidate?.name === seat.name)
      : null) || (seat.name === "Gemini" ? window.GeminiFinalBoss?.profile : null);
    if (!profile) return null;
    return {
      ...profile,
      isHuman: false,
      cards: [],
      stack: seat.stack,
      bet: 0,
      totalContribution: 0,
      folded: false,
      allIn: seat.stack <= 0,
      hasActed: false,
      raiseLocked: false,
      status: "等待續玩",
      position,
      wins: seat.wins,
      emotion: seat.emotion,
      streak: seat.streak,
      dialogue: "",
      dialogueTone: "",
      lastDialogueAt: 0,
    };
  }

  function restoreSave(payload = remoteSave) {
    const normalized = normalizePayload(payload);
    if (!normalized || typeof state !== "object" || typeof startHand !== "function") {
      statusText = "這份存檔無法恢復。";
      statusTone = "error";
      renderPanel();
      return false;
    }

    Audio?.cleanup?.();
    window.AiTimingController?.clear?.();
    clearAutoNewHandTimer?.();
    clearDialogueTimers?.();

    state.autoNewHand = false;
    state.sessionEnded = false;
    state.gameMode = TOURNAMENT_MODE;
    state.handNumber = normalized.handNumber;
    state.blindLevel = blindLevelForHand(Math.max(1, normalized.handNumber));
    state.dealerIndex = 0;
    state.deck = [];
    state.board = [];
    state.pot = 0;
    state.currentBet = 0;
    state.street = "結算";
    state.handOver = true;
    state.winners = [];
    state.waitingForHuman = false;
    state.currentActorIndex = 0;
    state.selectedProfilePosition = null;
    state.tournament = {
      active: true,
      started: normalized.tournament.started,
      queue: [...normalized.tournament.queue],
      appeared: [...normalized.tournament.appeared],
      eliminated: [...normalized.tournament.eliminated],
      finished: normalized.tournament.finished,
      result: normalized.tournament.result,
      lastEliminated: normalized.tournament.lastEliminated,
      lastOpponent: normalized.tournament.lastOpponent,
      dealerCursor: normalized.tournament.dealerCursor,
    };

    const heroName = window.TexasHoldemAuth?.playerName?.() || "Owl";
    const hero = {
      name: heroName,
      isHuman: true,
      emoji: "🦉",
      cards: [],
      stack: normalized.hero.stack,
      bet: 0,
      totalContribution: 0,
      folded: false,
      allIn: normalized.hero.stack <= 0,
      hasActed: false,
      raiseLocked: false,
      status: "等待續玩",
      position: 0,
      wins: normalized.hero.wins,
      dialogue: "",
      dialogueTone: "",
      lastDialogueAt: 0,
    };
    state.players = [
      hero,
      ...normalized.seats
        .map((seat, index) => minimalPlayerFromSeat(seat, index + 1))
        .filter(Boolean),
    ];

    window.TournamentMode?.refresh?.();
    closeAccountOverlay();

    if (normalized.tournament.finished) {
      render?.();
      maybeShowSessionSummary?.();
      statusText = "已恢復完成的淘汰賽紀錄。";
      statusTone = "success";
      return true;
    }

    statusText = `已恢復第 ${normalized.handNumber} 手結束時的進度，正在發下一手。`;
    statusTone = "success";
    startHand();
    window.TexasHoldemAuth?.refresh?.();
    return true;
  }

  function closeAccountOverlay() {
    window.TexasHoldemAuth?.closeAccount?.();
  }

  async function requestPauseAndSave() {
    if (!window.TournamentMode?.isActive?.()) {
      statusText = "請先進入淘汰賽模式。";
      statusTone = "pending";
      renderPanel();
      return false;
    }

    if (state.handOver) {
      state.autoNewHand = false;
      clearAutoNewHandTimer?.();
      render?.();
      await saveCurrent("pause");
      return true;
    }

    pauseRequested = true;
    statusText = "已安排暫停：這手結束後會自動儲存，不會保存進行中的牌。";
    statusTone = "pending";
    renderPanel();
    return true;
  }

  async function deleteSaveAndRestart() {
    const now = Date.now();
    if (deleteArmedUntil < now) {
      deleteArmedUntil = now + 5000;
      statusText = "再按一次「刪除並重開」確認刪除存檔。";
      statusTone = "pending";
      renderPanel();
      return false;
    }
    deleteArmedUntil = 0;

    const context = await authenticatedContext();
    if (!context) return false;
    busy = true;
    statusText = "正在刪除淘汰賽存檔…";
    statusTone = "pending";
    renderPanel();

    try {
      const { error } = await context.client
        .from(CONFIG.table)
        .delete()
        .eq("user_id", context.user.id);
      if (error) throw error;
      removeLocalSave(context.user.id);
      remoteSave = null;
      remoteUpdatedAt = "";
      saveSource = "none";
      pauseRequested = false;
      state.autoNewHand = false;
      clearAutoNewHandTimer?.();
      window.TournamentMode?.setMode?.(TOURNAMENT_MODE, {
        restart: true,
        persist: false,
      });
      statusText = "存檔已刪除，淘汰賽已重新開始。";
      statusTone = "success";
      closeAccountOverlay();
      return true;
    } catch (error) {
      statusText = "刪除失敗，原存檔仍保留。";
      statusTone = "error";
      return false;
    } finally {
      busy = false;
      renderPanel();
    }
  }

  function installStylesheet() {
    if (document.querySelector('link[data-tournament-cloud-save-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "js/tournament-cloud-save.css?v=tournament-cloud-save-v1";
    link.dataset.tournamentCloudSaveStyle = "true";
    document.head.appendChild(link);
  }

  function mountPanel() {
    const signedInView = document.querySelector("#authSignedInView");
    if (!signedInView) return null;

    let panel = document.querySelector("#tournamentCloudSavePanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "tournamentCloudSavePanel";
      panel.className = "tournament-cloud-save-panel";
      panel.setAttribute("aria-label", "淘汰賽雲端存檔");
      panel.innerHTML = `
        <div class="tournament-save-head">
          <div><span>TOURNAMENT SAVE</span><strong>淘汰賽雲端存檔</strong></div>
          <em id="tournamentSaveSource">尚無存檔</em>
        </div>
        <p id="tournamentSaveMeta" class="tournament-save-meta">每手結束後自動儲存，不保存進行中的底牌。</p>
        <div class="tournament-save-actions">
          <button id="tournamentResumeButton" type="button">▶ 繼續淘汰賽</button>
          <button id="tournamentPauseSaveButton" type="button">⏸ 暫停並儲存</button>
          <button id="tournamentDeleteSaveButton" class="ghost-button" type="button">🗑 刪除並重開</button>
        </div>
        <p id="tournamentSaveStatus" class="tournament-save-status" aria-live="polite"></p>`;

      const signOutButton = signedInView.querySelector("#googleSignOutButton");
      signedInView.insertBefore(panel, signOutButton || null);
      panel.querySelector("#tournamentResumeButton")?.addEventListener("click", () => restoreSave());
      panel.querySelector("#tournamentPauseSaveButton")?.addEventListener("click", requestPauseAndSave);
      panel.querySelector("#tournamentDeleteSaveButton")?.addEventListener("click", deleteSaveAndRestart);
    }
    return panel;
  }

  function renderPanel() {
    const panel = mountPanel();
    if (!panel) return;
    const signedIn = Boolean(window.TexasHoldemAuth?.status?.().signedIn);
    panel.hidden = !signedIn;

    const source = panel.querySelector("#tournamentSaveSource");
    const meta = panel.querySelector("#tournamentSaveMeta");
    const status = panel.querySelector("#tournamentSaveStatus");
    const resume = panel.querySelector("#tournamentResumeButton");
    const pause = panel.querySelector("#tournamentPauseSaveButton");
    const remove = panel.querySelector("#tournamentDeleteSaveButton");

    if (source) {
      source.dataset.source = saveSource;
      source.textContent = remoteSave
        ? (saveSource === "cloud" ? "雲端已同步" : "本機備份")
        : "尚無存檔";
    }
    if (meta) {
      meta.textContent = remoteSave
        ? `第 ${remoteSave.handNumber} 手結束 · 已淘汰 ${remoteSave.tournament.eliminated.length} 位 · ${formatDate(remoteUpdatedAt || remoteSave.savedAt)}`
        : "每手結束後自動儲存，不保存進行中的底牌。";
    }
    if (status) {
      status.textContent = statusText;
      status.dataset.tone = statusTone;
    }
    if (resume) resume.disabled = busy || !remoteSave;
    if (pause) pause.disabled = busy || !window.TournamentMode?.isActive?.();
    if (remove) remove.disabled = busy || !remoteSave;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "時間待確認";
    return new Intl.DateTimeFormat("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function settlementKey() {
    if (typeof state !== "object" || !state.handOver || !window.TournamentMode?.isActive?.()) return "";
    return `${state.handNumber}:${state.tournament?.eliminated?.length || 0}:${state.tournament?.finished ? "finished" : "active"}`;
  }

  async function observeSettlement() {
    const key = settlementKey();
    if (!key) {
      lastSettlementKey = "";
      return;
    }
    if (key === lastSettlementKey) return;
    lastSettlementKey = key;

    if (pauseRequested) {
      pauseRequested = false;
      state.autoNewHand = false;
      clearAutoNewHandTimer?.();
      render?.();
      await saveCurrent("pause");
      return;
    }
    await saveCurrent("auto");
  }

  async function syncAuth() {
    const status = window.TexasHoldemAuth?.status?.();
    const signedIn = Boolean(status?.signedIn);
    if (!signedIn) {
      if (lastAuthUserId) {
        lastAuthUserId = "";
        remoteSave = null;
        saveSource = "none";
        remoteUpdatedAt = "";
      }
      renderPanel();
      return;
    }

    try {
      const context = await authenticatedContext();
      const userId = context?.user?.id || "";
      if (userId && userId !== lastAuthUserId) {
        lastAuthUserId = userId;
        await loadAvailableSave();
      }
    } catch (_) {
      statusText = "登入已完成，但雲端存檔暫時無法連線。";
      statusTone = "pending";
      renderPanel();
    }
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      mountPanel();
      renderPanel();
    });
  }

  installStylesheet();
  mountPanel();
  renderPanel();

  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });

  window.setInterval(() => {
    syncAuth();
    observeSettlement();
  }, 250);

  window.TournamentCloudSave = {
    version: "1.0.0",
    exportCurrentSave,
    normalizePayload,
    load: loadAvailableSave,
    save: saveCurrent,
    pauseAndSave: requestPauseAndSave,
    restore: restoreSave,
    deleteAndRestart: deleteSaveAndRestart,
    status() {
      return {
        signedIn: Boolean(window.TexasHoldemAuth?.status?.().signedIn),
        hasSave: Boolean(remoteSave),
        source: saveSource,
        busy,
        pauseRequested,
        handNumber: remoteSave?.handNumber || 0,
        lastMessage: statusText,
      };
    },
    refresh() {
      scheduleSync();
      syncAuth();
    },
  };
})();
