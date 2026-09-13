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
    BAIL_SECONDS: 90,          // emergency access, when you really do need the page
    BAIL_DEBT: 150,            // ...charged straight to Blade
    BAIL_COOLDOWN: 3600e3      // once an hour
  };

  // Rigged on purpose. Sums to 1.
  const PRIZES = [
    { id: 'bumper',      p: 0.005, minutes: 60, coins: 200, ml: 'ബമ്പർ അടിച്ചു!!',      en: 'Bumper prize',      note: 'ഒരിക്കൽ മാത്രം. ജീവിതത്തിൽ.' },
    { id: 'first',       p: 0.020, minutes: 25, coins: 40,  ml: 'ഒന്നാം സമ്മാനം',        en: 'First prize',       note: 'അധികം അഹങ്കരിക്കണ്ട.' },
    { id: 'second',      p: 0.050, minutes: 10, coins: 0,   ml: 'രണ്ടാം സമ്മാനം',        en: 'Second prize',      note: 'പത്ത് മിനിറ്റ്. ഓടിക്കോ.' },
    { id: 'consolation', p: 0.100, minutes: 3,  coins: 0,   ml: 'സാന്ത്വന സമ്മാനം',      en: 'Consolation',       note: 'മൂന്ന് മിനിറ്റ്. ഒരു പേജ് വായിക്ക്.' },
    { id: 'police',      p: 0.030, minutes: 0,  coins: 0,   ml: 'അയ്യോ പൊലീസ്!',          en: 'Raided',            note: 'നറുക്കെടുപ്പ് റെയ്ഡ്. കോയിൻ പോയി.' },
    { id: 'blank',       p: 0.795, minutes: 0,  coins: 0,   ml: 'ഒന്നും കിട്ടിയില്ല',      en: 'No prize',          note: 'പതിവുപോലെ.' }
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
      'ഇന്ന് പഠിക്കാൻ ഭാഗ്യമുണ്ടോ?',
      'അയ്യോ, ഇത് പഠിപ്പിന്റെ സൈറ്റ് ആണല്ലോ',
      'ഒരു മിനിറ്റ്. ടിക്കറ്റ് എവിടെ?'
    ],
    gateLines: [
      'ഭാഗ്യം ഉണ്ടെങ്കിൽ പഠിക്കാം. ഇല്ലെങ്കിൽ റീൽസ്.',
      'പഠിപ്പ് ഒരു ഭാഗ്യമാണ് മോനേ. അത് വാങ്ങിക്കണം.',
      'സെമസ്റ്റർ ഇങ്ങെത്തി. ടിക്കറ്റ് ഇനിയും എടുത്തില്ലേ?',
      'ഇവിടെ അറിവ് ഫ്രീ അല്ല. നറുക്കെടുപ്പ് ആണ്.',
      'അമ്മ വിളിക്കുന്നതിന് മുൻപ് ഒരു ടിക്കറ്റ് എടുത്തോ.'
    ],
    ticker: [
      'ഇന്നത്തെ നറുക്കെടുപ്പ് ഇപ്പോൾ • ഭാഗ്യം കുറവാണ്, സത്യമാണ്',
      'ബ്ലേഡ് ചേട്ടൻ 24 മണിക്കൂറും ലഭ്യമാണ് • പലിശ മണിക്കൂറിൽ 5%',
      'റീൽസ് കണ്ടാൽ കോയിൻ • കോയിൻ ഉണ്ടെങ്കിൽ ടിക്കറ്റ് • ടിക്കറ്റ് ഉണ്ടെങ്കിൽ… ഒന്നുമില്ല',
      'സമ്മാനം കിട്ടിയവർ: ആരുമില്ല • അടുത്ത നറുക്കെടുപ്പ്: ഉടനെ'
    ],
    lose: [
      'ഡാ മോനേ… ഒന്നും കിട്ടിയില്ല.',
      'ഈ ടിക്കറ്റും വെറുതെ ആയി.',
      'നിന്റെ ഭാഗ്യം ലീവിലാണ്.',
      'അടുത്ത തവണ. അല്ലെങ്കിൽ അതിനടുത്തത്.',
      'ഒരു അക്കം കൊണ്ട് പോയി! (എന്നു പറഞ്ഞാൽ ആശ്വാസമാകുമോ)'
    ],
    grantedLines: [
      'വേഗം പഠിക്ക്. സമയം ഓടുന്നു.',
      'ഇത്രയേ ഉള്ളൂ. കളയരുത്.',
      'ഇപ്പോൾ പഠിച്ചില്ലെങ്കിൽ പിന്നെ ഭാഗ്യം നോക്കണം.'
    ],
    brokeLines: [
      'കയ്യിൽ ഒരു കോയിൻ പോലുമില്ല. റീൽസ് കണ്ട് നേടടെ.',
      'പോക്കറ്റ് കാലി. ബ്ലേഡ് ചേട്ടൻ വിളിപ്പുറത്തുണ്ട്.',
      'കോയിൻ ഇല്ല, ടിക്കറ്റ് ഇല്ല, ഭാഗ്യവുമില്ല.'
    ],
    earnNudges: [
      'കോയിൻ വീഴുന്നുണ്ട്. നിർത്തരുത്.',
      'ഇതാണ് നിന്റെ ജോലി. ഭംഗിയായി ചെയ്യ്.',
      'സ്ക്രോൾ ചെയ്യ്. ഭാവി ഇവിടെയാണ്.',
      'ഒരു കോയിൻ കൂടി. പിന്നെ ഒന്ന് കൂടി.'
    ],
    bladeLines: [
      'ബ്ലേഡ് വന്നിരിക്കുന്നു.',
      'പൈസ എവിടെ മോനേ?',
      'പലിശ കൂടിക്കൊണ്ടിരിക്കുകയാണ്.',
      'ചേട്ടൻ ദേഷ്യപ്പെടുന്നതിന് മുൻപ് അടച്ചോ.'
    ]
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
