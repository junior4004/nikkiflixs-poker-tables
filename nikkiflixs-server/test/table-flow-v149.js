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
  const heroDriver = setInterval(() => { // never fold, never raise: check if free, else call
    const check = d.querySelector('[data-action="check"]'), call = d.querySelector('[data-action="call"]');
    if (check && !check.disabled) check.click(); else if (call && !call.disabled) call.click();
  }, 150);
  await wait(1500);
  const viewBtn = [...d.querySelectorAll('#tableGrid .join-table')][0];
  console.log('0) build stamp:', (d.getElementById('buildStamp') || {}).textContent, '| adminBtn in toolbar pos:', [...d.querySelectorAll('.toolbar > *')].findIndex(e => e.id === 'adminBtn'), 'of', d.querySelectorAll('.toolbar > *').length);
  viewBtn.click(); await wait(600);
  const st0 = T().getState();
  const heroStackAtOpen = st0.stacks[0];
  // PHASE A: hand 1 must be spectated; hero joins hand 2
  let log = [], hand1Done = false, t0 = Date.now();
  while (Date.now() - t0 < 70000) { log = T().getLog(); if (log.some(e => e.type === 'hand-complete')) { hand1Done = true; break; } await wait(400); }
  log = T().getLog();
  const specEv = log.find(e => e.type === 'seat-spectates-first-hand');
  const heroTurnsHand1 = log.filter(e => e.type === 'turn-alert' && e.detail && e.detail.userTurn).length;
  const activatedBeforeHand1End = (() => { const ai = log.findIndex(e => e.type === 'seat-activated-next-hand'); const hi = log.findIndex(e => e.type === 'hand-complete'); return ai > -1 && (hi === -1 || ai < hi); })();
  console.log('A1) hand 1 completed:', hand1Done, '| spectate event:', !!specEv, '| hero turns in hand 1:', heroTurnsHand1, '| activated early:', activatedBeforeHand1End);
  console.log('A2) hero stack untouched by hand 1:', T().getState().stacks[0] === heroStackAtOpen, `(${heroStackAtOpen} -> ${T().getState().stacks[0]})`);
  // wait for activation + a hero turn in hand 2/3
  T().setSpeed(0.08);
  let activated = false, heroTurn2 = false; t0 = Date.now();
  while (Date.now() - t0 < 90000) { log = T().getLog(); activated = log.some(e => e.type === 'seat-activated-next-hand'); const ai = log.findIndex(e => e.type === 'seat-activated-next-hand'); if (ai > -1 && log.slice(ai).some(e => e.type === 'turn-alert' && e.detail && e.detail.userTurn)) { heroTurn2 = true; break; } await wait(400); }
  console.log('A3) hero activated for hand 2:', activated, '| hero got a real turn after joining:', heroTurn2);
  // PHASE B: scripted dice 0.10 — non-strong bots fold to any real bet; hunt a big-blind walk
  w.Math.random = () => 0.10;
  T().setSpeed(0.05);
  let walk = null, invariantBreaks = 0, soleSurvivors = 0, handsWatched = 0; t0 = Date.now();
  let segStart = 0, segHeroBB = false, segHeroAlertAtStart = 0, driverMode = 'fold';
  const heroFoldDriver = setInterval(() => {
    if (driverMode !== 'fold') return;
    const fold = d.querySelector('[data-action="fold"]');
    if (fold && !fold.disabled) fold.click();
  }, 120);
  let lastCompleteCount = T().getLog().filter(e => e.type === 'hand-complete').length;
  while (Date.now() - t0 < 280000 && handsWatched < 24 && !walk) {
    await wait(500);
    log = T().getLog();
    // new preflop round-start = new hand segment
    const rsIdx = log.map((e, i) => e.type === 'round-start' && e.detail && e.detail.round === 'PREFLOP' ? i : -1).filter(i => i >= 0);
    const latestRs = rsIdx.length ? rsIdx[rsIdx.length - 1] : -1;
    if (latestRs > segStart) { segStart = latestRs; const st = T().getState(); segHeroBB = st.bigBlind === 0; driverMode = segHeroBB ? 'hold' : 'fold'; }
    if (driverMode === 'hold' && log.slice(segStart).some(e => e.type === 'turn-alert' && e.detail && e.detail.userTurn)) driverMode = 'fold'; // a bot raised into his BB — fold out
    const completes = log.filter(e => e.type === 'hand-complete').length;
    if (completes > lastCompleteCount) { handsWatched += completes - lastCompleteCount; lastCompleteCount = completes; }
    soleSurvivors = log.filter(e => e.type === 'sole-survivor').length;
    for (let i = 0; i < log.length; i++) { if (log[i].type === 'sole-survivor') { for (let j = i + 1; j < log.length; j++) { if (log[j].type === 'round-start') break; if (log[j].type === 'turn-alert') { invariantBreaks++; break; } } } }
    const u = log.map((e, i) => [e, i]).find(([e]) => e.type === 'hand-uncontested' && e.detail && e.detail.winner === 0 && i > segStart - 1 && segHeroBB);
    if (u && driverMode === 'hold') {
      const seg = log.slice(segStart, u[1]);
      walk = { winner: 0, heroAlerts: seg.filter(e => e.type === 'turn-alert' && e.detail && e.detail.userTurn).length, pot: u[0].detail.awardedPot };
    }
  }
  clearInterval(heroFoldDriver);
  log = T().getLog();
  console.log(`B1) scripted hands watched: ${handsWatched} | sole-survivor events: ${soleSurvivors} | total uncontested: ${log.filter(e => e.type === 'hand-uncontested').length}`);
  console.log('B2) HERO BIG-BLIND WALK (everyone folds to him):', walk ? `YES — pot ${walk.pot}, hero prompts during hand: ${walk.heroAlerts}` : 'not observed in budget');
  console.log('B3) invariant breaks (anyone asked to act after all others folded):', invariantBreaks);
  console.log('C) page errors:', errs.slice(0, 2).join(' | ') || 'none');
  clearInterval(pump); clearInterval(heroDriver); process.exit(0);
})();
