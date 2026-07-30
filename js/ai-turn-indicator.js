// Prominent AI turn focus with glow only.
(() => {
  "use strict";

  if (typeof window.render !== "function") return;

  const originalRender = window.render;
  let reactionNormalizationScheduled = false;

  function currentThinkingPlayer() {
    if (state.handOver || state.currentActorIndex <= 0) return null;
    const player = state.players?.[state.currentActorIndex];
    if (!player || player.isHuman || player.folded || player.allIn) return null;
    return String(player.status || "").includes("Thinking") ? player : null;
  }

  function seatFor(player) {
    return document.querySelector(`.seat[data-profile-position="${player.position}"]`);
  }

  function removeTurnVisuals() {
    document.querySelectorAll(".seat.ai-turn-active").forEach(seat => {
      seat.classList.remove("ai-turn-active");
    });
  }

  function ensureVisuals(player) {
    const seat = seatFor(player);
    if (!seat) return null;

    seat.classList.add("ai-turn-active");
    return seat;
  }

  function syncTurnIndicator() {
    const player = currentThinkingPlayer();
    document.querySelectorAll(".seat.ai-turn-active").forEach(seat => {
      if (!player || Number(seat.dataset.profilePosition) !== player.position) {
        seat.classList.remove("ai-turn-active");
      }
    });

    if (!player) return;
    ensureVisuals(player);
  }

  function normalizeAvatarReaction(avatar) {
    const badges = Array.from(avatar.children).filter(child => child.classList?.contains("ai-emotion-face-badge"));
    const preferred = badges.find(badge => badge.classList.contains("slot-mood"))
      || badges.find(badge => badge.classList.contains("slot-action"))
      || badges[0]
      || null;

    badges.forEach(badge => {
      if (badge !== preferred) badge.remove();
    });

    if (preferred) {
      preferred.classList.remove("slot-mood", "slot-action");
      preferred.classList.add("slot-single");
      preferred.setAttribute("aria-hidden", "true");
    }

    const seat = avatar.closest(".seat");
    if (seat) seat.classList.toggle("has-ai-reaction", Boolean(preferred));
  }

  function normalizeReactionBadges() {
    document.querySelectorAll(".player-emoji, .ai-profile-avatar").forEach(normalizeAvatarReaction);
  }

  function scheduleReactionNormalization() {
    if (reactionNormalizationScheduled) return;
    reactionNormalizationScheduled = true;
    queueMicrotask(() => {
      reactionNormalizationScheduled = false;
      normalizeReactionBadges();
    });
  }

  function observeReactionBadges() {
    const observer = new MutationObserver(scheduleReactionNormalization);
    const opponents = document.querySelector("#opponents");
    const profile = document.querySelector("#aiProfilePanel");

    if (opponents) observer.observe(opponents, { childList: true, subtree: true });
    if (profile) observer.observe(profile, { childList: true, subtree: true });
  }

  function installStyles() {
    if (document.querySelector("#aiTurnIndicatorStyles")) return;
    const style = document.createElement("style");
    style.id = "aiTurnIndicatorStyles";
    style.textContent = `
      html body .opponents,
      html body .seat,
      html body .seat-header,
      html body .seat-identity,
      html body .player-emoji,
      html body .ai-profile-avatar {
        overflow: visible !important;
      }
      html body .ai-emotion-face-badge {
        position: absolute !important;
        z-index: 100 !important;
        width: auto !important;
        height: auto !important;
        min-width: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        font-size: 1.08rem !important;
        line-height: 1 !important;
        pointer-events: none !important;
        text-shadow:
          0 2px 4px rgba(0,0,0,.8),
          0 0 7px rgba(255,255,255,.2) !important;
      }
      html body .ai-emotion-face-badge.slot-mood {
        left: -10px !important;
        top: -22px !important;
      }
      html body .ai-emotion-face-badge.slot-action {
        right: -10px !important;
        top: -22px !important;
      }
      html body .ai-emotion-face-badge.slot-single {
        left: calc(50% + 6px) !important;
        right: auto !important;
        top: -23px !important;
        transform: translateX(-50%) !important;
      }
      html body .ai-emotion-face-badge.is-profile {
        top: -25px !important;
        font-size: 1.25rem !important;
      }

      html body .seat.ai-turn-active {
        z-index: 24 !important;
        filter:
          drop-shadow(0 14px 24px rgba(0,0,0,.26))
          drop-shadow(0 0 24px rgba(255,194,70,.24)) !important;
        transform: translateY(-1px);
      }
      html body .seat.ai-turn-active .seat-header {
        overflow: visible !important;
        animation: none !important;
        filter: none !important;
        border-color: rgba(255,211,102,.92) !important;
        background:
          radial-gradient(circle at 16% 0%, rgba(255,211,102,.22), transparent 54%),
          linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.045)),
          rgba(5,13,16,.74) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.2),
          0 0 0 2px rgba(255,211,102,.16),
          0 0 26px rgba(255,194,70,.32),
          0 0 54px rgba(255,194,70,.13),
          0 16px 30px rgba(0,0,0,.28) !important;
      }
      html body .seat.ai-turn-active .player-emoji {
        isolation: isolate;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.18),
          0 0 13px rgba(255,211,102,.34) !important;
      }
      html body .seat.ai-turn-active .seat-status.is-thinking {
        border-color: rgba(255,211,102,.45) !important;
        background: rgba(255,211,102,.12) !important;
        color: #ffe7a3 !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          0 0 14px rgba(255,211,102,.18) !important;
      }
      html body .seat.ai-turn-active .seat-status.is-thinking::after {
        display: none !important;
      }
      html body .seat.has-ai-reaction {
        z-index: 80 !important;
        isolation: isolate !important;
      }
      html body .seat.has-ai-reaction.ai-turn-active {
        z-index: 90 !important;
      }
      html body .seat.has-ai-reaction .seat-header,
      html body .seat.has-ai-reaction .seat-identity,
      html body .seat.has-ai-reaction .player-emoji {
        overflow: visible !important;
      }
    `;
    document.head.appendChild(style);
  }

  window.render = function renderWithAiTurnIndicator(...args) {
    const result = originalRender.apply(this, args);
    syncTurnIndicator();
    normalizeReactionBadges();
    return result;
  };

  installStyles();
  observeReactionBadges();
  normalizeReactionBadges();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") {
      syncTurnIndicator();
      normalizeReactionBadges();
    }
  });

  window.AiTurnIndicator = {
    refresh() {
      syncTurnIndicator();
      normalizeReactionBadges();
    },
    clear: removeTurnVisuals,
  };
})();

(() => {
  if (document.querySelector('script[data-bet-info-ui]')) return;
  const script = document.createElement("script");
  script.src = "js/bet-info-ui.js?v=bet-info-v2";
  script.async = false;
  script.dataset.betInfoUi = "true";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-layout-corner-resize]')) return;
  const script = document.createElement("script");
  script.src = "js/layout-corner-resize.js?v=corner-resize-v1";
  script.async = false;
  script.dataset.layoutCornerResize = "true";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-layout-readability-trial]')) return;
  const script = document.createElement("script");
  script.src = "js/layout-readability-trial.js?v=readability-v1";
  script.async = false;
  script.dataset.layoutReadabilityTrial = "true";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-coach-review-placement]')) return;
  const script = document.createElement("script");
  script.src = "js/coach-review-placement.js?v=coach-review-v1";
  script.async = false;
  script.dataset.coachReviewPlacement = "true";
  document.body.appendChild(script);
})();