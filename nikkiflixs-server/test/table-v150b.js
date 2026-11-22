const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
function boot() {
  const errs = [];
  const dom = new JSDOM(html, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createBuffer() { return { getChannelData: () => new Float32Array(16) }; } createBufferSource() { return { connect() {}, start() {}, buffer: null }; } createBiquadFilter() { return { connect() {}, frequency: { value: 0 }, Q: { value: 0 }, type: '' }; } get currentTime() { return 0; } get sampleRate() { return 44100; } get destination() { return {}; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.addEventListener('error', e => errs.push(String(e.message || e.error)));
  } });
  const w = dom.window, d = w.document;
  const pump = setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
  return { w, d, pump, errs };
}
(async () => {
  // PART 1 — self card diagnosis
  {
    const { w, d, pump } = boot();
    await wait(1500);
    [...d.querySelectorAll('#tableGrid .join-table')][0].click(); await wait(600);
    const T = w.__pokerTest; T.setSpeed(0.06);
    let t0 = Date.now();
    while (Date.now() - t0 < 60000 && !T.getLog().some(e => e.type === 'seat-activated-next-hand')) await wait(400);
    const seatList = [...d.querySelectorAll('.seat')].map(s => s.getAttribute('data-index'));
    console.log('P1) seat DOM order (data-index):', seatList.join(','), '| sittingOut:', JSON.stringify(T.getState().sittingOut));
    const heroWrap = d.querySelector('.seat[data-index="0"] .portrait-wrap');
    heroWrap.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(300);
    console.log('P1) click on data-index=0 portrait-wrap -> modal open:', d.getElementById('playerModal').classList.contains('open'), '| pcName:', (d.getElementById('pcName') || {}).textContent);
    clearInterval(pump);
  }
  // PART 2 — deterministic bust -> creator rescue
  {
    const { w, d, pump } = boot();
    await wait(1500);
    w.Math.random = () => 0.05;
    [...d.querySelectorAll('#tableGrid .join-table')][0].click(); await wait(600);
    const T = w.__pokerTest; T.setSpeed(0.05);
    const driver = setInterval(() => { const check = d.querySelector('[data-action="check"]'), call = d.querySelector('[data-action="call"]'); if (check && !check.disabled) check.click(); else if (call && !call.disabled) call.click(); }, 150);
    let t0 = Date.now(), busted = false;
    while (Date.now() - t0 < 220000) { if (T.getState().stacks[0] <= 0) { busted = true; break; } await wait(500); }
    console.log('P2) busted with scripted dice:', busted, '| stack:', T.getState().stacks[0]);
    clearInterval(driver);
    if (busted) {
      w.localStorage.setItem('nikkiflixs_creator', '1');
      const sitIn = d.getElementById('sitIn');
      console.log('P2) sitIn element present:', !!sitIn, '| visible class on seat0:', d.querySelector('.seat[data-index="0"]').className);
      if (sitIn) sitIn.click();
      await wait(1500);
      const log = T.getLog(); const rf = log.filter(e => e.type === 'creator-refill');
      console.log('P2) AUTO-REFILL fired:', rf.length > 0, '| stack now:', T.getState().stacks[0], '| wallet:', w.localStorage.getItem('nikkiflixs_bankroll'));
    }
    clearInterval(pump);
  }
  process.exit(0);
})();
