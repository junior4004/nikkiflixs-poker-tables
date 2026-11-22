'use strict';
// Render the real client page in jsdom against the local test server and
// dump what a FRESH visitor (no stored token) sees: seat labels, classes,
// pointer-events, and the SIT IN button placement.
process.env.PORT = '3996';
process.env.BOT_TICK_MS = '80';
require('../server');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { io } = require('socket.io-client');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await sleep(1200);
  const htmlPath = '/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html';
  let html = fs.readFileSync(htmlPath, 'utf8');
  // point the client at the local server instead of the live one
  html = html.replace('https://nikkiflixs-poker-server.onrender.com', 'http://localhost:3996');

  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:3996/assets/rooms/poker/table-red-3d-v2.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // inject socket.io client before the page's scripts run
      window.io = io;
      window.addEventListener('error', (e) => errors.push('win: ' + e.message));
    },
  });
  const { window } = dom;
  await sleep(6000); // connect + spectate + several room updates

  const doc = window.document;
  const seats = [...doc.querySelectorAll('.seat')];
  console.log('DOM seats:', seats.length);
  for (const s of seats) {
    const idx = s.getAttribute('data-index');
    const label = (s.querySelector('.nameplate strong') || {}).textContent || '?';
    const cls = s.className.replace(/\s+/g, ' ').trim();
    const pe = s.style.pointerEvents || '(unset)';
    const port = (s.querySelector('.portrait') || {}).src || '';
    console.log(`seat[${idx}] label="${label}" pe=${pe} class="${cls.slice(0, 90)}" portrait=${port.split('/').pop()}`);
  }
  const sitIn = doc.getElementById('sitIn');
  console.log('sitIn display:', sitIn ? sitIn.style.display : 'MISSING',
    '| host:', sitIn && sitIn.closest('.seat') ? sitIn.closest('.seat').getAttribute('data-index') : 'none');
  const toast = (doc.getElementById('toast') || {}).textContent || '';
  console.log('toast:', JSON.stringify(toast.slice(0, 80)));
  const conn = (doc.getElementById('connectionBanner') || doc.querySelector('[id*=onnection]') || {}).textContent || '';
  console.log('connection banner:', JSON.stringify(conn.slice(0, 80)));
  console.log('window errors:', errors.length ? errors.slice(0, 5) : 'none');
  dom.window.close();
  process.exit(0);
}
main().catch(e => { console.error('FAIL', e); process.exit(1); });
