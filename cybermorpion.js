/**
 * CYBER-MORPION 80s - Engine
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- ÉTAT DU JEU ---
  const STATE = {
    gridSize: 3, // 3 (3x3) ou 5 (5x5)
    winCondition: 3, // 3 pour le mode 3x3, 4 pour le mode 5x5
    opponent: "pvp", // 'pvp' ou 'ai'
    difficulty: "easy", // 'easy', 'medium', 'hard'
    currentPlayer: "X", // 'X' (Bleu Cyan) commence toujours
    board: Array(9).fill(null),
    isGameOver: false,
    isAnimating: false,
    isMuted: false,
    scores: JSON.parse(localStorage.getItem("cyber_morpion_scores")) || {
      x: 0,
      draw: 0,
      o: 0,
    },
  };

  // --- SÉLECTEURS DOM ---
  const DOM = {
    board: document.getElementById("board"),
    boardWrapper: document.getElementById("board-wrapper"),
    turnDisplay: document.getElementById("turn-display"),
    scoreX: document.getElementById("score-x"),
    scoreDraw: document.getElementById("score-draw"),
    scoreO: document.getElementById("score-o"),
    aiDiffContainer: document.getElementById("ai-difficulty-container"),
    laserLine: document.getElementById("laser-line"),
    btn3x3: document.getElementById("btn-3x3"),
    btn5x5: document.getElementById("btn-5x5"),
    btnPvp: document.getElementById("btn-pvp"),
    btnAi: document.getElementById("btn-ai"),
    btnRestart: document.getElementById("btn-restart"),
    btnResetScores: document.getElementById("btn-reset-scores"),
    btnAudio: document.getElementById("btn-audio"),
    diffButtons: document.querySelectorAll(".btn-diff"),
  };

  // --- SYNTHÈSE SONORE (WEB AUDIO API) ---
  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    },
    playXSound() {
      if (STATE.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    },
    playOSound() {
      if (STATE.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now); // A3
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.15); // A2

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    },
    playErrorSound() {
      if (STATE.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.setValueAtTime(100, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    },
    playWinSound() {
      if (STATE.isMuted || !this.ctx) return;
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // Arpège Majeur Néon
      notes.forEach((freq, idx) => {
        const now = this.ctx.currentTime + idx * 0.06;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      });
    },
    playDrawSound() {
      if (STATE.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(60, now + 0.4);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    },
  };

  function triggerVibration(duration = 20) {
    if (navigator.vibrate) navigator.vibrate(duration);
  }

  // --- RENDER & MISE À JOUR UI ---
  function updateHUD() {
    DOM.scoreX.textContent = STATE.scores.x;
    DOM.scoreDraw.textContent = STATE.scores.draw;
    DOM.scoreO.textContent = STATE.scores.o;

    DOM.turnDisplay.textContent = STATE.currentPlayer;
    DOM.turnDisplay.className =
      STATE.currentPlayer === "X" ? "neon-cyan" : "neon-pink";
  }

  function initBoard() {
    DOM.board.innerHTML = "";
    DOM.laserLine.classList.add("hidden");
    DOM.laserLine.setAttribute("x1", 0);
    DOM.laserLine.setAttribute("y1", 0);
    DOM.laserLine.setAttribute("x2", 0);
    DOM.laserLine.setAttribute("y2", 0);

    const totalCells = STATE.gridSize * STATE.gridSize;
    STATE.board = Array(totalCells).fill(null);
    STATE.isGameOver = false;
    STATE.isAnimating = false;

    if (STATE.gridSize === 3) {
      DOM.board.className = "grid-3x3";
      STATE.winCondition = 3;
    } else {
      DOM.board.className = "grid-5x5";
      STATE.winCondition = 4;
    }

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.index = i;
      cell.addEventListener("click", () => handleCellClick(i));
      DOM.board.appendChild(cell);
    }

    updateHUD();
  }

  // --- GESTION DES COUPS ---
  function handleCellClick(index) {
    if (STATE.isGameOver || STATE.isAnimating || STATE.board[index] !== null) {
      if (STATE.board[index] !== null && !STATE.isGameOver) {
        AudioEngine.playErrorSound();
      }
      return;
    }

    if (STATE.opponent === "ai" && STATE.currentPlayer === "O") return;

    executeMove(index, STATE.currentPlayer);
  }

  function executeMove(index, player) {
    window.ArcadeGameSession?.start({ opponent: STATE.opponent, gridSize: STATE.gridSize });
    AudioEngine.init();
    STATE.board[index] = player;

    const cell = DOM.board.children[index];
    cell.textContent = player;
    cell.classList.add(player === "X" ? "x-mark" : "o-mark");

    if (player === "X") AudioEngine.playXSound();
    else AudioEngine.playOSound();

    triggerVibration();

    const winResult = checkWin(
      STATE.board,
      STATE.gridSize,
      STATE.winCondition,
      player,
    );

    if (winResult) {
      handleWin(player, winResult.line);
    } else if (STATE.board.every((cell) => cell !== null)) {
      handleDraw();
    } else {
      STATE.currentPlayer = STATE.currentPlayer === "X" ? "O" : "X";
      updateHUD();

      if (
        STATE.opponent === "ai" &&
        STATE.currentPlayer === "O" &&
        !STATE.isGameOver
      ) {
        STATE.isAnimating = true;
        setTimeout(triggerAIMove, 400);
      }
    }
  }

  // --- ALGORITHMES DE VÉRIFICATION DE VICTOIRE ---
  function checkWin(board, size, lengthNeeded, player) {
    const getIdx = (r, c) => r * size + c;

    // 1. Horizontale
    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size - lengthNeeded; c++) {
        let line = [];
        for (let k = 0; k < lengthNeeded; k++) {
          line.push(getIdx(r, c + k));
        }
        if (line.every((idx) => board[idx] === player)) return { line };
      }
    }

    // 2. Verticale
    for (let c = 0; c < size; c++) {
      for (let r = 0; r <= size - lengthNeeded; r++) {
        let line = [];
        for (let k = 0; k < lengthNeeded; k++) {
          line.push(getIdx(r + k, c));
        }
        if (line.every((idx) => board[idx] === player)) return { line };
      }
    }

    // 3. Diagonale Descendante (\)
    for (let r = 0; r <= size - lengthNeeded; r++) {
      for (let c = 0; c <= size - lengthNeeded; c++) {
        let line = [];
        for (let k = 0; k < lengthNeeded; k++) {
          line.push(getIdx(r + k, c + k));
        }
        if (line.every((idx) => board[idx] === player)) return { line };
      }
    }

    // 4. Diagonale Montante (/)
    for (let r = lengthNeeded - 1; r < size; r++) {
      for (let c = 0; c <= size - lengthNeeded; c++) {
        let line = [];
        for (let k = 0; k < lengthNeeded; k++) {
          line.push(getIdx(r - k, c + k));
        }
        if (line.every((idx) => board[idx] === player)) return { line };
      }
    }

    return null;
  }

  // --- ANIMATION RAYON LASER (SVG) ---
  function drawLaserLine(winningIndices) {
    const firstCell = DOM.board.children[winningIndices[0]];
    const lastCell =
      DOM.board.children[winningIndices[winningIndices.length - 1]];

    const wrapperRect = DOM.boardWrapper.getBoundingClientRect();
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();

    const x1 = firstRect.left + firstRect.width / 2 - wrapperRect.left;
    const y1 = firstRect.top + firstRect.height / 2 - wrapperRect.top;
    const x2 = lastRect.left + lastRect.width / 2 - wrapperRect.left;
    const y2 = lastRect.top + lastRect.height / 2 - wrapperRect.top;

    DOM.laserLine.setAttribute("x1", x1);
    DOM.laserLine.setAttribute("y1", y1);
    DOM.laserLine.setAttribute("x2", x2);
    DOM.laserLine.setAttribute("y2", y2);

    DOM.laserLine.classList.remove("hidden");
  }

  // --- FIN DE PARTIE ---
  function handleWin(winner, line) {
    STATE.isGameOver = true;
    STATE.isAnimating = false;
    drawLaserLine(line);

    if (winner === "X") STATE.scores.x++;
    else STATE.scores.o++;

    localStorage.setItem("cyber_morpion_scores", JSON.stringify(STATE.scores));
    updateHUD();
    AudioEngine.playWinSound();
    if (winner === "X") window.ArcadeGameSession?.win({ opponent: STATE.opponent });
    else window.ArcadeGameSession?.lose({ opponent: STATE.opponent });
  }

  function handleDraw() {
    STATE.isGameOver = true;
    STATE.isAnimating = false;
    STATE.scores.draw++;
    localStorage.setItem("cyber_morpion_scores", JSON.stringify(STATE.scores));
    updateHUD();
    AudioEngine.playDrawSound();
    window.ArcadeGameSession?.lose({ draw: true, opponent: STATE.opponent });
  }

  // --- IA DE JEU ---
  function triggerAIMove() {
    if (STATE.isGameOver) return;

    const emptyIndices = STATE.board
      .map((val, idx) => (val === null ? idx : null))
      .filter((val) => val !== null);
    if (emptyIndices.length === 0) return;

    let chosenIndex;

    if (STATE.difficulty === "easy") {
      chosenIndex =
        emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    } else if (STATE.difficulty === "medium") {
      chosenIndex = getTacticalAIMove(emptyIndices);
    } else {
      // Hard / Unbeatable
      if (STATE.gridSize === 3) {
        chosenIndex = getMinimaxMove();
      } else {
        chosenIndex = getTacticalAIMove(emptyIndices, true);
      }
    }

    STATE.isAnimating = false;
    executeMove(chosenIndex, "O");
  }

  function getTacticalAIMove(emptyIndices, isHard = false) {
    // 1. Attaque : l'IA peut-elle gagner sur ce coup ?
    for (let idx of emptyIndices) {
      STATE.board[idx] = "O";
      if (checkWin(STATE.board, STATE.gridSize, STATE.winCondition, "O")) {
        STATE.board[idx] = null;
        return idx;
      }
      STATE.board[idx] = null;
    }

    // 2. Défense : bloquer le coup gagnant de l'adversaire
    for (let idx of emptyIndices) {
      STATE.board[idx] = "X";
      if (checkWin(STATE.board, STATE.gridSize, STATE.winCondition, "X")) {
        STATE.board[idx] = null;
        return idx;
      }
      STATE.board[idx] = null;
    }

    // 3. Prise du centre en priorité si disponible
    const centerIdx = Math.floor((STATE.gridSize * STATE.gridSize) / 2);
    if (emptyIndices.includes(centerIdx) && (isHard || Math.random() > 0.3)) {
      return centerIdx;
    }

    // 4. Coup aléatoire parmi le reste
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  // --- ALGORITHME MINIMAX (3x3 IMBATTABLE) ---
  function getMinimaxMove() {
    let bestScore = -Infinity;
    let bestMove = null;

    for (let i = 0; i < STATE.board.length; i++) {
      if (STATE.board[i] === null) {
        STATE.board[i] = "O";
        let score = minimax(STATE.board, 0, false);
        STATE.board[i] = null;
        if (score > bestScore) {
          bestScore = score;
          bestMove = i;
        }
      }
    }
    return bestMove;
  }

  function minimax(board, depth, isMaximizing) {
    if (checkWin(board, 3, 3, "O")) return 10 - depth;
    if (checkWin(board, 3, 3, "X")) return depth - 10;
    if (board.every((cell) => cell !== null)) return 0;

    if (isMaximizing) {
      let bestScore = -Infinity;
      for (let i = 0; i < board.length; i++) {
        if (board[i] === null) {
          board[i] = "O";
          let score = minimax(board, depth + 1, false);
          board[i] = null;
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      let bestScore = Infinity;
      for (let i = 0; i < board.length; i++) {
        if (board[i] === null) {
          board[i] = "X";
          let score = minimax(board, depth + 1, true);
          board[i] = null;
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  }

  // --- ÉVÉNEMENTS & ÉCOUTEURS ---
  DOM.btn3x3.addEventListener("click", () => {
    if (STATE.gridSize === 3) return;
    DOM.btn3x3.classList.add("active");
    DOM.btn5x5.classList.remove("active");
    DOM.btnUnbeatable.classList.remove("hidden");
    STATE.gridSize = 3;
    STATE.currentPlayer = "X";
    initBoard();
  });

  DOM.btn5x5.addEventListener("click", () => {
    if (STATE.gridSize === 5) return;
    DOM.btn5x5.classList.add("active");
    DOM.btn3x3.classList.remove("active");
    STATE.gridSize = 5;
    STATE.currentPlayer = "X";

    // En 5x5, si l'IA était en "Imbattable", basculer en "Moyen"
    if (STATE.difficulty === "hard") {
      STATE.difficulty = "medium";
      DOM.diffButtons.forEach((b) => b.classList.remove("active"));
      document.querySelector('[data-diff="medium"]').classList.add("active");
    }
    document.getElementById("btn-unbeatable").classList.add("hidden");

    initBoard();
  });

  DOM.btnPvp.addEventListener("click", () => {
    DOM.btnPvp.classList.add("active");
    DOM.btnAi.classList.remove("active");
    DOM.aiDiffContainer.classList.add("hidden");
    STATE.opponent = "pvp";
    STATE.currentPlayer = "X";
    initBoard();
  });

  DOM.btnAi.addEventListener("click", () => {
    DOM.btnAi.classList.add("active");
    DOM.btnPvp.classList.remove("active");
    DOM.aiDiffContainer.classList.remove("hidden");
    STATE.opponent = "ai";
    STATE.currentPlayer = "X";
    initBoard();
  });

  DOM.diffButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      DOM.diffButtons.forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      STATE.difficulty = e.target.dataset.diff;
      STATE.currentPlayer = "X";
      initBoard();
    });
  });

  DOM.btnRestart.addEventListener("click", () => {
    STATE.currentPlayer = "X";
    initBoard();
  });

  DOM.btnResetScores.addEventListener("click", () => {
    STATE.scores = { x: 0, draw: 0, o: 0 };
    localStorage.removeItem("cyber_morpion_scores");
    updateHUD();
  });

  DOM.btnAudio.addEventListener("click", () => {
    STATE.isMuted = !STATE.isMuted;
    DOM.btnAudio.textContent = STATE.isMuted ? "🔇" : "🔊";
  });

  window.addEventListener("resize", () => {
    if (STATE.isGameOver) {
      // Re-tracer le laser si la fenêtre change de taille
      const winResult =
        checkWin(
          STATE.board,
          STATE.gridSize,
          STATE.winCondition,
          STATE.currentPlayer,
        ) ||
        checkWin(
          STATE.board,
          STATE.gridSize,
          STATE.winCondition,
          STATE.currentPlayer === "X" ? "O" : "X",
        );
      if (winResult) drawLaserLine(winResult.line);
    }
  });

  // Initialisation au démarrage
  initBoard();
});
