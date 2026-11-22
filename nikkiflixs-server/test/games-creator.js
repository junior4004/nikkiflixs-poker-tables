const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/games/index.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = function (q) { return { matches: false, media: q, addEventListener: function () {}, addListener: function () {} }; };
    window.localStorage.setItem('nikkiflixs_bankroll', '100'); // NOT enough for Ice Crystal (2,500)
    window.localStorage.setItem('nikkiflixs_creator', '1');
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  }
});
const w = dom.window, d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(800);
  const launcher = [...d.querySelectorAll('button, [onclick], a, .game-card, article, div')].find(el => /farkle/i.test(el.textContent || '') && el.textContent.length < 120);
  launcher.click(); await wait(600);
  const skip = d.getElementById('matchSkipBtn');
  if (skip) { skip.click(); await wait(700); skip.click(); await wait(900); }
  const shopBtn = d.getElementById('fkShopBtn');
  console.log('shop btn present:', !!shopBtn);
  if (shopBtn) {
    shopBtn.click(); await wait(900);
    const ice = [...d.querySelectorAll('button')].find(b => /Ice Crystal/i.test(b.textContent || '') || /2500|2,500/.test(b.textContent || ''));
    const allShopBtns = [...d.querySelectorAll('button')].filter(b => /GC|EQUIP|BUY|OWNED/i.test(b.textContent || '')).map(b => b.textContent.trim().slice(0, 40));
    console.log('shop buttons sample:', allShopBtns.slice(0, 8).join(' | '));
    // click whatever buys the ice set: find a card container mentioning Ice Crystal with a button
    const card = [...d.querySelectorAll('div,button')].filter(el => /^Ice Crystal/.test((el.textContent || '').trim())).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    console.log('ice row:', card ? JSON.stringify(card.textContent.trim().slice(0, 40)) + ' tag=' + card.tagName : 'NONE');
    if (card) { card.click(); await wait(700); }
    console.log('bankroll after (must stay 100):', w.localStorage.getItem('nikkiflixs_bankroll'));
    console.log('owned dice sets:', w.localStorage.getItem('nikkiflixs_dice_sets'));
    console.log('equipped:', w.localStorage.getItem('nikkiflixs_dice_equipped'));
  }
  process.exit(0);
})();
