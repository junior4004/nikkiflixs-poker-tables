'use strict';
// Watch mySeat/yourSeat consistency over time in the real client.
process.env.PORT = '3994';
process.env.BOT_TICK_MS = '60';
require('../server');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { io } = require('socket.io-client');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await sleep(1200);
  let html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
  html = html.replace('https://nikkiflixs-poker-server.onrender.com', 'http://localhost:3994');
  const dom = new JSDOM(html, {
    url: 'http://localhost:3994/table-red-3d-v2.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) { window.io = io; },
  });
  const { window } = dom;
  const doc = window.document;
  await sleep(2500);
  const seats = [...doc.querySelectorAll('.seat')];
  const open = seats.find(s => s.classList.contains('empty-seat'));
  console.log('tapping open seat idx', open && open.getAttribute('data-index'));
  open.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // poll the DOM 40 times over ~40s: which seat carries .you, what its holes show
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const youSeats = seats.filter(s => s.classList.contains('you')).map(s => s.getAttribute('data-index'));
    const details = youSeats.map(idx => {
      const s = seats[Number(idx)];
      const hs = [...s.querySelectorAll('.hole')].map(h => `${h.className.replace('hole', '').trim() || 'face'}:${h.style.opacity}`).join(',');
      const nm = (s.querySelector('.nameplate strong') || {}).textContent;
      return `seat${idx}(${nm})[${hs}]`;
    }).join(' ');
    const toast = ((doc.getElementById('toast') || {}).textContent || '').slice(0, 30);
    console.log(`t=${i + 1}s you=[${youSeats.join(',')}] ${details} toast="${toast}"`);
  }
  dom.window.close();
  process.exit(0);
}
main().catch(e => { console.error('FAIL', e); process.exit(1); });
