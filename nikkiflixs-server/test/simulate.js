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
const { rooms } = require('../server');

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

async function main() {
  await sleep(800); // server boot

  const p1 = await makePlayer('Alice');
  const p2 = await makePlayer('Bob');
  // hand auto-starts ~3s after 2nd join; wait for cards
  for (let i = 0; i < 40 && !(p1.hole?.length === 2 && p2.hole?.length === 2); i++) {
    await sleep(250);
  }

  check('both players joined', !!(p1.token && p2.token), `p1=${p1.token?.slice(0, 6)} p2=${p2.token?.slice(0, 6)}`);
  check('hole cards dealt (p1)', !!(p1.hole && p1.hole.length === 2), p1.hole?.join(' '));
  check('hole cards dealt (p2)', !!(p2.hole && p2.hole.length === 2), p2.hole?.join(' '));
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
