// Compatibility shim retained for older cached boot files.
// The collection now filters unlocked decks directly in card-theme-ui.js.
(() => {
  "use strict";

  function refreshCopyOnce() {
    const subtitle = document.querySelector("#cardStylePanel .card-style-head span");
    if (subtitle && subtitle.textContent !== "只顯示目前已取得的牌組；新牌組解鎖後才會出現。") {
      subtitle.textContent = "只顯示目前已取得的牌組；新牌組解鎖後才會出現。";
    }

    const summaryNote = document.querySelector("#cardStylePanel .deck-collection-summary small");
    if (summaryNote && summaryNote.textContent !== "解鎖後自動加入") {
      summaryNote.textContent = "解鎖後自動加入";
    }

    const footer = document.querySelector("#cardStylePanel .card-style-footer");
    if (footer && footer.textContent !== "未取得、Boss 與隱藏牌組不會提前顯示。") {
      footer.textContent = "未取得、Boss 與隱藏牌組不會提前顯示。";
    }
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", refreshCopyOnce, { once: true })
    : refreshCopyOnce();
})();