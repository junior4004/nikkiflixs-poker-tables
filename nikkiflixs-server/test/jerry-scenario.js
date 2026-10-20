'use strict';
// Jerry's scenario: join the red table MID-HAND and verify:
//  1. 'joined' reports the authoritative seat
//  2. The joiner is sittingOut until the next hand
//  3. The joiner NEVER receives yourTurn / legal actions while sitting out
//  4. Card backs are flagged for in-hand players; hidden for sidelined ones
//  5. Next hand: the joiner is dealt in with 2 hole cards
// Run: node test/jerry-scenario.js
process.env.PORT = '3998';
process.env.BOT_TICK_MS = '50';
require('../server');
const { io } = require('socket.io-client');

const URL = 'http://localhost:3998';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};

async function main() {
  await sleep(1500); // let bots populate + hand start

  const socket = io(URL);
  const J = { token: null, seat: -1, states: [], yourTurns: 0, holeSeen: null };
  await new Promise(res => socket.on('connect', res));

  // wait until a hand is in progress, then join mid-hand
  let probe = await new Promise(res => {
    const s2 = io(URL);
    s2.on('connect', () => s2.emit('spectate', { table: 'red', v: 1 }));
    s2.on('room', (st) => { s2.disconnect(); res(st); });
    setTimeout(() => { s2.disconnect(); res(null); }, 5000);
  });
  let guard = 0;
  while ((!probe || probe.state === 'waiting') && guard++ < 60) {
    await sleep(1000);
    probe = await new Promise(res => {
      const s2 = io(URL);
      s2.on('connect', () => s2.emit('spectate', { table: 'red', v: 1 }));
      s2.on('room', (st) => { s2.disconnect(); res(st); });
      setTimeout(() => { s2.disconnect(); res(null); }, 5000);
    });
  }
  check('hand in progress to join into', !!probe && probe.state !== 'waiting', 'state=' + (probe && probe.state));

  socket.on('joined', (m) => { J.token = m.token; J.seat = m.seat; });
  socket.on('yourTurn', () => {
    J.yourTurns++;
    // record which hand was live when the turn arrived
    const cur = J.states[J.states.length - 1];
    J.yourTurnHands = J.yourTurnHands || [];
    J.yourTurnHands.push(cur ? cur.hand : -1);
  });
  socket.on('room', (st) => {
    J.states.push(st);
    const me = st.seats.find(s => !s.empty && s.seat === J.seat);
    if (me && me.hole && me.hole.length && !J.holeSeen) J.holeSeen = me.hole.slice();
  });

  socket.emit('join', { table: 'red', v: 1, name: 'JerryTest', buyIn: 1000, seat: -1 });
  await sleep(3000);

  check('joined event has a real seat', Number.isInteger(J.seat) && J.seat >= 0 && J.seat < 6, 'seat=' + J.seat);

  // desync self-heal data: spectator probe saw yourSeat=-1; our joined
  // states must report yourSeat === our seat on every update.
  check('spectator state reports yourSeat=-1', !!probe && probe.yourSeat === -1, 'yourSeat=' + (probe && probe.yourSeat));
  const myState = J.states[J.states.length - 1];
  check('seated state reports yourSeat = my seat', !!myState && myState.yourSeat === J.seat, 'yourSeat=' + (myState && myState.yourSeat) + ' seat=' + J.seat);

  // The FIRST room event is sent synchronously inside the join handler,
  // BEFORE syncTable can start a new hand. That is the truth at join time.
  const firstState = J.states[0];
  const meFirst = firstState && firstState.seats.find(s => !s.empty && s.seat === J.seat);
  check('mid-hand joiner is sittingOut', !!(meFirst && meFirst.sittingOut), JSON.stringify(meFirst && { so: meFirst.sittingOut, hole: meFirst.hole, folded: meFirst.folded }));
  check('mid-hand joiner gets no legal actions', !!(firstState && firstState.legal && firstState.legal.length === 0), 'legal=' + JSON.stringify(firstState && firstState.legal));
  check('mid-hand joiner has no hole cards', !!(meFirst && Array.isArray(meFirst.hole) && meFirst.hole.length === 0), 'hole=' + JSON.stringify(meFirst && meFirst.hole));

  // If a NEW hand started while we watched, the joiner being dealt in there
  // is correct — so track whether our yourTurn came during the join hand.
  const joinHand = firstState && firstState.hand;
  const stateAtYourTurn = J.states.find(s => s.hand === joinHand);
  const meJoinHand = stateAtYourTurn && stateAtYourTurn.seats.find(s => !s.empty && s.seat === J.seat);
  check('joiner still sidelined in the JOIN hand', !!(meJoinHand && meJoinHand.sittingOut && (!meJoinHand.hole || meJoinHand.hole.length === 0)), 'joinHand=' + joinHand);
  const activeStates = ['preflop', 'flop', 'turn', 'river'];
  const midStates = J.states.filter(s => activeStates.includes(String(s.state).toLowerCase()));
  let backsOk = true, backsDetail = '';
  for (const st of midStates.slice(0, 3)) {
    for (const ps of st.seats) {
      if (ps.empty) continue;
      const qualifies = !ps.folded && !ps.sittingOut && activeStates.includes(String(st.state).toLowerCase());
      if (ps.seat === J.seat && qualifies) { backsOk = false; backsDetail = 'joiner wrongly qualifies for backs'; }
    }
  }
  check('sidelined joiner never qualifies for card backs', backsOk, backsDetail || 'mid-hand states checked: ' + midStates.length);
  // yourTurn is only wrong if it arrived during a hand where we were sidelined
  let badTurns = 0;
  for (const h of (J.yourTurnHands || [])) {
    const st = J.states.find(s => s.hand === h);
    const me = st && st.seats.find(s => !s.empty && s.seat === J.seat);
    if (me && (me.sittingOut || !me.hole || me.hole.length === 0)) badTurns++;
  }
  check('no yourTurn while sidelined (hand-aware)', badTurns === 0, 'yourTurns=' + J.yourTurns + ' bad=' + badTurns);

  // now wait for the NEXT hand and verify the joiner is dealt in
  const startHand = firstState.hand;
  let dealtState = null;
  guard = 0;
  while (guard++ < 120) {
    await sleep(1000);
    const st = J.states[J.states.length - 1];
    if (st && st.hand !== startHand && activeStates.includes(String(st.state).toLowerCase())) {
      const me = st.seats.find(s => !s.empty && s.seat === J.seat);
      if (me && me.hole && me.hole.length === 2) { dealtState = st; break; }
    }
  }
  check('joiner dealt in on next hand with 2 hole cards', !!dealtState, dealtState ? ('hand=' + dealtState.hand + ' hole=' + J.holeSeen.join(',')) : 'never dealt within 120s');
  const meDealt = dealtState && dealtState.seats.find(s => !s.empty && s.seat === J.seat);
  check('dealt joiner is not sittingOut', !!(meDealt && !meDealt.sittingOut));

  // let it play; if our turn comes, legal actions must be non-empty and yourTurn may fire
  const turnBefore = J.yourTurns;
  await sleep(15000);
  const laterState = J.states[J.states.length - 1];
  const meLater = laterState && laterState.seats.find(s => !s.empty && s.seat === J.seat);
  const acted = J.yourTurns > turnBefore;
  check('no crash / still seated after 15s', !!(meLater && !meLater.empty), 'yourTurn fired for us: ' + acted);

  socket.disconnect();
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (failed ? failed + ' FAILED' : 'ALL ' + results.length + ' PASSED'));
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
