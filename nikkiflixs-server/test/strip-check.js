const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/casino/sportsbook.html', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dom = new JSDOM(html, { url: 'https://nikkiflixs.com/assets/rooms/casino/sportsbook.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = fetch;
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} } }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  } });
  const d = dom.window.document;
  await wait(6000);
  const ss = d.getElementById('ssBody');
  console.log('strip cards:', ss.querySelectorAll('.ss-card').length);
  console.log('strip sample:', (ss.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200));
  console.log('hint visible:', (d.querySelector('.pickhint') || {}).textContent || 'MISSING');
  process.exit(0);
})();
