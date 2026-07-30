// Theme and layout editor
function readSavedTheme() {
  const preset = document.documentElement.dataset.theme;
  if (preset === "light" || preset === "dark") return preset;
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch (error) {
    return "dark";
  }
}

function cloneDefaultLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

function normalizeLayout(layout) {
  const normalized = cloneDefaultLayout();
  if (!layout || typeof layout !== "object") return normalized;

  Object.keys(DEFAULT_LAYOUT).forEach(key => {
    const item = layout[key];
    if (!item || typeof item !== "object") return;
    const left = Number(item.left);
    const top = Number(item.top);
    if (Number.isFinite(left)) normalized[key].left = left;
    if (Number.isFinite(top)) normalized[key].top = top;
  });

  return normalized;
}

function cloneDefaultDialogueArrows() {
  return { ...DEFAULT_DIALOGUE_ARROWS };
}

function normalizeDialogueArrows(arrows) {
  const normalized = cloneDefaultDialogueArrows();
  if (!arrows || typeof arrows !== "object") return normalized;

  Object.keys(DEFAULT_DIALOGUE_ARROWS).forEach(key => {
    if (DIALOGUE_ARROW_DIRECTIONS.has(arrows[key])) normalized[key] = arrows[key];
  });

  return normalized;
}

function readSavedLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY) || localStorage.getItem("texasHoldemTableLayoutV1");
    return normalizeLayout(JSON.parse(saved || "null"));
  } catch (error) {
    return cloneDefaultLayout();
  }
}

function readSavedDialogueArrows() {
  try {
    return normalizeDialogueArrows(JSON.parse(localStorage.getItem(LAYOUT_ARROW_STORAGE_KEY) || "null"));
  } catch (error) {
    return cloneDefaultDialogueArrows();
  }
}

function normalizePanelPosition(position) {
  const left = Number(position?.left);
  const top = Number(position?.top);
  return {
    left: Number.isFinite(left) ? left : DEFAULT_LAYOUT_PANEL.left,
    top: Number.isFinite(top) ? top : DEFAULT_LAYOUT_PANEL.top,
  };
}

function readSavedPanelPosition() {
  try {
    return normalizePanelPosition(JSON.parse(localStorage.getItem(LAYOUT_PANEL_STORAGE_KEY) || "null"));
  } catch (error) {
    return normalizePanelPosition(null);
  }
}

function updateThemeButton() {
  if (!els.themeButton) return;
  const isLight = state.theme === "light";
  els.themeButton.textContent = isLight ? "🌙 明暗" : "☀ 明暗";
  els.themeButton.setAttribute("aria-pressed", String(isLight));
}

function applyTheme(theme, { persist = true } = {}) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, state.theme);
    } catch (error) {
      console.warn("Theme preference was not saved:", error);
    }
  }
  updateThemeButton();
}

function layoutVarName(key, axis) {
  return `--layout-${key}-${axis}`;
}

function layoutSelectorFor(key) {
  return `[data-layout-key="${String(key).replace(/"/g, '\\"')}"]`;
}

function applyLayoutKey(key) {
  if (!els.arena || !state.layout.items[key]) return;
  const item = state.layout.items[key];
  els.arena.style.setProperty(layoutVarName(key, "left"), `${item.left}%`);
  els.arena.style.setProperty(layoutVarName(key, "top"), `${item.top}%`);
}

function applyDialogueArrows() {
  if (!els.arena) return;
  Object.keys(DEFAULT_DIALOGUE_ARROWS).forEach(key => {
    const target = els.arena.querySelector(layoutSelectorFor(key));
    if (target) target.dataset.arrow = state.layout.arrows[key] || DEFAULT_DIALOGUE_ARROWS[key];
  });
}

function applyLayout() {
  Object.keys(DEFAULT_LAYOUT).forEach(applyLayoutKey);
  applyDialogueArrows();
  applyLayoutPanelPosition();
  updateLayoutEditorUI();
}

function defaultPanelPosition() {
  if (!els.arena || !els.layoutEditorPanel) return { left: 0, top: DEFAULT_LAYOUT_PANEL.top };
  const arenaRect = els.arena.getBoundingClientRect();
  const panelRect = els.layoutEditorPanel.getBoundingClientRect();
  return {
    left: Math.max(8, arenaRect.width - panelRect.width - 16),
    top: DEFAULT_LAYOUT_PANEL.top,
  };
}

function panelBounds() {
  if (!els.arena || !els.layoutEditorPanel) return { minLeft: 0, maxLeft: 0, minTop: 0, maxTop: 0 };
  const arenaRect = els.arena.getBoundingClientRect();
  const panelRect = els.layoutEditorPanel.getBoundingClientRect();
  return {
    minLeft: 8,
    maxLeft: Math.max(8, arenaRect.width - panelRect.width - 8),
    minTop: 8,
    maxTop: Math.max(8, arenaRect.height - panelRect.height - 8),
  };
}

function applyLayoutPanelPosition() {
  if (!els.layoutEditorPanel || !els.arena) return;
  const fallback = defaultPanelPosition();
  const bounds = panelBounds();
  const left = state.layout.panel.left === null ? fallback.left : state.layout.panel.left;
  const top = state.layout.panel.top;
  state.layout.panel = {
    left: Number(clamp(left, bounds.minLeft, bounds.maxLeft).toFixed(1)),
    top: Number(clamp(top, bounds.minTop, bounds.maxTop).toFixed(1)),
  };
  els.layoutEditorPanel.style.setProperty("--layout-panel-left", `${state.layout.panel.left}px`);
  els.layoutEditorPanel.style.setProperty("--layout-panel-top", `${state.layout.panel.top}px`);
}

function saveLayoutPanelPosition() {
  try {
    localStorage.setItem(LAYOUT_PANEL_STORAGE_KEY, JSON.stringify(state.layout.panel));
  } catch (error) {
    console.warn("Layout panel position save failed:", error);
  }
}

function layoutLabelFor(key) {
  const target = els.arena?.querySelector(layoutSelectorFor(key));
  return target?.dataset.layoutLabel || key;
}

function isDialogueLayoutKey(key) {
  return /^dialogue[1-6]$/.test(key || "");
}

function selectLayoutItem(key) {
  if (!state.layout.items[key]) return;
  state.layout.selectedKey = key;
  updateLayoutEditorUI();
}

function snapLayoutValue(value) {
  const snap = LAYOUT_SNAP_POINTS.find(point => Math.abs(value - point) <= LAYOUT_SNAP_THRESHOLD);
  return snap === undefined ? value : snap;
}

function updateLayoutEditorUI() {
  if (!els.arena) return;
  els.arena.classList.toggle("layout-edit-mode", state.layout.editing);
  els.arena.classList.toggle("layout-edit-locked", state.layout.editing && state.layout.locked);
  els.arena.querySelectorAll("[data-layout-key]").forEach(node => {
    node.classList.toggle("is-layout-selected", node.dataset.layoutKey === state.layout.selectedKey);
  });

  if (els.layoutEditorPanel) els.layoutEditorPanel.hidden = !state.layout.editing;
  applyLayoutPanelPosition();
  if (els.layoutButton) {
    els.layoutButton.setAttribute("aria-pressed", String(state.layout.editing));
    els.layoutButton.textContent = state.layout.editing ? "✅ 完成編輯" : "🎛 編輯版面";
  }
  if (els.layoutStatus) {
    const selectedItem = state.layout.items[state.layout.selectedKey];
    const selectedText = selectedItem
      ? `${layoutLabelFor(state.layout.selectedKey)} (${selectedItem.left.toFixed(1)}%, ${selectedItem.top.toFixed(1)}%)`
      : layoutLabelFor(state.layout.selectedKey);
    els.layoutStatus.textContent = state.layout.locked
      ? "版面已鎖定，解鎖後才能拖曳。"
      : `拖曳或微調：${selectedText}`;
  }
  if (els.lockLayoutButton) {
    els.lockLayoutButton.textContent = state.layout.locked ? "🔒 已鎖定" : "🔓 鎖定版面";
  }
  els.layoutNudgeButtons?.forEach(button => {
    button.disabled = !state.layout.editing || state.layout.locked || !state.layout.selectedKey;
  });
  if (els.dialogueArrowControls) {
    const showArrowControls = state.layout.editing && isDialogueLayoutKey(state.layout.selectedKey);
    els.dialogueArrowControls.hidden = !showArrowControls;
    if (showArrowControls) {
      const arrow = state.layout.arrows[state.layout.selectedKey] || DEFAULT_DIALOGUE_ARROWS[state.layout.selectedKey];
      els.dialogueArrowButtons?.forEach(button => {
        button.disabled = state.layout.locked;
        button.classList.toggle("is-active", button.dataset.dialogueArrow === arrow);
      });
    }
  }
}

function setLayoutEditing(editing) {
  state.layout.editing = Boolean(editing);
  render();
  updateLayoutEditorUI();
  announce(state.layout.editing ? "版面編輯模式開啟" : "版面編輯模式關閉");
}

function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout.items));
    localStorage.setItem(LAYOUT_ARROW_STORAGE_KEY, JSON.stringify(state.layout.arrows));
    saveLayoutPanelPosition();
    announce("版面已儲存");
  } catch (error) {
    announce("版面儲存失敗");
    console.warn("Layout save failed:", error);
  }
}

function resetLayout() {
  state.layout.items = cloneDefaultLayout();
  state.layout.arrows = cloneDefaultDialogueArrows();
  state.layout.panel = normalizePanelPosition(null);
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_ARROW_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_PANEL_STORAGE_KEY);
  } catch (error) {
    console.warn("Layout reset failed:", error);
  }
  applyLayout();
  announce("版面已還原預設");
}

function autoArrangeLayout() {
  state.layout.items = cloneDefaultLayout();
  state.layout.arrows = cloneDefaultDialogueArrows();
  applyLayout();
  announce("已套用自動排列");
}

function toggleLayoutLock() {
  state.layout.locked = !state.layout.locked;
  updateLayoutEditorUI();
  announce(state.layout.locked ? "版面已鎖定" : "版面已解鎖");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function layoutBoundsFor(key, target) {
  const arenaRect = els.arena.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const widthPct = arenaRect.width ? (targetRect.width / arenaRect.width) * 100 : 0;
  const heightPct = arenaRect.height ? (targetRect.height / arenaRect.height) * 100 : 0;
  const centered = CENTERED_LAYOUT_KEYS.has(key);

  if (centered) {
    return {
      minLeft: widthPct / 2,
      maxLeft: 100 - widthPct / 2,
      minTop: heightPct / 2,
      maxTop: 100 - heightPct / 2,
    };
  }

  return {
    minLeft: 0,
    maxLeft: Math.max(0, 100 - widthPct),
    minTop: 0,
    maxTop: Math.max(0, 100 - heightPct),
  };
}

function moveLayoutItem(key, left, top, { snap = false } = {}) {
  const target = els.arena?.querySelector(layoutSelectorFor(key));
  if (!target || !state.layout.items[key]) return;
  const bounds = layoutBoundsFor(key, target);
  const nextLeft = snap ? snapLayoutValue(left) : left;
  const nextTop = snap ? snapLayoutValue(top) : top;

  state.layout.items[key] = {
    left: Number(clamp(nextLeft, bounds.minLeft, bounds.maxLeft).toFixed(2)),
    top: Number(clamp(nextTop, bounds.minTop, bounds.maxTop).toFixed(2)),
  };

  applyLayoutKey(key);
  updateLayoutEditorUI();
}

function nudgeSelectedLayout(direction, { step = LAYOUT_NUDGE_STEP, announceMove = true } = {}) {
  const key = state.layout.selectedKey;
  if (!state.layout.editing || state.layout.locked || !state.layout.items[key]) return;
  const item = state.layout.items[key];
  const delta = {
    up: [0, -step],
    down: [0, step],
    left: [-step, 0],
    right: [step, 0],
  }[direction];
  if (!delta) return;
  moveLayoutItem(key, item.left + delta[0], item.top + delta[1]);
  if (announceMove) announce(`${layoutLabelFor(key)} 已微調`);
}

function setSelectedDialogueArrow(direction) {
  const key = state.layout.selectedKey;
  if (!state.layout.editing || state.layout.locked || !isDialogueLayoutKey(key)) return;
  if (!DIALOGUE_ARROW_DIRECTIONS.has(direction)) return;
  state.layout.arrows[key] = direction;
  const target = els.arena?.querySelector(layoutSelectorFor(key));
  if (target) target.dataset.arrow = direction;
  updateLayoutEditorUI();
  announce(`${layoutLabelFor(key)} 箭頭已調整`);
}

function handleLayoutKeyboard(event) {
  if (!state.layout.editing || state.layout.locked) return;
  const direction = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  }[event.key];
  if (!direction) return;

  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;

  nudgeSelectedLayout(direction, {
    step: event.shiftKey ? LAYOUT_NUDGE_FAST_STEP : LAYOUT_NUDGE_STEP,
    announceMove: false,
  });
  event.preventDefault();
}

function beginLayoutPanelDrag(event) {
  if (!state.layout.editing || !els.arena || !els.layoutEditorPanel) return;
  if (event.button !== undefined && event.button !== 0) return;

  const panelRect = els.layoutEditorPanel.getBoundingClientRect();
  const arenaRect = els.arena.getBoundingClientRect();
  state.layout.panelDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - panelRect.left,
    offsetY: event.clientY - panelRect.top,
    arenaLeft: arenaRect.left,
    arenaTop: arenaRect.top,
  };

  els.layoutEditorPanel.classList.add("is-panel-dragging");
  els.layoutPanelHandle?.setPointerCapture?.(event.pointerId);
  event.stopPropagation();
  event.preventDefault();
}

function moveLayoutPanelDrag(event) {
  const drag = state.layout.panelDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const bounds = panelBounds();
  state.layout.panel = {
    left: Number(clamp(event.clientX - drag.arenaLeft - drag.offsetX, bounds.minLeft, bounds.maxLeft).toFixed(1)),
    top: Number(clamp(event.clientY - drag.arenaTop - drag.offsetY, bounds.minTop, bounds.maxTop).toFixed(1)),
  };
  applyLayoutPanelPosition();
  event.stopPropagation();
  event.preventDefault();
}

function endLayoutPanelDrag(event) {
  const drag = state.layout.panelDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  els.layoutEditorPanel?.classList.remove("is-panel-dragging");
  els.layoutPanelHandle?.releasePointerCapture?.(event.pointerId);
  state.layout.panelDrag = null;
  saveLayoutPanelPosition();
  event.stopPropagation();
}

function beginLayoutDrag(event) {
  if (!state.layout.editing || state.layout.locked || !els.arena) return;
  if (event.button !== undefined && event.button !== 0) return;

  const target = event.target.closest("[data-layout-key]");
  if (!target || !els.arena.contains(target) || target.closest(".layout-editor-panel")) return;

  const key = target.dataset.layoutKey;
  if (!state.layout.items[key]) return;
  selectLayoutItem(key);

  const rect = target.getBoundingClientRect();
  const centered = CENTERED_LAYOUT_KEYS.has(key);
  const refX = centered ? rect.left + rect.width / 2 : rect.left;
  const refY = centered ? rect.top + rect.height / 2 : rect.top;

  state.layout.drag = {
    key,
    target,
    pointerId: event.pointerId,
    offsetX: event.clientX - refX,
    offsetY: event.clientY - refY,
  };

  target.classList.add("is-layout-dragging");
  els.arena.classList.add("layout-edit-dragging");
  target.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveLayoutDrag(event) {
  const drag = state.layout.drag;
  if (!drag || drag.pointerId !== event.pointerId || !els.arena) return;

  const arenaRect = els.arena.getBoundingClientRect();
  if (!arenaRect.width || !arenaRect.height) return;

  const left = ((event.clientX - arenaRect.left - drag.offsetX) / arenaRect.width) * 100;
  const top = ((event.clientY - arenaRect.top - drag.offsetY) / arenaRect.height) * 100;

  moveLayoutItem(drag.key, left, top, { snap: true });
  event.preventDefault();
}

function endLayoutDrag(event) {
  const drag = state.layout.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  drag.target.classList.remove("is-layout-dragging");
  drag.target.releasePointerCapture?.(event.pointerId);
  state.layout.drag = null;
  els.arena?.classList.remove("layout-edit-dragging");
}
