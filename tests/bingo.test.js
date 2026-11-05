'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../games/bingo/engine.js');
const root = path.resolve(__dirname, '..');
function rng(seed) { return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); }
for (let seed = 1; seed <= 250; seed++) {
  const card = engine.createCard(rng(seed)), deck = engine.createDraw(rng(seed + 500));
  assert.equal(card.length, 25); assert.equal(card[12], null);
  assert.equal(new Set(card.filter(n => n !== null)).size, 24);
  card.forEach((n, i) => { if (n !== null) assert(n >= (i % 5) * 15 + 1 && n <= (i % 5 + 1) * 15); });
  assert.equal(deck.length, 75); assert.equal(new Set(deck).size, 75);
  assert.deepEqual([...deck].sort((a, b) => a - b), Array.from({length:75}, (_, i) => i + 1));
}
assert.equal(engine.label(1), 'B1'); assert.equal(engine.label(16), 'I16'); assert.equal(engine.label(75), 'O75');
assert.throws(() => engine.label(76), RangeError);
assert.throws(() => engine.createDraw(() => 1), RangeError);
const card = engine.createCard(rng(44)), all = new Set(card.filter(n => n !== null));
assert.equal(engine.winningPattern(card, new Set(), all), null, 'Des cases non tirées ne peuvent jamais valider Bingo');
for (const indices of [[0,1,2,3,4], [0,5,10,15,20], [0,6,12,18,24], [4,8,12,16,20]]) {
  const marked = new Set(indices.map(i => card[i]).filter(n => n !== null));
  assert(engine.winningPattern(card, all, marked));
  assert.equal(engine.winningPattern(card, all, marked, 'full'), null);
}
assert(engine.winningPattern(card, all, all, 'full'));
const missing = new Set(all); missing.delete(card[0]);
assert.equal(engine.winningPattern(card, all, missing, 'full'), null);
assert.equal(engine.canMark(card, new Set(), card[0]), false);

// Execute actual UI code against a minimal DOM: interactions, timer lifecycle,
// winning validation, reset and denied storage. No network API is supplied.
class Element {
  constructor() { this.children=[]; this.listeners={}; this.dataset={}; this.attrs={}; this.value=''; this.disabled=false; this.textContent=''; }
  addEventListener(name, fn) { this.listeners[name]=fn; }
  setAttribute(k,v) { this.attrs[k]=v; }
  replaceChildren(...nodes) { this.children=nodes; }
  prepend(node) { this.children.unshift(node); }
  closest() { return this; }
  click() { if (!this.disabled) this.listeners.click?.({target:this}); }
}
function ui(denyStorage=false) {
  const elements = new Map(), timers=new Map(), storage=new Map(); let timerId=0;
  const get=id=>{ if(!elements.has(id))elements.set(id,new Element());return elements.get(id); };
  get('goal').value='line';
  const doc={hidden:false,listeners:{},getElementById:get,createElement:()=>new Element(),addEventListener(n,fn){this.listeners[n]=fn;}};
  const row = card.slice(0,5);
  const localEngine={...engine,createCard:()=>[...card],createDraw:()=>[...row].reverse()};
  const sandbox={window:{Bingo75:localEngine,addEventListener(){}},document:doc,Set,Number,JSON,
    localStorage:{getItem:k=>{if(denyStorage)throw Error('denied');return storage.get(k)||null;},setItem:(k,v)=>{if(denyStorage)throw Error('denied');storage.set(k,v);}},
    setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'games/bingo/bingo.js'),'utf8'),sandbox);
  function markFirstRow() { for (const button of get('card').children.slice(0,5)) get('card').listeners.click({target:button}); }
  return{get,timers,storage,doc,markFirstRow};
}
for (const denied of [false,true]) {
  const app=ui(denied);
  app.get('card').listeners.click({target:app.get('card').children[0]});
  assert.match(app.get('notice').textContent,/pas encore/);
  assert.equal(app.get('card').children[0].attrs['aria-pressed'],'false');
  app.get('auto').click(); assert.equal(app.timers.size,1);
  for(let i=0;i<4;i++) [...app.timers.values()][0]();
  assert.equal(app.timers.size,0,'L’auto s’arrête lorsque la combinaison est disponible');
  assert.equal(app.get('count').textContent,'5 / 75');
  app.get('claim').click(); assert.match(app.get('notice').textContent,/Pas encore/);
  app.markFirstRow(); app.get('claim').click();
  assert.match(app.get('notice').textContent,/Bingo validé en 5/);
  assert.equal(app.get('draw').disabled,true);assert.equal(app.get('claim').disabled,true);
  if(!denied)assert.equal(JSON.parse([...app.storage.values()][0]).line,5);
  app.get('restart').click(); assert.equal(app.get('count').textContent,'0 / 75');
  app.get('auto').click(); app.doc.hidden=true;app.doc.listeners.visibilitychange();
  assert.equal(app.timers.size,0,'Quitter l’onglet arrête l’auto');
}
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(home, /data-game="bingo"\s+data-free="true"/);
const html=fs.readFileSync(path.join(root,'games/bingo/index.html'),'utf8');
assert.match(html, /connect-src 'none'/);
assert.doesNotMatch(html, /arcade-(?:platform|game-bridge|supabase)/, 'Le bingo gratuit ne doit pas initialiser une session payante');
assert.match(html, /sans mise ni gain monétaire/i);
console.log('Bingo 75 : 250 grilles et tirages, victoires, refus des cases non tirées, auto/pause, stockage et parcours gratuit vérifiés.');
