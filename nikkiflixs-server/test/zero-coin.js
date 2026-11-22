'use strict';
// Zero-coin remove-and-replace: when a player has zero coins they GET OUT,
// the seat EMPTIES, and somebody else comes in and takes it.
// Run: node test/zero-coin.js
//
// In-process, isolated tables — no sockets, no server. BotManager +
// RoomManager only, so this runs in under a second.
//
// PASS criteria:
//  Z1 broke bot removed by reconcile; a NEW bot (different name, fresh
//     stack) takes the seat; bot count stays at target
//  Z2 broke human removed by reconcile in 'waiting'; seat refilled by a
//     new bot; the human can SIT IN fresh with the same token
//  Z3 broke human mid-hand is NOT removed (state guard)
//  Z4 all-in human (stack 0, NOT sittingOut) is NOT removed
//  Z5 a bot named Promise keeps the old rebuy-in-place behavior
//     (same token, same name, fresh stack)
//  Z6 a human named Promise is NOT removed

const { RoomManager } = require('../roomManager');
const { BotManager } = require('../bots');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};

const rooms = new RoomManager();
const bots = new BotManager(rooms, [{ id: 'zlab', maxSeats: 8, displayOpen: 1 }]);

function freshTable(id) {
  const room = rooms.createTable(id, { smallBlind: 2, bigBlind: 5, maxPlayers: 8, startingStack: 1000 });
  bots.reconcile(id); // fills to target: 7 bots, 0 humans
  return room;
}

function brokeBot(eng, id) {
  // pick any bot, bankrupt it the way a lost hand does: stack 0, sitting out
  const bt = bots.tokensFor(id);
  const token = [...bt][0];
  const p = eng.players.get(token);
  p.stack = 0;
  p.sittingOut = true;
  return { token, name: p.name, seat: p.seat };
}

// --- Z1: broke bot removed, replaced by a NEW bot with a different name ---
{
  const room = freshTable('z1');
  const eng = room.engine;
  const gone = brokeBot(eng, 'z1');
  bots.reconcile('z1');
  const c = bots.counts('z1');
  const names = [...eng.players.values()].map(p => p.name);
  const replacement = [...eng.players.values()].find(p => p.seat === gone.seat);
  check('Z1 broke bot removed and replaced by a new bot (different name, fresh stack)',
    !eng.players.has(gone.token)
    && !bots.tokensFor('z1').has(gone.token)
    && !names.includes(gone.name)
    && replacement && replacement.stack === eng.startingStack
    && c.bots === 7 && c.humans === 0,
    `removed=${gone.name} seat=${gone.seat} replacement=${replacement && replacement.name} bots=${c.bots}`);
}

// --- Z2: broke human removed in 'waiting', table refills, can SIT IN fresh ---
{
  const room = freshTable('z2');
  const eng = room.engine;
  const hTok = rooms.newToken();
  const seat = bots.seatHuman('z2', hTok, 'Test Human', 1000);
  bots.reconcile('z2'); // join trim: a bot yields so the table keeps 1 display seat open (6 bots + 1 human)
  const hp = eng.players.get(hTok);
  hp.stack = 0; // lost everything
  hp.sittingOut = true; // startHand marks broke players sitting out
  bots.reconcile('z2'); // broke human removed; top-up refills the table with a new bot
  const removed = !eng.players.has(hTok);
  const c1 = bots.counts('z2');
  const seated = eng.players.size;
  // and the same token can SIT IN fresh (takes the free display seat)
  const seat2 = bots.seatHuman('z2', hTok, 'Test Human', 1000);
  const back = eng.players.get(hTok);
  const c2 = bots.counts('z2');
  check('Z2 broke human removed in waiting; table refills to target; same token can SIT IN fresh',
    removed && c1.bots === 7 && c1.humans === 0 && seated === 7
    && seat2 >= 0 && back && back.stack === 1000 && back.seat === seat2
    && c2.humans === 1 && c2.bots === 7,
    `seat=${seat} removed=${removed} after: bots=${c1.bots} humans=${c1.humans} seated=${seated} reseat=${seat2} humans=${c2.humans} bots=${c2.bots}`);
}

// --- Z3: broke human mid-hand is NOT removed ---
{
  const room = freshTable('z3');
  const eng = room.engine;
  const hTok = rooms.newToken();
  bots.seatHuman('z3', hTok, 'Mid Human', 1000);
  if (!eng.startHand()) {
    check('Z3 broke human mid-hand is NOT removed', false, 'startHand refused');
  } else {
    const hp = eng.players.get(hTok);
    hp.stack = 0;
    hp.sittingOut = true; // forced: broke while a hand is running
    bots.reconcile('z3');
    check('Z3 broke human mid-hand is NOT removed',
      eng.players.has(hTok) && eng.state !== 'waiting',
      `state=${eng.state} stillSeated=${eng.players.has(hTok)}`);
  }
}

// --- Z4: all-in human (stack 0, NOT sittingOut) is NOT removed ---
{
  const room = freshTable('z4');
  const eng = room.engine;
  const hTok = rooms.newToken();
  bots.seatHuman('z4', hTok, 'Allin Human', 1000);
  eng.startHand();
  const hp = eng.players.get(hTok);
  hp.stack = 0;
  hp.allIn = true; // all-in: stack 0 but still in the hand
  hp.sittingOut = false;
  bots.reconcile('z4');
  check('Z4 all-in human (stack 0, not sittingOut) is NOT removed',
    eng.players.has(hTok),
    `state=${eng.state} allIn=${hp.allIn} stillSeated=${eng.players.has(hTok)}`);
}

// --- Z5: a bot named Promise keeps rebuy-in-place ---
{
  const room = freshTable('z5');
  const eng = room.engine;
  // make room, then seat Promise as a bot (she is not in BOT_NAMES)
  const victim = [...bots.tokensFor('z5')][0];
  bots.removeBot('z5', victim);
  const pTok = rooms.newToken();
  eng.addPlayer(pTok, 'Promise', 1000);
  bots.tokensFor('z5').add(pTok);
  const pp = eng.players.get(pTok);
  pp.stack = 0;
  pp.sittingOut = true;
  bots.reconcile('z5');
  const after = eng.players.get(pTok);
  const c = bots.counts('z5');
  check('Z5 bot named Promise is rebought in place (same token, same name, fresh stack)',
    after && after.name === 'Promise' && after.stack === eng.startingStack && !after.sittingOut
    && c.bots === 7,
    `stack=${after && after.stack} sittingOut=${after && after.sittingOut} bots=${c.bots}`);
}

// --- Z6: a human named Promise is NOT removed ---
{
  const room = freshTable('z6');
  const eng = room.engine;
  const hTok = rooms.newToken();
  bots.seatHuman('z6', hTok, 'Promise', 1000);
  const hp = eng.players.get(hTok);
  hp.stack = 0;
  hp.sittingOut = true;
  bots.reconcile('z6');
  check('Z6 human named Promise is NOT removed',
    eng.players.has(hTok),
    `stillSeated=${eng.players.has(hTok)}`);
}

const fails = results.filter(r => !r.ok).length;
console.log(`\n==== ${results.length - fails}/${results.length} checks passed ====`);
process.exit(fails ? 1 : 0);
