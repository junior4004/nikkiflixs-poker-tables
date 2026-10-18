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

// broadcast a full personalized state to every attached socket at a table
function broadcastState(tableId) {
  const room = rooms.getTable(tableId);
  if (!room) return;
  rooms.eachSocket(room, (token, socketId) => {
    io.to(socketId).emit('room', room.engine.getState(token));
  });
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

  socket.on('join', (msg = {}) => {
    // msg: { table, token, v, name, buyIn }
    if (msg.v !== PROTOCOL_V) {
      socket.emit('error', { code: 'stale-client', msg: 'Please refresh — poker client out of date.' });
      return;
    }
    const room = rooms.getTable(msg.table);
    if (!room) {
      socket.emit('error', { code: 'no-table', msg: 'Unknown table.' });
      return;
    }
    tableId = msg.table;
    token = msg.token || rooms.newToken();

    const isNew = !room.engine.players.has(token);
    if (isNew) {
      // Seat the human; if the table is physically full of bots, one bot
      // yields its seat first (everyone inside sees one leave, one arrive).
      // Genuinely full of humans -> clean table-full error.
      const seat = bots.seatHuman(tableId, token, msg.name || 'Player', msg.buyIn);
      if (seat < 0) {
        socket.emit('error', { code: 'table-full', msg: 'Table is full. Try another table.' });
        tableId = null; token = null;
        return;
      }
    }
    rooms.attach(tableId, token, socket.id);
    socket.join(tableId);
    socket.emit('joined', { token, table: tableId });
    // send this player their personalized state immediately
    socket.emit('room', room.engine.getState(token));
    // let everyone else know the lineup changed
    broadcastState(tableId);
    // maybe start a hand
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
    const res = r.engine.act(token, 'fold');
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.' });
    syncTable(tableId);
  });
  socket.on('check', () => { const r = requireSeat(); if (!r) return;
    const res = r.engine.act(token, 'check');
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.' });
    syncTable(tableId);
  });
  socket.on('call', () => { const r = requireSeat(); if (!r) return;
    const res = r.engine.act(token, 'call');
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.' });
    syncTable(tableId);
  });
  socket.on('raise', (msg = {}) => { const r = requireSeat(); if (!r) return;
    const res = r.engine.act(token, 'raise', msg.amount);
    if (!res.ok) socket.emit('error', { code: res.error, msg: 'Action rejected.', min: res.min });
    syncTable(tableId);
  });
  socket.on('leave', () => {
    const r = tableId && rooms.getTable(tableId);
    if (r) { r.engine.removePlayer(token); rooms.detachBySocket(socket.id); syncTable(tableId); }
    if (tableId) socket.leave(tableId);
    tableId = null; token = null;
  });

  socket.on('disconnect', () => {
    rooms.detachBySocket(socket.id);
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
