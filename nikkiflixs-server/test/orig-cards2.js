// Trace cards after entering via the lobby VIEW TABLE button (the path that works).
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync(process.argv[2] || '/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    if (!window.matchMedia) window.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  }
});
const w = dom.window;
const flightSel = '.flying-card,.fold-card,.flying-chip,.pot-flight';
setInterval(() => { w.document.querySelectorAll(flightSel).forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 25);

function cardState() {
  const seats = [...w.document.querySelectorAll('.seat')].map(s => [...s.querySelectorAll('.hole')].map(h => h.style.opacity === '1' ? (h.classList.contains('back') ? 'B' : 'F') : '.').join(''));
  const board = [...w.document.querySelectorAll('.board-card')].map(c => c.style.opacity === '1' ? c.textContent : '.').join('');
  return { seats, board };
}

async function main() {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest;
  if (!T) { console.log('NO __pokerTest'); process.exit(1); }
  T.setSpeed(0.03);
  const btn = w.document.querySelector('.join-table[data-free-table="true"]') || w.document.querySelector('.join-table');
  console.log('clicking lobby button:', btn && btn.textContent.trim());
  btn.click();
  let lastLogLen = 0, samples = 0, acted = 0, sawDeal = 0, sawFaceUp = 0;
  const t0 = Date.now();
  const iv = setInterval(() => {
    const st = T.getState();
    if (st.actionsEnabled) {
      const check = w.document.querySelector('[data-action="check"]');
      const call = w.document.querySelector('[data-action="call"]');
      if (check && !check.disabled) { check.click(); acted++; }
      else if (call && !call.disabled) { call.click(); acted++; }
    }
    const log = T.getLog();
    for (; lastLogLen < log.length; lastLogLen++) {
      const e = log[lastLogLen];
      if (['shuffle', 'deal-start', 'deal-complete', 'blinds-posted', 'hand-complete'].includes(e.type)) {
        console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${e.type}`, JSON.stringify(e.detail).slice(0, 140));
        if (e.type === 'deal-complete') sawDeal++;
      }
    }
    const cs = cardState();
    if (cs.seats[st.localSeatAbsolute] && cs.seats[st.localSeatAbsolute].includes('F')) sawFaceUp++;
    if (samples % 4 === 0) console.log(`  cards: ${cs.seats.join('|')} board=[${cs.board}] hand=${st.handNumber} pot=${st.pot} running=${st.running}`);
    samples++;
    if (Date.now() - t0 > 75000) {
      clearInterval(iv);
      console.log('RESULT: deals completed:', sawDeal, '| samples with MY cards face-up:', sawFaceUp, '| I acted:', acted, 'times');
      process.exit(0);
    }
  }, 500);
}
main();
