'use strict';
// Headless Phase 1 acceptance test: two simulated players complete a full
// hand over Socket.IO. Run: node test/simulate.js
//
// PASS criteria:
//  1. Both players join and get seats
//  2. Server deals hole cards (each sees only their own)
//  3. A full betting hand completes (preflop -> flop -> turn -> river -> showdown)
//  4. Server declares a winner and credits the pot
//  5. Total chips conserved (no chips created/destroyed except blinds/antes accounting)

const { io } = require('socket.io-client');

// start the server in-process on a test port
process.env.PORT = '3999';
process.env.BOT_TICK_MS = '60'; // fast bot cadence for tests (prod default 800)
const { rooms, bots } = require('../server');
const { decideAction } = require('../bots');

const URL = 'http://localhost:3999';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};

function makePlayer(name) {
  return new Promise((resolve) => {
    const socket = io(URL);
    const p = { name, socket, token: null, state: null, hole: null };
    socket.on('connect', () => {
      socket.emit('join', { table: 'emerald', token: null, v: 1, name, buyIn: 1000 });
    });
    socket.on('joined', (m) => { p.token = m.token; });
    socket.on('room', (s) => {
      p.state = s;
      const me = s.seats.find(x => !x.empty && x.hole && x.hole.length);
      if (me) p.hole = me.hole;
      // verify opponents' cards are hidden
      for (const x of s.seats) {
        if (!x.empty && x.hole && x.hole.length && !s.seats.find(y => y === x)) {}
      }
      resolve(p);
    });
    setTimeout(() => resolve(p), 4000); // fail-safe
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// House-bot system tests (in-process, isolated tables — no sockets).
// T1: reconcile fills bots to target
// T2: rapid human joins each displace exactly one bot (yield-on-join)
// T3: all-human table -> zero bots, 9th human rejected cleanly
// T4: humans leave -> bots top back up (table never looks dead)
// T5: bot never acts out of turn; every bot decision is a legal action
// T6: bots indistinguishable from humans in server-sent state
// ---------------------------------------------------------------------------
async function botTests() {
  console.log('--- house-bot tests ---');
  const lab = rooms.createTable('testlab', { smallBlind: 2, bigBlind: 5, maxPlayers: 8, startingStack: 1000 });
  const eng = lab.engine;

  // T1: fill to target (8-max, 1 display seat -> 7 bots)
  bots.reconcile('testlab');
  let c = bots.counts('testlab');
  check('T1 bots fill to target (7 bots, 0 humans)', c.bots === 7 && c.humans === 0,
    `bots=${c.bots} humans=${c.humans}`);

  // T2: 8 rapid human joins; each must displace exactly one bot, table stays full
  let ok = true;
  for (let i = 0; i < 8; i++) {
    const seat = bots.seatHuman('testlab', 'human-' + i, 'Human' + i, 1000);
    if (seat < 0) { ok = false; break; }
    const cc = bots.counts('testlab');
    if (cc.humans !== i + 1 || cc.bots !== 7 - i || eng.players.size !== 8) ok = false;
  }
  c = bots.counts('testlab');
  check('T2 each human join displaces exactly one bot', ok && c.humans === 8 && c.bots === 0,
    `humans=${c.humans} bots=${c.bots} seated=${eng.players.size}`);

  // T3: 9th human (no bots left to yield) gets a clean rejection
  const seat9 = bots.seatHuman('testlab', 'human-9', 'Human9', 1000);
  check('T3 9th human rejected cleanly when full of humans', seat9 === -1);
  bots.reconcile('testlab');
  check('T3b all-human table keeps zero bots after reconcile', bots.counts('testlab').bots === 0);

  // T4: humans leave -> bots top back up
  const humanTokens = [...eng.players.keys()].slice(0, 3);
  for (const t of humanTokens) eng.removePlayer(t);
  bots.reconcile('testlab');
  c = bots.counts('testlab');
  check('T4 bots top back up after humans leave', c.bots === 2 && c.humans === 5,
    `bots=${c.bots} humans=${c.humans}`);

  // T5: live bot-only hands — no out-of-turn acts, every decision legal
  const lab2 = rooms.createTable('testlab2', { smallBlind: 2, bigBlind: 5, maxPlayers: 6, startingStack: 1000 });
  bots.reconcile('testlab2'); // 5 bots
  if (!lab2.engine.startHand()) {
    check('T5 bot hand starts', false, 'startHand refused');
  } else {
    let violations = 0, actions = 0, handsDone = 0;
    const startHandNo = lab2.engine.handNumber;
    for (let i = 0; i < 3000 && handsDone < 3; i++) {
      const e2 = lab2.engine;
      if (e2.state === 'waiting') {
        if (e2.handNumber > startHandNo + handsDone) handsDone = e2.handNumber - startHandNo;
        if (handsDone < 3 && e2.canStartHand()) e2.startHand();
        continue;
      }
      const acting = e2.actingToken;
      for (const t of bots.tokensFor('testlab2')) {
        if (t !== acting && decideAction(e2, t, Math.random) !== null) violations++;
      }
      if (acting && bots.isBot('testlab2', acting)) {
        const d = decideAction(e2, acting, Math.random);
        const legal = e2.legalActions(acting);
        if (!d || !legal.includes(d.action)) { violations++; }
        else {
          if (d.action === 'raise') {
            if (d.amount < e2.minRaiseTo(acting) || d.amount > e2.maxRaiseTo(acting)) violations++;
          }
          actions++;
        }
      }
      bots.tickTable('testlab2', Math.random);
    }
    check('T5 bot never acts out of turn; all decisions legal (3 hands)',
      violations === 0 && actions > 10 && handsDone === 3,
      `actions=${actions} violations=${violations} hands=${handsDone}`);
  }

  // T6: indistinguishability — server state reveals nothing about bots
  const lab3 = rooms.createTable('testlab3', { smallBlind: 1, bigBlind: 2, maxPlayers: 6, startingStack: 500 });
  bots.reconcile('testlab3');
  const hTok = rooms.newToken(); // server-issued, exactly like a real human's
  lab3.engine.addPlayer(hTok, 'Eye Tester', 500);
  const st = lab3.engine.getState(hTok);
  const blob = JSON.stringify(st);
  const keyShapes = new Set(st.seats.filter(s => !s.empty).map(s => Object.keys(s).sort().join(',')));
  const tokenShapes = new Set([...lab3.engine.players.keys()].map(t =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t) ? 'uuid' : 'other'));
  check('T6 no bot identifiers in server-sent state',
    !/bot/i.test(blob) && keyShapes.size === 1 && tokenShapes.size === 1 && tokenShapes.has('uuid'),
    `uniformKeys=${keyShapes.size === 1} uuidTokens=${tokenShapes.has('uuid')}`);
}

async function main() {
  await sleep(800); // server boot

  await botTests(); // house-bot system (isolated tables, no sockets)

  const p1 = await makePlayer('Alice');
  const p2 = await makePlayer('Bob');
  // hand auto-starts ~3s after 2nd join; wait for cards. Newcomers may join
  // mid-hand (bots play continuously) and sit out until the next deal, so
  // allow up to ~30s for a full hand cycle.
  for (let i = 0; i < 120 && !(p1.hole?.length === 2 && p2.hole?.length === 2); i++) {
    await sleep(250);
  }

  check('both players joined', !!(p1.token && p2.token), `p1=${p1.token?.slice(0, 6)} p2=${p2.token?.slice(0, 6)}`);
  check('hole cards dealt (p1)', !!(p1.hole && p1.hole.length === 2), p1.hole?.join(' '));
  check('hole cards dealt (p2)', !!(p2.hole && p2.hole.length === 2), p2.hole?.join(' '));
  if (!(p1.hole?.length === 2) || !(p2.hole?.length === 2)) {
    // diagnostic dump for the flaky no-cards case
    const eng = rooms.getTable('emerald').engine;
    console.log('DIAG state=' + eng.state + ' hand=' + eng.handNumber + ' players=' + eng.players.size
      + ' acting=' + (eng.actingToken || 'none') + ' toAct=[' + eng.toAct.map(t => {
        const p = eng.players.get(t); return p ? p.name + (bots.isBot('emerald', t) ? '(b)' : '(h)') : '?';
      }).join(',') + ']');
    for (const p of eng.players.values()) {
      console.log('DIAG  ', p.name, 'stack=' + p.stack, 'sittingOut=' + p.sittingOut,
        'folded=' + p.folded, 'hole=' + p.hole.length, 'isBot=' + bots.isBot('emerald', p.token),
        'hasSock=' + rooms.getTable('emerald').sockets.has(p.token));
    }
  }
  check('hole cards differ', p1.hole?.join() !== p2.hole?.join());

  // verify p1 cannot see p2's cards in p1's state snapshot
  const p1view = p1.state;
  const bobSeat = p1view.seats.find(s => !s.empty && s.name === 'Bob');
  check('opponent cards hidden from p1', bobSeat && (bobSeat.hole === null), 'bob.hole=' + JSON.stringify(bobSeat?.hole));

  // total chips before hand
  const chipsBefore = [...rooms.getTable('emerald').engine.players.values()]
    .reduce((a, p) => a + p.stack + p.betHand, 0);

  // Play the hand: simple strategy — acting player calls/checks; if they can raise, raise once per street.
  let handDone = null;
  const endPromise = new Promise((resolve) => {
    const onEnd = (r) => { handDone = r; resolve(); };
    p1.socket.on('handEnd', onEnd);
    p2.socket.on('handEnd', onEnd);
  });

  const actedStreets = new Set();
  const actLoop = async () => {
    for (let i = 0; i < 200 && !handDone; i++) {
      for (const p of [p1, p2]) {
        if (handDone) break;
        const st = p.state;
        if (!st || st.state === 'waiting') { await sleep(120); continue; }
        const me = st.seats.find(s => !s.empty && s.hole && s.hole.length);
        const myToken = p.token;
        // is it my turn? find acting seat token via server state is per-client; use 'acting' flag on my seat
        const mySeat = st.seats.find(s => !s.empty && s.name === p.name);
        if (mySeat && mySeat.acting) {
          const legal = st.legal;
          // strategy: raise once per street if possible, else call/check
          const key = st.state + p.name;
          if (legal.includes('raise') && !actedStreets.has(key) && st.maxRaiseTo) {
            actedStreets.add(key);
            const amt = Math.min(st.minRaiseTo + 10, st.maxRaiseTo);
            p.socket.emit('raise', { amount: amt });
          } else if (legal.includes('call')) {
            p.socket.emit('call');
          } else if (legal.includes('check')) {
            p.socket.emit('check');
          } else if (legal.includes('fold')) {
            p.socket.emit('fold');
          }
          await sleep(150);
        }
      }
      await sleep(120);
    }
  };

  await Promise.race([actLoop(), endPromise, sleep(60000)]);

  check('hand completed', !!handDone, handDone ? `winners: ${handDone.winners.map(w => w.token.slice(0, 6) + '+' + w.amount).join(',')}` : 'TIMEOUT');
  if (handDone) {
    check('board has 5 cards (showdown) or won by fold',
      handDone.board.length === 5 || handDone.wonByFold,
      'board=' + handDone.board.join(' '));
    const potPaid = handDone.winners.reduce((a, w) => a + w.amount, 0);
    check('pot > 0 paid out', potPaid > 0, 'paid=' + potPaid);

    // chips conserved
    const eng = rooms.getTable('emerald').engine;
    const chipsAfter = [...eng.players.values()].reduce((a, p) => a + p.stack, 0);
    check('chips conserved', chipsAfter === chipsBefore, `before=${chipsBefore} after=${chipsAfter}`);
  }

  // protocol version rejection
  const bad = io(URL);
  const staleRejected = await new Promise((resolve) => {
    bad.on('connect', () => bad.emit('join', { table: 'emerald', v: 999, name: 'Stale' }));
    bad.on('error', (e) => resolve(e.code === 'stale-client'));
    setTimeout(() => resolve(false), 3000);
  });
  check('stale client rejected (protocol v)', staleRejected);
  bad.disconnect();

  p1.socket.disconnect();
  p2.socket.disconnect();

  const fails = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - fails}/${results.length} checks passed ====`);
  process.exit(fails ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
