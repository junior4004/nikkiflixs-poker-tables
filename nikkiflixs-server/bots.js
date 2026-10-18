'use strict';
// House bots for the Nikkiflixs poker tables.
//
// Why bots exist: a poker table with nobody in it looks dead, and nobody
// joins a dead table. Bots fill every seat that isn't reserved for display
// or taken by a human, so every table always looks full and alive. When a
// real human joins and no physical seat is free, one bot quietly leaves
// first (yield-on-join) — everyone inside just sees one player leave and
// one arrive. When the table is all humans, bots stay away entirely.
//
// Two hard rules:
//   1. Bots are INDISTINGUISHABLE from humans in all server-sent state:
//      UUID tokens (same as humans), human-like names, no "bot" flags,
//      no special fields anywhere a client can see.
//   2. Bots act only through the engine's validated action path
//      (engine.act), exactly like a socket client would. A bot can never
//      crash a hand: every decision is validated, with safe fallbacks.

const { randomUUID } = require('crypto');
const { evaluate5, evaluate7 } = require('./engine/evaluator');

// Best 5-card hand from 5, 6, or 7 cards (flop/turn/river all work).
function bestHand(cards) {
  if (cards.length <= 5) {
    const r = evaluate5(cards);
    return { category: r.category, five: cards };
  }
  if (cards.length === 6) {
    let best = null;
    for (let skip = 0; skip < 6; skip++) {
      const five = cards.filter((_, i) => i !== skip);
      const r = evaluate5(five);
      if (!best || r.score > best.score) best = { category: r.category, five };
    }
    return best;
  }
  const r = evaluate7(cards);
  return { category: r.category, five: r.best5 };
}

// ---------------------------------------------------------------------------
// Bot identities: ~40 realistic "First L." names.
// Nothing in this pool may contain the substring "bot" (case-insensitive) —
// a client-side snoop for "bot" must find nothing.
// ---------------------------------------------------------------------------
const BOT_NAMES = [
  'Marcus T.', 'Dana W.', 'Priya S.', 'Jake M.', 'Lena K.', 'Chris P.',
  'Sofia R.', 'Devon A.', 'Maya L.', 'Tom H.', 'Nadia F.', 'Owen D.',
  'Grace C.', 'Sam V.', 'Elena B.', 'Mike R.', 'Tara N.', 'Leo G.',
  'Aisha K.', 'Ben F.', 'Rosa M.', 'Kyle J.', 'Nina P.', 'Omar S.',
  'Holly D.', 'Evan T.', 'June C.', 'Paul W.', 'Ivy L.', 'Cole B.',
  'Mira H.', 'Zack R.', 'Ava N.', 'Dean S.', 'Lily F.', 'Owen K.',
  'Ruth A.', 'Max D.', 'Sara J.', 'Victor L.', 'Amy C.', 'Raj P.',
];

// ---------------------------------------------------------------------------
// Bot brain: tight-aggressive baseline.
//   - Premium hands -> bet/raise for value (pot-fraction sizing).
//   - Medium hands -> call at a fair price, check when free.
//   - Weak hands  -> check when free, fold to bets, rare bluff in position.
// Hand strength comes from the same evaluator the server uses for showdowns.
// Position: acting later (further from the button) plays slightly looser.
// Returns { action, amount } or null when it's not this bot's turn.
// Never throws: callers still wrap it defensively.
// ---------------------------------------------------------------------------
function handStrength(engine, p) {
  const hole = p.hole || [];
  if (hole.length < 2) return 0;
  const [a, b] = hole;

  // ---- preflop: hole-card buckets ----
  if (engine.board.length === 0) {
    if (a.rank === b.rank) {
      if (a.rank >= 10) return 0.95; // TT+
      if (a.rank >= 7) return 0.8;   // 99-88
      return 0.6;                    // small pairs
    }
    const hi = Math.max(a.rank, b.rank);
    const lo = Math.min(a.rank, b.rank);
    const suited = a.suit === b.suit;
    const gap = hi - lo;
    let s = 0.22 + (hi / 12) * 0.28; // high-card baseline scales with top card
    if (hi >= 10 && lo >= 8) s += 0.14; // two broadway cards
    if (suited) s += 0.06;
    if (gap === 1) s += 0.05;
    else if (gap <= 3) s += 0.02;
    if (hi === 12) s += 0.08; // ace-high
    return Math.min(0.9, s);
  }

  // ---- postflop: evaluator category + draw bonuses ----
  const cards = [...hole, ...engine.board];
  const bh = bestHand(cards);
  let s;
  switch (bh.category) {
    case 8: s = 1.0; break;   // straight flush
    case 7: s = 0.98; break;  // quads
    case 6: s = 0.95; break;  // full house
    case 5: s = 0.9; break;   // flush
    case 4: s = 0.85; break;  // straight
    case 3: s = 0.8; break;   // trips
    case 2: s = 0.68; break;  // two pair
    case 1: {
      // one pair: overpair > top pair > underpair (approximate)
      const pairRank = pairRankOf(bh.five);
      const boardMax = Math.max(...engine.board.map(c => c.rank));
      const boardHas = (r) => engine.board.some(c => c.rank === r);
      if (!boardHas(pairRank) && pairRank > boardMax) s = 0.72; // overpair
      else if (boardHas(pairRank)) s = 0.58;                    // paired board
      else s = 0.48;                                           // underpair
      break;
    }
    default: s = 0.3; // high card
  }
  // draw bonus: 4-flush or open-ended straight draw plays like a medium hand
  if (s < 0.55 && hasDraw(cards)) s = Math.max(s, 0.52);
  return Math.min(1, s);
}

function pairRankOf(best5) {
  const counts = new Map();
  for (const c of best5) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  let best = -1;
  for (const [r, n] of counts) if (n === 2 && r > best) best = r;
  return best;
}

function hasDraw(cards) {
  // 4 to a flush?
  const suits = [0, 0, 0, 0];
  for (const c of cards) suits[c.suit]++;
  if (Math.max(...suits) === 4) return true;
  // 4 to a straight (open-ended-ish): any 4 distinct ranks spanning <= 4,
  // plus wheel A-5-4-3-2 coverage via rank 12 treated as -1.
  const ranks = new Set(cards.map(c => c.rank));
  if (ranks.has(12)) ranks.add(-1);
  const sorted = [...ranks].sort((x, y) => x - y);
  for (let i = 0; i + 3 < sorted.length; i++) {
    if (sorted[i + 3] - sorted[i] <= 4) {
      // 4 distinct ranks within a 5-span: at least a gutshot, often open-ended
      const window = sorted.slice(i, i + 4);
      const distinct = new Set(window).size;
      if (distinct === 4 && window[3] - window[0] === 3) return true; // open-ended
    }
  }
  return false;
}

function decideAction(engine, token, rng = Math.random) {
  // Not my turn -> no decision. This is what keeps bots from acting out of turn.
  if (engine.actingToken !== token) return null;
  const legal = engine.legalActions(token);
  if (!legal.length) return null;
  const p = engine.players.get(token);
  if (!p || p.folded || p.allIn) return null;

  const toCall = engine.currentBet - p.betStreet;
  const pot = engine.potTotal;
  const strength = handStrength(engine, p);

  // position: distance clockwise from the button; late position plays looser
  const maxP = engine.maxPlayers;
  const dist = (((p.seat - engine.dealerIndex) % maxP) + maxP) % maxP;
  const latePos = dist > maxP / 2;
  const loosen = latePos ? 0.05 : 0;

  const canRaise = legal.includes('raise');
  const minTo = canRaise ? engine.minRaiseTo(token) : 0;
  const maxTo = canRaise ? engine.maxRaiseTo(token) : 0;
  const raiseTo = (frac) => {
    const target = Math.round(engine.currentBet + Math.max(pot * frac, engine.bigBlind));
    return Math.min(Math.max(target, minTo), maxTo);
  };

  // premium: value bet / raise
  if (strength >= 0.72 - loosen) {
    if (canRaise && (toCall > 0 || rng() < 0.6)) {
      return { action: 'raise', amount: raiseTo(0.55 + rng() * 0.25) };
    }
    if (legal.includes('call')) return { action: 'call' };
    if (legal.includes('check')) return { action: 'check' };
    return { action: 'fold' };
  }

  // medium: call at a fair price, never chase bad odds
  if (strength >= 0.45 - loosen) {
    if (toCall === 0) {
      if (legal.includes('check')) return { action: 'check' };
    } else if (toCall <= Math.max(pot * 0.3, engine.bigBlind * 2) && legal.includes('call')) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // weak: check when free, fold to any bet, rare positional bluff
  if (toCall === 0) {
    if (latePos && rng() < 0.08 && canRaise) return { action: 'raise', amount: raiseTo(0.5) };
    if (legal.includes('check')) return { action: 'check' };
  }
  return { action: 'fold' };
}

// ---------------------------------------------------------------------------
// BotManager: keeps tables full of bots, yields seats to humans.
// ---------------------------------------------------------------------------
class BotManager {
  // rooms: RoomManager. tableConfigs: [{ id, maxSeats, displayOpen, ... }].
  constructor(rooms, tableConfigs) {
    this.rooms = rooms;
    this.configs = new Map(tableConfigs.map(c => [c.id, c]));
    this.botTokens = new Map(); // tableId -> Set(token). The ONLY record of bot-ness; never sent to clients.
  }

  configFor(tableId) {
    const cfg = this.configs.get(tableId);
    if (cfg) return cfg;
    // ad-hoc tables (tests): derive from the engine, 1 display seat by default
    const room = this.rooms.getTable(tableId);
    const maxSeats = room ? room.engine.maxPlayers : 8;
    return { id: tableId, maxSeats, displayOpen: 1 };
  }

  tokensFor(tableId) {
    if (!this.botTokens.has(tableId)) this.botTokens.set(tableId, new Set());
    return this.botTokens.get(tableId);
  }

  isBot(tableId, token) {
    return this.tokensFor(tableId).has(token);
  }

  counts(tableId) {
    const room = this.rooms.getTable(tableId);
    if (!room) return { humans: 0, bots: 0 };
    const bt = this.tokensFor(tableId);
    let bots = 0, humans = 0;
    for (const t of room.engine.players.keys()) (bt.has(t) ? bots++ : humans++);
    return { humans, bots };
  }

  // Target bot count: fill every seat except the display-open ones and the
  // humans' seats. All-human table -> 0 bots (they fade out and stay out).
  targetBots(tableId) {
    const room = this.rooms.getTable(tableId);
    if (!room) return 0;
    const cfg = this.configFor(tableId);
    const { humans } = this.counts(tableId);
    if (humans >= cfg.maxSeats) return 0;
    return Math.max(0, cfg.maxSeats - cfg.displayOpen - humans);
  }

  // Reconcile: top up or trim bots toward the target. Safe to call often
  // (every sync); it only changes things when counts drift.
  reconcile(tableId) {
    const room = this.rooms.getTable(tableId);
    if (!room) return;
    const eng = room.engine;
    const bt = this.tokensFor(tableId);
    // forget tokens for players already gone (defensive; stays consistent)
    for (const t of [...bt]) if (!eng.players.has(t)) bt.delete(t);

    let { bots } = this.counts(tableId);
    const target = this.targetBots(tableId);

    // trim extras: broke bots first, then sidelined, then anyone not mid-hand
    while (bots > target) {
      const victim = this.pickYieldCandidate(tableId);
      if (!victim) break;
      this.removeBot(tableId, victim);
      bots--;
    }
    // top up
    while (bots < target) {
      if (!this.addBot(tableId)) break;
      bots++;
    }
  }

  // Choose which bot leaves. Preference order keeps hands healthy:
  // broke (sitting out) -> sidelined -> folded/not in hand -> anyone.
  // engine.removePlayer already folds a mid-hand bot safely, so even the
  // last resort can't corrupt pot or hand state.
  pickYieldCandidate(tableId) {
    const room = this.rooms.getTable(tableId);
    if (!room) return null;
    const eng = room.engine;
    const bt = this.tokensFor(tableId);
    const botPlayers = [...bt].map(t => eng.players.get(t)).filter(Boolean);
    if (!botPlayers.length) return null;
    const inHand = eng.state !== 'waiting';
    const rank = (p) => {
      if (p.stack <= 0 || p.sittingOut) return 0;
      if (!inHand || p.folded) return 1;
      return 2; // active mid-hand: last resort
    };
    botPlayers.sort((a, b) => rank(a) - rank(b));
    return botPlayers[0].token;
  }

  addBot(tableId) {
    const room = this.rooms.getTable(tableId);
    if (!room) return false;
    const eng = room.engine;
    const bt = this.tokensFor(tableId);
    // unique name per table
    const used = new Set([...eng.players.values()].map(p => p.name));
    const pool = BOT_NAMES.filter(n => !used.has(n));
    if (!pool.length) return false;
    const name = pool[Math.floor(Math.random() * pool.length)];
    const token = randomUUID(); // UUID, exactly like a human token
    const seat = eng.addPlayer(token, name, eng.startingStack);
    if (seat < 0) return false;
    bt.add(token);
    return true;
  }

  removeBot(tableId, token) {
    const room = this.rooms.getTable(tableId);
    if (!room) return;
    room.engine.removePlayer(token); // folds safely mid-hand if needed
    this.tokensFor(tableId).delete(token);
  }

  // Yield-on-join: free one physical seat for an incoming human.
  // Returns true if a bot left (seat now free), false if no bot to yield.
  yieldForHuman(tableId) {
    const victim = this.pickYieldCandidate(tableId);
    if (!victim) return false;
    this.removeBot(tableId, victim);
    return true;
  }

  // Seat a human with yield fallback. Returns seat index, or -1 when the
  // table is genuinely full of humans (caller sends a clean table-full error).
  seatHuman(tableId, token, name, buyIn) {
    const room = this.rooms.getTable(tableId);
    if (!room) return -1;
    let seat = room.engine.addPlayer(token, name, buyIn);
    if (seat >= 0) return seat;
    if (!this.yieldForHuman(tableId)) return -1;
    return room.engine.addPlayer(token, name, buyIn);
  }

  // One bot action per call (called on a timer; pacing looks human).
  // Also auto-folds a disconnected human whose turn has been stuck >60s,
  // so a ghost can't freeze a table full of bots. Returns true if it acted.
  tickTable(tableId, rng = Math.random) {
    const room = this.rooms.getTable(tableId);
    if (!room) return false;
    const eng = room.engine;
    const acting = eng.actingToken;
    if (!acting) return false;
    // Safety net: an acting player with no legal actions (shouldn't happen)
    // must never stall the table — fold them out and advance.
    const stuck = eng.players.get(acting);
    if (stuck && eng.legalActions(acting).length === 0) {
      console.warn('[bots] force-folding stuck actor', stuck.name, 'on', tableId);
      stuck.folded = true;
      eng.toAct = eng.toAct.filter(t => t !== acting);
      eng.checkStreetEnd();
      return true;
    }

    if (this.isBot(tableId, acting)) {
      let decision = null;
      try {
        decision = decideAction(eng, acting, rng);
      } catch (e) { decision = null; }
      if (!decision) {
        const legal = eng.legalActions(acting);
        decision = legal.includes('check') ? { action: 'check' } : { action: 'fold' };
      }
      const res = eng.act(acting, decision.action, decision.amount || 0);
      if (!res.ok) eng.act(acting, 'fold'); // last resort; engine validates
      return true;
    }

    // disconnected human stuck on their turn: nudge the hand along
    if (!room.sockets.has(acting)) {
      const lastSeen = room.lastSeen.get(acting) || 0;
      if (Date.now() - lastSeen > 60000) {
        const legal = eng.legalActions(acting);
        eng.act(acting, legal.includes('check') ? 'check' : 'fold');
        return true;
      }
    }
    return false;
  }

  // Public-safe lobby summary. `displayOpen` is the marketed "seats open!"
  // number, but it never exceeds what a human can actually join right now
  // (a free seat, or a bot that can yield). All-human full tables show 0.
  summary(tableId) {
    const { humans, bots } = this.counts(tableId);
    const cfg = this.configFor(tableId);
    const room = this.rooms.getTable(tableId);
    const players = room ? [...room.engine.players.values()].map(p => p.name) : [];
    const filled = humans + bots;
    const physicalFree = Math.max(0, cfg.maxSeats - filled);
    // A human can join while a seat is free OR a bot can yield one.
    const joinable = bots > 0 ? Math.max(physicalFree, cfg.displayOpen) : physicalFree;
    const open = Math.max(0, Math.min(cfg.displayOpen, joinable));
    return {
      id: cfg.id,
      name: cfg.name || cfg.id,
      stakes: cfg.stakes || '',
      felt: cfg.felt || '',
      maxSeats: cfg.maxSeats,
      humans, bots, filled,
      displayOpen: open,
      page: cfg.page || ('/' + cfg.id + '-node.html'),
      players, // names only — never which are bots
    };
  }
}

module.exports = { BotManager, BOT_NAMES, decideAction, handStrength };
