// Prevent observer-driven UI modules from rebuilding identical text nodes every animation frame.
(() => {
  "use strict";

  if (window.UiTextWriteGuard?.version === "1.0.0") return;

  const VERSION = "1.0.0";
  const GUARDED_IDS = new Set([
    "challengeModeButton",
    "gameModeLabel",
    "tournamentModeButton",
    "geminiBossButton",
    "longSessionModeButton",
    "tournamentSaveSource",
    "tournamentSaveMeta",
    "tournamentSaveStatus",
  ]);
  const nativeTextContent = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  const guardedElements = new WeakSet();
  const writesById = Object.create(null);
  const skippedById = Object.create(null);
  let observer = null;
  let guardedCount = 0;
  let writeAttempts = 0;
  let skippedWrites = 0;
  let changedWrites = 0;

  function normalizeText(value) {
    return value == null ? "" : String(value);
  }

  function increment(bucket, id) {
    bucket[id] = (bucket[id] || 0) + 1;
  }

  function guardElement(element) {
    if (!nativeTextContent?.get || !nativeTextContent?.set) return false;
    if (!(element instanceof Element) || !GUARDED_IDS.has(element.id) || guardedElements.has(element)) {
      return false;
    }

    const ownDescriptor = Object.getOwnPropertyDescriptor(element, "textContent");
    if (ownDescriptor && ownDescriptor.configurable === false) return false;

    try {
      Object.defineProperty(element, "textContent", {
        configurable: true,
        enumerable: false,
        get() {
          return nativeTextContent.get.call(this);
        },
        set(value) {
          const id = this.id || "unknown";
          const nextText = normalizeText(value);
          const currentText = normalizeText(nativeTextContent.get.call(this));
          writeAttempts += 1;
          increment(writesById, id);

          if (currentText === nextText) {
            skippedWrites += 1;
            increment(skippedById, id);
            return;
          }

          changedWrites += 1;
          nativeTextContent.set.call(this, value);
        },
      });
    } catch (_) {
      return false;
    }

    guardedElements.add(element);
    guardedCount += 1;
    return true;
  }

  function scan(root = document) {
    if (root instanceof Element) guardElement(root);
    root.querySelectorAll?.("#" + [...GUARDED_IDS].join(",#")).forEach(guardElement);
  }

  if (nativeTextContent?.get && nativeTextContent?.set) {
    scan(document);
    observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.UiTextWriteGuard = {
    version: VERSION,
    refresh: () => scan(document),
    isGuarded(id) {
      const element = document.getElementById(id);
      return Boolean(element && guardedElements.has(element));
    },
    status() {
      return {
        supported: Boolean(nativeTextContent?.get && nativeTextContent?.set),
        guardedCount,
        writeAttempts,
        skippedWrites,
        changedWrites,
        writesById: { ...writesById },
        skippedById: { ...skippedById },
      };
    },
    stop() {
      observer?.disconnect();
      observer = null;
    },
  };
})();

// Load the public-information-only late-street discipline recovery after the
// existing V2.9.5 strategy chain becomes available.
(() => {
  "use strict";
  if (document.querySelector("script[data-ai-wtsd-discipline-v2-9-5-r1]")) return;
  const script = document.createElement("script");
  script.src = "js/ai-wtsd-discipline-v2-9-5-r1.js?v=wtsd-recovery-r1";
  script.async = false;
  script.dataset.aiWtsdDisciplineV295R1 = "true";
  document.body.appendChild(script);
})();

// Long Session is an explicit opt-in mode. The module itself waits until the
// Tournament and replacement-economy wrappers are fully installed, then wraps
// only public between-hand boundaries. It always boots disabled.
(() => {
  "use strict";
  if (document.querySelector("script[data-long-session-mode-v1]")) return;
  const script = document.createElement("script");
  script.src = "js/long-session-mode-v1.js?v=long-session-opt-in-v1";
  script.async = false;
  script.dataset.longSessionModeV1 = "true";
  document.body.appendChild(script);
})();

// Keep the Long Session implementation available internally while hiding its
// desktop and mobile player-facing entry points until the mode is revisited.
(() => {
  "use strict";
  if (document.querySelector("script[data-long-session-entry-visibility-v1]")) return;
  const script = document.createElement("script");
  script.src = "js/long-session-entry-visibility-v1.js?v=hidden-entry-v1";
  script.async = false;
  script.dataset.longSessionEntryVisibilityV1 = "true";
  document.body.appendChild(script);
})();

// Preserve compatibility contracts owned by wrappers that Long Session sits on
// top of. Long Session delegates to the production G1 blind wrapper while OFF,
// so the outer function must continue exposing that capability marker. When
// Long Session releases Gemini, restore control-state ownership to the existing
// Tournament/Gemini modules instead of leaving a stale Long Session title.
(() => {
  "use strict";

  if (window.__longSessionCompatibilityBridgeV1) return;
  window.__longSessionCompatibilityBridgeV1 = true;

  const LONG_SESSION_GEMINI_TITLE = "Long Session 使用固定普通 AI 牌桌；請先結束 Long Session";
  const RETRY_MS = 25;
  const RETRY_LIMIT = 400;
  let retryCount = 0;
  let bodyObserver = null;

  function longSessionOwnsGeminiControl() {
    const snapshot = window.LongSessionModeV1?.snapshot?.();
    return Boolean(snapshot?.enabled || snapshot?.pendingEnable);
  }

  function restoreGeminiControlOwnership() {
    if (!window.LongSessionModeV1?.isInstalled?.() || longSessionOwnsGeminiControl()) return;

    const tournamentActive = Boolean(window.TournamentMode?.isActive?.());
    const button = document.querySelector("#geminiBossButton");
    if (button) {
      button.disabled = tournamentActive;
      if (button.title === LONG_SESSION_GEMINI_TITLE) button.title = "";
    }

    window.TournamentMode?.refresh?.();
    window.GeminiFinalBoss?.refresh?.();

    const refreshedButton = document.querySelector("#geminiBossButton");
    if (refreshedButton && !tournamentActive && refreshedButton.title === LONG_SESSION_GEMINI_TITLE) {
      refreshedButton.title = "";
      refreshedButton.disabled = false;
    }
  }

  function preserveWrapperMetadata() {
    if (typeof blindLevelForHand !== "function") return false;
    // ReplacementStackBalance is a required dependency of Long Session. The
    // outer wrapper still supports G1 by delegation, so retain the established
    // capability marker for downstream contracts and diagnostics.
    blindLevelForHand.__tournamentEconomyG1 = true;
    blindLevelForHand.__longSessionModeV1 = true;
    return true;
  }

  function installBridge() {
    if (!window.LongSessionModeV1?.isInstalled?.()) {
      if (retryCount < RETRY_LIMIT) {
        retryCount += 1;
        window.setTimeout(installBridge, RETRY_MS);
      }
      return false;
    }

    preserveWrapperMetadata();
    restoreGeminiControlOwnership();

    if (!bodyObserver) {
      bodyObserver = new MutationObserver(() => {
        preserveWrapperMetadata();
        restoreGeminiControlOwnership();
      });
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    document.addEventListener("click", event => {
      if (!event.target.closest?.(
        "#longSessionModeButton,[data-long-session-mobile-toggle],[data-long-session-action]",
      )) return;
      window.setTimeout(() => {
        preserveWrapperMetadata();
        restoreGeminiControlOwnership();
      }, 0);
    });

    return true;
  }

  installBridge();
})();
