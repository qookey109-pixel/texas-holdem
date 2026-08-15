// Gate 8 manual-preview only: expose the retained Long Session entry locally.
// Do not merge or publish this branch; production keeps the entry hidden.
(() => {
  "use strict";

  if (window.LongSessionEntryVisibilityV1?.version) return;

  const VERSION = "1.0.0";
  const SELECTOR = "#longSessionModeButton,[data-long-session-mobile-toggle]";
  let observer = null;

  function showEntry(element) {
    if (!(element instanceof HTMLElement)) return false;
    element.hidden = false;
    element.removeAttribute("aria-hidden");
    if (element.tabIndex < 0) element.tabIndex = 0;
    return true;
  }

  function apply(root = document) {
    let shownCount = 0;
    if (root instanceof HTMLElement && root.matches(SELECTOR)) {
      shownCount += showEntry(root) ? 1 : 0;
    }
    root.querySelectorAll?.(SELECTOR).forEach(element => {
      shownCount += showEntry(element) ? 1 : 0;
    });
    return shownCount;
  }

  function install() {
    document.getElementById("longSessionEntryVisibilityStyles")?.remove();
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
    preview: true,
    apply: () => apply(document),
    isHidden: () => false,
  });

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", install, { once: true })
    : install();
})();
