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
  let samples = 0, upSamples = 0;
  const t0 = Date.now();
  const iv = setInterval(() => {
    samples++;
    const holes = [...seat0.querySelectorAll('.hole')];
    const desc = holes.map(c => (c.style.opacity || '?') + ':' + (c.textContent.trim() || '∅') + ':' + c.className).join(' ');
    if (holes.some(c => c.style.opacity === '1' && c.textContent.trim())) { upSamples++; if (upSamples === 1) console.log('FIRST FACE-UP SAMPLE @', ((Date.now() - t0) / 1000).toFixed(1) + 's', '|', desc); }
    const st = T.getState();
    if (st.actionsEnabled) { const c = w.document.querySelector('[data-action="check"]'); const k = w.document.querySelector('[data-action="call"]'); if (c && !c.disabled) c.click(); else if (k && !k.disabled) k.click(); }
    if (Date.now() - t0 > 30000) { clearInterval(iv); console.log('samples:', samples, '| face-up samples:', upSamples, '| final holes:', desc, '| hand:', T.getState().handNumber); process.exit(0); }
  }, 100);
})();
