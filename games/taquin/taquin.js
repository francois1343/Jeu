/**
 * PIXEL TAQUIN - Sliding Tile Puzzle Engine
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- ÉTAT DU JEU ---
  let gridSize = 3; // 3x3, 4x4 ou 5x5
  let currentTheme = "sunset";
  let tiles = []; // Ordre actuel des tuiles
  let emptyTileIndex = 0; // Index de la case vide (0 à gridSize^2 - 1)
  let moves = 0;
  let secondsElapsed = 0;
  let timerInterval = null;
  let shuffleInterval = null;
  let isGameActive = false;
  let showNumbers = true;
  let uiTheme = "dark";

  // Support Swipe Tactile
  let touchStartX = 0;
  let touchStartY = 0;

  // Éléments DOM
  const boardElement = document.getElementById("puzzle-board");
  const previewElement = document.getElementById("image-preview");
  const moveCountElement = document.getElementById("move-count");
  const timerElement = document.getElementById("timer");
  const victoryOverlay = document.getElementById("victory-overlay");
  const victoryStats = document.getElementById("victory-stats");
  const leaderboardList = document.getElementById("leaderboard-list");
  const menuScreen = document.getElementById("menu-screen");
  const gameScreen = document.getElementById("game-screen");
  const numbersButton = document.getElementById("btn-toggle-numbers");
  const menuThemePreview = document.getElementById("menu-theme-preview");
  const uiThemeButtons = document.querySelectorAll(".btn-ui-theme");
  const sizeButtons = document.querySelectorAll(".btn-size");
  const themeButtons = document.querySelectorAll(".btn-theme");

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
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "slide") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "shuffle") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "win") {
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25]; // Do, Mi, Sol, Do, Mi
      notes.forEach((freq, idx) => {
        const noteOsc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        noteOsc.connect(noteGain);
        noteOsc.connect(audioCtx.destination);
        noteOsc.frequency.setValueAtTime(freq, now + idx * 0.09);
        noteGain.gain.setValueAtTime(0.15, now + idx * 0.09);
        noteGain.gain.exponentialRampToValueAtTime(
          0.01,
          now + idx * 0.09 + 0.25,
        );
        noteOsc.start(now + idx * 0.09);
        noteOsc.stop(now + idx * 0.09 + 0.25);
      });
    }
  }

  function triggerHaptic() {
    if (navigator.vibrate) {
      navigator.vibrate(25);
    }
  }

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
    timerInterval = null;
  }

  function updateTimerDisplay() {
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const secs = String(secondsElapsed % 60).padStart(2, "0");
    timerElement.textContent = `${mins}:${secs}`;
  }

  // --- CRÉATION & MISE À JOUR DU PLATEAU DE JEU ---
  function initBoard() {
    boardElement.style.setProperty("--grid-size", gridSize);
    boardElement.innerHTML = "";
    tiles = [];

    const totalTiles = gridSize * gridSize;
    emptyTileIndex = totalTiles - 1; // La dernière case est la case vide initialement

    for (let id = 0; id < totalTiles; id++) {
      const tile = document.createElement("div");
      tile.classList.add("tile", `theme-${currentTheme}`);
      tile.dataset.id = id;

      if (id === totalTiles - 1) {
        tile.classList.add("empty");
      } else {
        const numberSpan = document.createElement("span");
        numberSpan.classList.add("tile-number");
        numberSpan.textContent = id + 1;
        if (!showNumbers) numberSpan.style.display = "none";
        tile.appendChild(numberSpan);
      }

      // Gestion des évènements Clic
      tile.addEventListener("click", () => handleTileClick(id));

      boardElement.appendChild(tile);
      tiles.push({ id: id, element: tile });
    }

    updateTilePositions(false); // Placement direct sans transition pour l'init
  }

  function updateTilePositions(animate = true) {
    const boardSize = boardElement.clientWidth;
    const gap = 4; // correspond à --tile-gap en CSS
    const tileSize = (boardSize - gap * (gridSize + 1)) / gridSize;

    tiles.forEach((tileObj, currentIndex) => {
      const row = Math.floor(currentIndex / gridSize);
      const col = currentIndex % gridSize;

      const x = gap + col * (tileSize + gap);
      const y = gap + row * (tileSize + gap);

      // Transition CSS fluide
      tileObj.element.style.transition = animate
        ? "transform 0.18s cubic-bezier(0.2, 0, 0, 1)"
        : "none";
      tileObj.element.style.transform = `translate(${x}px, ${y}px)`;

      // Découpage dynamique du fond CSS (Background Position)
      if (tileObj.id !== gridSize * gridSize - 1) {
        const origRow = Math.floor(tileObj.id / gridSize);
        const origCol = tileObj.id % gridSize;
        const bgX = (origCol / (gridSize - 1)) * 100;
        const bgY = (origRow / (gridSize - 1)) * 100;
        tileObj.element.style.backgroundPosition = `${bgX}% ${bgY}%`;
      }
    });
  }

  // --- ALGORITHME DE MÉLANGE 100% RÉSOLVABLE ---
  function shufflePuzzle() {
    initAudio();
    if (shuffleInterval) clearInterval(shuffleInterval);
    stopTimer();
    moves = 0;
    moveCountElement.textContent = moves;
    victoryOverlay.classList.add("hidden");
    isGameActive = false;

    // Réinitialiser la grille à la position résolue
    const totalTiles = gridSize * gridSize;
    tiles.sort((a, b) => a.id - b.id);
    emptyTileIndex = totalTiles - 1;

    // Nombre de mouvements aléatoires légitimes
    const shuffleSteps = gridSize === 3 ? 50 : gridSize === 4 ? 80 : 120;
    let lastMovedIndex = -1;

    let stepCount = 0;
    shuffleInterval = setInterval(() => {
      const validNeighbors = getValidNeighbors(emptyTileIndex).filter(
        (idx) => idx !== lastMovedIndex,
      );
      const randomNeighbor =
        validNeighbors[Math.floor(Math.random() * validNeighbors.length)];

      // Échanger la case vide avec le voisin choisi
      swapTiles(emptyTileIndex, randomNeighbor, false);
      lastMovedIndex = emptyTileIndex;
      emptyTileIndex = randomNeighbor;

      playSound("shuffle");
      stepCount++;

      if (stepCount >= shuffleSteps) {
        clearInterval(shuffleInterval);
        shuffleInterval = null;
        updateTilePositions(true);
        startTimer();
        isGameActive = true;
      }
    }, 12);
  }

  function getValidNeighbors(index) {
    const neighbors = [];
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;

    if (row > 0) neighbors.push(index - gridSize); // Haut
    if (row < gridSize - 1) neighbors.push(index + gridSize); // Bas
    if (col > 0) neighbors.push(index - 1); // Gauche
    if (col < gridSize - 1) neighbors.push(index + 1); // Droite

    return neighbors;
  }

  function swapTiles(indexA, indexB, animate = true) {
    const temp = tiles[indexA];
    tiles[indexA] = tiles[indexB];
    tiles[indexB] = temp;

    if (animate) {
      updateTilePositions(true);
    }
  }

  // --- MÉCANIQUE DE JEU (MOUVEMENT) ---
  function handleTileClick(tileId) {
    if (!isGameActive) return;

    const currentIndex = tiles.findIndex((t) => t.id === tileId);
    const neighbors = getValidNeighbors(emptyTileIndex);

    if (neighbors.includes(currentIndex)) {
      initAudio();
      triggerHaptic();
      playSound("slide");

      swapTiles(currentIndex, emptyTileIndex, true);
      emptyTileIndex = currentIndex;

      moves++;
      moveCountElement.textContent = moves;

      checkVictory();
    }
  }

  // Support des gestes Swipe (Tactile)
  boardElement.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  boardElement.addEventListener(
    "touchend",
    (e) => {
      if (!isGameActive) return;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // Seuil minimal pour déclencher le glissement
      if (Math.abs(diffX) < 30 && Math.abs(diffY) < 30) return;

      const emptyRow = Math.floor(emptyTileIndex / gridSize);
      const emptyCol = emptyTileIndex % gridSize;
      let targetIndex = -1;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Glissement Horizontal
        if (diffX > 0 && emptyCol > 0) {
          targetIndex = emptyTileIndex - 1; // Swipe Droite -> Déplace la tuile de gauche vers la droite
        } else if (diffX < 0 && emptyCol < gridSize - 1) {
          targetIndex = emptyTileIndex + 1; // Swipe Gauche -> Déplace la tuile de droite vers la gauche
        }
      } else {
        // Glissement Vertical
        if (diffY > 0 && emptyRow > 0) {
          targetIndex = emptyTileIndex - gridSize; // Swipe Bas -> Déplace la tuile du haut vers le bas
        } else if (diffY < 0 && emptyRow < gridSize - 1) {
          targetIndex = emptyTileIndex + gridSize; // Swipe Haut -> Déplace la tuile du bas vers le haut
        }
      }

      if (targetIndex !== -1) {
        handleTileClick(tiles[targetIndex].id);
      }
    },
    { passive: true },
  );

  // Raccourcis Clavier (Flèches directionnelles)
  document.addEventListener("keydown", (e) => {
    if (!isGameActive) return;
    const emptyRow = Math.floor(emptyTileIndex / gridSize);
    const emptyCol = emptyTileIndex % gridSize;
    let targetIndex = -1;

    if (e.key === "ArrowUp" && emptyRow < gridSize - 1)
      targetIndex = emptyTileIndex + gridSize;
    if (e.key === "ArrowDown" && emptyRow > 0)
      targetIndex = emptyTileIndex - gridSize;
    if (e.key === "ArrowLeft" && emptyCol < gridSize - 1)
      targetIndex = emptyTileIndex + 1;
    if (e.key === "ArrowRight" && emptyCol > 0)
      targetIndex = emptyTileIndex - 1;

    if (targetIndex !== -1) {
      handleTileClick(tiles[targetIndex].id);
    }
  });

  // --- VÉRIFICATION ET GESTION DE LA VICTOIRE ---
  function checkVictory() {
    const isSolved = tiles.every((tile, index) => tile.id === index);

    if (isSolved) {
      isGameActive = false;
      window.ArcadeGameSession?.win({ moves, seconds: secondsElapsed, gridSize });
      stopTimer();
      playSound("win");
      triggerHaptic();

      const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
      const secs = String(secondsElapsed % 60).padStart(2, "0");

      victoryStats.textContent = `Résolu en ${moves} coups et ${mins}:${secs} !`;
      victoryOverlay.classList.remove("hidden");

      saveScore(gridSize, moves, secondsElapsed);
      updateLeaderboardUI(gridSize);
    }
  }

  // --- LEADERBOARD & PERSISTANCE LOCALSTORAGE ---
  function saveScore(grid, movesCount, timeInSeconds) {
    const scores = JSON.parse(
      localStorage.getItem("taquin_leaderboard") || "{}",
    );
    const key = `${grid}x${grid}`;

    if (!scores[key]) scores[key] = [];

    scores[key].push({
      moves: movesCount,
      time: timeInSeconds,
      date: new Date().toLocaleDateString("fr-FR"),
    });

    // Tri combiné : Mouvements puis Temps d'exécution
    scores[key].sort((a, b) => a.moves - b.moves || a.time - b.time);
    scores[key] = scores[key].slice(0, 5); // Conserver les 5 meilleurs

    localStorage.setItem("taquin_leaderboard", JSON.stringify(scores));
  }

  function updateLeaderboardUI(tabGridSize = 3) {
    const scores = JSON.parse(
      localStorage.getItem("taquin_leaderboard") || "{}",
    );
    const list = scores[`${tabGridSize}x${tabGridSize}`] || [];
    leaderboardList.innerHTML = "";

    if (list.length === 0) {
      leaderboardList.innerHTML =
        "<li><span>Aucun score enregistré</span></li>";
      return;
    }

    list.forEach((score, index) => {
      const mins = String(Math.floor(score.time / 60)).padStart(2, "0");
      const secs = String(score.time % 60).padStart(2, "0");
      const li = document.createElement("li");
      li.innerHTML = `
                <span class="rank">#${index + 1}</span>
                <span>${score.moves} coups</span>
                <span class="details">${mins}:${secs} (${score.date})</span>
            `;
      leaderboardList.appendChild(li);
    });
  }

  function applyUiTheme(theme) {
    uiTheme = theme;
    document.documentElement.dataset.uiTheme = theme;
    uiThemeButtons.forEach((button) => {
      const isSelected = button.dataset.uiTheme === theme;
      button.classList.toggle("active", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
    localStorage.setItem("taquin_ui_theme", theme);
  }

  function showMenu() {
    isGameActive = false;
    stopTimer();
    if (shuffleInterval) {
      clearInterval(shuffleInterval);
      shuffleInterval = null;
    }
    victoryOverlay.classList.add("hidden");
    gameScreen.classList.add("hidden");
    gameScreen.setAttribute("aria-hidden", "true");
    menuScreen.classList.remove("hidden");
    menuScreen.setAttribute("aria-hidden", "false");
    document.querySelectorAll(".tab-btn").forEach((tab) => {
      tab.classList.toggle("active", parseInt(tab.dataset.tab) === gridSize);
    });
    updateLeaderboardUI(gridSize);
  }

  function startGame() {
    window.ArcadeGameSession?.start({ mode: "selected_image" });
    menuScreen.classList.add("hidden");
    menuScreen.setAttribute("aria-hidden", "true");
    gameScreen.classList.remove("hidden");
    gameScreen.setAttribute("aria-hidden", "false");
    initBoard();
    shufflePuzzle();
  }

  function selectGridSize(size) {
    gridSize = size;
    sizeButtons.forEach((button) => {
      button.classList.toggle("active", parseInt(button.dataset.size) === size);
    });
  }

  function selectTheme(theme) {
    const oldTheme = currentTheme;
    currentTheme = theme;
    themeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.theme === theme);
    });

    previewElement.classList.remove(`theme-${oldTheme}`);
    previewElement.classList.add(`theme-${currentTheme}`);
    menuThemePreview.classList.remove(`theme-${oldTheme}`);
    menuThemePreview.classList.add(`theme-${currentTheme}`);

    document.querySelectorAll(".tile").forEach((tile) => {
      tile.classList.remove(`theme-${oldTheme}`);
      tile.classList.add(`theme-${currentTheme}`);
    });
  }

  function setNumbers(shouldShow) {
    showNumbers = shouldShow;
    numbersButton.classList.toggle("active", showNumbers);
    numbersButton.setAttribute("aria-pressed", String(showNumbers));
    numbersButton.innerHTML = `<span class="icon">🔢</span> Numéros : ${showNumbers ? "ON" : "OFF"}`;
  }

  function startRandomGame() {
    window.ArcadeGameSession?.start({ mode: "random" });
    const sizes = [3, 4, 5];
    const themes = Array.from(themeButtons, (button) => button.dataset.theme);
    selectGridSize(sizes[Math.floor(Math.random() * sizes.length)]);
    setNumbers(Math.random() >= 0.5);
    selectTheme(themes[Math.floor(Math.random() * themes.length)]);
    startGame();
  }

  // --- ÉVÉNEMENTS UI & DÉLÉGATION ---
  // Sélecteur de taille de grille
  sizeButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      selectGridSize(parseInt(e.currentTarget.dataset.size));
    });
  });

  // Sélecteur de thèmes visuels
  themeButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      selectTheme(e.currentTarget.dataset.theme);
    });
  });

  // Basculer l'affichage des numéros sur les tuiles
  numbersButton.addEventListener("click", (e) => {
    setNumbers(!showNumbers);
  });

  // Apparence globale de l'application
  uiThemeButtons.forEach((button) => {
    button.addEventListener("click", () =>
      applyUiTheme(button.dataset.uiTheme),
    );
  });

  // Tabs Leaderboard
  document.querySelectorAll(".tab-btn").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((t) => t.classList.remove("active"));
      e.target.classList.add("active");
      updateLeaderboardUI(parseInt(e.target.dataset.tab));
    });
  });

  // Boutons de navigation et actions de jeu
  document
    .getElementById("btn-start-game")
    .addEventListener("click", startGame);
  document
    .getElementById("btn-random-game")
    .addEventListener("click", startRandomGame);
  document
    .getElementById("btn-back-to-menu")
    .addEventListener("click", showMenu);
  document
    .getElementById("btn-victory-menu")
    .addEventListener("click", showMenu);
  document
    .getElementById("btn-shuffle")
    .addEventListener("click", shufflePuzzle);
  document
    .getElementById("btn-restart")
    .addEventListener("click", shufflePuzzle);

  // Ajustement de la taille au redimensionnement de la fenêtre
  window.addEventListener("resize", () => updateTilePositions(false));

  // --- INITIALISATION DU JEU ---
  // Le jeu démarre depuis le menu : aucune partie n'est lancée automatiquement.
  const savedUiTheme = localStorage.getItem("taquin_ui_theme");
  if (savedUiTheme === "light" || savedUiTheme === "dark")
    applyUiTheme(savedUiTheme);
  updateLeaderboardUI(3);
});
