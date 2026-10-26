'use strict';
/* Minimal DOM and deterministic timers for application-flow tests.
 * Loads production app.js unchanged except for an appended private export.
 * It does not replace the engine, solver, transitions or animation functions.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot(options = {}) {
  const root = path.resolve(__dirname, '../..');
  const engine = require(path.join(root, 'engine.js'));
  const solver = require(path.join(root, 'solver.js'));
  const levels = require(path.join(root, 'levels.js'));
  const challenge = require(path.join(root, 'challenge.js'));
  let now = 100000;
  let sequence = 0;
  const tasks = new Map();
  const elements = new Map();
  const storage = new Map([['cc-sound', JSON.stringify('off')]]);
  class Element {
    constructor(id = '') {
      this.id = id;
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.textContent = '';
      this.className = '';
      this.listeners = {};
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: (...names) => {
          this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ');
        },
        remove: (...names) => {
          this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ');
        },
        toggle: (name, force) => {
          const add = force === undefined ? !this.classList.contains(name) : force;
          this.classList[add ? 'add' : 'remove'](name);
          return add;
        }
      };
    }
    set innerHTML(html) {
      this._html = html;
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      for (const match of html.matchAll(/id="([^"]+)"/g)) {
        elements.set(match[1], new Element(match[1]));
      }
    }
    get innerHTML() { return this._html || ''; }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    dispatch(name, event = {}) {
      for (const callback of this.listeners[name] || []) callback({ preventDefault() {}, ...event });
    }
    querySelectorAll(selector) {
      const out = [];
      for (const child of this.children) {
        if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) out.push(child);
        out.push(...child.querySelectorAll(selector));
      }
      return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
      if (this.id === 'board' || this.id === 'board-wrap') return { left: 0, top: 0, width: 360, height: 360 };
      const index = this.parentNode ? this.parentNode.children.indexOf(this) : 0;
      const size = this.parentNode?.id === 'board' ? Math.sqrt(this.parentNode.children.length) : 6;
      return { left: (index % size) * 40, top: Math.floor(index / size) * 40, width: 36, height: 36 };
    }
    setAttribute(name, value) { this[name] = value; }
    animate() { return { finished: Promise.resolve(), cancel() {} }; }
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  for (const id of ['coach', 'overlay', 'chain-badge', 'screen-game']) get(id).classList.add('hidden');
  const document = new Element('document');
  document.getElementById = get;
  document.createElement = () => new Element();
  document.body = new Element('body');
  const window = {
    CC_ENGINE: engine,
    CC_SOLVER: solver,
    CC_LEVELS: levels.LEVELS,
    CC_CHAPTERS: levels.CHAPTERS,
    CC_STAR_FOR: levels.starFor,
    CC_UNLOCKED: levels.unlocked,
    CC_CHALLENGE: options.challenge || challenge,
    matchMedia: () => ({ matches: false })
  };
  const context = {
    window, document, console,
    Date: class extends Date { static now() { return now; } },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    setTimeout: (callback, delay = 0) => {
      const id = ++sequence;
      tasks.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => tasks.delete(id)
  };
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const exportHook = `window.testApp = {
    startLevel, tryPlay, goMenu, giveHint, revealAnswer, undo, resetLevel,
    startChallenge, startDaily, closeOverlay,
    get state() { return { game, level, runCtx, busy, progress, maxChain, history }; }
  };\n`;
  if (!/\}\)\(\);\s*$/.test(source)) throw new Error('app.js export hook could not find the closing IIFE');
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, exportHook + '})();'), context, { filename: 'app.js' });

  async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
  function earliest() { return [...tasks].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]; }
  async function next() {
    await flush();
    const entry = earliest();
    if (!entry) return false;
    const [id, task] = entry;
    tasks.delete(id);
    now = task.at;
    task.callback();
    await flush();
    return true;
  }
  async function advance(duration) {
    const target = now + duration;
    await flush();
    let steps = 0;
    while (earliest()?.[1].at <= target) {
      if (++steps > 20000) throw new Error('timer iteration limit');
      await next();
    }
    now = target;
    await flush();
  }
  async function until(predicate, max = 20000) {
    for (let i = 0; i < max; i++) {
      await flush();
      if (predicate()) return;
      if (!await next()) throw new Error('no pending timers before condition became true');
    }
    throw new Error('timer iteration limit');
  }
  function track(promise) {
    if (!promise || typeof promise.then !== 'function') throw new Error('expected application operation Promise');
    const state = { done: false, error: undefined, value: undefined };
    promise.then(value => { state.value = value; state.done = true; },
      error => { state.error = error; state.done = true; });
    return state;
  }
  async function finish(operation) {
    const tracked = track(operation);
    await until(() => tracked.done);
    if (tracked.error) throw tracked.error;
    return tracked.value;
  }
  async function move(index) { return finish(window.testApp.tryPlay(index)); }
  return {
    app: window.testApp, engine, solver, levels, challenge,
    get, document, storage, next, advance, until, flush, track, finish, move
  };
}
module.exports = { boot };
