// Keep the visible tournament total aligned with Vlad's 17-character roster.
(() => {
  "use strict";

  if (window.EliteCharacterProgressFix?.version) return;
  const TOTAL = 17;
  let observer = null;
  let frame = 0;

  function installStyles() {
    if (document.querySelector("#eliteCharacterProgressFixStyles")) return;
    const style = document.createElement("style");
    style.id = "eliteCharacterProgressFixStyles";
    style.textContent = `
      #tournamentProgressBadge strong[data-elite-progress] {
        font-size: 0 !important;
      }
      #tournamentProgressBadge strong[data-elite-progress]::after {
        content: attr(data-elite-progress);
        font-size: .78rem;
        font-weight: 950;
        color: inherit;
        font-variant-numeric: tabular-nums;
      }
    `;
    document.head.appendChild(style);
  }

  function sync() {
    installStyles();
    if (!window.TournamentMode?.isActive?.()) return false;
    const defeated = state?.tournament?.eliminated?.length || 0;
    const progress = `${defeated} / ${TOTAL}`;
    const badge = document.querySelector("#tournamentProgressBadge");
    const value = badge?.querySelector("strong");
    if (!value) return false;

    if (value.dataset.eliteProgress !== progress) {
      value.dataset.eliteProgress = progress;
    }
    value.setAttribute("aria-label", progress);
    badge.title = `已永久淘汰 ${defeated} 位；剩餘 ${Math.max(0, TOTAL - defeated)} 位`;
    return true;
  }

  function scheduleSync() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  }

  function install() {
    installStyles();
    sync();
    observer?.disconnect();
    observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  window.EliteCharacterProgressFix = {
    version: "1.0.0",
    total: TOTAL,
    refresh: sync,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
