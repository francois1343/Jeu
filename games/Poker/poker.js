document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const SUITS = [
    { symbol: '♠', color: 'black' }, { symbol: '♥', color: 'red' },
    { symbol: '♦', color: 'red' }, { symbol: '♣', color: 'black' }
  ];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const BOT_PROFILES = [
    { name: 'Vince', style: 'Prudent', tight: .75, aggro: .28 },
    { name: 'Elena', style: 'Agressive', tight: .38, aggro: .78 },
    { name: 'Dmitri', style: 'Patient', tight: .58, aggro: .18 },
    { name: 'Sofia', style: 'Imprévisible', tight: .3, aggro: .72 },
    { name: 'Kaito', style: 'Équilibré', tight: .52, aggro: .5 },
    { name: 'Sarah', style: 'Sans peur', tight: .2, aggro: .9 },
    { name: 'Marcus', style: 'Curieux', tight: .28, aggro: .25 },
    { name: 'Chloé', style: 'Technique', tight: .62, aggro: .62 }
  ];
  const BLIND_LEVELS = [[10, 20], [15, 30], [25, 50], [40, 80], [60, 120], [100, 200], [150, 300], [250, 500]];
  const STREET_NAMES = { PREFLOP: 'PRÉFLOP', FLOP: 'FLOP', TURN: 'TOURNANT', RIVER: 'RIVIÈRE', SHOWDOWN: 'ABATTAGE' };

  const $ = id => document.getElementById(id);
  const dom = {
    lobby: $('lobby-screen'), game: $('game-screen'), bankroll: $('player-bankroll'),
    playerCount: $('player-count'), playerCountValue: $('player-count-value'), speedField: $('speed-field'),
    speed: $('tourney-speed'), start: $('btn-start'), leave: $('btn-leave'), sound: $('btn-sound'),
    modeLabel: $('game-mode-label'), blinds: $('blind-levels'), timer: $('tourney-timer'),
    handNumber: $('hand-number'), handStrength: $('hand-strength'), log: $('log-list'),
    pot: $('main-pot'), board: $('community-cards'), street: $('street-label'), seats: $('seats-container'),
    playersList: $('players-list'), playersLeft: $('players-left'), controls: $('player-controls'),
    turnIndicator: $('turn-indicator'), actionHint: $('action-hint'), slider: $('bet-slider'), betInput: $('bet-input'),
    fold: $('btn-fold'), checkCall: $('btn-check-call'), raise: $('btn-bet-raise'), allin: $('btn-all-in'),
    result: $('result-overlay'), resultKicker: $('result-kicker'), resultTitle: $('result-title'), resultDetail: $('result-detail')
  };

  let mode = 'cash';
  let bankroll = Number(localStorage.getItem('river_room_bankroll')) || 10000;
  let players = [], deck = [], board = [];
  let dealerIndex = -1, currentTurn = -1, currentBet = 0, lastFullRaise = 20;
  let smallBlind = 10, bigBlind = 20, blindLevel = 0;
  let street = 'PREFLOP', handNumber = 0, awaitingHuman = false, handOver = true;
  let sessionToken = 0, cashSettled = true, audioEnabled = true, audioContext = null;
  let levelTimer = null, levelEndsAt = 0, levelDuration = 180;

  const money = value => `${Math.max(0, Math.round(value)).toLocaleString('fr-FR')} €`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const totalPot = () => players.reduce((sum, player) => sum + player.contribution, 0);
  dom.bankroll.textContent = money(bankroll);

  document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    document.querySelectorAll('.mode-tab').forEach(button => {
      const selected = button === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    dom.speedField.classList.toggle('hidden', mode !== 'tournament');
  }));
  dom.playerCount.addEventListener('input', () => { dom.playerCountValue.textContent = dom.playerCount.value; });
  dom.start.addEventListener('click', startSession);
  dom.leave.addEventListener('click', leaveSession);
  dom.sound.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    dom.sound.classList.toggle('muted', !audioEnabled);
    dom.sound.textContent = audioEnabled ? '♪' : '×';
    if (audioEnabled) initAudio();
  });

  function initAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === 'suspended') audioContext.resume();
  }

  function sound(type) {
    if (!audioEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const tones = type === 'win' ? [523, 659, 784] : type === 'chips' ? [1050, 1320] : [210];
    tones.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type === 'chips' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * .06);
      gain.gain.setValueAtTime(type === 'win' ? .07 : .035, now + index * .06);
      gain.gain.exponentialRampToValueAtTime(.001, now + index * .06 + .12);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(now + index * .06); oscillator.stop(now + index * .06 + .13);
    });
  }

  function settleArcadeSession(outcome, metadata = {}) {
    const arcadeSession = window.ArcadeGameSession;
    if (!arcadeSession || arcadeSession.state !== 'started') return;
    if (outcome === 'won') arcadeSession.win(metadata);
    else if (outcome === 'lost') arcadeSession.lose(metadata);
    else arcadeSession.abandon(metadata.reason || 'left_table');
  }
  function startSession() {
    initAudio();
    sessionToken += 1;
    clearInterval(levelTimer);
    const count = Number(dom.playerCount.value);
    const startingStack = mode === 'tournament' ? 1500 : 1000;
    players = [{ id: 0, name: 'Vous', style: 'Hero', stack: startingStack, startingStack, isHuman: true }];
    for (let i = 1; i < count; i += 1) {
      const profile = BOT_PROFILES[i - 1];
      players.push({ id: i, ...profile, stack: startingStack, startingStack, isHuman: false });
    }
    players.forEach(resetPersistentPlayerState);
    dealerIndex = -1; handNumber = 0; blindLevel = 0; [smallBlind, bigBlind] = BLIND_LEVELS[0];
    cashSettled = mode !== 'cash';
    dom.log.innerHTML = '';
    dom.lobby.classList.add('hidden'); dom.game.classList.remove('hidden');
    dom.modeLabel.textContent = mode === 'cash' ? 'CASH · TABLE 01' : 'TOURNOI · SIT & GO';
    if (mode === 'tournament') startLevelClock(); else dom.timer.classList.add('hidden');
    updateBlindsLabel();
    startNewHand();
  }

  function resetPersistentPlayerState(player) {
    Object.assign(player, { cards: [], streetBet: 0, contribution: 0, folded: false, allIn: false, hasActed: false, action: '', eliminated: false });
  }

  function leaveSession() {
    settleArcadeSession('abandoned', { reason: 'left_table' });
    if (mode === 'cash' && !cashSettled && players[0]) {
      bankroll = Math.max(0, bankroll + players[0].stack - players[0].startingStack);
      localStorage.setItem('river_room_bankroll', String(bankroll));
      cashSettled = true;
    }
    sessionToken += 1; clearInterval(levelTimer); levelTimer = null;
    awaitingHuman = false; handOver = true;
    dom.result.classList.add('hidden'); dom.game.classList.add('hidden'); dom.lobby.classList.remove('hidden');
    dom.bankroll.textContent = money(bankroll);
  }

  function startLevelClock() {
    levelDuration = dom.speed.value === 'standard' ? 300 : 180;
    levelEndsAt = Date.now() + levelDuration * 1000;
    dom.timer.classList.remove('hidden');
    clearInterval(levelTimer);
    levelTimer = setInterval(() => {
      let remaining = Math.max(0, Math.ceil((levelEndsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        blindLevel = Math.min(blindLevel + 1, BLIND_LEVELS.length - 1);
        [smallBlind, bigBlind] = BLIND_LEVELS[blindLevel];
        levelEndsAt = Date.now() + levelDuration * 1000; remaining = levelDuration;
        addLog(`Niveau ${blindLevel + 1} : blindes ${smallBlind}/${bigBlind}`, true);
        updateBlindsLabel();
      }
      dom.timer.textContent = `Niveau suivant · ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    }, 500);
  }

  function updateBlindsLabel() { dom.blinds.textContent = `Blindes ${smallBlind} / ${bigBlind}`; }

  function startNewHand() {
    handOver = false; awaitingHuman = false; dom.result.classList.add('hidden'); disableControls();
    if (mode === 'cash') players.slice(1).forEach(player => { if (player.stack <= 0) player.stack = player.startingStack; });
    players.forEach(player => {
      player.cards = []; player.streetBet = 0; player.contribution = 0; player.folded = player.stack <= 0;
      player.allIn = false; player.hasActed = false; player.action = ''; player.eliminated = player.stack <= 0;
    });
    const contenders = players.filter(player => player.stack > 0);
    if (players[0].stack <= 0) return endSessionMessage('ÉLIMINATION', mode === 'cash' ? 'Vous avez perdu votre cave' : 'Votre tournoi est terminé', 'Quittez la table pour revenir au salon.');
    if (contenders.length === 1) return endSessionMessage('VICTOIRE', 'Vous remportez le tournoi', 'Tous vos adversaires ont été éliminés.');

    handNumber += 1; dom.handNumber.textContent = `#${String(handNumber).padStart(3, '0')}`;
    dealerIndex = nextIndexWithStack(dealerIndex);
    street = 'PREFLOP'; currentBet = 0; lastFullRaise = bigBlind;
    board = []; deck = createDeck(); shuffle(deck);
    addLog(`Main #${handNumber} — nouvelles cartes`, true);
    postBlinds();
    for (let round = 0; round < 2; round += 1) players.forEach(player => { if (!player.folded) player.cards.push(deck.pop()); });
    sound('card'); render();

    const active = players.filter(player => !player.folded);
    const sbIndex = active.length === 2 ? dealerIndex : nextIndexInHand(dealerIndex);
    const bbIndex = nextIndexInHand(sbIndex);
    const firstToAct = active.length === 2 ? dealerIndex : nextIndexInHand(bbIndex);
    startBettingRound(firstToAct, true);
  }

  function createDeck() {
    return SUITS.flatMap(suit => RANKS.map((label, index) => ({ suit, label, value: index + 2 })));
  }
  function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }
  function nextIndexWithStack(start) {
    let index = start;
    for (let i = 0; i < players.length; i += 1) { index = (index + 1) % players.length; if (players[index].stack > 0) return index; }
    return -1;
  }
  function nextIndexInHand(start) {
    let index = start;
    for (let i = 0; i < players.length; i += 1) { index = (index + 1) % players.length; if (!players[index].folded) return index; }
    return -1;
  }

  function postBlinds() {
    const activeCount = players.filter(player => !player.folded).length;
    const sbIndex = activeCount === 2 ? dealerIndex : nextIndexInHand(dealerIndex);
    const bbIndex = nextIndexInHand(sbIndex);
    commitChips(players[sbIndex], smallBlind); commitChips(players[bbIndex], bigBlind);
    currentBet = Math.max(players[sbIndex].streetBet, players[bbIndex].streetBet);
    players[sbIndex].action = 'Petite blinde'; players[bbIndex].action = 'Grande blinde';
    addLog(`${players[sbIndex].name} pose ${money(players[sbIndex].streetBet)}`);
    addLog(`${players[bbIndex].name} pose ${money(players[bbIndex].streetBet)}`);
  }

  function commitChips(player, requested) {
    const amount = Math.max(0, Math.min(player.stack, requested));
    player.stack -= amount; player.streetBet += amount; player.contribution += amount;
    if (player.stack === 0) player.allIn = true;
    if (amount) sound('chips');
    return amount;
  }

  function startBettingRound(firstToAct, keepBlindBets = false) {
    players.forEach(player => { player.hasActed = false; if (!keepBlindBets) player.streetBet = 0; });
    if (!keepBlindBets) currentBet = 0;
    lastFullRaise = bigBlind; currentTurn = firstToAct;
    processTurn();
  }

  function roundComplete() {
    const live = players.filter(player => !player.folded);
    if (live.length <= 1) return true;
    const actionable = live.filter(player => !player.allIn);
    if (!actionable.length) return true;
    return actionable.every(player => player.hasActed && player.streetBet === currentBet);
  }

  function processTurn() {
    if (handOver) return;
    const live = players.filter(player => !player.folded);
    if (live.length <= 1) return awardUncontested(live[0]);
    if (roundComplete()) return advanceStreet();

    let player = players[currentTurn];
    let guard = 0;
    while ((player.folded || player.allIn) && guard < players.length) {
      currentTurn = nextIndexInHand(currentTurn); player = players[currentTurn]; guard += 1;
    }
    render();
    if (player.isHuman) {
      awaitingHuman = true; setupControls(player);
    } else {
      awaitingHuman = false; disableControls(player);
      const token = sessionToken; const playerId = player.id;
      setTimeout(() => { if (token === sessionToken && !handOver && players[currentTurn]?.id === playerId) botTurn(player); }, 420 + Math.random() * 420);
    }
  }

  function takeAction(type, target = 0) {
    if (handOver) return;
    const player = players[currentTurn];
    const callCost = Math.max(0, currentBet - player.streetBet);
    let label = '';
    if (type === 'fold') { player.folded = true; label = 'Se couche'; addLog(`${player.name} se couche`); }
    else if (type === 'check' && callCost === 0) { label = 'Parole'; addLog(`${player.name} dit parole`); }
    else if (type === 'call') {
      const paid = commitChips(player, callCost); label = player.allIn ? 'Tapis' : `Suit ${money(paid)}`;
      addLog(`${player.name} suit ${money(paid)}${player.allIn ? ' à tapis' : ''}`);
    } else if (type === 'allin') {
      const previousHigh = currentBet; const targetBet = player.streetBet + player.stack;
      commitChips(player, player.stack);
      if (targetBet > previousHigh) registerRaise(player, previousHigh, targetBet);
      label = 'Tapis'; addLog(`${player.name} fait tapis à ${money(player.streetBet)}`, true);
    } else if (type === 'raise') {
      const maxTarget = player.streetBet + player.stack;
      const minTarget = currentBet === 0 ? bigBlind : currentBet + lastFullRaise;
      const legalTarget = clamp(Math.round(target), Math.min(minTarget, maxTarget), maxTarget);
      const previousHigh = currentBet;
      commitChips(player, legalTarget - player.streetBet);
      if (player.streetBet > previousHigh) registerRaise(player, previousHigh, player.streetBet);
      label = previousHigh ? `Relance ${money(player.streetBet)}` : `Mise ${money(player.streetBet)}`;
      addLog(`${player.name} ${previousHigh ? 'relance à' : 'mise'} ${money(player.streetBet)}`, true);
    } else return;

    player.action = label; player.hasActed = true; awaitingHuman = false; disableControls(); render();
    currentTurn = nextIndexInHand(currentTurn);
    processTurn();
  }

  function registerRaise(raiser, previousHigh, target) {
    const raiseSize = target - previousHigh;
    currentBet = target;
    if (raiseSize >= lastFullRaise) {
      lastFullRaise = raiseSize;
      players.forEach(player => { if (player !== raiser && !player.folded && !player.allIn) player.hasActed = false; });
    }
  }

  function advanceStreet() {
    players.forEach(player => { player.streetBet = 0; player.hasActed = false; player.action = ''; });
    currentBet = 0; lastFullRaise = bigBlind;
    if (street === 'RIVER') return showdown();
    if (street === 'PREFLOP') { street = 'FLOP'; board.push(deck.pop(), deck.pop(), deck.pop()); }
    else if (street === 'FLOP') { street = 'TURN'; board.push(deck.pop()); }
    else if (street === 'TURN') { street = 'RIVER'; board.push(deck.pop()); }
    sound('card'); addLog(`— ${STREET_NAMES[street]} —`, true); render();
    const canAct = players.filter(player => !player.folded && !player.allIn);
    if (canAct.length <= 1) return runOutBoard();
    startBettingRound(nextIndexInHand(dealerIndex));
  }

  function runOutBoard() {
    disableControls();
    const token = sessionToken;
    setTimeout(() => {
      if (token !== sessionToken || handOver) return;
      if (street === 'RIVER') showdown(); else advanceStreet();
    }, 650);
  }

  function botTurn(bot) {
    const callCost = Math.max(0, currentBet - bot.streetBet);
    const strength = estimateStrength(bot);
    const pressure = callCost / Math.max(1, totalPot() + callCost);
    const random = Math.random();
    if (callCost === 0) {
      if (bot.stack > 0 && random < bot.aggro * (.25 + strength * .65)) {
        const desired = Math.max(bigBlind, Math.round(totalPot() * (.35 + Math.random() * .35)));
        takeAction('raise', currentBet + desired);
      } else takeAction('check');
      return;
    }
    const foldThreshold = .18 + pressure * .9 + bot.tight * .16;
    if (strength + random * .42 < foldThreshold && callCost < bot.stack) return takeAction('fold');
    if (strength > .56 && random < bot.aggro * .42 && bot.stack > callCost + lastFullRaise) {
      return takeAction('raise', currentBet + Math.max(lastFullRaise, Math.round(totalPot() * .45)));
    }
    takeAction('call');
  }

  function estimateStrength(player) {
    if (board.length >= 3) return Math.min(.98, .15 + evaluateBest([...player.cards, ...board]).category * .105);
    const [a, b] = player.cards;
    if (!a || !b) return .2;
    let score = (a.value + b.value) / 30;
    if (a.value === b.value) score += .3 + a.value / 50;
    if (a.suit.symbol === b.suit.symbol) score += .07;
    if (Math.abs(a.value - b.value) <= 2) score += .06;
    return clamp(score, .08, .95);
  }

  function setupControls(player) {
    dom.controls.classList.remove('disabled');
    const callCost = Math.max(0, currentBet - player.streetBet);
    dom.turnIndicator.innerHTML = '<i></i> À vous de jouer';
    dom.actionHint.textContent = callCost ? `${money(callCost)} pour suivre` : 'Vous pouvez dire parole ou miser';
    dom.checkCall.querySelector('span').textContent = callCost ? `Suivre ${money(Math.min(callCost, player.stack))}` : 'Parole';
    const maxTarget = player.streetBet + player.stack;
    const minTarget = Math.min(maxTarget, currentBet === 0 ? bigBlind : currentBet + lastFullRaise);
    dom.slider.min = minTarget; dom.slider.max = Math.max(minTarget, maxTarget); setBetValue(minTarget);
    dom.raise.disabled = maxTarget <= currentBet;
  }

  function disableControls(activeBot) {
    dom.controls.classList.add('disabled');
    dom.turnIndicator.innerHTML = `<i></i> ${activeBot ? `Au tour de ${activeBot.name}` : 'Distribution en cours'}`;
    dom.actionHint.textContent = activeBot ? 'Observez sa décision' : 'La table se prépare';
  }
  function setBetValue(value) {
    const min = Number(dom.slider.min), max = Number(dom.slider.max);
    const safe = clamp(Math.round(Number(value) || min), min, max);
    dom.slider.value = safe; dom.betInput.value = safe;
  }
  dom.slider.addEventListener('input', () => { dom.betInput.value = dom.slider.value; });
  dom.betInput.addEventListener('change', () => setBetValue(dom.betInput.value));
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const player = players[currentTurn]; if (!awaitingHuman || !player) return;
    const preset = button.dataset.preset;
    const amount = preset === 'max' ? player.streetBet + player.stack : currentBet + Math.round(totalPot() * (preset === 'half' ? .5 : 1));
    setBetValue(amount);
  }));
  dom.fold.addEventListener('click', () => { if (awaitingHuman) takeAction('fold'); });
  dom.checkCall.addEventListener('click', () => { if (awaitingHuman) takeAction(currentBet > players[currentTurn].streetBet ? 'call' : 'check'); });
  dom.raise.addEventListener('click', () => { if (awaitingHuman) takeAction('raise', Number(dom.betInput.value)); });
  dom.allin.addEventListener('click', () => { if (awaitingHuman) takeAction('allin'); });
  document.addEventListener('keydown', event => {
    if (!awaitingHuman || ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (event.key.toLowerCase() === 'f') takeAction('fold');
    if (event.key.toLowerCase() === 'c') takeAction(currentBet > players[currentTurn].streetBet ? 'call' : 'check');
    if (event.key.toLowerCase() === 'r') takeAction('raise', Number(dom.betInput.value));
  });

  function awardUncontested(winner) {
    if (!winner || handOver) return;
    handOver = true; const pot = totalPot(); winner.stack += pot;
    addLog(`${winner.name} remporte ${money(pot)} sans abattage`, true); sound('win'); render();
    showResult(winner.isHuman ? 'POT REMPORTÉ' : 'MAIN TERMINÉE', winner.isHuman ? 'Vous remportez le pot' : `${winner.name} remporte le pot`, `${money(pot)} · sans abattage`);
    scheduleNextHand();
  }

  function showdown() {
    if (handOver) return;
    handOver = true; street = 'SHOWDOWN';
    const live = players.filter(player => !player.folded);
    const evaluations = new Map(live.map(player => [player.id, evaluateBest([...player.cards, ...board])]));
    live.forEach(player => addLog(`${player.name} : ${evaluations.get(player.id).name}`));
    const payouts = distributePots(evaluations);
    render(); sound('win');
    const heroWin = payouts.get(players[0].id) || 0;
    const topWinner = [...payouts.entries()].sort((a, b) => b[1] - a[1])[0];
    const winner = players.find(player => player.id === topWinner[0]);
    if (heroWin) showResult('ABATTAGE', 'Vous remportez le pot', `${evaluations.get(0).name} · ${money(heroWin)}`);
    else showResult('ABATTAGE', `${winner.name} remporte le pot`, `${evaluations.get(winner.id).name} · ${money(topWinner[1])}`);
    scheduleNextHand();
  }

  function distributePots(evaluations) {
    const levels = [...new Set(players.filter(player => player.contribution > 0).map(player => player.contribution))].sort((a, b) => a - b);
    const payouts = new Map(); let previous = 0;
    levels.forEach(level => {
      const contributors = players.filter(player => player.contribution >= level);
      const pot = (level - previous) * contributors.length;
      const eligible = contributors.filter(player => !player.folded);
      if (!eligible.length) { previous = level; return; }
      let winners = [eligible[0]];
      eligible.slice(1).forEach(player => {
        const comparison = compareEvaluation(evaluations.get(player.id), evaluations.get(winners[0].id));
        if (comparison > 0) winners = [player]; else if (comparison === 0) winners.push(player);
      });
      const share = Math.floor(pot / winners.length); let remainder = pot - share * winners.length;
      winners.forEach(winner => {
        const gain = share + (remainder-- > 0 ? 1 : 0); winner.stack += gain;
        payouts.set(winner.id, (payouts.get(winner.id) || 0) + gain);
      });
      previous = level;
    });
    payouts.forEach((gain, id) => addLog(`${players.find(player => player.id === id).name} gagne ${money(gain)}`, true));
    return payouts;
  }

  function scheduleNextHand() {
    disableControls(); const token = sessionToken;
    setTimeout(() => { if (token === sessionToken) startNewHand(); }, 2600);
  }
  function endSessionMessage(kicker, title, detail) {
    settleArcadeSession(kicker === 'VICTOIRE' ? 'won' : 'lost', { mode, hands: handNumber });
    handOver = true; disableControls(); showResult(kicker, title, detail, true);
  }
  function showResult(kicker, title, detail, persistent = false) {
    dom.resultKicker.textContent = kicker; dom.resultTitle.textContent = title; dom.resultDetail.textContent = detail;
    dom.result.classList.remove('hidden');
    if (!persistent) setTimeout(() => dom.result.classList.add('hidden'), 2200);
  }

  function getCombinations(cards, size) {
    if (size === 0) return [[]];
    if (cards.length < size) return [];
    return cards.flatMap((card, index) => getCombinations(cards.slice(index + 1), size - 1).map(combo => [card, ...combo]));
  }
  function evaluateBest(cards) {
    if (cards.length < 5) return { category: -1, tiebreak: [], name: 'Main en cours' };
    return getCombinations(cards, 5).map(evaluateFive).reduce((best, current) => compareEvaluation(current, best) > 0 ? current : best);
  }
  function evaluateFive(cards) {
    const values = cards.map(card => card.value).sort((a, b) => b - a);
    const counts = new Map(); values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const unique = [...new Set(values)];
    let straightHigh = 0;
    if (unique.length === 5 && unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique.join(',') === '14,5,4,3,2') straightHigh = 5;
    const flush = cards.every(card => card.suit.symbol === cards[0].suit.symbol);
    if (flush && straightHigh) return { category: 8, tiebreak: [straightHigh], name: straightHigh === 14 ? 'Quinte flush royale' : 'Quinte flush' };
    if (groups[0][1] === 4) return { category: 7, tiebreak: [groups[0][0], groups[1][0]], name: 'Carré' };
    if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, tiebreak: [groups[0][0], groups[1][0]], name: 'Full' };
    if (flush) return { category: 5, tiebreak: values, name: 'Couleur' };
    if (straightHigh) return { category: 4, tiebreak: [straightHigh], name: 'Quinte' };
    if (groups[0][1] === 3) return { category: 3, tiebreak: [groups[0][0], ...groups.slice(1).map(group => group[0]).sort((a, b) => b - a)], name: 'Brelan' };
    if (groups[0][1] === 2 && groups[1][1] === 2) return { category: 2, tiebreak: [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]], name: 'Deux paires' };
    if (groups[0][1] === 2) return { category: 1, tiebreak: [groups[0][0], ...groups.slice(1).map(group => group[0]).sort((a, b) => b - a)], name: 'Une paire' };
    return { category: 0, tiebreak: values, name: `Hauteur ${RANKS[values[0] - 2]}` };
  }
  function compareEvaluation(left, right) {
    if (left.category !== right.category) return left.category - right.category;
    const length = Math.max(left.tiebreak.length, right.tiebreak.length);
    for (let i = 0; i < length; i += 1) if ((left.tiebreak[i] || 0) !== (right.tiebreak[i] || 0)) return (left.tiebreak[i] || 0) - (right.tiebreak[i] || 0);
    return 0;
  }

  function addLog(message, important = false) {
    const item = document.createElement('li'); item.textContent = message; item.classList.toggle('important', important);
    dom.log.prepend(item); while (dom.log.children.length > 14) dom.log.lastElementChild.remove();
  }
  function cardHtml(card, hidden = false) {
    if (hidden) return '<div class="card back"></div>';
    return `<div class="card ${card.suit.color}"><span>${card.label}</span><span class="suit">${card.suit.symbol}</span></div>`;
  }
  function render() {
    dom.pot.textContent = money(totalPot()); dom.street.textContent = STREET_NAMES[street];
    dom.board.innerHTML = Array.from({ length: 5 }, (_, index) => board[index] ? cardHtml(board[index]) : '<div class="card placeholder"></div>').join('');
    const heroCards = players[0]?.cards || [];
    if (board.length >= 3 && heroCards.length === 2) dom.handStrength.textContent = evaluateBest([...heroCards, ...board]).name;
    else if (heroCards.length === 2) dom.handStrength.textContent = heroCards[0].value === heroCards[1].value ? `Paire de ${heroCards[0].label}` : `Hauteur ${heroCards[0].value > heroCards[1].value ? heroCards[0].label : heroCards[1].label}`;
    else dom.handStrength.textContent = 'En attente';

    dom.seats.innerHTML = '';
    players.forEach((player, index) => {
      const angle = Math.PI / 2 + index * Math.PI * 2 / players.length;
      const x = 50 + Math.cos(angle) * 51; const y = 50 + Math.sin(angle) * 54;
      const seat = document.createElement('div');
      seat.className = `seat${player.isHuman ? ' hero' : ''}${player.folded ? ' folded' : ''}${!handOver && index === currentTurn ? ' active' : ''}`;
      seat.style.setProperty('--x', `${x}%`); seat.style.setProperty('--y', `${y}%`);
      const reveal = player.isHuman || street === 'SHOWDOWN';
      const cards = player.cards.map(card => cardHtml(card, !reveal)).join('');
      seat.innerHTML = `<div class="seat-cards">${cards}</div><div class="player-box"><span class="player-name">${player.name}</span><span class="player-stack">${player.stack <= 0 ? 'Éliminé' : money(player.stack)}</span>${index === dealerIndex ? '<span class="dealer-chip">D</span>' : ''}${player.streetBet ? `<span class="seat-bet">${money(player.streetBet)}</span>` : ''}${player.action && !player.streetBet ? `<span class="action-bubble">${player.action}</span>` : ''}</div>`;
      dom.seats.appendChild(seat);
    });
    dom.playersList.innerHTML = players.map(player => `<div class="player-row ${player.stack <= 0 ? 'out' : ''}"><i class="avatar">${player.name[0]}</i><span>${player.name}</span><b>${money(player.stack)}</b></div>`).join('');
    const remaining = players.filter(player => player.stack > 0).length;
    dom.playersLeft.textContent = `${remaining} / ${players.length}`;
  }

  // Surface de diagnostic en lecture seule, utile pour les tests locaux.
  window.__riverRoomDebug = Object.freeze({
    state: () => ({
      street, currentTurn, currentBet, handNumber, handOver,
      players: players.map(player => ({ name: player.name, stack: player.stack, bet: player.streetBet, folded: player.folded, allIn: player.allIn, acted: player.hasActed }))
    }),
    evaluate: cards => evaluateBest(cards)
  });

  render();
});
