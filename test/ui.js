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

  console.log('\nchoosing a lot');
  {
    const cards = mount.querySelectorAll('[data-lot]');
    ok('three lots offered', cards.length === 3);
    ok('the middle lot is selected by default',
       mount.querySelector(`[data-lot="${PB.DEFAULT_LOT}"]`).classList.contains('is-on'));
    ok('each card shows its price',
       PB.LOTS.every((l) => mount.querySelector(`[data-lot="${l.id}"]`).textContent.includes(String(l.price))));
    ok('each card shows its odds',
       PB.LOTS.every((l) => mount.querySelector(`[data-lot="${l.id}"]`)
         .textContent.includes(String(Math.round(l.win * 100)))));
    ok('the 200-coin lot is out of reach on 100 coins',
       mount.querySelector('[data-lot="bumper"]').classList.contains('is-poor'));
    ok('the 20-coin lot is affordable',
       !mount.querySelector('[data-lot="kutty"]').classList.contains('is-poor'));

    mount.querySelector('[data-lot="kutty"]').click();
    await sleep(20);
    ok('clicking selects it', mount.querySelector('[data-lot="kutty"]').classList.contains('is-on'));
    ok('and deselects the other',
       !mount.querySelector(`[data-lot="${PB.DEFAULT_LOT}"]`).classList.contains('is-on'));
    ok('the buy button follows the choice',
       labelled('എടുക്ക്').textContent.includes(String(PB.lot('kutty').price)));
    ok('it is announced to screen readers',
       mount.querySelector('[data-lot="kutty"]').getAttribute('aria-checked') === 'true');

    mount.querySelector(`[data-lot="${PB.DEFAULT_LOT}"]`).click();
    await sleep(20);
    ok('switching back works',
       labelled('എടുക്ക്').textContent.includes(String(PB.lot(PB.DEFAULT_LOT).price)));
  }

  console.log('\nbuying and drawing');
  const buy = labelled('എടുക്ക്');
  ok('buy button appears once affordable', !!buy);
  buy.click();
  await sleep(30);
  ok('ticket bought', ui.state.tickets[PB.DEFAULT_LOT] === 1, JSON.stringify(ui.state.tickets));
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
  ok('ticket was consumed', ui.state.tickets[PB.DEFAULT_LOT] === 0);
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

  console.log('\nscratch card');
  {
    // a fresh overlay, so this section does not inherit the earlier one's state
    await back.send('reset');
    // the SW clamps each report to 60s, so mine it in realistic chunks
    for (let i = 0; i < 5; i++) await back.send('earn', { seconds: 60 });
    const mount2 = doc.createElement('div');
    doc.body.appendChild(mount2);
    const ui2 = PBOverlay.create({
      container: mount2, state: await back.send('state'),
      siteLabel: 'arxiv.org', onRelease: () => {}
    });
    void ui2;
    const pick = (frag) => mount2.querySelectorAll('.pb-btn').find((b) => b.textContent.includes(frag));

    // give the overlay a canvas that reports a 2d context, so the foil path runs
    const cv = mount2.querySelector('[data-scratchc]');
    const calls = [];
    cv.__ctx2d = {
      canvas: cv, globalAlpha: 1, globalCompositeOperation: 'source-over',
      lineWidth: 0, lineCap: '', lineJoin: '', fillStyle: '',
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect: () => calls.push('fillRect'),
      beginPath: () => calls.push('beginPath'),
      moveTo() {}, lineTo() {}, stroke: () => calls.push('stroke'),
      arc() {}, fill: () => calls.push('fill')
    };
    cv.getBoundingClientRect = () => ({ width: 600, height: 300, top: 0, left: 0 });

    mount2.querySelector('[data-lot="kutty"]').click();   // the 20-coin lot
    await sleep(20);
    pick('എടുക്ക്').click();
    await sleep(80);
    pick('നറുക്കെടുക്ക്').click();
    await sleep(150);

    const foil = mount2.querySelector('[data-scratch]');
    ok('foil covers the ticket while the draw runs', foil.hidden === false);
    ok('foil was actually painted', calls.includes('fillRect'));
    ok('it tells you to scratch',
       mount2.querySelector('[data-scratchhint]').textContent === PB.COPY.scratch.hint);

    await sleep(3600);
    ok('result stays hidden until you scratch', foil.hidden === false);
    ok('no verdict yet', !mount2.querySelector('[data-stamp]').classList.contains('is-on'));

    // scratch it
    cv.dispatch('pointerdown', { clientX: 10, clientY: 10 });
    for (let i = 0; i < 40; i++) cv.dispatch('pointermove', { clientX: 10 + i * 6, clientY: 40 });
    cv.dispatch('pointerup', {});
    await sleep(500);
    ok('scratching lifts the foil', foil.hidden === true);
    ok('and the verdict lands', mount2.querySelector('[data-stamp]').classList.contains('is-on'));
    ok('the ticket resolves one way or the other',
       mount2.querySelector('[data-ticket]').classList.contains('is-win')
       || mount2.querySelector('[data-ticket]').classList.contains('is-loss'));
  }

  console.log('\nnobody gets trapped behind the foil');
  {
    await back.send('reset');
    for (let i = 0; i < 5; i++) await back.send('earn', { seconds: 60 });
    const m3 = doc.createElement('div');
    doc.body.appendChild(m3);
    PBOverlay.create({ container: m3, state: await back.send('state'),
                       siteLabel: 'arxiv.org', onRelease: () => {} });
    const pick3 = (f) => m3.querySelectorAll('.pb-btn').find((b) => b.textContent.includes(f));
    const cv3 = m3.querySelector('[data-scratchc]');
    cv3.__ctx2d = {
      canvas: cv3, globalAlpha: 1, globalCompositeOperation: '', lineWidth: 0, lineCap: '', lineJoin: '',
      fillStyle: '', createLinearGradient: () => ({ addColorStop() {} }), fillRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}
    };
    cv3.getBoundingClientRect = () => ({ width: 600, height: 300, top: 0, left: 0 });

    m3.querySelector('[data-lot="kutty"]').click();   // the 20-coin lot
    await sleep(20);
    pick3('എടുക്ക്').click();
    await sleep(80);
    pick3('നറുക്കെടുക്ക്').click();
    await sleep(4000);
    const foil3 = m3.querySelector('[data-scratch]');
    ok('foil is still up if you never touch it', foil3.hidden === false);
    await sleep(9000);                       // past the 12s bail-out
    ok('it gives up and reveals by itself', foil3.hidden === true);
    ok('the result is there', m3.querySelector('[data-stamp]').classList.contains('is-on'));
  }

  console.log('\nscratch can be switched off');
  {
    await back.send('reset');
    for (let i = 0; i < 5; i++) await back.send('earn', { seconds: 60 });
    await back.send('settings', { patch: { scratch: false } });
    const m4 = doc.createElement('div');
    doc.body.appendChild(m4);
    PBOverlay.create({ container: m4, state: await back.send('state'),
                       siteLabel: 'arxiv.org', onRelease: () => {} });
    const pick4 = (f) => m4.querySelectorAll('.pb-btn').find((b) => b.textContent.includes(f));
    const cv4 = m4.querySelector('[data-scratchc]');
    cv4.__ctx2d = {
      canvas: cv4, globalAlpha: 1, globalCompositeOperation: '', lineWidth: 0, lineCap: '', lineJoin: '',
      fillStyle: '', createLinearGradient: () => ({ addColorStop() {} }), fillRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}
    };
    cv4.getBoundingClientRect = () => ({ width: 600, height: 300, top: 0, left: 0 });
    m4.querySelector('[data-lot="kutty"]').click();   // the 20-coin lot
    await sleep(20);
    pick4('എടുക്ക്').click();
    await sleep(80);
    pick4('നറുക്കെടുക്ക്').click();
    await sleep(3800);
    ok('no foil when the setting is off', m4.querySelector('[data-scratch]').hidden === true);
    ok('result appears straight after the spin',
       m4.querySelector('[data-stamp]').classList.contains('is-on'));
    await back.send('settings', { patch: { scratch: true } });
  }

  console.log('\ncharacters turn up and talk');
  {
    await back.send('reset');
    const m5 = doc.createElement('div');
    doc.body.appendChild(m5);
    PBOverlay.create({ container: m5, state: await back.send('state'),
                       siteLabel: 'arxiv.org', shutter: true, onRelease: () => {} });
    await sleep(900);

    const bar = m5.querySelector('[data-subbar]');
    ok('a subtitle bar appears on block', bar.hidden === false);
    ok('the speaker is named', m5.querySelector('[data-subwho]').textContent.length > 0);
    await sleep(700);
    const said = m5.querySelector('[data-subline]').textContent;
    ok('the line types itself out', said.length > 4);
    ok('with no clips loaded it falls back to a written line',
       PB.DIALOGUE.block.some((l) => l.ml.startsWith(said) || said === l.ml));
    await sleep(4200);
    ok('the subtitle clears itself', bar.classList.contains('is-on') === false);
  }

  console.log('\nyour own clips become the dialogue');
  {
    // pretend the user dropped in an "Ormayundo Ee Mukham?" file
    const played = [];
    ctx.PBFX.sound.playClip = (id) => { played.push(id); return true; };
    ctx.PBFX.sound.hasClip = (id) => id === 'ormayundo';

    ok('the scene knows which clips are ready',
       ctx.PBFX.voice.ready('block').map((m) => m.id).join() === 'ormayundo');
    ok('scenes with no clips stay empty', ctx.PBFX.voice.ready('bumper').length === 0);

    const m7 = doc.createElement('div');
    doc.body.appendChild(m7);
    PBOverlay.create({ container: m7, state: await back.send('state'),
                       siteLabel: 'arxiv.org', shutter: true, onRelease: () => {} });
    await sleep(1400);

    ok('the clip is played', played.includes('ormayundo'));
    const slot = PB.MEMES.find((m) => m.id === 'ormayundo');
    ok('the subtitle captions the clip',
       m7.querySelector('[data-subline]').textContent === slot.label);
    ok('and credits the film', m7.querySelector('[data-subwho]').textContent === slot.film);

    ok('a scene with no clip plays nothing', ctx.PBFX.voice.play('bumper') === null);
    ctx.PBFX.voice.enabled = false;
    played.length = 0;
    ok('muted dialogue plays nothing', ctx.PBFX.voice.play('block') === null && !played.length);
    ctx.PBFX.voice.enabled = true;
  }

  console.log('\nno text-to-speech anywhere');
  {
    ok('the speech engine is never touched', typeof ctx.speechSynthesis === 'undefined');
    ok('nothing exposes a speak() call', typeof ctx.PBFX.voice.speak === 'undefined');
  }

  console.log('\nmuting really mutes');
  {
    ctx.PBFX.applySettings({ sound: false });
    ok('dialogue off when sound is off', ctx.PBFX.voice.enabled === false);
    ctx.PBFX.applySettings({ sound: true, voice: false });
    ok('dialogue can be muted on its own', ctx.PBFX.voice.enabled === false);
    ok('but the sound effects stay on', ctx.PBFX.sound.enabled === true);
    ctx.PBFX.applySettings({ sound: true, voice: true });
    ok('and both come back', ctx.PBFX.voice.enabled === true && ctx.PBFX.sound.enabled === true);
  }

  console.log('\nmeme mode off means silence from the cast');
  {
    const m6 = doc.createElement('div');
    doc.body.appendChild(m6);
    const st6 = await back.send('state');
    st6.settings = { ...st6.settings, memeMode: false };
    PBOverlay.create({ container: m6, state: st6, siteLabel: 'arxiv.org',
                       shutter: true, onRelease: () => {} });
    await sleep(900);
    ok('no subtitle when meme mode is off', m6.querySelector('[data-subbar]').hidden === true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nCRASHED:', e); process.exit(1); });
