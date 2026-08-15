// Gate 8 manual-preview runtime for the accepted PR #210 demotion candidate.
// Preview-only: initial bankroll 2,000; 1.00x total-wealth promotion remains unchanged;
// after bust, fall back to the highest affordable lower 100BB table when current re-entry is unaffordable.
(() => {
  "use strict";

  if (window.LongSessionModeV1?.version) return;

  const VERSION = "1.0.0";
  const TABLES = Object.freeze([
    Object.freeze({ index: 0, key: "table-1", small: 10, big: 20, entry: 2000 }),
    Object.freeze({ index: 1, key: "table-2", small: 20, big: 40, entry: 4000 }),
    Object.freeze({ index: 2, key: "table-3", small: 50, big: 100, entry: 10000 }),
    Object.freeze({ index: 3, key: "table-4", small: 100, big: 200, entry: 20000 }),
    Object.freeze({ index: 4, key: "table-5", small: 200, big: 400, entry: 40000 }),
  ]);
  const TABLE_AI_COUNT = 6;
  const INSTALL_RETRY_MS = 25;
  const INSTALL_RETRY_LIMIT = 400;
  const ROOT_ID = "longSessionDecisionRoot";
  const BUTTON_ID = "longSessionModeButton";
  const BADGE_ID = "longSessionStatusBadge";

  let installed = false;
  let retryCount = 0;
  let enabled = false;
  let pendingEnable = false;
  let pendingDisable = false;
  let preparingFreshTable = false;
  let session = null;
  let activeEnvelope = null;
  let observer = null;
  let originalBlindLevelForHand = null;
  let originalBuildNextAiSeats = null;
  let originalStartHand = null;
  let originalMaybeShowSessionSummary = null;

  function finiteChips(value, label) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`${label} must be >= 0`);
    return amount;
  }

  function tableAt(index) {
    const table = TABLES[Number(index)];
    if (!table || table.index !== Number(index)) throw new RangeError(`Unknown Long Session table: ${index}`);
    return table;
  }

  function tableLevel(table = tableAt(session?.tableIndex || 0)) {
    return {
      level: table.index + 1,
      small: table.small,
      big: table.big,
      buyIn: table.entry,
      longSession: true,
      longSessionTable: table.key,
    };
  }

  function createSession({ tableIndex = 0, bankroll = 0, tableStack } = {}) {
    const table = tableAt(tableIndex);
    const stack = tableStack == null ? table.entry : finiteChips(tableStack, "tableStack");
    const bank = finiteChips(bankroll, "bankroll");
    return {
      version: 1,
      status: "active",
      tableIndex: table.index,
      bankroll: bank,
      tableStack: stack,
      totalWealth: bank + stack,
    };
  }

  function cloneSession(value = session) {
    return value ? { ...value } : null;
  }

  function isRuntimeActive() {
    return Boolean(enabled && state?.gameMode !== "tournament" && !window.TournamentMode?.isActive?.());
  }

  function ordinaryProfiles() {
    const profiles = (Array.isArray(AI_ROSTER) ? AI_ROSTER : [])
      .filter(profile => profile?.name && profile.name !== "Gemini")
      .slice(0, TABLE_AI_COUNT);
    if (profiles.length !== TABLE_AI_COUNT) throw new Error("Long Session requires six ordinary AI profiles");
    return profiles;
  }

  function freshAiSeats(table = tableAt(session?.tableIndex || 0)) {
    return ordinaryProfiles().map(profile => ({
      profile,
      stack: table.entry,
      wins: 0,
      emotion: "fresh",
      streak: 0,
      replaced: null,
      longSessionEntry: true,
    }));
  }

  function captureCompletedHandPublicState(runtimeState = state) {
    if (!runtimeState || typeof runtimeState !== "object") throw new TypeError("runtimeState is required");
    const players = Array.isArray(runtimeState.players) ? runtimeState.players : [];
    const hero = players.find(player => player?.isHuman) || players[0] || null;
    const opponents = players.filter(player => player && player !== hero && !player.isHuman);
    return {
      gameMode: runtimeState.gameMode === "tournament" ? "tournament" : "normal",
      handOver: runtimeState.handOver === true,
      handNumber: Math.max(0, Number(runtimeState.handNumber) || 0),
      heroPresent: Boolean(hero),
      heroStack: hero ? finiteChips(hero.stack, "heroStack") : 0,
      opponentStacks: opponents.map(player => finiteChips(player.stack, "opponentStack")),
    };
  }

  function propose({ completedHand, inputSession = session } = {}) {
    if (!completedHand || !inputSession) throw new TypeError("completedHand and session are required");
    const current = tableAt(inputSession.tableIndex);
    const normalized = createSession({
      tableIndex: current.index,
      bankroll: inputSession.bankroll,
      tableStack: inputSession.tableStack,
    });
    const blocked = reason => ({ status: "blocked", reason, completedHand, inputSession: normalized, proposal: null });
    if (completedHand.gameMode !== "normal") return blocked("non-normal-mode");
    if (!completedHand.handOver) return blocked("hand-still-active");
    if (!completedHand.heroPresent) return blocked("hero-missing");

    const heroStack = finiteChips(completedHand.heroStack, "heroStack");
    const observedTotalWealth = normalized.bankroll + heroStack;
    let transition = "stay";
    let target = current;
    let proposedBankroll = normalized.bankroll;
    let proposedTableStack = heroStack;

    if (heroStack <= 0) {
      if (normalized.bankroll >= current.entry) {
        transition = "reentry";
        proposedBankroll = normalized.bankroll - current.entry;
        proposedTableStack = current.entry;
      } else {
        const fallback = [...TABLES]
          .slice(0, current.index)
          .reverse()
          .find(table => normalized.bankroll >= table.entry) || null;
        if (fallback) {
          transition = "move-down";
          target = fallback;
          proposedBankroll = normalized.bankroll - fallback.entry;
          proposedTableStack = fallback.entry;
        } else {
          transition = "session-ended";
          proposedTableStack = 0;
        }
      }
    } else if (current.index < TABLES.length - 1) {
      const candidate = tableAt(current.index + 1);
      if (observedTotalWealth >= candidate.entry) {
        transition = "move-up";
        target = candidate;
        proposedBankroll = observedTotalWealth - candidate.entry;
        proposedTableStack = candidate.entry;
      }
    }

    const proposedTotalWealth = proposedBankroll + proposedTableStack;
    if (proposedTotalWealth !== observedTotalWealth) {
      throw new Error(`Long Session wealth drift: ${observedTotalWealth} -> ${proposedTotalWealth}`);
    }

    return {
      status: "proposed",
      reason: transition,
      completedHand,
      inputSession: normalized,
      proposal: {
        transition,
        currentTable: { ...current },
        targetTable: { ...target },
        observedHeroStack: heroStack,
        observedTotalWealth,
        proposedBankroll,
        proposedTableStack,
        proposedTotalWealth,
      },
    };
  }

  function commit(envelope, action = "primary") {
    const proposal = envelope?.proposal;
    if (!proposal) throw new TypeError("proposal is required");
    if (!["primary", "secondary", "auto"].includes(action)) throw new RangeError(`Unknown action: ${action}`);

    if (proposal.transition === "stay" || (proposal.transition === "move-up" && action === "secondary")) {
      return {
        action,
        transition: "stay",
        status: "active",
        session: createSession({
          tableIndex: proposal.currentTable.index,
          bankroll: envelope.inputSession.bankroll,
          tableStack: proposal.observedHeroStack,
        }),
      };
    }

    if ((proposal.transition === "reentry" || proposal.transition === "move-down") && action === "secondary") {
      return {
        action,
        transition: "paused",
        status: "paused",
        session: {
          version: 1,
          status: "paused",
          tableIndex: proposal.currentTable.index,
          bankroll: envelope.inputSession.bankroll,
          tableStack: 0,
          totalWealth: envelope.inputSession.bankroll,
        },
      };
    }

    if (proposal.transition === "session-ended") {
      return {
        action,
        transition: "session-ended",
        status: "ended",
        session: {
          version: 1,
          status: "ended",
          tableIndex: proposal.currentTable.index,
          bankroll: envelope.inputSession.bankroll,
          tableStack: 0,
          totalWealth: envelope.inputSession.bankroll,
        },
      };
    }

    if (action === "auto") throw new RangeError(`${proposal.transition} requires an explicit player decision`);
    return {
      action,
      transition: proposal.transition,
      status: "active",
      session: createSession({
        tableIndex: proposal.targetTable.index,
        bankroll: proposal.proposedBankroll,
        tableStack: proposal.proposedTableStack,
      }),
    };
  }

  function destroyDecisionUi() {
    document.getElementById(ROOT_ID)?.remove();
    activeEnvelope = null;
  }

  function decisionCopy(proposal) {
    if (proposal.transition === "move-up") {
      return {
        title: "Long Session 升桌",
        body: `總資產已足夠進入 ${proposal.targetTable.small}/${proposal.targetTable.big}。升桌會以固定 100BB 開始，剩餘籌碼放入資金庫。`,
        primary: `升級到 ${proposal.targetTable.small}/${proposal.targetTable.big}`,
        secondary: `留在 ${proposal.currentTable.small}/${proposal.currentTable.big}`,
      };
    }
    if (proposal.transition === "move-down") {
      return {
        title: "Long Session 降桌",
        body: `本桌籌碼歸零，資金庫不足以重新進入 ${proposal.currentTable.small}/${proposal.currentTable.big}，但可回到 ${proposal.targetTable.small}/${proposal.targetTable.big} 以固定 100BB 繼續。`,
        primary: `降到 ${proposal.targetTable.small}/${proposal.targetTable.big}`,
        secondary: "暫停 Long Session",
      };
    }
    if (proposal.transition === "reentry") {
      return {
        title: "Long Session 重新買入",
        body: `本桌籌碼歸零。資金庫足夠用固定 100BB 重新進入 ${proposal.currentTable.small}/${proposal.currentTable.big}。`,
        primary: `重新買入 ${proposal.currentTable.entry}`,
        secondary: "暫不重新買入",
      };
    }
    return {
      title: "Long Session 結束",
      body: "本桌籌碼已歸零，而且資金庫不足以支付任何可用牌桌的 100BB 標準買入。",
      primary: "回到一般模式",
      secondary: "保留結果",
    };
  }

  function renderDecision(envelope) {
    destroyDecisionUi();
    const proposal = envelope?.proposal;
    if (!proposal || proposal.transition === "stay") return false;
    activeEnvelope = envelope;
    const copy = decisionCopy(proposal);
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.className = "long-session-decision-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "longSessionDecisionTitle");
    const aiEntry = proposal.transition === "session-ended" ? 0 : proposal.targetTable.entry;
    root.innerHTML = `
      <div class="long-session-decision-card">
        <p class="eyebrow">Long Session · Gate 8 Preview</p>
        <h2 id="longSessionDecisionTitle">${copy.title}</h2>
        <p>${copy.body}</p>
        <div class="long-session-decision-stats">
          <span><em>總資產</em><strong>${proposal.observedTotalWealth}</strong></span>
          <span><em>資金庫</em><strong>${proposal.proposedBankroll}</strong></span>
          <span><em>標準入桌</em><strong>${aiEntry || "—"}</strong></span>
          <span><em>AI 入桌</em><strong>${aiEntry ? `${aiEntry} · 100BB` : "—"}</strong></span>
        </div>
        <div class="long-session-decision-actions">
          <button type="button" data-long-session-action="secondary">${copy.secondary}</button>
          <button type="button" data-long-session-action="primary">${copy.primary}</button>
        </div>
      </div>
    `;
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-long-session-action]");
      if (!button) return;
      resolveDecision(button.dataset.longSessionAction);
    });
    document.body.appendChild(root);
    root.querySelector('[data-long-session-action="primary"]')?.focus({ preventScroll: true });
    return true;
  }

  function startCommittedHand({ fresh = false, message = "" } = {}) {
    if (!isRuntimeActive() || !session || session.status !== "active") return false;
    preparingFreshTable = fresh;
    if (message) log?.(`🪜 ${message}`);
    try {
      startHand();
    } finally {
      preparingFreshTable = false;
    }
    syncUi();
    return true;
  }

  function resolveDecision(action) {
    if (!activeEnvelope?.proposal) return false;
    const result = commit(activeEnvelope, action);
    const transition = activeEnvelope.proposal.transition;
    session = result.session;
    destroyDecisionUi();

    if (transition === "session-ended") {
      if (action === "primary") return disableNow({ restart: true });
      syncUi();
      return true;
    }

    if (result.status === "paused") {
      clearAutoNewHandTimer?.();
      announce?.("Long Session 已暫停");
      syncUi();
      return true;
    }

    if (result.transition === "move-up") {
      const table = tableAt(session.tableIndex);
      announce?.(`Long Session 升桌 ${table.small} / ${table.big}`);
      return startCommittedHand({ fresh: true, message: `升桌到 ${table.small}/${table.big}，Hero 與 6 位 AI 皆以 100BB 入桌。` });
    }

    if (result.transition === "move-down") {
      const table = tableAt(session.tableIndex);
      announce?.(`Long Session 降桌 ${table.small} / ${table.big}`);
      return startCommittedHand({ fresh: true, message: `降桌到 ${table.small}/${table.big}，Hero 與 6 位 AI 皆以 100BB 入桌。` });
    }

    if (transition === "reentry") {
      const table = tableAt(session.tableIndex);
      announce?.("Long Session 重新買入");
      return startCommittedHand({ fresh: true, message: `資金庫支付 ${table.entry}，重新以 100BB 入桌。` });
    }

    announce?.("Long Session 留在目前牌桌");
    return startCommittedHand({ fresh: false });
  }

  function handleCompletedHand() {
    if (pendingEnable && state?.gameMode !== "tournament") {
      pendingEnable = false;
      window.setTimeout(() => enableNow({ restart: true }), 0);
      return true;
    }

    if (pendingDisable && enabled) {
      pendingDisable = false;
      window.setTimeout(() => disableNow({ restart: true }), 0);
      return true;
    }

    if (!isRuntimeActive() || !session || session.status !== "active") return false;
    const completedHand = captureCompletedHandPublicState(state);
    const envelope = propose({ completedHand, inputSession: session });
    if (envelope.status !== "proposed") return false;

    if (envelope.proposal.transition === "stay") {
      session = commit(envelope, "auto").session;
      syncUi();
      return false;
    }

    clearAutoNewHandTimer?.();
    renderDecision(envelope);
    syncUi();
    return true;
  }

  function enableNow({ restart = true } = {}) {
    if (window.TournamentMode?.isActive?.()) {
      window.TournamentMode.setMode("normal", { restart: false, persist: false });
    }
    window.GeminiFinalBoss?.disable?.({ restart: false, persist: true });
    enabled = true;
    pendingEnable = false;
    pendingDisable = false;
    session = createSession({ tableIndex: 0, bankroll: 2000, tableStack: TABLES[0].entry });
    destroyDecisionUi();
    document.body.classList.add("is-long-session-mode");
    if (restart) {
      resetGameSession();
      announce?.("Long Session Gate 8：10 / 20，100BB + Bank 2,000");
      startCommittedHand({ fresh: true, message: "開始 Gate 8 Preview：10/20，Hero 與 6 位 AI 皆以 2,000（100BB）入桌；資金庫另有 2,000。" });
    }
    syncUi();
    return true;
  }

  function requestEnable() {
    if (enabled || pendingEnable) return true;
    if (window.TournamentMode?.isActive?.()) {
      announce?.("請先結束淘汰賽再開始 Long Session");
      return false;
    }
    if (state?.players?.length && !state.handOver) {
      pendingEnable = true;
      announce?.("Long Session 將於本手結束後開始");
      syncUi();
      return true;
    }
    return enableNow({ restart: true });
  }

  function disableNow({ restart = true } = {}) {
    enabled = false;
    pendingEnable = false;
    pendingDisable = false;
    preparingFreshTable = false;
    session = null;
    destroyDecisionUi();
    document.body.classList.remove("is-long-session-mode");
    if (restart) {
      resetGameSession();
      announce?.("已回到一般模式");
      startHand();
    }
    syncUi();
    return true;
  }

  function requestDisable() {
    if (!enabled && !pendingEnable) return true;
    if (pendingEnable && !enabled) {
      pendingEnable = false;
      syncUi();
      announce?.("已取消 Long Session");
      return true;
    }
    if (state?.players?.length && !state.handOver) {
      pendingDisable = true;
      announce?.("Long Session 將於本手結束後關閉");
      syncUi();
      return true;
    }
    return disableNow({ restart: true });
  }

  function toggle() {
    if (enabled || pendingEnable) return requestDisable();
    return requestEnable();
  }

  function installStyles() {
    if (document.getElementById("longSessionModeStyles")) return;
    const style = document.createElement("style");
    style.id = "longSessionModeStyles";
    style.textContent = `
      #${BUTTON_ID}[aria-pressed="true"] { border-color:rgba(96,214,194,.62); background:rgba(48,118,108,.22); color:#cafff5; box-shadow:0 0 18px rgba(96,214,194,.15); }
      #${BADGE_ID} { border-color:rgba(96,214,194,.36); background:rgba(30,89,82,.3); }
      #${BADGE_ID} strong { color:#cafff5; }
      #${BADGE_ID}[hidden] { display:none; }
      .long-session-decision-overlay { position:fixed; inset:0; z-index:2147483002; display:grid; place-items:center; padding:18px; background:rgba(0,0,0,.66); backdrop-filter:blur(6px); }
      .long-session-decision-card { width:min(560px,94vw); padding:20px; border:1px solid rgba(96,214,194,.48); border-radius:18px; background:#0c171d; color:#f5f2e9; box-shadow:0 24px 70px rgba(0,0,0,.46); }
      .long-session-decision-card h2 { margin:4px 0 8px; font-size:clamp(1.35rem,4vw,1.8rem); }
      .long-session-decision-card > p:not(.eyebrow) { margin:0; color:#b8c8c9; line-height:1.55; }
      .long-session-decision-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:16px; }
      .long-session-decision-stats span { display:grid; gap:3px; padding:10px; border:1px solid rgba(255,255,255,.1); border-radius:11px; background:rgba(255,255,255,.04); }
      .long-session-decision-stats em { color:#9fb0b2; font-size:.72rem; font-style:normal; }
      .long-session-decision-stats strong { font-size:.95rem; }
      .long-session-decision-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
      .long-session-decision-actions button { min-height:46px; border:1px solid rgba(255,255,255,.18); border-radius:11px; background:rgba(255,255,255,.07); color:inherit; font:inherit; cursor:pointer; }
      .long-session-decision-actions button[data-long-session-action="primary"] { border-color:rgba(96,214,194,.58); background:rgba(48,118,108,.3); color:#d9fff8; }
      @media (max-width:640px) { .long-session-decision-stats,.long-session-decision-actions { grid-template-columns:1fr; } .long-session-decision-card { max-height:92vh; overflow:auto; } }
    `;
    document.head.appendChild(style);
  }

  function mountButton() {
    const settingsPanel = document.querySelector("#settingsMenuPanel");
    const fallback = document.querySelector(".top-bar-actions");
    const target = settingsPanel || fallback;
    if (!target) return;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.addEventListener("click", toggle);
    }
    button.className = settingsPanel ? "ghost-button topbar-settings-item" : "ghost-button tool-button";
    if (button.parentElement !== target) target.appendChild(button);
    button.setAttribute("aria-pressed", String(enabled));
    const label = pendingEnable
      ? "🪜 Long Session（本手後開始）"
      : pendingDisable
        ? "🪜 Long Session（本手後關閉）"
        : enabled
          ? "🪜 結束 Long Session"
          : "🪜 Long Session · Gate 8";
    if (button.textContent !== label) button.textContent = label;
    button.title = enabled
      ? "Gate 8 preview：本模式只在牌與牌之間切桌；關閉後回到一般模式"
      : "Gate 8 preview：固定 100BB 五桌階梯，初始 Bank 2,000；高桌 bust 可降到最高可負擔較低桌";
  }

  function mountBadge() {
    const stats = document.querySelector(".table-corner-stats");
    if (!stats) return;
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement("span");
      badge.id = BADGE_ID;
      badge.innerHTML = "<em>Long</em><strong>—</strong>";
      stats.appendChild(badge);
    }
    badge.hidden = !enabled;
    if (enabled && session) {
      const table = tableAt(session.tableIndex);
      const value = `${table.small}/${table.big} · Bank ${session.bankroll}`;
      const strong = badge.querySelector("strong");
      if (strong && strong.textContent !== value) strong.textContent = value;
      badge.title = `Long Session 第 ${table.index + 1} 桌；桌面 ${session.tableStack}；資金庫 ${session.bankroll}；總資產 ${session.totalWealth}`;
    }
  }

  function mountMobileProxy() {
    document.querySelectorAll(".mobile-v1-settings-grid").forEach(grid => {
      let button = grid.querySelector("[data-long-session-mobile-toggle]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.longSessionMobileToggle = "true";
        button.addEventListener("click", toggle);
        grid.appendChild(button);
      }
      const label = enabled ? "🪜 結束 Long Session" : pendingEnable ? "🪜 本手後開始 Long Session" : "🪜 Long Session · Gate 8";
      if (button.textContent !== label) button.textContent = label;
    });
  }

  function syncModeConflicts() {
    if ((enabled || pendingEnable) && window.TournamentMode?.isActive?.()) {
      enabled = false;
      pendingEnable = false;
      pendingDisable = false;
      session = null;
      destroyDecisionUi();
      document.body.classList.remove("is-long-session-mode");
    }
    const geminiButton = document.querySelector("#geminiBossButton");
    if (geminiButton) {
      geminiButton.disabled = Boolean(enabled || pendingEnable || window.TournamentMode?.isActive?.());
      if (enabled || pendingEnable) geminiButton.title = "Long Session 使用固定普通 AI 牌桌；請先結束 Long Session";
    }
  }

  function syncUi() {
    installStyles();
    syncModeConflicts();
    mountButton();
    mountBadge();
    mountMobileProxy();
    document.body.classList.toggle("is-long-session-mode", enabled);
  }

  function installWrappers() {
    if (installed) return true;
    if (
      typeof state !== "object"
      || typeof blindLevelForHand !== "function"
      || typeof buildNextAiSeats !== "function"
      || typeof startHand !== "function"
      || typeof maybeShowSessionSummary !== "function"
      || !window.TournamentMode?.version
      || window.ReplacementStackBalance?.isInstalled?.() !== true
    ) {
      if (retryCount < INSTALL_RETRY_LIMIT) {
        retryCount += 1;
        window.setTimeout(installWrappers, INSTALL_RETRY_MS);
      }
      return false;
    }

    originalBlindLevelForHand = blindLevelForHand;
    originalBuildNextAiSeats = buildNextAiSeats;
    originalStartHand = startHand;
    originalMaybeShowSessionSummary = maybeShowSessionSummary;

    blindLevelForHand = function blindLevelForHandWithLongSession(handNumber) {
      if (isRuntimeActive() && session) return tableLevel();
      return originalBlindLevelForHand.apply(this, arguments);
    };

    buildNextAiSeats = function buildNextAiSeatsWithLongSession(previousPlayers) {
      if (!isRuntimeActive() || !session) return originalBuildNextAiSeats.apply(this, arguments);
      const table = tableAt(session.tableIndex);
      if (preparingFreshTable || !Array.isArray(previousPlayers) || !previousPlayers.length) {
        return freshAiSeats(table);
      }
      const seats = originalBuildNextAiSeats.apply(this, arguments);
      const usedNames = new Set(seats.filter(seat => !seat?.replaced).map(seat => seat?.profile?.name).filter(Boolean));
      return seats.map(seat => {
        if (!seat?.replaced) return seat;
        let profile = seat.profile;
        if (!profile?.name || profile.name === "Gemini" || usedNames.has(profile.name)) {
          profile = ordinaryProfiles().find(candidate => !usedNames.has(candidate.name)) || ordinaryProfiles()[0];
        }
        usedNames.add(profile.name);
        return {
          ...seat,
          profile,
          stack: table.entry,
          longSessionEntry: true,
          replacementStackPolicy: "declared-standard-entry-100bb",
        };
      });
    };

    startHand = function startHandWithLongSession(...args) {
      if (!isRuntimeActive() || !session || !preparingFreshTable) {
        return originalStartHand.apply(this, args);
      }
      const previousHero = state.players?.find(player => player?.isHuman) || state.players?.[0] || null;
      state.players = previousHero
        ? [{ ...previousHero, stack: session.tableStack, isHuman: true }]
        : [];
      return originalStartHand.apply(this, args);
    };

    maybeShowSessionSummary = function maybeShowSessionSummaryWithLongSession(...args) {
      if ((pendingEnable || pendingDisable || isRuntimeActive()) && state?.handOver) {
        if (handleCompletedHand()) return true;
      }
      return originalMaybeShowSessionSummary.apply(this, args);
    };

    document.addEventListener("click", event => {
      const tournamentButton = event.target.closest?.("#tournamentModeButton");
      if (tournamentButton && (enabled || pendingEnable)) {
        enabled = false;
        pendingEnable = false;
        pendingDisable = false;
        session = null;
        destroyDecisionUi();
        document.body.classList.remove("is-long-session-mode");
      }
      const geminiButton = event.target.closest?.("#geminiBossButton");
      if (geminiButton && (enabled || pendingEnable)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        announce?.("請先結束 Long Session 再挑戰 Gemini");
        return;
      }
      const newHandButton = event.target.closest?.("#newHandButton");
      if (newHandButton && enabled && (activeEnvelope || session?.status !== "active")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        announce?.(session?.status === "paused" ? "Long Session 已暫停，請從模式按鈕結束或重新選擇" : "請先完成 Long Session 結算");
      }
    }, true);

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.getElementById(ROOT_ID)) {
        event.preventDefault();
      }
    });

    observer = new MutationObserver(syncUi);
    observer.observe(document.body, { childList: true, subtree: true });
    installed = true;
    syncUi();
    return true;
  }

  window.LongSessionModeV1 = Object.freeze({
    version: VERSION,
    preview: "gate8-pr210-demotion",
    tables: TABLES,
    isActive: () => enabled,
    isInstalled: () => installed,
    requestEnable,
    requestDisable,
    enableNow,
    disableNow,
    toggle,
    createSession,
    captureCompletedHandPublicState,
    propose,
    commit,
    snapshot() {
      return {
        installed,
        enabled,
        pendingEnable,
        pendingDisable,
        preparingFreshTable,
        session: cloneSession(),
        table: session ? { ...tableAt(session.tableIndex) } : null,
        decision: activeEnvelope?.proposal ? { ...activeEnvelope.proposal } : null,
      };
    },
  });

  installWrappers();
})();
