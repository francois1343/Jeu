(function () {
  'use strict';
  const engine = window.Bingo75;
  const $ = id => document.getElementById(id);
  const storageKey = 'francis-arcade.bingo75.best.v1';
  let card, deck, called, marked, finished, timer = null, best = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    for (const goal of ['line', 'full']) if (Number.isInteger(saved?.[goal]) && saved[goal] >= 1 && saved[goal] <= 75) best[goal] = saved[goal];
  } catch (_) { /* The game works when local storage is unavailable. */ }
  function notice(text, kind = '') { $('notice').textContent = text; $('notice').dataset.kind = kind; }
  function stopAuto() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    $('auto').setAttribute('aria-pressed', 'false');
    $('auto').textContent = 'Tirage auto · toutes les 4 s';
  }
  function ready() { return engine.winningPattern(card, called, called, $('goal').value); }
  function renderCard() {
    const winner = finished ? engine.winningPattern(card, called, marked, $('goal').value) : null;
    $('card').replaceChildren(...card.map((number, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.number = number ?? '';
      button.textContent = number === null ? 'LIBRE' : String(number);
      button.className = (number === null ? 'free ' : '') + (winner?.includes(index) ? 'winner' : '');
      button.setAttribute('aria-pressed', String(number === null || marked.has(number)));
      button.setAttribute('aria-label', number === null ? 'Centre libre, toujours coché' : engine.label(number));
      button.disabled = number === null || finished;
      return button;
    }));
  }
  function reset() {
    stopAuto(); card = engine.createCard(); deck = engine.createDraw(); called = new Set(); marked = new Set(); finished = false;
    $('goal').disabled = false; $('draw').disabled = false; $('auto').disabled = false; $('claim').disabled = false;
    $('last-letter').textContent = 'PRÊT ?'; $('last-number').textContent = '75'; $('count').textContent = '0 / 75';
    $('history').replaceChildren(); $('history-count').textContent = 'Aucun';
    $('best').textContent = best[$('goal').value] ? best[$('goal').value] + ' tirages' : '—';
    renderCard(); notice('Tire ton premier numéro pour commencer.');
  }
  function draw() {
    if (finished || !deck.length || ready()) return;
    const number = deck.pop(); called.add(number); $('goal').disabled = true;
    $('last-letter').textContent = engine.label(number)[0]; $('last-number').textContent = String(number);
    $('count').textContent = called.size + ' / 75'; $('history-count').textContent = String(called.size);
    const item = document.createElement('li'); item.textContent = engine.label(number); $('history').prepend(item);
    notice(engine.label(number) + ' vient de sortir. Coche-le s’il est sur ton carton.');
    if (ready()) {
      stopAuto(); $('draw').disabled = true; $('auto').disabled = true;
      notice('Une combinaison est disponible ! Vérifie les numéros annoncés, coche ton carton et annonce Bingo.');
    }
  }
  $('card').addEventListener('click', event => {
    const button = event.target.closest('button[data-number]');
    if (!button || finished || button.dataset.number === '') return;
    const number = Number(button.dataset.number);
    if (!engine.canMark(card, called, number)) { notice('Ce numéro n’a pas encore été annoncé.', 'error'); return; }
    if (marked.has(number)) marked.delete(number); else marked.add(number);
    button.setAttribute('aria-pressed', String(marked.has(number)));
    notice(marked.has(number) ? engine.label(number) + ' coché.' : engine.label(number) + ' décoché.');
  });
  $('draw').addEventListener('click', draw);
  $('auto').addEventListener('click', () => {
    if (timer !== null) { stopAuto(); notice('Tirage automatique en pause.'); return; }
    if (finished || ready()) return;
    $('auto').setAttribute('aria-pressed', 'true'); $('auto').textContent = 'Mettre le tirage en pause';
    timer = setInterval(draw, 4000); draw();
  });
  $('claim').addEventListener('click', () => {
    if (finished) return;
    if (!engine.winningPattern(card, called, marked, $('goal').value)) {
      notice('Pas encore de Bingo : complète l’objectif avec des numéros annoncés et cochés.', 'error'); return;
    }
    finished = true; stopAuto(); $('draw').disabled = true; $('auto').disabled = true; $('claim').disabled = true;
    const goal = $('goal').value;
    if (!best[goal] || called.size < best[goal]) {
      best[goal] = called.size;
      try { localStorage.setItem(storageKey, JSON.stringify(best)); } catch (_) { /* Optional local record. */ }
    }
    $('best').textContent = best[goal] + ' tirages'; renderCard();
    notice('Bingo validé en ' + called.size + ' tirages ! Rejoue avec une nouvelle grille.', 'success');
  });
  $('restart').addEventListener('click', reset);
  $('goal').addEventListener('change', () => { if (!called.size) reset(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer !== null) { stopAuto(); notice('Tirage en pause : reprends quand tu veux.'); }
  });
  window.addEventListener('pagehide', stopAuto);
  reset();
})();
