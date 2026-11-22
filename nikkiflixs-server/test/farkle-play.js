const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/games/index.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = function (q) { return { matches: false, media: q, addEventListener: function () {}, addListener: function () {} }; };
    window.localStorage.setItem('nikkiflixs_bankroll', '5000');
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.addEventListener('error', e => errors.push(String((e.message || e.error)).slice(0, 140)));
  }
});
const w = dom.window, d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
const vis = el => !!el && !el.classList.contains('hidden') && el.style.display !== 'none';
(async () => {
  await wait(800);
  const launcher = [...d.querySelectorAll('button, [onclick], a, .game-card, article, div')].find(el => /farkle/i.test(el.textContent || '') && el.textContent.length < 120);
  console.log('launcher:', launcher.tagName, JSON.stringify(launcher.textContent.trim().slice(0, 40)));
  launcher.click();
  await wait(600);
  const skip = d.getElementById('matchSkipBtn'); console.log('skip btn:', !!skip, skip && skip.textContent.trim());
  if (skip) { skip.click(); await wait(700); console.log('after skip, btn now:', skip.textContent.trim()); skip.click(); }
  for (let i = 0; i < 20; i++) { await wait(500); if (vis(d.getElementById('gameScreen'))) break; }
  console.log('gameScreen visible:', vis(d.getElementById('gameScreen')), '| matchScreen visible:', vis(d.getElementById('matchScreen')));
  const screenText = d.getElementById('gameScreen') ? d.getElementById('gameScreen').textContent.replace(/\s+/g, ' ').slice(0, 300) : 'none';
  console.log('game screen text:', screenText);
  const btns = [...d.querySelectorAll('#gameScreen button')].map(b => JSON.stringify(b.textContent.trim().slice(0, 24)) + ' dis=' + b.disabled + ' id=' + (b.id || '-'));
  console.log('game buttons:', btns.join(' | '));
  const rollBtn = [...d.querySelectorAll('#gameScreen button')].find(b => /ROLL/i.test(b.textContent) && !b.disabled);
  if (rollBtn) {
    rollBtn.click();
    await wait(2200);
    const dice = d.querySelectorAll('#gameScreen [class*=fdie], #gameScreen [class*=die], #gameScreen [class*=dice]');
    console.log('after ROLL: dice-ish elements:', dice.length, '| screen text now:', d.getElementById('gameScreen').textContent.replace(/\s+/g, ' ').slice(0, 200));
  } else console.log('no enabled ROLL button in gameScreen');
  const shopBtn = d.getElementById('fkShopBtn'); if (shopBtn) { shopBtn.click(); await wait(900); const panel = [...d.querySelectorAll('div,section')].filter(el => /FREE/i.test(el.textContent||'') && /Yellow/i.test(el.textContent||'')).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; console.log('dice shop text:', panel ? panel.textContent.replace(/\s+/g,' ').slice(0, 420) : 'NOT FOUND'); }
  console.log('page errors:', errors.length ? errors.slice(0, 4) : 'none');
  process.exit(0);
})();
