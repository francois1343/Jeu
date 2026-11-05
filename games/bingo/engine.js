(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bingo75 = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const letters = 'BINGO';
  const range = (start, length) => Array.from({length}, (_, i) => start + i);
  function random() {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    }
    return Math.random();
  }
  function shuffle(values, rng = random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const value = rng();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Tirage invalide');
      const j = Math.floor(value * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function createCard(rng) {
    const columns = range(0, 5).map(col => shuffle(range(col * 15 + 1, 15), rng).slice(0, 5).sort((a, b) => a - b));
    return range(0, 25).map(index => index === 12 ? null : columns[index % 5][Math.floor(index / 5)]);
  }
  function createDraw(rng) { return shuffle(range(1, 75), rng); }
  function label(value) {
    if (!Number.isInteger(value) || value < 1 || value > 75) throw new RangeError('Numéro hors grille');
    return letters[Math.floor((value - 1) / 15)] + value;
  }
  function patterns(goal) {
    if (goal === 'full') return [range(0, 25)];
    if (goal !== 'line') throw new RangeError('Objectif inconnu');
    return [
      ...range(0, 5).map(row => range(row * 5, 5)),
      ...range(0, 5).map(col => range(0, 5).map(row => row * 5 + col)),
      [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
    ];
  }
  function winningPattern(card, called, marked, goal = 'line') {
    if (card.length !== 25) throw new RangeError('Grille invalide');
    return patterns(goal).find(indices => indices.every(i =>
      card[i] === null || (called.has(card[i]) && marked.has(card[i]))
    )) || null;
  }
  function canMark(card, called, value) {
    return Number.isInteger(value) && card.includes(value) && called.has(value);
  }
  return Object.freeze({createCard, createDraw, label, winningPattern, canMark});
});
