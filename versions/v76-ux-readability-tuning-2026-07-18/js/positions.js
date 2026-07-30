// Seat position helpers
function positionLabel(player) {
  if (!player || !state.players.length) return "--";
  const labels = ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO", "Seat"];
  const offset = (player.position - state.dealerIndex + state.players.length) % state.players.length;
  return labels[offset] || "Seat " + (offset + 1);
}

function positionClass(label) {
  return String(label || "seat").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
