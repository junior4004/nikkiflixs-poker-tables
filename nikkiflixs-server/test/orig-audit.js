// MONEY AUDIT: chip conservation + hero participation + bot deaths, real page code.
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
  await new Promise(r => setTimeout(r, 3200)); // auto-start fires at 2.5s
  let st = T.getState();
  console.log('auto-started. running=', st.running, 'stacks=', st.stacks.join(','), 'sittingOut=', JSON.stringify(st.sittingOut));
  const seat0 = w.document.querySelectorAll('.seat')[0];
  seat0.querySelector('.sit-in').click();
  console.log('clicked SIT IN');
  let lastLen = 0, baseline = null, leaks = [], heroHands = new Set(), heroInDeal = new Set();
  let deadBots = {}, hands = 0, showdowns = [];
  const t0 = Date.now();
  const iv = setInterval(() => {
    st = T.getState();
    if (st.actionsEnabled) {
      const check = w.document.querySelector('[data-action="check"]');
      const call = w.document.querySelector('[data-action="call"]');
      const fold = w.document.querySelector('[data-action="fold"]');
      const callAmt = call ? parseInt((call.textContent.match(/\d+/) || ['0'])[0]) : 0;
      if (check && !check.disabled) check.click();
      else if (call && !call.disabled && callAmt <= Math.max(10, st.stacks[0] * 0.2)) call.click();
      else if (fold && !fold.disabled) fold.click();
    }
    const log = T.getLog();
    for (; lastLen < log.length; lastLen++) {
      const e = log[lastLen];
      const total = st.stacks.reduce((a, b) => a + b, 0) + st.pot;
      if (baseline === null) baseline = total;
      if (total !== baseline) { leaks.push({ hand: e.hand, type: e.type, from: baseline, to: total, delta: total - baseline }); baseline = total; }
      if (e.type === 'deal-start' && e.detail.order && e.detail.order.includes(0)) heroInDeal.add(e.hand + 1);
      if (e.type === 'seat-activated-next-hand') console.log('hero activated for hand', e.detail.hand, 'stack', e.detail.stack);
      if (e.type === 'out-of-chips') { deadBots[e.detail.seat] = e.detail.name; console.log('BOT DIED (0 chips):', e.detail.name, 'seat', e.detail.seat, 'hand', e.hand); }
      if (e.type === 'showdown') showdowns.push({ hand: e.hand, pot: e.detail.pot, winners: e.detail.winners.map(x => x.name + ':' + x.share).join('+') });
      if (e.type === 'hand-complete') hands = Math.max(hands, T.getState().handNumber);
    }
    st.stacks.forEach((s, i) => { if (i > 0 && s > 0 && deadBots[i]) { console.log('BOT REVIVED?', i, deadBots[i], 'stack', s); delete deadBots[i]; } });
    if (hands >= 14 || Date.now() - t0 > 170000) {
      clearInterval(iv);
      st = T.getState();
      console.log('\n=== AUDIT RESULT after', hands, 'hands ===');
      console.log('hero stack:', st.stacks[0], '| hero dealt into hands:', [...heroInDeal].join(',') || 'NONE');
      console.log('final stacks:', st.stacks.join(','));
      console.log('dead bots still seated blank:', JSON.stringify(deadBots));
      console.log('money leaks (total chips changed):', leaks.length ? JSON.stringify(leaks.slice(0, 10)) : 'NONE');
      console.log('showdowns:', JSON.stringify(showdowns.slice(0, 6)));
      process.exit(0);
    }
  }, 300);
})();
