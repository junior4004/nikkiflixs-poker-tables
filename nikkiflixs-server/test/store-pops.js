const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/casino/coin-store.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.alert = () => {};
    window.localStorage.setItem('nikkiflixs_bankroll', '15000');
  }
});
const w = dom.window, d = w.document;
(async () => {
  await new Promise(r => setTimeout(r, 600));
  console.log('coin tiers:', d.querySelectorAll('#tiers .tier').length, '| balance shows:', d.getElementById('balance').textContent);
  console.log('pop packs:', d.querySelectorAll('#pops .tier').length, '| owned line:', d.getElementById('popsOwned').textContent);
  // stub paypal SDK button flow
  let captured = null;
  w.paypal = { Buttons: (cfg) => { captured = cfg; return { render: () => {} }; } };
  const buyBtns = d.querySelectorAll('#pops .tier .buy');
  buyBtns[0].click();
  console.log('modal title:', d.getElementById('payTitle').textContent, '| desc:', d.getElementById('payDesc').textContent);
  // simulate createOrder + capture
  const fakeActions = { order: { create: (o) => { console.log('order:', JSON.stringify(o.purchase_units[0])); return 'ORDER123'; }, capture: () => Promise.resolve({}) } };
  await captured.onApprove({}, fakeActions);
  console.log('after taunt purchase: nikkiflixs_pops_taunt =', w.localStorage.getItem('nikkiflixs_pops_taunt'), '| owned line:', d.getElementById('popsOwned').textContent, '| bankroll untouched:', w.localStorage.getItem('nikkiflixs_bankroll'));
  buyBtns[1].click();
  await captured.onApprove({}, fakeActions);
  console.log('after mad purchase: nikkiflixs_pops_mad =', w.localStorage.getItem('nikkiflixs_pops_mad'));
  process.exit(0);
})();
