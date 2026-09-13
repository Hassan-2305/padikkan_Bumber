/* Padikkan Bumper — service worker.
   Single source of truth for coins, tickets, access time and Blade's debt.
   Every UI surface asks this file; nothing computes its own economy. */

importScripts('/src/shared/config.js');

const { ECONOMY } = PB;
const KEY = 'pb_state';

const DEFAULT_STATE = {
  version: 1,
  coins: 0,
  tickets: PB.emptyTickets(),        // per-lot wallet
  accessUntil: 0,
  accessPrize: null,
  debt: 0,
  loans: 0,
  lastInterestAt: 0,
  lastBailAt: 0,
  watchBuffer: 0,
  garnishCarry: 0,
  stats: {
    watchSeconds: 0,
    coinsEarned: 0,
    coinsSpent: 0,
    coinsSeized: 0,
    ticketsBought: 0,
    plays: 0,
    wins: 0,
    studySecondsWon: 0,
    blocks: 0,
    bestPrize: null,
    streakLosses: 0,
    worstStreak: 0
  },
  history: [],
  settings: {
    disabledCategories: [],
    customSites: [],
    allowlist: [],
    blockPdfs: true,
    blockAcademicTlds: true,
    preferredMine: 'instagram',
    sound: true,
    peekSeconds: PB.ECONOMY.PEEK_SECONDS,   // how long you get to see the page
    memeMode: true,                          // loud reactions and shouted lines
    soundPack: {}                            // event -> user-supplied clip id
  },
  installedAt: 0
};

let cache = null;
let writing = Promise.resolve();

/* ------------------------------------------------------------- persistence */

async function load() {
  if (cache) return cache;
  const got = await chrome.storage.local.get(KEY);
  const saved = got[KEY];
  cache = saved
    ? {
        ...DEFAULT_STATE, ...saved,
        stats: { ...DEFAULT_STATE.stats, ...(saved.stats || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        // v1.2 and earlier kept a single ticket count; fold it into the middle lot
        tickets: typeof saved.tickets === 'number'
          ? { ...PB.emptyTickets(), [PB.DEFAULT_LOT]: saved.tickets }
          : { ...PB.emptyTickets(), ...(saved.tickets || {}) }
      }
    : { ...structuredClone(DEFAULT_STATE), installedAt: Date.now(), lastInterestAt: Date.now() };
  return cache;
}

function save() {
  writing = writing.then(() => chrome.storage.local.set({ [KEY]: cache })).catch(() => {});
  return writing;
}

/** Mutate state through here so persistence, badge and broadcast stay in sync. */
async function mutate(fn) {
  const s = await load();
  accrueInterest(s);
  expireAccess(s);
  const out = fn(s);
  await save();
  refreshBadge(s);
  broadcast(s);
  return out;
}

/* ------------------------------------------------------------------ upkeep */

function accrueInterest(s) {
  const now = Date.now();
  if (!s.lastInterestAt) s.lastInterestAt = now;
  if (s.debt <= 0) { s.lastInterestAt = now; return; }
  const hours = (now - s.lastInterestAt) / 3600e3;
  if (hours <= 0.0005) return;
  const grown = s.debt * Math.pow(1 + ECONOMY.BLADE_HOURLY_RATE, hours);
  s.debt = Math.min(99999, Math.round(grown));
  s.lastInterestAt = now;
}

function expireAccess(s) {
  if (s.accessUntil && s.accessUntil <= Date.now()) {
    s.accessUntil = 0;
    s.accessPrize = null;
  }
}

function refreshBadge(s) {
  const left = s.accessUntil - Date.now();
  if (left > 0) {
    const mins = Math.ceil(left / 60000);
    chrome.action.setBadgeBackgroundColor({ color: '#2FA36B' });
    chrome.action.setBadgeText({ text: String(mins) + 'm' });
    chrome.action.setTitle({ title: `പഠിക്കാൻ ${PB.clock(left)} ബാക്കി` });
  } else if (s.debt > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#E2402F' });
    chrome.action.setBadgeText({ text: '₹' + short(s.debt) });
    chrome.action.setTitle({ title: `ബ്ലേഡിന് ${s.debt} കോയിൻ കൊടുക്കാനുണ്ട്` });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#A9761B' });
    chrome.action.setBadgeText({ text: s.coins > 0 ? short(s.coins) : '' });
    chrome.action.setTitle({ title: `${s.coins} കോയിൻ • ${PB.ticketCount(s.tickets)} ടിക്കറ്റ്` });
  }
}

function short(n) {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
}

/* Content scripts pick changes up from chrome.storage.onChanged; this is just
   for the popup, which may be open while the worker mutates state. */
function broadcast(s) {
  chrome.runtime.sendMessage({ type: 'pb:state', state: publicState(s) }).catch(() => {});
}

function publicState(s) { return PB.publicState(s); }

/* ----------------------------------------------------------------- economy */

function creditCoins(s, amount) {
  let coins = Math.floor(amount);
  let seized = 0;
  if (s.debt > 0 && coins > 0) {
    // Carry the fraction across payouts, otherwise rounding a half-share of
    // one coin would hand Blade every single coin.
    const share = coins * ECONOMY.BLADE_GARNISH + (s.garnishCarry || 0);
    seized = Math.min(s.debt, coins, Math.floor(share));
    s.garnishCarry = Math.max(0, share - seized);
    s.debt -= seized;
    s.stats.coinsSeized += seized;
    coins -= seized;
    if (s.debt <= 0) { s.debt = 0; s.loans = 0; s.garnishCarry = 0; }
  }
  s.coins += coins;
  s.stats.coinsEarned += coins;
  return { kept: coins, seized };
}

/* Resolve one draw of a given lot: win, raid, or nothing. */
function rollLot(lot) {
  const r = Math.random();
  if (r < lot.win) return { outcome: 'win', seconds: lot.seconds };
  if (r < lot.win + lot.raid) return { outcome: 'police', seconds: 0 };
  return { outcome: 'blank', seconds: 0 };
}

/** Given the ticket the player holds, produce the winning number.
    Near misses are manufactured on purpose — that is the whole joke. */
function makeNumbers(won, held) {
  const drawn = /^[A-Z]{2} \d{6}$/.test(held || '') ? held : PB.serial();
  if (won) return { winning: drawn, drawn, missBy: 0 };
  const [letters, digits] = drawn.split(' ');
  const arr = digits.split('');
  // 55% of losses are one digit off. Salt in the wound.
  const nearMiss = Math.random() < 0.55;
  const changes = nearMiss ? 1 : 2 + Math.floor(Math.random() * 3);
  const idx = new Set();
  while (idx.size < changes) idx.add(Math.floor(Math.random() * 6));
  for (const i of idx) {
    let d;
    do { d = String(Math.floor(Math.random() * 10)); } while (d === arr[i]);
    arr[i] = d;
  }
  let winLetters = letters;
  if (Math.random() > 0.6) {
    do { winLetters = PB.pick(PB.SERIAL_LETTERS); } while (winLetters === letters);
  }
  return { winning: winLetters + ' ' + arr.join(''), drawn, missBy: changes };
}

function grantAccess(s, seconds) {
  const base = Math.max(s.accessUntil, Date.now());
  s.accessUntil = base + seconds * 1000;
  s.stats.studySecondsWon += seconds;
  scheduleExpiry(s);
}

function scheduleExpiry(s) {
  chrome.alarms.clear('pb:access');
  if (s.accessUntil > Date.now()) {
    chrome.alarms.create('pb:access', { when: s.accessUntil });
  }
}

/* ---------------------------------------------------------------- handlers */

const handlers = {
  async state() {
    return mutate(() => null).then(async () => publicState(await load()));
  },

  /** Content script on a coin mine reports watched seconds. */
  async earn({ seconds }) {
    return mutate((s) => {
      const sec = Math.max(0, Math.min(60, Number(seconds) || 0));
      s.watchBuffer += sec;
      s.stats.watchSeconds += sec;
      const coins = Math.floor(s.watchBuffer / ECONOMY.SECONDS_PER_COIN);
      s.watchBuffer -= coins * ECONOMY.SECONDS_PER_COIN;
      if (!coins) return { gained: 0, seized: 0, coins: s.coins };
      const { kept, seized } = creditCoins(s, coins);
      return { gained: kept, seized, coins: s.coins, debt: s.debt };
    });
  },

  async buy({ count = 1, lot: lotId }) {
    return mutate((s) => {
      const lot = PB.lot(lotId);
      const n = Math.max(1, Math.min(25, count | 0));
      const cost = n * lot.price;
      if (s.debt >= ECONOMY.BLADE_PANIC_AT) {
        return { ok: false, reason: 'blade', message: 'ബ്ലേഡ് ചേട്ടൻ ടിക്കറ്റ് വാങ്ങാൻ സമ്മതിക്കില്ല. ആദ്യം കടം അടയ്ക്ക്.' };
      }
      if (s.coins < cost) {
        return {
          ok: false, reason: 'coins',
          message: `${lot.ml} എടുക്കാൻ ${cost} കോയിൻ വേണം. റീൽസ് കണ്ട് നേടടെ.`
        };
      }
      s.coins -= cost;
      s.tickets[lot.id] = (s.tickets[lot.id] || 0) + n;
      s.stats.coinsSpent += cost;
      s.stats.ticketsBought += n;
      return { ok: true, lot: lot.id, tickets: s.tickets, coins: s.coins };
    });
  },

  async play({ serial, lot: lotId }) {
    return mutate((s) => {
      const lot = PB.lot(lotId);
      if (!s.tickets[lot.id]) {
        return {
          ok: false, reason: 'tickets',
          message: `${lot.ml} കയ്യിലില്ല. ആദ്യം എടുക്ക്.`
        };
      }
      s.tickets[lot.id] -= 1;
      s.stats.plays += 1;

      const roll = rollLot(lot);
      const won = roll.outcome === 'win';
      const nums = makeNumbers(won, serial);
      let seized = 0;

      if (won) {
        s.stats.wins += 1;
        s.stats.streakLosses = 0;
        grantAccess(s, roll.seconds);
        // best result is measured by the size of the lot won
        const rank = PB.LOT_IDS.indexOf(lot.id);
        const bestRank = s.stats.bestPrize ? PB.LOT_IDS.indexOf(s.stats.bestPrize) : -1;
        if (rank > bestRank) s.stats.bestPrize = lot.id;
      } else {
        s.stats.streakLosses += 1;
        s.stats.worstStreak = Math.max(s.stats.worstStreak, s.stats.streakLosses);
        if (roll.outcome === 'police') {
          seized = Math.min(s.coins, Math.max(10, Math.round(s.coins * 0.35)));
          s.coins -= seized;
          s.stats.coinsSeized += seized;
        }
      }

      s.history.unshift({
        t: Date.now(),
        lot: lot.id,
        outcome: roll.outcome,
        seconds: roll.seconds,
        serial: nums.drawn,
        winning: nums.winning
      });
      s.history = s.history.slice(0, 40);

      return {
        ok: true,
        lot: { ...lot },
        outcome: roll.outcome,
        seconds: roll.seconds,
        won,
        seized,
        numbers: nums,
        state: publicState(s)
      };
    });
  },

  async borrow() {
    return mutate((s) => {
      if (s.loans >= ECONOMY.BLADE_MAX_LOANS) {
        return { ok: false, message: 'ബ്ലേഡ് ചേട്ടൻ പറഞ്ഞു: ഇനി ഇല്ല. ആദ്യം ഉള്ളത് അടയ്ക്ക്.' };
      }
      s.coins += ECONOMY.BLADE_PRINCIPAL;
      s.debt += Math.round(ECONOMY.BLADE_PRINCIPAL * ECONOMY.BLADE_UPFRONT);
      s.loans += 1;
      s.lastInterestAt = Date.now();
      return { ok: true, coins: s.coins, debt: s.debt };
    });
  },

  async repay({ amount }) {
    return mutate((s) => {
      const pay = Math.min(s.coins, s.debt, Math.max(1, amount | 0));
      if (pay <= 0) return { ok: false, message: 'അടയ്ക്കാൻ കോയിൻ വേണ്ടേ?' };
      s.coins -= pay;
      s.debt -= pay;
      if (s.debt <= 0) { s.debt = 0; s.loans = 0; }
      return { ok: true, paid: pay, debt: s.debt, cleared: s.debt === 0 };
    });
  },

  /** Emergency exit: real access now, on Blade's tab. */
  async bail() {
    return mutate((s) => {
      if (Date.now() - s.lastBailAt < ECONOMY.BAIL_COOLDOWN) {
        return { ok: false, message: 'ജാമ്യം മണിക്കൂറിൽ ഒരിക്കൽ മാത്രം.' };
      }
      s.lastBailAt = Date.now();
      s.debt += ECONOMY.BAIL_DEBT;
      s.loans += 1;
      s.lastInterestAt = Date.now();
      grantAccess(s, ECONOMY.BAIL_SECONDS);
      return { ok: true, seconds: ECONOMY.BAIL_SECONDS, debt: s.debt };
    });
  },

  async openMine({ id }) {
    const site = PB.EARN_SITES.find((e) => e.id === id) || PB.EARN_SITES[0];
    await mutate((s) => { s.settings.preferredMine = site.id; });
    await chrome.tabs.create({ url: site.url });
    return { ok: true };
  },

  async blocked() {
    return mutate((s) => { s.stats.blocks += 1; });
  },

  async settings({ patch }) {
    return mutate((s) => {
      s.settings = { ...s.settings, ...patch };
      if ('peekSeconds' in (patch || {})) {
        const n = Math.round(Number(s.settings.peekSeconds));
        s.settings.peekSeconds = Number.isFinite(n)
          ? Math.max(ECONOMY.PEEK_MIN, Math.min(ECONOMY.PEEK_MAX, n))
          : ECONOMY.PEEK_SECONDS;
      }
      return { ok: true, settings: s.settings };
    });
  },

  async reset() {
    cache = { ...structuredClone(DEFAULT_STATE), installedAt: Date.now(), lastInterestAt: Date.now() };
    await save();
    refreshBadge(cache);
    broadcast(cache);
    return { ok: true };
  },

  async check({ url }) {
    const s = await load();
    expireAccess(s);
    return {
      blocked: PB.isStudyUrl(url, s.settings),
      state: publicState(s)
    };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action || !handlers[msg.action]) return;
  Promise.resolve(handlers[msg.action](msg.payload || {}, sender))
    .then((r) => sendResponse({ ok: true, data: r }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // async
});

/* --------------------------------------------------------------- lifecycle */

chrome.runtime.onInstalled.addListener(async (details) => {
  const s = await load();
  await save();
  refreshBadge(s);
  chrome.alarms.create('pb:tick', { periodInMinutes: 1 });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/welcome.html') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const s = await load();
  accrueInterest(s);
  expireAccess(s);
  scheduleExpiry(s);
  await save();
  refreshBadge(s);
  chrome.alarms.create('pb:tick', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pb:tick') {
    await mutate(() => null);
  } else if (alarm.name === 'pb:access') {
    const s = await load();
    expireAccess(s);
    await save();
    refreshBadge(s);
    broadcast(s);
    notify('സമയം കഴിഞ്ഞു', PB.pick([
      'പഠിപ്പ് നിർത്ത്. റീൽസിലേക്ക് മടങ്ങ്.',
      'അത്രേയുള്ളൂ. അടുത്ത ടിക്കറ്റ് എടുക്ക്.',
      'സെഷൻ തീർന്നു. ഭാഗ്യം വീണ്ടും നോക്കാം.'
    ]));
  }
});

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 1
    });
  } catch { /* notifications may be blocked; not important */ }
}

/* PDF documents render in Chrome's own viewer where content scripts never run,
   so those get bounced to a full extension page instead. */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const url = info.url || (info.status === 'loading' ? tab.url : null);
  if (!url || !/\.pdf($|\?|#)/i.test(url)) return;
  if (url.startsWith(chrome.runtime.getURL(''))) return;
  const s = await load();
  expireAccess(s);
  if (s.accessUntil > Date.now()) return;
  if (!PB.isStudyUrl(url, s.settings)) return;
  const target = chrome.runtime.getURL('src/pages/blocked.html') + '?u=' + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: target }).catch(() => {});
});

// Warm the cache on worker spin-up.
load().then((s) => { accrueInterest(s); expireAccess(s); refreshBadge(s); scheduleExpiry(s); });
