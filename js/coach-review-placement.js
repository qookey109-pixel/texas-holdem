// Keep the single-hand review with the Poker Coach instead of the chronological hand log.
(() => {
  "use strict";

  if (window.CoachReviewPlacement?.version) return;

  function mountReviewPanel() {
    const panel = document.querySelector("#handReviewPanel");
    const coachContent = document.querySelector("#coachContent");
    if (!panel || !coachContent) return false;

    if (panel.parentElement !== coachContent) {
      coachContent.appendChild(panel);
    }

    panel.dataset.reviewOwner = "coach";
    return true;
  }

  function installStyles() {
    if (document.querySelector("#coachReviewPlacementStyles")) return;

    const style = document.createElement("style");
    style.id = "coachReviewPlacementStyles";
    style.textContent = `
      #coachContent > #handReviewPanel {
        grid-column: 1 / -1;
        max-height: min(300px, 38vh);
        margin: 3px 0 0;
        border-color: rgba(233,188,101,.34);
        background:
          linear-gradient(180deg, rgba(233,188,101,.085), rgba(112,216,201,.035)),
          rgba(5,12,17,.66);
        box-shadow:
          inset 3px 0 0 rgba(233,188,101,.42),
          inset 0 1px 0 rgba(255,255,255,.08);
      }

      #coachContent > #handReviewPanel .hand-review-title p {
        color: var(--gold);
      }

      #coachContent > #handReviewPanel .hand-review-title h3 {
        color: var(--ink);
      }

      #historyPanel > #handReviewPanel {
        display: none !important;
      }

      @media (max-width: 900px) {
        #coachContent > #handReviewPanel {
          max-height: min(240px, 36vh);
          margin-top: 1px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    installStyles();
    return mountReviewPanel();
  }

  installStyles();
  refresh();

  const observer = new MutationObserver(() => {
    refresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.CoachReviewPlacement = {
    version: "1.0.0",
    refresh,
  };
})();

(() => {
  if (document.querySelector('script[data-decision-ui-trial]')) return;
  const script = document.createElement("script");
  script.src = "js/decision-ui-trial-v2.js?v=decision-ui-v3";
  script.async = false;
  script.dataset.decisionUiTrial = "true";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-topbar-seat-polish]')) return;
  const script = document.createElement("script");
  script.src = "js/topbar-seat-polish.js?v=topbar-seat-v1";
  script.async = false;
  script.dataset.topbarSeatPolish = "true";
  document.body.appendChild(script);
})();
