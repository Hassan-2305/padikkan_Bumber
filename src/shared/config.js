/* Padikkan Bumper — shared config.
   Loaded as a classic script by content scripts, the service worker and
   extension pages. Guarded so double-injection is harmless. */
(function () {
  if (globalThis.PB) return;

  const ECONOMY = {
    TICKET_PRICE: 20,          // coins per lottery ticket
    SECONDS_PER_COIN: 10,      // reels/shorts watch time -> 1 coin
    IDLE_TIMEOUT: 25,          // seconds of no interaction before earning pauses
    BLADE_PRINCIPAL: 100,      // coins handed over per loan
    BLADE_UPFRONT: 1.5,        // you owe 150 for 100
    BLADE_HOURLY_RATE: 0.05,   // 5% compounding, per hour
    BLADE_GARNISH: 0.5,        // share of earnings seized while in debt
    BLADE_PANIC_AT: 400,       // debt level where Blade starts showing up
    BLADE_MAX_LOANS: 5,
    BAIL_SECONDS: 25,          // emergency access, when you really do need the page
    BAIL_DEBT: 150,            // ...charged straight to Blade
    BAIL_COOLDOWN: 3600e3,     // once an hour
    PEEK_SECONDS: 3,           // you get to see the page before the shutter drops
    PEEK_MIN: 1,
    PEEK_MAX: 15
  };

  // Rigged on purpose. Sums to 1.
  const PRIZES = [
    { id: 'bumper',      p: 0.005, seconds: 30, coins: 200, ml: 'ബമ്പർ അടിച്ചു!!',   en: 'Bumper prize', note: 'മുപ്പത് സെക്കൻഡ്. ഇത് ചരിത്രമാണ്.' },
    { id: 'first',       p: 0.020, seconds: 20, coins: 40,  ml: 'ഒന്നാം സമ്മാനം',     en: 'First prize',  note: 'ഇരുപത് സെക്കൻഡ്. ശ്വാസം വിടാതെ വായിക്ക്.' },
    { id: 'second',      p: 0.050, seconds: 12, coins: 0,   ml: 'രണ്ടാം സമ്മാനം',     en: 'Second prize', note: 'പന്ത്രണ്ട് സെക്കൻഡ്. ഒരു ഖണ്ഡിക.' },
    { id: 'consolation', p: 0.100, seconds: 8,  coins: 0,   ml: 'സാന്ത്വന സമ്മാനം',   en: 'Consolation',  note: 'എട്ട് സെക്കൻഡ്. ഒരു തലക്കെട്ട് വായിക്ക്.' },
    { id: 'police',      p: 0.030, seconds: 0,  coins: 0,   ml: 'അയ്യോ പൊലീസ്!',      en: 'Raided',       note: 'നറുക്കെടുപ്പ് റെയ്ഡ്. കോയിൻ പോയി.' },
    { id: 'blank',       p: 0.795, seconds: 0,  coins: 0,   ml: 'ഒന്നും കിട്ടിയില്ല',  en: 'No prize',     note: 'പതിവുപോലെ.' }
  ];

  /* ---------------------------------------------------------------- sites */
  const CATEGORIES = {
    ai: {
      ml: 'എ.ഐ. സഹായം',
      en: 'AI helpers',
      hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com', 'claude.ai', 'gemini.google.com',
              'bard.google.com', 'perplexity.ai', 'copilot.microsoft.com', 'poe.com',
              'huggingface.co', 'deepseek.com', 'grok.com', 'mistral.ai']
    },
    research: {
      ml: 'റിസർച്ച്',
      en: 'Papers & research',
      hosts: ['arxiv.org', 'scholar.google.com', 'researchgate.net', 'sciencedirect.com',
              'springer.com', 'ieee.org', 'ieeexplore.ieee.org', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov',
              'semanticscholar.org', 'ssrn.com', 'nature.com', 'acm.org', 'biorxiv.org']
    },
    courses: {
      ml: 'ഓൺലൈൻ ക്ലാസ്',
      en: 'Courses & MOOCs',
      hosts: ['nptel.ac.in', 'swayam.gov.in', 'coursera.org', 'udemy.com', 'edx.org',
              'khanacademy.org', 'brilliant.org', 'unacademy.com', 'byjus.com',
              'physicswallah.live', 'pw.live', 'vedantu.com', 'testbook.com']
    },
    coding: {
      ml: 'കോഡിങ്',
      en: 'Coding & docs',
      hosts: ['leetcode.com', 'geeksforgeeks.org', 'stackoverflow.com', 'w3schools.com',
              'hackerrank.com', 'codeforces.com', 'developer.mozilla.org', 'devdocs.io',
              'freecodecamp.org', 'codechef.com', 'exercism.org']
    },
    notes: {
      ml: 'നോട്ട്‌സ്',
      en: 'Notes & documents',
      hosts: ['notion.so', 'notion.site', 'docs.google.com', 'classroom.google.com',
              'obsidian.md', 'evernote.com', 'onenote.com', 'overleaf.com',
              'quizlet.com', 'anki.web.app', 'ankiweb.net', 'zotero.org', 'mendeley.com']
    },
    college: {
      ml: 'കോളേജ് പോർട്ടൽ',
      en: 'College portals',
      hosts: ['ktu.edu.in', 'app.ktu.edu.in', 'cusat.ac.in', 'mgu.ac.in', 'keralauniversity.ac.in',
              'universityofcalicut.info', 'kannuruniversity.ac.in', 'dhesheKerala.gov.in',
              'moodle.org', 'blackboard.com', 'canvaslms.com', 'instructure.com']
    },
    reference: {
      ml: 'റഫറൻസ്',
      en: 'Reference',
      hosts: ['wikipedia.org', 'wikibooks.org', 'britannica.com', 'wolframalpha.com',
              'symbolab.com', 'desmos.com', 'chemspider.com']
    }
  };

  // Suffix patterns — any academic domain, plus raw PDFs.
  const HOST_PATTERNS = [
    /(^|\.)ac\.in$/i, /(^|\.)edu$/i, /(^|\.)edu\.in$/i, /(^|\.)ac\.uk$/i,
    /(^|\.)edu\.au$/i, /(^|\.)ac\.jp$/i, /(^|\.)res\.in$/i
  ];

  const EARN_SITES = [
    { id: 'instagram', ml: 'ഇൻസ്റ്റ റീൽസ്', en: 'Instagram Reels', url: 'https://www.instagram.com/reels/',
      host: 'instagram.com', paths: ['/reels', '/reel/'] },
    { id: 'youtube', ml: 'യൂട്യൂബ് ഷോർട്സ്', en: 'YouTube Shorts', url: 'https://www.youtube.com/shorts/',
      host: 'youtube.com', paths: ['/shorts'] }
  ];

  /* ----------------------------------------------------------------- copy */
  const COPY = {
    gateTitles: [
      'പഠിക്കണോ മോനേ?',
      'ദേ… വീണ്ടും പഠിക്കാൻ വന്നോ?',
      'അയ്യോ! ഈ നേരത്ത് പഠിത്തമോ?',
      'നിർത്ത്. ഒരു ചോദ്യം ഉണ്ട്.',
      'ആഹാ… പഠിപ്പിസ്റ്റ് വന്നിരിക്കുന്നു.',
      'ഈ ധൈര്യം എവിടുന്ന് കിട്ടി?',
      'ഇവിടെ ഒരു ചടങ്ങുണ്ട്, മോനേ.',
      'പഠിക്കാൻ പെർമിഷൻ എടുത്തിട്ടുണ്ടോ?'
    ],
    gateLines: [
      'ഇവിടെ പഠിത്തം ഫ്രീ അല്ല. ടിക്കറ്റ് എടുക്ക്.',
      'ഭാഗ്യം ഉണ്ടേൽ പഠിക്കാം. ഇല്ലേൽ റീൽസ്.',
      'നറുക്കെടുപ്പ് കഴിഞ്ഞിട്ട് ബാക്കി കാര്യം.',
      'ഒരു ടിക്കറ്റ്, ഒരു അവസരം, ഒരു ചെറിയ പ്രതീക്ഷ.',
      'സിലബസ് അവിടെ നിൽക്കട്ടെ. ആദ്യം ലോട്ടറി.',
      'പഠിക്കാനുള്ള അവകാശം ഇവിടെ നറുക്കിട്ടാണ് കൊടുക്കുന്നത്.'
    ],
    // shown during the peek, before the shutter drops
    peekLines: [
      'നോക്കിക്കോ… നോക്കിക്കോ…',
      'ദേ, ഇപ്പോ അടയ്ക്കും.',
      'അവസാനത്തെ കാഴ്ചയാണ്, മോനേ.',
      'ഒരു നിമിഷം. ആസ്വദിച്ചോ.',
      'ഫോട്ടോ എടുത്തോ, വേണേൽ.',
      'ഇത്രയേ ഉള്ളൂ ഫ്രീയായിട്ട്.'
    ],
    peekTitle: 'ഇപ്പോ അടയ്ക്കും…',
    scratch: {
      hint: 'ചുരണ്ടി നോക്ക് 👆',
      hintDone: 'ദേ വരുന്നു…',
      cover: 'ഇവിടെ ചുരണ്ടുക'
    },
    ticker: [
      'റീൽസ് കണ്ടാൽ കോയിൻ',
      'കോയിൻ കൊടുത്താൽ ടിക്കറ്റ്',
      'ടിക്കറ്റ് എടുത്താൽ ഭാഗ്യപരീക്ഷണം',
      'ഭാഗ്യം ഉണ്ടേൽ പഠിക്കാം',
      'സാധാരണ ഭാഗ്യം ഉണ്ടാകാറില്ല',
      'ബ്ലേഡ് ചേട്ടൻ എപ്പോഴും റെഡി',
      'നറുക്കെടുപ്പ് ദിവസവും നടക്കും'
    ],
    lose: [
      'ഡാ മോനേ… ഒന്നും കിട്ടിയില്ല.',
      'ഈ ടിക്കറ്റ് വെറുതെയായി.',
      'അടുത്ത തവണ. അല്ലെങ്കിൽ അതിനടുത്ത തവണ.',
      'ഭാഗ്യദേവത ഇന്ന് ലീവാണ്.',
      'നമ്പർ മാറിപ്പോയി. ജീവിതവും.',
      'ഇതിലും ഭേദം ഉറങ്ങുന്നതായിരുന്നു.',
      'സാരമില്ല. ആർക്കും കിട്ടാറില്ല.',
      'ഒന്നൂടെ റീൽസ് കാണ്. അതാണ് നിന്റെ വിധി.',
      'പഠിത്തം ഇന്ന് നിനക്കുള്ളതല്ല.',
      'ദൈവം പോലും ചിരിക്കുന്നുണ്ടാകും.'
    ],
    nearMiss: [
      'ഒരു അക്കം കൊണ്ട് പോയി!',
      'അയ്യോ! ഒറ്റ അക്കം!',
      'ഇത്രയും അടുത്ത് വന്നിട്ട്…',
      'ഒരു അക്കം. ഒരേ ഒരു അക്കം.'
    ],
    grantedLines: [
      'പോയി പഠിക്ക്! വേഗം!',
      'സമയം ഓടുന്നുണ്ട്, മോനേ!',
      'ഇനി ഒരു സെക്കൻഡ് പോലും കളയരുത്!',
      'ഓട്! പുസ്തകം തുറക്ക്!',
      'ഭാഗ്യം അടിച്ചു. ഇനി വേഗം!'
    ],
    lastSeconds: [
      'സമയം തീരാറായി!',
      'വേഗം! വേഗം!',
      'ദേ അടയ്ക്കാൻ പോകുന്നു!'
    ],
    expired: [
      'സമയം കഴിഞ്ഞു മോനേ',
      'അത്രേ ഉള്ളൂ. വീണ്ടും ടിക്കറ്റ്.',
      'തീർന്നു. ഇനി റീൽസിലേക്ക്.'
    ],
    brokeLines: [
      'കയ്യിൽ കാശില്ല, പഠിക്കാൻ പൂതിയും.',
      'ഒരു കോയിൻ പോലുമില്ല. നാണക്കേട്.',
      'പോയി റീൽസ് കാണ്. അതാണ് ജോലി.',
      'സമ്പാദിക്ക് ആദ്യം. പഠിത്തം പിന്നെ.'
    ],
    earnNudges: [
      'റീൽസ് കണ്ട് കോയിൻ നേടടെ',
      'സ്ക്രോൾ ചെയ്യ്. അതാണ് അധ്വാനം.',
      'ഇതാണ് നിന്റെ ജോലി. ആസ്വദിക്ക്.',
      'ഒരു റീൽ കൂടി. ഒരു കോയിൻ കൂടി.',
      'അധ്വാനിക്കുന്നവരേ, സ്ക്രോൾ ചെയ്യുവിൻ.'
    ],
    bladeLines: [
      'ബ്ലേഡ് വന്നിരിക്കുന്നു.',
      'കാശ് എവിടെ? ചോദിക്കാൻ വന്നതാ.',
      'പലിശ കൂടിക്കൊണ്ടിരിക്കുവാ, മോനേ.',
      'ഞാൻ ക്ഷമിക്കുന്നത് ഒരു പരിധി വരെ.',
      'അടുത്ത ആഴ്ച ഞാൻ വീട്ടിൽ വരും.',
      'കണക്ക് തീർക്കണം. ഇന്ന് തന്നെ.'
    ],
    policeLines: [
      'അയ്യോ പൊലീസ്!',
      'റെയ്ഡ്! ഓട്!',
      'നറുക്കെടുപ്പ് നിയമവിരുദ്ധമാണ് പോലും.'
    ],
    // shouted over a bumper win
    bumperLines: [
      'ബമ്പർ! ബമ്പർ! ബമ്പർ!',
      'നാട് മുഴുവൻ അറിയട്ടെ!',
      'ഇത് വിശ്വസിക്കാൻ പറ്റുന്നില്ല!'
    ],
    buttons: {
      draw: 'നറുക്കെടുക്ക്',
      buy: 'ടിക്കറ്റ് എടുക്ക്',
      mine: 'റീൽസ് കാണാൻ പോ',
      blade: 'ബ്ലേഡിനെ വിളിക്ക്',
      release: 'പഠിക്കാൻ പോകാം',
      again: 'ഒന്നൂടെ',
      bail: 'ജാമ്യം എടുക്ക്'
    }
  };


  const SERIAL_LETTERS = ['PB', 'KL', 'ML', 'BM', 'TC'];

  globalThis.PB = {
    ECONOMY, PRIZES, CATEGORIES, HOST_PATTERNS, EARN_SITES, COPY, SERIAL_LETTERS,

    /** Pick a random element. */
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    /** Format ms as m:ss (or h:mm:ss). */
    clock(ms) {
      if (ms < 0) ms = 0;
      const t = Math.ceil(ms / 1000);
      const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
      const pad = (n) => String(n).padStart(2, '0');
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    },

    /** A believable Kerala-lottery style serial: "PB 428135". */
    serial() {
      const l = this.SERIAL_LETTERS[Math.floor(Math.random() * this.SERIAL_LETTERS.length)];
      return l + ' ' + String(Math.floor(100000 + Math.random() * 899999));
    },

    /** Project stored state into the shape every UI reads. */
    publicState(s) {
      const st = s || {};
      return {
        coins: st.coins || 0,
        tickets: st.tickets || 0,
        accessUntil: st.accessUntil || 0,
        accessPrize: st.accessPrize || null,
        debt: st.debt || 0,
        loans: st.loans || 0,
        canBail: Date.now() - (st.lastBailAt || 0) > ECONOMY.BAIL_COOLDOWN,
        nextCoinIn: Math.max(0, ECONOMY.SECONDS_PER_COIN - ((st.watchBuffer || 0) % ECONOMY.SECONDS_PER_COIN)),
        stats: st.stats || {},
        history: (st.history || []).slice(0, 12),
        settings: st.settings || {},
        economy: ECONOMY
      };
    },

    /** Is this hostname/path something the user should be punished for? */
    isStudyUrl(rawUrl, settings) {
      let u;
      try { u = new URL(rawUrl); } catch { return false; }
      if (!/^https?:|^file:/.test(u.protocol)) return false;

      const host = u.hostname.replace(/^www\./, '');
      const s = settings || {};
      const off = s.disabledCategories || [];
      const allow = s.allowlist || [];
      const custom = s.customSites || [];

      const hostMatches = (h, needle) => h === needle || h.endsWith('.' + needle);

      if (allow.some((a) => hostMatches(host, a))) return false;
      // Never block the coin mines.
      if (EARN_SITES.some((e) => hostMatches(host, e.host))) return false;

      if (custom.some((c) => hostMatches(host, c))) return true;

      if (s.blockPdfs !== false && /\.pdf($|\?|#)/i.test(u.pathname + u.search)) return true;

      for (const [key, cat] of Object.entries(CATEGORIES)) {
        if (off.includes(key)) continue;
        if (cat.hosts.some((h) => hostMatches(host, h))) return true;
      }

      if (s.blockAcademicTlds !== false && HOST_PATTERNS.some((re) => re.test(host))) return true;

      return false;
    },

    /** Which coin-mine, if any, is this URL? */
    earnSiteFor(rawUrl) {
      let u;
      try { u = new URL(rawUrl); } catch { return null; }
      const host = u.hostname.replace(/^www\./, '');
      for (const site of EARN_SITES) {
        if (host === site.host || host.endsWith('.' + site.host)) {
          if (site.paths.some((p) => u.pathname.startsWith(p))) return site;
        }
      }
      return null;
    },

    /** Human label for a blocked host. */
    siteLabel(rawUrl) {
      try {
        const u = new URL(rawUrl);
        if (/\.pdf($|\?|#)/i.test(u.pathname)) return u.pathname.split('/').pop().slice(0, 42);
        return u.hostname.replace(/^www\./, '');
      } catch { return 'this page'; }
    }
  };
})();
