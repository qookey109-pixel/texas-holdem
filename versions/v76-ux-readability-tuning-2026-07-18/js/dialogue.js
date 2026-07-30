// Table dialogue system
function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clearDialogueTimers() {
  state.dialogueTimers.forEach(timer => window.clearTimeout(timer));
  state.dialogueTimers = [];
}

function dialogueLinesFor(player, event) {
  return DIALOGUE_BANK[player.name]?.[event] || DIALOGUE_BANK.default?.[event] || [];
}

function say(player, event, { force = false, chance = 1 } = {}) {
  if (!player || player.isHuman) return false;
  const lines = dialogueLinesFor(player, event);
  if (!lines.length) return false;
  const now = Date.now();
  if (!force && Math.random() > chance) return false;
  if (!force && player.lastDialogueAt && now - player.lastDialogueAt < DIALOGUE_COOLDOWN_MS) return false;
  if (!force && state.streetDialogueCount >= MAX_DIALOGUE_PER_STREET) return false;

  const line = randomItem(lines);
  player.dialogue = line;
  player.dialogueTone = event;
  player.lastDialogueAt = now;
  if (!force) state.streetDialogueCount += 1;

  const timer = window.setTimeout(() => {
    if (player.dialogue === line) {
      player.dialogue = "";
      player.dialogueTone = "";
      render();
    }
  }, DIALOGUE_DISPLAY_MS);
  state.dialogueTimers.push(timer);
  return true;
}

function tableTalk(event, { actor = null, force = false, chance = 0.35, exclude = [] } = {}) {
  if (actor && !actor.isHuman) return say(actor, event, { force, chance });
  if (!force && Math.random() > chance) return false;

  const excluded = new Set(exclude);
  const candidates = state.players
    .slice(1)
    .filter(player => !player.folded && !excluded.has(player))
    .sort(() => Math.random() - 0.5);

  for (const player of candidates) {
    if (say(player, event, { force, chance: 1 })) return true;
  }
  return false;
}
