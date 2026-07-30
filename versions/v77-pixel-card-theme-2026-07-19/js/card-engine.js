// Deck and hand evaluation
function createDeck() {
  return suits.flatMap(suit => ranks.map(rank => ({ ...rank, suit: suit.key, suitSymbol: suit.symbol })));
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardKey(card) {
  return `${card.value}${card.suit}`;
}

function evaluateBestHand(cards) {
  return combinations(cards, 5).map(evaluateFive).sort(compareResults).at(-1);
}

function evaluateFive(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const vc = new Map();
  for (const v of values) vc.set(v, (vc.get(v) || 0) + 1);
  const groups = [...vc.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || b.value - a.value);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const sh = getStraightHigh(values);

  if (flush && sh === 14) {
    const hasRoyal = values.includes(14) && values.includes(13) && values.includes(12) && values.includes(11) && values.includes(10);
    if (hasRoyal) return result(9, [14]);
  }

  if (flush && sh) return result(8, [sh]);
  if (groups[0].count === 4) return result(7, [groups[0].value, kicker(values, [groups[0].value])[0]]);
  if (groups[0].count === 3 && groups[1]?.count === 2) return result(6, [groups[0].value, groups[1].value]);
  if (flush) return result(5, values);
  if (sh) return result(4, [sh]);
  if (groups[0].count === 3) return result(3, [groups[0].value, ...kicker(values, [groups[0].value])]);
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairs = groups.filter(g => g.count === 2).map(g => g.value).sort((a, b) => b - a);
    return result(2, [...pairs, ...kicker(values, pairs)]);
  }
  if (groups[0].count === 2) return result(1, [groups[0].value, ...kicker(values, [groups[0].value])]);
  return result(0, values);
}

function result(score, tiebreakers) { return { score, tiebreakers, name: handNames[score] }; }
function kicker(values, excluded) { return values.filter(v => !excluded.includes(v)); }

function getStraightHigh(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i++) {
    const run = unique.slice(i, i + 5);
    if (run[0] - run[4] === 4) return run[0] === 1 ? 5 : run[0];
  }
  return 0;
}

function compareResults(a, b) {
  if (a.score !== b.score) return a.score - b.score;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if ((a.tiebreakers[i] || 0) !== (b.tiebreakers[i] || 0)) {
      return (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    }
  }
  return 0;
}

function combinations(items, size) {
  const output = [];
  function walk(start, combo) {
    if (combo.length === size) { output.push(combo); return; }
    for (let i = start; i < items.length; i++) walk(i + 1, [...combo, items[i]]);
  }
  walk(0, []);
  return output;
}
