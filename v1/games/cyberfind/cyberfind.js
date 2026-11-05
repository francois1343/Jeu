/**
 * CYBERFIND
 * Moteur de jeu : génération de scène, contrôles et progression de mission.
 */
document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------------------------
  // Configuration statique
  // ---------------------------------------------------------------------------

  const WORLD = {
    width: 2400,
    height: 1600,
    minScale: 0.5,
    maxScale: 3,
    safeMargin: 100,
  };

  const DIFFICULTIES = {
    rookie: {
      label: "RECRUE",
      targetCount: 10,
      clutterCount: 72,
      hintDelay: 18,
      initialScale: 0.76,
    },
    agent: {
      label: "AGENT",
      targetCount: 16,
      clutterCount: 108,
      hintDelay: 26,
      initialScale: 0.68,
    },
    ghost: {
      label: "FANTÔME",
      targetCount: 24,
      clutterCount: 145,
      hintDelay: 34,
      initialScale: 0.6,
    },
    overload: {
      label: "SURCHARGE",
      targetCount: 32,
      clutterCount: 190,
      hintDelay: 42,
      initialScale: 0.54,
    },
  };

  // Les objets peuvent être choisis comme cibles selon le niveau sélectionné.
  const TARGET_CATALOG = [
    ["Chat cyber", "🐱"],
    ["Puce quantum", "💾"],
    ["Ramen néon", "🍜"],
    ["Clé crypto", "🔑"],
    ["Mini bot", "🤖"],
    ["Crâne holo", "💀"],
    ["Batterie", "🔋"],
    ["Disquette", "💽"],
    ["Satellite", "🛰️"],
    ["Micro caméra", "📷"],
    ["Orbe plasma", "🔮"],
    ["Casque audio", "🎧"],
    ["Joystick", "🕹️"],
    ["Signal alien", "👾"],
    ["Verrou data", "🔐"],
    ["Pizza synthétique", "🍕"],
    ["Radio pirate", "📻"],
    ["Micro fusée", "🚀"],
    ["Cristal data", "💎"],
    ["Échantillon ADN", "🧬"],
    ["Globe réseau", "🌐"],
    ["Œil bionique", "👁️"],
    ["Aimant", "🧲"],
    ["Dé crypté", "🎲"],
    ["Archive rétro", "📀"],
    ["Comlink", "📱"],
    ["Neuro puce", "🧠"],
    ["Masque proxy", "🎭"],
    ["Anneau photon", "💍"],
    ["Fantôme glitch", "👻"],
    ["Éclair isolé", "⚡"],
    ["Manette", "🎮"],
    ["Micro espion", "🎙️"],
    ["Café noir", "☕"],
    ["Ancre réseau", "⚓"],
    ["Sablier", "⌛"],
    ["Couronne de code", "👑"],
    ["Champignon pixel", "🍄"],
    ["Ballon sonde", "🎈"],
    ["Fragment puzzle", "🧩"],
  ];

  // Ces éléments enrichissent le décor, mais ne font pas partie des cibles.
  const DECORATION_CATALOG = [
    "🪙",
    "🧃",
    "📎",
    "🧸",
    "🪫",
    "🧤",
    "🛹",
    "🎲",
    "📦",
    "🧪",
    "🎵",
    "🧷",
    "🪜",
    "🪑",
    "🪴",
    "🧱",
    "🗜️",
    "🔧",
    "⚙️",
    "🧯",
    "🪞",
    "🧼",
    "🪠",
    "🪃",
    "🛸",
    "🧻",
    "🧿",
    "📡",
    "🕯️",
    "🌂",
    "🛒",
    "🥽",
    "🎯",
  ];

  // ---------------------------------------------------------------------------
  // Références DOM et état d'application
  // ---------------------------------------------------------------------------

  const getElement = (id) => document.getElementById(id);

  const elements = {
    viewport: getElement("viewport"),
    world: getElement("world"),
    hitboxLayer: getElement("hitbox-layer"),
    ambientLayer: getElement("ambient-layer"),
    objectList: getElement("object-list"),
    objectListContainer: getElement("object-list-container"),
    foundCount: getElement("found-count"),
    timer: getElement("timer"),
    hintButton: getElement("btn-hint"),
    hintLabel: getElement("hint-cooldown"),
    pauseButton: getElement("btn-pause"),
    difficultyLabel: getElement("difficulty-label"),
    menuOverlay: getElement("menu-overlay"),
    pauseOverlay: getElement("pause-overlay"),
    victoryOverlay: getElement("victory-overlay"),
    victoryStats: getElement("victory-stats"),
    bestTime: getElement("best-time"),
    canvas: getElement("effects-canvas"),
  };

  const context = elements.canvas.getContext("2d");

  const game = {
    selectedDifficulty: "rookie",
    difficulty: null,
    targets: [],
    foundTargetIds: new Set(),
    secondsElapsed: 0,
    hintSecondsRemaining: 0,
    isPlaying: false,
    isPaused: false,
    timerId: null,
    hintTimerId: null,
    particles: [],
  };

  const camera = {
    scale: 1,
    x: 0,
    y: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    pinchDistance: null,
    pinchStartScale: 1,
  };

  let audioContext = null;

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  const randomBetween = (min, max) => Math.random() * (max - min) + min;
  const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
  const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

  function formatTime(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return minutes + ":" + seconds;
  }

  function setStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  // ---------------------------------------------------------------------------
  // Audio et retour haptique
  // ---------------------------------------------------------------------------

  function getAudioContext() {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    return audioContext;
  }

  function playSingleNote(type) {
    const audio = getAudioContext();
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const isFoundSound = type === "found";

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.type = isFoundSound ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(isFoundSound ? 480 : 145, now);

    if (isFoundSound) {
      oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.18);
    }

    gain.gain.setValueAtTime(isFoundSound ? 0.13 : 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  function playVictorySound() {
    const audio = getAudioContext();
    const now = audio.currentTime;

    [440, 554, 659, 880].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const startTime = now + index * 0.1;

      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.28);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    });
  }

  function playSound(type) {
    if (type === "win") {
      playVictorySound();
      return;
    }

    playSingleNote(type);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // ---------------------------------------------------------------------------
  // Caméra : zoom, panoramique et limites du monde
  // ---------------------------------------------------------------------------

  function applyCameraTransform() {
    const minX = Math.min(
      WORLD.safeMargin,
      elements.viewport.clientWidth -
        WORLD.width * camera.scale -
        WORLD.safeMargin,
    );
    const minY = Math.min(
      WORLD.safeMargin,
      elements.viewport.clientHeight -
        WORLD.height * camera.scale -
        WORLD.safeMargin,
    );

    camera.x = Math.min(WORLD.safeMargin, Math.max(minX, camera.x));
    camera.y = Math.min(WORLD.safeMargin, Math.max(minY, camera.y));
    elements.world.style.transform =
      "translate(" +
      camera.x +
      "px, " +
      camera.y +
      "px) scale(" +
      camera.scale +
      ")";
  }

  function resetCamera() {
    camera.scale = game.difficulty.initialScale;
    camera.x = (elements.viewport.clientWidth - WORLD.width * camera.scale) / 2;
    camera.y =
      (elements.viewport.clientHeight - WORLD.height * camera.scale) / 2;
    applyCameraTransform();
  }

  function zoomAtPoint(factor, pointX, pointY) {
    if (!game.isPlaying || game.isPaused) return;

    const nextScale = Math.min(
      WORLD.maxScale,
      Math.max(WORLD.minScale, camera.scale * factor),
    );
    const actualFactor = nextScale / camera.scale;

    camera.x = pointX - (pointX - camera.x) * actualFactor;
    camera.y = pointY - (pointY - camera.y) * actualFactor;
    camera.scale = nextScale;
    applyCameraTransform();
  }

  // ---------------------------------------------------------------------------
  // Génération procédurale de la mission
  // ---------------------------------------------------------------------------

  function positionOverlaps(position, size, occupiedPositions) {
    return occupiedPositions.some((occupied) => {
      const distance = Math.hypot(
        position.x - occupied.x,
        position.y - occupied.y,
      );
      return distance < (size + occupied.size) * 0.72;
    });
  }

  function findAvailablePosition(size, occupiedPositions) {
    let position;
    let attempts = 0;

    do {
      position = {
        x: randomBetween(75, WORLD.width - 75 - size),
        y: randomBetween(150, WORLD.height - 120 - size),
      };
      attempts += 1;
    } while (
      positionOverlaps(position, size, occupiedPositions) &&
      attempts < 120
    );

    return position;
  }

  function createTargets(occupiedPositions) {
    return shuffle(TARGET_CATALOG)
      .slice(0, game.difficulty.targetCount)
      .map(([name, icon], index) => {
        const size = randomBetween(46, 78);
        const position = findAvailablePosition(size, occupiedPositions);
        const target = {
          id: "target-" + index,
          name,
          icon,
          x: position.x,
          y: position.y,
          size,
          tilt: randomBetween(-22, 22),
        };

        occupiedPositions.push({
          x: position.x + size / 2,
          y: position.y + size / 2,
          size,
        });

        return target;
      });
  }

  function createDecorations(occupiedPositions) {
    for (let index = 0; index < game.difficulty.clutterCount; index += 1) {
      const size = randomBetween(25, 72);
      const position = findAvailablePosition(size, occupiedPositions);
      const decoration = document.createElement("span");

      occupiedPositions.push({
        x: position.x + size / 2,
        y: position.y + size / 2,
        size: size * 0.55,
      });

      decoration.className = "ambient-item";
      decoration.textContent = randomItem(DECORATION_CATALOG);
      setStyles(decoration, {
        left: position.x + "px",
        top: position.y + "px",
        "--size": size + "px",
        "--tilt": randomBetween(-35, 35) + "deg",
        "--opacity": randomBetween(0.38, 0.88),
      });

      elements.ambientLayer.appendChild(decoration);
    }
  }

  function createTargetCard(target) {
    const card = document.createElement("li");
    card.id = "card-" + target.id;
    card.className = "object-card";
    card.innerHTML =
      '<span class="thumb">' +
      target.icon +
      '</span><span class="name">' +
      target.name +
      "</span>";
    elements.objectList.appendChild(card);
  }

  function createTargetHitbox(target) {
    const hitbox = document.createElement("button");

    hitbox.type = "button";
    hitbox.className = "hitbox";
    hitbox.setAttribute("aria-label", "Trouver : " + target.name);
    setStyles(hitbox, {
      left: target.x + "px",
      top: target.y + "px",
      width: target.size + "px",
      height: target.size + "px",
      "--tilt": target.tilt + "deg",
    });

    hitbox.innerHTML =
      '<span class="object-visual" style="--size:' +
      target.size * 0.77 +
      "px;--tilt:" +
      target.tilt +
      'deg">' +
      target.icon +
      "</span>";

    hitbox.addEventListener("click", (event) => {
      event.stopPropagation();
      findTarget(target);
    });

    elements.hitboxLayer.appendChild(hitbox);
  }

  function generateScene() {
    elements.hitboxLayer.innerHTML = "";
    elements.ambientLayer.innerHTML = "";
    elements.objectList.innerHTML = "";
    game.foundTargetIds.clear();
    game.particles = [];

    const occupiedPositions = [];
    game.targets = createTargets(occupiedPositions);
    createDecorations(occupiedPositions);
    game.targets.forEach((target) => {
      createTargetCard(target);
      createTargetHitbox(target);
    });
  }

  // ---------------------------------------------------------------------------
  // Interface, minuteries et indice
  // ---------------------------------------------------------------------------

  function updateInterface() {
    elements.foundCount.textContent =
      game.foundTargetIds.size + " / " + game.targets.length;
    elements.timer.textContent = formatTime(game.secondsElapsed);
    elements.difficultyLabel.textContent = game.difficulty
      ? game.difficulty.label + " // " + game.targets.length + " CIBLES"
      : "—";
  }

  function stopGameTimers() {
    clearInterval(game.timerId);
    clearInterval(game.hintTimerId);
    game.timerId = null;
    game.hintTimerId = null;
  }

  function startHintCountdown() {
    clearInterval(game.hintTimerId);
    elements.hintButton.disabled = true;
    elements.hintLabel.textContent = game.hintSecondsRemaining + "s";

    game.hintTimerId = setInterval(() => {
      game.hintSecondsRemaining -= 1;

      if (game.hintSecondsRemaining <= 0) {
        clearInterval(game.hintTimerId);
        game.hintTimerId = null;
        elements.hintButton.disabled = false;
        elements.hintLabel.textContent = "INDICE";
        return;
      }

      elements.hintLabel.textContent = game.hintSecondsRemaining + "s";
    }, 1000);
  }

  function startGameTimers() {
    stopGameTimers();

    game.timerId = setInterval(() => {
      game.secondsElapsed += 1;
      updateInterface();
    }, 1000);

    if (game.hintSecondsRemaining > 0) {
      startHintCountdown();
    }
  }

  function showHint() {
    if (elements.hintButton.disabled || !game.isPlaying || game.isPaused)
      return;

    const remainingTargets = game.targets.filter(
      (target) => !game.foundTargetIds.has(target.id),
    );
    if (!remainingTargets.length) return;

    const target = randomItem(remainingTargets);
    const pulse = document.createElement("span");
    const size = target.size * 2.2;

    pulse.className = "hint-pulse";
    setStyles(pulse, {
      left: target.x + target.size / 2 - size / 2 + "px",
      top: target.y + target.size / 2 - size / 2 + "px",
      width: size + "px",
      height: size + "px",
    });

    elements.hitboxLayer.appendChild(pulse);
    window.setTimeout(() => pulse.remove(), 4100);

    game.hintSecondsRemaining = game.difficulty.hintDelay;
    startHintCountdown();
  }

  // ---------------------------------------------------------------------------
  // Particules et découverte d'une cible
  // ---------------------------------------------------------------------------

  function createExplosion(centerX, centerY) {
    for (let index = 0; index < 28; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(2, 7);

      game.particles.push({
        x: centerX,
        y: centerY,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        radius: randomBetween(2, 5),
        opacity: 1,
        lifetime: randomBetween(18, 35),
        color: Math.random() > 0.5 ? "#6fffe9" : "#a78bfa",
      });
    }
  }

  function animateParticles() {
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

    game.particles = game.particles.filter((particle) => {
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.opacity -= 1 / particle.lifetime;
      if (particle.opacity <= 0) return false;

      context.save();
      context.globalAlpha = particle.opacity;
      context.fillStyle = particle.color;
      context.shadowBlur = 10;
      context.shadowColor = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return true;
    });

    requestAnimationFrame(animateParticles);
  }

  function addFoundMarker(target) {
    const marker = document.createElement("span");
    const size = target.size * 1.25;

    marker.className = "found-marker";
    setStyles(marker, {
      left: target.x + target.size / 2 - size / 2 + "px",
      top: target.y + target.size / 2 - size / 2 + "px",
      width: size + "px",
      height: size + "px",
    });

    elements.hitboxLayer.appendChild(marker);
  }

  function findTarget(target) {
    if (!game.isPlaying || game.isPaused || game.foundTargetIds.has(target.id))
      return;

    playSound("found");
    vibrate([20, 35, 20]);
    game.foundTargetIds.add(target.id);

    addFoundMarker(target);
    createExplosion(target.x + target.size / 2, target.y + target.size / 2);
    getElement("card-" + target.id)?.remove();
    elements.hitboxLayer.querySelector(".hint-pulse")?.remove();

    updateInterface();

    if (game.foundTargetIds.size === game.targets.length) {
      completeGame();
    }
  }

  // ---------------------------------------------------------------------------
  // Transitions de jeu : lancement, pause, victoire, menu
  // ---------------------------------------------------------------------------

  function startGame() {
    window.ArcadeGameSession?.start({ difficulty: game.selectedDifficulty });
    game.difficulty = DIFFICULTIES[game.selectedDifficulty];
    game.secondsElapsed = 0;
    game.hintSecondsRemaining = game.difficulty.hintDelay;
    game.isPlaying = true;
    game.isPaused = false;

    generateScene();
    elements.canvas.width = WORLD.width;
    elements.canvas.height = WORLD.height;
    resetCamera();
    updateInterface();

    elements.pauseButton.textContent = "Ⅱ";
    document.body.classList.add("is-playing");
    document.body.classList.remove("is-paused");
    elements.menuOverlay.classList.add("hidden");
    elements.pauseOverlay.classList.add("hidden");
    elements.victoryOverlay.classList.add("hidden");
    startGameTimers();
  }

  function pauseGame() {
    if (!game.isPlaying || game.isPaused) return;

    game.isPaused = true;
    stopGameTimers();
    elements.pauseButton.textContent = "▶";
    document.body.classList.add("is-paused");
    elements.pauseOverlay.classList.remove("hidden");
  }

  function resumeGame() {
    if (!game.isPlaying || !game.isPaused) return;

    game.isPaused = false;
    elements.pauseButton.textContent = "Ⅱ";
    document.body.classList.remove("is-paused");
    elements.pauseOverlay.classList.add("hidden");
    startGameTimers();
  }

  function returnToMenu() {
    stopGameTimers();
    game.isPlaying = false;
    game.isPaused = false;
    elements.hintButton.disabled = true;
    elements.hintLabel.textContent = "INDICE";
    document.body.classList.remove("is-playing", "is-paused");
    elements.pauseOverlay.classList.add("hidden");
    elements.victoryOverlay.classList.add("hidden");
    elements.menuOverlay.classList.remove("hidden");
  }

  function completeGame() {
    game.isPlaying = false;
    window.ArcadeGameSession?.win({
      difficulty: game.selectedDifficulty,
      seconds: game.secondsElapsed,
    });
    stopGameTimers();
    playSound("win");
    vibrate([50, 40, 50]);

    const scoreKey = "cyberfind_best_" + game.selectedDifficulty;
    const previousBest = Number(localStorage.getItem(scoreKey));
    const isNewRecord = !previousBest || game.secondsElapsed < previousBest;
    const displayedBest = isNewRecord ? game.secondsElapsed : previousBest;

    if (isNewRecord) {
      localStorage.setItem(scoreKey, String(game.secondsElapsed));
    }

    elements.victoryStats.textContent =
      game.difficulty.label +
      " terminé en " +
      formatTime(game.secondsElapsed) +
      ". Toutes les anomalies ont été stabilisées.";
    elements.bestTime.textContent =
      formatTime(displayedBest) + (isNewRecord ? " · RECORD" : "");
    elements.victoryOverlay.classList.remove("hidden");
  }

  // ---------------------------------------------------------------------------
  // Événements UI
  // ---------------------------------------------------------------------------

  function selectDifficulty(event) {
    const card = event.target.closest("[data-difficulty]");
    if (!card) return;

    game.selectedDifficulty = card.dataset.difficulty;
    document.querySelectorAll(".difficulty-card").forEach((difficultyCard) => {
      difficultyCard.classList.toggle("active", difficultyCard === card);
    });
  }

  function handleMouseWheel(event) {
    event.preventDefault();
    zoomAtPoint(event.deltaY < 0 ? 1.16 : 0.86, event.clientX, event.clientY);
  }

  function beginMouseDrag(event) {
    if (event.button !== 0 || game.isPaused) return;

    camera.isDragging = true;
    camera.dragStartX = event.clientX - camera.x;
    camera.dragStartY = event.clientY - camera.y;
  }

  function moveMouseDrag(event) {
    if (!camera.isDragging) return;

    camera.x = event.clientX - camera.dragStartX;
    camera.y = event.clientY - camera.dragStartY;
    applyCameraTransform();
  }

  function beginTouch(event) {
    if (game.isPaused) return;

    if (event.touches.length === 1) {
      camera.isDragging = true;
      camera.dragStartX = event.touches[0].clientX - camera.x;
      camera.dragStartY = event.touches[0].clientY - camera.y;
      return;
    }

    if (event.touches.length === 2) {
      camera.isDragging = false;
      camera.pinchDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      camera.pinchStartScale = camera.scale;
    }
  }

  function moveTouch(event) {
    if (event.touches.length === 1 && camera.isDragging) {
      camera.x = event.touches[0].clientX - camera.dragStartX;
      camera.y = event.touches[0].clientY - camera.dragStartY;
      applyCameraTransform();
      return;
    }

    if (event.touches.length === 2 && camera.pinchDistance) {
      const currentDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );

      camera.scale = Math.min(
        WORLD.maxScale,
        Math.max(
          WORLD.minScale,
          (camera.pinchStartScale * currentDistance) / camera.pinchDistance,
        ),
      );
      applyCameraTransform();
    }
  }

  function bindObjectListDrag() {
    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    elements.objectListContainer.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;

      isDragging = true;
      startX = event.clientX;
      startScrollLeft = elements.objectListContainer.scrollLeft;
      elements.objectListContainer.classList.add("is-dragging");
      elements.objectListContainer.setPointerCapture(event.pointerId);
    });

    elements.objectListContainer.addEventListener("pointermove", (event) => {
      if (!isDragging) return;

      elements.objectListContainer.scrollLeft =
        startScrollLeft - (event.clientX - startX);
    });

    const endDrag = () => {
      isDragging = false;
      elements.objectListContainer.classList.remove("is-dragging");
    };

    elements.objectListContainer.addEventListener("pointerup", endDrag);
    elements.objectListContainer.addEventListener("pointercancel", endDrag);
    elements.objectListContainer.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      elements.objectListContainer.scrollBy({
        left: event.key === "ArrowLeft" ? -180 : 180,
        behavior: "smooth",
      });
    });
  }

  function bindEvents() {
    getElement("difficulty-grid").addEventListener("click", selectDifficulty);
    getElement("btn-start").addEventListener("click", startGame);
    getElement("btn-restart").addEventListener("click", startGame);
    getElement("btn-resume").addEventListener("click", resumeGame);
    getElement("btn-menu").addEventListener("click", returnToMenu);
    getElement("btn-victory-menu").addEventListener("click", returnToMenu);
    elements.pauseButton.addEventListener("click", () => {
      if (game.isPaused) resumeGame();
      else pauseGame();
    });
    elements.hintButton.addEventListener("click", showHint);

    elements.viewport.addEventListener("wheel", handleMouseWheel, {
      passive: false,
    });
    elements.viewport.addEventListener("mousedown", beginMouseDrag);
    elements.viewport.addEventListener("click", (event) => {
      if (
        !event.target.closest(".hitbox") &&
        game.isPlaying &&
        !game.isPaused
      ) {
        playSound("error");
      }
    });
    window.addEventListener("mousemove", moveMouseDrag);
    window.addEventListener("mouseup", () => {
      camera.isDragging = false;
    });

    elements.viewport.addEventListener("touchstart", beginTouch, {
      passive: true,
    });
    elements.viewport.addEventListener("touchmove", moveTouch, {
      passive: true,
    });
    elements.viewport.addEventListener("touchend", () => {
      camera.isDragging = false;
      camera.pinchDistance = null;
    });

    bindObjectListDrag();

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && game.isPlaying) {
        event.preventDefault();
        if (game.isPaused) resumeGame();
        else pauseGame();
      }
    });
    window.addEventListener("resize", applyCameraTransform);
  }

  // La boucle de particules est indépendante du fait qu'une partie soit active.
  elements.canvas.width = WORLD.width;
  elements.canvas.height = WORLD.height;
  bindEvents();
  animateParticles();
});
