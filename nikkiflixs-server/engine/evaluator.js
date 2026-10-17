'use strict';
// 7-card Texas Hold'em hand evaluator.
// Returns a numeric score; higher wins. Ties compare equal.
// Score layout: category (0-8) * 13^5 + base-13 tiebreak ranks.

const POW13 = [1, 13, 169, 2197, 28561, 371293]; // 13^0 .. 13^5

function encodeScore(category, tiebreaks) {
  // tiebreaks: up to 5 ranks (0-12), most significant first
  let s = category * POW13[5];
  for (let i = 0; i < 5; i++) {
    const r = i < tiebreaks.length ? tiebreaks[i] : 0;
    s += r * POW13[4 - i];
  }
  return s;
}

// Evaluate exactly 5 cards. Returns { score, category, name }.
function evaluate5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a); // desc
  const suits = cards.map(c => c.suit);
  const flush = suits.every(s => s === suits[0]);

  // distinct ranks desc
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) {
      straightHigh = uniq[0];
    } else if (uniq[0] === 12 && uniq[1] === 3) {
      // wheel: A-5-4-3-2
      straightHigh = 3; // 5-high
    }
  }

  // rank frequencies
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // groups sorted by (count desc, rank desc)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const isStraight = straightHigh >= 0;

  if (isStraight && flush) {
    return { score: encodeScore(8, [straightHigh]), category: 8, name: 'Straight Flush' };
  }
  if (groups[0][1] === 4) {
    const quad = groups[0][0], kick = groups[1][0];
    return { score: encodeScore(7, [quad, kick]), category: 7, name: 'Four of a Kind' };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { score: encodeScore(6, [groups[0][0], groups[1][0]]), category: 6, name: 'Full House' };
  }
  if (flush) {
    return { score: encodeScore(5, ranks), category: 5, name: 'Flush' };
  }
  if (isStraight) {
    return { score: encodeScore(4, [straightHigh]), category: 4, name: 'Straight' };
  }
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { score: encodeScore(3, [groups[0][0], ...kickers]), category: 3, name: 'Three of a Kind' };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kick = groups[2][0];
    return { score: encodeScore(2, [...pairs, kick]), category: 2, name: 'Two Pair' };
  }
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { score: encodeScore(1, [groups[0][0], ...kickers]), category: 1, name: 'One Pair' };
  }
  return { score: encodeScore(0, ranks), category: 0, name: 'High Card' };
}

// Evaluate 7 cards (2 hole + 5 board). Returns best { score, category, name, best5 }.
function evaluate7(cards) {
  if (cards.length !== 7) throw new Error('evaluate7 needs exactly 7 cards');
  let best = null;
  // all 21 5-card combos
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const r = evaluate5(five);
            if (!best || r.score > best.score) {
              best = { ...r, best5: five };
            }
          }
  return best;
}

module.exports = { evaluate5, evaluate7, encodeScore };
