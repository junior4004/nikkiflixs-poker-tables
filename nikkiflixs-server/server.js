'use strict';
// Nikkiflixs poker server — Phase 1.
// Express + Socket.IO, server-authoritative Texas Hold'em.
// Protocol v1. Clients that don't speak v1 get a "refresh" error.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { RoomManager } = require('./roomManager');
const { BotManager } = require('./bots');

const PROTOCOL_V = 1;
const PORT = process.env.PORT || 3000;
// Bot action pacing (ms between bot actions). Lower for tests via env.
const BOT_TICK_MS = parseInt(process.env.BOT_TICK_MS || '800', 10);

const app = express();
app.use(express.json());

// ---- table config (data-driven; adding a table = one entry here) ----
const TABLE_CONFIGS = [
  { id: 'emerald', name: 'Emerald Room', stakes: '$2/$5', felt: 'green',
    maxSeats: 8, displayOpen: 1, smallBlind: 2, bigBlind: 5,
    startingStack: 1000, page: '/emerald-node.html' },
  { id: 'red', name: 'Red Room', stakes: '$1/$2', felt: 'red',
    maxSeats: 6, displayOpen: 2, smallBlind: 1, bigBlind: 2,
    startingStack: 1000, page: '/red-node.html' },
];

// ---- health check (Render + uptime monitors) ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, v: PROTOCOL_V, tables: rooms.listTables(), uptime: process.uptime() });
});

// ---- lobby data: live table status.
// Public-safe shape: names and counts only. Bot/human split is NEVER exposed.
app.get('/api/tables', (req, res) => {
  res.json(TABLE_CONFIGS.map(cfg => {
    const s = bots.summary(cfg.id);
    return {
      id: s.id, name: s.name, stakes: s.stakes, felt: s.felt,
      maxSeats: s.maxSeats, filled: s.filled, displayOpen: s.displayOpen,
      page: s.page, players: s.players,
    };
  }));
});

// ---- static test client ----
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new RoomManager();
for (const cfg of TABLE_CONFIGS) {
  rooms.createTable(cfg.id, {
    smallBlind: cfg.smallBlind,
    bigBlind: cfg.bigBlind,
    maxPlayers: cfg.maxSeats,
    startingStack: cfg.startingStack,
  });
}
// House bots: fill tables so they always look alive; yield seats to humans.
const bots = new BotManager(rooms, TABLE_CONFIGS);

// ---- Spectators: watch a table's game without taking a seat ----
const spectators = new Map(); // tableId -> Set(socketId)
function addSpectator(tableId, socketId) {
  if (!spectators.get(tableId)) spectators.set(tableId, new Set());
  spectators.get(tableId).add(socketId);
}
function removeSpectator(socketId) {
  for (const set of spectators.values()) set.delete(socketId);
}

// ---- Human turn backstop: the game NEVER stops on a human ----
// If a human hasn't acted when the timer fires: check when it's free,
// otherwise fold. Connected players get a generous clock; a disconnected
// player's hand is resolved quickly so the table keeps moving.
const humanTimers = new Map(); // token -> timeout id
function clearHumanTimer(token) {
  const t = humanTimers.get(token);
  if (t) { clearTimeout(t); humanTimers.delete(token); }
}
function armHumanTimer(tableId, token) {
  clearHumanTimer(token);
  const room = rooms.getTable(tableId);
  if (!room) return;
  const ms = room.sockets.has(token) ? 40000 : 6000;
  humanTimers.set(token, setTimeout(() => {
    humanTimers.delete(token);
    const r = rooms.getTable(tableId);
    if (!r || r.engine.actingToken !== token) return; // turn already resolved
    const legal = r.engine.legalActions(token);
    if (!legal.length) return;
    const action = legal.includes('check') ? 'check' : 'fold';
    if (r.engine.act(token, action).ok) syncTable(tableId);
  }, ms));
}

// broadcast a full personalized state to every attached socket at a table
function broadcastState(tableId) {
  const room = rooms.getTable(tableId);
  if (!room) return;
  rooms.eachSocket(room, (token, socketId) => {
    io.to(socketId).emit('room', room.engine.getState(token));
  });
  // spectators watch the same game without taking a seat
  const specs = spectators.get(tableId);
  if (specs) {
    const st = room.engine.getState(null);
    for (const socketId of specs) io.to(socketId).emit('room', st);
  }
}

// flush engine events as targeted/room broadcasts, then send fresh states
function syncTable(tableId) {
  const room = rooms.getTable(tableId);
  if (!room) return;
  // keep bot counts right on every join/leave/action (idempotent)
  bots.reconcile(tableId);
  const events = room.engine.drainEvents();
  for (const ev of events) {
    if (ev.type === 'turn' && ev.token) {
      const sid = room.sockets.get(ev.token);
      // Humans get a never-stop backstop; bots act on their own timer.
      if (!bots.isBot(tableId, ev.token)) armHumanTimer(tableId, ev.token);
      if (sid) io.to(sid).emit('yourTurn', { legal: ev.legal });
    }
    // handStart / handEnd / action / street go to everyone at the table
    io.to(tableId).emit(ev.type, ev);
  }
  broadcastState(tableId);
  // auto-start next hand when waiting and enough players
  const eng = room.engine;
  if (eng.state === 'waiting' && eng.canStartHand()) {
    // small delay so clients see the result first
    setTimeout(() => {
      if (eng.state === 'waiting' && eng.canStartHand()) {
        eng.startHand();
        syncTable(tableId);
      }
    }, 3000);
  }
}

io.on('connection', (socket) => {
  let tableId = null;
  let token = null;

  // Watch a table's live game without taking a seat. The game is already
  // going when the page opens; the player taps a chair to join it.
  socket.on('spectate', (msg = {}) => {
    if (msg.v !== PROTOCOL_V) {
      socket.emit('error', { code: 'stale-client', msg: 'Please refresh — poker client out of date.' });
      return;
    }
    const room = rooms.getTable(msg.table);
    if (!room) {
      socket.emit('error', { code: 'no-table', msg: 'Unknown table.' });
      return;
    }
    removeSpectator(socket.id);
    tableId = msg.table;
    addSpectator(tableId, socket.id);
    socket.join(tableId);
    socket.emit('room', room.engine.getState(null));
  });

  // Reconnect with the same token: same seat, same hand if still live.
  socket.on('resume', (msg = {}) => {
    if (msg.v !== PROTOCOL_V) {
      socket.emit('error', { code: 'stale-client', msg: 'Please refresh — poker client out of date.' });
      return;
    }
    const room = rooms.getTable(msg.table);
    const p = room && msg.token && room.engine.players.get(msg.token);
    if (!p) {
      socket.emit('resumeFailed', {});
      return;
    }
    removeSpectator(socket.id);
    tableId = msg.table;
    token = msg.token;
    rooms.attach(tableId, token, socket.id);
    socket.join(tableId);
    const rp = room.engine.players.get(token);
    socket.emit('joined', { token, table: tableId, resumed: true, seat: rp ? rp.seat : -1 });
    socket.emit('room', room.engine.getState(token));
    broadcastState(tableId);
  });

  socket.on('join', (msg = {}) => {
    // msg: { table, token, v, name, buyIn, seat }
    if (msg.v !== PROTOCOL_V) {
      socket.emit('error', { code: 'stale-client', msg: 'Please refresh — poker client out of date.' });
      return;
    }
    const room = rooms.getTable(msg.table);
    if (!room) {
      socket.emit('error', { code: 'no-table', msg: 'Unknown table.' });
      return;
    }
    removeSpectator(socket.id);
    tableId = msg.table;
    token = msg.token || rooms.newToken();

    const isNew = !room.engine.players.has(token);
    if (isNew) {
      // Seat the human; if the table is physically full of bots, one bot
      // yields its seat first (everyone inside sees one leave, one arrive).
      // Genuinely full of humans -> clean table-full error.
      // A tapped chair (msg.seat) is honored when a bot holds it.
      const seat = bots.seatHuman(tableId, token, msg.name || 'Player', msg.buyIn, msg.seat);
      if (seat < 0) {
        socket.emit('error', { code: 'table-full', msg: 'Table is full. Try another table.' });
        tableId = null; token = null;
        return;
      }
    }
    rooms.attach(tableId, token, socket.id);
    socket.join(tableId);
    const jp = room.engine.players.get(token);
    socket.emit('joined', { token, table: tableId, seat: jp ? jp.seat : -1 });
    // send this player their personalized state immediately
    socket.emit('room', room.engine.getState(token));
    // let everyone else know the lineup changed
    broadcastState(tableId);
    // maybe start a hand
    syncTable(tableId);
  });

  // Broke human reloads to the starting stack, back in the next hand.
  socket.on('rebuy', () => {
    const r = tableId && rooms.getTable(tableId);
    const p = r && token && r.engine.players.get(token);
    if (!p) {
      socket.emit('error', { code: 'not-joined', msg: 'Join a table first.' });
      return;
    }
    if (p.stack > 0) return;
    p.stack = r.engine.startingStack;
    p.sittingOut = r.engine.state !== 'waiting';
    syncTable(tableId);
  });

  const requireSeat = () => {
    if (!tableId || !token) {
      socket.emit('error', { code: 'not-joined', msg: 'Join a table first.' });
      return null;
    }
    return rooms.getTable(tableId);
  };

  socket.on('fold', () => { const r = requireSeat(); if (!r) return;
    clearHumanTimer(token);
    const res = r.engine.act(token, 'fold');
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.' });
    syncTable(tableId);
  });
  socket.on('check', () => { const r = requireSeat(); if (!r) return;
    clearHumanTimer(token);
    const res = r.engine.act(token, 'check');
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.' });
    syncTable(tableId);
  });
  socket.on('call', () => { const r = requireSeat(); if (!r) return;
    clearHumanTimer(token);
    const res = r.engine.act(token, 'call');
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.' });
    syncTable(tableId);
  });
  socket.on('raise', (msg = {}) => { const r = requireSeat(); if (!r) return;
    clearHumanTimer(token);
    const res = r.engine.act(token, 'raise', msg.amount);
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.', min: res.min });
    syncTable(tableId);
  });
  socket.on('leave', () => {
    const r = tableId && rooms.getTable(tableId);
    if (r) { r.engine.removePlayer(token); rooms.detachBySocket(socket.id); syncTable(tableId); }
    if (tableId) socket.leave(tableId);
    clearHumanTimer(token);
    removeSpectator(socket.id);
    tableId = null; token = null;
  });

  socket.on('disconnect', () => {
    rooms.detachBySocket(socket.id);
    removeSpectator(socket.id);
    if (tableId) syncTable(tableId);
    tableId = null; token = null;
  });
});

// sweep disconnected players every 30s
setInterval(() => rooms.sweep(), 30000);

// bot loop: seat bots at boot, act bot turns on a human-like cadence,
// and kick off hands on bot-only tables (no sockets to trigger syncTable).
for (const cfg of TABLE_CONFIGS) bots.reconcile(cfg.id);
setInterval(() => {
  for (const cfg of TABLE_CONFIGS) {
    const room = rooms.getTable(cfg.id);
    if (!room) continue;
    if (bots.tickTable(cfg.id)) {
      syncTable(cfg.id);
    } else if (room.engine.state === 'waiting' && room.engine.canStartHand()) {
      room.engine.startHand();
      syncTable(cfg.id);
    }
  }
}, BOT_TICK_MS);

// graceful shutdown (Render SIGTERM)
process.on('SIGTERM', () => {
  console.log('SIGTERM — draining...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 25000).unref();
});

server.listen(PORT, () => {
  console.log(`Nikkiflixs poker server v${PROTOCOL_V} on :${PORT}`);
  console.log('Tables:', rooms.listTables().map(t => t.id).join(', '));
});

module.exports = { app, io, rooms, syncTable, broadcastState, PROTOCOL_V, bots, TABLE_CONFIGS };
