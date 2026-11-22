const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
let html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
html = html.replace('function selectTable(button){',
  'function selectTable(button){try{ return selectTableInner(button); }catch(e){ window.__selErr = e.stack; throw e; } } function selectTableInner(button){');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  }
});
const w = dom.window;
setTimeout(() => {
  w.document.querySelector('.join-table[data-free-table="true"]').click();
  setTimeout(() => {
    console.log('selectTable error stack:\n', (w.__selErr || 'NONE — selectTable completed').split('\n').slice(0, 4).join('\n'));
    const st = w.__pokerTest.getState();
    console.log('state after click: hand=', st.handNumber, 'running=', st.running);
    process.exit(0);
  }, 600);
}, 800);
