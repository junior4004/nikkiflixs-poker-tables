const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-emerald-FINAL.html', 'utf8');
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
  const T = w.__pokerTest; T.setSpeed(0.04);
  // NO CLICKS AT ALL from here — the page auto-starts; the player must be seated + dealt automatically
  let sawCards = null, acted = 0;
  const t0 = Date.now();
  await new Promise(res => {
    const iv = setInterval(() => {
      const st = T.getState();
      const holes = [...w.document.querySelector('.seat[data-index="0"]').querySelectorAll('.hole')];
      if (!sawCards && st.handNumber >= 1 && !st.sittingOut['0'] && holes.some(c => c.style.opacity === '1' && c.textContent.trim())) {
        sawCards = holes.map(c => c.textContent.trim() + (c.getAttribute('data-suit') || '')).join(' ');
      }
      if (st.actionsEnabled) {
        const c = w.document.querySelector('[data-action="check"]');
        const k = w.document.querySelector('[data-action="call"]');
        if (c && !c.disabled) { c.click(); acted++; } else if (k && !k.disabled) { k.click(); acted++; }
      }
      if ((sawCards && acted > 0 && st.handNumber >= 2) || Date.now() - t0 > 60000) { clearInterval(iv); res(); }
    }, 250);
  });
  const st = T.getState();
  console.log('AUTO-SEAT: dealt in with NO clicks:', !!sawCards, '| cards seen face-up:', sawCards, '| hero acted:', acted, 'times | hand:', st.handNumber, '| stack:', st.stacks[0], '| sittingOut:', JSON.stringify(st.sittingOut));
  process.exit(0);
})();
