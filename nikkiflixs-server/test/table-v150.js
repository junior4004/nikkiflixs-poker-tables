const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errs = [];
  const dom = new JSDOM(html, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createBuffer() { return { getChannelData: () => new Float32Array(16) }; } createBufferSource() { return { connect() {}, start() {}, buffer: null }; } createBiquadFilter() { return { connect() {}, frequency: { value: 0 }, Q: { value: 0 }, type: '' }; } get currentTime() { return 0; } get sampleRate() { return 44100; } get destination() { return {}; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.addEventListener('error', e => errs.push(String(e.message || e.error)));
  } });
  const w = dom.window, d = w.document;
  const pump = setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
  const T = () => w.__pokerTest;
  const callDriver = setInterval(() => { const check = d.querySelector('[data-action="check"]'), call = d.querySelector('[data-action="call"]'); if (check && !check.disabled) check.click(); else if (call && !call.disabled) call.click(); }, 150);
  await wait(1500);
  const stamp = d.getElementById('buildStamp');
  console.log('0) stamp:', stamp.textContent, '| outside toolbar:', !stamp.closest('.toolbar'), '| fixed CSS:', html.includes('.build-stamp{position:fixed'));
  [...d.querySelectorAll('#tableGrid .join-table')][0].click(); await wait(600);
  T().setSpeed(0.06);
  // wait until dealt in (activation), then go bust him on purpose: call everything
  let t0 = Date.now(), busted = false;
  while (Date.now() - t0 < 240000) { const st = T().getState(); if (st.stacks[0] <= 0) { busted = true; break; } await wait(500); }
  const log1 = T().getLog();
  console.log('1) hero busted on purpose:', busted, '| buy/seat-hold events:', log1.filter(e => /seat-held|modal|buy/.test(e.type)).length);
  // turn creator ON (as if he set his PIN), then tap to sit back in -> holdSeat path must auto-refill
  w.localStorage.setItem('nikkiflixs_creator', '1');
  const sitIn = d.getElementById('sitIn');
  if (sitIn) sitIn.click(); else { const pod = d.querySelectorAll('.seat')[0].querySelector('.pod'); if (pod) pod.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
  await wait(1200);
  const st2 = T().getState(); const log2 = T().getLog();
  const refillEv = log2.filter(e => e.type === 'creator-refill');
  console.log('2) AUTO-REFILL after bust:', refillEv.length > 0, '| src:', refillEv.length ? refillEv[refillEv.length - 1].detail.src : '-', '| stack now:', st2.stacks[0], '| wallet:', w.localStorage.getItem('nikkiflixs_bankroll'));
  // ADMIN PANEL REFILL BUTTON
  d.getElementById('adminBtn').click(); await wait(400);
  const rf = d.getElementById('adminRefill');
  const walletBefore = parseInt(w.localStorage.getItem('nikkiflixs_bankroll') || '0', 10);
  console.log('3) admin panel has REFILL button:', !!rf, '| admin modal open:', d.getElementById('adminModal').classList.contains('open'));
  if (rf) { rf.click(); await wait(300); }
  const walletAfter = parseInt(w.localStorage.getItem('nikkiflixs_bankroll') || '0', 10);
  console.log('4) REFILL button: wallet', walletBefore, '->', walletAfter, '(+250000 expected:', walletAfter - walletBefore === 250000, ') | stack:', T().getState().stacks[0]);
  d.getElementById('adminModal').classList.remove('open');
  // PLAYER CARDS
  const seats = d.querySelectorAll('.seat');
  const botWrap = seats[3].querySelector('.portrait-wrap');
  botWrap.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(300);
  const pcStats = (d.getElementById('pcStats') || {}).textContent || '';
  console.log('5) BOT card:', d.getElementById('playerModal').classList.contains('open'), '| has W-L:', /Record \(W/.test(pcStats), '| has street folds:', /Pre-flop folds/.test(pcStats) && /River folds/.test(pcStats), '| has best hand:', /Best hand won/.test(pcStats));
  d.getElementById('pcClose').click(); await wait(200);
  const heroWrap = seats[0].querySelector('.portrait-wrap');
  heroWrap.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(300);
  const selfStats = (d.getElementById('pcStats') || {}).textContent || '';
  console.log('6) SELF card opens:', d.getElementById('playerModal').classList.contains('open'), '| lifetime line:', /lifetime record/.test(selfStats), '| throw hidden for self:', d.getElementById('pcThrow').style.display === 'none');
  d.getElementById('pcClose').click(); await wait(200);
  // POP EXPLOSION
  d.getElementById('popBtn').click(); await wait(400);
  const item = d.querySelector('#giftGrid .gift-item, #giftGrid button');
  if (item) item.click(); await wait(300);
  const seat3pod = seats[3].querySelector('.pod');
  seat3pod.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(250);
  const tiles = d.querySelectorAll('.pop-tile').length;
  const imgVis = seats[3].querySelector('.portrait').style.visibility;
  await wait(1700);
  const boomGone = !d.querySelector('.pop-boom');
  const imgBack = seats[3].querySelector('.portrait').style.visibility === '';
  console.log('7) POP explosion: tiles created:', tiles, '(9 expected) | portrait hidden mid-blast:', imgVis === 'hidden', '| fragments gone + portrait back:', boomGone && imgBack);
  console.log('8) page errors:', errs.slice(0, 2).join(' | ') || 'none');
  clearInterval(pump); clearInterval(callDriver); process.exit(0);
})();
