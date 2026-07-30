// Keep the AI profile card close to the selected seat and inside the table.
(() => {
  "use strict";

  if (window.AiProfilePositioner?.version || typeof window.renderAiProfilePanel !== "function") return;

  const EDGE_PADDING = 10;
  const GAP = 12;
  let scheduledFrame = 0;
  let panelResizeObserver = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function intersectionArea(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  function localRect(rect, arenaRect) {
    return {
      left: rect.left - arenaRect.left,
      top: rect.top - arenaRect.top,
      right: rect.right - arenaRect.left,
      bottom: rect.bottom - arenaRect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function panelRectAt(candidate, width, height) {
    return {
      left: candidate.left,
      top: candidate.top,
      right: candidate.left + width,
      bottom: candidate.top + height,
      width,
      height,
    };
  }

  function overflowAmount(rect, arenaWidth, arenaHeight) {
    return Math.max(0, EDGE_PADDING - rect.left)
      + Math.max(0, EDGE_PADDING - rect.top)
      + Math.max(0, rect.right - (arenaWidth - EDGE_PADDING))
      + Math.max(0, rect.bottom - (arenaHeight - EDGE_PADDING));
  }

  function candidatePositions(seat, panelWidth, panelHeight) {
    const centerX = seat.left + seat.width / 2;
    const centerY = seat.top + seat.height / 2;
    return [
      { name: "right", side: "left", left: seat.right + GAP, top: centerY - panelHeight / 2 },
      { name: "left", side: "right", left: seat.left - GAP - panelWidth, top: centerY - panelHeight / 2 },
      { name: "below", side: "top", left: centerX - panelWidth / 2, top: seat.bottom + GAP },
      { name: "above", side: "bottom", left: centerX - panelWidth / 2, top: seat.top - GAP - panelHeight },
      { name: "right-below", side: "left", left: seat.right + GAP, top: seat.top },
      { name: "right-above", side: "left", left: seat.right + GAP, top: seat.bottom - panelHeight },
      { name: "left-below", side: "right", left: seat.left - GAP - panelWidth, top: seat.top },
      { name: "left-above", side: "right", left: seat.left - GAP - panelWidth, top: seat.bottom - panelHeight },
    ];
  }

  function collectAvoidRects(arena, arenaRect, selectedSeat) {
    const selectors = [
      ".controls",
      "#playerCards",
      ".pot-chip",
      ".board-cards",
      ".seat[data-profile-position]",
    ];
    return selectors.flatMap(selector => Array.from(arena.querySelectorAll(selector)))
      .filter(node => node !== selectedSeat && !node.hidden)
      .map(node => localRect(node.getBoundingClientRect(), arenaRect))
      .filter(rect => rect.width > 0 && rect.height > 0);
  }

  function scoreCandidate(candidate, panelWidth, panelHeight, arenaWidth, arenaHeight, seat, avoidRects, index) {
    const rect = panelRectAt(candidate, panelWidth, panelHeight);
    const overflow = overflowAmount(rect, arenaWidth, arenaHeight);
    const anchorOverlap = intersectionArea(rect, seat);
    const obstruction = avoidRects.reduce((sum, avoidRect) => sum + intersectionArea(rect, avoidRect), 0);
    const panelCenterX = rect.left + panelWidth / 2;
    const panelCenterY = rect.top + panelHeight / 2;
    const seatCenterX = seat.left + seat.width / 2;
    const seatCenterY = seat.top + seat.height / 2;
    const distance = Math.hypot(panelCenterX - seatCenterX, panelCenterY - seatCenterY);

    return overflow * 100000
      + anchorOverlap * 1000
      + obstruction * 2.5
      + distance * 0.08
      + index;
  }

  function applyPosition() {
    scheduledFrame = 0;
    const arena = document.querySelector("#arena");
    const panel = document.querySelector("#aiProfilePanel");
    const selectedPosition = Number(state?.selectedProfilePosition || 0);
    const seat = selectedPosition
      ? arena?.querySelector(`.seat[data-profile-position="${selectedPosition}"]`)
      : null;

    if (!arena || !panel || panel.hidden || !seat) {
      panel?.removeAttribute("data-anchor-position");
      panel?.removeAttribute("data-anchor-side");
      return;
    }

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";

    const arenaRect = arena.getBoundingClientRect();
    const seatRect = localRect(seat.getBoundingClientRect(), arenaRect);
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    if (!arenaRect.width || !arenaRect.height || !panelWidth || !panelHeight) return;

    const avoidRects = collectAvoidRects(arena, arenaRect, seat);
    const candidates = candidatePositions(seatRect, panelWidth, panelHeight);
    const best = candidates
      .map((candidate, index) => ({
        ...candidate,
        score: scoreCandidate(
          candidate,
          panelWidth,
          panelHeight,
          arenaRect.width,
          arenaRect.height,
          seatRect,
          avoidRects,
          index,
        ),
      }))
      .sort((a, b) => a.score - b.score)[0];

    const left = clamp(best.left, EDGE_PADDING, Math.max(EDGE_PADDING, arenaRect.width - panelWidth - EDGE_PADDING));
    const top = clamp(best.top, EDGE_PADDING, Math.max(EDGE_PADDING, arenaRect.height - panelHeight - EDGE_PADDING));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.dataset.anchorPosition = best.name;
    panel.dataset.anchorSide = best.side;
  }

  function schedulePosition() {
    cancelAnimationFrame(scheduledFrame);
    scheduledFrame = requestAnimationFrame(applyPosition);
  }

  function installStyles() {
    if (document.querySelector("#aiProfilePositionStyles")) return;
    const style = document.createElement("style");
    style.id = "aiProfilePositionStyles";
    style.textContent = `
      html body .ai-profile-panel[data-anchor-position] {
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        animation: aiProfileNearbyIn 180ms ease both;
      }
      html body .ai-profile-panel[data-anchor-position]::before {
        content: "";
        position: absolute;
        z-index: -1;
        width: 14px;
        height: 14px;
        border: 1px solid rgba(112,216,201,.34);
        background: rgba(10,23,25,.94);
        transform: rotate(45deg);
      }
      html body .ai-profile-panel[data-anchor-side="left"]::before {
        left: -8px;
        top: clamp(24px, 42%, calc(100% - 30px));
        border-top: 0;
        border-right: 0;
      }
      html body .ai-profile-panel[data-anchor-side="right"]::before {
        right: -8px;
        top: clamp(24px, 42%, calc(100% - 30px));
        border-bottom: 0;
        border-left: 0;
      }
      html body .ai-profile-panel[data-anchor-side="top"]::before {
        top: -8px;
        left: clamp(28px, 45%, calc(100% - 34px));
        border-right: 0;
        border-bottom: 0;
      }
      html body .ai-profile-panel[data-anchor-side="bottom"]::before {
        bottom: -8px;
        left: clamp(28px, 45%, calc(100% - 34px));
        border-left: 0;
        border-top: 0;
      }
      @keyframes aiProfileNearbyIn {
        from { opacity: 0; scale: .97; }
        to { opacity: 1; scale: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function observePanelSize() {
    const panel = document.querySelector("#aiProfilePanel");
    if (!panel || typeof ResizeObserver !== "function") return;
    panelResizeObserver?.disconnect();
    panelResizeObserver = new ResizeObserver(schedulePosition);
    panelResizeObserver.observe(panel);
  }

  const originalRenderAiProfilePanel = window.renderAiProfilePanel;
  window.renderAiProfilePanel = function renderNearbyAiProfilePanel(...args) {
    const result = originalRenderAiProfilePanel.apply(this, args);
    schedulePosition();
    return result;
  };

  installStyles();
  observePanelSize();
  window.addEventListener("resize", schedulePosition, { passive: true });

  window.AiProfilePositioner = {
    version: "1.0.0",
    refresh: schedulePosition,
    positionNow: applyPosition,
  };
})();
