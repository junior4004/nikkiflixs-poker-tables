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
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.02);
  await new Promise(r => setTimeout(r, 3200));
  w.document.querySelectorAll('.seat')[0].querySelector('.sit-in').click();
  console.log('sat in');
  const clicker = setInterval(() => {
    const st = T.getState();
    if (st.actionsEnabled) {
      const check = w.document.querySelector('[data-action="check"]');
      const call = w.document.querySelector('[data-action="call"]');
      if (check && !check.disabled) check.click();
      else if (call && !call.disabled) call.click();
    }
  }, 250);
  const t0 = Date.now();
  const sampler = setInterval(() => {
    const st = T.getState();
    console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s hand=${st.handNumber} running=${st.running} heroStack=${st.stacks[0]} pot=${st.pot} sittingOut=${JSON.stringify(st.sittingOut)}`);
    if (Date.now() - t0 > 90000) { clearInterval(sampler); clearInterval(clicker); process.exit(0); }
  }, 6000);
})();
