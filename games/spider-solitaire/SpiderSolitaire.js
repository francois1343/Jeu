/**
 * CYBER SPIDER SOLITAIRE - Game Engine
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- CONSTANTES & CONFIGURATION ---
  const SUITS = {
    spade: { symbol: "♠", class: "spade" },
    heart: { symbol: "♥", class: "heart" },
    diamond: { symbol: "♦", class: "diamond" },
    club: { symbol: "♣", class: "club" },
  };

  const VALUES = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  const LEADERBOARD_KEY = "spider_solitaire_leaderboard";
  const THEME_KEY = "spider_solitaire_theme";

  // --- ÉTAT DU JEU ---
  let difficulty = 1; // 1, 2 ou 4 couleurs
  let deck = [];
  let columns = [[], [], [], [], [], [], [], [], [], []];
  let stock = [];
  let completedSuits = 0;
  let completedSequences = [];
  let score = 500;
  let moves = 0;
  let secondsElapsed = 0;
  let timerInterval = null;
  let isGameActive = false;
  let history = [];
  let leaderboardDifficulty = 1;
  let gameSession = 0;
  const completingColumns = new Set();

  // Drag & Drop State
  let draggedCards = [];
  let sourceColIndex = -1;
  let dragOffset = { x: 0, y: 0 };
  let dragProxy = null;

  // Éléments DOM
  const board = document.getElementById("solitaire-board");
  const columnElements = document.querySelectorAll(".column");
  const foundationSlots = document.querySelectorAll(".foundation-slot");
  const stockPile = document.getElementById("stock-pile");
  const stockCount = document.getElementById("stock-count");
  const scoreDisplay = document.getElementById("score-display");
  const movesDisplay = document.getElementById("moves-display");
  const timerDisplay = document.getElementById("timer-display");
  const difficultyOverlay = document.getElementById("difficulty-overlay");
  const leaderboardOverlay = document.getElementById("leaderboard-overlay");
  const victoryOverlay = document.getElementById("victory-overlay");
  const homeConfirmOverlay = document.getElementById("home-confirm-overlay");
  const victoryStats = document.getElementById("victory-stats");
  const bestScoreDisplay = document.getElementById("best-score-display");
  const leaderboardList = document.getElementById("leaderboard-list");
  const leaderboardTabs = document.querySelectorAll(".leaderboard-tab");
  const themeToggles = document.querySelectorAll("[data-theme-toggle]");
  const canvas = document.getElementById("effects-canvas");
  const ctx = canvas.getContext("2d");

  // --- THÈMES CLAIR & SOMBRE ---
  function applyTheme(theme, persist = false) {
    const activeTheme = theme === "dark" ? "dark" : "light";
    const darkModeEnabled = activeTheme === "dark";
    document.documentElement.dataset.theme = activeTheme;

    themeToggles.forEach((toggle) => {
      const nextThemeLabel = darkModeEnabled
        ? "Activer le thème clair"
        : "Activer le thème sombre";
      toggle.setAttribute("aria-label", nextThemeLabel);
      toggle.setAttribute("aria-pressed", String(darkModeEnabled));
      toggle.title = nextThemeLabel;

      const icon = toggle.querySelector(".theme-icon");
      const label = toggle.querySelector(".theme-label");
      if (icon) icon.textContent = darkModeEnabled ? "☀️" : "🌙";
      if (label)
        label.textContent = darkModeEnabled ? "THÈME CLAIR" : "THÈME SOMBRE";
    });

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, activeTheme);
      } catch (error) {
        // Le changement reste actif pour la session si le stockage est indisponible.
      }
    }
  }

  applyTheme(document.documentElement.dataset.theme);

  themeToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const nextTheme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
    });
  });

  // --- MOTEUR AUDIO (Web Audio API) ---
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
  }

  function playSound(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    if (type === "card") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "complete") {
      const notes = [261.63, 329.63, 392.0, 523.25];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.1, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.2);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.2);
      });
    } else if (type === "error") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(100, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "win") {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.2, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.4);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.4);
      });
    }
  }

  function triggerHaptic() {
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // --- INITIALISATION DU JEU ---
  function startNewGame(selectedDifficulty) {
    window.ArcadeGameSession?.start({ difficulty: selectedDifficulty });
    gameSession++;
    difficulty = parseInt(selectedDifficulty);
    completedSuits = 0;
    completedSequences = [];
    completingColumns.clear();
    score = 500;
    moves = 0;
    history = [];
    columns = Array.from({ length: 10 }, () => []);

    createDeck();
    shuffleDeck();
    dealInitialCards();

    difficultyOverlay.classList.add("hidden");
    victoryOverlay.classList.add("hidden");
    isGameActive = true;

    startTimer();
    updateUI();
    saveState();
  }

  function createDeck() {
    deck = [];
    let suitsToUse = [];

    if (difficulty === 1) {
      suitsToUse = Array(8).fill("spade");
    } else if (difficulty === 2) {
      suitsToUse = Array(4).fill("spade").concat(Array(4).fill("heart"));
    } else {
      suitsToUse = Array(2)
        .fill("spade")
        .concat(Array(2).fill("heart"))
        .concat(Array(2).fill("diamond"))
        .concat(Array(2).fill("club"));
    }

    let idCounter = 0;
    suitsToUse.forEach((suitKey) => {
      VALUES.forEach((val, index) => {
        deck.push({
          id: idCounter++,
          value: index + 1, // 1 (A) à 13 (K)
          valueText: val,
          suit: suitKey,
          faceUp: false,
        });
      });
    });
  }

  function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  function dealInitialCards() {
    // Les 54 premières cartes vont dans les 10 colonnes (4 colonnes de 6, 6 colonnes de 5)
    for (let i = 0; i < 54; i++) {
      const colIndex = i % 10;
      const card = deck.pop();
      if (i >= 44) card.faceUp = true; // Dernière carte de chaque colonne face visible
      columns[colIndex].push(card);
    }

    // Le reste (50 cartes) va dans la pioche
    stock = [];
    while (deck.length > 0) {
      stock.push(deck.pop());
    }

    renderBoard();
  }

  // --- RENDU VISUEL ---
  function renderBoard() {
    columnElements.forEach((colEl, colIndex) => {
      colEl.innerHTML = "";
      const colCards = columns[colIndex];

      colCards.forEach((card, cardIndex) => {
        const cardEl = createCardElement(card, colIndex, cardIndex);
        // Décalage vertical (Vertical Stacking)
        const topOffset = getCardTopOffset(colCards, cardIndex);
        cardEl.style.top = `${topOffset}px`;
        colEl.appendChild(cardEl);
      });
    });

    // Stock UI
    const dealsLeft = Math.ceil(stock.length / 10);
    stockCount.textContent = dealsLeft;
    if (dealsLeft === 0) {
      stockPile.classList.add("empty");
    } else {
      stockPile.classList.remove("empty");
    }

    updateUI();
    renderFoundations();
  }

  function renderFoundations() {
    foundationSlots.forEach((slot, index) => {
      slot.innerHTML = "";
      const suit = completedSequences[index];
      if (!suit) return;

      const cardEl = createCardElement(
        {
          value: 1,
          valueText: "A",
          suit,
          faceUp: true,
        },
        -1,
        -1,
      );
      cardEl.style.position = "relative";
      cardEl.style.top = "0";
      cardEl.style.pointerEvents = "none";
      slot.appendChild(cardEl);
    });
  }

  function getCardTopOffset(colCards, cardIndex) {
    let offset = 0;
    for (let i = 0; i < cardIndex; i++) {
      offset += colCards[i].faceUp ? 24 : 12; // Décalage plus court pour cartes cachées
    }
    return offset;
  }

  function createCardElement(card, colIndex, cardIndex) {
    const cardEl = document.createElement("div");
    cardEl.className = `card ${card.faceUp ? SUITS[card.suit].class : "face-down"}`;
    cardEl.dataset.col = colIndex;
    cardEl.dataset.index = cardIndex;

    if (card.faceUp) {
      const suitSymbol = SUITS[card.suit].symbol;
      cardEl.innerHTML = `
                <div class="card-corner card-corner-top">
                    <span class="card-rank">${card.valueText}</span>
                    <span class="card-suit">${suitSymbol}</span>
                </div>
                <div class="card-art" aria-hidden="true">
                    <span class="web-orbit"></span>
                    <svg class="spider-emblem" viewBox="0 0 100 100" focusable="false">
                        <circle cx="50" cy="31" r="10"></circle>
                        <ellipse cx="50" cy="57" rx="14" ry="19"></ellipse>
                        <path fill="none" d="M39 43 18 27M37 51 12 46M37 60 12 68M39 68 21 86M61 43 82 27M63 51 88 46M63 60 88 68M61 68 79 86"></path>
                    </svg>
                    <span class="card-center-icon">${suitSymbol}</span>
                </div>
                <div class="card-corner card-corner-bottom">
                    <span class="card-rank">${card.valueText}</span>
                    <span class="card-suit">${suitSymbol}</span>
                </div>
            `;

      // Interactions
      cardEl.addEventListener("mousedown", handleDragStart);
      cardEl.addEventListener("touchstart", handleDragStart, {
        passive: false,
      });
      cardEl.addEventListener("click", handleCardClick);
    } else {
      cardEl.innerHTML = `
                <div class="card-back-design" aria-hidden="true">
                    <svg class="spider-back-emblem" viewBox="0 0 100 100" focusable="false">
                        <circle cx="50" cy="31" r="10"></circle>
                        <ellipse cx="50" cy="57" rx="14" ry="19"></ellipse>
                        <path fill="none" d="M39 43 18 27M37 51 12 46M37 60 12 68M39 68 21 86M61 43 82 27M63 51 88 46M63 60 88 68M61 68 79 86"></path>
                    </svg>
                </div>
            `;
    }

    return cardEl;
  }

  function updateUI() {
    scoreDisplay.textContent = score;
    movesDisplay.textContent = moves;
  }

  // --- RÈGLES DE JEU & VALIDATIONS ---
  function isValidSequence(cards) {
    for (let i = 0; i < cards.length - 1; i++) {
      const current = cards[i];
      const next = cards[i + 1];
      // Doivent être de la même enseigne et décroissantes de 1
      if (current.suit !== next.suit || current.value !== next.value + 1) {
        return false;
      }
    }
    return true;
  }

  function canMoveToColumn(draggedSequence, targetColIndex) {
    const targetCol = columns[targetColIndex];
    if (targetCol.length === 0) return true; // Tout déplacement est valide sur colonne vide

    const topCard = targetCol[targetCol.length - 1];
    const movingCard = draggedSequence[0];

    // Doit être immédiatement inférieure en valeur (ex: un 8 sur un 9)
    return topCard.faceUp && topCard.value === movingCard.value + 1;
  }

  // --- AUTO-MOVE & CLIC ---
  function handleCardClick(e) {
    if (draggedCards.length > 0) return; // Ignore si en cours de drag

    const cardEl = e.currentTarget;
    const colIndex = parseInt(cardEl.dataset.col);
    const cardIndex = parseInt(cardEl.dataset.index);
    const colCards = columns[colIndex];
    const sequence = colCards.slice(cardIndex);

    if (!isValidSequence(sequence)) return;

    // Trouver la meilleure colonne cible
    let targetColIndex = -1;
    let sameSuitTarget = -1;

    for (let i = 0; i < 10; i++) {
      if (i === colIndex) continue;
      if (canMoveToColumn(sequence, i)) {
        const targetCol = columns[i];
        if (targetCol.length > 0) {
          const topCard = targetCol[targetCol.length - 1];
          if (topCard.suit === sequence[0].suit) {
            sameSuitTarget = i; // Priorité 1: Même couleur
            break;
          }
        }
        if (targetColIndex === -1) targetColIndex = i; // Priorité 2: Première colonne valide
      }
    }

    const destination = sameSuitTarget !== -1 ? sameSuitTarget : targetColIndex;

    if (destination !== -1) {
      pushHistory();
      executeMove(colIndex, cardIndex, destination);
    } else {
      playSound("error");
    }
  }

  function executeMove(fromCol, cardIndex, toCol) {
    initAudio();
    playSound("card");
    triggerHaptic();

    const movingCards = columns[fromCol].splice(cardIndex);
    columns[toCol].push(...movingCards);

    // Révéler la nouvelle carte du sommet de la colonne d'origine
    if (columns[fromCol].length > 0) {
      columns[fromCol][columns[fromCol].length - 1].faceUp = true;
    }

    moves++;
    score = Math.max(0, score - 1);

    renderBoard();
    checkCompletedSuits(toCol);
    saveState();
  }

  // --- PIOCHE (STOCK) ---
  stockPile.addEventListener("click", () => {
    if (!isGameActive || stock.length === 0) return;

    // Vérification : toutes les colonnes doivent avoir au moins une carte
    const hasEmptyColumn = columns.some((col) => col.length === 0);
    if (hasEmptyColumn) {
      playSound("error");
      alert(
        "Toutes les colonnes doivent contenir au moins une carte pour distribuer !",
      );
      return;
    }

    pushHistory();
    initAudio();
    playSound("card");

    for (let i = 0; i < 10; i++) {
      if (stock.length > 0) {
        const card = stock.pop();
        card.faceUp = true;
        columns[i].push(card);
      }
    }

    moves++;
    renderBoard();

    // Vérifier les suites pour toutes les colonnes après distribution
    for (let i = 0; i < 10; i++) {
      checkCompletedSuits(i);
    }
    saveState();
  });

  // --- DÉTECTION & COMPLÉTION DES SUITES (DU ROI À L'AS) ---
  function isCompletedSuit(cards) {
    return (
      cards.length === 13 &&
      cards.every((card) => card.faceUp) &&
      cards[0].value === 13 &&
      isValidSequence(cards)
    );
  }

  function checkCompletedSuits(colIndex) {
    if (completingColumns.has(colIndex)) return;
    const colCards = columns[colIndex];
    if (colCards.length < 13) return;

    // Vérifier si les 13 dernières cartes forment une suite complète du Roi (13) à l'As (1)
    const last13 = colCards.slice(-13);
    if (isCompletedSuit(last13)) {
      completingColumns.add(colIndex);
      const scheduledSession = gameSession;
      setTimeout(() => {
        completingColumns.delete(colIndex);

        // La colonne peut avoir changé pendant l'animation (notamment après une annulation).
        const currentLast13 = columns[colIndex].slice(-13);
        if (
          scheduledSession !== gameSession ||
          !isCompletedSuit(currentLast13)
        ) {
          return;
        }

        playSound("complete");
        triggerHaptic();

        // Retirer la suite du tableau
        columns[colIndex].splice(-13);

        // Révéler la carte précédente
        if (columns[colIndex].length > 0) {
          columns[colIndex][columns[colIndex].length - 1].faceUp = true;
        }

        // Enregistrer la suite pour reconstruire correctement les fondations, y compris après Annuler.
        completedSequences.push(currentLast13[0].suit);
        completedSuits = completedSequences.length;
        score += 100;

        renderBoard();
        saveState();

        if (completedSuits === 8) {
          handleVictory();
        } else {
          // Une seconde suite complète peut se trouver juste sous celle qui vient d'être retirée.
          checkCompletedSuits(colIndex);
        }
      }, 250);
    }
  }

  // --- DRAG & DROP MULTI-PLATEFORME (TOUCH & MOUSE) ---
  function handleDragStart(e) {
    if (!isGameActive) return;
    const cardEl = e.currentTarget;
    const colIndex = parseInt(cardEl.dataset.col);
    const cardIndex = parseInt(cardEl.dataset.index);
    const colCards = columns[colIndex];

    draggedCards = colCards.slice(cardIndex);
    if (!isValidSequence(draggedCards)) {
      draggedCards = [];
      return;
    }

    e.preventDefault();
    initAudio();
    sourceColIndex = colIndex;

    const touch = e.touches ? e.touches[0] : e;
    const rect = cardEl.getBoundingClientRect();
    dragOffset.x = touch.clientX - rect.left;
    dragOffset.y = touch.clientY - rect.top;

    // Création du Proxy de glissement
    dragProxy = document.createElement("div");
    dragProxy.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 1500;
            width: ${rect.width}px;
            left: ${touch.clientX - dragOffset.x}px;
            top: ${touch.clientY - dragOffset.y}px;
        `;

    // Cloner la séquence de cartes
    draggedCards.forEach((card, idx) => {
      const clone = createCardElement(card, colIndex, cardIndex + idx);
      clone.classList.add("dragging");
      clone.style.position = "absolute";
      clone.style.top = `${idx * 24}px`;
      dragProxy.appendChild(clone);
    });

    document.body.appendChild(dragProxy);

    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchend", handleDragEnd);
  }

  function handleDragMove(e) {
    if (!dragProxy) return;
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    dragProxy.style.left = `${touch.clientX - dragOffset.x}px`;
    dragProxy.style.top = `${touch.clientY - dragOffset.y}px`;

    // Highlight colonne survolée
    columnElements.forEach((colEl, idx) => {
      const rect = colEl.getBoundingClientRect();
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        colEl.classList.add("highlight");
      } else {
        colEl.classList.remove("highlight");
      }
    });
  }

  function handleDragEnd(e) {
    if (!dragProxy) return;

    const touch = e.changedTouches ? e.changedTouches[0] : e;
    let targetColIndex = -1;

    columnElements.forEach((colEl, idx) => {
      colEl.classList.remove("highlight");
      const rect = colEl.getBoundingClientRect();
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        targetColIndex = idx;
      }
    });

    if (
      targetColIndex !== -1 &&
      targetColIndex !== sourceColIndex &&
      canMoveToColumn(draggedCards, targetColIndex)
    ) {
      pushHistory();
      const cardIndex = columns[sourceColIndex].length - draggedCards.length;
      executeMove(sourceColIndex, cardIndex, targetColIndex);
    } else if (targetColIndex !== -1 && targetColIndex !== sourceColIndex) {
      playSound("error");
    }

    // Clean Up
    dragProxy.remove();
    dragProxy = null;
    draggedCards = [];
    sourceColIndex = -1;

    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("touchmove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    window.removeEventListener("touchend", handleDragEnd);
  }

  // --- ANNULATION (UNDO) & INDICES (HINT) ---
  function pushHistory() {
    history.push(
      JSON.stringify({
        columns,
        stock,
        completedSuits,
        completedSequences,
        score,
        moves,
      }),
    );
    if (history.length > 20) history.shift(); // Max 20 annulations
  }

  document.getElementById("btn-undo").addEventListener("click", () => {
    if (history.length === 0 || !isGameActive) return;
    const prevState = JSON.parse(history.pop());
    columns = prevState.columns;
    stock = prevState.stock;
    completedSuits = prevState.completedSuits;
    completedSequences = prevState.completedSequences || [];
    completingColumns.clear();
    score = prevState.score;
    moves = prevState.moves;

    renderBoard();
    playSound("card");
    saveState();
  });

  document.getElementById("btn-hint").addEventListener("click", () => {
    if (!isGameActive) return;

    // Chercher un coup valide
    for (let fromCol = 0; fromCol < 10; fromCol++) {
      const colCards = columns[fromCol];
      for (let cardIdx = 0; cardIdx < colCards.length; cardIdx++) {
        if (!colCards[cardIdx].faceUp) continue;
        const sequence = colCards.slice(cardIdx);
        if (!isValidSequence(sequence)) continue;

        for (let toCol = 0; toCol < 10; toCol++) {
          if (fromCol === toCol) continue;
          if (canMoveToColumn(sequence, toCol)) {
            // Surligner la carte dans le DOM
            const colEl = columnElements[fromCol];
            const cardEl = colEl.children[cardIdx];
            if (cardEl) {
              cardEl.classList.add("hint");
              setTimeout(() => cardEl.classList.remove("hint"), 2000);
              score = Math.max(0, score - 5);
              updateUI();
              return;
            }
          }
        }
      }
    }
    playSound("error");
  });

  // --- CHRONOMÈTRE ---
  function startTimer() {
    stopTimer();
    secondsElapsed = 0;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      secondsElapsed++;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatTime(secondsElapsed);
  }

  function formatTime(totalSeconds) {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const secs = String(totalSeconds % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function getLeaderboard() {
    try {
      const scores = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
      return Array.isArray(scores) ? scores : [];
    } catch {
      return [];
    }
  }

  function saveLeaderboardEntry() {
    const scores = getLeaderboard();
    scores.push({ score, moves, seconds: secondsElapsed, difficulty });
    const sortScores = (a, b) =>
      b.score - a.score || a.moves - b.moves || a.seconds - b.seconds;
    const bestScores = [1, 2, 4].flatMap((difficultyLevel) =>
      scores
        .filter((entry) => Number(entry.difficulty) === difficultyLevel)
        .sort(sortScores)
        .slice(0, 5),
    );
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(bestScores));
  }

  function renderLeaderboard() {
    const scores = getLeaderboard()
      .filter((entry) => Number(entry.difficulty) === leaderboardDifficulty)
      .sort(
        (a, b) =>
          b.score - a.score || a.moves - b.moves || a.seconds - b.seconds,
      );
    leaderboardList.innerHTML = "";

    leaderboardTabs.forEach((tab) => {
      const isActive = Number(tab.dataset.difficulty) === leaderboardDifficulty;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    if (scores.length === 0) {
      const emptyEntry = document.createElement("li");
      emptyEntry.className = "leaderboard-empty";
      emptyEntry.textContent = "Terminez une partie pour apparaître ici.";
      leaderboardList.appendChild(emptyEntry);
      return;
    }

    scores.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "leaderboard-entry";

      const rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = `#${index + 1}`;

      const details = document.createElement("span");
      details.className = "leaderboard-details";
      details.textContent = `${entry.moves} coups · ${formatTime(entry.seconds)}`;

      const entryScore = document.createElement("span");
      entryScore.className = "leaderboard-score";
      entryScore.textContent = entry.score;

      item.append(rank, details, entryScore);
      leaderboardList.appendChild(item);
    });
  }

  // --- ANIMATION DE CASCADE DE CARTES & VICTOIRE ---
  function handleVictory() {
    isGameActive = false;
    window.ArcadeGameSession?.win({ score, moves, seconds: secondsElapsed, difficulty });
    stopTimer();
    playSound("win");

    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const secs = String(secondsElapsed % 60).padStart(2, "0");
    victoryStats.textContent = `Grille résolue en ${moves} coups et ${mins}:${secs} !`;

    saveLeaderboardEntry();
    renderLeaderboard();

    const bestKey = `spider_best_score_diff_${difficulty}`;
    const bestScore = localStorage.getItem(bestKey) || 0;

    if (score > parseInt(bestScore)) {
      localStorage.setItem(bestKey, score);
      bestScoreDisplay.textContent = `${score} (Nouveau Record!)`;
    } else {
      bestScoreDisplay.textContent = bestScore;
    }

    startCardCascadeAnimation();
    setTimeout(() => {
      victoryOverlay.classList.remove("hidden");
    }, 3000);
  }

  function startCardCascadeAnimation() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const activeCards = [];
    const colors = ["#27845e", "#c53f57", "#245fa7", "#a96d00"];

    for (let i = 0; i < 40; i++) {
      activeCards.push({
        x: Math.random() * canvas.width,
        y: -100 - Math.random() * 500,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        width: 60,
        height: 84,
      });
    }

    function drawCascade() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let stillAnimating = false;

      activeCards.forEach((c) => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.2; // Gravité

        // Rebond en bas
        if (c.y + c.height > canvas.height) {
          c.y = canvas.height - c.height;
          c.vy = -c.vy * 0.7;
        }

        if (c.y < canvas.height) stillAnimating = true;

        ctx.save();
        ctx.fillStyle =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--card-bg")
            .trim() || "#fffefa";
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(c.x, c.y, c.width, c.height, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      if (stillAnimating && !victoryOverlay.classList.contains("hidden")) {
        requestAnimationFrame(drawCascade);
      }
    }
    drawCascade();
  }

  // --- PERSISTANCE LOCALSTORAGE ---
  function saveState() {
    const state = {
      difficulty,
      columns,
      stock,
      completedSuits,
      completedSequences,
      score,
      moves,
      secondsElapsed,
    };
    localStorage.setItem("spider_solitaire_save", JSON.stringify(state));
  }

  // --- BOUTONS & OVERLAYS ---
  document.querySelectorAll(".btn-difficulty").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const diff = e.currentTarget.dataset.suits;
      startNewGame(diff);
    });
  });

  document.getElementById("btn-home").addEventListener("click", () => {
    homeConfirmOverlay.classList.remove("hidden");
  });

  document.getElementById("btn-cancel-home").addEventListener("click", () => {
    homeConfirmOverlay.classList.add("hidden");
  });

  document.getElementById("btn-confirm-home").addEventListener("click", () => {
    isGameActive = false;
    gameSession++;
    completingColumns.clear();
    stopTimer();
    localStorage.removeItem("spider_solitaire_save");
    homeConfirmOverlay.classList.add("hidden");
    leaderboardOverlay.classList.add("hidden");
    renderLeaderboard();
    difficultyOverlay.classList.remove("hidden");
  });

  document
    .getElementById("btn-open-leaderboard")
    .addEventListener("click", () => {
      renderLeaderboard();
      difficultyOverlay.classList.add("hidden");
      leaderboardOverlay.classList.remove("hidden");
    });

  document.getElementById("btn-back-to-menu").addEventListener("click", () => {
    leaderboardOverlay.classList.add("hidden");
    difficultyOverlay.classList.remove("hidden");
  });

  leaderboardTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      leaderboardDifficulty = Number(tab.dataset.difficulty);
      renderLeaderboard();
    });
  });

  document.getElementById("btn-play-again").addEventListener("click", () => {
    victoryOverlay.classList.add("hidden");
    leaderboardOverlay.classList.add("hidden");
    renderLeaderboard();
    difficultyOverlay.classList.remove("hidden");
  });

  renderLeaderboard();

  window.addEventListener("resize", () => renderBoard());
});
