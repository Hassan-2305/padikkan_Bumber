/* Exercises the coin mine that runs on Reels and Shorts. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot } = require('./harness');
const { makeDocument } = require('./dom');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : ''))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const back = boot();
  const doc = makeDocument();

  // a Reel that is genuinely on screen and playing
  const vid = doc.createElement('video');
  Object.assign(vid, { paused: false, ended: false, readyState: 4, currentTime: 3 });
  vid.getBoundingClientRect = () => ({ width: 420, height: 740, top: 0, left: 0 });
  doc.body.appendChild(vid);

  const ctx = vm.createContext({
    console, document: doc,
    location: { href: 'https://www.instagram.com/reels/', protocol: 'https:', hostname: 'www.instagram.com' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, RegExp, Error,
    URL, URLSearchParams, structuredClone, performance,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    addEventListener: () => {}, removeEventListener: () => {},
    fetch: async () => ({ text: async () => read('src/content/overlay.css') }),
    chrome: {
      runtime: {
        sendMessage: (msg, cb) => {
          if (msg && msg.type) return;
          for (const f of back.chrome.listeners.message) f(msg, {}, (res) => cb && cb(res));
        },
        onMessage: { addListener: () => {} },
        lastError: null,
        getURL: (p) => 'chrome-extension://test/' + p
      },
      storage: back.chrome.api.storage
    }
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  for (const f of ['src/shared/config.js', 'src/shared/fx.js', 'src/content/earner.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  await sleep(80);

  const hud = () => doc.querySelector('#padikkan-bumper-hud');
  const q = (s) => hud() && hud().__shadow.querySelector(s);

  console.log('\nHUD on a reels page');
  ok('mine HUD mounted', !!hud());
  ok('stylesheet inlined', hud().__shadow.querySelector('style').textContent.includes('.pb-hud'));
  ok('coin counter starts at zero', q('[data-coins]').textContent === '0');
  ok('progress bar empty', q('[data-bar]').style.getPropertyValue('width') === '0%');
  ok('note nudges toward a ticket', q('[data-note]').textContent.includes('കോയിൻ കൂടി'));

  console.log('\nwatching earns coins');
  await sleep(5600);                                    // 5 ticks → one flush
  let st = await back.send('state');
  ok('seconds reported to the background', st.stats.watchSeconds >= 5, String(st.stats.watchSeconds));
  ok('HUD progress advanced', q('[data-bar]').style.getPropertyValue('width') !== '0%');
  await sleep(5200);                                    // past 10s → first coin
  st = await back.send('state');
  ok('a coin was minted', st.coins >= 1, String(st.coins));
  ok('HUD shows the coin', q('[data-coins]').textContent === String(st.coins));

  console.log('\nparked tabs earn nothing');
  const banked = (await back.send('state')).stats.watchSeconds;
  vid.paused = true;
  await sleep(3200);
  ok('paused video stops the clock',
     (await back.send('state')).stats.watchSeconds === banked);
  ok('HUD says so', q('[data-note]').textContent.includes('വീഡിയോ നിന്നു'));
  ok('HUD marked idle', q('[data-hud]').classList.contains('is-idle'));

  vid.paused = false;
  doc.hasFocus = () => false;
  await sleep(3200);
  ok('unfocused tab earns nothing',
     (await back.send('state')).stats.watchSeconds === banked);
  doc.hasFocus = () => true;

  const tiny = doc.createElement('video');
  Object.assign(tiny, { paused: false, ended: false, readyState: 4, currentTime: 3 });
  tiny.getBoundingClientRect = () => ({ width: 20, height: 12, top: 0, left: 0 });
  vid.paused = true;
  doc.body.appendChild(tiny);
  await sleep(3200);
  ok('a hidden 20×12 pixel video does not count',
     (await back.send('state')).stats.watchSeconds === banked);
  tiny.remove();
  vid.paused = false;

  console.log('\nBlade takes his cut');
  await back.send('borrow');
  await sleep(1200);
  ok('debt shown in the HUD note', q('[data-note]').textContent.includes('ബ്ലേഡ് കടം'));
  ok('HUD marked as in debt', q('[data-hud]').classList.contains('is-debt'));
  const beforeCoins = (await back.send('state')).coins;
  const r = await back.send('earn', { seconds: 60 });   // a solid stretch of reels
  ok('half the payout is seized', r.seized > 0 && r.seized <= r.gained + 1,
     JSON.stringify(r));
  st = await back.send('state');
  ok('coins still arrive while in debt', st.coins > beforeCoins, String(st.coins));
  ok('the debt is being paid down', st.debt < 150, String(st.debt));
  await sleep(1200);
  ok('HUD picks up the new debt', q('[data-note]').textContent.includes(String(st.debt)));

  console.log('\ndismissing');
  q('[data-x]').click();
  await sleep(50);
  ok('HUD can be dismissed', !hud());
  await sleep(1200);
  ok('it stays dismissed', !hud());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nCRASHED:', e); process.exit(1); });
