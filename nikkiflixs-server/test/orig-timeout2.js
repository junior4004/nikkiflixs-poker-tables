const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const dom = new JSDOM(html, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) { window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } }; window.navigator.vibrate = () => true; window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } });
const w = dom.window;
setInterval(() => { w.document.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.04);
  const seat0 = w.document.querySelector('.seat[data-index="0"]');
  const t0 = Date.now();
  await new Promise(res => { const iv = setInterval(() => { if (T.getLog().some(e => e.type === 'timeout' && e.detail.action === 'fold') || Date.now() - t0 > 75000) { clearInterval(iv); res(); } }, 300); });
  const st = T.getState();
  process.stdout.write('RESULT sittingOut=' + JSON.stringify(st.sittingOut) + ' emptySeatClass=' + seat0.classList.contains('empty-seat') + ' sitInBtnExists=' + !!w.document.getElementById('sitIn') + '\n');
  process.exit(0);
})();
