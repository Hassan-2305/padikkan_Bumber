/* Drives the real overlay component against the real service worker, using a
   stub DOM. Catches typos, dead refs and broken flows that unit tests miss. */
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
  const back = boot();                       // real service worker + economy
  const doc = makeDocument();

  const ctx = vm.createContext({
    console, document: doc, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, RegExp, Error,
    URL, URLSearchParams, structuredClone,
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    matchMedia: () => ({ matches: true }),   // reduced motion: skip confetti/rAF
    requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 0),
    cancelAnimationFrame: clearTimeout,
    performance,
    chrome: {
      runtime: {
        sendMessage: (msg, cb) => {
          for (const f of back.chrome.listeners.message) {
            f(msg, {}, (res) => cb && cb(res));
          }
        },
        lastError: null,
        getURL: (p) => 'chrome-extension://test/' + p
      },
      storage: back.chrome.api.storage
    }
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;

  for (const f of ['src/shared/config.js', 'src/shared/fx.js', 'src/shared/overlay-ui.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }

  const { PB, PBOverlay } = ctx;
  const state = await back.send('state');

  console.log('\noverlay construction');
  const mount = doc.createElement('div');
  doc.body.appendChild(mount);
  let releases = 0;
  const ui = PBOverlay.create({
    container: mount,
    state,
    siteLabel: 'arxiv.org',
    onRelease: () => releases++
  });
  ok('mount is marked as the overlay root', mount.classList.contains('pb-root'));
  ok('headline rendered', mount.querySelector('[data-title]').textContent.length > 4);
  ok('site name shown', mount.querySelector('[data-site]').textContent.includes('arxiv.org'));
  ok('six digit reels built', mount.querySelectorAll('.pb-reel').length === 6);
  ok('reels start blank', mount.querySelector('[data-reels]').classList.contains('is-idle'));
  ok('ticket serial printed', /^ടിക്കറ്റ് നം\. [A-Z]{2} \d{6}$/.test(mount.querySelector('[data-serial]').textContent.trim()));
  ok('ticker duplicated for a seamless loop',
     mount.querySelector('[data-ticker]').querySelectorAll('span').length === PB.COPY.ticker.length * 2);

  const buttons = () => mount.querySelectorAll('.pb-btn');
  const labelled = (frag) => buttons().find((b) => b.textContent.includes(frag));

  console.log('\nbroke state');
  ok('offers the coin mine as the primary action', !!labelled('കാണാൻ പോകാം'));
  ok('offers Blade when there are no coins', !!labelled('ബ്ലേഡ്'));
  ok('no draw button without tickets', !labelled('നറുക്കെടുക്ക്'));
  ok('price line explains the shortfall',
     mount.querySelector('[data-price]').textContent.includes('കോയിൻ കൂടി വേണം'));

  console.log('\nblade panel');
  labelled('ബ്ലേഡ് ചേട്ടനെ വിളിക്ക്').click();
  await sleep(10);
  ok('blade panel opens', !!mount.querySelector('.pb-blade'));
  const borrow = mount.querySelectorAll('.pb-blade .pb-btn').find((b) => b.textContent.includes('വാങ്ങ്'));
  ok('borrow button present', !!borrow);
  borrow.click();
  await sleep(30);
  ui.update(await back.send('state'));
  ok('coins arrived', ui.state.coins === PB.ECONOMY.BLADE_PRINCIPAL, 'coins=' + ui.state.coins);
  ok('debt recorded', ui.state.debt === 150, 'debt=' + ui.state.debt);
  ok('stub shows the debt', mount.querySelector('[data-debtwrap]').hidden === false);
  ok('stub coin count updated', mount.querySelector('[data-coins]').textContent === '100');

  console.log('\nbuying and drawing');
  const buy = labelled('ടിക്കറ്റ് എടുക്ക്');
  ok('buy button appears once affordable', !!buy);
  buy.click();
  await sleep(30);
  ok('ticket bought', ui.state.tickets === 1, 'tickets=' + ui.state.tickets);
  ok('result strip acknowledges it', mount.querySelector('.pb-result__title').textContent.includes('ടിക്കറ്റ്'));

  const drawBtn = labelled('നറുക്കെടുക്ക്');
  ok('draw button appears with a ticket', !!drawBtn);
  drawBtn.click();
  await sleep(60);
  ok('reels are spinning', mount.querySelector('[data-ticket]').classList.contains('is-spinning'));
  ok('verdict says the draw is running', mount.querySelector('[data-verdict]').textContent.includes('നടക്കുന്നു'));
  await sleep(3400);
  const ticket = mount.querySelector('[data-ticket]');
  ok('spin finished', !ticket.classList.contains('is-spinning'));
  ok('stamped', mount.querySelector('[data-stamp]').classList.contains('is-on'));
  ok('outcome shown on the ticket', mount.querySelector('[data-verdict]').textContent.length > 6);
  ok('outcome panel rendered', !!mount.querySelector('.pb-result'));
  ok('winning prefix revealed', /^[A-Z]{2}$/.test(mount.querySelector('[data-prefix]').textContent.trim()));
  ok('ticket was consumed', ui.state.tickets === 0);
  const won = ticket.classList.contains('is-win');
  ok('ticket skin matches the outcome', won ? ui.state.accessUntil > Date.now() : ticket.classList.contains('is-loss'));

  console.log('\nwinning path');
  // Force a win by handing out access directly, then re-render.
  await back.send('bail');
  ui.update(await back.send('state'));
  ok('countdown appears in the stub', mount.querySelector('[data-timewrap]').hidden === false);
  ok('countdown is ticking', /^\d+:\d\d$/.test(mount.querySelector('[data-time]').textContent));
  const go = labelled('പഠിക്കാൻ പോകാം');
  ok('release button offered while access is live', !!go);
  go.click();
  ok('release callback fired', releases === 1);

  console.log('\npass chip');
  const chipMount = doc.createElement('div');
  doc.body.appendChild(chipMount);
  let expired = 0;
  const chip = PBOverlay.pass({
    container: chipMount,
    state: { ...ui.state, accessUntil: Date.now() + 400 },
    onExpire: () => expired++
  });
  ok('chip rendered', !!chipMount.querySelector('.pb-pass'));
  ok('chip shows a clock', /\d:\d\d/.test(chipMount.querySelector('.pb-pass__t').textContent));
  ok('chip warns when under a minute', chipMount.querySelector('.pb-pass').classList.contains('is-low'));
  await sleep(700);
  ok('chip fires expiry once time runs out', expired >= 1);
  chip.destroy();
  ui.destroy();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nCRASHED:', e); process.exit(1); });
