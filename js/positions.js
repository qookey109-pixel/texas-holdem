// Seat position helpers
function positionLabel(player) {
  if (!player || !state.players.length) return "--";
  const offset = (player.position - state.dealerIndex + state.players.length) % state.players.length;

  if (state.players.length === 2) {
    return offset === 0 ? "BTN/SB" : "BB";
  }

  const labels = ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO", "Seat"];
  return labels[offset] || "Seat " + (offset + 1);
}

function positionClass(label) {
  return String(label || "seat").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
