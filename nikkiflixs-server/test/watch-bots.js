'use strict';
// Watch bot-only red table hands: winners, splits, pot sizes, who plays.
process.env.PORT = '3997';
process.env.BOT_TICK_MS = '50';
const srv = require('../server');
const { io } = require('socket.io-client');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await sleep(1000);
  const s = io('http://localhost:3997');
  await new Promise(r => s.on('connect', r));
  s.emit('spectate', { table: 'red', v: 1 });
  let lastHand = -1, hands = 0, splits = 0, winners = {};
  let lastState = null;
  const results = [];
  s.on('room', (st) => {
    lastState = st;
    if (st.hand !== lastHand) {
      lastHand = st.hand; hands++;
    }
  });
  // engine events come through server-side; instead watch state transitions
  // for payouts by polling stacks between hands
  let prevStacks = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    await sleep(500);
    const st = lastState;
    if (!st) continue;
    const stacks = {};
    for (const ps of st.seats) if (!ps.empty) stacks[ps.name] = ps.stack;
    if (prevStacks && st.state === 'waiting') {
      // a hand just paid out: compare stacks
      const diffs = Object.keys(stacks).filter(n => stacks[n] !== prevStacks[n]);
      if (diffs.length) results.push({ hand: st.hand, diffs: diffs.map(n => n + ' ' + (stacks[n] - prevStacks[n] > 0 ? '+' : '') + (stacks[n] - prevStacks[n])) });
    }
    if (st.state === 'waiting') prevStacks = stacks;
    else prevStacks = prevStacks || stacks;
  }
  console.log('hands seen:', hands);
  console.log('payout events:', results.length);
  const winCount = {};
  for (const r of results) {
    for (const d of r.diffs) {
      if (d.includes('+')) { const n = d.split(' ')[0] + ' ' + d.split(' ')[1]; winCount[n] = (winCount[n] || 0) + 1; }
    }
  }
  console.log('winners tally:', JSON.stringify(winCount));
  for (const r of results.slice(0, 15)) console.log('hand', r.hand, '->', r.diffs.join(', '));
  s.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
