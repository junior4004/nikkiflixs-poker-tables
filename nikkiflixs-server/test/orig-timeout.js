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
  const T = w.__pokerTest; T.setSpeed(0.04);
  const seat0 = w.document.querySelector('.seat[data-index="0"]');
  // Phase 1: never act — wait for a timeout event (fold or check)
  const t0 = Date.now(); let timeoutEvt = null;
  await new Promise(res => {
    const iv = setInterval(() => {
      timeoutEvt = T.getLog().find(e => e.type === 'timeout');
      if (timeoutEvt || Date.now() - t0 > 75000) { clearInterval(iv); res(); }
    }, 300);
  });
  console.log('timeout event:', timeoutEvt ? timeoutEvt.detail.action : 'none within 75s');
  let st = T.getState();
  console.log('after timeout: sittingOut=', JSON.stringify(st.sittingOut), '| seat0 empty-seat class:', seat0.classList.contains('empty-seat'), '| pendingJoin:', st.pendingJoinNextHand);
  if (timeoutEvt && timeoutEvt.detail.action === 'fold') {
    // Phase 2: tap his own portrait — should re-queue him
    seat0.querySelector('.portrait-wrap').click();
    await new Promise(r => setTimeout(r, 400));
    st = T.getState();
    console.log('after portrait tap: pendingJoinNextHand=', st.pendingJoinNextHand, '(true = back in line)');
    // Phase 3: he must be dealt in again on a following hand
    const t1 = Date.now(); let backIn = false;
    await new Promise(res => {
      const iv = setInterval(() => {
        st = T.getState();
        if (!st.sittingOut['0'] && st.handNumber > (timeoutEvt.detail.hand || 0)) backIn = true;
        if (backIn || Date.now() - t1 > 45000) { clearInterval(iv); res(); }
      }, 300);
    });
    console.log('dealt back in on a later hand:', backIn, '| hand now:', st.handNumber);
  }
  process.exit(0);
})();
