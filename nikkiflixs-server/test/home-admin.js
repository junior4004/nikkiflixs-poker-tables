const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const homeHtml = fs.readFileSync('/home/hatch/workspace/poker-push/index.html', 'utf8');
const tableHtml = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
function stubs(window, seed) {
  window.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, addListener() {} });
  window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
  window.navigator.vibrate = () => true;
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () {};
  window.scrollTo = () => {};
  if (seed) Object.entries(seed).forEach(([k, v]) => window.localStorage.setItem(k, v));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dom = new JSDOM(homeHtml, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) { stubs(w); } });
  const w = dom.window, d = w.document;
  await wait(1200);
  const launcher = d.getElementById('adminLauncher');
  console.log('1) launcher exists:', !!launcher);
  launcher.click(); await wait(300);
  console.log('2) panel opens on click:', d.getElementById('adminPanel').classList.contains('open'), '| login form visible:', !d.getElementById('adminLogin').classList.contains('hidden'));
  // set PIN 2468
  d.getElementById('adminPin').value = '2468';
  const conf = d.getElementById('adminPinConfirm'); if (conf) conf.value = '2468';
  d.getElementById('adminLogin').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait(300);
  console.log('3) workspace after PIN set:', !d.getElementById('adminWorkspace').classList.contains('hidden'), '| creator flag:', w.localStorage.getItem('nikkiflixs_creator'), '| pin hash stored:', (w.localStorage.getItem('nikkiflixs_creator_pin') || '').startsWith('x'));
  console.log('4) generate button enabled:', !d.getElementById('generateCode').disabled, '| grant enabled:', !d.getElementById('grantCoins').disabled);
  // generate a 100,000 coin code
  d.getElementById('codeCoins').value = '100000';
  d.getElementById('generateCode').click();
  await wait(400);
  const code = (d.getElementById('generatedCode').textContent || '').trim();
  console.log('5) generated on homepage:', code);
  // grant coins to owner
  d.getElementById('grantUserId').value = 'LOCAL-ADMIN';
  d.getElementById('grantAmount').value = '5000';
  const balBefore = parseInt(w.localStorage.getItem('nikkiflixs_bankroll') || '0', 10);
  d.getElementById('grantCoins').click();
  await wait(400);
  console.log('6) grant note:', d.getElementById('grantNote').textContent.trim(), '| bankroll delta:', (parseInt(w.localStorage.getItem('nikkiflixs_bankroll') || '0', 10) - balBefore));
  // cross-check the code on the TABLE page (fresh window)
  const dom2 = new JSDOM(tableHtml, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w2) { stubs(w2); } });
  await wait(900);
  const parsed = dom2.window.__nikkiParse(code);
  console.log('7) table page validates homepage code:', !!parsed, parsed ? ('item #' + parsed.no + ' = ' + parsed.item[3]) : '');
  // reload homepage with the stored PIN hash: must ask ENTER (not set), wrong rejected, right accepted
  const seed = { nikkiflixs_creator_pin: w.localStorage.getItem('nikkiflixs_creator_pin') };
  const dom3 = new JSDOM(homeHtml, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w3) { stubs(w3, seed); } });
  const d3 = dom3.window.document;
  await wait(1200);
  d3.getElementById('adminLauncher').click(); await wait(300);
  console.log('8) after reload, title:', d3.getElementById('adminLoginTitle').textContent);
  d3.getElementById('adminPin').value = '0000';
  d3.getElementById('adminLogin').dispatchEvent(new dom3.window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(250);
  console.log('9) wrong PIN note:', d3.getElementById('adminLoginNote').textContent.trim());
  d3.getElementById('adminPin').value = '2468';
  d3.getElementById('adminLogin').dispatchEvent(new dom3.window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(250);
  console.log('10) right PIN unlocks after reload:', !d3.getElementById('adminWorkspace').classList.contains('hidden'), '| creator:', dom3.window.localStorage.getItem('nikkiflixs_creator'));
  process.exit(0);
})();
