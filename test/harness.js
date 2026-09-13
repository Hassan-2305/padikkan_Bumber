/* Not shipped. Loads the real service worker under a stubbed chrome API so the
   economy, the site matcher and the draw can be exercised without a browser. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function makeChrome() {
  const store = {};
  const listeners = { message: [], changed: [], alarm: [] };
  const log = { badge: null, tabs: [], notifications: [], alarms: {} };

  return {
    log, store, listeners,
    api: {
      storage: {
        local: {
          get: (key, cb) => {
            const out = typeof key === 'string' ? { [key]: store[key] } : { ...store };
            if (typeof cb === 'function') return cb(out);
            return Promise.resolve(out);
          },
          set: (obj) => { Object.assign(store, obj); const ch = {};
            for (const k of Object.keys(obj)) ch[k] = { newValue: obj[k] };
            listeners.changed.forEach((f) => f(ch, 'local'));
            return Promise.resolve(); }
        },
        onChanged: { addListener: (f) => listeners.changed.push(f) }
      },
      runtime: {
        onMessage: { addListener: (f) => listeners.message.push(f) },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        sendMessage: () => Promise.resolve(),
        getURL: (p) => 'chrome-extension://test/' + p,
        lastError: null
      },
      action: {
        setBadgeText: (o) => (log.badge = o.text),
        setBadgeBackgroundColor: () => {},
        setTitle: () => {}
      },
      alarms: {
        create: (n, o) => (log.alarms[n] = o),
        clear: (n) => delete log.alarms[n],
        onAlarm: { addListener: (f) => listeners.alarm.push(f) }
      },
      tabs: {
        query: (q, cb) => cb ? cb([]) : Promise.resolve([]),
        create: (o) => { log.tabs.push(o.url); return Promise.resolve({ id: 1 }); },
        update: () => Promise.resolve(),
        sendMessage: () => Promise.resolve(),
        onUpdated: { addListener: () => {} }
      },
      notifications: { create: (o) => log.notifications.push(o) }
    }
  };
}

function boot(seed) {
  const c = makeChrome();
  if (seed) c.store.pb_state = seed;   // pretend an older install is already on disk
  const ctx = vm.createContext({
    chrome: c.api,
    console,
    structuredClone,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, RegExp, Error,
    URL, URLSearchParams
  });
  ctx.globalThis = ctx;
  ctx.importScripts = () => {};
  vm.runInContext(read('src/shared/config.js'), ctx, { filename: 'config.js' });
  vm.runInContext(read('src/background/service-worker.js'), ctx, { filename: 'sw.js' });
  const send = (action, payload = {}) =>
    new Promise((resolve) => {
      let answered = false;
      for (const f of c.listeners.message) {
        f({ action, payload }, {}, (res) => { answered = true; resolve(res && res.data); });
      }
      if (!c.listeners.message.length) resolve(null);
      void answered;
    });
  return { chrome: c, ctx, send, PB: ctx.PB };
}

module.exports = { boot };
