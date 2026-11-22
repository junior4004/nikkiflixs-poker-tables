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
// NOTE: no animationend dispatcher in this harness — animations NEVER "finish".
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.1);
  await new Promise(r => setTimeout(r, 6000));
  let st = T.getState();
  const types = T.getLog().map(e => e.type);
  console.log('NO-ANIM: running=', st.running, 'hand=', st.handNumber);
  console.log('deal-start:', types.includes('deal-start'), '| deal-complete:', types.includes('deal-complete'), '| blinds-posted:', types.includes('blinds-posted'));
  // sit in and wait for a full hand to complete without any animation events
  w.document.querySelectorAll('.seat')[0].querySelector('.sit-in').click();
  const t0 = Date.now();
  await new Promise(res => {
    const iv = setInterval(() => {
      st = T.getState();
      if (st.actionsEnabled) {
        const c = w.document.querySelector('[data-action="check"]');
        const k = w.document.querySelector('[data-action="call"]');
        if (c && !c.disabled) c.click(); else if (k && !k.disabled) k.click();
      }
      if (T.getLog().some(e => e.type === 'hand-complete') || Date.now() - t0 > 60000) { clearInterval(iv); res(); }
    }, 300);
  });
  st = T.getState();
  const log = T.getLog().map(e => e.type);
  const heroHoles = [...w.document.querySelectorAll('.seat')[0].querySelectorAll('.hole')].map(c => c.style.opacity);
  console.log('NO-ANIM: hand-complete reached:', log.includes('hand-complete'), '| hero hole opacity:', heroHoles.join(','), '| hero stack:', st.stacks[0], '| hands:', st.handNumber);
  process.exit(0);
})();
