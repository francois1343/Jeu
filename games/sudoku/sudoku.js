/**
 * SUDOKU MASTER & SOLVER - Engine Game.js
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- VARIABLES D'ÉTAT DU JEU ---
  let board = Array(81).fill(0); // Valeurs actuelles (0 = vide)
  let initialBoard = Array(81).fill(0); // Configuration de départ
  let solutionBoard = Array(81).fill(0); // Grille résolue
  let notes = Array.from({ length: 81 }, () => new Set()); // Notes crayon (1-9)

  let selectedCell = -1;
  let currentDifficulty = "easy";
  let isPencilMode = false;
  let errors = 0;
  const maxErrors = 3;
  const hintPenaltySeconds = 30;
  let timerInterval = null;
  let secondsElapsed = 0;
  let history = []; // Pile pour Undo (annuler)
  let hintedCells = new Set();
  let hintMessageTimeout = null;
  let currentTheme = "dark";
  let currentAccent = "cyan";

  // Elements DOM
  const boardElement = document.getElementById("sudoku-board");
  const timerElement = document.getElementById("timer");
  const errorCountElement = document.getElementById("error-count");
  const modeDisplayElement = document.getElementById("current-mode-display");
  const pencilBtn = document.getElementById("btn-pencil");
  const pencilStatus = document.getElementById("pencil-status");
  const insaneControls = document.getElementById("insane-controls");
  const leaderboardList = document.getElementById("leaderboard-list");
  const mainMenu = document.getElementById("main-menu");
  const gameView = document.getElementById("game-view");
  const menuBtn = document.getElementById("btn-menu");
  const hintBtn = document.getElementById("btn-hint");
  const hintMessage = document.getElementById("hint-message");
  const quickThemeBtn = document.getElementById("btn-theme-quick");
  const difficultyLabels = {
    easy: "Facile",
    medium: "Moyen",
    hard: "Difficile",
    insane: "Insane",
  };

  // --- MOTEUR AUDIO (Web Audio API) ---
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
  }

  function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === "click") {
      osc.frequency.setValueAtTime(400, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === "win") {
      const notes = [261.63, 329.63, 392.0, 523.25]; // Do, Mi, Sol, Do
      notes.forEach((freq, idx) => {
        const noteOsc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        noteOsc.connect(noteGain);
        noteGain.connect(audioCtx.destination);
        noteOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
        noteGain.gain.setValueAtTime(0.15, now + idx * 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.2);
        noteOsc.start(now + idx * 0.1);
        noteOsc.stop(now + idx * 0.1 + 0.2);
      });
    }
  }

  function triggerHaptic() {
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }

  // --- PERSONNALISATION DE L'APPARENCE ---
  function applyAppearance(theme, accent, persist = true) {
    const validThemes = ["dark", "light"];
    const validAccents = ["cyan", "purple", "pink", "green"];
    currentTheme = validThemes.includes(theme) ? theme : "dark";
    currentAccent = validAccents.includes(accent) ? accent : "cyan";

    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.dataset.accent = currentAccent;

    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const isActive = button.dataset.themeChoice === currentTheme;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    document.querySelectorAll("[data-accent-choice]").forEach((button) => {
      const isActive = button.dataset.accentChoice === currentAccent;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    const isDark = currentTheme === "dark";
    quickThemeBtn.textContent = isDark ? "☀" : "☾";
    quickThemeBtn.setAttribute(
      "aria-label",
      isDark ? "Activer le thème lumineux" : "Activer le thème sombre",
    );

    if (persist) {
      localStorage.setItem("sudoku_theme", currentTheme);
      localStorage.setItem("sudoku_accent", currentAccent);
    }
  }

  function loadAppearance() {
    const savedTheme = localStorage.getItem("sudoku_theme") || "dark";
    const savedAccent = localStorage.getItem("sudoku_accent") || "cyan";
    applyAppearance(savedTheme, savedAccent, false);
  }

  // --- ALGORITHMES SUDOKU & SOLVER (Backtracking) ---
  function isValidMove(grid, index, num) {
    const row = Math.floor(index / 9);
    const col = index % 9;

    for (let i = 0; i < 9; i++) {
      // Ligne
      if (grid[row * 9 + i] === num && row * 9 + i !== index) return false;
      // Colonne
      if (grid[i * 9 + col] === num && i * 9 + col !== index) return false;
    }

    // Bloc 3x3
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const checkIdx = (boxRow + r) * 9 + (boxCol + c);
        if (grid[checkIdx] === num && checkIdx !== index) return false;
      }
    }
    return true;
  }

  function shuffle(numbers) {
    const shuffled = [...numbers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function solveGrid(grid, randomize = false) {
    for (let i = 0; i < 81; i++) {
      if (grid[i] === 0) {
        const nums = randomize
          ? shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
          : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let num of nums) {
          if (isValidMove(grid, i, num)) {
            grid[i] = num;
            if (solveGrid(grid, randomize)) return true;
            grid[i] = 0;
          }
        }
        return false;
      }
    }
    return true;
  }

  function generateFullSolution() {
    const grid = Array(81).fill(0);
    function fill(i) {
      if (i >= 81) return true;
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (let num of nums) {
        if (isValidMove(grid, i, num)) {
          grid[i] = num;
          if (fill(i + 1)) return true;
          grid[i] = 0;
        }
      }
      return false;
    }
    fill(0);
    return grid;
  }

  function generatePuzzle(difficulty) {
    const full = generateFullSolution();
    solutionBoard = [...full];
    const puzzle = [...full];

    let toRemove = 30; // Facile par défaut
    if (difficulty === "medium") toRemove = 42;
    if (difficulty === "hard") toRemove = 54;

    const indices = Array.from({ length: 81 }, (_, i) => i).sort(
      () => Math.random() - 0.5,
    );
    for (let i = 0; i < toRemove; i++) {
      puzzle[indices[i]] = 0;
    }
    return puzzle;
  }

  // --- CHRONOMÈTRE & VÉRIFICATIONS ---
  function startTimer() {
    clearInterval(timerInterval);
    secondsElapsed = 0;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      secondsElapsed++;
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const secs = String(secondsElapsed % 60).padStart(2, "0");
    timerElement.textContent = `${mins}:${secs}`;
  }

  // --- RENDU UI DE LA GRILLE ---
  function initBoardUI() {
    boardElement.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.index = i;
      cell.dataset.row = Math.floor(i / 9);
      cell.dataset.col = i % 9;

      // Notes grid (3x3)
      const notesGrid = document.createElement("div");
      notesGrid.classList.add("notes-grid");
      for (let n = 1; n <= 9; n++) {
        const noteSpan = document.createElement("span");
        noteSpan.classList.add("note-candidate");
        noteSpan.dataset.note = n;
        notesGrid.appendChild(noteSpan);
      }
      cell.appendChild(notesGrid);

      cell.addEventListener("click", () => {
        initAudio();
        selectCell(i);
      });
      boardElement.appendChild(cell);
    }
  }

  function renderBoard() {
    const cells = boardElement.children;
    const selectedVal = selectedCell !== -1 ? board[selectedCell] : 0;
    const selRow = selectedCell !== -1 ? Math.floor(selectedCell / 9) : -1;
    const selCol = selectedCell !== -1 ? selectedCell % 9 : -1;
    const selBoxRow = Math.floor(selRow / 3);
    const selBoxCol = Math.floor(selCol / 3);

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const val = board[i];
      const row = Math.floor(i / 9);
      const col = i % 9;
      const boxRow = Math.floor(row / 3);
      const boxCol = Math.floor(col / 3);

      // Remise à zéro des classes d'état
      cell.classList.remove(
        "selected",
        "highlighted",
        "same-number",
        "given",
        "error",
        "hinted",
      );

      // Cellule pré-remplie
      if (initialBoard[i] !== 0) {
        cell.classList.add("given");
      }

      if (hintedCells.has(i)) {
        cell.classList.add("hinted");
      }

      // Valeurs et Notes
      const notesGrid = cell.querySelector(".notes-grid");
      if (val !== 0) {
        notesGrid.style.display = "none";
        let textNode = cell.querySelector(".cell-value");
        if (!textNode) {
          textNode = document.createElement("span");
          textNode.classList.add("cell-value");
          cell.appendChild(textNode);
        }
        textNode.textContent = val;

        // Erreur de surbrillance
        if (
          currentDifficulty !== "insane" &&
          val !== solutionBoard[i] &&
          initialBoard[i] === 0
        ) {
          cell.classList.add("error");
        } else if (
          currentDifficulty === "insane" &&
          !isValidMove(board, i, val)
        ) {
          cell.classList.add("error");
        }
      } else {
        notesGrid.style.display = "grid";
        const textNode = cell.querySelector(".cell-value");
        if (textNode) textNode.remove();

        // Afficher les candidat(e)s en mode crayon
        const spans = notesGrid.querySelectorAll(".note-candidate");
        spans.forEach((span) => {
          const candidateNum = parseInt(span.dataset.note);
          span.textContent = notes[i].has(candidateNum) ? candidateNum : "";
        });
      }

      // Surbrillances dynamiques
      if (i === selectedCell) {
        cell.classList.add("selected");
      } else if (selectedCell !== -1) {
        if (
          row === selRow ||
          col === selCol ||
          (boxRow === selBoxRow && boxCol === selBoxCol)
        ) {
          cell.classList.add("highlighted");
        }
        if (selectedVal !== 0 && val === selectedVal) {
          cell.classList.add("same-number");
        }
      }
    }
  }

  function selectCell(index) {
    selectedCell = index;
    triggerHaptic();
    playSound("click");
    renderBoard();
  }

  // --- GESTION DES ENTRÉES DU JOUEUR ---
  function handleInput(number) {
    if (selectedCell === -1) return;
    if (initialBoard[selectedCell] !== 0 && currentDifficulty !== "insane")
      return;

    initAudio();
    triggerHaptic();

    // Enregistrer l'état pour l'annulation (Undo)
    saveStateForUndo();

    if (isPencilMode && board[selectedCell] === 0) {
      playSound("click");
      if (notes[selectedCell].has(number)) {
        notes[selectedCell].delete(number);
      } else {
        notes[selectedCell].add(number);
      }
    } else {
      hintedCells.delete(selectedCell);
      notes[selectedCell].clear();
      if (board[selectedCell] === number) {
        board[selectedCell] = 0; // Toggle effacer si même chiffre
      } else {
        board[selectedCell] = number;

        // Traitement des erreurs en mode classique
        if (
          currentDifficulty !== "insane" &&
          number !== solutionBoard[selectedCell]
        ) {
          playSound("error");
          errors++;
          errorCountElement.textContent = `${errors}/${maxErrors}`;
          if (errors >= maxErrors) {
            alert("Game Over ! Vous avez atteint le nombre maximal d'erreurs.");
            window.ArcadeGameSession?.lose({ errors, difficulty: currentDifficulty });
            startNewGame(currentDifficulty);
            return;
          }
        } else {
          playSound("click");
        }
      }
    }

    renderBoard();
    saveGameState();
    checkVictory();
  }

  function eraseCell() {
    if (selectedCell === -1) return;
    if (initialBoard[selectedCell] !== 0 && currentDifficulty !== "insane")
      return;

    saveStateForUndo();
    board[selectedCell] = 0;
    hintedCells.delete(selectedCell);
    notes[selectedCell].clear();
    playSound("click");
    renderBoard();
    saveGameState();
  }

  function saveStateForUndo() {
    history.push({
      board: [...board],
      notes: notes.map((set) => new Set(set)),
      hintedCells: new Set(hintedCells),
    });
    if (history.length > 20) history.shift(); // Limite à 20 coups
  }

  function undo() {
    if (history.length === 0) return;
    const lastState = history.pop();
    board = lastState.board;
    notes = lastState.notes;
    hintedCells = lastState.hintedCells || new Set();
    playSound("click");
    renderBoard();
    saveGameState();
  }

  function checkVictory() {
    if (currentDifficulty === "insane") return; // Pas de détection auto de victoire en mode insane vide

    const isComplete = board.every((val, idx) => val === solutionBoard[idx]);
    if (isComplete) {
      clearInterval(timerInterval);
      playSound("win");
      setTimeout(() => {
        alert(`Bravo ! Grille complétée en ${timerElement.textContent} !`);
        window.ArcadeGameSession?.win({
          errors,
          difficulty: currentDifficulty,
          time: timerElement.textContent,
        });
        saveScore(currentDifficulty, secondsElapsed);
        setLeaderboardTab(currentDifficulty);
      }, 200);
    }
  }

  // --- INDICES INTELLIGENTS ---
  function getCandidates(grid, index) {
    if (grid[index] !== 0) return [];
    const candidates = [];
    for (let number = 1; number <= 9; number++) {
      if (isValidMove(grid, index, number)) candidates.push(number);
    }
    return candidates;
  }

  function isGridConsistent(grid) {
    return grid.every(
      (value, index) => value === 0 || isValidMove(grid, index, value),
    );
  }

  function findBestHintCell() {
    const availableCells = [];
    for (let index = 0; index < 81; index++) {
      if (board[index] === 0 && initialBoard[index] === 0) {
        availableCells.push({ index, candidates: getCandidates(board, index) });
      }
    }

    availableCells.sort((a, b) => {
      const aCount = a.candidates.length || 10;
      const bCount = b.candidates.length || 10;
      return aCount - bCount;
    });
    return availableCells[0] || null;
  }

  function removeHintedNumberFromNotes(index, number) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const boxRow = Math.floor(row / 3);
    const boxCol = Math.floor(col / 3);

    for (let i = 0; i < 81; i++) {
      const peerRow = Math.floor(i / 9);
      const peerCol = i % 9;
      const sameBox =
        Math.floor(peerRow / 3) === boxRow &&
        Math.floor(peerCol / 3) === boxCol;
      if (peerRow === row || peerCol === col || sameBox)
        notes[i].delete(number);
    }
  }

  function showHintMessage(message, isError = false) {
    clearTimeout(hintMessageTimeout);
    hintMessage.textContent = message;
    hintMessage.classList.toggle("error", isError);
    hintMessage.classList.add("visible");
    hintMessageTimeout = setTimeout(
      () => hintMessage.classList.remove("visible"),
      6500,
    );
  }

  function useSmartHint() {
    initAudio();

    let resolvedGrid = solutionBoard;
    if (currentDifficulty === "insane") {
      if (!isGridConsistent(board)) {
        playSound("error");
        showHintMessage(
          "Impossible de donner un indice : la grille contient un conflit.",
          true,
        );
        return;
      }
      resolvedGrid = [...board];
      if (!solveGrid(resolvedGrid, true)) {
        playSound("error");
        showHintMessage(
          "Cette configuration ne possède aucune solution.",
          true,
        );
        return;
      }
    }

    const selectedIsEditable =
      selectedCell !== -1 && initialBoard[selectedCell] === 0;
    let target =
      selectedIsEditable && board[selectedCell] !== resolvedGrid[selectedCell]
        ? selectedCell
        : -1;
    let isCorrection = target !== -1 && board[target] !== 0;

    if (target === -1 && currentDifficulty !== "insane") {
      target = board.findIndex(
        (value, index) =>
          initialBoard[index] === 0 &&
          value !== 0 &&
          value !== resolvedGrid[index],
      );
      isCorrection = target !== -1;
    }

    const bestCell = target === -1 ? findBestHintCell() : null;
    if (target === -1 && bestCell) target = bestCell.index;

    if (target === -1) {
      showHintMessage(
        "La grille est déjà complète. Il ne reste plus qu’à la valider !",
      );
      return;
    }

    const candidatesBeforeHint = getCandidates(board, target);
    const number = resolvedGrid[target];
    saveStateForUndo();
    board[target] = number;
    notes[target].clear();
    hintedCells.add(target);
    removeHintedNumberFromNotes(target, number);
    selectedCell = target;
    playSound("click");
    triggerHaptic();
    renderBoard();
    if (currentDifficulty !== "insane") {
      secondsElapsed += hintPenaltySeconds;
      updateTimerDisplay();
    }
    saveGameState();

    const row = Math.floor(target / 9) + 1;
    const col = (target % 9) + 1;
    const penaltyText =
      currentDifficulty === "insane" ? "" : ` · +${hintPenaltySeconds} s`;
    if (isCorrection) {
      showHintMessage(
        `Correction intelligente : la case L${row} C${col} doit contenir ${number}${penaltyText}.`,
      );
    } else if (candidatesBeforeHint.length === 1) {
      showHintMessage(
        `Déduction logique : ${number} est le seul chiffre possible en L${row} C${col}${penaltyText}.`,
      );
    } else {
      showHintMessage(
        `Indice : la case L${row} C${col} contient ${number}. Ligne, colonne et région analysées${penaltyText}.`,
      );
    }
    checkVictory();
  }

  // --- NOUVELLE PARTIE & MODES ---
  function startNewGame(difficulty) {
    currentDifficulty = difficulty;
    errors = 0;
    history = [];
    hintedCells = new Set();
    selectedCell = -1;
    isPencilMode = false;
    notes = Array.from({ length: 81 }, () => new Set());
    errorCountElement.textContent = `${errors}/${maxErrors}`;
    modeDisplayElement.textContent = difficultyLabels[difficulty];
    pencilBtn.classList.remove("active");
    pencilStatus.textContent = "OFF";
    hintMessage.classList.remove("visible", "error");
    hintMessage.textContent = "";

    // Gestion de l'affichage Mode Insane
    if (difficulty === "insane") {
      insaneControls.classList.remove("hidden");
      board = Array(81).fill(0);
      initialBoard = Array(81).fill(0);
      solutionBoard = Array(81).fill(0);
    } else {
      insaneControls.classList.add("hidden");
      board = generatePuzzle(difficulty);
      initialBoard = [...board];
    }

    startTimer();
    renderBoard();
    saveGameState();
  }

  function showMenu() {
    clearInterval(timerInterval);
    selectedCell = -1;
    setLeaderboardTab(
      currentDifficulty === "insane" ? "easy" : currentDifficulty,
    );
    mainMenu.classList.remove("hidden");
    gameView.classList.add("hidden");
  }

  function startGameFromMenu(difficulty) {
    window.ArcadeGameSession?.start({ difficulty });
    mainMenu.classList.add("hidden");
    gameView.classList.remove("hidden");
    startNewGame(difficulty);
  }

  // --- MODE INSANE (BACKTRACKING SOLVER & VALIDATION) ---
  document
    .getElementById("btn-validate-custom")
    .addEventListener("click", () => {
      let isValid = true;
      for (let i = 0; i < 81; i++) {
        if (board[i] !== 0 && !isValidMove(board, i, board[i])) {
          isValid = false;
          break;
        }
      }
      if (isValid) {
        alert("La grille est valide selon les règles du Sudoku !");
      } else {
        playSound("error");
        alert("Attention : La grille contient des doublons ou des erreurs.");
      }
    });

  document.getElementById("btn-solve-ai").addEventListener("click", () => {
    const gridCopy = [...board];
    if (solveGrid(gridCopy, true)) {
      board = gridCopy;
      playSound("win");
      renderBoard();
    } else {
      playSound("error");
      alert("Aucune solution trouvée pour cette configuration.");
    }
  });

  // --- SAUVEGARDE ET LOCALSTORAGE ---
  function saveGameState() {
    const state = {
      board,
      initialBoard,
      solutionBoard,
      notes: notes.map((set) => Array.from(set)),
      secondsElapsed,
      errors,
      currentDifficulty,
      hintedCells: Array.from(hintedCells),
    };
    localStorage.setItem("sudoku_current_game", JSON.stringify(state));
  }

  function saveScore(difficulty, timeInSeconds) {
    const scores = JSON.parse(
      localStorage.getItem("sudoku_leaderboard") || "{}",
    );
    if (!scores[difficulty]) scores[difficulty] = [];

    scores[difficulty].push({
      time: timeInSeconds,
      date: new Date().toLocaleDateString("fr-FR"),
    });

    // Tri du meilleur au moins bon chrono
    scores[difficulty].sort((a, b) => a.time - b.time);
    scores[difficulty] = scores[difficulty].slice(0, 5); // Conserver le Top 5

    localStorage.setItem("sudoku_leaderboard", JSON.stringify(scores));
  }

  function updateLeaderboardUI(tabDifficulty = "easy") {
    const scores = JSON.parse(
      localStorage.getItem("sudoku_leaderboard") || "{}",
    );
    const list = scores[tabDifficulty] || [];
    leaderboardList.innerHTML = "";

    if (list.length === 0) {
      leaderboardList.innerHTML =
        '<li class="empty-state"><span>Aucun chrono pour le moment.<br>Lancez une partie pour ouvrir le classement.</span></li>';
      return;
    }

    list.forEach((score, index) => {
      const mins = String(Math.floor(score.time / 60)).padStart(2, "0");
      const secs = String(score.time % 60).padStart(2, "0");
      const li = document.createElement("li");
      const performance = document.createElement("span");
      performance.className = "performance";

      const rank = document.createElement("strong");
      rank.className = "rank";
      rank.textContent = `#${index + 1}`;

      const time = document.createElement("span");
      time.className = "score-time";
      time.textContent = `${mins}:${secs}`;

      const date = document.createElement("small");
      date.textContent = score.date;

      performance.append(rank, time);
      li.append(performance, date);
      leaderboardList.appendChild(li);
    });
  }

  function setLeaderboardTab(difficulty) {
    document.querySelectorAll(".tab-btn").forEach((tab) => {
      const isActive = tab.dataset.tab === difficulty;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    updateLeaderboardUI(difficulty);
  }

  // --- ÉVÉNEMENTS ÉCOUTEURS ---
  // Choix de difficulté depuis le menu d'accueil
  document.querySelectorAll(".btn-menu-diff").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      initAudio();
      playSound("click");
      startGameFromMenu(e.currentTarget.dataset.difficulty);
    });
  });

  menuBtn.addEventListener("click", showMenu);
  hintBtn.addEventListener("click", useSmartHint);

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () =>
      applyAppearance(button.dataset.themeChoice, currentAccent),
    );
  });

  document.querySelectorAll("[data-accent-choice]").forEach((button) => {
    button.addEventListener("click", () =>
      applyAppearance(currentTheme, button.dataset.accentChoice),
    );
  });

  quickThemeBtn.addEventListener("click", () => {
    applyAppearance(currentTheme === "dark" ? "light" : "dark", currentAccent);
  });

  // Pavé numérique
  document.querySelectorAll(".num-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleInput(parseInt(btn.dataset.value));
    });
  });

  // Raccourcis Clavier (1-9, Backspace, Crayon, Flèches)
  document.addEventListener("keydown", (e) => {
    if (gameView.classList.contains("hidden")) return;
    initAudio();
    if (e.key >= "1" && e.key <= "9") {
      handleInput(parseInt(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      eraseCell();
    } else if (e.key.toLowerCase() === "n") {
      pencilBtn.click();
    } else if (e.key.toLowerCase() === "h") {
      useSmartHint();
    } else if (selectedCell !== -1) {
      let row = Math.floor(selectedCell / 9);
      let col = selectedCell % 9;
      if (e.key === "ArrowUp" && row > 0) row--;
      if (e.key === "ArrowDown" && row < 8) row++;
      if (e.key === "ArrowLeft" && col > 0) col--;
      if (e.key === "ArrowRight" && col < 8) col++;
      selectCell(row * 9 + col);
    }
  });

  // Actions rapides Outils
  pencilBtn.addEventListener("click", () => {
    isPencilMode = !isPencilMode;
    pencilBtn.classList.toggle("active", isPencilMode);
    pencilStatus.textContent = isPencilMode ? "ON" : "OFF";
    playSound("click");
  });

  document.getElementById("btn-erase").addEventListener("click", eraseCell);
  document.getElementById("btn-undo").addEventListener("click", undo);

  // Leaderboard Tabs
  document.querySelectorAll(".tab-btn").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      setLeaderboardTab(e.currentTarget.dataset.tab);
    });
  });

  // --- INITIALISATION ---
  loadAppearance();
  initBoardUI();
  setLeaderboardTab("easy");
});
