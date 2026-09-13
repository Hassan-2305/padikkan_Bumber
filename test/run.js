const { boot } = require('./harness');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }
/* 60s of watching = 6 coins, which is the per-report cap. */
async function mine(send, coins) {
  for (let i = 0; i < Math.ceil(coins / 6); i++) await send('earn', { seconds: 60 });
}

(async () => {
  const { send, PB, chrome } = boot();

  /* ------------------------------------------------------------ matching */
  section('site matching');
  const S = { disabledCategories: [], customSites: [], allowlist: [], blockPdfs: true, blockAcademicTlds: true };
  const blocked = [
    'https://arxiv.org/abs/2401.00001',
    'https://scholar.google.com/citations?user=x',
    'https://chatgpt.com/c/abc',
    'https://claude.ai/chat/1',
    'https://gemini.google.com/app',
    'https://nptel.ac.in/courses/1',
    'https://app.ktu.edu.in/login',
    'https://www.notion.so/My-Notes-123',
    'https://docs.google.com/document/d/1/edit',
    'https://en.wikipedia.org/wiki/Kerala',
    'https://cs.stanford.edu/people',
    'https://example.com/papers/thesis.pdf',
    'https://leetcode.com/problems/two-sum/',
    'https://ieeexplore.ieee.org/document/1'
  ];
  const allowed = [
    'https://www.instagram.com/reels/',
    'https://www.youtube.com/shorts/abc',
    'https://www.youtube.com/watch?v=1',
    'https://news.ycombinator.com/',
    'https://mail.google.com/mail/u/0',
    'https://open.spotify.com/',
    'chrome://extensions/',
    'https://www.flipkart.com/'
  ];
  for (const u of blocked) ok('blocks ' + u.slice(0, 44), PB.isStudyUrl(u, S));
  for (const u of allowed) ok('allows ' + u.slice(0, 44), !PB.isStudyUrl(u, S));

  ok('category toggle off works',
     !PB.isStudyUrl('https://en.wikipedia.org/wiki/X', { ...S, disabledCategories: ['reference'] }));
  ok('allowlist beats category',
     !PB.isStudyUrl('https://arxiv.org/abs/1', { ...S, allowlist: ['arxiv.org'] }));
  ok('custom site is blocked',
     PB.isStudyUrl('https://myportal.example.org/x', { ...S, customSites: ['example.org'] }));
  ok('pdf toggle respected',
     !PB.isStudyUrl('https://x.com/a.pdf', { ...S, blockPdfs: false }));
  ok('academic tld toggle respected',
     !PB.isStudyUrl('https://cs.stanford.edu/', { ...S, blockAcademicTlds: false }));
  ok('earn site never blocked even if listed',
     !PB.isStudyUrl('https://www.youtube.com/shorts/x', { ...S, customSites: ['youtube.com'] }));

  /* -------------------------------------------------------------- earning */
  section('earning');
  let st = await send('state');
  ok('starts empty', st.coins === 0 && PB.ticketCount(st.tickets) === 0 && st.debt === 0);

  let r = await send('earn', { seconds: 5 });
  ok('5s of watching pays nothing yet', r.gained === 0);
  r = await send('earn', { seconds: 5 });
  ok('10s pays exactly one coin', r.gained === 1, JSON.stringify(r));
  r = await send('earn', { seconds: 60 });
  ok('60s pays six more', r.gained === 6, JSON.stringify(r));
  st = await send('state');
  ok('balance is 7', st.coins === 7, 'got ' + st.coins);
  ok('one report cannot pay more than the cap', (await send('earn', { seconds: 9999 })).gained <= 6);

  /* --------------------------------------------------------------- buying */
  section('tickets');
  r = await send('buy', { count: 1 });
  ok('cannot buy without coins', r.ok === false && r.reason === 'coins');
  await send('reset');
  await mine(send, 30);
  r = await send('buy', { count: 1, lot: 'kutty' });
  ok('buys one ticket', r.ok === true);
  st = await send('state');
  ok('coins debited by the lot price', st.coins === 30 - PB.lot('kutty').price, 'coins=' + st.coins);
  ok('ticket credited to the right lot', st.tickets.kutty === 1);
  ok('other lots untouched', st.tickets.naadan === 0 && st.tickets.bumper === 0);

  r = await send('play', { lot: 'kutty' });
  ok('play consumes the ticket', r.ok === true);
  ok('no tickets left', (await send('state')).tickets.kutty === 0);
  r = await send('play', { lot: 'kutty' });
  ok('cannot play without a ticket', r.ok === false && r.reason === 'tickets');

  section('lots are kept separate');
  await send('reset');
  await mine(send, 300);
  await send('buy', { count: 1, lot: 'kutty' });
  await send('buy', { count: 1, lot: 'naadan' });
  st = await send('state');
  ok('two different lots held at once', st.tickets.kutty === 1 && st.tickets.naadan === 1);
  r = await send('play', { lot: 'bumper' });
  ok('cannot draw a lot you do not hold', r.ok === false && r.reason === 'tickets');
  ok('and the message names the lot', /ബമ്പർ/.test(r.message));
  await send('play', { lot: 'naadan' });
  st = await send('state');
  ok('only the drawn lot is spent', st.tickets.kutty === 1 && st.tickets.naadan === 0);

  section('prices');
  await send('reset');
  await mine(send, 100);
  r = await send('buy', { count: 1, lot: 'bumper' });
  ok('cannot afford the bumper lot on 100 coins', r.ok === false && r.reason === 'coins');
  ok('the refusal states the price', /200/.test(r.message));
  for (const lot of PB.LOTS) {
    await send('reset');
    await mine(send, lot.price);
    const before = (await send('state')).coins;
    await send('buy', { count: 1, lot: lot.id });
    ok(`${lot.id.padEnd(6)} costs exactly ${lot.price}`,
       (await send('state')).coins === before - lot.price);
  }

  section('old saves still load');
  {
    const { boot: boot2 } = require('./harness');
    const old = boot2({ coins: 55, tickets: 4, debt: 0 });      // the v1.2 shape
    const migrated = await old.send('state');
    ok('a numeric ticket count migrates into the middle lot',
       migrated.tickets[PB.DEFAULT_LOT] === 4, JSON.stringify(migrated.tickets));
    ok('and the other lots start empty',
       migrated.tickets.kutty === 0 && migrated.tickets.bumper === 0);
    ok('the rest of the old save survives', migrated.coins === 55);
    const fresh = boot2().send ? await boot2().send('state') : null;
    ok('a fresh install starts with an empty wallet',
       fresh && PB.ticketCount(fresh.tickets) === 0);
  }

  /* --------------------------------------------------------------- lottery */
  section('odds per lot, 20,000 draws each');
  const N = 20000;
  for (const lot of PB.LOTS) {
    await send('reset');
    let wins = 0, raids = 0, nearMiss = 0, losses = 0, mismatched = 0, secondsWon = 0;
    for (let i = 0; i < N; i++) {
      await mine(send, lot.price);
      const b = await send('buy', { count: 1, lot: lot.id });
      if (!b.ok) { await send('repay', { amount: 99999 }); continue; }
      const res = await send('play', { serial: 'PB 123456', lot: lot.id });
      if (res.won) { wins++; secondsWon += res.seconds; }
      else {
        losses++;
        if (res.outcome === 'police') raids++;
        if (res.numbers.missBy === 1) nearMiss++;
      }
      if (res.won !== (res.numbers.winning === res.numbers.drawn)) mismatched++;
    }
    const seen = wins / N, raidRate = raids / N;
    ok(`${lot.id.padEnd(6)} win rate  target ${(lot.win * 100).toFixed(0)}%  actual ${(seen * 100).toFixed(2)}%`,
       Math.abs(seen - lot.win) < Math.max(0.004, lot.win * 0.12));
    ok(`${lot.id.padEnd(6)} raid rate target ${(lot.raid * 100).toFixed(0)}%  actual ${(raidRate * 100).toFixed(2)}%`,
       Math.abs(raidRate - lot.raid) < 0.008);
    ok(`${lot.id.padEnd(6)} always pays exactly ${lot.seconds}s`,
       wins === 0 || secondsWon === wins * lot.seconds);
    ok(`${lot.id.padEnd(6)} number matches only on a win`, mismatched === 0);
    ok(`${lot.id.padEnd(6)} near misses are common but not universal`,
       nearMiss / losses > 0.45 && nearMiss / losses < 0.65, (nearMiss / losses).toFixed(3));
  }

  section('the bumper lot is the sucker bet, on purpose');
  const val = Object.fromEntries(PB.LOTS.map((l) => [l.id, PB.valueOf(l)]));
  ok('the middle lot is the best value', val.naadan > val.kutty && val.naadan > val.bumper);
  ok('the bumper lot is the worst value', val.bumper < val.kutty);
  ok('and it is worse by a wide margin', val.naadan / val.bumper > 5,
     (val.naadan / val.bumper).toFixed(1) + '×');

  /* ----------------------------------------------------------------- blade */
  section('blade');
  await send('reset');
  r = await send('borrow');
  st = await send('state');
  ok('borrow hands over the principal', st.coins === PB.ECONOMY.BLADE_PRINCIPAL);
  ok('debt is principal plus the cut', st.debt === 150, 'debt=' + st.debt);

  r = await send('earn', { seconds: 60 });   // 6 coins earned
  ok('blade garnishes half of earnings', r.seized === 3 && r.gained === 3, JSON.stringify(r));
  st = await send('state');
  ok('debt drops by the garnish', st.debt === 147, 'debt=' + st.debt);

  // one coin at a time must average out to half, not all
  await send('reset'); await send('borrow');
  let kept = 0, taken = 0;
  for (let i = 0; i < 20; i++) {
    const one = await send('earn', { seconds: PB.ECONOMY.SECONDS_PER_COIN });
    kept += one.gained; taken += one.seized;
  }
  ok('single-coin payouts split evenly too', kept === 10 && taken === 10, `kept=${kept} taken=${taken}`);

  await send('reset');
  await send('borrow');
  await send('earn', { seconds: 60 });

  st = await send('state');
  const purse = st.coins, owed = st.debt;
  r = await send('repay', { amount: 1000 });
  ok('repay is capped at the balance', r.paid === purse, `paid=${r.paid} purse=${purse}`);
  st = await send('state');
  ok('debt reduced correctly', st.debt === owed - purse, 'debt=' + st.debt);
  ok('coins zeroed', st.coins === 0);

  for (let i = 0; i < 8; i++) await send('borrow');
  st = await send('state');
  ok('loan count is capped', st.loans <= PB.ECONOMY.BLADE_MAX_LOANS, 'loans=' + st.loans);
  ok('deep debt blocks ticket buying',
     (await send('buy', { count: 1 })).reason === 'blade');

  /* ---------------------------------------------------------------- access */
  section('access + bail');
  await send('reset');
  r = await send('bail');
  st = await send('state');
  const bailMs = PB.ECONOMY.BAIL_SECONDS * 1000;
  ok('bail grants the configured seconds',
     st.accessUntil - Date.now() > bailMs - 3000 && st.accessUntil - Date.now() <= bailMs);
  ok('bail never beats the bumper prize',
     PB.ECONOMY.BAIL_SECONDS <= PB.lot('bumper').seconds);
  ok('bail is charged to blade', st.debt === PB.ECONOMY.BAIL_DEBT);
  ok('bail cannot be repeated', (await send('bail')).ok === false);
  ok('badge shows remaining time', /m$/.test(chrome.log.badge), chrome.log.badge);
  ok('expiry alarm scheduled', !!chrome.log.alarms['pb:access']);

  await send('reset');
  let granted = 0, before = 0;
  for (let i = 0; i < 400; i++) {
    await mine(send, PB.lot('naadan').price);
    const b = await send('buy', { count: 1, lot: 'naadan' });
    if (!b.ok) break;
    const res = await send('play', { serial: PB.serial(), lot: 'naadan' });
    if (res.won) {
      const s2 = await send('state');
      if (granted === 0) before = s2.accessUntil;
      granted++;
      if (granted === 2) {
        ok('a second win extends rather than replaces the pass', s2.accessUntil > before);
        break;
      }
    }
  }
  ok('wins do happen eventually', granted > 0);

  /* -------------------------------------------------------------- settings */
  section('settings + persistence');
  await send('settings', { patch: { customSites: ['portal.college.in'], sound: false } });
  st = await send('state');
  ok('settings persist', st.settings.customSites[0] === 'portal.college.in' && st.settings.sound === false);
  ok('written to storage', !!chrome.store.pb_state);
  ok('stored shape survives projection', PB.publicState(chrome.store.pb_state).settings.sound === false);

  section('peek delay');
  await send('settings', { patch: { peekSeconds: 7 } });
  ok('peek delay is configurable', (await send('state')).settings.peekSeconds === 7);
  await send('settings', { patch: { peekSeconds: 900 } });
  ok('absurd peek values are clamped', (await send('state')).settings.peekSeconds === PB.ECONOMY.PEEK_MAX);
  await send('settings', { patch: { peekSeconds: 'banana' } });
  ok('junk peek values fall back to the default',
     (await send('state')).settings.peekSeconds === PB.ECONOMY.PEEK_SECONDS);

  section('lot scale');
  ok('the bumper lot pays the longest', PB.LOTS.every((l) => l.seconds <= PB.lot('bumper').seconds));
  ok('the lots are 10s, 30s and 60s',
     PB.LOTS.map((l) => l.seconds).join(',') === '10,30,60');
  ok('the lots cost 20, 70 and 200',
     PB.LOTS.map((l) => l.price).join(',') === '20,70,200');
  ok('win chances are 10%, 30% and 5%',
     PB.LOTS.map((l) => Math.round(l.win * 100)).join(',') === '10,30,5');

  await send('reset');
  st = await send('state');
  ok('reset clears everything', st.coins === 0 && st.debt === 0 && st.stats.plays === 0);
  ok('reset restores the default peek', st.settings.peekSeconds === PB.ECONOMY.PEEK_SECONDS);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
