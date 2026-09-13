/* Padikkan Bumper — effects.
   Confetti is canvas; every sound is synthesised at runtime so the extension
   ships with no media files and no remote fetches. */
(function () {
  if (globalThis.PBFX) return;

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------- confetti */

  function confetti(canvas, opts = {}) {
    if (!canvas || reduced()) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = opts.colors || ['#E9B949', '#F3E7CE', '#E2402F', '#A9761B', '#FBF4E4'];
    const count = opts.count || 130;
    const originX = opts.x != null ? opts.x : w / 2;
    const originY = opts.y != null ? opts.y : h * 0.42;
    const bits = [];

    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 5 + Math.random() * 11;
      bits.push({
        x: originX + (Math.random() - 0.5) * 120,
        y: originY + (Math.random() - 0.5) * 40,
        vx: Math.cos(a) * speed * (0.6 + Math.random() * 0.8),
        vy: Math.sin(a) * speed - 5 - Math.random() * 5,
        w: 5 + Math.random() * 7,
        h: 8 + Math.random() * 12,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        color: colors[(Math.random() * colors.length) | 0],
        life: 1
      });
    }

    let raf;
    const start = performance.now();
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const b of bits) {
        b.vy += 0.34;            // gravity
        b.vx *= 0.992;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        if (t > 1500) b.life -= 0.018;
        if (b.life <= 0 || b.y > h + 60) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 1.6)));
        ctx.restore();
      }
      if (alive && t < 5200) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  /* ---------------------------------------------------------------- sound */

  let actx = null;
  let enabled = true;

  function ctx() {
    if (!actx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function tone({ freq = 440, type = 'sine', dur = 0.16, gain = 0.06, at = 0, slide = null, decay = 0.1 }) {
    const a = ctx();
    if (!a || !enabled) return;
    const t0 = a.currentTime + at;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + decay);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + decay + 0.02);
  }

  function thump(at = 0, gain = 0.12) {
    const a = ctx();
    if (!a || !enabled) return;
    const t0 = a.currentTime + at;
    const len = Math.floor(a.sampleRate * 0.22);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const filt = a.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 180;
    filt.Q.value = 1.1;
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(a.destination);
    src.start(t0);
    tone({ freq: 120, type: 'sine', dur: 0.1, gain: gain * 0.9, slide: 52, at, decay: 0.06 });
  }

  /* ------------------------------------------------------- user sound pack
     Clips the user supplied themselves, kept in chrome.storage.local as
     base64 and played through WebAudio rather than an <audio> element, so a
     host page's media-src CSP cannot silence them. */
  const CLIP_KEY = 'pb_clips';
  const SLOTS = ['block', 'spin', 'win', 'bumper', 'lose', 'police', 'blade', 'coin'];
  let clips = null;          // slot -> base64
  let buffers = {};          // slot -> decoded AudioBuffer

  /* -------------------------------------------------- bundled dialogue clips
     Five Malayalam movie dialogues ship with the extension. They are loaded
     from src/assets/ via chrome.runtime.getURL and decoded once. User clips
     in chrome.storage.local always take priority; these are the fallback. */
  const BUNDLED_ASSETS = {
    dinesha:    'src/assets/dinesha.mp3',
    pavanayi:   'src/assets/pavanayi.mp3',
    vidamatte:  'src/assets/vidamatte.mp3',
    adichumole: 'src/assets/adichumole.mp3',
    edamone:    'src/assets/edamone.mp3'
  };
  const bundledBuffers = {};   // slot -> decoded AudioBuffer
  let bundledLoading = {};     // slot -> Promise (dedup in-flight loads)

  function b64ToBytes(b64) {
    const bin = atob(String(b64).replace(/^data:[^,]*,/, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadClips() {
    if (clips) return;
    clips = {};
    try {
      chrome.storage.local.get(CLIP_KEY, (got) => {
        void chrome.runtime.lastError;
        clips = (got && got[CLIP_KEY]) || {};
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'local' && ch[CLIP_KEY]) { clips = ch[CLIP_KEY].newValue || {}; buffers = {}; }
      });
    } catch { /* no extension APIs here (tests, welcome page) */ }
  }
  try { loadClips(); } catch { /* ignore */ }

  /** Fetch and decode a bundled asset once. Returns a Promise<AudioBuffer|null>. */
  function loadBundled(slot) {
    if (bundledBuffers[slot]) return Promise.resolve(bundledBuffers[slot]);
    if (!BUNDLED_ASSETS[slot]) return Promise.resolve(null);
    if (bundledLoading[slot]) return bundledLoading[slot];
    const a = ctx();
    if (!a) return Promise.resolve(null);
    let url;
    try { url = chrome.runtime.getURL(BUNDLED_ASSETS[slot]); } catch { return Promise.resolve(null); }
    bundledLoading[slot] = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => a.decodeAudioData(ab))
      .then((buf) => { bundledBuffers[slot] = buf; return buf; })
      .catch(() => null)
      .finally(() => { delete bundledLoading[slot]; });
    return bundledLoading[slot];
  }

  /** Pre-warm all bundled clips so they play instantly when needed. */
  function preloadBundled() {
    for (const slot of Object.keys(BUNDLED_ASSETS)) loadBundled(slot);
  }
  try { if (typeof chrome !== 'undefined' && chrome.runtime) setTimeout(preloadBundled, 1500); } catch {}

  function playBuffer(buf) {
    const a = ctx();
    if (!a) return;
    const src = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = 0.85;
    src.buffer = buf;
    src.connect(g).connect(a.destination);
    src.start();
  }

  /* Returns true if a clip (user or bundled) handled this slot. */
  function playClip(slot) {
    if (!enabled) return false;
    const a = ctx();
    if (!a) return false;

    /* User clip takes priority. */
    if (clips && clips[slot]) {
      if (buffers[slot]) { playBuffer(buffers[slot]); return true; }
      try {
        const bytes = b64ToBytes(clips[slot]);
        a.decodeAudioData(bytes.buffer, (buf) => { buffers[slot] = buf; playBuffer(buf); }, () => {});
        return true;
      } catch { /* fall through to bundled */ }
    }

    /* Bundled fallback. */
    if (bundledBuffers[slot]) { playBuffer(bundledBuffers[slot]); return true; }
    if (BUNDLED_ASSETS[slot]) {
      loadBundled(slot).then((buf) => { if (buf) playBuffer(buf); });
      return true;   // optimistically — first play may be slightly delayed
    }
    return false;
  }

  const sound = {
    set enabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    SLOTS,
    BUNDLED_ASSETS,
    get allSlots() { return allSlots(); },
    hasClip(slot) { return !!(clips && clips[slot]) || !!BUNDLED_ASSETS[slot]; },
    playClip,

    coin() { if (playClip('coin')) return;
             tone({ freq: 1180, type: 'triangle', dur: 0.05, gain: 0.045 });
             tone({ freq: 1760, type: 'triangle', dur: 0.07, gain: 0.035, at: 0.05 }); },

    tick() { tone({ freq: 900, type: 'square', dur: 0.012, gain: 0.014 }); },

    spin() { if (playClip('spin')) return;
             for (let i = 0; i < 22; i++) tone({ freq: 620 + (i % 3) * 120, type: 'square', dur: 0.01, gain: 0.012, at: i * 0.055 }); },

    stamp() { thump(0, 0.14); },

    block() { if (playClip('block')) return; thump(0, 0.18);
              tone({ freq: 190, type: 'sawtooth', dur: 0.3, gain: 0.05, slide: 70, at: 0.04 }); },

    lose() { if (playClip('lose')) return;
             thump(0, 0.1);
             tone({ freq: 320, type: 'sawtooth', dur: 0.24, gain: 0.045, slide: 110, at: 0.05 }); },

    win(big) {
      if (playClip(big ? 'bumper' : 'win') || (big && playClip('win'))) return;
      const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
      notes.forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.13, gain: 0.06, at: i * 0.085 }));
      thump(0, 0.1);
      if (big) notes.forEach((f, i) => tone({ freq: f * 2, type: 'sine', dur: 0.2, gain: 0.03, at: 0.45 + i * 0.07 }));
    },

    siren() {
      if (playClip('police')) return;
      for (let i = 0; i < 4; i++) {
        tone({ freq: 720, type: 'sawtooth', dur: 0.26, gain: 0.05, slide: 1180, at: i * 0.3 });
      }
    },

    knock() { if (playClip('blade')) return;
              thump(0, 0.16); thump(0.22, 0.16); thump(0.42, 0.16); }
  };

  /* ------------------------------------------------------- dialogue clips
     No text-to-speech. A scene plays one of the user's own clips, or stays
     silent if they have not added one for it yet. */
  let dialogueOn = true;

  const voice = {
    set enabled(v) { dialogueOn = !!v; },
    get enabled() { return dialogueOn; },

    /** Which of this scene's slots actually have audio loaded. */
    ready(scene) {
      const slots = (PB.memesFor && PB.memesFor(scene)) || [];
      return slots.filter((m) => sound.hasClip(m.id));
    },

    /** Play a clip for the scene. Returns the slot used, or null if silent. */
    play(scene) {
      if (!dialogueOn || !enabled) return null;
      const usable = voice.ready(scene);
      if (!usable.length) return null;
      const slot = usable[Math.floor(Math.random() * usable.length)];
      return sound.playClip(slot.id) ? slot : null;
    },

    stop() { /* clips are fire-and-forget one-shots */ }
  };

  /* Every meme slot is a clip slot too, so they share one store. */
  function allSlots() {
    return [...SLOTS, ...((globalThis.PB && PB.MEMES) || []).map((m) => m.id)];
  }

  /* One place to apply the audio settings, so no surface forgets. */
  function applySettings(settings) {
    const on = !settings || settings.sound !== false;
    sound.enabled = on;
    voice.enabled = on && (!settings || settings.voice !== false);
  }

  globalThis.PBFX = { confetti, sound, voice, applySettings };
})();
