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
if (!Array.isArray(store.codes)) store.codes = []; // gift codes (admin tool)
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
        if (!Array.isArray(store.codes)) store.codes = [];
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
    if (origin === 'https://nikkiflixs.com' || origin === 'https://www.nikkiflixs.com' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
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

  /* ---------- admin password reset ----------
     Jerry's Junior4004 account exists in the store (signup says "taken")
     but the password on file does not match, and there is no reset path.
     This endpoint lets an operator holding the dashboard-only reset key
     set a new password for any account.
     - The key is ADMIN_RESET_KEY (Render dashboard env var, never in code).
       If it is unset, the endpoint is dead: every call gets 503.
     - The key is compared in constant time; a wrong key gets 401.
     - Rate-limited exactly like login (8 tries / minute per ip+username).
     - The new password follows the signup rule (>= 6 chars).
     - The user's role is refreshed from the current CREATOR_USERNAME env,
       so a reset after CREATOR_USERNAME=junior4004 also restores creator.
     - Only "password reset for <username>" is logged. The response never
       contains a password or a hash. */
  app.post('/api/admin/reset-password', async (req, res) => {
    try { await ensureReady(); } catch (e) { return res.status(503).json({ error: 'Accounts are waking up — try again in a few seconds.' }); }
    const { username, newPassword, resetKey } = req.body || {};
    const key = (req.ip || '') + '|' + String(username || '').toLowerCase();
    if (throttled(key)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
    noteAttempt(key);
    const configuredKey = process.env.ADMIN_RESET_KEY;
    if (!configuredKey) return res.status(503).json({ error: 'Password reset is not configured on this server.' });
    const supplied = String(resetKey || '');
    const keyOk = supplied.length === configuredKey.length &&
      crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configuredKey));
    if (!keyOk) return res.status(401).json({ error: 'Reset not allowed.' });
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const u = findUser(username);
    if (!u) return res.status(404).json({ error: 'No such account.' });
    u.passHash = await hashPassword(newPassword);
    u.role = u.nameLower === CREATOR_USERNAME ? 'creator' : 'player';
    saveStore();
    console.log('accounts: password reset for', u.username);
    res.json({ ok: true, username: u.username });
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

  /* ---------- server gift codes (admin tool, queue item 6) ----------
     Honest codes: issued and redeemed on the server, never in client code.
     - Only role 'creator' (server-side, from the session token) can issue.
     - A code carries the EXACT coin amount the creator picks at issue time.
     - One account cannot redeem the same code twice; a global maxRedemptions
       cap and an optional expiry are enforced here, not on the device.
     - These are a SEPARATE system from the legacy NF codes (client-side
       checksum codes in the poker tables / coin store). Those are untouched
       by these endpoints and keep their own per-device behavior. */
  function codesList() {
    if (!Array.isArray(store.codes)) store.codes = [];
    return store.codes;
  }
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newGiftCode() {
    for (let tries = 0; tries < 20; tries++) {
      let rand = '';
      for (let i = 0; i < 8; i++) rand += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      const code = 'NFG-' + rand;
      if (!codesList().some((c) => c.code === code)) return code;
    }
    return 'NFG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  }

  app.post('/api/admin/codes', async (req, res) => {
    try { await ensureReady(); } catch (e) { return res.status(503).json({ error: 'Accounts are waking up — try again in a few seconds.' }); }
    const u = userForToken(bearer(req));
    if (!u) return res.status(401).json({ error: 'Not signed in.' });
    if (u.role !== 'creator') return res.status(403).json({ error: 'Creator only.' });
    const body = req.body || {};
    const coins = Math.floor(Number(body.coins));
    if (!Number.isFinite(coins) || coins < 1 || coins > 100000000) {
      return res.status(400).json({ error: 'Coins must be a whole number from 1 to 100,000,000.' });
    }
    let maxRedemptions = body.maxRedemptions === undefined ? 1 : Math.floor(Number(body.maxRedemptions));
    if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000) {
      return res.status(400).json({ error: 'Uses must be a whole number from 1 to 1000.' });
    }
    let expiresAt = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Expiry must be a valid date.' });
      expiresAt = d.toISOString();
    }
    const entry = { code: newGiftCode(), coins, createdBy: u.username, createdAt: new Date().toISOString(), expiresAt, maxRedemptions, redeemedBy: [] };
    codesList().push(entry);
    saveStore();
    res.status(201).json({ code: entry.code, coins: entry.coins, maxRedemptions: entry.maxRedemptions, expiresAt: entry.expiresAt, createdAt: entry.createdAt });
  });

  app.get('/api/admin/codes', async (req, res) => {
    try { await ensureReady(); } catch (e) { return res.status(503).json({ error: 'Accounts are waking up — try again in a few seconds.' }); }
    const u = userForToken(bearer(req));
    if (!u) return res.status(401).json({ error: 'Not signed in.' });
    if (u.role !== 'creator') return res.status(403).json({ error: 'Creator only.' });
    const mine = codesList().filter((c) => c.createdBy === u.username).slice().reverse().map((c) => ({
      code: c.code, coins: c.coins, maxRedemptions: c.maxRedemptions,
      redeemed: c.redeemedBy.length, redeemedBy: c.redeemedBy,
      expiresAt: c.expiresAt, createdAt: c.createdAt,
      status: (c.expiresAt && Date.now() > new Date(c.expiresAt).getTime()) ? 'expired' : (c.redeemedBy.length >= c.maxRedemptions ? 'used up' : 'active')
    }));
    res.json({ codes: mine });
  });

  app.post('/api/redeem-code', async (req, res) => {
    try { await ensureReady(); } catch (e) { return res.status(503).json({ error: 'Accounts are waking up — try again in a few seconds.' }); }
    const u = userForToken(bearer(req));
    if (!u) return res.status(401).json({ error: 'Sign in first — server codes go to your account wallet.' });
    const raw = String((req.body || {}).code || '').trim().toUpperCase();
    const entry = codesList().find((c) => c.code === raw);
    if (!entry) return res.status(404).json({ error: 'That code does not check out — type it exactly as given.' });
    if (entry.expiresAt && Date.now() > new Date(entry.expiresAt).getTime()) {
      return res.status(410).json({ error: 'That code has expired.' });
    }
    if (entry.redeemedBy.includes(u.username)) {
      return res.status(409).json({ error: 'You already redeemed that code.' });
    }
    if (entry.redeemedBy.length >= entry.maxRedemptions) {
      return res.status(409).json({ error: 'That code has already been fully redeemed.' });
    }
    entry.redeemedBy.push(u.username);
    if (!u.wallet || typeof u.wallet.bankroll !== 'number') u.wallet = { bankroll: 0, popsTaunt: 0, popsMad: 0, diceSets: [], gifts: {} };
    u.wallet.bankroll += entry.coins;
    saveStore();
    res.json({ ok: true, coins: entry.coins, bankroll: u.wallet.bankroll });
  });

  app.get('/api/accounts/health', async (req, res) => {
    try { await ensureReady(); } catch (e) { /* report not-ready below */ }
    res.json({ ok: true, users: store.users.length, creatorUsername: CREATOR_USERNAME, storage: USE_PG ? 'postgres' : 'file', dbReady });
  });
}

module.exports = { registerAccountRoutes, _store: () => store };
