const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/casino/sportsbook.html', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => { try {
  const errs = [];
  const dom = new JSDOM(html, { url: 'https://nikkiflixs.com/assets/rooms/casino/sportsbook.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = fetch;
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} } }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.addEventListener('error', e => errs.push(String(e.message || e.error)));
    w.addEventListener('unhandledrejection', e => errs.push('UNHANDLED: ' + String((e.reason && e.reason.message) || e.reason)));
  } });
  const w = dom.window, d = w.document;
  await wait(3500);
  console.log('A) page errors:', errs.slice(0, 3).join(' | ') || 'none');
  console.log('B) ODDS games rendered:', d.getElementById('games').children.length, '| text sample:', (d.getElementById('games').textContent || '').trim().slice(0, 110));
  console.log('C) lines bar:', (d.getElementById('linesText').textContent || '').trim().slice(0, 90));
  // go to schedules tab
  d.getElementById('schedTab').click(); await wait(300);
  const leagues = d.getElementById('schedLeagues');
  console.log('D) sched league buttons:', leagues.children.length, [...leagues.children].map(c => c.textContent.trim()).join(','));
  if (leagues.children.length) { leagues.children[0].click(); }
  await wait(3500);
  const sl = d.getElementById('schedList');
  console.log('E) board cards:', sl.children.length, '| sample:', (sl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160));
  // fantasy compare: type real names
  d.getElementById('fantTab').click(); await wait(400);
  d.getElementById('cmpTab').click(); await wait(600);
  d.getElementById('cmpA').value = 'Josh Allen';
  d.getElementById('cmpB').value = 'Patrick Mahomes';
  d.getElementById('cmpGo').click();
  await wait(40000);
  console.log('F) compare output:', (d.getElementById('cmpOut').textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220));
  // parlay: real buttons
  d.getElementById('oddsTab').click(); await wait(600);
  const pbtns = [...d.querySelectorAll('#games .pbtn')];
  const obtns = [...d.querySelectorAll('#games .oddsbtn')];
  console.log('G) pbtn count:', pbtns.length, '| oddsbtn count:', obtns.length, '| pbtn sample:', pbtns.slice(0, 3).map(b => b.textContent.trim().slice(0, 20)).join(' ;; '));
  if (pbtns.length >= 2) {
    pbtns[0].click(); await wait(400);
    const other = pbtns.find(b => b.closest('.gcard') !== pbtns[0].closest('.gcard')) || pbtns[pbtns.length - 1];
    other.click(); await wait(400);
  }
  console.log('H) parlay badge after pbtn clicks:', JSON.stringify(d.getElementById('parlayCount').textContent));
  d.getElementById('parlayBtn').click(); await wait(500);
  console.log('I) parlay modal legs:', (d.getElementById('parlayLegs').textContent || '').trim().replace(/\s+/g, ' ').slice(0, 170), '| payout:', (d.getElementById('parlayPayout').textContent || '').trim().slice(0, 90));
  } catch (e) { console.log('Z) THREW:', e.message); }
  process.exit(0);
})();
