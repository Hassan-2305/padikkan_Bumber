/* Padikkan Bumper — the coin mine.
   Runs on Reels and Shorts. Time only counts while a video is actually
   playing in a focused, visible tab, so you cannot park a tab and farm. */
(function () {
  if (window.__padikkanEarner) return;
  window.__padikkanEarner = true;

  const KEY = 'pb_state';
  const FLUSH_EVERY = 5;      // seconds of credited watching per report
  let site = null;
  let state = null;
  let host = null, ui = null, css = null, shadow = null;
  let watched = 0, sinceFlush = 0, sessionCoins = 0;
  let dismissed = false;
  let lastBladeVisit = Date.now();

  const readState = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(KEY, (got) => {
          void chrome.runtime.lastError;
          resolve(PB.publicState((got && got[KEY]) || {}));
        });
      } catch { resolve(PB.publicState({})); }
    });

  const send = (action, payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action, payload }, (res) => {
          void chrome.runtime.lastError;
          resolve(res && res.ok ? res.data : null);
        });
      } catch { resolve(null); }
    });

  /* ------------------------------------------------------------------ HUD */

  async function mount() {
    if (host || dismissed) return;
    host = document.createElement('div');
    host.id = 'padikkan-bumper-hud';
    host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    const root = shadow;
    document.documentElement.appendChild(host);

    if (!css) {
      try { css = await (await fetch(chrome.runtime.getURL('src/content/overlay.css'))).text(); }
      catch { css = ''; }
    }
    const style = document.createElement('style');
    style.textContent = css;

    const wrap = document.createElement('div');
    wrap.className = 'pb-root';
    wrap.style.cssText = 'position:static;';
    wrap.innerHTML = `
      <div class="pb-hud" data-hud>
        <div class="pb-hud__top">
          <span class="pb-hud__label">പഠിക്കാൻ ബംപർ</span>
          <button class="pb-hud__x" data-x title="ഇന്നത്തേക്ക് മറയ്ക്കുക">✕</button>
        </div>
        <div class="pb-hud__coins"><span data-coins>0</span><small>കോയിൻ</small></div>
        <div class="pb-hud__bar"><i data-bar style="width:0"></i></div>
        <p class="pb-hud__note" data-note></p>
      </div>`;
    root.append(style, wrap);

    ui = {
      box: wrap.querySelector('[data-hud]'),
      coins: wrap.querySelector('[data-coins]'),
      bar: wrap.querySelector('[data-bar]'),
      note: wrap.querySelector('[data-note]'),
      wrap
    };
    wrap.querySelector('[data-x]').addEventListener('click', () => {
      dismissed = true;
      unmount();
    });
    paint();
  }

  function unmount() {
    if (host) host.remove();
    host = null; ui = null; shadow = null;
  }

  let noteRotated = 0;
  let lastActive = null;        // remembered, so a repaint from a storage
                                // change cannot pretend the video resumed
  function paint(active) {
    if (!ui || !state) return;
    if (active !== undefined) lastActive = active;
    const idle = lastActive === false;
    const per = state.economy.SECONDS_PER_COIN;
    ui.coins.textContent = state.coins;
    ui.bar.style.width = ((watched % per) / per) * 100 + '%';
    ui.box.classList.toggle('is-idle', idle);
    ui.box.classList.toggle('is-debt', state.debt > 0);

    if (state.debt > 0) {
      ui.note.textContent = `ബ്ലേഡ് കടം ${state.debt} — സമ്പാദിക്കുന്നതിന്റെ പകുതി ചേട്ടൻ എടുക്കും.`;
    } else if (idle) {
      ui.note.textContent = 'വീഡിയോ നിന്നു. കോയിൻ വീഴുന്നില്ല.';
    } else if (Date.now() - noteRotated > 12000) {
      noteRotated = Date.now();
      const need = Math.max(0, state.economy.TICKET_PRICE - state.coins);
      ui.note.textContent = need > 0
        ? `${need} കോയിൻ കൂടി ഒരു ടിക്കറ്റിന്.`
        : PB.pick(PB.COPY.earnNudges);
    }
  }

  function pop(text, tone) {
    if (!ui) return;
    const inner = document.createElement('div');
    inner.className = 'pb-pop';
    inner.textContent = text;
    if (tone === 'bad') { inner.style.color = '#E2402F'; inner.style.bottom = '124px'; }
    ui.wrap.appendChild(inner);   // inside .pb-root, so the tokens resolve
    setTimeout(() => inner.remove(), 1200);
  }

  /* --------------------------------------------------------------- ticking */

  function isPlaying() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return false;
    const vids = document.querySelectorAll('video');
    for (const v of vids) {
      if (!v.paused && !v.ended && v.readyState > 2 && v.currentTime > 0) {
        const r = v.getBoundingClientRect();
        if (r.width > 60 && r.height > 60) return true;
      }
    }
    return false;
  }

  async function tick() {
    if (!site) return;
    const active = isPlaying();
    if (active) { watched += 1; sinceFlush += 1; }
    paint(active);

    if (sinceFlush >= FLUSH_EVERY) {
      const secs = sinceFlush;
      sinceFlush = 0;
      const r = await send('earn', { seconds: secs });
      if (r && r.gained > 0) {
        sessionCoins += r.gained;
        PBFX.sound.coin();
        pop('+' + r.gained);
        if (r.seized > 0) pop('−' + r.seized + ' ബ്ലേഡ്', 'bad');
      }
      state = await readState();
      paint(active);
    }

    // Blade turns up in person when the debt gets embarrassing.
    if (state && state.debt >= state.economy.BLADE_PANIC_AT && Date.now() - lastBladeVisit > 120000) {
      lastBladeVisit = Date.now();
      bladeVisit();
    }
  }

  function bladeVisit() {
    if (!ui) return;
    PBFX.sound.knock();
    const prev = ui.note.textContent;
    ui.note.textContent = '🔪 ' + PB.pick(PB.COPY.bladeLines) + ` (${state.debt})`;
    ui.box.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
       { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 420, iterations: 2 }
    );
    setTimeout(() => { if (ui) ui.note.textContent = prev; }, 7000);
  }

  /* ----------------------------------------------------------------- setup */

  async function sync() {
    const next = PB.earnSiteFor(location.href);
    if (next && !site) { site = next; state = await readState(); mount(); }
    else if (!next && site) { site = null; unmount(); }
    else if (next) site = next;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    state = PB.publicState(changes[KEY].newValue || {});
    if (state.settings && state.settings.sound === false) PBFX.sound.enabled = false;
    paint();
  });

  readState().then((s) => {
    state = s;
    if (s.settings && s.settings.sound === false) PBFX.sound.enabled = false;
    sync();
    setInterval(tick, 1000);
    setInterval(sync, 1000);
  });
})();
