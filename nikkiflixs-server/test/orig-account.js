const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
// Faithful stub of the real accounts API (same shapes the live server returns)
function makeFetch() {
  const users = new Map(), sessions = new Map();
  return async function (url, opts = {}) {
    const body = opts.body ? JSON.parse(opts.body) : {};
    const json = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
    if (url.endsWith('/api/signup')) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(body.username || '')) return json(400, { error: 'Username must be 3-20 letters, numbers or underscores.' });
      if ((body.password || '').length < 6) return json(400, { error: 'Password must be at least 6 characters.' });
      if (users.has(body.username.toLowerCase())) return json(409, { error: 'That username is taken.' });
      const u = { username: body.username, password: body.password, role: body.username.toLowerCase() === 'thecreator' ? 'creator' : 'player', createdAt: new Date().toISOString() };
      users.set(u.username.toLowerCase(), u);
      const token = 'tok-' + Math.random().toString(36).slice(2);
      sessions.set(token, u);
      return json(201, { username: u.username, role: u.role, createdAt: u.createdAt, token });
    }
    if (url.endsWith('/api/login')) {
      const u = users.get((body.username || '').toLowerCase());
      if (!u || u.password !== body.password) return json(401, { error: 'Wrong username or password.' });
      const token = 'tok-' + Math.random().toString(36).slice(2);
      sessions.set(token, u);
      return json(200, { username: u.username, role: u.role, createdAt: u.createdAt, token });
    }
    if (url.endsWith('/api/me')) {
      const t = (opts.headers || {}).Authorization?.replace('Bearer ', '');
      const u = sessions.get(t);
      if (!u) return json(401, { error: 'Not signed in.' });
      return json(200, { username: u.username, role: u.role, createdAt: u.createdAt });
    }
    if (url.endsWith('/api/logout')) {
      const t = (opts.headers || {}).Authorization?.replace('Bearer ', '');
      sessions.delete(t);
      return json(200, { ok: true });
    }
    return json(404, { error: '?' });
  };
}
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.fetch = makeFetch();
  }
});
const w = dom.window;
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(900);
  // open account modal via the profile button
  w.document.getElementById('profileAccount').click();
  await wait(150);
  console.log('1) account modal open:', w.document.getElementById('accountModal').classList.contains('open'), '| form shown:', !!w.document.getElementById('acctUser'));
  // sign up as thecreator
  w.document.getElementById('acctUser').value = 'thecreator';
  w.document.getElementById('acctPass').value = 'bossman1';
  w.document.getElementById('acctSignup').click();
  await wait(300);
  const acct = JSON.parse(w.localStorage.getItem('nikkiflixs_account') || 'null');
  console.log('2) signed in as:', acct && acct.username, '| role:', acct && acct.role, '| session stored:', !!w.localStorage.getItem('nikkiflixs_session'));
  console.log('3) creator flag ON from account:', w.__creatorOn(), '| seat name:', w.document.querySelector('.seat[data-index="0"] .nameplate strong').textContent, '| popCount:', w.document.getElementById('popCount').textContent);
  // log out
  w.document.getElementById('acctLogout').click();
  await wait(200);
  console.log('4) after logout: account cleared:', !w.localStorage.getItem('nikkiflixs_account'), '| creator flag off:', !w.__creatorOn());
  // wrong password login
  w.document.getElementById('profileAccount').click(); await wait(150);
  w.document.getElementById('acctUser').value = 'thecreator';
  w.document.getElementById('acctPass').value = 'wrongpass';
  w.document.getElementById('acctLogin').click();
  await wait(300);
  console.log('5) wrong login shows error:', /Wrong username or password/.test(w.document.getElementById('accountBody').textContent), '| still signed out:', !w.localStorage.getItem('nikkiflixs_account'));
  // player signup: no creator
  w.document.getElementById('acctUser').value = 'player_one';
  w.document.getElementById('acctPass').value = 'playerpass';
  w.document.getElementById('acctSignup').click();
  await wait(300);
  const a2 = JSON.parse(w.localStorage.getItem('nikkiflixs_account') || 'null');
  console.log('6) player account:', a2 && a2.username, a2 && a2.role, '| creator flag stays off:', !w.__creatorOn());
  // errors: none expected in page
  process.exit(0);
})();
