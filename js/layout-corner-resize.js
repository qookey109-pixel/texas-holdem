// Corner resize handles for layout-editable cards, AI seats, and the pot.
(() => {
  "use strict";

  if (window.LayoutCornerResize?.version) return;

  const POT_STORAGE_KEY = "texasHoldemPotScaleV1";
  const POT_DEFAULT = 100;
  const SIZE_LIMITS = Object.freeze({
    heroCard: [70, 115],
    boardCard: [65, 105],
    aiCard: [32, 58],
    aiSeat: [150, 210],
    potScale: [70, 150],
  });
  const RESIZABLE_LAYOUT = Object.freeze({
    heroCards: { sizeKey: "heroCard", label: "我的手牌" },
    board: { sizeKey: "boardCard", label: "公共牌" },
    pot: { sizeKey: "potScale", label: "底池" },
    seat1: { sizeKey: "aiSeat", label: "AI 資訊卡" },
    seat2: { sizeKey: "aiSeat", label: "AI 資訊卡" },
    seat3: { sizeKey: "aiSeat", label: "AI 資訊卡" },
    seat4: { sizeKey: "aiSeat", label: "AI 資訊卡" },
    seat5: { sizeKey: "aiSeat", label: "AI 資訊卡" },
    seat6: { sizeKey: "aiSeat", label: "AI 資訊卡" },
    seatCards1: { sizeKey: "aiCard", label: "AI 手牌" },
    seatCards2: { sizeKey: "aiCard", label: "AI 手牌" },
    seatCards3: { sizeKey: "aiCard", label: "AI 手牌" },
    seatCards4: { sizeKey: "aiCard", label: "AI 手牌" },
    seatCards5: { sizeKey: "aiCard", label: "AI 手牌" },
    seatCards6: { sizeKey: "aiCard", label: "AI 手牌" },
  });
  const HANDLE_CORNERS = Object.freeze(["nw", "ne", "sw", "se"]);

  let potScale = readPotScale();
  let resizeDrag = null;
  let controllerWaitTimer = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readPotScale() {
    try {
      const raw = localStorage.getItem(POT_STORAGE_KEY);
      if (raw === null || raw === "") return POT_DEFAULT;
      const saved = Number(raw);
      return Number.isFinite(saved) ? Math.round(clamp(saved, ...SIZE_LIMITS.potScale)) : POT_DEFAULT;
    } catch (_) {
      return POT_DEFAULT;
    }
  }

  function savePotScale() {
    try {
      localStorage.setItem(POT_STORAGE_KEY, String(potScale));
    } catch (error) {
      console.warn("Pot size setting was not saved:", error);
    }
  }

  function applyPotScale({ persist = false } = {}) {
    document.documentElement.style.setProperty("--layout-pot-scale", (potScale / 100).toFixed(3));
    if (persist) savePotScale();
    syncPotControl();
  }

  function setPotScale(value, { persist = true } = {}) {
    const [min, max] = SIZE_LIMITS.potScale;
    potScale = Math.round(clamp(Number(value) || POT_DEFAULT, min, max));
    applyPotScale({ persist });
  }

  function resetPotScale() {
    potScale = POT_DEFAULT;
    try { localStorage.removeItem(POT_STORAGE_KEY); } catch (_) {}
    applyPotScale();
  }

  function currentSize(config) {
    if (!config) return null;
    if (config.sizeKey === "potScale") return potScale;
    const sizes = window.LayoutSizeController?.getSizes?.();
    const value = Number(sizes?.[config.sizeKey]);
    return Number.isFinite(value) ? value : null;
  }

  function setCurrentSize(config, value, { persist = true } = {}) {
    if (!config) return;
    const limits = SIZE_LIMITS[config.sizeKey];
    if (!limits) return;
    const next = Math.round(clamp(Number(value) || limits[0], limits[0], limits[1]));
    if (config.sizeKey === "potScale") {
      setPotScale(next, { persist });
      return;
    }
    window.LayoutSizeController?.setSize?.(config.sizeKey, next, { persist });
  }

  function installStyles() {
    if (document.querySelector("#layoutCornerResizeStyles")) return;
    const style = document.createElement("style");
    style.id = "layoutCornerResizeStyles";
    style.textContent = `
      :root { --layout-pot-scale: 1; }
      html body .pot-chip {
        transform: translate(-50%, -50%) scale(var(--layout-pot-scale)) !important;
        transform-origin: center !important;
      }
      .arena.layout-edit-mode [data-layout-key].is-layout-resizable {
        overflow: visible !important;
      }
      .layout-resize-handle {
        position: absolute;
        z-index: 120;
        display: none;
        width: 14px;
        height: 14px;
        padding: 0;
        border: 2px solid rgba(255,244,201,.96);
        border-radius: 4px;
        background: rgba(9,23,25,.96);
        box-shadow: 0 0 0 2px rgba(112,216,201,.28), 0 4px 10px rgba(0,0,0,.42);
        pointer-events: auto;
        touch-action: none;
      }
      .arena.layout-edit-mode:not(.layout-edit-locked)
        [data-layout-key].is-layout-selected.is-layout-resizable > .layout-resize-handle {
        display: block;
      }
      .layout-resize-handle[data-layout-resize-handle="nw"] {
        left: -13px;
        top: -13px;
        cursor: nwse-resize !important;
      }
      .layout-resize-handle[data-layout-resize-handle="ne"] {
        right: -13px;
        top: -13px;
        cursor: nesw-resize !important;
      }
      .layout-resize-handle[data-layout-resize-handle="sw"] {
        left: -13px;
        bottom: -13px;
        cursor: nesw-resize !important;
      }
      .layout-resize-handle[data-layout-resize-handle="se"] {
        right: -13px;
        bottom: -13px;
        cursor: nwse-resize !important;
      }
      .arena.layout-resize-dragging,
      .arena.layout-resize-dragging * {
        user-select: none !important;
      }
      .arena.layout-resize-dragging .layout-resize-handle {
        cursor: inherit !important;
      }
      .layout-size-row[data-pot-size-row] output {
        min-width: 43px;
      }
    `;
    document.head.appendChild(style);
  }

  function potSliderMarkup() {
    const [min, max] = SIZE_LIMITS.potScale;
    return `
      <label class="layout-size-row" data-pot-size-row>
        <span>底池</span>
        <input type="range" min="${min}" max="${max}" step="1" value="${potScale}" data-layout-size="potScale" aria-label="底池大小" />
        <output data-layout-size-output="potScale">${potScale}%</output>
      </label>`;
  }

  function syncPotControl() {
    const input = document.querySelector('[data-layout-size="potScale"]');
    const output = document.querySelector('[data-layout-size-output="potScale"]');
    if (input) input.value = String(potScale);
    if (output) output.textContent = `${potScale}%`;
  }

  function installPotControl() {
    const section = document.querySelector("#layoutSizeControls");
    if (!section || section.querySelector("[data-pot-size-row]")) return false;

    const note = section.querySelector(".layout-size-note");
    const template = document.createElement("template");
    template.innerHTML = potSliderMarkup().trim();
    section.insertBefore(template.content.firstElementChild, note || null);

    const title = section.querySelector(".layout-size-controls-head strong");
    if (title) title.textContent = "牌桌元素大小";
    if (note) note.textContent = "可使用滑桿，或選取元素後拖曳四個角落等比例調整；設定會自動儲存在這台裝置。";

    section.querySelector('[data-layout-size="potScale"]')?.addEventListener("input", event => {
      setPotScale(event.currentTarget.value);
      syncResizeHandles();
    });
    section.querySelector("#resetLayoutSizesButton")?.addEventListener("click", () => {
      resetPotScale();
      syncResizeHandles();
    });
    document.querySelector("#resetLayoutButton")?.addEventListener("click", () => {
      resetPotScale();
      syncResizeHandles();
    });
    syncPotControl();
    return true;
  }

  function waitForSizeController() {
    if (window.LayoutSizeController && installPotControl()) {
      clearInterval(controllerWaitTimer);
      controllerWaitTimer = 0;
      syncResizeHandles();
      return;
    }
    if (!controllerWaitTimer) {
      controllerWaitTimer = window.setInterval(() => {
        if (window.LayoutSizeController && installPotControl()) {
          clearInterval(controllerWaitTimer);
          controllerWaitTimer = 0;
          syncResizeHandles();
        }
      }, 60);
    }
  }

  function removeResizeHandles(target) {
    target?.querySelectorAll?.(":scope > .layout-resize-handle").forEach(handle => handle.remove());
    target?.classList?.remove("is-layout-resizable");
  }

  function createResizeHandle(corner) {
    const handle = document.createElement("span");
    handle.className = "layout-resize-handle";
    handle.dataset.layoutResizeHandle = corner;
    handle.setAttribute("aria-hidden", "true");
    return handle;
  }

  function syncLayoutStatus(target, config) {
    const status = document.querySelector("#layoutStatus");
    if (!status || !target || !config || !state?.layout?.editing || state.layout.locked) return;
    if (!status.textContent.includes("四角")) status.textContent += "｜拖曳四角調整大小";
  }

  function syncResizeHandles() {
    const arena = document.querySelector("#arena");
    if (!arena) return;

    arena.querySelectorAll("[data-layout-key].is-layout-resizable").forEach(target => {
      const key = target.dataset.layoutKey;
      if (!state?.layout?.editing || state.layout.locked || key !== state.layout.selectedKey || !RESIZABLE_LAYOUT[key]) {
        removeResizeHandles(target);
      }
    });

    if (!state?.layout?.editing || state.layout.locked) return;
    const key = state.layout.selectedKey;
    const config = RESIZABLE_LAYOUT[key];
    if (!config) return;
    const target = arena.querySelector(`[data-layout-key="${key}"]`);
    if (!target) return;

    target.classList.add("is-layout-resizable");
    HANDLE_CORNERS.forEach(corner => {
      if (!target.querySelector(`:scope > [data-layout-resize-handle="${corner}"]`)) {
        target.appendChild(createResizeHandle(corner));
      }
    });
    syncLayoutStatus(target, config);
  }

  function oppositeCorner(rect, corner) {
    return {
      nw: { x: rect.right, y: rect.bottom },
      ne: { x: rect.left, y: rect.bottom },
      sw: { x: rect.right, y: rect.top },
      se: { x: rect.left, y: rect.top },
    }[corner];
  }

  function beginResize(event) {
    const handle = event.target.closest?.("[data-layout-resize-handle]");
    if (!handle || !state?.layout?.editing || state.layout.locked) return;
    if (event.button !== undefined && event.button !== 0) return;

    const target = handle.parentElement;
    const key = target?.dataset?.layoutKey;
    const config = RESIZABLE_LAYOUT[key];
    const startValue = currentSize(config);
    if (!target || !config || !Number.isFinite(startValue)) return;

    const rect = target.getBoundingClientRect();
    const opposite = oppositeCorner(rect, handle.dataset.layoutResizeHandle);
    const startDistance = Math.hypot(event.clientX - opposite.x, event.clientY - opposite.y);
    if (!startDistance) return;

    resizeDrag = {
      pointerId: event.pointerId,
      target,
      handle,
      key,
      config,
      startValue,
      opposite,
      startDistance,
      currentValue: startValue,
    };

    target.classList.add("is-layout-resizing");
    document.querySelector("#arena")?.classList.add("layout-resize-dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function moveResize(event) {
    const drag = resizeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.target.isConnected) {
      resizeDrag = null;
      return;
    }

    const distance = Math.hypot(event.clientX - drag.opposite.x, event.clientY - drag.opposite.y);
    const ratio = distance / drag.startDistance;
    const next = drag.startValue * ratio;
    setCurrentSize(drag.config, next, { persist: false });
    drag.currentValue = currentSize(drag.config) ?? drag.currentValue;
    syncResizeHandles();
    event.preventDefault();
    event.stopPropagation();
  }

  function endResize(event) {
    const drag = resizeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setCurrentSize(drag.config, drag.currentValue, { persist: true });
    drag.target.classList.remove("is-layout-resizing");
    drag.handle.releasePointerCapture?.(event.pointerId);
    document.querySelector("#arena")?.classList.remove("layout-resize-dragging");
    resizeDrag = null;
    syncResizeHandles();
    if (typeof announce === "function") announce(`${drag.config.label}大小已調整`);
    event.preventDefault();
    event.stopPropagation();
  }

  function wrapUiFunctions() {
    const originalUpdateLayoutEditorUI = window.updateLayoutEditorUI;
    if (typeof originalUpdateLayoutEditorUI === "function" && !originalUpdateLayoutEditorUI.__cornerResizeWrapped) {
      const wrapped = function updateLayoutEditorUIWithCornerResize(...args) {
        const result = originalUpdateLayoutEditorUI.apply(this, args);
        syncResizeHandles();
        return result;
      };
      wrapped.__cornerResizeWrapped = true;
      window.updateLayoutEditorUI = wrapped;
    }

    const originalRender = window.render;
    if (typeof originalRender === "function" && !originalRender.__cornerResizeWrapped) {
      const wrapped = function renderWithCornerResize(...args) {
        const result = originalRender.apply(this, args);
        syncResizeHandles();
        return result;
      };
      wrapped.__cornerResizeWrapped = true;
      window.render = wrapped;
    }
  }

  function installEvents() {
    const arena = document.querySelector("#arena");
    if (!arena || arena.dataset.cornerResizeReady === "true") return;
    arena.dataset.cornerResizeReady = "true";
    arena.addEventListener("pointerdown", beginResize, true);
    window.addEventListener("pointermove", moveResize, true);
    window.addEventListener("pointerup", endResize, true);
    window.addEventListener("pointercancel", endResize, true);
  }

  function install() {
    installStyles();
    applyPotScale();
    wrapUiFunctions();
    installEvents();
    waitForSizeController();
    syncResizeHandles();
  }

  window.LayoutCornerResize = {
    version: "1.0.0",
    getPotScale: () => potScale,
    setPotScale,
    refresh: syncResizeHandles,
  };

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", install, { once: true })
    : install();
})();
