/* Exercises the content script that actually does the blocking. */
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

function makeCtx(back, doc, href, cssDelay = 0) {
  const loc = { href, protocol: 'https:', hostname: new URL(href).hostname };
  const ctx = vm.createContext({
    console, document: doc, location: loc, history: {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, RegExp, Error,
    URL, URLSearchParams, structuredClone, performance,
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    addEventListener: () => {}, removeEventListener: () => {},
    fetch: async () => { await sleep(cssDelay); return { text: async () => read('src/content/overlay.css') }; },
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
  for (const f of ['src/shared/config.js', 'src/shared/fx.js', 'src/shared/overlay-ui.js', 'src/content/blocker.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  return ctx;
}

const PEEK = 2;

(async () => {
  const back = boot();
  await back.send('settings', { patch: { peekSeconds: PEEK } });

  console.log('\npeek before the shutter');
  const doc = makeDocument();
  const video = doc.createElement('video');
  video.paused = false;
  video.pause = function () { this.paused = true; };
  doc.body.appendChild(video);

  const ctx = makeCtx(back, doc, 'https://arxiv.org/abs/2401.00001', 40);
  await sleep(120);

  let host = doc.querySelector('#padikkan-bumper-root');
  ok('something mounts straight away', !!host);
  ok('but the page is NOT covered yet',
     host.style.getPropertyValue('inset') === 'auto');
  ok('the page is still readable behind it', !host.__shadow.querySelector('.pb-title'));
  ok('scrolling still works during the peek',
     doc.documentElement.style.getPropertyValue('overflow') !== 'hidden');
  ok('the video keeps playing during the peek', video.paused === false);
  ok('a countdown is showing', !!host.__shadow.querySelector('[data-peek]'));
  ok('it counts the configured seconds',
     host.__shadow.querySelector('[data-n]').textContent === String(PEEK));
  ok('it names the site', host.__shadow.querySelector('[data-peek] [data-site]').textContent.includes('arxiv.org'));
  ok('the countdown ticks down', await (async () => {
    const before = host.__shadow.querySelector('[data-n]').textContent;
    await sleep(1100);
    return host.__shadow.querySelector('[data-n]').textContent !== before;
  })());

  console.log('\nskipping the peek');
  {
    // a second document, so we get a fresh peek to skip
    const d = makeDocument();
    makeCtx(back, d, 'https://scholar.google.com/', 10);
    await sleep(140);
    const h = d.querySelector('#padikkan-bumper-root');
    ok('peek showing on the second page', !!h.__shadow.querySelector('[data-peek]'));
    h.__shadow.querySelector('[data-skip]').click();
    await sleep(220);
    const h2 = d.querySelector('#padikkan-bumper-root');
    ok('skip drops the shutter immediately', !!h2.__shadow.querySelector('.pb-title'));
    ok('and freezes the page', d.documentElement.style.getPropertyValue('overflow') === 'hidden');
  }

  console.log('\nshutter drops');
  const blocksBefore = (await back.send('state')).stats.blocks;
  await sleep(PEEK * 1000 + 400);
  host = doc.querySelector('#padikkan-bumper-root');
  ok('peek widget gone', !host.__shadow.querySelector('[data-peek]'));
  ok('now the page is covered', host.style.getPropertyValue('inset') === '0');
  const shade = host.__shadow;
  ok('stylesheet inlined into the shadow root', shade.querySelector('style').textContent.includes('.pb-ticket'));
  ok('overlay rendered inside', !!shade.querySelector('.pb-title'));
  ok('it entered as a shutter', shade.querySelector('.pb-root').classList.contains('pb-enter--shutter'));
  ok('site name passed through', shade.querySelector('[data-site]').textContent.includes('arxiv.org'));
  ok('page scrolling frozen',
     doc.documentElement.style.getPropertyValue('overflow') === 'hidden');
  ok('playing media paused', video.paused === true);
  ok('title marked', doc.title.startsWith('പഠിക്കണോ മോനേ? · '));
  const before = doc.title;
  ok('block counted', (await back.send('state')).stats.blocks === blocksBefore + 1);

  console.log('\naccess granted elsewhere');
  await back.send('bail');                        // grants 90s
  await sleep(60);
  const host2 = doc.querySelector('#padikkan-bumper-root');
  ok('overlay swapped for the floating pass', !!host2.__shadow.querySelector('.pb-pass'));
  ok('no block screen left behind', !host2.__shadow.querySelector('.pb-title'));
  ok('scrolling restored', doc.documentElement.style.getPropertyValue('overflow') !== 'hidden');
  ok('pass shows a countdown', /\d:\d\d/.test(host2.__shadow.querySelector('.pb-pass__t').textContent));
  ok('title not double-prefixed', doc.title === before);

  console.log('\nSPA wipes the DOM');
  // Simulate the page nuking everything (Notion, Gmail-style re-renders).
  const st = await back.send('state');
  st.accessUntil = 0;
  back.chrome.store.pb_state.accessUntil = 0;
  await back.chrome.api.storage.local.set({ pb_state: back.chrome.store.pb_state });
  await sleep(60);
  let live = doc.querySelector('#padikkan-bumper-root');
  ok('block screen returns the moment the pass expires', !!live.__shadow.querySelector('.pb-title'));
  ok('expiry is explained', live.__shadow.querySelector('.pb-title').textContent.includes('സമയം കഴിഞ്ഞു'));

  live.remove();
  ok('host really was removed', !!!doc.querySelector('#padikkan-bumper-root'));
  await sleep(1500);                              // the 1.2s guard sweep
  live = doc.querySelector('#padikkan-bumper-root');
  ok('overlay puts itself back', !!live && !!live.__shadow.querySelector('.pb-title'));

  console.log('\nno second peek once you are caught');
  const seen = doc.querySelector('#padikkan-bumper-root').__shadow;
  ok('re-block after expiry skips the peek', !seen.querySelector('[data-peek]'));

  console.log('\nordinary page');
  const doc2 = makeDocument();
  makeCtx(back, doc2, 'https://news.ycombinator.com/');
  await sleep(60);
  ok('nothing injected on a non-study site',
     !!!doc2.querySelector('#padikkan-bumper-root'));
  ok('scrolling untouched', doc2.documentElement.style.getPropertyValue('overflow') === '');

  console.log('\ncoin mine is never blocked');
  const doc3 = makeDocument();
  makeCtx(back, doc3, 'https://www.instagram.com/reels/');
  await sleep(60);
  ok('reels stay open',
     !!!doc3.querySelector('#padikkan-bumper-root'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nCRASHED:', e); process.exit(1); });
