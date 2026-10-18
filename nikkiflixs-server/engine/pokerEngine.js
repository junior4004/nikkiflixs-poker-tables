'use strict';
// PokerEngine: server-authoritative Texas Hold'em hand lifecycle.
// Blinds -> deal -> preflop -> flop -> turn -> river -> showdown -> payouts.
// The server owns the deck, bets, and RNG. Clients only send validated actions.

const { newDeck, shuffle, cardToString } = require('./deck');
const { evaluate7 } = require('./evaluator');

const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];

class PokerEngine {
  constructor(opts = {}) {
    this.smallBlind = opts.smallBlind || 1;
    this.bigBlind = opts.bigBlind || 2;
    this.maxPlayers = opts.maxPlayers || 9;
    this.minPlayers = 2;
    this.startingStack = opts.startingStack || 1000;

    this.players = new Map(); // token -> player object
    this.seats = new Array(this.maxPlayers).fill(null); // seat idx -> token
    this.dealerIndex = -1; // seat index of button; advances each hand
    this.handNumber = 0;

    this.state = 'waiting'; // waiting | preflop | flop | turn | river | showdown
    this.board = [];
    this.deck = [];
    this.pots = []; // [{ amount, eligible: [tokens] }] built at showdown
    this.potTotal = 0;

    this.currentBet = 0; // highest bet this street
    this.lastRaiseSize = 0;
    this.toAct = []; // tokens in order
    this.actingToken = null;
    this.lastResult = null;

    this.events = []; // queued events for broadcast: { type, ... }
  }

  // ---------- player management ----------
  addPlayer(token, name, buyIn) {
    if (this.players.has(token)) return this.seats.indexOf(token);
    if (this.seats.every(s => s !== null)) return -1; // full
    const seat = this.seats.findIndex(s => s === null);
    const stack = Math.max(0, buyIn || this.startingStack);
    this.players.set(token, {
      token,
      name: name || 'Player',
      seat,
      stack,
      hole: [],
      betStreet: 0,   // bet this street
      betHand: 0,      // total bet this hand
      folded: false,
      allIn: false,
      // Mid-hand joiners sit out until the next deal (standard poker room
      // behavior) — a player with no cards must never reach a showdown.
      sittingOut: stack <= 0 || this.state !== 'waiting',
    });
    this.seats[seat] = token;
    this.emit('playerJoin', { token, name, seat, stack });
    return seat;
  }

  removePlayer(token) {
    const p = this.players.get(token);
    if (!p) return;
    // If mid-hand and they have chips committed, their hand is folded.
    if (this.state !== 'waiting' && !p.folded) {
      p.folded = true;
      this.toAct = this.toAct.filter(t => t !== token);
    }
    this.seats[p.seat] = null;
    this.players.delete(token);
    this.emit('playerLeave', { token });
    if (this.state !== 'waiting') this.checkStreetEnd();
  }

  activePlayers() {
    // seated, not sitting out, with chips or chips committed this hand
    return [...this.players.values()].filter(p => !p.sittingOut);
  }

  // seat-order list of tokens, starting after a given seat index (exclusive)
  orderedTokens(fromSeat) {
    const out = [];
    for (let i = 1; i <= this.maxPlayers; i++) {
      const s = (fromSeat + i) % this.maxPlayers;
      const t = this.seats[s];
      if (t && this.players.has(t)) out.push(t);
    }
    return out;
  }

  // ---------- hand lifecycle ----------
  canStartHand() {
    return this.state === 'waiting' && this.activePlayers().filter(p => p.stack > 0).length >= this.minPlayers;
  }

  startHand() {
    if (!this.canStartHand()) return false;
    this.handNumber++;
    this.board = [];
    this.pots = [];
    this.potTotal = 0;
    this.lastResult = null;

    // reset per-hand player state; funded players (including anyone who
    // joined mid-hand last round) are back in
    for (const p of this.players.values()) {
      p.hole = [];
      p.betStreet = 0;
      p.betHand = 0;
      p.folded = false;
      p.allIn = p.stack <= 0;
      p.sittingOut = p.stack <= 0;
    }

    // advance button to next player with chips
    const candidates = this.activePlayers().filter(p => p.stack > 0);
    let idx = this.dealerIndex;
    for (let i = 0; i < this.maxPlayers; i++) {
      idx = (idx + 1) % this.maxPlayers;
      const t = this.seats[idx];
      if (t && candidates.some(p => p.token === t)) break;
    }
    this.dealerIndex = idx;

    this.deck = shuffle(newDeck());

    // deal 2 cards each, in seat order from button (sitting-out players skip)
    const order = this.orderedTokens(this.dealerIndex).filter(t => {
      const p = this.players.get(t);
      return p.stack > 0 && !p.sittingOut;
    });
    for (let r = 0; r < 2; r++) {
      for (const t of order) {
        const p = this.players.get(t);
        p.hole.push(this.deck.pop());
      }
    }

    // blinds
    const headsUp = order.length === 2;
    const sbToken = headsUp ? this.seats[this.dealerIndex] : order[0];
    const bbToken = headsUp ? order[0] : order[1];
    this.postBlind(sbToken, this.smallBlind);
    this.postBlind(bbToken, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.lastRaiseSize = this.bigBlind;

    this.state = 'preflop';
    // preflop action starts left of BB
    const bbSeat = this.players.get(bbToken).seat;
    this.toAct = this.orderedTokens(bbSeat).filter(t => {
      const p = this.players.get(t);
      return p.stack > 0 && !p.allIn && !p.sittingOut;
    });
    this.advanceAction();
    this.emit('handStart', { hand: this.handNumber, dealer: this.dealerIndex });
    return true;
  }

  postBlind(token, amount) {
    const p = this.players.get(token);
    if (!p || p.stack <= 0) return;
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.betStreet += a;
    p.betHand += a;
    this.potTotal += a;
    if (p.stack === 0) p.allIn = true;
  }

  // ---------- actions ----------
  legalActions(token) {
    if (this.state === 'waiting' || this.actingToken !== token) return [];
    const p = this.players.get(token);
    if (!p || p.folded || p.allIn || p.sittingOut) return [];
    const toCall = this.currentBet - p.betStreet;
    const acts = ['fold'];
    if (toCall === 0) acts.push('check');
    if (toCall > 0 && p.stack > 0) acts.push('call');
    // can raise if they have more than the call amount
    if (p.stack > toCall) acts.push('raise');
    return acts;
  }

  minRaiseTo(token) {
    const p = this.players.get(token);
    const toCall = this.currentBet - p.betStreet;
    return this.currentBet + Math.max(this.lastRaiseSize, this.bigBlind) > p.betStreet + p.stack
      ? p.betStreet + p.stack // all-in is the max
      : this.currentBet + Math.max(this.lastRaiseSize, this.bigBlind);
  }

  maxRaiseTo(token) {
    const p = this.players.get(token);
    return p.betStreet + p.stack; // all-in
  }

  act(token, action, amount = 0) {
    // Server-side validation: every action is checked. Client is never trusted.
    if (this.state === 'waiting') return { ok: false, error: 'no-hand' };
    if (this.actingToken !== token) return { ok: false, error: 'not-your-turn' };
    const p = this.players.get(token);
    if (!p || p.folded || p.allIn) return { ok: false, error: 'not-active' };

    const legal = this.legalActions(token);
    if (!legal.includes(action)) return { ok: false, error: 'illegal-action' };

    const toCall = this.currentBet - p.betStreet;

    if (action === 'fold') {
      p.folded = true;
      this.emit('action', { token, action: 'fold' });
    } else if (action === 'check') {
      this.emit('action', { token, action: 'check' });
    } else if (action === 'call') {
      const a = Math.min(toCall, p.stack);
      p.stack -= a; p.betStreet += a; p.betHand += a; this.potTotal += a;
      if (p.stack === 0) p.allIn = true;
      this.emit('action', { token, action: 'call', amount: a });
    } else if (action === 'raise') {
      const minTo = this.minRaiseTo(token);
      const maxTo = this.maxRaiseTo(token);
      const target = Math.max(0, amount | 0);
      if (target < minTo && target < maxTo) return { ok: false, error: 'raise-too-small', min: minTo };
      const clamped = Math.min(target, maxTo);
      const add = clamped - p.betStreet;
      const raiseSize = clamped - this.currentBet;
      p.stack -= add; p.betStreet = clamped; p.betHand += add; this.potTotal += add;
      if (p.stack === 0) p.allIn = true;
      if (raiseSize >= this.lastRaiseSize || p.allIn) {
        // full raise reopens action; short all-in does not
        if (!p.allIn || raiseSize >= this.lastRaiseSize) {
          this.lastRaiseSize = Math.max(raiseSize, this.lastRaiseSize);
          this.currentBet = clamped;
          // everyone else must act again
          this.toAct = this.orderedTokens(p.seat).filter(t => {
            const q = this.players.get(t);
            return t !== token && q && !q.sittingOut && !q.folded && !q.allIn && q.stack >= 0;
          });
        }
      }
      this.emit('action', { token, action: 'raise', to: clamped });
    }

    // remove from toAct
    this.toAct = this.toAct.filter(t => t !== token);

    // everyone folded? hand ends immediately.
    const remaining = [...this.players.values()].filter(q => !q.folded && !q.sittingOut);
    if (remaining.length === 1) {
      return this.endHand(remaining[0].token, true);
    }

    this.checkStreetEnd();
    return { ok: true };
  }

  checkStreetEnd() {
    // remove folded/all-in/sitting-out from toAct defensively
    this.toAct = this.toAct.filter(t => {
      const q = this.players.get(t);
      return q && !q.sittingOut && !q.folded && !q.allIn;
    });
    if (this.toAct.length === 0) {
      this.nextStreet();
    } else {
      this.advanceAction();
    }
  }

  advanceAction() {
    this.actingToken = this.toAct[0] || null;
    if (this.actingToken) {
      this.emit('turn', { token: this.actingToken, legal: this.legalActions(this.actingToken) });
    }
  }

  nextStreet() {
    // reset street bets
    for (const p of this.players.values()) p.betStreet = 0;
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.actingToken = null;

    const inHand = [...this.players.values()].filter(p => !p.folded && !p.sittingOut);
    const canBet = inHand.filter(p => !p.allIn);

    if (this.state === 'preflop') {
      this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.state = 'flop';
    } else if (this.state === 'flop') {
      this.board.push(this.deck.pop());
      this.state = 'turn';
    } else if (this.state === 'turn') {
      this.board.push(this.deck.pop());
      this.state = 'river';
    } else if (this.state === 'river') {
      return this.showdown();
    }
    this.emit('street', { street: this.state, board: this.board.map(cardToString) });

    if (canBet.length <= 1) {
      // run out the board if only one player can act (or none)
      return this.nextStreet();
    }
    this.toAct = this.orderedTokens(this.dealerIndex).filter(t => {
      const q = this.players.get(t);
      return !q.folded && !q.allIn && !q.sittingOut;
    });
    this.advanceAction();
  }

  showdown() {
    this.state = 'showdown';
    this.actingToken = null;
    // only players actually dealt in can contest the pot
    const inHand = [...this.players.values()].filter(p => !p.folded && !p.sittingOut && p.hole.length === 2);

    // evaluate
    const scored = inHand.map(p => ({
      token: p.token,
      result: evaluate7([...p.hole, ...this.board]),
      betHand: p.betHand,
    }));

    // build side pots from distinct bet levels (ascending).
    // Every committed chip counts — including chips from players who folded.
    // (Using only non-folded bet levels would strand folded players' chips.)
    const contributors = [...this.players.values()].filter(p => !p.sittingOut && p.betHand > 0);
    const levels = [...new Set(contributors.map(p => p.betHand))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      const contrib = lvl - prev;
      if (contrib <= 0) continue;
      const atLevel = contributors.filter(p => p.betHand >= lvl);
      pots.push({
        amount: contrib * atLevel.length,
        eligible: atLevel.filter(p => !p.folded).map(p => p.token),
      });
      prev = lvl;
    }

    const winners = [];
    for (const pot of pots) {
      const contenders = scored.filter(s => pot.eligible.includes(s.token));
      const bestScore = Math.max(...contenders.map(c => c.result.score));
      const potWinners = contenders.filter(c => c.result.score === bestScore);
      const share = Math.floor(pot.amount / potWinners.length);
      let remainder = pot.amount - share * potWinners.length;
      // remainder goes to earliest seat order from button
      const order = this.orderedTokens(this.dealerIndex);
      const sorted = [...potWinners].sort(
        (a, b) => order.indexOf(a.token) - order.indexOf(b.token)
      );
      for (const w of sorted) {
        let amt = share;
        if (remainder > 0) { amt++; remainder--; }
        const p = this.players.get(w.token);
        p.stack += amt;
        winners.push({ token: w.token, amount: amt, hand: w.result.name });
      }
    }

    // players with 0 stack sit out next hand
    for (const p of this.players.values()) {
      if (p.stack <= 0) p.sittingOut = true;
    }

    this.lastResult = {
      hand: this.handNumber,
      board: this.board.map(cardToString),
      winners,
      showdown: scored.map(s => ({
        token: s.token,
        name: this.players.get(s.token).name,
        hole: s.hole || [],
        handName: s.result.name,
      })),
    };
    // attach hole cards for reveal
    for (const s of this.lastResult.showdown) {
      const p = this.players.get(s.token);
      s.hole = p.hole.map(cardToString);
    }

    this.emit('handEnd', this.lastResult);
    this.state = 'waiting';
    return { ok: true, result: this.lastResult };
  }

  endHand(winnerToken, byFold) {
    // everyone else folded; winner takes the whole pot (no reveal needed,
    // but we include it for the test client)
    const w = this.players.get(winnerToken);
    w.stack += this.potTotal;
    const p = this.players.get(winnerToken);
    this.lastResult = {
      hand: this.handNumber,
      board: this.board.map(cardToString),
      winners: [{ token: winnerToken, amount: this.potTotal, hand: byFold ? 'by fold' : p.hole.map(cardToString).join(' ') }],
      showdown: [],
      wonByFold: !!byFold,
    };
    for (const pl of this.players.values()) {
      if (pl.stack <= 0) pl.sittingOut = true;
    }
    this.emit('handEnd', this.lastResult);
    this.state = 'waiting';
    this.actingToken = null;
    this.toAct = [];
    return { ok: true, result: this.lastResult };
  }

  // ---------- personalized state for one client ----------
  getState(forToken) {
    const me = this.players.get(forToken);
    const seats = this.seats.map((tok, i) => {
      if (!tok) return { seat: i, empty: true };
      const pl = this.players.get(tok);
      const isMe = tok === forToken;
      return {
        seat: i,
        name: pl.name,
        stack: pl.stack,
        bet: pl.betStreet,
        folded: pl.folded,
        allIn: pl.allIn,
        sittingOut: pl.sittingOut,
        dealer: i === this.dealerIndex,
        acting: tok === this.actingToken,
        // hole cards only for the requesting player
        hole: isMe ? pl.hole.map(cardToString) : (this.state === 'showdown' ? [] : null),
      };
    });
    return {
      v: 1, // protocol version — server rejects stale clients
      state: this.state,
      hand: this.handNumber,
      maxSeats: this.maxPlayers, // lets clients hide unused seat positions
      board: this.board.map(cardToString),
      pot: this.potTotal,
      currentBet: this.currentBet,
      seats,
      acting: this.actingToken,
      legal: me ? this.legalActions(forToken) : [],
      minRaiseTo: me && this.actingToken === forToken ? this.minRaiseTo(forToken) : null,
      maxRaiseTo: me && this.actingToken === forToken ? this.maxRaiseTo(forToken) : null,
      lastResult: this.lastResult,
    };
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

module.exports = { PokerEngine, STREETS };
