/* BUILD 165 checks: dealer button restored + moving, designed card faces, branded back.
   Sound-kit wiring (BUILD 160, untouched by 163) asserted statically. */
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
const w = dom.window, d = w.document;
const results = [];
function check(name, ok, extra) { results.push([name, !!ok]); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }
setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);

(async () => {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.03);

  // --- stamp ---
  check('build stamp BUILD 165', d.getElementById('buildStamp').textContent === 'BUILD 165', d.getElementById('buildStamp').textContent);

  // --- dealer button: exists, correct discs, no tap interception ---
  const dm = d.getElementById('dealerMarker'), sbm = d.getElementById('sbMarker'), bbm = d.getElementById('bbMarker');
  check('dealerMarker exists', !!dm);
  check('dealer disc is a shown D disc', !!dm && dm.querySelector('.felt-marker.dealer-disc.show') && dm.querySelector('.felt-marker').textContent === 'D');
  check('sb/bb markers exist with SB/BB discs', !!sbm && !!bbm && sbm.querySelector('.felt-marker').textContent === 'SB' && bbm.querySelector('.felt-marker').textContent === 'BB');
  const tm = d.querySelector('.table-markers');
  check('marker layer pointer-events:none', w.getComputedStyle(tm).pointerEvents === 'none', w.getComputedStyle(tm).pointerEvents);
  check('dealer disc inherits pointer-events:none', w.getComputedStyle(dm.querySelector('.felt-marker')).pointerEvents === 'none');

  // --- card geometry unchanged: A/B computed sizes vs the pristine BUILD 162 file
  //     loaded under the identical harness (execSync git show), plus a static proof
  //     that the BUILD 165 CSS block declares no geometry properties at all ---
  const { execSync } = require('child_process');
  const html162 = execSync('git -C /home/hatch/workspace/poker-push show 638bb62:assets/rooms/poker/table-red-3d-v2.html', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const dom162 = new JSDOM(html162, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(window) { window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } }; window.navigator.vibrate = () => true; window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } });
  const d162 = dom162.window.document, w162 = dom162.window;
  const cs = (win, doc, sel) => { const e = doc.querySelector(sel); const c = win.getComputedStyle(e); return c.width + 'x' + c.height; };
  const holeNow = cs(w, d, '.seat .hole'), hole162 = cs(w162, d162, '.seat .hole');
  const boardNow = cs(w, d, '.board-card'), board162 = cs(w162, d162, '.board-card');
  check('hole geometry identical to BUILD 162 (A/B same harness)', holeNow === hole162, '163=' + holeNow + ' 162=' + hole162);
  check('board geometry identical to BUILD 162 (A/B same harness)', boardNow === board162, '163=' + boardNow + ' 162=' + board162);
  const css163 = (html.match(/\/\* BUILD 165: designed faces[\s\S]*?\.fold-card\{[^}]*\}/) || [''])[0];
  check('BUILD 165 CSS declares no geometry (no width/height/padding/margin/top/left)', css163.length > 0 && !/(width|height|padding|margin|top|left|right|bottom)\s*:/.test(css163), 'block bytes=' + css163.length);
  dom162.window.close();

  // --- branded back in CSS (decode the data URI) ---
  const m = html.match(/\.hole\.back,\.deck i,\.flying-card,\.fold-card\{background-color:#650d1d;background-image:url\("data:image\/svg\+xml,([^"]+)"\)/);
  let backOk = false, backInfo = 'rule not found';
  if (m) { const svg = decodeURIComponent(m[1]); backOk = svg.includes('NIKKIFLIXS') && svg.includes('>NF<') && svg.includes("id='d'"); backInfo = 'lattice+medallion+brand=' + backOk; }
  check('card back is the branded Nikkiflixs design (lattice + NF medallion + name)', backOk, backInfo);

  // --- open the table the way a player does (lobby VIEW button) ---
  const viewBtn = [...d.querySelectorAll('#tableGrid .join-table')][0];
  check('lobby VIEW button present', !!viewBtn);
  if (viewBtn) { viewBtn.click(); await new Promise(r => setTimeout(r, 600)); }

  // --- wait for the table to open and the first hand's markers to land ---
  const t0 = Date.now();
  let dealers = [];
  while (Date.now() - t0 < 120000) {
    await new Promise(r => setTimeout(r, 2000));
    dealers = T.getLog().filter(e => e.type === 'markers-positioned').map(e => e.detail.dealer);
    if (dealers.length >= 1 && [...d.querySelectorAll('.board-card')].every(n => n.getAttribute('data-rank'))) break;
  }
  check('markers positioned during live play', dealers.length >= 1, 'events=' + dealers.length + ' dealers=' + dealers.join(','));
  const lastDealer = dealers[dealers.length - 1];
  check('DOM dealer marker sits on the logged dealer seat', dm.getAttribute('data-seat') === String(lastDealer), 'dom=' + dm.getAttribute('data-seat') + ' log=' + lastDealer);

  // --- dealer must MOVE to the next seat when a hand advances (the game's own
  //     advance path: hand-complete calls advanceBlindTrio + setBlinds) ---
  const p1 = T.showMarkerProof(false);
  const dBefore = dm.getAttribute('data-seat');
  const p2 = T.showMarkerProof(true);
  const dAfter1 = dm.getAttribute('data-seat');
  const p3 = T.showMarkerProof(true);
  const dAfter2 = dm.getAttribute('data-seat');
  check('dealer button MOVES to the new dealer each hand (2 advances)',
    p2.dealer !== p1.dealer && p3.dealer !== p2.dealer && dBefore === String(p1.dealer) && dAfter1 === String(p2.dealer) && dAfter2 === String(p3.dealer),
    'dealers ' + p1.dealer + '->' + p2.dealer + '->' + p3.dealer + ' dom ' + dBefore + '->' + dAfter1 + '->' + dAfter2);
  check('sb/bb discs sit on the proof small/big blind seats',
    sbm.getAttribute('data-seat') === String(p3.smallBlind) && bbm.getAttribute('data-seat') === String(p3.bigBlind),
    'sb dom=' + sbm.getAttribute('data-seat') + ' proof=' + p3.smallBlind + ' | bb dom=' + bbm.getAttribute('data-seat') + ' proof=' + p3.bigBlind);
  check('dealer marker positioned via --mx/--my', !!dm.style.getPropertyValue('--mx') && !!dm.style.getPropertyValue('--my'), dm.style.getPropertyValue('--mx') + ',' + dm.style.getPropertyValue('--my'));
  check('sb/bb markers track too', sbm.getAttribute('data-seat') !== null && bbm.getAttribute('data-seat') !== null && sbm.getAttribute('data-seat') !== bbm.getAttribute('data-seat'));

  // --- board cards carry the designed face ---
  const boardNodes = [...d.querySelectorAll('.board-card')];
  const painted = boardNodes.filter(n => n.getAttribute('data-rank') && n.style.backgroundImage.includes('data:image/svg+xml'));
  check('all 5 board cards painted with designed faces', painted.length === 5, 'painted=' + painted.length);
  let boardArtOk = painted.length > 0, artInfo = '';
  if (painted.length) {
    const n = painted[0], svg = decodeURIComponent(n.style.backgroundImage);
    boardArtOk = svg.includes('NIKKIFLIXS') && n.getAttribute('data-rank') === n.textContent;
    artInfo = 'rank=' + n.getAttribute('data-rank') + ' text=' + n.textContent + ' brand=' + svg.includes('NIKKIFLIXS');
    const rank = n.getAttribute('data-suit') ? n.textContent : '';
    if (/^\d+$/.test(rank)) { const pips = (svg.match(/<text/g) || []).length - 1; boardArtOk = boardArtOk && pips === Number(rank); artInfo += ' pips=' + pips; }
    if (['J', 'Q', 'K'].includes(rank)) { boardArtOk = boardArtOk && svg.includes('<rect'); artInfo += ' courtPanel=' + svg.includes('<rect'); }
    if (rank === 'A') { boardArtOk = boardArtOk && svg.includes('<circle'); artInfo += ' aceRing=' + svg.includes('<circle'); }
  }
  check('board face art: pips/court/ace + brand, data-rank matches rank text', boardArtOk, artInfo);
  check('board textContent stays the bare rank (test contract)', boardNodes.every(n => /^[2-9JQKA]|^10$/.test(n.textContent)), boardNodes.map(n => n.textContent).join(','));

  // --- hero hole cards: designed face up, bots stay branded backs ---
  T.showMidHandProof();
  await new Promise(r => setTimeout(r, 300));
  const heroHoles = [...d.querySelectorAll('.seat[data-index="0"] .hole')];
  check('hero holes face-up with designed faces', heroHoles.length === 2 && heroHoles.every(h => !h.classList.contains('back') && h.getAttribute('data-rank') === h.textContent && h.style.backgroundImage.includes('data:image/svg+xml') && decodeURIComponent(h.style.backgroundImage).includes('NIKKIFLIXS')),
    heroHoles.map(h => h.textContent + '/' + h.getAttribute('data-rank')).join(','));
  const botHoles = [...d.querySelectorAll('.seat[data-index="3"] .hole')];
  check('bot holes remain card backs', botHoles.every(h => h.classList.contains('back')), botHoles.map(h => h.className).join(','));

  // --- coverage proof places markers programmatically (original design surface) ---
  T.showCoverageProof();
  check('coverage proof: dealer marker placed on seat 2', dm.getAttribute('data-seat') === '2', 'dom=' + dm.getAttribute('data-seat'));

  // --- sound kit (BUILD 160, untouched): exists + wired at deal/bet/win/check sites ---
  check('sfx kit exists', /function sfx\(kind\)/.test(html));
  check("sfx wired: card deal", html.includes("sfx('card')"), '');
  check("sfx wired: chips bet/pot", html.includes("sfx('chips')"), '');
  check("sfx wired: win", html.includes("sfx('win')"), '');
  check("sfx wired: check knock", html.includes("sfx('knock')"), '');

  const fails = results.filter(r => !r[1]);
  console.log('\n==== BUILD 165: ' + (results.length - fails.length) + '/' + results.length + ' PASS' + (fails.length ? ' — FAILURES: ' + fails.map(f => f[0]).join(' ;; ') : ' ===='));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
