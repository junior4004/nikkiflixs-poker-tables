'use strict';
// Nikkiflixs poker server — Phase 1.
// Express + Socket.IO, server-authoritative Texas Hold'em.
// Protocol v1. Clients that don't speak v1 get a "refresh" error.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { RoomManager } = require('./roomManager');

const PROTOCOL_V = 1;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// ---- health check (Render + uptime monitors) ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, v: PROTOCOL_V, tables: rooms.listTables(), uptime: process.uptime() });
});

// ---- static test client ----
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new RoomManager();
// Phase 1 tables (mirrors the future emerald/red stakes)
rooms.createTable('emerald', { smallBlind: 2, bigBlind: 5, maxPlayers: 8, startingStack: 1000 });
rooms.createTable('red', { smallBlind: 1, bigBlind: 2, maxPlayers: 8, startingStack: 1000 });

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
      const seat = room.engine.addPlayer(token, msg.name || 'Player', msg.buyIn);
      if (seat < 0) {
        socket.emit('error', { code: 'table-full', msg: 'Table is full.' });
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

module.exports = { app, io, rooms, syncTable, broadcastState, PROTOCOL_V };
