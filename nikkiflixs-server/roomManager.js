'use strict';
// RoomManager: registry of tables. Each table = one PokerEngine.
// Player identity = UUID token (client stores in localStorage).
// One token = one seat per table; reconnect within GRACE_MS keeps the seat.

const { randomUUID } = require('crypto');
const { PokerEngine } = require('./engine/pokerEngine');

const GRACE_MS = 2 * 60 * 1000; // 2-minute reconnect grace

class RoomManager {
  constructor() {
    this.tables = new Map(); // tableId -> { engine, sockets: Map(token -> socketId), lastSeen: Map(token -> ts) }
  }

  createTable(tableId, opts = {}) {
    if (this.tables.has(tableId)) return this.tables.get(tableId);
    const engine = new PokerEngine(opts);
    const room = { id: tableId, engine, sockets: new Map(), lastSeen: new Map(), opts };
    this.tables.set(tableId, room);
    return room;
  }

  getTable(tableId) {
    return this.tables.get(tableId);
  }

  listTables() {
    return [...this.tables.entries()].map(([id, room]) => ({
      id,
      players: room.engine.players.size,
      state: room.engine.state,
      hand: room.engine.handNumber,
    }));
  }

  newToken() {
    return randomUUID();
  }

  // Bind a socket to a token at a table. Same token reconnecting kicks the old socket.
  attach(tableId, token, socketId) {
    const room = this.tables.get(tableId);
    if (!room) return null;
    room.sockets.set(token, socketId);
    room.lastSeen.set(token, Date.now());
    return room;
  }

  detachBySocket(socketId) {
    // mark last-seen; sweep later removes truly-gone players
    for (const room of this.tables.values()) {
      for (const [token, sid] of room.sockets) {
        if (sid === socketId) {
          room.sockets.delete(token);
          room.lastSeen.set(token, Date.now());
        }
      }
    }
  }

  // Remove players whose socket is gone past the grace period.
  // BUILD 269 fixup: the old code only removed a player when the table
  // happened to be 'waiting' at a sweep tick, but deleted the lastSeen
  // entry either way — so a player who disconnected mid-hand was never
  // retried and haunted the seat forever, and busy tables (bots always
  // playing) filled with ghosts until new humans got 'table-full'
  // (proven locally: the red table filled with test ghosts in ~30 min).
  // engine.removePlayer is already mid-hand safe (folds, filters toAct,
  // checkStreetEnd) and the explicit 'leave' path already calls it
  // mid-hand, so sweep now removes past-grace players unconditionally
  // and only clears lastSeen when actually removed.
  sweep() {
    const now = Date.now();
    for (const room of this.tables.values()) {
      for (const [token, ts] of room.lastSeen) {
        if (!room.sockets.has(token) && now - ts > GRACE_MS) {
          room.engine.removePlayer(token);
          room.lastSeen.delete(token);
        }
      }
    }
  }

  // Broadcast helper: call fn(room, token, socketId) for each attached socket.
  eachSocket(room, fn) {
    for (const [token, socketId] of room.sockets) fn(token, socketId);
  }
}

module.exports = { RoomManager, GRACE_MS };
