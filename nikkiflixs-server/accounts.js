'use strict';
/* Nikkiflixs accounts — signup / login / sessions.
   Passwords: scrypt (Node built-in), salted, never stored or logged in plain text.
   Store: Postgres when DATABASE_URL is set (production: free Neon database —
   accounts live OUTSIDE Render, so they survive every restart/redeploy/sleep).
   Without DATABASE_URL it falls back to one JSON file in DATA_DIR (local dev).
   The account whose username matches CREATOR_USERNAME (env, default 'thecreator')
   gets role 'creator' — server-side recognition on any device.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'accounts.json');
const CREATOR_USERNAME = (process.env.CREATOR_USERNAME || 'thecreator').toLowerCase();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const USE_PG = !!process.env.DATABASE_URL;

/* ---------- storage: Postgres (Neon) or JSON file ---------- */
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
  pool.on('error', (e) => console.error('accounts: pg pool error:', e.message));
}

function loadStoreFile() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.users) && data.sessions) return data;
  } catch (e) { /* first boot or unreadable: start fresh */ }
  return { users: [], sessions: {} };
}

let store = USE_PG ? { users: [], sessions: {} } : loadStoreFile();
let dbReady = !USE_PG;
let dbInitPromise = null;

function ensureReady() {
  if (!USE_PG) return Promise.resolve();
  if (dbReady) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await pool.query('CREATE TABLE IF NOT EXISTS nf_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
      const r = await pool.query("SELECT v FROM nf_kv WHERE k = 'accounts'");
      if (r.rows.length && r.rows[0].v && Array.isArray(r.rows[0].v.users) && r.rows[0].v.sessions) {
        store = r.rows[0].v;
      }
      dbReady = true;
      console.log('accounts: postgres store ready, users:', store.users.length);
    })().catch((e) => {
      dbInitPromise = null;
      console.error('accounts: postgres init failed:', e.message);
      throw e;
    });
  }
  return dbInitPromise;
}

let saveTimer = null;
function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (USE_PG) {
      pool.query(
        "INSERT INTO nf_kv (k, v) VALUES ('accounts', $1::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
        [JSON.stringify(store)]
      ).catch((e) => console.error('accounts: pg save failed:', e.message));
      return;
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STORE_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store));
      fs.renameSync(tmp, STORE_PATH);
    } catch (e) { console.error('accounts: save failed:', e.message); }
  }, 60);
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(salt.toString('hex') + ':' + key.toString('hex'));
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split(':');
    if (parts.length !== 2) return resolve(false);
    const salt = Buffer.from(parts[0], 'hex');
    const expected = Buffer.from(parts[1], 'hex');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return resolve(false);
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

function newToken() { return crypto.randomBytes(32).toString('hex'); }
function tokenKey(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

function findUser(username) {
  const lower = String(username || '').toLowerCase();
  return store.users.find(u => u.nameLower === lower) || null;
}

function publicUser(u) {
  return { username: u.username, role: u.role, createdAt: u.createdAt };
}

function issueSession(u) {
  const token = newToken();
  store.sessions[tokenKey(token)] = { username: u.username, expires: Date.now() + SESSION_TTL_MS };
  saveStore();
  return token;
}

function userForToken(token) {
  if (!token) return null;
  const s = store.sessions[tokenKey(token)];
  if (!s) return null;
  if (s.expires < Date.now()) { delete store.sessions[tokenKey(token)]; saveStore(); return null; }
  return findUser(s.username);
}

const loginAttempts = new Map(); // ip+username -> [timestamps]
function throttled(key) {
  const now = Date.now();
  const list = (loginAttempts.get(key) || []).filter(t => now - t < 60000);
  loginAttempts.set(key, list);
  return list.length >= 8;
}
function noteAttempt(key) {
  const list = loginAttempts.get(key) || [];
  list.push(Date.now());
  loginAttempts.set(key, list);
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function registerAccountRoutes(app) {
  // CORS for the site (the client lives on nikkiflixs.com, the API on Render).
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin || '';
    if (origin === 'https://nikkiflixs.com' || origin === 'https://www.nikkiflixs.com' || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.post('/api/signup', async (req, res) => {
    try {
      await ensureReady();
      const { username, password } = req.body || {};
      if (!USERNAME_RE.test(String(username || ''))) {
        return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or underscores.' });
      }
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }
      if (findUser(username)) {
        return res.status(409).json({ error: 'That username is taken.' });
      }
      const passHash = await hashPassword(password);
      const u = {
        username: String(username),
        nameLower: String(username).toLowerCase(),
        passHash,
        role: String(username).toLowerCase() === CREATOR_USERNAME ? 'creator' : 'player',
        createdAt: new Date().toISOString(),
        wallet: { bankroll: 0, popsTaunt: 0, popsMad: 0, diceSets: [], gifts: {} }
      };
      store.users.push(u);
      const token = issueSession(u);
      saveStore();
      res.status(201).json({ ...publicUser(u), token });
    } catch (e) {
      res.status(500).json({ error: 'Signup failed on the server.' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try { await ensureReady(); } catch (e) { return res.status(503).json({ error: 'Accounts are waking up — try again in a few seconds.' }); }
    const { username, password } = req.body || {};
    const key = (req.ip || '') + '|' + String(username || '').toLowerCase();
    if (throttled(key)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
    noteAttempt(key);
    const u = findUser(username);
    if (!u || typeof password !== 'string' || !(await verifyPassword(password, u.passHash))) {
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    const token = issueSession(u);
    res.json({ ...publicUser(u), token });
  });

  function bearer(req) {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
  }

  app.get('/api/me', async (req, res) => {
    try { await ensureReady(); } catch (e) { return res.status(503).json({ error: 'Accounts are waking up — try again in a few seconds.' }); }
    const u = userForToken(bearer(req));
    if (!u) return res.status(401).json({ error: 'Not signed in.' });
    res.json(publicUser(u));
  });

  app.post('/api/logout', async (req, res) => {
    try { await ensureReady(); } catch (e) { /* logout stays a no-op success */ }
    const t = bearer(req);
    if (t) { delete store.sessions[tokenKey(t)]; saveStore(); }
    res.json({ ok: true });
  });

  app.get('/api/accounts/health', async (req, res) => {
    try { await ensureReady(); } catch (e) { /* report not-ready below */ }
    res.json({ ok: true, users: store.users.length, creatorUsername: CREATOR_USERNAME, storage: USE_PG ? 'postgres' : 'file', dbReady });
  });
}

module.exports = { registerAccountRoutes, _store: () => store };
