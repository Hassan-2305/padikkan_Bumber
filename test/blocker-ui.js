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

(async () => {
  const back = boot();

  console.log('\nstudy page, no access');
  const doc = makeDocument();
  const video = doc.createElement('video');
  video.paused = false;
  video.pause = function () { this.paused = true; };
  doc.body.appendChild(video);

  const ctx = makeCtx(back, doc, 'https://arxiv.org/abs/2401.00001', 250);
  await sleep(60);                                  // stylesheet still in flight

  const host = doc.querySelector('#padikkan-bumper-root');
  ok('overlay host injected into the document element', !!host);
  ok('page blacked out before the stylesheet arrives',
     host.style.getPropertyValue('background') === '#150A0D');
  ok('nothing readable behind it', host.style.getPropertyValue('inset') === '0'
     && host.style.getPropertyValue('z-index') === '2147483647');
  ok('overlay not drawn yet', !host.__shadow.querySelector('.pb-title'));

  await sleep(400);                                 // stylesheet lands
  ok('host goes transparent once the ticket is styled',
     host.style.getPropertyValue('background') === 'transparent');
  const shade = host.__shadow;
  ok('shadow root created', !!shade);
  ok('stylesheet inlined into the shadow root', shade.querySelector('style').textContent.includes('.pb-ticket'));
  ok('overlay rendered inside', !!shade.querySelector('.pb-title'));
  ok('site name passed through', shade.querySelector('[data-site]').textContent.includes('arxiv.org'));
  ok('page scrolling frozen',
     doc.documentElement.style.getPropertyValue('overflow') === 'hidden');
  ok('playing media paused', video.paused === true);
  ok('title marked', doc.title.startsWith('പഠിക്കണോ മോനേ? · '));
  const before = doc.title;
  ok('block counted', (await back.send('state')).stats.blocks === 1);

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
