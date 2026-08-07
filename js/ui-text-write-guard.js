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
