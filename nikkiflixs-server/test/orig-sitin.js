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
setInterval(() => { w.document.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 25);
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.03);
  // NO lobby click: wait for the AUTO-START (2.5s)
  await new Promise(r => setTimeout(r, 4000));
  let st = T.getState();
  console.log('after auto-start: running=', st.running, 'hand=', st.handNumber, 'started=', st.started);
  const seat0 = w.document.querySelectorAll('.seat')[0];
  const sitBtn = seat0.querySelector('.sit-in');
  console.log('seat0 classes:', seat0.className, '| sit-in btn:', !!sitBtn);
  if (sitBtn) sitBtn.click();
  const t0 = Date.now(); let faceUpSeen = 0, acted = 0;
  const iv = setInterval(() => {
    st = T.getState();
    if (st.actionsEnabled) {
      const check = w.document.querySelector('[data-action="check"]');
      const call = w.document.querySelector('[data-action="call"]');
      if (check && !check.disabled) { check.click(); acted++; }
      else if (call && !call.disabled) { call.click(); acted++; }
    }
    const holes = [...seat0.querySelectorAll('.hole')];
    const vis = holes.map(h => h.style.opacity === '1' ? (h.classList.contains('back') ? 'B' : 'F:' + h.textContent) : '.').join(' ');
    if (holes.some(h => h.style.opacity === '1' && !h.classList.contains('back'))) faceUpSeen++;
    if (faceUpSeen && acted) { console.log('MY SEAT CARDS FACE-UP:', vis, '| I acted', acted, 'time(s) | hand', st.handNumber); clearInterval(iv); process.exit(0); }
    if (Date.now() - t0 > 60000) { console.log('TIMEOUT. seat0 cards:', vis, 'faceUpSeen:', faceUpSeen, 'acted:', acted, 'sittingOut:', JSON.stringify(st.sittingOut)); process.exit(1); }
  }, 400);
})();
