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
  ok('starts empty', st.coins === 0 && st.tickets === 0 && st.debt === 0);

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
  r = await send('buy', { count: 1 });
  ok('buys one ticket', r.ok === true);
  st = await send('state');
  ok('coins debited by price', st.coins === 30 - PB.ECONOMY.TICKET_PRICE, 'coins=' + st.coins);
  ok('ticket credited', st.tickets === 1);

  r = await send('play');
  ok('play consumes the ticket', r.ok === true);
  ok('no tickets left', (await send('state')).tickets === 0);
  r = await send('play');
  ok('cannot play without a ticket', r.ok === false && r.reason === 'tickets');

  /* --------------------------------------------------------------- lottery */
  section('lottery odds over 60,000 draws');
  const N = 60000;
  const counts = {};
  let nearMiss = 0, exactWins = 0, sameNumberOnLoss = 0;
  for (let i = 0; i < N; i++) {
    await mine(send, PB.ECONOMY.TICKET_PRICE);
    const b = await send('buy', { count: 1 });
    if (!b.ok) { await send('repay', { amount: 99999 }); continue; }
    const res = await send('play', { serial: 'PB 123456' });
    counts[res.prize.id] = (counts[res.prize.id] || 0) + 1;
    if (res.numbers.missBy === 1) nearMiss++;
    if (res.won) {
      exactWins++;
      if (res.numbers.winning !== res.numbers.drawn) sameNumberOnLoss++;
    } else if (res.numbers.winning === res.numbers.drawn) sameNumberOnLoss++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const p of PB.PRIZES) {
    const seen = (counts[p.id] || 0) / total;
    const drift = Math.abs(seen - p.p);
    ok(`${p.id.padEnd(11)} target ${(p.p * 100).toFixed(1)}%  actual ${(seen * 100).toFixed(2)}%`,
       drift < Math.max(0.004, p.p * 0.25));
  }
  ok('winning number always matches the ticket on a win, never on a loss', sameNumberOnLoss === 0);
  ok('near misses are common but not universal',
     nearMiss / (total - exactWins) > 0.45 && nearMiss / (total - exactWins) < 0.65,
     (nearMiss / (total - exactWins)).toFixed(3));
  const realWin = (counts.bumper + counts.first + counts.second) / total;
  ok('meaningful win rate stays under 10%', realWin < 0.1, (realWin * 100).toFixed(2) + '%');

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
     PB.ECONOMY.BAIL_SECONDS <= PB.PRIZES.find((p) => p.id === 'bumper').seconds);
  ok('bail is charged to blade', st.debt === PB.ECONOMY.BAIL_DEBT);
  ok('bail cannot be repeated', (await send('bail')).ok === false);
  ok('badge shows remaining time', /m$/.test(chrome.log.badge), chrome.log.badge);
  ok('expiry alarm scheduled', !!chrome.log.alarms['pb:access']);

  await send('reset');
  let granted = 0, before = 0;
  for (let i = 0; i < 400; i++) {
    await mine(send, PB.ECONOMY.TICKET_PRICE);
    const b = await send('buy', { count: 1 });
    if (!b.ok) break;
    const res = await send('play', { serial: PB.serial() });
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

  section('prize scale');
  ok('bumper is the longest prize',
     PB.PRIZES.every((p) => p.seconds <= PB.PRIZES.find((x) => x.id === 'bumper').seconds));
  ok('consolation is eight seconds',
     PB.PRIZES.find((p) => p.id === 'consolation').seconds === 8);
  ok('every prize is now on a seconds scale',
     PB.PRIZES.every((p) => p.seconds < 120));

  await send('reset');
  st = await send('state');
  ok('reset clears everything', st.coins === 0 && st.debt === 0 && st.stats.plays === 0);
  ok('reset restores the default peek', st.settings.peekSeconds === PB.ECONOMY.PEEK_SECONDS);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
