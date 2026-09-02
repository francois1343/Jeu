/**
 * CYBER-BUBBLE SHOOTER 1984 - Core Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- PALETTE DE COULEURS NÉON SYNTHWAVE ---
  const COLORS = [
    { name: 'pink', hex: '#ff007f', glow: 'rgba(255, 0, 127, 0.8)' },
    { name: 'cyan', hex: '#00f3ff', glow: 'rgba(0, 243, 255, 0.8)' },
    { name: 'purple', hex: '#9d00ff', glow: 'rgba(157, 0, 255, 0.8)' },
    { name: 'yellow', hex: '#ffe600', glow: 'rgba(255, 230, 0, 0.8)' },
    { name: 'green', hex: '#00ff66', glow: 'rgba(0, 255, 102, 0.8)' }
  ];

  const POWERUPS = ['bomb', 'laser', 'rainbow'];

  // --- CONFIGURATION GRILLE & JEU ---
  const COLS = 8;
  const ROWS = 12;
  const MAX_FAULTS = 5;
  const SAVE_KEY = 'cyber_bubble_shooter_save_v1';
  const LEADERBOARD_KEY = 'cyber_bubble_shooter_leaderboard_v1';
  const LEADERBOARD_LIMIT = 8;
  const SETTINGS_KEY = 'cyber_bubble_shooter_settings_v1';

  // Éléments du DOM
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreDisplay = document.getElementById('score-display');
  const highscoreDisplay = document.getElementById('highscore-display');
  const levelDisplay = document.getElementById('level-display');
  const faultsContainer = document.getElementById('faults-container');
  const startOverlay = document.getElementById('start-overlay');
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const endTitle = document.getElementById('end-title');
  const finalScoreDisplay = document.getElementById('final-score');
  const newRecordTag = document.getElementById('new-record-tag');
  const currentPreviewEl = document.getElementById('current-bubble-preview');
  const nextPreviewEl = document.getElementById('next-bubble-preview');
  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');
  const btnSwap = document.getElementById('btn-swap');
  const btnAudio = document.getElementById('btn-audio');
  const btnHome = document.getElementById('btn-home');
  const quitOverlay = document.getElementById('quit-overlay');
  const btnResume = document.getElementById('btn-resume');
  const btnConfirmQuit = document.getElementById('btn-confirm-quit');
  const swapContainer = document.getElementById('swap-container');
  const btnMenu = document.getElementById('btn-menu');
  const btnSaveGame = document.getElementById('btn-save-game');
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  const utilityMenu = document.getElementById('utility-menu');
  const utilityStatus = document.getElementById('utility-status');
  const btnMenuPause = document.getElementById('btn-menu-pause');
  const btnMenuSave = document.getElementById('btn-menu-save');
  const btnMenuScores = document.getElementById('btn-menu-scores');
  const btnMenuSettings = document.getElementById('btn-menu-settings');
  const btnContinue = document.getElementById('btn-continue');
  const btnSavePause = document.getElementById('btn-save-pause');
  const leaderboardOverlay = document.getElementById('leaderboard-overlay');
  const leaderboardList = document.getElementById('leaderboard-list');
  const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
  const btnStartLeaderboard = document.getElementById('btn-start-leaderboard');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const settingsOverlay = document.getElementById('settings-overlay');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const toggleSfx = document.getElementById('toggle-sfx');
  const toggleMusic = document.getElementById('toggle-music');
  const toggleVibration = document.getElementById('toggle-vibration');
  const themeCyber = document.getElementById('theme-cyber');
  const themeSunset = document.getElementById('theme-sunset');
  const themeVoid = document.getElementById('theme-void');
  const menuBestScore = document.getElementById('menu-best-score');

  // --- ÉTAT DU JEU ---
  let gameState = 'MENU'; // 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
  let score = 0;
  let highScore = loadHighScore();
  let level = 1;
  let faults = 0;
  let ceilingOffsetRows = 0;
  let preferences = loadPreferences();
  let soundEnabled = preferences.sfx;
  let musicEnabled = preferences.music;
  let vibrationEnabled = preferences.vibration;
  let isNewHighScore = false;

  // Dimensions dynamiques du Canvas
  let bubbleRadius = 0;
  let rowHeight = 0;
  let playfieldLeft = 0;
  let playfieldRight = 0;
  let cannonPos = { x: 0, y: 0 };
  let aimAngle = -Math.PI / 2;
  let pointerPos = { x: 0, y: 0 };

  // Grille & Entités
  let grid = createEmptyGrid(); // Array 2D [ROWS][COLS]
  let currentBubble = null;
  let nextBubble = null;
  let projectile = null; // Bulle en vol
  let fallingBubbles = []; // Bulles orphelines en chute
  let particles = [];
  let floatingTexts = [];
  let screenShake = { intensity: 0, duration: 0 };

  function createEmptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function loadHighScore() {
    try {
      return parseInt(localStorage.getItem('cyber_shooter_highscore'), 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      localStorage.setItem('cyber_shooter_highscore', String(highScore));
      if (menuBestScore) menuBestScore.textContent = highScore.toLocaleString('fr-FR');
    } catch (error) {
      // Le jeu reste jouable si le stockage est bloqué.
    }
  }


  function loadPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {};
      return {
        sfx: stored.sfx !== false,
        music: stored.music !== false,
        vibration: stored.vibration !== false,
        theme: ['cyber', 'sunset', 'void'].includes(stored.theme) ? stored.theme : 'cyber'
      };
    } catch (_) { return { sfx: true, music: true, vibration: true, theme: 'cyber' }; }
  }

  function savePreferences() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences)); } catch (_) {}
  }

  function setToggle(button, active) {
    if (!button) return;
    button.setAttribute('aria-pressed', String(active));
    const label = button.querySelector?.('b');
    if (label) label.textContent = active ? 'ON' : 'OFF';
    else button.textContent = active ? 'ON' : 'OFF';
  }

  function applyPreferences() {
    document.documentElement?.setAttribute?.('data-bubble-theme', preferences.theme);
    setToggle(toggleSfx, preferences.sfx);
    setToggle(toggleMusic, preferences.music);
    setToggle(toggleVibration, preferences.vibration);
    [themeCyber, themeSunset, themeVoid].forEach(button => button?.classList.toggle('is-active', button.id === `theme-${preferences.theme}`));
    btnAudio.textContent = preferences.sfx ? 'SFX' : 'OFF';
    btnAudio.setAttribute('aria-label', preferences.sfx ? 'Couper les effets sonores' : 'Activer les effets sonores');
    if (menuBestScore) menuBestScore.textContent = highScore.toLocaleString('fr-FR');
  }
  function setUtilityStatus(message) {
    if (!utilityStatus) return;
    utilityStatus.textContent = message;
    clearTimeout(setUtilityStatus.timeout);
    setUtilityStatus.timeout = setTimeout(() => { utilityStatus.textContent = ''; }, 2600);
  }

  function serializeBubble(bubble) {
    if (!bubble) return null;
    return { type: bubble.type, color: bubble.color?.name || null };
  }

  function hydrateBubble(data) {
    if (!data || typeof data.type !== 'string') return null;
    if (data.type === 'normal') {
      const color = COLORS.find(item => item.name === data.color);
      return color ? { type: 'normal', color } : null;
    }
    return POWERUPS.includes(data.type) || data.type === 'rainbow' ? { type: data.type, color: null } : null;
  }

  function readSavedGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!saved || saved.version !== 1 || !Array.isArray(saved.grid) || saved.grid.length !== ROWS) return null;
      return saved;
    } catch (_) { return null; }
  }

  function clearSavedGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
    updateContinueButton();
  }

  function updateContinueButton() {
    if (btnContinue) btnContinue.classList.toggle('hidden', !readSavedGame());
  }

  function saveCurrentGame() {
    if (!['PLAYING', 'PAUSED'].includes(gameState)) return setUtilityStatus('Lancez une partie avant de sauvegarder.');
    if (projectile) return setUtilityStatus('Attendez la fin du tir pour sauvegarder.');
    const payload = {
      version: 1, savedAt: Date.now(), score, level, faults, ceilingOffsetRows, aimAngle,
      grid: grid.map(row => row.map(serializeBubble)),
      currentBubble: serializeBubble(currentBubble), nextBubble: serializeBubble(nextBubble)
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      updateContinueButton();
      setUtilityStatus('Partie sauvegardee sur cet appareil.');
    } catch (_) { setUtilityStatus('Sauvegarde indisponible sur cet appareil.'); }
  }

  function restoreSavedGame() {
    const saved = readSavedGame();
    if (!saved) return setUtilityStatus('Aucune sauvegarde disponible.');
    const restoredGrid = saved.grid.map(row => Array.isArray(row) && row.length === COLS ? row.map(hydrateBubble) : null);
    if (restoredGrid.some(row => !row)) return setUtilityStatus('Sauvegarde invalide.');
    const session = window.ArcadeGameSession;
    if (session?.state === 'created') session.start({ source: 'saved_game' });
    grid = restoredGrid;
    score = Math.max(0, Number(saved.score) || 0);
    level = Math.max(1, Number(saved.level) || 1);
    faults = Math.max(0, Math.min(MAX_FAULTS - 1, Number(saved.faults) || 0));
    ceilingOffsetRows = Math.max(0, Number(saved.ceilingOffsetRows) || 0);
    aimAngle = Number.isFinite(Number(saved.aimAngle)) ? Number(saved.aimAngle) : -Math.PI / 2;
    currentBubble = hydrateBubble(saved.currentBubble) || createRandomBubble();
    nextBubble = hydrateBubble(saved.nextBubble) || createRandomBubble();
    projectile = null; fallingBubbles = []; particles = []; floatingTexts = []; screenShake = { intensity: 0, duration: 0 };
    scoreDisplay.textContent = score; levelDisplay.textContent = level; updateFaultsUI(); updatePreviewSlots();
    gameState = 'PLAYING';
    startOverlay.classList.add('hidden'); gameOverOverlay.classList.add('hidden'); quitOverlay.classList.add('hidden');
    btnHome.classList.remove('hidden'); canvas.focus(); setUtilityStatus('Sauvegarde reprise.');
  }

  function getLeaderboard() {
    try {
      const entries = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
      return Array.isArray(entries) ? entries.filter(item => Number.isFinite(Number(item.score))).slice(0, LEADERBOARD_LIMIT) : [];
    } catch (_) { return []; }
  }

  function renderLeaderboard() {
    if (!leaderboardList) return;
    const entries = getLeaderboard();
    leaderboardList.innerHTML = entries.length
      ? entries.map((item, index) => `<li><b>#${index + 1}</b><span>${String(item.name || 'PILOTE').slice(0, 16)}</span><strong>${Number(item.score).toLocaleString('fr-FR')}</strong><small>NIV. ${Number(item.level) || 1}</small></li>`).join('')
      : '<li class="leaderboard-empty">Aucun score enregistre. Lancez le premier run.</li>';
  }

  function recordLeaderboard() {
    if (score <= 0) return;
    const pseudo = window.ArcadeLocalStore?.getActiveProfile?.()?.pseudo || 'PILOTE';
    const entries = [...getLeaderboard(), { name: pseudo, score, level, at: Date.now() }]
      .sort((left, right) => Number(right.score) - Number(left.score) || Number(right.level) - Number(left.level))
      .slice(0, LEADERBOARD_LIMIT);
    try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries)); } catch (_) {}
  }

  let leaderboardPausedGame = false;
  function openLeaderboard() {
    leaderboardPausedGame = gameState === 'PLAYING';
    if (leaderboardPausedGame) gameState = 'PAUSED';
    renderLeaderboard(); leaderboardOverlay.classList.remove('hidden'); utilityMenu.classList.add('hidden');
  }

  function closeLeaderboard() {
    leaderboardOverlay.classList.add('hidden');
    if (leaderboardPausedGame && gameState === 'PAUSED') { gameState = 'PLAYING'; canvas.focus(); syncMusic(); }
    leaderboardPausedGame = false;
  }

  let settingsPausedGame = false;
  function openSettings() {
    settingsPausedGame = gameState === 'PLAYING';
    if (settingsPausedGame) { gameState = 'PAUSED'; syncMusic(); }
    utilityMenu.classList.add('hidden');
    settingsOverlay.classList.remove('hidden');
  }

  function closeSettings() {
    settingsOverlay.classList.add('hidden');
    if (settingsPausedGame && gameState === 'PAUSED') { gameState = 'PLAYING'; canvas.focus(); syncMusic(); }
    settingsPausedGame = false;
  }

  function chooseTheme(theme) {
    preferences.theme = theme; savePreferences(); applyPreferences();
  }
  // --- ENGINE AUDIO (Web Audio API) ---
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!AudioContextClass) return;
    try {
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (error) {
      audioCtx = null;
    }
  }


  let musicTimer = null;
  let musicStep = 0;
  function playMusicPulse() {
    if (!musicEnabled || !audioCtx) return;
    const notes = [220, 277.18, 329.63, 277.18, 246.94, 329.63, 415.3, 329.63];
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notes[musicStep % notes.length], now);
    gain.gain.setValueAtTime(.025, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .38);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + .4);
    musicStep += 1;
  }

  function syncMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (!musicEnabled || gameState !== 'PLAYING') return;
    initAudio();
    if (!audioCtx) return;
    playMusicPulse();
    musicTimer = setInterval(playMusicPulse, 520);
  }
  function playSynthSound(type) {
    if (!soundEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;

    if (type === 'shoot') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'pop') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400 + Math.random() * 300, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'drop') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'bomb') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.35);
    }
  }

  function triggerHaptic(duration = 20) {
    if (vibrationEnabled && navigator.vibrate) navigator.vibrate(duration);
  }

  // --- RESIZING & INITIALISATION ---
  function resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;

    const radiusFromWidth = canvas.width / (COLS * 2 + 1);
    const radiusFromHeight = canvas.height / (ROWS * Math.sqrt(3) + 4);
    bubbleRadius = Math.min(radiusFromWidth, radiusFromHeight, 34);
    rowHeight = bubbleRadius * Math.sqrt(3);

    const playfieldWidth = bubbleRadius * (COLS * 2 + 1);
    playfieldLeft = Math.max(0, (canvas.width - playfieldWidth) / 2);
    playfieldRight = canvas.width - playfieldLeft;

    cannonPos.x = canvas.width / 2;
    cannonPos.y = canvas.height - bubbleRadius - 10;

    if (gameState === 'PLAYING') checkGameOverCondition();
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  highscoreDisplay.textContent = highScore;
  updateContinueButton();

  // --- RECHERCHE ET CONVERSION COORDONNÉES GRILLE HEXAGONALE ---
  function getGridCellCenter(row, col) {
    const actualRow = row + ceilingOffsetRows;
    const isOddRow = actualRow % 2 === 1;
    const offsetX = isOddRow ? bubbleRadius : 0;
    const x = playfieldLeft + col * (bubbleRadius * 2) + bubbleRadius + offsetX;
    const y = actualRow * rowHeight + bubbleRadius;
    return { x, y };
  }

  function getNearestGridCell(x, y) {
    let minDistance = Infinity;
    let closestCell = { row: 0, col: 0 };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const center = getGridCellCenter(r, c);
        const dist = Math.hypot(center.x - x, center.y - y);
        if (dist < minDistance) {
          minDistance = dist;
          closestCell = { row: r, col: c };
        }
      }
    }
    return closestCell;
  }

  function getNeighbors(row, col) {
    const neighbors = [];
    const actualRow = row + ceilingOffsetRows;
    const isOddRow = actualRow % 2 === 1;

    const offsets = isOddRow ? [
      { r: 0, c: -1 }, { r: 0, c: 1 },
      { r: -1, c: 0 }, { r: -1, c: 1 },
      { r: 1, c: 0 }, { r: 1, c: 1 }
    ] : [
      { r: 0, c: -1 }, { r: 0, c: 1 },
      { r: -1, c: -1 }, { r: -1, c: 0 },
      { r: 1, c: -1 }, { r: 1, c: 0 }
    ];

    offsets.forEach(off => {
      const nr = row + off.r;
      const nc = col + off.c;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        neighbors.push({ row: nr, col: nc });
      }
    });

    return neighbors;
  }

  // --- DÉBUT DE PARTIE ET CRÉATION DES BULLES ---
  function getColorsOnBoard() {
    const colorNames = new Set();
    grid.forEach(row => row.forEach(bubble => {
      if (bubble?.type === 'normal') colorNames.add(bubble.color.name);
    }));
    return COLORS.filter(color => colorNames.has(color.name));
  }

  function createRandomBubble(allowPowerup = true) {
    // 8% de chance de spawn un Power-up
    const isPowerup = allowPowerup && Math.random() < 0.08;
    if (isPowerup) {
      const pType = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      return { type: pType, color: null };
    }
    const boardColors = getColorsOnBoard();
    const palette = allowPowerup && boardColors.length > 0 ? boardColors : COLORS;
    const colorObj = palette[Math.floor(Math.random() * palette.length)];
    return { type: 'normal', color: colorObj };
  }

  function refreshShooterColors() {
    const boardColors = getColorsOnBoard();
    if (boardColors.length === 0) return;

    const availableColorNames = new Set(boardColors.map(color => color.name));
    let changed = false;

    [currentBubble, nextBubble] = [currentBubble, nextBubble].map(bubble => {
      if (bubble?.type !== 'normal' || availableColorNames.has(bubble.color.name)) {
        return bubble;
      }

      changed = true;
      const color = boardColors[Math.floor(Math.random() * boardColors.length)];
      return { type: 'normal', color };
    });

    if (changed) updatePreviewSlots();
  }

  function updatePreviewSlots() {
    renderPreviewSlot(currentPreviewEl, currentBubble);
    renderPreviewSlot(nextPreviewEl, nextBubble);
  }

  function renderPreviewSlot(el, bubble) {
    el.innerHTML = '';
    if (!bubble) return;
    const d = document.createElement('div');
    d.style.width = '24px';
    d.style.height = '24px';
    d.style.borderRadius = '50%';

    if (bubble.type === 'normal') {
      d.style.backgroundColor = bubble.color.hex;
      d.style.boxShadow = `0 0 8px ${bubble.color.hex}`;
    } else {
      d.style.backgroundColor = '#fff';
      d.textContent = bubble.type === 'bomb' ? '💣' : (bubble.type === 'laser' ? '⚡' : '🌈');
      d.style.fontSize = '12px';
      d.style.display = 'flex';
      d.style.justifyContent = 'center';
      d.style.alignItems = 'center';
    }
    el.appendChild(d);
  }

  function startLevel() {
    faults = 0;
    ceilingOffsetRows = 0;
    projectile = null;
    fallingBubbles = [];
    particles = [];
    floatingTexts = [];
    screenShake = { intensity: 0, duration: 0 };
    levelDisplay.textContent = level;
    updateFaultsUI();

    // Chaque niveau ajoute progressivement des lignes.
    grid = createEmptyGrid();
    const startingRows = Math.min(3 + level, 7);
    for (let r = 0; r < startingRows; r++) {
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = createRandomBubble(false);
      }
    }

    currentBubble = createRandomBubble();
    nextBubble = createRandomBubble();
    updatePreviewSlots();
  }

  function initGame() {
    clearSavedGame();
    score = 0;
    level = 1;
    isNewHighScore = false;
    scoreDisplay.textContent = '0';
    startLevel();

    gameState = 'PLAYING';
    startOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    quitOverlay.classList.add('hidden');
    btnHome.classList.remove('hidden');
    canvas.focus();
  }

  function pauseGame() {
    if (gameState !== 'PLAYING') return;
    gameState = 'PAUSED';
    quitOverlay.classList.remove('hidden');
    btnResume.focus();
  }

  function resumeGame() {
    if (gameState !== 'PAUSED') return;
    gameState = 'PLAYING';
    quitOverlay.classList.add('hidden');
    canvas.focus();
  }

  function returnToMenu() {
    if (gameState !== 'PAUSED') return;
    const arcadeSession = window.ArcadeGameSession;
    if (arcadeSession?.state === 'started') arcadeSession.abandon('returned_to_menu');

    gameState = 'MENU';
    syncMusic();
    grid = createEmptyGrid();
    currentBubble = null;
    nextBubble = null;
    projectile = null;
    fallingBubbles = [];
    particles = [];
    floatingTexts = [];
    screenShake = { intensity: 0, duration: 0 };
    score = 0;
    level = 1;
    faults = 0;

    scoreDisplay.textContent = '0';
    levelDisplay.textContent = '1';
    updateFaultsUI();
    updatePreviewSlots();
    quitOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
    btnHome.classList.add('hidden');
    btnStart.focus();
  }

  // --- LOGIQUE DES TIR & TRAJECTOIRE ---
  function swapBubbles() {
    if (projectile || gameState !== 'PLAYING') return;
    [currentBubble, nextBubble] = [nextBubble, currentBubble];
    updatePreviewSlots();
    playSynthSound('pop');
  }

  function getLoadedBubblePosition() {
    const barrelLength = Math.max(34, bubbleRadius * 1.15);
    return {
      x: cannonPos.x + Math.cos(aimAngle) * barrelLength,
      y: cannonPos.y + Math.sin(aimAngle) * barrelLength
    };
  }

  function shoot() {
    if (projectile || gameState !== 'PLAYING') return;
    initAudio();

    const speed = 16;
    const loadedPosition = getLoadedBubblePosition();
    projectile = {
      x: loadedPosition.x,
      y: loadedPosition.y,
      vx: Math.cos(aimAngle) * speed,
      vy: Math.sin(aimAngle) * speed,
      bubble: currentBubble
    };

    currentBubble = nextBubble;
    nextBubble = createRandomBubble();
    updatePreviewSlots();

    playSynthSound('shoot');
    triggerHaptic(15);
  }

  // --- ALGORITHMES FLOOD-FILL & ORPHELINS ---
  function findMatchGroup(startRow, startCol, targetColor) {
    const matches = [];
    const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
    const queue = [{ row: startRow, col: startCol }];
    visited[startRow][startCol] = true;

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      matches.push({ row, col });

      getNeighbors(row, col).forEach(n => {
        if (!visited[n.row][n.col] && grid[n.row][n.col]) {
          const neighborBubble = grid[n.row][n.col];
          if (neighborBubble.type === 'rainbow' || neighborBubble.color?.name === targetColor.name) {
            visited[n.row][n.col] = true;
            queue.push(n);
          }
        }
      });
    }
    return matches;
  }

  function dropOrphanBubbles() {
    const connected = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
    const queue = [];

    // Les bulles ancrées à la première ligne
    for (let c = 0; c < COLS; c++) {
      if (grid[0][c]) {
        connected[0][c] = true;
        queue.push({ row: 0, col: c });
      }
    }

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      getNeighbors(row, col).forEach(n => {
        if (!connected[n.row][n.col] && grid[n.row][n.col]) {
          connected[n.row][n.col] = true;
          queue.push(n);
        }
      });
    }

    // Trouver toutes les bulles non connectées
    let dropCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] && !connected[r][c]) {
          const center = getGridCellCenter(r, c);
          fallingBubbles.push({
            x: center.x,
            y: center.y,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * -3 - 1,
            bubble: grid[r][c]
          });
          grid[r][c] = null;
          dropCount++;
        }
      }
    }

    if (dropCount > 0) {
      addScore(dropCount * 100 * 2, cannonPos.x, cannonPos.y - 100);
      playSynthSound('drop');
      triggerHaptic(40);
    }
  }

  function getSnapCell(x, y, collisionCell = null) {
    let candidates;
    if (collisionCell) {
      candidates = getNeighbors(collisionCell.row, collisionCell.col)
        .filter(cell => !grid[cell.row][cell.col]);
    } else {
      candidates = Array.from({ length: COLS }, (_, col) => ({ row: 0, col }))
        .filter(cell => !grid[cell.row][cell.col]);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const centerA = getGridCellCenter(a.row, a.col);
      const centerB = getGridCellCenter(b.row, b.col);
      return Math.hypot(centerA.x - x, centerA.y - y) -
        Math.hypot(centerB.x - x, centerB.y - y);
    });
    return candidates[0];
  }

  function snapProjectileToGrid(r, c, bubble) {
    if (!grid[r] || grid[r][c]) {
      projectile = null;
      triggerGameOver(false);
      return;
    }

    grid[r][c] = bubble;
    let popped = false;

    // Traitement des Power-Ups
    if (bubble.type === 'bomb') {
      const destroyed = triggerExplosion(r, c, 2);
      addScore(destroyed * 75, getGridCellCenter(r, c).x, getGridCellCenter(r, c).y);
      playSynthSound('bomb');
      addScreenShake(12, 15);
      popped = true;
    } else if (bubble.type === 'laser') {
      const destroyed = triggerLaserLine(r);
      addScore(destroyed * 75, getGridCellCenter(r, c).x, getGridCellCenter(r, c).y);
      playSynthSound('bomb');
      addScreenShake(8, 10);
      popped = true;
    } else {
      // Regroupement standard (Flood-Fill)
      const targetColor = bubble.type === 'rainbow' ?
        (getNeighbors(r, c).find(n => grid[n.row][n.col]?.color)?.color || COLORS[0]) : bubble.color;

      const matches = findMatchGroup(r, c, targetColor);
      if (matches.length >= 3) {
        matches.forEach(m => {
          const center = getGridCellCenter(m.row, m.col);
          spawnParticles(center.x, center.y, grid[m.row][m.col].color?.hex || '#ffffff');
          grid[m.row][m.col] = null;
        });
        addScore(matches.length * 50, getGridCellCenter(r, c).x, getGridCellCenter(r, c).y);
        playSynthSound('pop');
        popped = true;
      }
    }

    if (popped) {
      dropOrphanBubbles();
    } else {
      registerFault();
    }

    projectile = null;
    // La bulle courante et la suivante ont ete choisies avant l'impact.
    // Remplacer leurs couleurs si l'impact vient d'eliminer cette couleur.
    refreshShooterColors();
    checkGameOverCondition();
  }

  function triggerExplosion(centerR, centerC, radius) {
    let destroyed = 0;
    for (let r = Math.max(0, centerR - radius); r <= Math.min(ROWS - 1, centerR + radius); r++) {
      for (let c = Math.max(0, centerC - radius); c <= Math.min(COLS - 1, centerC + radius); c++) {
        if (grid[r][c]) {
          const center = getGridCellCenter(r, c);
          spawnParticles(center.x, center.y, '#ffe600');
          grid[r][c] = null;
          destroyed++;
        }
      }
    }
    return destroyed;
  }

  function triggerLaserLine(row) {
    let destroyed = 0;
    for (let c = 0; c < COLS; c++) {
      if (grid[row][c]) {
        const center = getGridCellCenter(row, c);
        spawnParticles(center.x, center.y, '#00f3ff');
        grid[row][c] = null;
        destroyed++;
      }
    }
    return destroyed;
  }

  function registerFault() {
    faults++;
    if (faults >= MAX_FAULTS) {
      faults = 0;
      ceilingOffsetRows++;
      floatingTexts.push({
        x: canvas.width / 2,
        y: canvas.height * 0.55,
        text: 'PLAFOND ABAISSÉ !',
        color: '#ff007f',
        alpha: 1,
        vy: -0.5
      });
      addScreenShake(6, 10);
    }
    updateFaultsUI();
  }

  function updateFaultsUI() {
    const dots = faultsContainer.querySelectorAll('.dot');
    dots.forEach((dot, idx) => {
      if (idx < faults) dot.classList.add('active');
      else dot.classList.remove('active');
    });
  }

  function addScore(pts, x, y) {
    score += pts;
    scoreDisplay.textContent = score;
    if (score > highScore) {
      highScore = score;
      isNewHighScore = true;
      highscoreDisplay.textContent = highScore;
  updateContinueButton();
      saveHighScore();
    }

    floatingTexts.push({
      x, y,
      text: `+${pts}`,
      color: '#ffe600',
      alpha: 1.0,
      vy: -1.5
    });
  }

  function addScreenShake(intensity, duration) {
    screenShake.intensity = intensity;
    screenShake.duration = duration;
  }

  function checkGameOverCondition() {
    const dangerY = cannonPos.y - bubbleRadius * 1.25;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        const center = getGridCellCenter(r, c);
        if (r === ROWS - 1 || center.y + bubbleRadius >= dangerY) {
          triggerGameOver(false);
          return;
        }
      }
    }

    // Vérifier si la grille est vide (Victoire)
    const isEmpty = grid.every(row => row.every(cell => cell === null));
    if (isEmpty) {
      const completedLevel = level;
      addScore(completedLevel * 500, cannonPos.x, cannonPos.y - 100);
      level++;
      startLevel();
      floatingTexts.push({
        x: canvas.width / 2,
        y: canvas.height * 0.5,
        text: `NIVEAU ${level}`,
        color: '#00f3ff',
        alpha: 1,
        vy: -0.35
      });
    }
  }

  function settleArcadeResult(isWin) {
    const arcadeSession = window.ArcadeGameSession;
    if (!arcadeSession || arcadeSession.state !== 'started') return;
    const metadata = { score, level };
    if (isWin) arcadeSession.win(metadata);
    else arcadeSession.completeByScore(score, metadata);
  }
  function triggerGameOver(isWin) {
    gameState = 'GAMEOVER';
    syncMusic();
    settleArcadeResult(isWin);
    btnHome.classList.add('hidden');
    endTitle.textContent = isWin ? "VICTOIRE !" : "GAME OVER";
    finalScoreDisplay.textContent = score;
    recordLeaderboard();
    clearSavedGame();

    if (isNewHighScore) {
      newRecordTag.classList.remove('hidden');
    } else {
      newRecordTag.classList.add('hidden');
    }

    gameOverOverlay.classList.remove('hidden');
  }

  // --- RENDER & UPDATE LOOPS ---
  function updatePhysics() {
    // Mis à jour du Projectile
    if (projectile) {
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;

      // Rebond sur les parois latérales
      if (projectile.x - bubbleRadius <= playfieldLeft) {
        projectile.x = playfieldLeft + bubbleRadius;
        projectile.vx *= -1;
        playSynthSound('pop');
      } else if (projectile.x + bubbleRadius >= playfieldRight) {
        projectile.x = playfieldRight - bubbleRadius;
        projectile.vx *= -1;
        playSynthSound('pop');
      }

      // Collisions avec les bulles existantes
      let collisionCell = null;
      let collisionDistance = Infinity;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c]) {
            const center = getGridCellCenter(r, c);
            const dist = Math.hypot(center.x - projectile.x, center.y - projectile.y);
            if (dist < bubbleRadius * 1.8 && dist < collisionDistance) {
              collisionDistance = dist;
              collisionCell = { row: r, col: c };
            }
          }
        }
      }

      if (collisionCell) {
        const cell = getSnapCell(projectile.x, projectile.y, collisionCell);
        if (!cell) {
          projectile = null;
          triggerGameOver(false);
          return;
        }
        snapProjectileToGrid(cell.row, cell.col, projectile.bubble);
        return;
      }

      // Impact au plafond
      const topY = ceilingOffsetRows * rowHeight + bubbleRadius;
      if (projectile.y - bubbleRadius <= topY) {
        const cell = getSnapCell(projectile.x, projectile.y);
        if (!cell) {
          projectile = null;
          triggerGameOver(false);
          return;
        }
        snapProjectileToGrid(cell.row, cell.col, projectile.bubble);
        return;
      }
    }

    // Bulles orphelines tombantes
    for (let idx = fallingBubbles.length - 1; idx >= 0; idx--) {
      const b = fallingBubbles[idx];
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.35; // Gravité

      if (b.y > canvas.height + 50) {
        fallingBubbles.splice(idx, 1);
      }
    }

    // Particules
    for (let idx = particles.length - 1; idx >= 0; idx--) {
      const p = particles[idx];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.02;
      if (p.alpha <= 0) particles.splice(idx, 1);
    }

    // Popups de score
    for (let idx = floatingTexts.length - 1; idx >= 0; idx--) {
      const ft = floatingTexts[idx];
      ft.y += ft.vy;
      ft.alpha -= 0.015;
      if (ft.alpha <= 0) floatingTexts.splice(idx, 1);
    }

    // Shake Effect
    if (screenShake.duration > 0) {
      screenShake.duration--;
    }
  }

  function spawnParticles(x, y, colorHex) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colorHex,
        radius: Math.random() * 3 + 2,
        alpha: 1.0
      });
    }
  }

  // --- DESSIN CANVAS ---
  function drawLaserSight() {
    if (projectile || !['PLAYING', 'PAUSED'].includes(gameState)) return;

    ctx.save();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 8;

    let dirX = Math.cos(aimAngle);
    let dirY = Math.sin(aimAngle);
    const loadedPosition = getLoadedBubblePosition();
    let currX = loadedPosition.x + dirX * bubbleRadius;
    let currY = loadedPosition.y + dirY * bubbleRadius;

    ctx.beginPath();
    ctx.moveTo(currX, currY);

    for (let step = 0; step < 2; step++) {
      let targetX = currX + dirX * 1000;
      let targetY = currY + dirY * 1000;

      if (dirX < 0 && targetX < playfieldLeft + bubbleRadius) {
        const ratio = (playfieldLeft + bubbleRadius - currX) / dirX;
        currX = playfieldLeft + bubbleRadius;
        currY = currY + dirY * ratio;
        dirX *= -1;
        ctx.lineTo(currX, currY);
      } else if (dirX > 0 && targetX > playfieldRight - bubbleRadius) {
        const ratio = (playfieldRight - bubbleRadius - currX) / dirX;
        currX = playfieldRight - bubbleRadius;
        currY = currY + dirY * ratio;
        dirX *= -1;
        ctx.lineTo(currX, currY);
      } else {
        ctx.lineTo(targetX, targetY);
        break;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCannon() {
    const baseRadius = Math.max(28, bubbleRadius * 1.25);
    const barrelLength = Math.max(34, bubbleRadius * 1.15);
    const barrelHalfWidth = Math.max(9, bubbleRadius * 0.38);

    // Socle blindé, volontairement fixe pendant que le canon pivote.
    ctx.save();
    ctx.translate(cannonPos.x, cannonPos.y + bubbleRadius * 0.28);
    ctx.shadowColor = '#9d00ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#120b27';
    ctx.strokeStyle = '#9d00ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius, Math.PI, 0);
    ctx.lineTo(baseRadius * 0.78, baseRadius * 0.55);
    ctx.lineTo(-baseRadius * 0.78, baseRadius * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.68, Math.PI + 0.18, -0.18);
    ctx.stroke();

    ctx.fillStyle = '#9d00ff';
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(7, bubbleRadius * 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tube orientable : silhouette fuselée, rails cyan et bague de bouche.
    ctx.save();
    ctx.translate(cannonPos.x, cannonPos.y);
    ctx.rotate(aimAngle + Math.PI / 2);
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#2a1254';
    ctx.strokeStyle = '#c45cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-barrelHalfWidth, 5);
    ctx.lineTo(-barrelHalfWidth * 0.72, -barrelLength);
    ctx.lineTo(barrelHalfWidth * 0.72, -barrelLength);
    ctx.lineTo(barrelHalfWidth, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 7;
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-barrelHalfWidth * 0.48, -2);
    ctx.lineTo(-barrelHalfWidth * 0.38, -barrelLength + 3);
    ctx.moveTo(barrelHalfWidth * 0.48, -2);
    ctx.lineTo(barrelHalfWidth * 0.38, -barrelLength + 3);
    ctx.stroke();

    ctx.fillStyle = '#0a0612';
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 2;
    ctx.fillRect(-barrelHalfWidth * 0.9, -barrelLength - 4, barrelHalfWidth * 1.8, 8);
    ctx.strokeRect(-barrelHalfWidth * 0.9, -barrelLength - 4, barrelHalfWidth * 1.8, 8);
    ctx.restore();
  }

  function drawBubble(x, y, bubble, radius = bubbleRadius) {
    if (!bubble) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius - 1, 0, Math.PI * 2);

    if (bubble.type === 'normal') {
      ctx.fillStyle = bubble.color.hex;
      ctx.shadowColor = bubble.color.hex;
      ctx.shadowBlur = 10;
      ctx.fill();

      // Reflet synthwave interne
      ctx.beginPath();
      ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();
    } else {
      // Power-Up Rendus
      ctx.fillStyle = '#1e1b4b';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = `${radius * 0.9}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = bubble.type === 'bomb' ? '💣' : (bubble.type === 'laser' ? '⚡' : '🌈');
      ctx.fillText(icon, x, y);
    }

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (screenShake.duration > 0) {
      const dx = (Math.random() - 0.5) * screenShake.intensity;
      const dy = (Math.random() - 0.5) * screenShake.intensity;
      ctx.translate(dx, dy);
    }

    // 1. Dessin du Plafond / Warning Line
    const ceilingY = ceilingOffsetRows * rowHeight;
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(playfieldLeft, ceilingY);
    ctx.lineTo(playfieldRight, ceilingY);
    ctx.stroke();

    // Ligne de danger : les bulles ne doivent pas atteindre le canon.
    const dangerY = cannonPos.y - bubbleRadius * 1.25;
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.45)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(playfieldLeft, dangerY);
    ctx.lineTo(playfieldRight, dangerY);
    ctx.stroke();
    ctx.restore();

    // 2. Dessin de la Grille
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) {
          const center = getGridCellCenter(r, c);
          drawBubble(center.x, center.y, grid[r][c]);
        }
      }
    }

    // 3. Dessin de la Viseuse Laser
    drawLaserSight();

    // 4. Dessin du lanceur et de la bulle actuellement chargée.
    drawCannon();
    if (!projectile && ['PLAYING', 'PAUSED'].includes(gameState)) {
      const loadedPosition = getLoadedBubblePosition();
      drawBubble(loadedPosition.x, loadedPosition.y, currentBubble, bubbleRadius * 0.96);
    }

    // 5. Projectile en vol
    if (projectile) {
      drawBubble(projectile.x, projectile.y, projectile.bubble);
    }

    // 6. Bulles orphelines
    fallingBubbles.forEach(b => drawBubble(b.x, b.y, b.bubble));

    // 7. Particules
    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 8. Textes Flottants (Score)
    floatingTexts.forEach(ft => {
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = ft.color || '#ffe600';
      ctx.font = 'bold 18px "Courier New"';
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color || '#ffe600';
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  }

  function gameLoop() {
    if (gameState === 'PLAYING') {
      updatePhysics();
    }
    draw();
    requestAnimationFrame(gameLoop);
  }

  // --- INPUTS & ÉVÉNEMENTS ---
  function updateAim(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerPos.x = clientX - rect.left;
    pointerPos.y = clientY - rect.top;

    const dx = pointerPos.x - cannonPos.x;
    const dy = pointerPos.y - cannonPos.y;
    aimAngle = Math.atan2(dy, dx);

    // Limiter l'angle du canon pour éviter qu'il tire vers le bas
    const minAngle = -Math.PI + 0.2;
    const maxAngle = -0.2;
    aimAngle = Math.max(minAngle, Math.min(maxAngle, aimAngle));
  }

  canvas.addEventListener('mousemove', (e) => updateAim(e.clientX, e.clientY));
  canvas.addEventListener('click', shoot);

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      updateAim(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    shoot();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (gameState === 'PLAYING') pauseGame();
      else if (gameState === 'PAUSED') resumeGame();
      return;
    }
    if (gameState !== 'PLAYING') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      aimAngle = Math.max(-Math.PI + 0.2, Math.min(-0.2, aimAngle + direction * 0.08));
    } else if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      shoot();
    } else if (e.key.toLowerCase() === 'x') {
      e.preventDefault();
      swapBubbles();
    }
  });

  swapContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    swapBubbles();
  });

  btnSwap.addEventListener('click', (e) => {
    e.stopPropagation();
    swapBubbles();
  });

  btnAudio.addEventListener('click', () => {
    preferences.sfx = !preferences.sfx;
    soundEnabled = preferences.sfx;
    savePreferences();
    applyPreferences();
  });

  btnHome.addEventListener('click', pauseGame);
  btnResume.addEventListener('click', resumeGame);
  btnConfirmQuit.addEventListener('click', returnToMenu);

  btnStart.addEventListener('click', () => {
    initAudio();
    initGame();
  });

  btnRestart.addEventListener('click', () => {
    initAudio();
    initGame();
  });


  btnMenu.addEventListener('click', () => {
    const isOpen = utilityMenu.classList.toggle('hidden');
    btnMenu.setAttribute('aria-expanded', String(!isOpen));
  });
  btnSaveGame.addEventListener('click', saveCurrentGame);
  btnMenuSave.addEventListener('click', saveCurrentGame);
  btnSavePause.addEventListener('click', saveCurrentGame);
  btnMenuPause.addEventListener('click', () => { utilityMenu.classList.add('hidden'); pauseGame(); });
  btnLeaderboard.addEventListener('click', openLeaderboard);
  btnMenuScores.addEventListener('click', openLeaderboard);
  btnMenuSettings.addEventListener('click', openSettings);
  btnCloseLeaderboard.addEventListener('click', closeLeaderboard);
  btnContinue.addEventListener('click', restoreSavedGame);
  btnStartLeaderboard.addEventListener('click', openLeaderboard);
  btnOpenSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  toggleSfx.addEventListener('click', () => { preferences.sfx = !preferences.sfx; soundEnabled = preferences.sfx; savePreferences(); applyPreferences(); });
  toggleMusic.addEventListener('click', () => { preferences.music = !preferences.music; musicEnabled = preferences.music; savePreferences(); applyPreferences(); syncMusic(); });
  toggleVibration.addEventListener('click', () => { preferences.vibration = !preferences.vibration; vibrationEnabled = preferences.vibration; savePreferences(); applyPreferences(); });
  themeCyber.addEventListener('click', () => chooseTheme('cyber'));
  themeSunset.addEventListener('click', () => chooseTheme('sunset'));
  themeVoid.addEventListener('click', () => chooseTheme('void'));
  applyPreferences();

  // Lancer la boucle principale
  gameLoop();
});
