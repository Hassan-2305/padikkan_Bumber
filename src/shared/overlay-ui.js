/* Padikkan Bumper — the block screen.
   One component, two hosts: a shadow root injected into study pages, and the
   standalone page used when Chrome's PDF viewer swallows content scripts. */
(function () {
  if (globalThis.PBOverlay) return;

  const REEL_H = 52;
  const REEL_REPEAT = 13;

  const LAMP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2.4c1.5 1.9 1.5 3.1 0 4.2-1.5-1.1-1.5-2.3 0-4.2Z" fill="currentColor" stroke="none"/>
    <path d="M6.4 8.6h11.2l-2 2.6H8.4l-2-2.6Z"/>
    <path d="M12 11.2v6.3"/><path d="M8.6 17.5h6.8l1.8 2.4H6.8l1.8-2.4Z"/>
    <path d="M4.2 8.6h15.6"/></svg>`;

  const COIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"
      fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5.2"
      fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 2"/></svg>`;

  function ornament() {
    const rays = Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const r1 = 320, r2 = i % 3 === 0 ? 392 : 356;
      return `<line x1="${(500 + Math.cos(a) * r1).toFixed(1)}" y1="${(500 + Math.sin(a) * r1).toFixed(1)}"
        x2="${(500 + Math.cos(a) * r2).toFixed(1)}" y2="${(500 + Math.sin(a) * r2).toFixed(1)}"/>`;
    }).join('');
    return `<svg viewBox="0 0 1000 1000" fill="none" stroke="#E9B949" stroke-width="1.6" aria-hidden="true">
      <g opacity=".9">${rays}</g>
      <circle cx="500" cy="500" r="300" stroke-dasharray="3 9"/>
      <circle cx="500" cy="500" r="246"/>
      <circle cx="500" cy="500" r="180" stroke-dasharray="14 10"/>
      <path d="M500 296c34 44 34 76 0 104-34-28-34-60 0-104Z" fill="#E9B949" stroke="none" opacity=".55"/>
      <path d="M392 440h216l-40 54H432l-40-54Z"/>
      <path d="M500 494v128"/>
      <path d="M430 622h140l38 52H392l38-52Z"/>
      <path d="M340 440h320"/>
      <path d="M300 700c60 34 140 52 200 52s140-18 200-52" stroke-dasharray="6 8"/>
    </svg>`;
  }

  const SKELETON = `
    <div class="pb-scrim"></div>
    <div class="pb-ornament">${ornament()}</div>
    <canvas class="pb-fx" data-fx></canvas>
    <div class="pb-shout" data-shout aria-hidden="true"></div>
    <div class="pb-stage">
      <div class="pb-wrap" role="dialog" aria-modal="true" aria-label="പഠിക്കാൻ ബംപർ — നറുക്കെടുപ്പ്">
        <header class="pb-head">
          <span class="pb-brand">${LAMP}<span>പഠിക്കാൻ ബംപർ</span></span>
          <span class="pb-site"><i class="pb-dot"></i><span data-site></span></span>
        </header>

        <div>
          <h1 class="pb-title" data-title></h1>
          <p class="pb-sub" data-sub></p>
        </div>

        <article class="pb-ticket" data-ticket>
          <div class="pb-ticket__body">
            <div class="pb-ticket__rule">
              <span class="pb-ticket__name">ഭാഗ്യക്കുറി</span>
              <span class="pb-ticket__meta" data-serial></span>
            </div>
            <div class="pb-numbers">
              <span class="pb-prefix" data-prefix>PB</span>
              <div class="pb-reels is-idle" data-reels></div>
            </div>
            <div class="pb-ticket__foot">
              <p class="pb-verdict" data-verdict role="status" aria-live="polite"></p>
              <p class="pb-price" data-price></p>
            </div>
            <div class="pb-stamp" data-stamp></div>
            <div class="pb-scratch" data-scratch hidden>
              <canvas data-scratchc></canvas>
              <span class="pb-scratch__hint" data-scratchhint></span>
            </div>
          </div>
          <aside class="pb-ticket__stub">
            <div class="pb-stat">
              <span class="pb-stat__k">കോയിൻ</span>
              <span class="pb-stat__v">${COIN}<span data-coins>0</span></span>
              <div class="pb-coinbar"><i data-coinbar style="width:0"></i></div>
            </div>
            <div class="pb-stat">
              <span class="pb-stat__k">ടിക്കറ്റ്</span>
              <span class="pb-stat__v" data-tickets>0</span>
            </div>
            <div class="pb-stat pb-stat--debt" data-debtwrap hidden>
              <span class="pb-stat__k">ബ്ലേഡ് കടം</span>
              <span class="pb-stat__v" data-debt>0</span>
            </div>
            <div class="pb-stat pb-stat--time" data-timewrap hidden>
              <span class="pb-stat__k">ബാക്കി സമയം</span>
              <span class="pb-stat__v" data-time>0:00</span>
            </div>
          </aside>
        </article>

        <div data-slot aria-live="polite"></div>
        <div class="pb-actions" data-actions></div>

        <div class="pb-ticker"><div class="pb-ticker__track" data-ticker></div></div>
      </div>
    </div>`;

  /* ------------------------------------------------------------- messaging */

  function send(action, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action, payload }, (res) => {
          void chrome.runtime.lastError;
          resolve(res && res.ok ? res.data : null);
        });
      } catch { resolve(null); }
    });
  }

  /* ------------------------------------------------------------------ reels
     Mechanical digit wheels. Shared by the overlay and the popup. */

  function makeReels(host, { count = 6, height = REEL_H } = {}) {
    const strips = [];
    host.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const reel = document.createElement('div');
      reel.className = 'pb-reel';
      if (height !== REEL_H) reel.style.height = height + 'px';
      const strip = document.createElement('div');
      strip.className = 'pb-reel__strip';
      for (let r = 0; r < REEL_REPEAT; r++) {
        for (let d = 0; d < 10; d++) {
          const span = document.createElement('span');
          span.textContent = d;
          if (height !== REEL_H) {
            span.style.height = height + 'px';
            span.style.fontSize = Math.round(height * 0.58) + 'px';
          }
          strip.appendChild(span);
        }
      }
      reel.appendChild(strip);
      host.appendChild(reel);
      strips.push(strip);
    }

    return {
      spinTo(numberStr) {
        return new Promise((resolve) => {
          host.classList.remove('is-idle');
          const digits = String(numberStr).split('').map(Number);
          let last = 0;
          strips.forEach((strip, i) => {
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            void strip.offsetHeight;
            const loops = 5 + i;
            const dur = 1.45 + i * 0.17;
            last = Math.max(last, dur);
            strip.style.transition = `transform ${dur}s cubic-bezier(.13,.72,.16,1)`;
            strip.style.transform = `translateY(${-(loops * 10 + digits[i]) * height}px)`;
          });
          setTimeout(resolve, last * 1000 + 90);
        });
      },
      rest(numberStr) {
        host.classList.remove('is-idle');
        String(numberStr).split('').forEach((d, i) => {
          if (!strips[i]) return;
          strips[i].style.transition = 'none';
          strips[i].style.transform = `translateY(${-Number(d) * height}px)`;
        });
      },
      idle() { host.classList.add('is-idle'); }
    };
  }

  /* ------------------------------------------------------------- component */

  function create({ container, state, siteLabel, onRelease, shutter }) {
    container.classList.add('pb-root');
    container.innerHTML = SKELETON;

    const $ = (sel) => container.querySelector(sel);
    const refs = {
      site: $('[data-site]'), title: $('[data-title]'), sub: $('[data-sub]'),
      ticket: $('[data-ticket]'), serial: $('[data-serial]'), prefix: $('[data-prefix]'),
      reels: $('[data-reels]'), verdict: $('[data-verdict]'), price: $('[data-price]'),
      stamp: $('[data-stamp]'), coins: $('[data-coins]'), coinbar: $('[data-coinbar]'),
      tickets: $('[data-tickets]'), debt: $('[data-debt]'), debtWrap: $('[data-debtwrap]'),
      time: $('[data-time]'), timeWrap: $('[data-timewrap]'), slot: $('[data-slot]'),
      actions: $('[data-actions]'), ticker: $('[data-ticker]'), fx: $('[data-fx]'),
      shout: $('[data-shout]'), scratch: $('[data-scratch]'),
      scratchC: $('[data-scratchc]'), scratchHint: $('[data-scratchhint]')
    };
    const memes = !state || !state.settings || state.settings.memeMode !== false;
    if (shutter) {
      container.classList.add('pb-enter--shutter');
      setTimeout(() => PBFX.sound.block(), 120);
    }

    let s = state;
    let busy = false;
    let released = false;
    let myTicket = PB.serial();
    let timer = null;

    refs.site.textContent = siteLabel + ' · തടഞ്ഞു';
    refs.title.textContent = PB.pick(PB.COPY.gateTitles);
    refs.sub.textContent = PB.pick(PB.COPY.gateLines);
    refs.ticker.innerHTML = [...PB.COPY.ticker, ...PB.COPY.ticker]
      .map((t) => `<span>${t}</span>`).join('');

    /* reels ------------------------------------------------------------- */
    const reels = makeReels(refs.reels, { count: 6, height: REEL_H });
    const spinTo = reels.spinTo;

    /* rendering ---------------------------------------------------------- */

    function newTicketNumber() {
      myTicket = PB.serial();
      refs.serial.textContent = 'ടിക്കറ്റ് നം. ' + myTicket;
      refs.prefix.textContent = '\u00B7\u00B7';
      refs.prefix.style.opacity = '.35';
      refs.reels.classList.add('is-idle');
    }
    newTicketNumber();

    function paintStub() {
      const price = s.economy.TICKET_PRICE;
      refs.coins.textContent = s.coins;
      refs.tickets.textContent = s.tickets;
      refs.coinbar.style.width = Math.min(100, (s.coins % price) / price * 100) + '%';
      refs.debtWrap.hidden = s.debt <= 0;
      refs.debt.textContent = s.debt;
      const left = s.accessUntil - Date.now();
      refs.timeWrap.hidden = left <= 0;
      if (left > 0) refs.time.textContent = PB.clock(left);
    }

    function button(label, { kind = '', icon = '', disabled = false, onClick, key } = {}) {
      const b = document.createElement('button');
      b.className = 'pb-btn' + (kind ? ' pb-btn--' + kind : '');
      b.innerHTML = (icon || '') + `<span>${label}</span>`;
      if (disabled) b.disabled = true;
      if (key) b.dataset.key = key;
      b.addEventListener('click', onClick);
      return b;
    }

    function mineButton(kind) {
      const site = PB.EARN_SITES.find((e) => e.id === s.settings.preferredMine) || PB.EARN_SITES[0];
      return button(site.ml + ' കാണാൻ പോകാം', {
        kind,
        onClick: () => send('openMine', { id: site.id })
      });
    }

    function paintActions() {
      refs.actions.innerHTML = '';
      const price = s.economy.TICKET_PRICE;
      const hasAccess = s.accessUntil > Date.now();

      if (hasAccess) {
        refs.actions.append(
          button('പഠിക്കാൻ പോകാം', { kind: 'green', onClick: release, key: 'primary' })
        );
      } else if (s.tickets > 0) {
        refs.actions.append(
          button(`നറുക്കെടുക്ക് (${s.tickets} ടിക്കറ്റ്)`, { kind: 'gold', onClick: draw, key: 'primary' }),
          mineButton('')
        );
      } else if (s.coins >= price) {
        const many = Math.floor(s.coins / price);
        refs.actions.append(
          button(`ടിക്കറ്റ് എടുക്ക് · ${price} കോയിൻ`, { kind: 'gold', onClick: () => buy(1), key: 'primary' })
        );
        if (many >= 5) refs.actions.append(button(`5 എണ്ണം എടുക്ക്`, { onClick: () => buy(5) }));
        refs.actions.append(mineButton(''));
      } else {
        refs.actions.append(mineButton('gold'));
        refs.actions.append(button('ബ്ലേഡ് ചേട്ടനെ വിളിക്ക്', { kind: '', onClick: showBlade }));
      }

      if (!hasAccess && s.debt > 0) {
        refs.actions.append(button(`കടം ${s.debt}`, { kind: 'ghost', onClick: showBlade }));
      }
      if (!hasAccess) {
        refs.actions.append(button('അത്യാവശ്യമാണ്', {
          kind: 'ghost',
          disabled: !s.canBail,
          onClick: bail
        }));
      }

      const hint = document.createElement('p');
      hint.className = 'pb-hint';
      hint.innerHTML = hasAccess
        ? 'സമയം ഓടുന്നു'
        : `<kbd>Enter</kbd> അമർത്തിയാലും മതി`;
      refs.actions.append(hint);
    }

    function paintPrice() {
      const price = s.economy.TICKET_PRICE;
      const need = Math.max(0, price - (s.coins % price));
      refs.price.textContent = s.coins >= price
        ? `ഒരു ടിക്കറ്റ് ${price} കോയിൻ`
        : `${need} കോയിൻ കൂടി വേണം · ${Math.ceil(need * s.economy.SECONDS_PER_COIN / 60)} മിനിറ്റ് റീൽസ്`;
    }

    function paint() {
      paintStub();
      paintActions();
      paintPrice();
      if (s.accessUntil > Date.now()) {
        refs.verdict.innerHTML = '<b>പാസ് കിട്ടി.</b> ' + PB.pick(PB.COPY.grantedLines);
        refs.ticket.classList.add('is-win');
      }
    }

    /* actions ------------------------------------------------------------ */

    function toast(node) {
      refs.slot.innerHTML = '';
      refs.slot.append(node);
    }

    function resultPanel({ icon, title, note, tone }) {
      const el = document.createElement('div');
      el.className = 'pb-result' + (tone ? ' is-' + tone : '');
      el.innerHTML = `<div class="pb-result__sigil">${icon}</div>
        <div><p class="pb-result__title"></p><p class="pb-result__note"></p></div>`;
      el.querySelector('.pb-result__title').textContent = title;
      el.querySelector('.pb-result__note').textContent = note;
      return el;
    }

    async function buy(n) {
      if (busy) return;
      busy = true;
      const r = await send('buy', { count: n });
      busy = false;
      if (!r) return;
      if (!r.ok) {
        toast(resultPanel({ icon: '🚫', title: 'നടക്കില്ല', note: r.message, tone: 'police' }));
        PBFX.sound.lose();
        return;
      }
      PBFX.sound.coin();
      newTicketNumber();
      toast(resultPanel({
        icon: '🎟️',
        title: n > 1 ? `${n} ടിക്കറ്റ് എടുത്തു` : 'ടിക്കറ്റ് എടുത്തു',
        note: 'ഭാഗ്യം പരീക്ഷിക്കാം. അധികം പ്രതീക്ഷ വേണ്ട.'
      }));
      s = await send('state') || s;
      paint();
    }

    /* Big shouted reaction across the screen — the loud bit. */
    function shout(text, tone) {
      if (!memes || !refs.shout) return;
      refs.shout.textContent = text;
      refs.shout.className = 'pb-shout is-on' + (tone ? ' is-' + tone : '');
      setTimeout(() => { refs.shout.className = 'pb-shout'; }, 1500);
    }

    /* Scratch card. Returns a promise that settles when enough is scraped off
       (or immediately, if there is no 2d context to draw on). */
    function scratchReveal() {
      return new Promise((resolve) => {
        const wrap = refs.scratch, cv = refs.scratchC;
        const ctx = cv && cv.getContext && cv.getContext('2d');
        if (!wrap || !ctx || (s.settings && s.settings.scratch === false)) return resolve('auto');

        const box = refs.ticket.getBoundingClientRect();
        const w = Math.max(200, Math.round(box.width)), h = Math.max(120, Math.round(box.height));
        cv.width = w; cv.height = h;
        cv.style.width = w + 'px'; cv.style.height = h + 'px';
        wrap.hidden = false;

        // the silver panel
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#6E6A63'); g.addColorStop(0.5, '#A9A49A'); g.addColorStop(1, '#6E6A63');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.16; ctx.fillStyle = '#150A0D';
        for (let i = 0; i < 900; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        ctx.globalAlpha = 1;
        refs.scratchHint.textContent = PB.COPY.scratch.hint;

        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 34; ctx.lineCap = ctx.lineJoin = 'round';

        let down = false, last = null, cleared = 0, done = false;
        const at = (e) => {
          const r = cv.getBoundingClientRect();
          const t = (e.touches && e.touches[0]) || e;
          return { x: (t.clientX - r.left) * (w / r.width), y: (t.clientY - r.top) * (h / r.height) };
        };
        const draw = (pt) => {
          ctx.beginPath();
          if (last) { ctx.moveTo(last.x, last.y); ctx.lineTo(pt.x, pt.y); ctx.stroke(); }
          else { ctx.arc(pt.x, pt.y, 17, 0, 7); ctx.fill(); }
          last = pt;
          cleared += 1;
          if (cleared === 3) PBFX.sound.tick();
          if (cleared % 14 === 0) PBFX.sound.tick();
          if (cleared > 26 && !done) finish();
        };
        function finish() {
          done = true;
          refs.scratchHint.textContent = PB.COPY.scratch.hintDone;
          wrap.classList.add('is-going');
          setTimeout(() => { wrap.hidden = true; wrap.classList.remove('is-going'); }, 320);
          resolve('scratched');
        }
        cv.addEventListener('pointerdown', (e) => { down = true; last = null; draw(at(e)); });
        cv.addEventListener('pointermove', (e) => { if (down) draw(at(e)); });
        cv.addEventListener('pointerup', () => { down = false; last = null; });
        cv.addEventListener('pointerleave', () => { down = false; last = null; });
        cv.addEventListener('mousedown', (e) => { down = true; last = null; draw(at(e)); });
        cv.addEventListener('mousemove', (e) => { if (down) draw(at(e)); });
        cv.addEventListener('mouseup', () => { down = false; last = null; });
        // never trap anyone behind a card they cannot scratch
        setTimeout(() => { if (!done) finish(); }, 12000);
      });
    }

    async function draw() {
      if (busy) return;
      busy = true;
      refs.actions.querySelectorAll('button').forEach((b) => (b.disabled = true));
      refs.stamp.classList.remove('is-on');
      refs.ticket.classList.remove('is-loss', 'is-win');
      refs.slot.innerHTML = '';
      if (refs.reels.classList.contains('is-idle') === false) newTicketNumber();
      refs.ticket.classList.add('is-spinning');
      refs.verdict.textContent = 'നറുക്കെടുപ്പ് നടക്കുന്നു…';
      PBFX.sound.spin();

      const r = await send('play', { serial: myTicket });
      if (!r || !r.ok) {
        refs.ticket.classList.remove('is-spinning');
        busy = false;
        if (r && r.message) toast(resultPanel({ icon: '🚫', title: 'നടക്കില്ല', note: r.message, tone: 'police' }));
        paint();
        return;
      }

      const [winPre, winNum] = r.numbers.winning.split(' ');

      // Foil goes up first, so the draw happens *behind* it and you have to
      // scratch to find out. If there is no canvas the foil resolves instantly.
      const scratched = scratchReveal();
      const spinning = spinTo(winNum);
      await Promise.all([spinning, scratched]);

      refs.prefix.textContent = winPre;
      refs.prefix.style.opacity = '1';
      refs.ticket.classList.remove('is-spinning');
      s = r.state;
      busy = false;

      const p = r.prize;
      if (r.won) {
        refs.stamp.textContent = 'അടിച്ചു!';
        refs.stamp.classList.add('is-win', 'is-on');
        refs.ticket.classList.add('is-win');
        refs.verdict.innerHTML = `<b>${p.ml}</b> — ${p.seconds} സെക്കൻഡ് പഠിക്കാം`;
        PBFX.sound.win(p.id === 'bumper' || p.id === 'first');
        PBFX.confetti(refs.fx, { count: p.id === 'bumper' ? 260 : 150, y: innerHeight * 0.38 });
        shout(p.id === 'bumper' ? PB.pick(PB.COPY.bumperLines) : PB.pick(PB.COPY.grantedLines), 'win');
        if (p.id === 'bumper') refs.ticket.classList.add('is-bumper');
        toast(resultPanel({
          icon: p.id === 'bumper' ? '🏆' : '✅',
          title: p.ml,
          note: p.note + (p.coins ? ` +${p.coins} കോയിൻ.` : ''),
          tone: 'win'
        }));
        startTimer();
      } else if (p.id === 'police') {
        refs.stamp.classList.remove('is-win');
        refs.stamp.textContent = 'റെയ്ഡ്';
        refs.stamp.classList.add('is-on');
        refs.ticket.classList.add('is-loss');
        refs.verdict.innerHTML = `<b>അയ്യോ പൊലീസ്!</b> ${r.seized} കോയിൻ പിടിച്ചു`;
        PBFX.sound.siren();
        shout(PB.pick(PB.COPY.policeLines), 'bad');
        toast(resultPanel({ icon: '🚨', title: 'അയ്യോ പൊലീസ്!', note: p.note, tone: 'police' }));
      } else {
        refs.stamp.classList.remove('is-win');
        refs.stamp.textContent = 'സമ്മാനമില്ല';
        refs.stamp.classList.add('is-on');
        refs.ticket.classList.add('is-loss');
        const near = r.numbers.missBy === 1;
        const nearLine = PB.pick(PB.COPY.nearMiss);
        refs.verdict.innerHTML = near
          ? `<b>${nearLine}</b> നിന്റെ നമ്പർ ${r.numbers.drawn}`
          : `നിന്റെ നമ്പർ ${r.numbers.drawn}. ഒത്തില്ല.`;
        PBFX.sound.lose();
        if (near) shout(nearLine, 'bad');
        toast(resultPanel({ icon: '🙃', title: PB.pick(PB.COPY.lose), note: p.note }));
      }
      PBFX.sound.stamp();
      paint();
      refs.actions.querySelector('[data-key="primary"]')?.focus();
    }

    function showBlade() {
      const el = document.createElement('div');
      el.className = 'pb-blade';
      const canBorrow = s.loans < s.economy.BLADE_MAX_LOANS;
      el.innerHTML = `
        <div class="pb-blade__icon">🔪</div>
        <div class="pb-blade__body">
          <h3>${PB.pick(PB.COPY.bladeLines)}</h3>
          <p>${s.economy.BLADE_PRINCIPAL} കോയിൻ ഇപ്പോൾ. തിരിച്ച്
             ${Math.round(s.economy.BLADE_PRINCIPAL * s.economy.BLADE_UPFRONT)} കോയിൻ.
             പലിശ മണിക്കൂറിൽ ${s.economy.BLADE_HOURLY_RATE * 100}%. കടമുള്ളപ്പോൾ
             സമ്പാദിക്കുന്നതിന്റെ പകുതി ചേട്ടൻ എടുക്കും.</p>
          ${s.debt > 0 ? `<p class="pb-blade__debt">${s.debt} കോയിൻ കടം</p>` : ''}
          <div class="pb-blade__row"></div>
        </div>`;
      const row = el.querySelector('.pb-blade__row');
      row.append(button(canBorrow ? `${s.economy.BLADE_PRINCIPAL} കോയിൻ വാങ്ങ്` : 'ഇനി കടം കിട്ടില്ല', {
        kind: 'red',
        disabled: !canBorrow,
        onClick: async () => {
          const r = await send('borrow');
          if (r && r.ok) { PBFX.sound.knock(); s = await send('state') || s; paint(); showBlade(); }
          else if (r) toast(resultPanel({ icon: '🔪', title: 'ചേട്ടൻ സമ്മതിച്ചില്ല', note: r.message, tone: 'police' }));
        }
      }));
      if (s.debt > 0 && s.coins > 0) {
        row.append(button(`${Math.min(s.coins, s.debt)} അടയ്ക്ക്`, {
          onClick: async () => {
            const r = await send('repay', { amount: Math.min(s.coins, s.debt) });
            if (r && r.ok) { PBFX.sound.coin(); s = await send('state') || s; paint(); showBlade(); }
          }
        }));
      }
      row.append(button('വേണ്ട', { kind: 'ghost', onClick: () => (refs.slot.innerHTML = '') }));
      toast(el);
    }

    async function bail() {
      const r = await send('bail');
      if (!r) return;
      if (!r.ok) {
        toast(resultPanel({ icon: '⌛', title: 'ഇപ്പോൾ പറ്റില്ല', note: r.message, tone: 'police' }));
        return;
      }
      PBFX.sound.knock();
      s = await send('state') || s;
      toast(resultPanel({
        icon: '🤝',
        title: '90 സെക്കൻഡ് ജാമ്യം',
        note: `ബ്ലേഡ് ചേട്ടൻ ${s.economy.BAIL_DEBT} കോയിൻ കണക്കിൽ എഴുതി. വേഗം തീർക്ക്.`,
        tone: 'win'
      }));
      paint();
      startTimer();
    }

    function release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      onRelease && onRelease();
    }

    function startTimer() {
      clearInterval(timer);
      timer = setInterval(() => {
        const left = s.accessUntil - Date.now();
        if (left <= 0) { clearInterval(timer); return; }
        refs.timeWrap.hidden = false;
        refs.time.textContent = PB.clock(left);
      }, 250);
    }

    /* keyboard ----------------------------------------------------------- */
    const onKey = (e) => {
      if (e.key === 'Enter' && !busy) {
        const b = refs.actions.querySelector('[data-key="primary"]');
        if (b && !b.disabled) { e.preventDefault(); e.stopPropagation(); b.click(); }
      }
    };
    container.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey, true);

    paint();
    if (s.accessUntil > Date.now()) startTimer();
    setTimeout(() => refs.actions.querySelector('[data-key="primary"]')?.focus(), 700);

    return {
      update(next) {
        s = next;
        paint();
        if (s.accessUntil > Date.now() && !timer) startTimer();
      },
      get state() { return s; },
      destroy() {
        clearInterval(timer);
        document.removeEventListener('keydown', onKey, true);
      }
    };
  }

  /* ------------------------------------------- floating pass (study pages) */

  function pass({ container, state, onExpire }) {
    container.classList.add('pb-root');
    container.style.cssText = 'position:fixed;inset:auto;z-index:2147483647;';
    const chip = document.createElement('div');
    chip.className = 'pb-pass';
    chip.innerHTML = `<span class="pb-pass__ml">പഠിക്കാൻ ബാക്കി</span><span class="pb-pass__t"></span>`;
    container.appendChild(chip);
    const t = chip.querySelector('.pb-pass__t');
    let s = state;
    const id = setInterval(tick, 250);
    function tick() {
      const left = s.accessUntil - Date.now();
      if (left <= 0) { clearInterval(id); onExpire && onExpire(); return; }
      t.textContent = PB.clock(left);
      chip.classList.toggle('is-low', left < 60000);
    }
    tick();
    return {
      update(next) { s = next; tick(); },
      destroy() { clearInterval(id); }
    };
  }

  /* The few seconds of grace before the shutter drops. A corner card with a
     draining ring, so you can see what you opened and brace yourself. */
  function peek({ container, seconds, siteLabel, onSkip, onEnd }) {
    container.classList.add('pb-root', 'pb-peekwrap');
    const R = 20, C = 2 * Math.PI * R;
    container.innerHTML = `
      <div class="pb-peek" data-peek role="status" aria-live="polite">
        <div class="pb-peek__ring">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="${R}" class="pb-peek__trk"></circle>
            <circle cx="24" cy="24" r="${R}" class="pb-peek__arc" data-arc
                    stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"></circle>
          </svg>
          <b data-n>${seconds}</b>
        </div>
        <div class="pb-peek__txt">
          <strong data-line>${PB.COPY.peekTitle}</strong>
          <span data-site></span>
        </div>
        <button class="pb-peek__x" data-skip type="button">ഇപ്പോ അടച്ചോ</button>
      </div>`;

    const $ = (q) => container.querySelector(q);
    $('[data-site]').textContent = siteLabel || '';
    const arc = $('[data-arc]'), num = $('[data-n]'), line = $('[data-line]');
    const box = $('[data-peek]');
    const total = seconds * 1000;
    const started = Date.now();
    let lastShown = seconds;

    PBFX.sound.tick();
    const tick = setInterval(() => {
      const left = Math.max(0, total - (Date.now() - started));
      const n = Math.ceil(left / 1000);
      arc.setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
      if (n !== lastShown) {
        lastShown = n;
        num.textContent = n;
        box.classList.remove('is-beat');
        void box.offsetHeight;
        box.classList.add('is-beat');
        PBFX.sound.tick();
        if (n <= 2) line.textContent = PB.pick(PB.COPY.peekLines);
      }
      if (left <= 0) { clearInterval(tick); onEnd && onEnd(); }
    }, 100);

    $('[data-skip]').addEventListener('click', () => { clearInterval(tick); onSkip && onSkip(); });

    return {
      destroy() { clearInterval(tick); container.innerHTML = ''; container.className = ''; }
    };
  }

  globalThis.PBOverlay = { create, pass, peek, send, makeReels, ornament, LAMP, COIN };
})();
