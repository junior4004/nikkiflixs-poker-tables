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
const w = dom.window;
setInterval(() => { w.document.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const T = w.__pokerTest; T.setSpeed(0.03);
  await new Promise(r => setTimeout(r, 3500)); // auto-start
  let st = T.getState();
  const log0 = T.getLog();
  const opened = log0.find(e => e.type === 'table-opened');
  console.log('1) auto-start: running=', st.running, 'hand=', st.handNumber, 'staged-demo=', opened ? opened.detail.botsMidHand : 'n/a');
  // sit in
  w.document.querySelectorAll('.seat')[0].querySelector('.sit-in').click();
  // play along (check/call) until hero has been in a couple of hands
  const t0 = Date.now();
  await new Promise(res => {
    const iv = setInterval(() => {
      st = T.getState();
      if (st.actionsEnabled) {
        const c = w.document.querySelector('[data-action="check"]');
        const k = w.document.querySelector('[data-action="call"]');
        if (c && !c.disabled) c.click(); else if (k && !k.disabled) k.click();
      }
      if ((st.handNumber >= 3 && !st.sittingOut['0']) || Date.now() - t0 > 40000) { clearInterval(iv); res(); }
    }, 250);
  });
  st = T.getState();
  console.log('2) in the game: hand=', st.handNumber, 'heroStack=', st.stacks[0], 'sittingOut=', JSON.stringify(st.sittingOut));
  const stacksBefore = st.stacks.join(','), handBefore = st.handNumber;
  // LEAVE mid-game to the lobby
  w.document.getElementById('backRoom').click();
  console.log('3) left to lobby. lobby hidden?', w.document.getElementById('roomLobby').classList.contains('hidden'));
  await new Promise(r => setTimeout(r, 6000)); // game should keep playing behind the lobby
  const stAway = T.getState();
  console.log('   while away: hand=', stAway.handNumber, 'running=', stAway.running, '(hands advanced:', stAway.handNumber > handBefore, ')');
  // RETURN to the same table
  w.document.querySelector('.join-table[data-free-table="true"]').click();
  await new Promise(r => setTimeout(r, 400));
  st = T.getState();
  console.log('4) re-entered: hand=', st.handNumber, 'stacks same as before leaving?', st.stacks.join(',') === stacksBefore || stAway.stacks.join(',') === st.stacks.join(','), '| heroStack now', st.stacks[0], '(was', stacksBefore.split(',')[0] + ')');
  const re = T.getLog().filter(e => e.type === 'table-reentered');
  console.log('   table-reentered events:', re.length, '| table-opened (full resets):', T.getLog().filter(e => e.type === 'table-opened').length);
  process.exit(0);
})();
