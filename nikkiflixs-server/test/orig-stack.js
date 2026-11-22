const fs = require('fs');
const { JSDOM, VirtualConsole } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const vc = new VirtualConsole();
vc.on('jsdomError', e => console.log('JSDOM ERROR:', e.detail && e.detail.stack ? e.detail.stack.split('\n').slice(0, 4).join('\n') : e.message));
vc.on('error', m => console.log('console.error:', m));
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  }
});
const w = dom.window;
setTimeout(() => {
  const btn = w.document.querySelector('.join-table[data-free-table="true"]');
  console.log('clicking...');
  btn.click();
  setTimeout(() => {
    const ids = ['potChips', 'potValue', 'tableGame', 'tableStakes', 'modalReason', 'chipRange', 'chipAmount', 'roomLobby', 'tableRoom', 'deck', 'muck', 'toast', 'addChips'];
    ids.forEach(id => console.log(id, '=>', !!w.document.getElementById(id)));
    console.log('.round-bet count:', w.document.querySelectorAll('.round-bet').length);
    console.log('.board-card count:', w.document.querySelectorAll('.board-card').length);
    process.exit(0);
  }, 500);
}, 800);
