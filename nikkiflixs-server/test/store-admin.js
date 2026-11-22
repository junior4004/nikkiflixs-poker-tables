const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const storeHtml = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/casino/coin-store.html', 'utf8');
const tableHtml = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
function makeDom(html, seed) {
  return new JSDOM(html, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.paypal = { Buttons: () => ({ render: () => Promise.resolve() }) };
      if (seed) Object.entries(seed).forEach(([k, v]) => window.localStorage.setItem(k, v));
    } });
}
(async () => {
  // make a code on the table page (creator window not needed — use the exposed maker)
  const t = makeDom(tableHtml, {});
  await new Promise(r => setTimeout(r, 900));
  const code = t.window.__nikkiMakeCode(2); // #2 = 50,000 coins
  console.log('code from table generator:', code);
  // --- store as a PLAYER: redeem it ---
  const s1 = makeDom(storeHtml, { nikkiflixs_bankroll: '2000' });
  await new Promise(r => setTimeout(r, 400));
  const rr = s1.window.__storeRedeem(code);
  console.log('STORE player redeem:', JSON.stringify(rr), '| bankroll:', s1.window.localStorage.getItem('nikkiflixs_bankroll'));
  // --- store as CREATOR: buy buttons credit free ---
  const s2 = makeDom(storeHtml, { nikkiflixs_bankroll: '777', nikkiflixs_creator: '1' });
  await new Promise(r => setTimeout(r, 400));
  const buys = s2.window.document.querySelectorAll('button.buy');
  console.log('STORE creator: buy buttons:', buys.length, '| first label:', buys[0].textContent);
  buys[0].click(); // Starter tier = +15,000
  await new Promise(r => setTimeout(r, 200));
  console.log('STORE creator after free Starter:', s2.window.localStorage.getItem('nikkiflixs_bankroll'), '(expect 15777)');
  // a pops buy button (they are also .buy inside #pops)
  const popsBuys = s2.window.document.querySelectorAll('#pops button.buy');
  if (popsBuys.length) { popsBuys[0].click(); await new Promise(r => setTimeout(r, 200)); }
  console.log('STORE creator taunt pops:', s2.window.localStorage.getItem('nikkiflixs_pops_taunt'), '(expect 15)');
  process.exit(0);
})();
