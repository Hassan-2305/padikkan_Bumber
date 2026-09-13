/* Padikkan Bumper — popup. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const send = PBOverlay.send;

  const el = {
    lamp: $('[data-lamp]'),
    sound: $('[data-sound]'),
    hero: $('[data-hero]'), heroK: $('[data-hero-k]'), heroV: $('[data-hero-v]'),
    heroU: $('[data-hero-u]'), heroNote: $('[data-hero-note]'), meter: $('[data-meter]'),
    serial: $('[data-serial]'), prefix: $('[data-prefix]'), reels: $('[data-reels]'),
    verdict: $('[data-verdict]'), drawActions: $('[data-draw-actions]'),
    mines: $('[data-mines]'), rate: $('[data-rate]'),
    blade: $('[data-blade]'), debt: $('[data-debt]'), loans: $('[data-loans]'),
    bladeNote: $('[data-blade-note]'), bladeActions: $('[data-blade-actions]'),
    stats: $('[data-stats]'), history: $('[data-history]'),
    settings: $('[data-settings]'), cats: $('[data-cats]'), extras: $('[data-extras]'),
    peek: $('[data-peek]'), clips: $('[data-clips]'),
    custom: $('[data-custom]'), customList: $('[data-customlist]'), allowList: $('[data-allowlist]')
  };

  el.lamp.insertAdjacentHTML('afterbegin', PBOverlay.LAMP);

  let s = null;
  let busy = false;
  let ticket = PB.serial();
  let timer = null;
  const reels = PBOverlay.makeReels(el.reels, { count: 6, height: 38 });

  /* ------------------------------------------------------------------ util */

  function toast(text, tone) {
    $('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (tone ? ' is-' + tone : '');
    t.textContent = text;
    $('.shell').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function btn(label, { kind = '', onClick, disabled } = {}) {
    const b = document.createElement('button');
    b.className = 'pb-btn' + (kind ? ' pb-btn--' + kind : '');
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function cell(value, label, color) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.innerHTML = `<b></b><span></span>`;
    d.querySelector('b').textContent = value;
    if (color) d.querySelector('b').style.color = color;
    d.querySelector('span').textContent = label;
    return d;
  }

  function newTicket() {
    ticket = PB.serial();
    el.serial.textContent = 'ടിക്കറ്റ് നം. ' + ticket;
    el.prefix.textContent = '\u00B7\u00B7';
    el.prefix.style.opacity = '.35';
    reels.idle();
  }

  /* --------------------------------------------------------------- painting */

  function paintHero() {
    const left = s.accessUntil - Date.now();
    el.hero.classList.toggle('is-live', left > 0);
    el.hero.classList.toggle('is-debt', left <= 0 && s.debt > 0);

    if (left > 0) {
      el.heroK.textContent = 'പഠിക്കാൻ ബാക്കി';
      el.heroV.textContent = PB.clock(left);
      el.heroU.textContent = 'മിനിറ്റ്';
      el.heroNote.textContent = PB.pick(PB.COPY.grantedLines);
      const span = Math.max(left, 1);
      el.meter.style.width = Math.min(100, (span / (10 * 60000)) * 100) + '%';
      if (!timer) timer = setInterval(paintHero, 500);
      return;
    }
    if (timer) { clearInterval(timer); timer = null; }

    const price = s.economy.TICKET_PRICE;
    el.heroK.textContent = 'കയ്യിലുള്ളത്';
    el.heroV.textContent = s.coins;
    el.heroU.textContent = 'കോയിൻ';
    el.meter.style.width = Math.min(100, (s.coins % price) / price * 100) + '%';
    const need = Math.max(0, price - s.coins);
    el.heroNote.textContent = s.coins >= price
      ? `${Math.floor(s.coins / price)} ടിക്കറ്റ് വാങ്ങാം.`
      : `${need} കോയിൻ കൂടി വേണം — ഏകദേശം ${Math.ceil(need * s.economy.SECONDS_PER_COIN / 60)} മിനിറ്റ് റീൽസ്.`;
  }

  function paintDraw() {
    el.drawActions.innerHTML = '';
    const price = s.economy.TICKET_PRICE;
    if (s.tickets > 0) {
      el.drawActions.append(btn(`നറുക്കെടുക്ക് · ${s.tickets} ബാക്കി`, { kind: 'gold', onClick: draw }));
    }
    el.drawActions.append(btn(`ടിക്കറ്റ് എടുക്ക് · ${price}`, {
      kind: s.tickets > 0 ? '' : 'gold',
      disabled: s.coins < price,
      onClick: () => buy(1)
    }));
    if (s.coins >= price * 5) el.drawActions.append(btn('5 എണ്ണം', { onClick: () => buy(5) }));
  }

  function paintMines() {
    el.mines.innerHTML = '';
    el.rate.textContent = `${s.economy.SECONDS_PER_COIN} സെക്കൻഡ് = 1 കോയിൻ`;
    for (const m of PB.EARN_SITES) {
      el.mines.append(btn(m.ml, {
        kind: s.settings.preferredMine === m.id ? 'gold' : '',
        onClick: () => { send('openMine', { id: m.id }); window.close(); }
      }));
    }
  }

  function paintBlade() {
    const show = s.debt > 0 || s.coins < s.economy.TICKET_PRICE;
    el.blade.hidden = !show;
    if (!show) return;
    el.debt.textContent = s.debt;
    el.debt.style.display = s.debt > 0 ? '' : 'none';
    el.loans.textContent = s.debt > 0 ? `${s.loans} തവണ വാങ്ങി` : 'ഇപ്പോൾ കടമില്ല';
    el.bladeNote.textContent = s.debt > 0
      ? `മണിക്കൂറിൽ ${s.economy.BLADE_HOURLY_RATE * 100}% പലിശ. സമ്പാദിക്കുന്നതിന്റെ പകുതി ചേട്ടൻ പിടിക്കും.`
      : `${s.economy.BLADE_PRINCIPAL} കോയിൻ ഇപ്പോൾ കിട്ടും. തിരിച്ച് ${Math.round(s.economy.BLADE_PRINCIPAL * s.economy.BLADE_UPFRONT)} കൊടുക്കണം.`;

    el.bladeActions.innerHTML = '';
    el.bladeActions.append(btn(`${s.economy.BLADE_PRINCIPAL} വാങ്ങ്`, {
      kind: 'red',
      disabled: s.loans >= s.economy.BLADE_MAX_LOANS,
      onClick: async () => {
        const r = await send('borrow');
        if (r && r.ok) { PBFX.sound.knock(); toast('കടം എടുത്തു. പലിശ ഓടിത്തുടങ്ങി.', 'bad'); refresh(); }
        else if (r) toast(r.message, 'bad');
      }
    }));
    if (s.debt > 0 && s.coins > 0) {
      const pay = Math.min(s.coins, s.debt);
      el.bladeActions.append(btn(`${pay} അടയ്ക്ക്`, {
        onClick: async () => {
          const r = await send('repay', { amount: pay });
          if (r && r.ok) {
            PBFX.sound.coin();
            toast(r.cleared ? 'കടം തീർന്നു. ചേട്ടൻ ചിരിച്ചു.' : `${r.paid} അടച്ചു. ബാക്കി ${r.debt}.`, r.cleared ? 'win' : '');
            refresh();
          }
        }
      }));
    }
  }

  function paintStats() {
    const st = s.stats || {};
    const rate = st.plays ? Math.round((st.wins / st.plays) * 100) : 0;
    el.stats.innerHTML = '';
    el.stats.append(
      cell(Math.round((st.watchSeconds || 0) / 60), 'മിനിറ്റ് റീൽസ്'),
      cell(st.plays || 0, 'നറുക്കെടുപ്പ്'),
      cell(rate + '%', 'വിജയശതമാനം', rate > 0 ? '#7FE0B0' : undefined),
      cell(Math.round((st.studySecondsWon || 0) / 60), 'മിനിറ്റ് പഠിപ്പ്', '#7FE0B0'),
      cell(st.blocks || 0, 'തടഞ്ഞ തവണ'),
      cell(st.coinsSeized || 0, 'പിടിച്ചെടുത്തത്', st.coinsSeized ? '#FF9C8E' : undefined)
    );

    el.history.innerHTML = '';
    for (const h of (s.history || []).slice(0, 8)) {
      const p = PB.PRIZES.find((x) => x.id === h.prize);
      const c = document.createElement('span');
      c.className = 'chip' + (h.seconds > 0 ? ' is-win' : h.prize === 'police' ? ' is-bad' : '');
      c.textContent = h.seconds > 0 ? `${h.serial} · ${h.seconds}s` : `${h.serial} · ${p && p.id === 'police' ? 'റെയ്ഡ്' : '—'}`;
      el.history.append(c);
    }
  }

  function paint() {
    paintHero();
    paintDraw();
    paintMines();
    paintBlade();
    paintStats();
    el.sound.classList.toggle('is-off', s.settings.sound === false);
    el.sound.textContent = s.settings.sound === false ? '🔇' : '🔊';
    PBFX.sound.enabled = s.settings.sound !== false;
  }

  /* ---------------------------------------------------------------- actions */

  async function buy(n) {
    if (busy) return;
    busy = true;
    const r = await send('buy', { count: n });
    busy = false;
    if (!r) return;
    if (!r.ok) { toast(r.message, 'bad'); PBFX.sound.lose(); return; }
    PBFX.sound.coin();
    newTicket();
    el.verdict.className = 'verdict';
    el.verdict.textContent = n > 1 ? `${n} ടിക്കറ്റ് എടുത്തു. ഭാഗ്യം നോക്കാം.` : 'ടിക്കറ്റ് എടുത്തു. ഭാഗ്യം നോക്കാം.';
    refresh();
  }

  async function draw() {
    if (busy) return;
    busy = true;
    $$('.pb-btn', el.drawActions).forEach((b) => (b.disabled = true));
    newTicket();
    el.verdict.className = 'verdict';
    el.verdict.textContent = 'നറുക്കെടുപ്പ് നടക്കുന്നു…';
    PBFX.sound.spin();

    const r = await send('play', { serial: ticket });
    if (!r || !r.ok) {
      busy = false;
      if (r && r.message) toast(r.message, 'bad');
      paint();
      return;
    }
    const [pre, num] = r.numbers.winning.split(' ');
    await reels.spinTo(num);
    el.prefix.textContent = pre;
    el.prefix.style.opacity = '1';
    s = r.state;
    busy = false;

    const p = r.prize;
    if (r.won) {
      el.verdict.className = 'verdict is-win';
      el.verdict.innerHTML = `<b>${p.ml}</b> — ${p.seconds} സെക്കൻഡ് പഠിക്കാം.`;
      PBFX.sound.win(p.id === 'bumper' || p.id === 'first');
      toast(p.ml + ' ' + p.note, 'win');
    } else if (p.id === 'police') {
      el.verdict.className = 'verdict is-bad';
      el.verdict.innerHTML = `<b>അയ്യോ പൊലീസ്!</b> ${r.seized} കോയിൻ പോയി.`;
      PBFX.sound.siren();
    } else {
      el.verdict.className = 'verdict is-bad';
      el.verdict.innerHTML = r.numbers.missBy === 1
        ? `<b>ഒരു അക്കം കൊണ്ട് പോയി!</b> നിന്റേത് ${r.numbers.drawn}.`
        : `${PB.pick(PB.COPY.lose)} നിന്റേത് ${r.numbers.drawn}.`;
      PBFX.sound.lose();
    }
    PBFX.sound.stamp();
    paint();
  }

  /* --------------------------------------------------------------- settings */

  function toggle(label, note, checked, onChange) {
    const l = document.createElement('label');
    l.className = 'toggle';
    l.innerHTML = `<input type="checkbox"><span class="toggle__box"></span>
      <span class="toggle__t"><b></b><span></span></span>`;
    const input = l.querySelector('input');
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    l.querySelector('b').textContent = label;
    l.querySelector('.toggle__t span').textContent = note;
    return l;
  }

  function paintSettings() {
    el.cats.innerHTML = '';
    for (const [key, cat] of Object.entries(PB.CATEGORIES)) {
      const on = !s.settings.disabledCategories.includes(key);
      el.cats.append(toggle(cat.ml, cat.hosts.slice(0, 3).join(', ') + '…', on, async (v) => {
        const set = new Set(s.settings.disabledCategories);
        v ? set.delete(key) : set.add(key);
        await patch({ disabledCategories: [...set] });
      }));
    }

    el.extras.innerHTML = '';
    el.extras.append(
      toggle('പി.ഡി.എഫ്. ഫയലുകൾ', 'ഏത് സൈറ്റിലെയും .pdf', s.settings.blockPdfs !== false,
        (v) => patch({ blockPdfs: v })),
      toggle('കോളേജ് ഡൊമെയ്‌നുകൾ', '.ac.in, .edu, .ac.uk തുടങ്ങിയവ', s.settings.blockAcademicTlds !== false,
        (v) => patch({ blockAcademicTlds: v })),
      toggle('ശബ്ദം', 'നറുക്കെടുപ്പിന്റെ ശബ്ദങ്ങൾ', s.settings.sound !== false,
        (v) => patch({ sound: v })),
      toggle('മീം മോഡ്', 'ഉറക്കെയുള്ള ഡയലോഗുകളും പ്രതികരണങ്ങളും', s.settings.memeMode !== false,
        (v) => patch({ memeMode: v })),
      toggle('ചുരണ്ടൽ', 'ഫലം അറിയാൻ ടിക്കറ്റ് ചുരണ്ടണം', s.settings.scratch !== false,
        (v) => patch({ scratch: v }))
    );

    paintPeek();
    paintClips();

    chips(el.customList, s.settings.customSites, async (host) => {
      await patch({ customSites: s.settings.customSites.filter((h) => h !== host) });
    });
    chips(el.allowList, s.settings.allowlist, async (host) => {
      await patch({ allowlist: s.settings.allowlist.filter((h) => h !== host) });
    });
  }

  /* How many seconds of the page you get before the shutter drops. */
  function paintPeek() {
    if (!el.peek) return;
    const cur = Number(s.settings.peekSeconds) || PB.ECONOMY.PEEK_SECONDS;
    el.peek.innerHTML = `
      <div class="row">
        <b>ഒളിഞ്ഞുനോട്ട സമയം</b>
        <span class="val"><span data-peekv>${cur}</span> സെക്കൻഡ്</span>
      </div>
      <input type="range" data-peekr min="${PB.ECONOMY.PEEK_MIN}" max="${PB.ECONOMY.PEEK_MAX}"
             step="1" value="${cur}">
      <p class="hint">ബ്ലോക്ക് ചെയ്യുന്നതിന് മുൻപ് പേജ് ഇത്ര സെക്കൻഡ് കാണാം.</p>`;
    const r = el.peek.querySelector('[data-peekr]');
    const v = el.peek.querySelector('[data-peekv]');
    r.addEventListener('input', () => { v.textContent = r.value; });
    r.addEventListener('change', () => patch({ peekSeconds: Number(r.value) }));
  }

  const CLIP_LABELS = {
    block: 'ബ്ലോക്ക് ചെയ്യുമ്പോൾ',
    spin: 'റീൽ കറങ്ങുമ്പോൾ',
    win: 'സമ്മാനം കിട്ടുമ്പോൾ',
    bumper: 'ബമ്പർ അടിക്കുമ്പോൾ',
    lose: 'തോൽക്കുമ്പോൾ',
    police: 'പൊലീസ് റെയ്ഡ്',
    blade: 'ബ്ലേഡ് വരുമ്പോൾ',
    coin: 'കോയിൻ കിട്ടുമ്പോൾ'
  };
  const CLIP_KEY = 'pb_clips';
  const MAX_CLIP = 300 * 1024;

  const readClips = () => new Promise((res) => {
    try { chrome.storage.local.get(CLIP_KEY, (g) => res((g && g[CLIP_KEY]) || {})); }
    catch { res({}); }
  });
  const writeClips = (c) => new Promise((res) => {
    try { chrome.storage.local.set({ [CLIP_KEY]: c }, () => res()); } catch { res(); }
  });

  async function paintClips() {
    if (!el.clips) return;
    const have = await readClips();
    el.clips.innerHTML = '';
    for (const slot of PBFX.sound.SLOTS) {
      const row = document.createElement('div');
      row.className = 'clip' + (have[slot] ? ' is-set' : '');
      row.setAttribute('data-clip', slot);
      row.innerHTML = `
        <span class="clip__n"></span>
        <span class="clip__s" data-state></span>
        <button class="mini" data-pick type="button">ഫയൽ</button>
        <button class="mini" data-play type="button" ${have[slot] ? '' : 'disabled'}>▶</button>
        <button class="mini is-bad" data-clear type="button" ${have[slot] ? '' : 'disabled'}>✕</button>
        <input type="file" accept="audio/*" hidden data-file>`;
      row.querySelector('.clip__n').textContent = CLIP_LABELS[slot] || slot;
      row.querySelector('[data-state]').textContent = have[slot] ? 'സെറ്റ് ചെയ്തു' : '—';

      const file = row.querySelector('[data-file]');
      row.querySelector('[data-pick]').addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        if (f.size > MAX_CLIP) { toast(`ഫയൽ വലുതാണ് (${Math.round(f.size / 1024)}KB). 300KB വരെ മതി.`); return; }
        const b64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1] || '');
          fr.onerror = () => rej(new Error('read'));
          fr.readAsDataURL(f);
        }).catch(() => null);
        if (!b64) { toast('ഫയൽ വായിക്കാൻ പറ്റിയില്ല.'); return; }
        const next = await readClips();
        next[slot] = b64;
        await writeClips(next);
        toast('ക്ലിപ്പ് ചേർത്തു.');
        paintClips();
      });
      row.querySelector('[data-play]').addEventListener('click', () => {
        if (!PBFX.sound.playClip(slot)) toast('പ്ലേ ചെയ്യാൻ പറ്റിയില്ല.');
      });
      row.querySelector('[data-clear]').addEventListener('click', async () => {
        const next = await readClips();
        delete next[slot];
        await writeClips(next);
        toast('ക്ലിപ്പ് നീക്കി.');
        paintClips();
      });
      el.clips.append(row);
    }
  }

  function chips(host, list, onRemove) {
    host.innerHTML = '';
    for (const item of list || []) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.innerHTML = `<span></span><button title="നീക്കുക">✕</button>`;
      c.querySelector('span').textContent = item;
      c.querySelector('button').addEventListener('click', () => onRemove(item));
      host.append(c);
    }
  }

  async function patch(p) {
    await send('settings', { patch: p });
    await refresh();
    paintSettings();
  }

  function cleanHost(raw) {
    let v = String(raw || '').trim().toLowerCase();
    if (!v) return '';
    v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? v : '';
  }

  $('[data-open-settings]').addEventListener('click', () => { el.settings.hidden = false; paintSettings(); });
  $('[data-close-settings]').addEventListener('click', () => { el.settings.hidden = true; });

  $('[data-add]').addEventListener('click', async () => {
    const host = cleanHost(el.custom.value);
    if (!host) { toast('ശരിയായ ഒരു ഡൊമെയ്ൻ എഴുതൂ. ഉദാ: nptel.ac.in', 'bad'); return; }
    if (s.settings.customSites.includes(host)) { toast('അത് ലിസ്റ്റിൽ ഉണ്ട്.'); return; }
    el.custom.value = '';
    await patch({ customSites: [...s.settings.customSites, host] });
    toast(host + ' ഇനി തടയും.');
  });
  el.custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-add]').click(); });

  $('[data-allow-current]').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const host = tab && tab.url ? cleanHost(new URL(tab.url).hostname) : '';
    if (!host) { toast('ഈ ടാബ് ഒഴിവാക്കാൻ പറ്റില്ല.', 'bad'); return; }
    if (s.settings.allowlist.includes(host)) { toast('ഇത് ഇപ്പോഴേ ഒഴിവാക്കിയതാണ്.'); return; }
    await patch({ allowlist: [...s.settings.allowlist, host] });
    toast(host + ' ഇനി തടയില്ല. ഭാഗ്യവാൻ.');
  });

  let resetArmed = false;
  $('[data-reset]').addEventListener('click', async (e) => {
    if (!resetArmed) {
      resetArmed = true;
      e.target.textContent = 'ഉറപ്പാണോ? വീണ്ടും അമർത്ത്';
      setTimeout(() => { resetArmed = false; e.target.textContent = 'റീസെറ്റ് ചെയ്യ്'; }, 4000);
      return;
    }
    await send('reset');
    resetArmed = false;
    e.target.textContent = 'റീസെറ്റ് ചെയ്യ്';
    await refresh();
    paintSettings();
    newTicket();
    toast('എല്ലാം പോയി. പൂജ്യത്തിൽ നിന്ന് തുടങ്ങാം.');
  });

  el.sound.addEventListener('click', () => patch({ sound: s.settings.sound === false }));

  /* ------------------------------------------------------------------- boot */

  async function refresh() {
    const next = await send('state');
    if (next) { s = next; paint(); }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'pb:state' && !busy) { s = msg.state; paint(); }
  });

  (async () => {
    s = await send('state') || PB.publicState({});
    newTicket();
    paint();
    const last = (s.history || [])[0];
    if (last) {
      reels.rest(last.winning.split(' ')[1]);
      el.prefix.textContent = last.winning.split(' ')[0];
      el.prefix.style.opacity = '.55';
      el.serial.textContent = 'ടിക്കറ്റ് നം. ' + ticket;
      el.verdict.textContent = 'കഴിഞ്ഞ നറുക്കെടുപ്പ്: ' + last.winning;
    }
  })();
})();
