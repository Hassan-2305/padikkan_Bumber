/* Padikkan Bumper — the bouncer.
   Runs at document_start on every page. Reads state straight from
   chrome.storage so ordinary browsing never has to wake the service worker. */
(function () {
  if (window.__padikkanBumper) return;
  window.__padikkanBumper = true;
  if (location.protocol === 'chrome-extension:') return;

  const KEY = 'pb_state';
  const HOST_ID = 'padikkan-bumper-root';

  let state = null;
  let css = null;
  let host = null;
  let ui = null;
  let passUi = null;
  let peekUi = null;
  let mode = 'none';           // none | peek | blocked | pass
  let peekTimer = null;
  let peeked = false;          // one peek per document, not per SPA route
  let lastUrl = location.href;
  let scrollLock = null;

  /* ------------------------------------------------------------- plumbing */

  const readState = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(KEY, (got) => {
          void chrome.runtime.lastError;
          resolve(PB.publicState((got && got[KEY]) || {}));
        });
      } catch { resolve(PB.publicState({})); }
    });

  async function loadCss() {
    if (css) return css;
    try {
      const res = await fetch(chrome.runtime.getURL('src/content/overlay.css'));
      css = await res.text();
    } catch { css = ''; }
    return css;
  }

  function shadow() {
    if (host && host.isConnected) return host.__shadow;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-padikkan', '');
    // Instant blackout so no study material is readable during the ~10ms
    // it takes to load the stylesheet.
    host.style.cssText =
      'all:initial;position:fixed;inset:0;z-index:2147483647;display:block;background:#06100D;';
    const root = host.attachShadow({ mode: 'open' });
    host.__shadow = root;
    (document.documentElement || document).appendChild(host);
    return root;
  }

  function freeze() {
    const el = document.documentElement;
    if (scrollLock || !el) return;
    scrollLock = {
      overflow: el.style.getPropertyValue('overflow'),
      priority: el.style.getPropertyPriority('overflow')
    };
    el.style.setProperty('overflow', 'hidden', 'important');
    hushMedia();
    document.addEventListener('play', hushMedia, true);
  }

  function thaw() {
    const el = document.documentElement;
    if (!scrollLock || !el) return;
    if (scrollLock.overflow) el.style.setProperty('overflow', scrollLock.overflow, scrollLock.priority);
    else el.style.removeProperty('overflow');
    scrollLock = null;
    document.removeEventListener('play', hushMedia, true);
  }

  function hushMedia() {
    document.querySelectorAll('video,audio').forEach((m) => {
      try { m.pause(); } catch { /* some players guard pause() */ }
    });
  }

  function teardown() {
    clearTimeout(peekTimer); peekTimer = null;
    peekUi && peekUi.destroy();
    peekUi = null;
    ui && ui.destroy();
    passUi && passUi.destroy();
    ui = passUi = null;
    if (host && host.isConnected) host.remove();
    host = null;
    thaw();
    mode = 'none';
  }

  /* --------------------------------------------------------------- screens */

  /* You get a few seconds of the real page first — otherwise a blocked tab is
     just a black rectangle and you never find out what you opened. */
  async function showPeek() {
    const secs = Math.max(
      PB.ECONOMY.PEEK_MIN,
      Math.min(PB.ECONOMY.PEEK_MAX,
               Number(state.settings && state.settings.peekSeconds) || PB.ECONOMY.PEEK_SECONDS)
    );
    peeked = true;
    mode = 'peek';
    const root = shadow();
    // corner widget: the page underneath stays readable and clickable
    host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647;';
    const style = document.createElement('style');
    style.textContent = await loadCss();
    const mountPoint = document.createElement('div');
    root.append(style, mountPoint);

    peekUi = PBOverlay.peek({
      container: mountPoint,
      seconds: secs,
      siteLabel: PB.siteLabel(location.href),
      onSkip: () => { clearTimeout(peekTimer); teardown(); showBlock(); },
      onEnd: () => { teardown(); showBlock(true); }
    });

    peekTimer = setTimeout(() => {
      if (mode === 'peek') { teardown(); showBlock(true); }
    }, secs * 1000);
  }

  async function showBlock(shutter) {
    if (mode === 'blocked' && host && host.isConnected) { ui && ui.update(state); return; }
    clearTimeout(peekTimer); peekTimer = null;
    teardown();
    mode = 'blocked';
    freeze();
    const root = shadow();
    const style = document.createElement('style');
    style.textContent = await loadCss();
    const mountPoint = document.createElement('div');
    root.append(style, mountPoint);
    host.style.background = 'transparent';

    ui = PBOverlay.create({
      container: mountPoint,
      state,
      shutter: !!shutter,
      siteLabel: PB.siteLabel(location.href),
      onRelease: () => { teardown(); showPass(); }
    });

    PBOverlay.send('blocked');
    const mark = 'പഠിക്കണോ മോനേ? · ';
    if (!document.title.startsWith(mark)) document.title = mark + document.title;
  }

  async function showPass() {
    if (state.accessUntil <= Date.now()) { evaluate(); return; }
    if (mode === 'pass') { passUi && passUi.update(state); return; }
    teardown();
    mode = 'pass';
    const root = shadow();
    host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647;';
    const style = document.createElement('style');
    style.textContent = await loadCss();
    const mountPoint = document.createElement('div');
    root.append(style, mountPoint);

    passUi = PBOverlay.pass({
      container: mountPoint,
      state,
      onExpire: async () => {
        state = await readState();
        teardown();
        evaluate(true);
      }
    });
  }

  /* -------------------------------------------------------------- decision */

  async function evaluate(expired) {
    state = state || (await readState());
    const study = PB.isStudyUrl(location.href, state.settings);

    if (!study) { if (mode !== 'none') teardown(); return; }

    if (state.accessUntil > Date.now()) { showPass(); return; }

    // First time this page is caught, let them actually see it. When a pass
    // expires under them they are already looking at it, so drop the shutter.
    if (!expired && !peeked && mode === 'none') { showPeek(); return; }

    await showBlock(true);
    if (expired && ui) {
      // The pass ran out while they were mid-sentence. Say so.
      const t = ui && ui.state;
      const el = host.__shadow.querySelector('.pb-title');
      const sub = host.__shadow.querySelector('.pb-sub');
      if (el) el.textContent = 'സമയം കഴിഞ്ഞു മോനേ';
      if (sub) sub.textContent = 'പാസ് തീർന്നു. അടുത്ത ടിക്കറ്റ് എടുക്ക്, അല്ലെങ്കിൽ റീൽസിലേക്ക്.';
      setTimeout(() => ui && ui.say && ui.say('expired'), 500);
      void t;
    }
  }

  /* ----------------------------------------------------------- navigation */

  function watchUrl() {
    const fire = () => {
      if (location.href === lastUrl) { guard(); return; }
      lastUrl = location.href;
      evaluate();
    };
    ['pushState', 'replaceState'].forEach((m) => {
      const orig = history[m];
      if (!orig || orig.__pbWrapped) return;
      const wrapped = function () { const r = orig.apply(this, arguments); setTimeout(fire, 0); return r; };
      wrapped.__pbWrapped = true;
      history[m] = wrapped;
    });
    addEventListener('popstate', fire);
    addEventListener('hashchange', fire);
    setInterval(fire, 1200);
  }

  /* Single-page apps rewrite the DOM wholesale; if the overlay gets swept out
     with it, put it straight back. */
  function guard() {
    if (mode === 'peek') return;
    if (mode === 'blocked' && (!host || !host.isConnected)) {
      host = null;
      showBlock();
    } else if (mode === 'blocked' && !scrollLock) {
      freeze();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    state = PB.publicState(changes[KEY].newValue || {});
    PBFX.applySettings(state && state.settings);
    if (mode === 'blocked') {
      if (state.accessUntil > Date.now()) { teardown(); showPass(); }
      else ui && ui.update(state);
    } else if (mode === 'peek') {
      if (state.accessUntil > Date.now()) { teardown(); showPass(); }
    } else if (mode === 'pass') {
      if (state.accessUntil <= Date.now()) { teardown(); evaluate(true); }
      else passUi && passUi.update(state);
    } else {
      evaluate();
    }
  });

  readState().then((s) => {
    state = s;
    PBFX.applySettings(s && s.settings);
    evaluate();
    watchUrl();
  });
})();
