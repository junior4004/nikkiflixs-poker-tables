'use strict';
/* Test for POST /api/admin/reset-password — boots the REAL server locally.
   Run: node test/admin-reset.js  (from nikkiflixs-server/)
   Uses throwaway DATA_DIRs under /tmp, file-mode store (no DATABASE_URL),
   and never touches the live server. Exit 0 = all checks pass. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra !== undefined ? ' | ' + extra : ''));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(port, p, body) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function get(port, p, token) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

function boot(port, dataDir, extraEnv, wipe = true) {
  if (wipe) fs.rmSync(dataDir, { recursive: true, force: true });
  const child = spawn('node', ['server.js'], {
    cwd: DIR,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return { child, out: () => out };
}
async function waitUp(port, bootInfo) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return true;
    } catch (e) { /* not up yet */ }
    await wait(250);
  }
  console.log('server did not come up on :' + port, '\n--- server output ---\n' + bootInfo.out());
  return false;
}
async function stop(bootInfo) {
  bootInfo.child.kill('SIGTERM');
  await wait(500);
  if (!bootInfo.child.killed) bootInfo.child.kill('SIGKILL');
}

(async () => {
  // --- Boot A: ADMIN_RESET_KEY NOT set -> reset endpoint is dead (503) ---
  const dataA = '/tmp/admin-reset-test/data-a';
  const A = boot(3459, dataA, {});
  if (!await waitUp(3459, A)) { failures++; process.exit(1); }
  const noKey = await post(3459, '/api/admin/reset-password', { username: 'junior4004', newPassword: 'newpass1', resetKey: 'anything' });
  check('1) no ADMIN_RESET_KEY configured -> 503', noKey.status === 503, 'got ' + noKey.status);
  await stop(A);

  // --- Boot B: ADMIN_RESET_KEY=testkey, CREATOR_USERNAME=junior4004 ---
  const dataB = '/tmp/admin-reset-test/data-b';
  const B = boot(3460, dataB, { ADMIN_RESET_KEY: 'testkey', CREATOR_USERNAME: 'junior4004' });
  if (!await waitUp(3460, B)) { failures++; process.exit(1); }

  const su = await post(3460, '/api/signup', { username: 'junior4004', password: 'oldpass1' });
  check('2) signup junior4004 -> 201', su.status === 201, 'got ' + su.status);
  const loginOld = await post(3460, '/api/login', { username: 'junior4004', password: 'oldpass1' });
  check('3) old password logs in before reset', loginOld.status === 200, 'got ' + loginOld.status);

  const wrongKey = await post(3460, '/api/admin/reset-password', { username: 'junior4004', newPassword: 'newpass1', resetKey: 'wrongkey' });
  check('4) wrong resetKey -> 401', wrongKey.status === 401, 'got ' + wrongKey.status);

  const shortPw = await post(3460, '/api/admin/reset-password', { username: 'junior4004', newPassword: 'abc', resetKey: 'testkey' });
  check('5) right key + short password -> 400', shortPw.status === 400, 'got ' + shortPw.status);

  const noUser = await post(3460, '/api/admin/reset-password', { username: 'nobodyhere', newPassword: 'newpass1', resetKey: 'testkey' });
  check('6) reset for nonexistent user -> 404', noUser.status === 404, 'got ' + noUser.status);

  // throttle: 8 tries allowed per ip+username per minute, 9th -> 429
  let throttleStatuses = [];
  for (let i = 0; i < 9; i++) {
    const r = await post(3460, '/api/admin/reset-password', { username: 'throttleuser', newPassword: 'newpass1', resetKey: 'bad' });
    throttleStatuses.push(r.status);
  }
  check('7) 9 rapid wrong-key tries -> first 8 are 401, 9th is 429',
    throttleStatuses.slice(0, 8).every((s) => s === 401) && throttleStatuses[8] === 429,
    'got ' + throttleStatuses.join(','));

  // the real reset: mixed-case username must still find the account
  const ok = await post(3460, '/api/admin/reset-password', { username: 'JUNIOR4004', newPassword: 'newpass1', resetKey: 'testkey' });
  const bodyStr = JSON.stringify(ok.json);
  check('8) right key + valid password -> 200 {ok:true, username}', ok.status === 200 && ok.json.ok === true && ok.json.username === 'junior4004', 'got ' + ok.status + ' ' + bodyStr);
  check('9) reset response never contains a password or hash', !/newpass1|passHash|scrypt|:([0-9a-f]{32}):/.test(bodyStr), bodyStr);

  const loginOldAfter = await post(3460, '/api/login', { username: 'junior4004', password: 'oldpass1' });
  check('10) old password no longer works -> 401', loginOldAfter.status === 401, 'got ' + loginOldAfter.status);
  const loginNew = await post(3460, '/api/login', { username: 'junior4004', password: 'newpass1' });
  check('11) new password logs in -> 200', loginNew.status === 200, 'got ' + loginNew.status);
  const me = await get(3460, '/api/me', loginNew.json.token);
  check('12) role refreshed to creator (CREATOR_USERNAME=junior4004)', me.json.role === 'creator', 'got role=' + me.json.role);

  // persistence: wait for the debounced save, restart, new password still works
  await wait(400);
  await stop(B);
  const B2 = boot(3460, dataB, { ADMIN_RESET_KEY: 'testkey', CREATOR_USERNAME: 'junior4004' }, false);
  // wipe=false: keep the saved accounts.json so the restart proves persistence
  if (!await waitUp(3460, B2)) { failures++; process.exit(1); }
  const loginAfterRestart = await post(3460, '/api/login', { username: 'junior4004', password: 'newpass1' });
  check('13) new password still works after server restart (save persisted)', loginAfterRestart.status === 200, 'got ' + loginAfterRestart.status);
  await stop(B2);

  console.log(failures === 0 ? 'ALL RESET TESTS PASSED' : failures + ' TEST(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('test crashed:', e); process.exit(1); });
