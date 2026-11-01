'use strict';
/* Nikkiflixs hand log — SERVER-side record of completed hands.
   SERVER-FIRST LAW (2026-10-31): nothing about a hand saves to the phone.
   The table client POSTs every completed hand here (showdown, uncontested,
   sole-survivor); the Hand Log viewer on the table reads back from here.
   If the server is unreachable the client must NOT quietly save the hand
   to the phone — it shows "log did not reach the server" and keeps the
   entry in memory only until a retry succeeds.

   Storage follows the accounts.js pattern exactly: Postgres (Neon) when
   DATABASE_URL is set, otherwise one JSON file under DATA_DIR (local dev).

   HONEST LIMIT — read before relying on this for anything legal or
   money-related: these demo tables generate hands IN THE BROWSER and
   report them to this endpoint. This log is a record of what the client
   reported, NOT proof of a server-dealt game. A client could report a
   hand that never happened, or misreport one that did. Full legit SC
   play needs server-authoritative dealing (the engine in ./engine deals
   on the server; the demo tables do not use it yet) — that is the next
   build, not this one. Do NOT present this endpoint as server-dealt
   proof. What it DOES prove: that a given hand record reached the
   server at a given time, intact, in the shape below.

   Privacy note for the next build: a completed-hand record contains
   every seat's hole cards, including folded players'. That is what the
   owner asked for (a dispute log), but a public game must NOT publish
   folded hole cards to other players — the viewer must be restricted
   to the owner / the hand's own players, and folded cards hidden from
   anyone else, before this log is ever shown to a table audience.
*/

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'hand-log.json');
const USE_PG = !!process.env.DATABASE_URL;
const MAX_FILE_HANDS = 5000;

let pool = null;
if (USE_PG) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('error', (e) => console.error('handlog: pg pool error:', e.message));
}

let dbReady = !USE_PG;
let dbInitPromise = null;
let fileHands = null; // JSON fallback: array, newest last

function ensureReady() {
  if (!USE_PG) {
    if (fileHands === null) {
      try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const data = JSON.parse(raw);
        fileHands = Array.isArray(data) ? data : [];
      } catch (e) { fileHands = []; }
    }
    return Promise.resolve();
  }
  if (dbReady) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS nf_hand_log (
        id BIGSERIAL PRIMARY KEY,
        table_id TEXT NOT NULL,
        hand_number INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        client_reported BOOLEAN NOT NULL DEFAULT TRUE,
        game TEXT NOT NULL DEFAULT 'holdem',
        board JSONB NOT NULL DEFAULT '[]'::jsonb,
        seats JSONB NOT NULL DEFAULT '[]'::jsonb,
        pot INTEGER NOT NULL DEFAULT 0,
        winners JSONB NOT NULL DEFAULT '[]'::jsonb,
        winning_hand TEXT NOT NULL DEFAULT '',
        winning_rank JSONB NOT NULL DEFAULT '[]'::jsonb,
        chosen_five JSONB NOT NULL DEFAULT '[]'::jsonb,
        contributions JSONB NOT NULL DEFAULT '[]'::jsonb,
        slices JSONB NOT NULL DEFAULT '[]'::jsonb,
        outcome TEXT NOT NULL DEFAULT 'showdown',
        session_id TEXT NOT NULL DEFAULT ''
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS nf_hand_log_table_time ON nf_hand_log (table_id, created_at DESC)');
      dbReady = true;
      console.log('handlog: postgres store ready');
    })();
  }
  return dbInitPromise;
}

/* ---------- validation / sanitising (never trust the client blindly) ---------- */
function isCard(c) {
  return Array.isArray(c) && c.length === 2 &&
    typeof c[0] === 'string' && /^(2|3|4|5|6|7|8|9|10|J|Q|K|A)$/.test(c[0]) &&
    typeof c[1] === 'string' && ['♣', '♦', '♥', '♠'].indexOf(c[1]) > -1;
}
function cleanStr(v, maxLen) {
  return typeof v === 'string' ? v.slice(0, maxLen) : '';
}
function cleanHand(body) {
  if (!body || typeof body !== 'object') return null;
  const tableId = cleanStr(body.tableId, 32);
  if (!/^[a-z0-9_-]+$/i.test(tableId)) return null;
  const handNumber = Math.floor(Number(body.handNumber));
  if (!Number.isFinite(handNumber) || handNumber < 0) return null;
  const pot = Math.floor(Number(body.pot));
  if (!Number.isFinite(pot) || pot < 0 || pot > 100000000) return null;
  const board = Array.isArray(body.board) ? body.board.filter(isCard).slice(0, 5) : [];
  const seats = Array.isArray(body.seats) ? body.seats.slice(0, 8).map((s) => ({
    seat: Math.floor(Number(s && s.seat)) || 0,
    name: cleanStr(s && s.name, 24),
    hole: Array.isArray(s && s.hole) ? s.hole.filter(isCard).slice(0, 2) : [],
    folded: !!(s && s.folded),
    sittingOut: !!(s && s.sittingOut),
    allIn: !!(s && s.allIn),
  })) : [];
  const winners = Array.isArray(body.winners) ? body.winners.slice(0, 8).map((w) => ({
    seat: Math.floor(Number(w && w.seat)) || 0,
    name: cleanStr(w && w.name, 24),
    amount: Math.max(0, Math.floor(Number(w && w.amount)) || 0),
  })) : [];
  const contributions = Array.isArray(body.contributions)
    ? body.contributions.slice(0, 8).map((v) => Math.max(0, Math.floor(Number(v)) || 0))
    : [];
  const slices = Array.isArray(body.slices) ? body.slices.slice(0, 8).map((s) => ({
    amount: Math.max(0, Math.floor(Number(s && s.amount)) || 0),
    winners: Array.isArray(s && s.winners) ? s.winners.slice(0, 8).map((v) => Math.floor(Number(v)) || 0) : [],
  })) : [];
  const outcome = ['showdown', 'uncontested', 'sole-survivor'].indexOf(body.outcome) > -1
    ? body.outcome : 'showdown';
  return {
    tableId, handNumber, pot, board, seats, winners, contributions, slices, outcome,
    game: cleanStr(body.game, 16) || 'holdem',
    winningHand: cleanStr(body.winningHand, 32),
    winningRank: Array.isArray(body.winningRank) ? body.winningRank.slice(0, 8).map((v) => Math.floor(Number(v)) || 0) : [],
    chosenFive: Array.isArray(body.chosenFive) ? body.chosenFive.filter(isCard).slice(0, 5) : [],
    sessionId: cleanStr(body.sessionId, 64),
  };
}

function publicRow(r) {
  return {
    id: r.id, tableId: r.table_id !== undefined ? r.table_id : r.tableId,
    handNumber: r.hand_number !== undefined ? r.hand_number : r.handNumber,
    createdAt: r.created_at !== undefined ? r.created_at : r.createdAt,
    clientReported: r.client_reported !== undefined ? r.client_reported : true,
    game: r.game, board: r.board, seats: r.seats, pot: r.pot, winners: r.winners,
    winningHand: r.winning_hand !== undefined ? r.winning_hand : r.winningHand,
    winningRank: r.winning_rank !== undefined ? r.winning_rank : r.winningRank,
    chosenFive: r.chosen_five !== undefined ? r.chosen_five : r.chosenFive,
    contributions: r.contributions, slices: r.slices, outcome: r.outcome,
  };
}

async function recordHand(clean) {
  await ensureReady();
  if (USE_PG) {
    const r = await pool.query(
      `INSERT INTO nf_hand_log
        (table_id, hand_number, client_reported, game, board, seats, pot, winners,
         winning_hand, winning_rank, chosen_five, contributions, slices, outcome, session_id)
       VALUES ($1,$2,TRUE,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, created_at`,
      [clean.tableId, clean.handNumber, clean.game, JSON.stringify(clean.board),
       JSON.stringify(clean.seats), clean.pot, JSON.stringify(clean.winners),
       clean.winningHand, JSON.stringify(clean.winningRank), JSON.stringify(clean.chosenFive),
       JSON.stringify(clean.contributions), JSON.stringify(clean.slices), clean.outcome, clean.sessionId]);
    return { id: r.rows[0].id, createdAt: r.rows[0].created_at };
  }
  const row = Object.assign({ id: Date.now() * 1000 + Math.floor(Math.random() * 1000) },
    { createdAt: new Date().toISOString(), clientReported: true }, clean);
  fileHands.push(row);
  if (fileHands.length > MAX_FILE_HANDS) fileHands.splice(0, fileHands.length - MAX_FILE_HANDS);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(fileHands));
    fs.renameSync(tmp, STORE_PATH);
  } catch (e) { console.error('handlog: file save failed:', e.message); }
  return { id: row.id, createdAt: row.createdAt };
}

async function listHands(tableId, limit) {
  await ensureReady();
  const n = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));
  if (USE_PG) {
    const r = await pool.query(
      'SELECT * FROM nf_hand_log WHERE table_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
      [tableId, n]);
    return r.rows.map(publicRow);
  }
  return fileHands
    .filter((h) => h.tableId === tableId)
    .slice(-n).reverse().map(publicRow);
}

function registerHandLogRoutes(app) {
  // The table page is served from a different origin (nikkiflixs.com, or a
  // local test server) than this API, so the log routes allow cross-origin
  // browser posts/reads. This is a record endpoint, not a money endpoint;
  // session auth is a next-build item before any money/SC use (see header).
  app.use('/api/hand-log', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.post('/api/hand-log', async (req, res) => {
    const clean = cleanHand(req.body);
    if (!clean) return res.status(400).json({ ok: false, error: 'bad-hand' });
    try {
      const saved = await recordHand(clean);
      res.json({ ok: true, id: saved.id, createdAt: saved.createdAt });
    } catch (e) {
      console.error('handlog: record failed:', e.message);
      res.status(500).json({ ok: false, error: 'store-failed' });
    }
  });
  app.get('/api/hand-log', async (req, res) => {
    const tableId = cleanStr(req.query.table, 32);
    if (!tableId) return res.status(400).json({ ok: false, error: 'table-required' });
    try {
      res.json({ ok: true, tableId, hands: await listHands(tableId, req.query.limit) });
    } catch (e) {
      console.error('handlog: list failed:', e.message);
      res.status(500).json({ ok: false, error: 'store-failed' });
    }
  });
  app.get('/api/hand-log/health', async (req, res) => {
    try {
      await ensureReady();
      res.json({ ok: true, store: USE_PG ? 'postgres' : 'file' });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'store-failed' });
    }
  });
}

module.exports = { registerHandLogRoutes, cleanHand, recordHand, listHands };
