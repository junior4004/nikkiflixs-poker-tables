const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.localStorage.setItem('nikkiflixs_bankroll', '15000');
    window.localStorage.setItem('nikkiflixs_pops_taunt', '3');
    window.localStorage.setItem('nikkiflixs_pops_mad', '2');
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.addEventListener('error', e => errors.push(String(e.message || e.error)));
  }
});
const w = dom.window, d = w.document;
setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(900);
  const T = w.__pokerTest; T.setSpeed(0.05);
  await wait(2500);
  console.log('1) toolbar:', ['throwBtn', 'flagBtn', 'popBtn'].map(id => id + '=' + !!d.getElementById(id)).join(' '), '| popCount shows:', d.getElementById('popCount').textContent);
  // bot flags at table open
  const badges = [...d.querySelectorAll('.seat-flag')].filter(b => b.textContent);
  console.log('2) bot flags showing:', badges.length, badges.map(b => b.textContent).join(' '));
  // THROW flow
  d.getElementById('throwBtn').click();
  const items = d.querySelectorAll('#giftGrid .gift-item');
  console.log('3) gift modal open:', d.getElementById('giftModal').classList.contains('open'), '| throwable choices:', items.length);
  items[0].click(); // cream pie
  console.log('   armed (body.targeting):', d.body.classList.contains('targeting'));
  d.querySelectorAll('.seat')[3].querySelector('.portrait-wrap').click();
  await wait(300);
  const splat = d.querySelectorAll('.seat')[3].querySelector('.splat-badge');
  console.log('   pie landed on seat 3:', !!splat, splat ? splat.textContent : '', '| disarmed:', !d.body.classList.contains('targeting'));
  // FLAG purchase
  const bankBefore = parseInt(w.localStorage.getItem('nikkiflixs_bankroll'), 10);
  d.getElementById('flagBtn').click();
  const countries = d.querySelectorAll('#giftGrid .gift-item');
  console.log('4) flag picker countries:', countries.length);
  const us = [...countries].find(c => /United States/.test(c.textContent));
  us.click();
  await wait(1300); // wallet interval saves
  const bankAfter = parseInt(w.localStorage.getItem('nikkiflixs_bankroll'), 10);
  const heroBadge = d.querySelectorAll('.seat')[0].querySelector('.seat-flag');
  console.log('   charged 5:', bankBefore - bankAfter === 5, `(${bankBefore} -> ${bankAfter})`, '| hero flag:', heroBadge && heroBadge.textContent, '| flagBtn:', d.getElementById('flagBtn').textContent.trim());
  // leaving clears the flag
  d.getElementById('backRoom').click();
  console.log('   flag gone after leaving:', !(heroBadge && heroBadge.textContent));
  d.querySelector('.join-table[data-free-table="true"]').click();
  await wait(500);
  // PLAYER CARD + POP
  d.querySelectorAll('.seat')[2].querySelector('.portrait-wrap').click();
  console.log('5) player card open:', d.getElementById('playerModal').classList.contains('open'), '| name:', d.getElementById('pcName').textContent, '| stats:', d.getElementById('pcStats').textContent.replace(/\s+/g, ' '));
  d.getElementById('pcPopT').click();
  await wait(300);
  console.log('   taunt pops now:', w.localStorage.getItem('nikkiflixs_pops_taunt'), '(was 3) | pop bubble:', !!d.querySelectorAll('.seat')[2].querySelector('.pop-bubble'), '| toolbar pop count:', d.getElementById('popCount').textContent);
  const log = T.getLog().map(e => e.type);
  console.log('6) events: gift-thrown:', log.includes('gift-thrown'), '| flag-picked:', log.includes('flag-picked'), '| player-popped:', log.includes('player-popped'));
  console.log('7) page errors:', errors.length ? errors.slice(0, 3) : 'none');
  process.exit(0);
})();
