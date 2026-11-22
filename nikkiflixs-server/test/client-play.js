'use strict';
// Full client in jsdom: join the red table as a human, wait for our turn,
// dump hole classes/opacity/computed style for every seat.
process.env.PORT = '3995';
process.env.BOT_TICK_MS = '60';
require('../server');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { io } = require('socket.io-client');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await sleep(1200);
  let html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
  html = html.replace('https://nikkiflixs-poker-server.onrender.com', 'http://localhost:3995');

  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:3995/table-red-3d-v2.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.io = io;
      window.addEventListener('error', (e) => errors.push(e.message));
    },
  });
  const { window } = dom;
  const doc = window.document;

  await sleep(2500); // connect + spectate
  // tap the first OPEN SEAT like Jerry does
  const seats = [...doc.querySelectorAll('.seat')];
  const open = seats.find(s => s.classList.contains('empty-seat'));
  console.log('tapping seat idx', open && open.getAttribute('data-index'), 'label=', open && open.querySelector('.nameplate strong').textContent);
  if (open) open.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(3000);
  console.log('--- after join, waiting for a hand where we are dealt in + our turn ---');
  let dumped = false;
  for (let i = 0; i < 40 && !dumped; i++) {
    await sleep(1500);
    const toast = (doc.getElementById('toast') || {}).textContent || '';
    const acts = [...doc.querySelectorAll('.action')].map(b => b.textContent.trim().slice(0, 8) + (b.disabled ? ':off' : ':ON')).join(' ');
    const youSeat = seats.find(s => s.classList.contains('you'));
    if (youSeat) {
      const holes = [...youSeat.querySelectorAll('.hole')].map(h => `[${h.className}|op=${h.style.opacity}|${h.textContent || ''}${h.getAttribute('data-suit') || ''}]`).join(' ');
      console.log(`t=${i * 1.5}s toast="${toast.slice(0, 40)}" buttons: ${acts}`);
      console.log('  YOU seat holes:', holes);
      if (/turn/i.test(toast) || /CALL|RAISE/i.test(acts)) {
        console.log('--- IT IS OUR TURN (or buttons live). Full seat dump: ---');
        for (const s of seats) {
          const name = (s.querySelector('.nameplate strong') || {}).textContent || '?';
          const hs = [...s.querySelectorAll('.hole')].map(h => `[${h.className}|op=${h.style.opacity}]`).join(' ');
          const cs = window.getComputedStyle(s.querySelector('.pocket'));
          console.log(`seat[${s.getAttribute('data-index')}] ${name} view=${s.getAttribute('data-view-slot')} pocket(top=${cs.top},z=${cs.zIndex},disp=${cs.display}) holes: ${hs}`);
        }
        dumped = true;
      }
    }
  }
  if (!dumped) console.log('never reached our turn in 60s');
  console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
  dom.window.close();
  process.exit(0);
}
main().catch(e => { console.error('FAIL', e); process.exit(1); });
