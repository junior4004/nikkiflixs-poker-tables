const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/games/index.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = function(q){return {matches:false, media:q, addEventListener:function(){}, addListener:function(){}}};
    window.localStorage.setItem('nikkiflixs_bankroll', '5000');
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.addEventListener('error', e => errors.push(String((e.message || e.error)).slice(0, 120)));
  }
});
const w = dom.window, d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(800);
  // find the Farkle launcher
  const all = [...d.querySelectorAll('button, [onclick], a')];
  const fk = all.find(el => /farkle/i.test(el.textContent || ''));
  console.log('farkle launcher found:', !!fk, fk ? JSON.stringify(fk.textContent.trim().slice(0, 40)) : '');
  if (fk) fk.click();
  await wait(4500);
  const bodyText = d.body.textContent;
  const checks = {
    'DUEL watermark/felt': /DUEL/.test(bodyText),
    'PRIZE shown': /PRIZE/.test(bodyText),
    'score columns (YOU/BOT or names)': /(YOUR SCORE|BOT|OPPONENT)/i.test(bodyText),
    'ROLL button': /ROLL ON|ROLL/.test(bodyText),
    'END TURN button': /END TURN/.test(bodyText),
    'dice elements': d.querySelectorAll('[class*=die],[class*=dice]').length,
    'dice shop/wardrobe UI': /(DICE|dice).*(SHOP|shop|SETS|sets)/.test(bodyText) || !!d.querySelector('[id*=dice]'),
  };
  console.log(JSON.stringify(checks, null, 1));
  // try to roll
  const rollBtn = [...d.querySelectorAll('button')].find(b => /ROLL/i.test(b.textContent) && !b.disabled);
  console.log('buttons now:', [...d.querySelectorAll('button')].filter(b=>b.offsetParent!==null||true).slice(0,14).map(b=>JSON.stringify(b.textContent.trim().slice(0,22))+' dis='+b.disabled).join(' | '));
  console.log('cup element:', !!d.querySelector('[class*=cup],[id*=cup]'), '| felt:', !!d.querySelector('[class*=felt],[id*=felt]'));
  console.log('roll button clickable:', !!rollBtn, rollBtn ? rollBtn.textContent.trim().slice(0, 30) : '');
  if (rollBtn) { rollBtn.click(); await wait(1600); console.log('after roll — dice on felt:', d.querySelectorAll('[class*=die],[class*=dice]').length, '| turn score text:', (bodyText.match(/TURN[^<]{0,20}/) || [''])[0]); }
  console.log('page errors:', errors.length ? errors.slice(0, 4) : 'none');
  process.exit(0);
})();
