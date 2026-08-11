// Keep Long Session available internally while its player-facing entry stays hidden.
(() => {
  "use strict";

  if (window.LongSessionEntryVisibilityV1?.version) return;

  const VERSION = "1.0.0";
  const SELECTOR = "#longSessionModeButton,[data-long-session-mobile-toggle]";
  let observer = null;

  function hideEntry(element) {
    if (!(element instanceof HTMLElement)) return false;
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    element.tabIndex = -1;
    return true;
  }

  function apply(root = document) {
    let hiddenCount = 0;
    if (root instanceof HTMLElement && root.matches(SELECTOR)) {
      hiddenCount += hideEntry(root) ? 1 : 0;
    }
    root.querySelectorAll?.(SELECTOR).forEach(element => {
      hiddenCount += hideEntry(element) ? 1 : 0;
    });
    return hiddenCount;
  }

  function installStyles() {
    if (document.getElementById("longSessionEntryVisibilityStyles")) return;
    const style = document.createElement("style");
    style.id = "longSessionEntryVisibilityStyles";
    style.textContent = `${SELECTOR}{display:none !important;}`;
    document.head.appendChild(style);
  }

  function install() {
    installStyles();
    apply(document);
    observer?.disconnect();
    observer = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) apply(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.LongSessionEntryVisibilityV1 = Object.freeze({
    version: VERSION,
    apply: () => apply(document),
    isHidden() {
      const entries = [...document.querySelectorAll(SELECTOR)];
      return entries.every(element => element.hidden && element.getAttribute("aria-hidden") === "true");
    },
  });

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", install, { once: true })
    : install();
})();
