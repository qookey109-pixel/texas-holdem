// Visually rebalance shrinking tournament tables without changing betting positions.
(() => {
  "use strict";

  if (window.TournamentSeatBalance?.version) return;
  if (typeof window.render !== "function" || typeof state !== "object") return;

  const SLOT_PLANS = Object.freeze({
    1: Object.freeze([{ slot: 3, center: true }]),
    2: Object.freeze([{ slot: 2 }, { slot: 5 }]),
    3: Object.freeze([{ slot: 1 }, { slot: 3, center: true }, { slot: 6 }]),
    4: Object.freeze([{ slot: 1 }, { slot: 2 }, { slot: 5 }, { slot: 6 }]),
    5: Object.freeze([
      { slot: 1 },
      { slot: 2 },
      { slot: 3, center: true },
      { slot: 5 },
      { slot: 6 },
    ]),
    6: Object.freeze([
      { slot: 1 },
      { slot: 2 },
      { slot: 3 },
      { slot: 4 },
      { slot: 5 },
      { slot: 6 },
    ]),
  });

  const CENTER_LAYOUT_KEYS = Object.freeze({
    seat: ["seat3", "seat4"],
    cards: ["seatCards3", "seatCards4"],
    dialogue: ["dialogue3", "dialogue4"],
  });

  function isTournamentActive() {
    return state.gameMode === "tournament"
      || Boolean(window.TournamentMode?.isActive?.());
  }

  function slotsForCount(count) {
    const normalized = Math.max(0, Math.min(6, Number(count) || 0));
    const plan = SLOT_PLANS[normalized] || [];
    return plan.map(item => ({ ...item }));
  }

  function midpointFor(type) {
    const keys = CENTER_LAYOUT_KEYS[type];
    const first = keys ? state.layout?.items?.[keys[0]] : null;
    const second = keys ? state.layout?.items?.[keys[1]] : null;
    if (!first || !second) return null;

    return {
      left: Number(((Number(first.left) + Number(second.left)) / 2).toFixed(2)),
      top: Number(((Number(first.top) + Number(second.top)) / 2).toFixed(2)),
    };
  }

  function replaceNumberedClass(node, prefix, slot) {
    if (!node) return;
    [...node.classList]
      .filter(className => className.startsWith(prefix))
      .forEach(className => node.classList.remove(className));
    node.classList.add(`${prefix}${slot}`);
  }

  function applyCoordinates(node, coordinates) {
    if (!node) return;
    if (!coordinates) {
      node.style.removeProperty("left");
      node.style.removeProperty("top");
      delete node.dataset.balancedCenter;
      return;
    }

    node.style.left = `${coordinates.left}%`;
    node.style.top = `${coordinates.top}%`;
    node.dataset.balancedCenter = "true";
  }

  function applySeatNode(node, config, logicalPosition) {
    if (!node) return;
    replaceNumberedClass(node, "seat-pos-", config.slot);
    node.dataset.layoutKey = `seat${config.slot}`;
    node.dataset.logicalPosition = String(logicalPosition);
    node.dataset.displaySeat = String(config.slot);
    applyCoordinates(node, config.center ? midpointFor("seat") : null);
  }

  function applyCardNode(node, config, logicalPosition) {
    if (!node) return;
    replaceNumberedClass(node, "seat-cards-pos-", config.slot);
    node.dataset.layoutKey = `seatCards${config.slot}`;
    node.dataset.logicalPosition = String(logicalPosition);
    node.dataset.displaySeat = String(config.slot);
    applyCoordinates(node, config.center ? midpointFor("cards") : null);
  }

  function applyDialogueNode(node, config, logicalPosition) {
    if (!node) return;
    replaceNumberedClass(node, "dialogue-pos-", config.slot);
    const dialogueKey = `dialogue${config.slot}`;
    node.dataset.layoutKey = dialogueKey;
    node.dataset.logicalPosition = String(logicalPosition);
    node.dataset.displaySeat = String(config.slot);
    node.dataset.arrow = state.layout?.arrows?.[dialogueKey]
      || (typeof DEFAULT_DIALOGUE_ARROWS === "object" ? DEFAULT_DIALOGUE_ARROWS[dialogueKey] : "")
      || "down";
    applyCoordinates(node, config.center ? midpointFor("dialogue") : null);
  }

  function dialogueNodesByLogicalPosition() {
    const map = new Map();
    document.querySelectorAll("#opponents .seat-dialogue").forEach(node => {
      const savedPosition = Number(node.dataset.logicalPosition);
      const classPosition = [...node.classList]
        .map(className => className.match(/^dialogue-pos-(\d)$/)?.[1])
        .find(Boolean);
      const logicalPosition = Number.isFinite(savedPosition) && savedPosition > 0
        ? savedPosition
        : Number(classPosition);
      if (logicalPosition > 0) map.set(logicalPosition, node);
    });
    return map;
  }

  function apply() {
    const opponents = Array.isArray(state.players)
      ? state.players.filter(player => !player?.isHuman)
      : [];
    const seatNodes = [...document.querySelectorAll("#opponents .seat")];
    const cardNodes = [...document.querySelectorAll("#opponents .seat-card-zone")];
    if (!seatNodes.length || seatNodes.length !== opponents.length) return false;

    const shouldBalance = isTournamentActive() && opponents.length < 6;
    const plan = shouldBalance
      ? slotsForCount(opponents.length)
      : opponents.map(player => ({ slot: player.position, center: false }));
    const dialogueMap = dialogueNodesByLogicalPosition();

    opponents.forEach((player, index) => {
      const logicalPosition = Number(player.position) || index + 1;
      const config = plan[index] || { slot: logicalPosition, center: false };
      applySeatNode(seatNodes[index], config, logicalPosition);
      applyCardNode(cardNodes[index], config, logicalPosition);
      applyDialogueNode(dialogueMap.get(logicalPosition), config, logicalPosition);
    });

    if (document.querySelector("#opponents")) {
      document.querySelector("#opponents").dataset.seatBalance = shouldBalance
        ? `balanced-${opponents.length}`
        : "full";
    }

    if (typeof updateLayoutEditorUI === "function") updateLayoutEditorUI();
    return shouldBalance;
  }

  const originalRender = window.render;
  window.render = function renderWithTournamentSeatBalance(...args) {
    const result = originalRender.apply(this, args);
    apply();
    return result;
  };

  if (typeof window.applyLayoutKey === "function") {
    const originalApplyLayoutKey = window.applyLayoutKey;
    window.applyLayoutKey = function applyLayoutKeyWithTournamentBalance(key, ...args) {
      const result = originalApplyLayoutKey.call(this, key, ...args);
      if ([
        "seat3", "seat4",
        "seatCards3", "seatCards4",
        "dialogue3", "dialogue4",
      ].includes(key)) {
        apply();
      }
      return result;
    };
  }

  function snapshot() {
    return {
      active: isTournamentActive(),
      opponentCount: (state.players || []).filter(player => !player?.isHuman).length,
      seats: [...document.querySelectorAll("#opponents .seat")].map(node => ({
        logicalPosition: Number(node.dataset.logicalPosition || node.dataset.profilePosition),
        displaySeat: Number(node.dataset.displaySeat),
        centered: node.dataset.balancedCenter === "true",
        left: node.style.left || "",
        top: node.style.top || "",
      })),
    };
  }

  window.TournamentSeatBalance = Object.freeze({
    version: "1.0.0",
    apply,
    slotsForCount,
    snapshot,
  });

  apply();
})();
