const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errs = [];
  const dom = new JSDOM(html, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createBuffer() { return { getChannelData: () => new Float32Array(16) }; } createBufferSource() { return { connect() {}, start() {}, buffer: null }; } createBiquadFilter() { return { connect() {}, frequency: { value: 0 }, Q: { value: 0 }, type: '' }; } get currentTime() { return 0; } get sampleRate() { return 44100; } get destination() { return {}; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    try { w.localStorage.setItem('nikkiflixs_bankroll', '2000'); w.localStorage.setItem('nikkiflixs_creator', '1'); } catch (e) { errs.push('seed: ' + e.message); }
    w.addEventListener('error', e => errs.push(String(e.message || e.error)));
  } });
  const w = dom.window, d = w.document;
  const pump = setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
  await wait(1500);
  const btns = [...d.querySelectorAll('#tableGrid .join-table')];
  console.log('tables available:', btns.length);
  btns[btns.length - 1].click(); await wait(800);
  const T = w.__pokerTest; T.setSpeed(0.05);
  console.log('stack at open:', T.getState().stacks[0], '| wallet:', w.localStorage.getItem('nikkiflixs_bankroll'));
  const driver = setInterval(() => { const check = d.querySelector('[data-action="check"]'), call = d.querySelector('[data-action="call"]'); if (check && !check.disabled) check.click(); else if (call && !call.disabled) call.click(); }, 150);
  let t0 = Date.now(), sawZero = false, rescued = false;
  while (Date.now() - t0 < 300000) {
    const st = T.getState(); const log = T.getLog();
    if (st.stacks[0] <= 0) sawZero = true;
    if (log.some(e => e.type === 'creator-refill')) { rescued = true; break; }
    await wait(500);
  }
  const log = T.getLog(); const rf = log.filter(e => e.type === 'creator-refill');
  console.log('saw stack hit zero:', sawZero, '| AUTO-REFILL fired on its own:', rescued, '| src:', rf.length ? rf[0].detail.src : '-', '| stack now:', T.getState().stacks[0], '| wallet now:', w.localStorage.getItem('nikkiflixs_bankroll'));
  console.log('errors:', errs.slice(0, 2).join(' | ') || 'none');
  clearInterval(pump); clearInterval(driver); process.exit(0);
})();
