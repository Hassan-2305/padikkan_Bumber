/* Not shipped. A very small DOM good enough to build, query and click the
   overlay so its code paths can be executed without a browser. */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

class StyleBase {
  constructor() { this._p = {}; this._prio = {}; this._css = ''; }
  setProperty(k, v, prio) {
    k = kebab(k);
    if (v === '' || v == null) return this.removeProperty(k);
    this._p[k] = String(v);
    if (prio) this._prio[k] = prio; else delete this._prio[k];
  }
  getPropertyValue(k) { return this._p[kebab(k)] || ''; }
  getPropertyPriority(k) { return this._prio[kebab(k)] || ''; }
  removeProperty(k) { k = kebab(k); delete this._p[k]; delete this._prio[k]; }
  set cssText(v) {
    this._css = String(v || '');
    this._p = {}; this._prio = {};
    for (const decl of this._css.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      let val = decl.slice(i + 1).trim();
      let prio = '';
      if (/!important$/.test(val)) { prio = 'important'; val = val.replace(/!important$/, '').trim(); }
      this.setProperty(decl.slice(0, i).trim(), val, prio);
    }
  }
  get cssText() {
    return Object.entries(this._p)
      .map(([k, v]) => `${k}:${v}${this._prio[k] ? ' !important' : ''}`).join(';');
  }
}

/* A real element reflects style.width = '50%' into getPropertyValue('width'),
   so the proxy routes plain property writes through setProperty. */
function makeStyle() {
  return new Proxy(new StyleBase(), {
    get(t, k) {
      if (typeof k === 'symbol' || k in t) return t[k];
      return t._p[kebab(k)] ?? '';
    },
    set(t, k, v) {
      if (typeof k === 'symbol' || k === 'cssText' || k.startsWith('_')) { t[k] = v; return true; }
      if (k in StyleBase.prototype) { t[k] = v; return true; }
      t.setProperty(k, v);
      return true;
    }
  });
}

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...c) { c.forEach((x) => x && this.set.add(x)); this.sync(); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); this.sync(); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    on ? this.set.add(c) : this.set.delete(c);
    this.sync();
    return on;
  }
  sync() { this.node._className = [...this.set].join(' '); }
  get value() { return this.node._className; }
}

class Node {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = makeStyle();
    this.classList = new ClassList(this);
    this._className = '';
    this._text = '';
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
  }
  get id() { return this.attributes.id || ''; }
  set id(v) { this.attributes.id = String(v); }
  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set(String(v || '').split(/\s+/).filter(Boolean));
  }
  get children() { return this.childNodes.filter((n) => n instanceof Node); }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === this.ownerDocument || n.__isRoot === true;
  }
  get offsetHeight() { return 0; }
  get clientWidth() { return 900; }
  get clientHeight() { return 600; }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    // boolean content attributes reflect to properties, as in a real element
    if (k === 'disabled') this.disabled = true;
    if (k === 'hidden') this.hidden = true;
    if (k === 'value') this.value = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = String(v);
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'disabled') this.disabled = false;
    if (k === 'hidden') this.hidden = false;
  }

  appendChild(n) {
    if (typeof n === 'string') { this.childNodes.push({ text: n }); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...ns) { ns.forEach((n) => this.appendChild(n)); }
  prepend(...ns) {
    ns.reverse().forEach((n) => { this.appendChild(n); this.childNodes.unshift(this.childNodes.pop()); });
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  insertAdjacentHTML(pos, html) {
    const nodes = parse(html, this.ownerDocument);
    if (pos === 'afterbegin') this.prepend(...nodes);
    else this.append(...nodes);
  }

  get textContent() {
    let out = this._text || '';
    for (const c of this.childNodes) out += c instanceof Node ? c.textContent : (c.text || '');
    return out;
  }
  set textContent(v) { this.childNodes = []; this._text = String(v); }

  set innerHTML(html) {
    this.childNodes = [];
    this._text = '';
    for (const n of parse(html, this.ownerDocument)) this.appendChild(n);
  }
  get innerHTML() { return '<!-- not implemented -->'; }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type, ev = {}) {
    for (const f of this.listeners[type] || []) f({ type, target: this, preventDefault() {}, stopPropagation() {}, ...ev });
  }
  click() { if (this.disabled) return false; this.dispatch('click'); return true; }
  focus() { this.ownerDocument.activeElement = this; }
  animate() { return { cancel() {}, finished: Promise.resolve() }; }
  getBoundingClientRect() { return { width: 300, height: 300, top: 0, left: 0 }; }
  attachShadow() {
    const r = this.ownerDocument.createElement('shadow-root');
    r.parentNode = this;
    this.shadowRoot = r;
    this.__shadow = r;
    return r;
  }
  getContext(kind) {
    // Only canvases that the test explicitly opts in get a context.
    if (!this.__ctx2d || kind !== '2d') return null;
    return this.__ctx2d;
  }

  /* selectors: tag, .class, [attr], and combinations of them */
  matches(sel) {
    const parts = sel.trim().match(/^([a-zA-Z0-9-]+)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/);
    if (!parts) return false;
    const [, tag, hash, classes, attrs] = parts;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (hash && this.id !== hash.slice(1)) return false;
    for (const c of (classes || '').split('.').filter(Boolean)) if (!this.classList.contains(c)) return false;
    for (const a of (attrs || '').match(/\[[^\]]+\]/g) || []) {
      const m = a.slice(1, -1).match(/^([^=]+)(?:=["']?([^"'\]]*)["']?)?$/);
      if (!m) return false;
      if (!(m[1] in this.attributes)) return false;
      if (m[2] !== undefined && this.attributes[m[1]] !== m[2]) return false;
    }
    return true;
  }
  walk(fn) {
    for (const c of this.children) { fn(c); c.walk(fn); }
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    // Handles comma groups and descendant combinators: for "a b c" a node must
    // match "c" and have ancestors matching "b" then "a", in order.
    const groups = sel.split(',').map((g) => g.trim().split(/\s+/).filter(Boolean));
    const hits = (node, chain) => {
      if (!node.matches(chain[chain.length - 1])) return false;
      let need = chain.length - 2;
      let cur = node.parentNode;
      while (need >= 0 && cur) {
        if (cur.matches && cur.matches(chain[need])) need--;
        cur = cur.parentNode;
      }
      return need < 0;
    };
    const out = [];
    this.walk((n) => { if (groups.some((g) => g.length && hits(n, g))) out.push(n); });
    return out;
  }
}

const TOKEN = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g;

function parse(html, doc) {
  const roots = [];
  const stack = [];
  const put = (n) => (stack.length ? stack[stack.length - 1].appendChild(n) : roots.push(n));
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(html))) {
    const [all, close, open, attrs, selfClose, text] = m;
    if (all.startsWith('<!--')) continue;
    if (close) { while (stack.length && stack.pop().tagName !== close.toUpperCase()); continue; }
    if (open) {
      const el = doc.createElement(open);
      let a;
      ATTR.lastIndex = 0;
      while ((a = ATTR.exec(attrs || ''))) {
        if (!a[1]) continue;
        el.setAttribute(a[1], a[2] ?? a[3] ?? '');
      }
      put(el);
      if (!selfClose && !VOID.has(open.toLowerCase())) stack.push(el);
      continue;
    }
    if (text && text.trim()) {
      const t = { text: text.replace(/\s+/g, ' ') };
      stack.length ? stack[stack.length - 1].childNodes.push(t) : roots.push(t);
    }
  }
  return roots;
}

function makeDocument() {
  const doc = {
    __isRoot: true,
    createElement(tag) { return new Node(tag, doc); },
    createTextNode(t) { const n = new Node('#text', doc); n.textContent = t; return n; },
    activeElement: null,
    listeners: {},
    addEventListener(t, f) { (doc.listeners[t] ||= []).push(f); },
    removeEventListener(t, f) { doc.listeners[t] = (doc.listeners[t] || []).filter((x) => x !== f); },
    visibilityState: 'visible',
    hasFocus: () => true,
    title: 'A Study Page'
  };
  doc.documentElement = doc.createElement('html');
  doc.documentElement.parentNode = null;
  doc.documentElement.__isRoot = true;
  doc.body = doc.createElement('body');
  doc.documentElement.appendChild(doc.body);
  doc.querySelector = (s) => doc.documentElement.querySelector(s);
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  return doc;
}

module.exports = { makeDocument, parse, Node };
