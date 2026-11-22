const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
function makeDom(seed) {
  const dom = new JSDOM(html, {
    url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
      window.navigator.vibrate = () => true;
      window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      if (seed) Object.entries(seed).forEach(([k, v]) => window.localStorage.setItem(k, v));
    }
  });
  return dom;
}
(async () => {
  // === JERRY'S PHONE ===
  const dom = makeDom({ nikkiflixs_bankroll: '15000', nikkiflixs_pops_taunt: '3' });
  const w = dom.window;
  setInterval(() => { w.document.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
  await new Promise(r => setTimeout(r, 900));
  const T = w.__pokerTest; T.setSpeed(0.06);
  // open profile -> ADMIN
  w.document.getElementById('profileAdmin').click();
  await new Promise(r => setTimeout(r, 200));
  console.log('1) admin modal open:', w.document.getElementById('adminModal').classList.contains('open'));
  // set PIN 2468
  w.document.getElementById('adminPin').value = '2468';
  w.document.getElementById('adminPinBtn').click();
  await new Promise(r => setTimeout(r, 200));
  console.log('2) creator on after PIN set:', w.__creatorOn(), '| pin stored hashed:', (w.localStorage.getItem('nikkiflixs_creator_pin') || '').length > 2);
  console.log('3) seat name:', w.document.querySelector('.seat[data-index="0"] .nameplate strong').textContent, '| popCount shows:', w.document.getElementById('popCount').textContent);
  // flag free?
  const bankBefore = T.getState().bank;
  // generate a code for #4 (400,000 coins) and #8 (taunt pops)
  const genBtns = w.document.querySelectorAll('.gen-btn');
  console.log('4) catalog rows:', genBtns.length);
  genBtns[3].click(); // #4 coins
  const out4 = w.document.getElementById('genOut').textContent;
  const code4 = (out4.match(/NF4-[A-Z2-9]{6}-[A-Z0-9]{2}/) || [])[0];
  genBtns[7].click(); // #8 pops
  const out8 = w.document.getElementById('genOut').textContent;
  const code8 = (out8.match(/NF8-[A-Z2-9]{6}-[A-Z0-9]{2}/) || [])[0];
  console.log('5) generated:', code4, '|', code8);
  // wrong PIN after exiting creator mode
  w.document.getElementById('adminOff').click();
  w.document.getElementById('adminPin').value = '9999';
  w.document.getElementById('adminPinBtn').click();
  console.log('6) wrong PIN rejected:', !w.__creatorOn());
  w.document.getElementById('adminPin').value = '2468';
  w.document.getElementById('adminPinBtn').click();
  console.log('7) right PIN back in:', w.__creatorOn());
  // === A PLAYER'S PHONE (fresh storage, only the codes travel) ===
  const dom2 = makeDom({ nikkiflixs_bankroll: '1000', nikkiflixs_pops_taunt: '0' });
  const w2 = dom2.window;
  await new Promise(r => setTimeout(r, 900));
  const r1 = w2.__nikkiRedeem(code4);
  console.log('8) player redeems coin code:', JSON.stringify(r1), '| bankroll now:', w2.localStorage.getItem('nikkiflixs_bankroll'));
  const r2 = w2.__nikkiRedeem(code4);
  console.log('9) same code twice blocked:', !r2.ok);
  const r3 = w2.__nikkiRedeem(code8);
  console.log('10) player redeems pops code:', JSON.stringify(r3), '| taunt pops:', w2.localStorage.getItem('nikkiflixs_pops_taunt'));
  const r4 = w2.__nikkiRedeem('NF4-XXXXXX-XX');
  const r5 = w2.__nikkiRedeem('hello');
  console.log('11) fake codes rejected:', !r4.ok && !r5.ok);
  process.exit(0);
})();
