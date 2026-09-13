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

  /* Three lots. The expensive one is deliberately the worst bet — that is the
     whole point of a bumper ticket. `win` is the chance of any prize at all;
     `raid` is the chance, on a loss, that the police turn up instead. */
  const LOTS = [
    {
      id: 'kutty',  price: 20,  seconds: 10, win: 0.10, raid: 0.04,
      ml: 'കുട്ടി ടിക്കറ്റ്', en: 'Small', tag: 'ചെറുത്',
      note: 'പത്ത് സെക്കൻഡ്. ഒരു തലക്കെട്ട് വായിക്കാം.'
    },
    {
      id: 'naadan', price: 70,  seconds: 30, win: 0.30, raid: 0.03,
      ml: 'നാടൻ ടിക്കറ്റ്', en: 'Medium', tag: 'നല്ല ഡീൽ',
      note: 'മുപ്പത് സെക്കൻഡ്. ഇതാണ് ശരിക്കും ബുദ്ധി.'
    },
    {
      id: 'bumper', price: 200, seconds: 60, win: 0.05, raid: 0.02,
      ml: 'ബമ്പർ ടിക്കറ്റ്', en: 'Bumper', tag: 'അത്യാഗ്രഹം',
      note: 'ഒരു മിനിറ്റ്. കിട്ടിയാൽ. കിട്ടില്ല.'
    }
  ];

  const LOT_IDS = LOTS.map((l) => l.id);
  const DEFAULT_LOT = 'naadan';

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

  /* Characters who turn up and say things. `ml` is shown as a subtitle,
     `say` is the Manglish the speech engine falls back to when the machine
     has no Malayalam voice installed. All lines original. */
  const CAST = {
    kaaranavar: { name: 'കാരണവർ',      tone: 'gold',  rate: 0.85, pitch: 0.7 },
    blade:      { name: 'ബ്ലേഡ് ചേട്ടൻ', tone: 'red',   rate: 0.8,  pitch: 0.55 },
    police:     { name: 'എസ്.ഐ.',       tone: 'red',   rate: 1.15, pitch: 0.9 },
    amma:       { name: 'അമ്മ',         tone: 'gold',  rate: 1.0,  pitch: 1.35 },
    friend:     { name: 'കൂട്ടുകാരൻ',    tone: 'plain', rate: 1.1,  pitch: 1.1 },
    announcer:  { name: 'അനൗൺസർ',      tone: 'gold',  rate: 0.95, pitch: 0.85 }
  };

  /* Slots for the user's own dialogue clips. Nothing ships with the
     extension — these are empty until an audio file is dropped in. `hints`
     drive filename auto-matching on bulk import. */
  const MEMES = [
    { id: 'dinesha',   label: 'Nee Po Mone Dinesha',              film: 'Narasimham',            scenes: ['lose'],            hints: ['dinesh', 'po mone', 'pomone'] },
    { id: 'pavanayi',  label: 'Angane Pavanayi Shavamayi',        film: 'Nadodikkattu',          scenes: ['lose'],            hints: ['pavanayi', 'shavam'] },
    { id: 'chandu',    label: 'Chanduviney Tholpikkan Aavilla',   film: 'Oru Vadakkan Veeragadha', scenes: ['lose'],          hints: ['chandu', 'tholpik', 'veeragadha'] },
    { id: 'ormayundo', label: 'Ormayundo Ee Mukham?',             film: 'Commissioner',          scenes: ['block'],           hints: ['ormayundo', 'mukham', 'commissioner'] },
    { id: 'vidamatte', label: 'Vida Matte',                       film: 'Manichitrathazhu',      scenes: ['police'],          hints: ['vida', 'matte', 'manichitra'] },
    { id: 'bilal',     label: 'Bilalu Pazhaya Bilalu Thanneya',   film: 'Big B',                 scenes: ['blade'],           hints: ['bilal', 'kochi', 'bigb', 'big b'] },
    { id: 'adichumole',label: 'Adichu Mole!',                     film: 'Kilukkam',              scenes: ['win', 'bumper'],   hints: ['adichu', 'mole', 'kilukkam'] },
    { id: 'edamone',   label: 'Eda Mone…',                        film: 'Aavesham',              scenes: ['block', 'blade'],  hints: ['eda mone', 'edamone', 'aavesham', 'avesham'] },
    { id: 'poland',    label: 'Polandine Patti Oru Aksharam',     film: 'Sandesham',             scenes: ['block'],           hints: ['poland', 'aksharam', 'sandesham'] },
    { id: 'sorryaliya',label: 'I Am The Sorry Aliya',             film: 'Thilakkam',             scenes: ['lose', 'expired'], hints: ['sorry', 'aliya', 'thilakkam'] },
    { id: 'budhiya',   label: 'Kaanaan Oru Look Illenney Ullu',   film: 'Meesha Madhavan',       scenes: ['win'],             hints: ['budhi', 'look', 'meesha', 'madhavan'] },
    { id: 'thomassootty', label: 'Thomassootty Vittoda',          film: 'In Harihar Nagar',      scenes: ['police'],          hints: ['thomas', 'vittoda', 'harihar'] },
    { id: 'spare1',    label: 'സ്വന്തം ക്ലിപ്പ് 1',                 film: 'Jagathy / Sreenivasan / Innocent', scenes: ['block', 'lose'],   hints: ['jagathy', 'spare1'] },
    { id: 'spare2',    label: 'സ്വന്തം ക്ലിപ്പ് 2',                 film: 'Jagathy / Sreenivasan / Innocent', scenes: ['win', 'blade'],    hints: ['sreenivasan', 'spare2'] },
    { id: 'spare3',    label: 'സ്വന്തം ക്ലിപ്പ് 3',                 film: 'Jagathy / Sreenivasan / Innocent', scenes: ['broke', 'police'], hints: ['innocent', 'spare3'] }
  ];

  const DIALOGUE = {
    block: [
      { who: 'kaaranavar', ml: 'നിൽക്ക്. എങ്ങോട്ടാ ഈ പോക്ക്?', say: 'Nilkku. Engotta ee pokku?' },
      { who: 'kaaranavar', ml: 'പഠിക്കാൻ ഇവിടെ ഒരു ചടങ്ങുണ്ട്.', say: 'Padikkaan ivide oru chadangundu.' },
      { who: 'amma',       ml: 'ഇവൻ പഠിക്കാൻ പോകുവാണെന്ന്!', say: 'Ivan padikkaan pokuvaanennu!' },
      { who: 'friend',     ml: 'ഡാ, നീ ശരിക്കും പഠിക്കാൻ വന്നതാണോ?', say: 'Da, nee sherikkum padikkaan vannathaano?' },
      { who: 'announcer',  ml: 'ഇന്നത്തെ നറുക്കെടുപ്പ് ആരംഭിക്കുന്നു.', say: 'Innathe narukkeduppu aarambhikkunnu.' }
    ],
    win: [
      { who: 'announcer', ml: 'ഭാഗ്യവാൻ! പോയി പഠിക്ക്!', say: 'Bhaagyavaan! Poyi padikku!' },
      { who: 'amma',      ml: 'എന്റെ മോൻ പഠിക്കാൻ പോകുവാ!', say: 'Ente mon padikkaan pokuva!' },
      { who: 'friend',    ml: 'അളിയാ, ഇത് ഭാഗ്യമാണ്!', say: 'Aliyaa, ithu bhaagyamaanu!' }
    ],
    bumper: [
      { who: 'announcer', ml: 'ബമ്പർ! നാട് മുഴുവൻ അറിയട്ടെ!', say: 'Bumper! Naadu muzhuvan ariyatte!' },
      { who: 'amma',      ml: 'അയ്യോ! ബമ്പർ അടിച്ചു!', say: 'Ayyo! Bumper adichu!' }
    ],
    lose: [
      { who: 'kaaranavar', ml: 'ഞാൻ അപ്പോഴേ പറഞ്ഞതാ.', say: 'Njaan appozhe paranjatha.' },
      { who: 'friend',     ml: 'സാരമില്ലടാ. ആർക്കും കിട്ടാറില്ല.', say: 'Saaramilladaa. Aarkkum kittaarilla.' },
      { who: 'amma',       ml: 'നീ പോയി ഉറങ്ങ്.', say: 'Nee poyi urangu.' }
    ],
    police: [
      { who: 'police', ml: 'ഇത് നിയമവിരുദ്ധമാണ്! കോയിൻ എടുക്ക്!', say: 'Ithu niyamaviruddhamaanu! Coin edukku!' },
      { who: 'police', ml: 'ആരും അനങ്ങരുത്! റെയ്ഡാണ്!', say: 'Aarum anangaruthu! Raid aanu!' }
    ],
    blade: [
      { who: 'blade', ml: 'കാശ് എവിടെ? ഞാൻ ചോദിക്കാൻ വന്നതാ.', say: 'Kaashu evide? Njaan chodikkaan vannatha.' },
      { who: 'blade', ml: 'പലിശ ഓടിക്കൊണ്ടിരിക്കുവാ, മോനേ.', say: 'Palisha odikkondirikkuvaa, mone.' },
      { who: 'blade', ml: 'അടുത്ത ആഴ്ച ഞാൻ വീട്ടിൽ വരും.', say: 'Aduthaazhcha njaan veettil varum.' }
    ],
    broke: [
      { who: 'blade',  ml: 'കയ്യിൽ ഒന്നുമില്ല, അല്ലേ?', say: 'Kayyil onnumilla, alle?' },
      { who: 'friend', ml: 'റീൽസ് കാണാൻ പോ. അതാ നിന്റെ ജോലി.', say: 'Reels kaanaan po. Athaa ninte joli.' }
    ],
    expired: [
      { who: 'kaaranavar', ml: 'സമയം കഴിഞ്ഞു. അടയ്ക്ക്.', say: 'Samayam kazhinju. Adaykku.' },
      { who: 'announcer',  ml: 'പാസ് തീർന്നു. അടുത്ത ടിക്കറ്റ്.', say: 'Pass theernnu. Aduthe ticket.' }
    ]
  };

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
    ECONOMY, LOTS, LOT_IDS, DEFAULT_LOT, CATEGORIES, HOST_PATTERNS, EARN_SITES, COPY, SERIAL_LETTERS,
    CAST, DIALOGUE, MEMES,

    /** Clip slots that suit a given scene. */
    memesFor(scene) { return MEMES.filter((m) => m.scenes.includes(scene)); },

    /** Look up a lot by id, falling back to the middle one. */
    lot(id) { return LOTS.find((l) => l.id === id) || LOTS.find((l) => l.id === DEFAULT_LOT); },

    /** Expected seconds of study per coin spent — used to be honest in the UI. */
    valueOf(lot) { return (lot.win * lot.seconds) / lot.price; },

    /** Empty ticket wallet. */
    emptyTickets() { return LOT_IDS.reduce((o, id) => ((o[id] = 0), o), {}); },

    /** Total tickets held, across all lots. */
    ticketCount(t) {
      if (typeof t === 'number') return t;
      return LOT_IDS.reduce((n, id) => n + ((t && t[id]) || 0), 0);
    },

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
