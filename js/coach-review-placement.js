// Keep the single-hand review inside the Poker Coach review card.
(() => {
  "use strict";

  if (window.CoachReviewPlacement?.version) return;

  function reviewTarget() {
    return document.querySelector("#coachReviewMount")
      || document.querySelector("#coachContent");
  }

  function mountReviewPanel() {
    const panel = document.querySelector("#handReviewPanel");
    const target = reviewTarget();
    if (!panel || !target) return false;

    if (panel.parentElement !== target) {
      target.appendChild(panel);
    }

    panel.dataset.reviewOwner = "coach";
    return true;
  }

  function installStyles() {
    if (document.querySelector("#coachReviewPlacementStyles")) return;

    const style = document.createElement("style");
    style.id = "coachReviewPlacementStyles";
    style.textContent = `
      #coachReviewMount > #handReviewPanel,
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

      #coachReviewMount > #handReviewPanel .hand-review-title p,
      #coachContent > #handReviewPanel .hand-review-title p {
        color: var(--gold);
      }

      #coachReviewMount > #handReviewPanel .hand-review-title h3,
      #coachContent > #handReviewPanel .hand-review-title h3 {
        color: var(--ink);
      }

      #historyPanel > #handReviewPanel {
        display: none !important;
      }

      @media (max-width: 900px) {
        #coachReviewMount > #handReviewPanel,
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
    version: "2.0.0",
    refresh,
  };
})();

(() => {
  if (document.querySelector('script[data-decision-ui-trial]')) return;
  const script = document.createElement("script");
  script.src = "js/decision-ui-trial-v2.js?v=runtime-20260821-r1";
  script.async = false;
  script.dataset.decisionUiTrial = "true";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-topbar-seat-polish]')) return;
  const script = document.createElement("script");
  script.src = "js/topbar-seat-polish.js?v=runtime-20260821-r1";
  script.async = false;
  script.dataset.topbarSeatPolish = "true";
  document.body.appendChild(script);
})();
