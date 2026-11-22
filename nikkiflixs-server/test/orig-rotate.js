const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.addEventListener('error', e => errors.push(String(e.message || e.error)));
  }
});
const w = dom.window;
setInterval(() => { w.document.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.03);
  const seen = new Set(), lefts = [], joins = [];
  let lastLog = [];
  const poll = setInterval(() => {
    const log = T.getLog();
    // find new entries by object identity against previous snapshot tail
    for (const e of log) {
      if (seen.has(e)) continue; seen.add(e);
      if (e.type === 'bot-left') lefts.push(e.detail);
      if (e.type === 'bot-joined') joins.push(e.detail);
    }
    lastLog = log;
  }, 400);
  await new Promise(r => setTimeout(r, 100000));
  clearInterval(poll);
  const st = T.getState();
  const namesNow = [...w.document.querySelectorAll('.seat .nameplate strong')].map(n => n.textContent);
  console.log('hands played:', st.handNumber);
  console.log('bot-left events:', lefts.length, JSON.stringify(lefts.slice(0, 8)));
  console.log('bot-joined events:', joins.length, JSON.stringify(joins.slice(0, 8)));
  console.log('distinct joined names:', [...new Set(joins.map(j => j.name))].join(', '));
  console.log('joined stacks:', joins.map(j => j.stack).join(', '));
  console.log('names at table now:', namesNow.join(' | '));
  console.log('stacks now:', st.stacks.join(','));
  console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
  process.exit(0);
})();
