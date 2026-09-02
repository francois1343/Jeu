const assert = require('node:assert/strict');

class ClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = typeof force === 'boolean' ? force : !this.values.has(value);
    if (enabled) this.values.add(value); else this.values.delete(value);
    return enabled;
  }
}

class MockElement {
  constructor(id, initialClasses = []) {
    this.id = id;
    this.classList = new ClassList(initialClasses);
    this.listeners = new Map();
    this.children = [];
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.clientWidth = 480;
    this.clientHeight = 720;
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  emit(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) handler({
      stopPropagation() {},
      preventDefault() {},
      ...event
    });
  }
  appendChild(child) { this.children.push(child); }
  focus() {}
  setAttribute() {}
  querySelectorAll(selector) {
    return selector === '.dot' ? this.dots : [];
  }
}

const context = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = () => {};
    return target[property];
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  }
});

const ids = [
  'gameCanvas', 'score-display', 'highscore-display', 'level-display',
  'faults-container', 'start-overlay', 'game-over-overlay', 'end-title',
  'final-score', 'new-record-tag', 'current-bubble-preview',
  'next-bubble-preview', 'btn-start', 'btn-restart', 'btn-swap',
  'btn-audio', 'btn-home', 'quit-overlay', 'btn-resume',
  'btn-confirm-quit', 'swap-container', 'canvas-wrapper',
  'btn-menu', 'btn-save-game', 'btn-leaderboard', 'utility-menu', 'utility-status',
  'btn-menu-pause', 'btn-menu-save', 'btn-menu-scores', 'btn-menu-settings', 'btn-continue', 'btn-save-pause',
  'leaderboard-overlay', 'leaderboard-list', 'btn-close-leaderboard',
  'btn-start-leaderboard', 'btn-open-settings', 'settings-overlay', 'btn-close-settings',
  'toggle-sfx', 'toggle-music', 'toggle-vibration', 'theme-cyber', 'theme-sunset', 'theme-void', 'menu-best-score'
];

const elements = new Map(ids.map(id => [id, new MockElement(
  id,
  ['game-over-overlay', 'new-record-tag', 'quit-overlay', 'btn-home', 'utility-menu', 'btn-continue', 'leaderboard-overlay', 'settings-overlay'].includes(id) ? ['hidden'] : []
)]));
const canvas = elements.get('gameCanvas');
canvas.getContext = () => context;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 720 });
elements.get('faults-container').dots = Array.from({ length: 5 }, () => new MockElement('dot'));

let onReady;
global.document = {
  addEventListener(type, handler) {
    if (type === 'DOMContentLoaded') onReady = handler;
  },
  getElementById(id) { return elements.get(id); },
  documentElement: { setAttribute() {} },
  createElement() { return new MockElement('created'); }
};

const windowListeners = new Map();
global.window = {
  addEventListener(type, handler) { windowListeners.set(type, handler); }
};
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: { vibrate() {} }
});
const storage = new Map();
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};

let scheduledFrame;
global.requestAnimationFrame = callback => {
  scheduledFrame = callback;
  return 1;
};

require('./BubbleShooter.js');
assert.equal(typeof onReady, 'function');
assert.doesNotThrow(() => onReady(), 'le menu doit pouvoir dessiner sa première frame');

elements.get('btn-start').emit('click');
assert.equal(elements.get('start-overlay').classList.contains('hidden'), true);
assert.equal(elements.get('score-display').textContent, '0');
assert.equal(elements.get('btn-home').classList.contains('hidden'), false);
elements.get('btn-save-game').emit('click');
assert.ok(storage.has('cyber_bubble_shooter_save_v1'), 'la partie doit pouvoir etre sauvegardee localement');
assert.equal(elements.get('btn-continue').classList.contains('hidden'), false, 'la reprise doit etre proposee');
elements.get('btn-start-leaderboard').emit('click');
assert.equal(elements.get('leaderboard-overlay').classList.contains('hidden'), false, 'le classement doit souvrir');
elements.get('btn-close-leaderboard').emit('click');
assert.equal(elements.get('leaderboard-overlay').classList.contains('hidden'), true, 'le classement doit pouvoir se fermer');
elements.get('btn-open-settings').emit('click');
assert.equal(elements.get('settings-overlay').classList.contains('hidden'), false, 'les parametres doivent souvrir');
elements.get('theme-sunset').emit('click');
assert.ok(storage.has('cyber_bubble_shooter_settings_v1'), 'les parametres doivent etre memorises');
elements.get('btn-close-settings').emit('click');
assert.equal(elements.get('settings-overlay').classList.contains('hidden'), true, 'les parametres doivent pouvoir se fermer');

elements.get('btn-home').emit('click');
assert.equal(elements.get('quit-overlay').classList.contains('hidden'), false);
elements.get('btn-resume').emit('click');
assert.equal(elements.get('quit-overlay').classList.contains('hidden'), true);

elements.get('btn-home').emit('click');
elements.get('btn-confirm-quit').emit('click');
assert.equal(elements.get('start-overlay').classList.contains('hidden'), false);
assert.equal(elements.get('btn-home').classList.contains('hidden'), true);
elements.get('btn-start').emit('click');

elements.get('swap-container').emit('click');

for (let shot = 0; shot < 30; shot++) {
  if (!elements.get('game-over-overlay').classList.contains('hidden')) {
    elements.get('btn-restart').emit('click');
  }
  canvas.emit('mousemove', { clientX: 80 + (shot % 5) * 80, clientY: 120 });
  canvas.emit('click');
  for (let frame = 0; frame < 100 && scheduledFrame; frame++) {
    const callback = scheduledFrame;
    scheduledFrame = null;
    callback();
  }
}

assert.ok(Number(elements.get('level-display').textContent) >= 1);
console.log('BubbleShooter smoke test: OK');
