const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
function makePage(seed) {
  return new JSDOM(html, {
    url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
      window.navigator.vibrate = () => true;
      window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      Object.entries(seed).forEach(([k, v]) => window.localStorage.setItem(k, v));
    }
  });
}
(async () => {
  // Jerry's phone after buying 15,000 in the store:
  const dom = makePage({ nikkiflixs_bankroll: '15000' });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 1500));
  const pill = w.document.getElementById('accountBalance').textContent;
  const st = w.__pokerTest.getState();
  console.log('lobby balance pill:', pill, '| page bank:', st.accountBalance);
  // claim daily bonus
  const claim = w.document.getElementById('claimDailyBonus');
  console.log('claim btn:', claim.textContent, 'disabled:', claim.disabled);
  claim.click();
  await new Promise(r => setTimeout(r, 300));
  console.log('after claim: bank =', w.__pokerTest.getState().accountBalance, '| stored =', w.localStorage.getItem('nikkiflixs_bankroll'));
  // profile
  w.document.getElementById('profileOpen').click();
  const pm = w.document.getElementById('profileModal');
  console.log('profile open:', pm.classList.contains('open'), '| profileBalance:', w.document.getElementById('profileBalance').textContent);
  // legacy key merge: fresh page with only the old ad key
  const dom2 = makePage({ nikkiflixs_gold_coins: '700' });
  await new Promise(r => setTimeout(r, 1200));
  console.log('legacy merge: bank =', dom2.window.__pokerTest.getState().accountBalance, '| bankroll key =', dom2.window.localStorage.getItem('nikkiflixs_bankroll'), '| old key =', dom2.window.localStorage.getItem('nikkiflixs_gold_coins'));
  process.exit(0);
})();
