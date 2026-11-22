const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  }
});
const w = dom.window;
setInterval(() => { w.document.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
(async () => {
  await new Promise(r => setTimeout(r, 600));
  const cards = [...w.document.querySelectorAll('#tableGrid .table-choice')];
  console.log('lobby cards:', cards.length);
  cards.slice(0, 7).forEach((c, i) => {
    const dots = c.querySelectorAll('.thumb-dot'), on = c.querySelectorAll('.thumb-dot.on');
    const btn = c.querySelector('.join-table');
    console.log(' card', i, 'thumb:', !!c.querySelector('.table-thumb'), 'dots:', dots.length, 'lit:', on.length, 'seats-attr:', btn && btn.getAttribute('data-seats'));
  });
  await new Promise(r => setTimeout(r, 3000));
  const st = w.__pokerTest.getState();
  console.log('game still auto-starts: running=', st.running, 'hand=', st.handNumber);
  process.exit(0);
})();
