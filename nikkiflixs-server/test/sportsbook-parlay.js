// Parlay ticket rebuild — end-to-end sim on the REAL sportsbook.html.
// Settlement runs at page boot (refreshScores -> settleOpenBets), so settled
// states are verified by "reloading" with the same localStorage contents.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(process.env.HOME + '/workspace/poker-push/assets/rooms/casino/sportsbook.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fails++; };
function boot(store) {
  return new JSDOM(html, {
    url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = () => Promise.reject(new Error('offline-test'));
      Object.keys(store).forEach(k => window.localStorage.setItem(k, store[k]));
    }
  });
}
function dump(w) {
  const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); }
  return o;
}
const bankOf = s => parseInt(s['nikkiflixs_bankroll'] || '0', 10);
const betsOf = s => JSON.parse(s['nikkiflixs_sportsbook_bets'] || '[]');
async function openTicket(w, d) {
  for (let i = 0; i < 50 && !d.getElementById('parlayBtn'); i++) await sleep(100);
  d.getElementById('parlayBtn').click();
  for (let i = 0; i < 60 && d.querySelectorAll('.tgame').length < 3; i++) await sleep(150);
}
function seedScores(store, legs, mode) {
  const sc = {};
  legs.forEach((leg, i) => {
    sc[leg.sportKey] = sc[leg.sportKey] || { ts: Date.now(), map: {} };
    if (mode === 'win' || (mode === 'push3' && i < 2)) {
      sc[leg.sportKey].map[leg.gameId] = leg.pick === 'home'
        ? { completed: true, homeScore: 99, awayScore: 0 } : { completed: true, homeScore: 0, awayScore: 99 };
    } else { // push: (pickScore - oppScore) + line = 0
      const diff = -leg.line;
      sc[leg.sportKey].map[leg.gameId] = leg.pick === 'home'
        ? { completed: true, homeScore: 50 + diff, awayScore: 50 }
        : { completed: true, homeScore: 50, awayScore: 50 + diff };
    }
  });
  store['nikkiflixs_sportsbook_scores'] = JSON.stringify(sc);
}
(async () => {
  let store = { 'nikkiflixs_bankroll': '1000' };
  let dom = boot(store), w = dom.window, d = w.document;
  await openTicket(w, d);
  const sides = g => d.querySelectorAll('.tgame')[g].querySelectorAll('.tside');
  ok(d.getElementById('parlayModal').classList.contains('open'), 'modal opens');
  ok(d.getElementById('parlayPays').textContent.includes('6 to 1'), 'paytable: 3 correct = 6 to 1');
  ok(d.getElementById('parlayPays').textContent.includes('700 to 1'), 'paytable: 10 correct = 700 to 1');
  const nGames = d.querySelectorAll('.tgame').length;
  ok(nGames >= 6, 'ticket lists games from all sports (' + nGames + ')');
  ok([...d.querySelectorAll('.tgame')].every(g => g.querySelectorAll('.tside').length === 2), 'every game has exactly 2 tappable sides');
  sides(0)[0].click();
  ok(d.querySelectorAll('.tside.locked').length === 1, 'tap locks a side');
  sides(0)[1].click();
  ok(d.querySelectorAll('.tside.locked').length === 1 && sides(0)[1].classList.contains('locked'), 'tap other side switches the pick');
  sides(0)[1].click();
  ok(d.querySelectorAll('.tside.locked').length === 0, 'tap locked side again takes it off');
  sides(0)[0].click(); sides(1)[0].click();
  d.getElementById('parlayBuy').click();
  store = dump(w);
  ok(betsOf(store).length === 0 && bankOf(store) === 1000, 'cannot buy with only 2 picks');
  sides(2)[1].click();
  const stake = d.getElementById('parlayStake');
  stake.value = '10'; stake.dispatchEvent(new w.Event('input', { bubbles: true }));
  const sum = d.getElementById('parlaySummary').textContent;
  ok(sum.includes('6 to 1') && sum.includes('60 GC') && sum.includes('70 GC'), 'summary math: 10 GC at 6:1 -> win 60, 70 back');
  ok(d.getElementById('parlayBuy').textContent.includes('10 GC'), 'buy button shows the stake');
  d.getElementById('parlayBuy').click();
  store = dump(w);
  const t1 = betsOf(store)[0];
  ok(bankOf(store) === 990, 'stake deducted (1000 -> 990)');
  ok(t1 && t1.type === 'parlay' && t1.legs.length === 3 && t1.stake === 10 && t1.payout === 70, 'ticket stored: 3 legs, stake 10, payout 70');
  // games go final — user reopens the app, boot settlement pays the winner
  seedScores(store, t1.legs, 'win');
  dom = boot(store); w = dom.window; d = w.document;
  for (let i = 0; i < 40 && betsOf(dump(w))[0] && betsOf(dump(w))[0].status === 'open'; i++) await sleep(150);
  store = dump(w);
  ok(betsOf(store)[0].status === 'won' && bankOf(store) === 1060, 'all legs win -> +70 credited (990 -> 1060)');
  // ticket 2: 2 wins + 1 push -> under 3 -> stake refunded
  delete store['nikkiflixs_sportsbook_scores'];
  dom = boot(store); w = dom.window; d = w.document;
  await openTicket(w, d);
  const s2 = g => d.querySelectorAll('.tgame')[g].querySelectorAll('.tside');
  s2(0)[0].click(); s2(1)[0].click(); s2(2)[0].click();
  const st2 = d.getElementById('parlayStake');
  st2.value = '10'; st2.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.getElementById('parlayBuy').click();
  store = dump(w);
  ok(bankOf(store) === 1050, 'ticket 2 bought (1060 -> 1050)');
  const t2 = betsOf(store)[0];
  seedScores(store, t2.legs, 'push3');
  dom = boot(store); w = dom.window; d = w.document;
  for (let i = 0; i < 40 && betsOf(dump(w))[0] && betsOf(dump(w))[0].status === 'open'; i++) await sleep(150);
  store = dump(w);
  ok(betsOf(store)[0].status === 'push' && bankOf(store) === 1060, 'push drops ticket under 3 -> stake refunded (1050 -> 1060)');
  console.log(fails ? ('\n' + fails + ' FAILURES') : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
