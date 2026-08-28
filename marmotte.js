document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------------------------
  // CONFIGURATION DES NIVEAUX
  // Chaque niveau contrôle la durée, la vitesse des taupes et son ambiance.
  // "acceleration" réduit progressivement le temps d'apparition durant la partie.
  // ---------------------------------------------------------------------------
  const DIFFICULTIES = {
    easy: {
      label: "FACILE",
      duration: 40,
      minVisible: 850,
      maxVisible: 1300,
      acceleration: 0.08,
      popFrequency: 520,
      tagline: "Respire : les néons menthe rendent les taupes presque zen.",
    },
    normal: {
      label: "NORMAL",
      duration: 35,
      minVisible: 620,
      maxVisible: 980,
      acceleration: 0.14,
      popFrequency: 620,
      tagline: "Le grand classique arcade, sous haute tension.",
    },
    hard: {
      label: "DIFFICILE",
      duration: 30,
      minVisible: 430,
      maxVisible: 720,
      acceleration: 0.2,
      popFrequency: 720,
      tagline: "Alerte rose : la piste accélère et ne pardonne plus.",
    },
    ultra: {
      label: "ULTRA",
      duration: 25,
      minVisible: 300,
      maxVisible: 540,
      acceleration: 0.27,
      popFrequency: 850,
      tagline: "Surcharge violette : passe en hyper vitesse.",
    },
    diabolical: {
      label: "DIABOLIQUE",
      duration: 20,
      minVisible: 240,
      maxVisible: 430,
      acceleration: 0.34,
      popFrequency: 980,
      tagline: "Aucune pitié. Le réseau infernal a pris le contrôle.",
    },
  };

  // Une seule clé conserve les anciens scores et accueille les deux nouveaux modes.
  const STORAGE_KEY = "neonWhackLeaderboardsV1";

  // ---------------------------------------------------------------------------
  // RÉFÉRENCES DE L'INTERFACE
  // Centraliser les sélecteurs évite de rechercher les mêmes éléments à chaque clic.
  // ---------------------------------------------------------------------------
  const holes = [...document.querySelectorAll(".hole")];
  const marmots = document.querySelectorAll(".marmot");
  const gameBoard = document.querySelector(".game-board");
  const views = document.querySelectorAll(".screen-view");
  const difficultyCards = document.querySelectorAll(".difficulty-card");
  const tagline = document.getElementById("tagline");
  const scoreBoard = document.getElementById("score");
  const timeBoard = document.getElementById("time");
  const missedShotsBoard = document.getElementById("missed-shots");
  const missedMolesBoard = document.getElementById("missed-moles");
  const gameStatus = document.getElementById("game-status");
  const difficultyBadge = document.getElementById("difficulty-badge");
  const gameOverScreen = document.getElementById("game-over");
  const finalScoreDisplay = document.getElementById("final-score");
  const finalMissedShots = document.getElementById("final-missed-shots");
  const finalMissedMoles = document.getElementById("final-missed-moles");
  const finalAccuracy = document.getElementById("final-accuracy");
  const finalDifficulty = document.getElementById("final-difficulty");
  const newRecord = document.getElementById("new-record");
  const leaderboardLists = document.getElementById("leaderboard-lists");

  // ---------------------------------------------------------------------------
  // ÉTAT DE LA PARTIE
  // Les minuteurs sont conservés ici afin de pouvoir les annuler en changeant d'écran.
  // ---------------------------------------------------------------------------
  let selectedDifficulty = "normal";
  let lastHole = null;
  let timeUp = true;
  let score = 0;
  let missedShots = 0;
  let missedMoles = 0;
  let timeLeft = DIFFICULTIES.normal.duration;
  let gameTimer;
  let popTimer;
  let overlayTimer;
  let memoryLeaderboard = createEmptyLeaderboards();

  // ---------------------------------------------------------------------------
  // AUDIO SYNTHÉTISÉ
  // Aucun fichier audio externe : les sons sont générés par la Web Audio API.
  // ---------------------------------------------------------------------------
  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(type, startFrequency, endFrequency, duration, volume) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startFrequency, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFrequency, this.ctx.currentTime + duration);
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    },
    playPop(frequency) { this.tone("sine", frequency / 2, frequency, 0.1, 0.16); },
    playBonk() { this.tone("square", 150, 40, 0.12, 0.32); },
    playMiss() { this.tone("sawtooth", 100, 65, 0.08, 0.08); },
    playStart() { this.tone("square", 180, 720, 0.2, 0.12); },
  };

  // ---------------------------------------------------------------------------
  // OUTILS D'INTERFACE ET NAVIGATION
  // ---------------------------------------------------------------------------
  function formatCounter(value) {
    return String(value).padStart(2, "0");
  }

  function updateCounter(element, value) {
    element.textContent = formatCounter(value);
    element.classList.remove("counter-pop");
    void element.offsetWidth; // Force le navigateur à rejouer l'animation du compteur.
    element.classList.add("counter-pop");
  }

  function showView(viewId) {
    views.forEach((view) => view.classList.toggle("hidden", view.id !== viewId));
  }

  function applyTheme(difficulty) {
    const settings = DIFFICULTIES[difficulty];
    document.body.dataset.theme = difficulty;
    tagline.textContent = settings.tagline;
  }

  function stopGame() {
    timeUp = true;
    clearInterval(gameTimer);
    clearTimeout(popTimer);
    clearTimeout(overlayTimer);
    holes.forEach((hole) => hole.classList.remove("up", "hit"));
    gameBoard.classList.remove("is-playing");
    gameOverScreen.classList.add("hidden");
  }

  function goToMenu() {
    stopGame();
    applyTheme(selectedDifficulty);
    showView("menu-view");
    document.getElementById("play-btn").focus();
  }

  function selectDifficulty(difficulty) {
    selectedDifficulty = difficulty;
    applyTheme(difficulty);
    difficultyCards.forEach((card) => {
      const isSelected = card.dataset.difficulty === difficulty;
      card.classList.toggle("selected", isSelected);
      card.setAttribute("aria-pressed", String(isSelected));
    });
  }

  // ---------------------------------------------------------------------------
  // LEADERBOARDS LOCAUX
  // Les données sont séparées par difficulté et limitées aux cinq meilleures runs.
  // ---------------------------------------------------------------------------
  function createEmptyLeaderboards() {
    return Object.fromEntries(Object.keys(DIFFICULTIES).map((key) => [key, []]));
  }

  function getLeaderboards() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && typeof stored === "object") {
        return Object.fromEntries(
          Object.keys(DIFFICULTIES).map((key) => [key, Array.isArray(stored[key]) ? stored[key] : []]),
        );
      }
    } catch (error) {
      console.warn("Leaderboard local indisponible.", error);
    }
    return memoryLeaderboard;
  }

  function saveLeaderboard(leaderboards) {
    memoryLeaderboard = leaderboards;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leaderboards));
    } catch (error) {
      console.warn("Sauvegarde locale indisponible.", error);
    }
  }

  function addLeaderboardEntry(accuracy) {
    const leaderboards = getLeaderboards();
    const entry = {
      id: `${Date.now()}-${Math.random()}`,
      score,
      accuracy,
      missedMoles,
      date: new Date().toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    };

    leaderboards[selectedDifficulty].push(entry);
    // Les égalités sont départagées par la précision puis par le moins de taupes loupées.
    leaderboards[selectedDifficulty].sort(
      (a, b) => b.score - a.score || b.accuracy - a.accuracy || a.missedMoles - b.missedMoles,
    );
    leaderboards[selectedDifficulty] = leaderboards[selectedDifficulty].slice(0, 5);
    saveLeaderboard(leaderboards);
    return leaderboards[selectedDifficulty].some((item) => item.id === entry.id);
  }

  function renderLeaderboards() {
    const leaderboards = getLeaderboards();
    leaderboardLists.replaceChildren();

    Object.entries(DIFFICULTIES).forEach(([key, difficulty]) => {
      const card = document.createElement("article");
      card.className = `leaderboard-card leaderboard-${key}`;

      const title = document.createElement("h3");
      title.textContent = difficulty.label;
      card.appendChild(title);

      const list = document.createElement("ol");
      const entries = leaderboards[key].slice(0, 5);
      if (!entries.length) {
        const empty = document.createElement("li");
        empty.className = "leaderboard-empty";
        empty.textContent = "Aucun score — à toi de jouer !";
        list.appendChild(empty);
      } else {
        entries.forEach((entry, index) => {
          const item = document.createElement("li");
          const rank = document.createElement("span");
          const result = document.createElement("strong");
          const meta = document.createElement("small");
          rank.className = "rank";
          result.className = "leaderboard-score";
          rank.textContent = `#${index + 1}`;
          result.textContent = `${entry.score} PTS`;
          meta.textContent = `${entry.accuracy}% · ${entry.date}`;
          item.append(rank, result, meta);
          list.appendChild(item);
        });
      }
      card.appendChild(list);
      leaderboardLists.appendChild(card);
    });
  }

  function openLeaderboard() {
    stopGame();
    renderLeaderboards();
    showView("leaderboard-view");
    document.getElementById("leaderboard-back-btn").focus();
  }

  // ---------------------------------------------------------------------------
  // LOGIQUE DU JEU
  // Une seule taupe est active à la fois ; son temps visible dépend du niveau.
  // ---------------------------------------------------------------------------
  function triggerVibration(pattern = 45) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function randomTime(min, max) {
    return Math.round(Math.random() * (max - min) + min);
  }

  function randomHole() {
    const availableHoles = holes.filter((hole) => hole !== lastHole);
    const hole = availableHoles[Math.floor(Math.random() * availableHoles.length)];
    lastHole = hole;
    return hole;
  }

  function registerMissedMole() {
    missedMoles += 1;
    updateCounter(missedMolesBoard, missedMoles);
  }

  function peep() {
    if (timeUp) return;
    const settings = DIFFICULTIES[selectedDifficulty];
    const progress = 1 - timeLeft / settings.duration;
    const speedBoost = 1 - progress * settings.acceleration;
    const visibleTime = randomTime(settings.minVisible * speedBoost, settings.maxVisible * speedBoost);
    const hole = randomHole();

    hole.classList.remove("hit");
    hole.classList.add("up");
    AudioEngine.playPop(settings.popFrequency);

    popTimer = window.setTimeout(() => {
      if (hole.classList.contains("up")) {
        hole.classList.remove("up");
        registerMissedMole();
      }
      if (!timeUp) peep();
    }, visibleTime);
  }

  function resetGame() {
    const settings = DIFFICULTIES[selectedDifficulty];
    score = 0;
    missedShots = 0;
    missedMoles = 0;
    timeLeft = settings.duration;
    lastHole = null;
    scoreBoard.textContent = "00";
    timeBoard.textContent = formatCounter(timeLeft);
    missedShotsBoard.textContent = "00";
    missedMolesBoard.textContent = "00";
    timeBoard.parentElement.classList.remove("time-critical");
    holes.forEach((hole) => hole.classList.remove("up", "hit"));
  }

  function startGame() {
    stopGame();
    AudioEngine.init();
    AudioEngine.playStart();
    resetGame();
    timeUp = false;
    applyTheme(selectedDifficulty);
    difficultyBadge.textContent = DIFFICULTIES[selectedDifficulty].label;
    difficultyBadge.dataset.difficulty = selectedDifficulty;
    gameStatus.textContent = "PARTIE EN COURS · Frappe vite !";
    gameBoard.classList.add("is-playing");
    gameOverScreen.classList.add("hidden");
    showView("game-view");
    peep();

    gameTimer = window.setInterval(() => {
      timeLeft -= 1;
      timeBoard.textContent = formatCounter(Math.max(timeLeft, 0));
      if (timeLeft <= 5) timeBoard.parentElement.classList.add("time-critical");
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function endGame() {
    if (timeUp) return;
    timeUp = true;
    clearInterval(gameTimer);
    clearTimeout(popTimer);

    // La taupe encore visible à la sonnerie compte comme loupée.
    holes.forEach((hole) => {
      if (hole.classList.contains("up")) registerMissedMole();
      hole.classList.remove("up");
    });
    gameBoard.classList.remove("is-playing");
    gameStatus.textContent = "Temps écoulé · Belle partie !";

    const totalShots = score + missedShots;
    const accuracy = totalShots ? Math.round((score / totalShots) * 100) : 0;
    const madeTopFive = addLeaderboardEntry(accuracy);
    finalScoreDisplay.textContent = score;
    finalMissedShots.textContent = missedShots;
    finalMissedMoles.textContent = missedMoles;
    finalAccuracy.textContent = `${accuracy}%`;
    finalDifficulty.textContent = `${DIFFICULTIES[selectedDifficulty].label} · RUN COMPLETE`;
    newRecord.classList.toggle("hidden", !madeTopFive);

    overlayTimer = window.setTimeout(() => {
      gameOverScreen.classList.remove("hidden");
      document.getElementById("restart-btn").focus();
    }, 420);
  }

  function whack(event) {
    if (!event.isTrusted || timeUp) return;
    const hole = event.currentTarget.parentElement;
    if (!hole.classList.contains("up")) return;
    event.stopPropagation();
    score += 1;
    hole.classList.remove("up");
    hole.classList.add("hit");
    updateCounter(scoreBoard, score);
    AudioEngine.playBonk();
    triggerVibration();
  }

  function missShot(event) {
    if (timeUp || event.target.closest(".hole.up .marmot")) return;
    missedShots += 1;
    updateCounter(missedShotsBoard, missedShots);
    gameBoard.classList.remove("miss-flash");
    void gameBoard.offsetWidth;
    gameBoard.classList.add("miss-flash");
    AudioEngine.playMiss();
    triggerVibration([18, 24, 18]);
  }

  // ---------------------------------------------------------------------------
  // ÉVÉNEMENTS
  // Pointer Events unifie souris, stylet et écran tactile sans double comptage.
  // ---------------------------------------------------------------------------
  difficultyCards.forEach((card) => card.addEventListener("click", () => selectDifficulty(card.dataset.difficulty)));
  marmots.forEach((marmot) => marmot.addEventListener("pointerdown", whack));
  gameBoard.addEventListener("pointerdown", missShot);
  document.getElementById("play-btn").addEventListener("click", startGame);
  document.getElementById("quit-btn").addEventListener("click", goToMenu);
  document.getElementById("leaderboard-btn").addEventListener("click", openLeaderboard);
  document.getElementById("leaderboard-back-btn").addEventListener("click", goToMenu);
  document.getElementById("restart-btn").addEventListener("click", startGame);
  document.getElementById("results-menu-btn").addEventListener("click", goToMenu);
  document.getElementById("results-leaderboard-btn").addEventListener("click", openLeaderboard);

  // Assure la cohérence du thème au premier affichage.
  applyTheme(selectedDifficulty);
});
