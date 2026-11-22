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
  await wait(1500);
  console.log('1) CSS pod tappable:', html.includes('.pod{pointer-events:auto;cursor:pointer'), '| NF chips:', (html.match(/content:"NF"/g) || []).length, 'rules');
  console.log('2) toolbar buttons exist:', !!d.getElementById('adminBtn'), !!d.getElementById('storeBtn'));
  // enter a table (click first VIEW TABLE in lobby)
  const viewBtn = [...d.querySelectorAll('button')].find(b => /VIEW TABLE/i.test(b.textContent));
  if (viewBtn) { viewBtn.click(); await wait(1200); }
  d.getElementById('adminBtn').click(); await wait(400);
  const adminModal = d.getElementById('adminModal');
  console.log('3) ADMIN button opens admin panel:', !!adminModal && adminModal.classList.contains('open'));
  d.querySelectorAll('.gift-x, .admin-x').forEach(x => x.click && x.click());
  if (adminModal) adminModal.classList.remove('open');
  d.getElementById('storeBtn').click(); await wait(400);
  const giftModal = d.getElementById('giftModal');
  const gridText = (d.getElementById('giftGrid') || {}).textContent || '';
  console.log('4) STORE button opens chooser:', !!giftModal && giftModal.classList.contains('open'), '| has Coin Store:', /Coin Store/.test(gridText), '| has Gift Shop:', /Gift Shop/.test(gridText));
  console.log('5) page errors:', errs.slice(0, 2).join(' | ') || 'none');
  process.exit(0);
})();
