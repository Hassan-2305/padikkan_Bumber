/* Loads the real popup markup + script against the real service worker. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot } = require('./harness');
const { makeDocument, parse } = require('./dom');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : ''))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const back = boot();
  const doc = makeDocument();

  // mount the real popup markup
  const html = read('src/popup/popup.html');
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
                   .replace(/<script[\s\S]*?<\/script>/g, '');
  for (const n of parse(body, doc)) doc.body.appendChild(n);

  let closed = 0;
  const ctx = vm.createContext({
    console, document: doc, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, RegExp, Error,
    URL, URLSearchParams, structuredClone, performance,
    innerWidth: 404, innerHeight: 588, devicePixelRatio: 2,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    chrome: {
      runtime: {
        sendMessage: (msg, cb) => {
          if (msg && msg.type) return;                 // broadcast, ignore
          for (const f of back.chrome.listeners.message) f(msg, {}, (res) => cb && cb(res));
        },
        onMessage: { addListener: () => {} },
        lastError: null,
        getURL: (p) => 'chrome-extension://test/' + p
      },
      storage: back.chrome.api.storage,
      tabs: { query: async () => [{ id: 1, url: 'https://arxiv.org/abs/1' }] }
    }
  });
  ctx.globalThis = ctx;
  ctx.window = { close: () => closed++ };

  for (const f of ['src/shared/config.js', 'src/shared/fx.js', 'src/shared/overlay-ui.js', 'src/popup/popup.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  await sleep(40);

  const q = (s) => doc.querySelector(s);
  const btns = (host) => (host || doc.documentElement).querySelectorAll('.pb-btn');
  const labelled = (frag, host) => btns(host).find((b) => b.textContent.includes(frag));

  console.log('\npopup boot');
  ok('brand mark got its lamp', q('[data-lamp]').querySelectorAll('svg').length === 1);
  ok('hero shows the coin balance', q('[data-hero-v]').textContent === '0');
  ok('hero explains what is needed', q('[data-hero-note]').textContent.includes('കോയിൻ കൂടി വേണം'));
  ok('draw panel has six reels', q('[data-reels]').querySelectorAll('.pb-reel').length === 6);
  ok('a ticket number is printed', /[A-Z]{2} \d{6}/.test(q('[data-serial]').textContent));
  ok('both coin mines offered', q('[data-mines]').querySelectorAll('.pb-btn').length === 2);
  ok('mine rate explained', q('[data-rate]').textContent.includes('1 കോയിൻ'));
  ok('buy is disabled while broke', labelled('ടിക്കറ്റ് എടുക്ക്').disabled === true);
  ok('blade panel offered when broke', q('[data-blade]').hidden === false);
  ok('stats grid has six cells', q('[data-stats]').querySelectorAll('.cell').length === 6);
  ok('history empty at first', q('[data-history]').children.length === 0);

  console.log('\nborrow, buy, draw');
  labelled('വാങ്ങ്', q('[data-blade-actions]')).click();
  await sleep(40);
  ok('coins credited to the hero', q('[data-hero-v]').textContent === '100');
  ok('debt displayed', q('[data-debt]').textContent === '150');
  ok('repay button appears', !!labelled('അടയ്ക്ക്', q('[data-blade-actions]')));

  labelled('ടിക്കറ്റ് എടുക്ക്').click();
  await sleep(40);
  ok('buying is reflected in the balance', q('[data-hero-v]').textContent === '80');
  ok('draw button now offered', !!labelled('നറുക്കെടുക്ക്'));
  ok('verdict invites a draw', q('[data-verdict]').textContent.includes('ഭാഗ്യം'));

  labelled('നറുക്കെടുക്ക്').click();
  await sleep(60);
  ok('draw in progress', q('[data-verdict]').textContent.includes('നടക്കുന്നു'));
  await sleep(3400);
  ok('draw resolved', !q('[data-verdict]').textContent.includes('നടക്കുന്നു'));
  ok('winning prefix revealed', /^[A-Z]{2}$/.test(q('[data-prefix]').textContent.trim()));
  ok('history records the draw', q('[data-history]').children.length === 1);
  ok('stats counted the play',
     q('[data-stats]').querySelectorAll('.cell')[1].textContent.startsWith('1'));

  console.log('\nsettings');
  q('[data-open-settings]').click();
  await sleep(20);
  ok('settings sheet opens', q('[data-settings]').hidden === false);
  const cats = q('[data-cats]').querySelectorAll('.toggle');
  ok('one toggle per category', cats.length === Object.keys(ctx.PB.CATEGORIES).length);
  ok('extras rendered', q('[data-extras]').querySelectorAll('.toggle').length === 5);
  ok('meme mode is offered', q('[data-extras]').textContent.includes('മീം മോഡ്'));
  ok('scratch mode is offered', q('[data-extras]').textContent.includes('ചുരണ്ടൽ'));

  const slider = q('[data-peekr]');
  ok('peek slider rendered', !!slider);
  ok('slider starts at the current value', slider.getAttribute('value') === String(ctx.PB.ECONOMY.PEEK_SECONDS));
  ok('slider is bounded', slider.getAttribute('min') === String(ctx.PB.ECONOMY.PEEK_MIN)
     && slider.getAttribute('max') === String(ctx.PB.ECONOMY.PEEK_MAX));
  slider.value = '9';
  slider.dispatch('change', {});
  await sleep(40);
  ok('moving the slider persists the peek delay',
     (await back.send('state')).settings.peekSeconds === 9);

  const clipRows = q('[data-clips]').querySelectorAll('[data-clip]');
  ok('one row per sound slot', clipRows.length === ctx.PBFX.sound.SLOTS.length);
  ok('every slot starts empty',
     clipRows.every((r) => r.querySelector('[data-state]').textContent === '—'));
  ok('play and clear are disabled with no clip',
     clipRows[0].querySelector('[data-play]').disabled === true
     && clipRows[0].querySelector('[data-clear]').disabled === true);
  ok('slots are labelled in Malayalam',
     clipRows.find((r) => r.getAttribute('data-clip') === 'bumper')
             .querySelector('.clip__n').textContent.includes('ബമ്പർ'));

  const first = cats[0].querySelector('input');
  first.checked = !first.checked;   // the browser flips this before firing change
  first.dispatch('change', {});
  await sleep(40);
  let st = await back.send('state');
  ok('turning a category off persists', st.settings.disabledCategories.length === 1, JSON.stringify(st.settings.disabledCategories));
  ok('that category stops blocking',
     !ctx.PB.isStudyUrl('https://chatgpt.com/c/1', st.settings));

  q('[data-custom]').value = 'https://Portal.College.ac.in/login';
  q('[data-add]').click();
  await sleep(40);
  st = await back.send('state');
  ok('custom host normalised before saving', st.settings.customSites[0] === 'portal.college.ac.in',
     JSON.stringify(st.settings.customSites));
  ok('custom chip rendered', q('[data-customlist]').children.length === 1);

  q('[data-custom]').value = 'not a domain';
  q('[data-add]').click();
  await sleep(30);
  st = await back.send('state');
  ok('junk input rejected', st.settings.customSites.length === 1);
  ok('a toast explains why', !!q('.toast'));

  q('[data-allow-current]').click();
  await sleep(40);
  st = await back.send('state');
  ok('current site allowlisted from the popup', st.settings.allowlist[0] === 'arxiv.org',
     JSON.stringify(st.settings.allowlist));
  ok('allowlisted site stops being blocked', !ctx.PB.isStudyUrl('https://arxiv.org/abs/1', st.settings));

  const remove = q('[data-allowlist]').querySelector('button');
  remove.click();
  await sleep(40);
  st = await back.send('state');
  ok('allowlist entry can be removed', st.settings.allowlist.length === 0);

  console.log('\nreset');
  const reset = q('[data-reset]');
  reset.click();
  ok('reset asks for confirmation first', reset.textContent.includes('ഉറപ്പാണോ'));
  st = await back.send('state');
  ok('nothing wiped on the first press', st.settings.customSites.length === 1);
  reset.click();
  await sleep(60);
  st = await back.send('state');
  ok('second press wipes everything', st.coins === 0 && st.debt === 0 && st.settings.customSites.length === 0);
  ok('hero back to zero', q('[data-hero-v]').textContent === '0');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nCRASHED:', e); process.exit(1); });
