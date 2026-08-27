/* ============================================================ */
/* SIMON NÉON - game.js                                        */
/* Logique complète : séquence, audio, collision, difficulté   */
/* ============================================================ */

/* ============================================================ */
/* 1. CONFIGURATION GLOBALE */
/* ============================================================ */

const CONFIG = {
  // 2. Couleurs & Fréquences audio
  colors: {
    green: { freq: 392, label: 'green' },   // Sol
    red: { freq: 523, label: 'red' },       // Do
    yellow: { freq: 659, label: 'yellow' }, // Mi
    blue: { freq: 784, label: 'blue' }      // Sol (octave)
  },

  // 3. Timing (en ms)
  noteLength: 400,           // Durée de la note jouée
  pauseBetweenNotes: 200,    // Pause entre 2 notes
  playerTimeout: 3000,       // Temps avant "trop lent"

  // 4. Vitesse (diminue avec la difficulté)
  speedMultiplier: 1.0,      // 1.0 = lent, 0.8 = normal, 0.6 = rapide
  speedIncreasePerRound: 0.02, // Acceleration +2% par round
  minSpeedMultiplier: 0.3,   // Vitesse max

  // 5. Paliers de victoire
  victoryThreshold: 20,      // Toutes les 20 séquences
};

/* ============================================================ */
/* 5. GAME STATE */
/* ============================================================ */

const gameState = {
  // 6. Séquence du jeu
  sequence: [],
  playerSequence: [],

  // 7. Score & progression
  score: 0,
  highScore: 0,
  level: 1,

  // 8. Mode & configuration
  mode: 'normal',        // 'normal' ou 'strict'
  speed: 'normal',       // 'slow', 'normal', 'fast'

  // 9. État du jeu
  isGameRunning: false,
  isComputerPlaying: false,
  isPlayerTurn: false,
  gameOver: false,

  // 10. Haptique & audio
  soundEnabled: true,
  vibrationEnabled: true,

  // 11. Leaderboard
  leaderboard: {
    normal: [],
    strict: []
  }
};

/* ============================================================ */
/* 12. AUDIO CONTEXT */
/* ============================================================ */

let audioContext = null;

// 13. Initialiser le contexte audio (lazy loading)
function initAudioContext() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

/* ============================================================ */
/* 14. WEB AUDIO API - TONALITÉS SYNTHÉ */
/* ============================================================ */

// 15. Jouer une note Simon
function playNote(colorLabel, duration = CONFIG.noteLength) {
  if (!gameState.soundEnabled) return;
  initAudioContext();

  const color = CONFIG.colors[colorLabel];
  if (!color) return;

  const now = audioContext.currentTime;
  const freq = color.freq;

  // 16. Oscillateur carré (son 8-bit rétro)
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, now);

  // 17. Envelope : fade in rapide, sustain, fade out rapide
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);  // Fade in rapide
  gain.gain.setValueAtTime(0.15, now + duration * 0.9);  // Sustain
  gain.gain.linearRampToValueAtTime(0, now + duration);  // Fade out

  osc.start(now);
  osc.stop(now + duration / 1000);
}

// 18. Son d'erreur
function playErrorSound() {
  if (!gameState.soundEnabled) return;
  initAudioContext();

  const now = audioContext.currentTime;

  // 19. Bruit blanc + basse grave
  const noise = audioContext.createBufferSource();
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const gainNoise = audioContext.createGain();
  noise.buffer = buffer;
  noise.connect(gainNoise);
  gainNoise.connect(audioContext.destination);

  gainNoise.gain.setValueAtTime(0.3, now);
  gainNoise.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  noise.start(now);
  noise.stop(now + 0.3);

  // 20. Son grave (basse fréquence)
  const bassOsc = audioContext.createOscillator();
  const basGain = audioContext.createGain();

  bassOsc.connect(basGain);
  basGain.connect(audioContext.destination);

  bassOsc.type = 'sine';
  bassOsc.frequency.setValueAtTime(100, now);
  bassOsc.frequency.linearRampToValueAtTime(50, now + 0.3);

  basGain.gain.setValueAtTime(0.2, now);
  basGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  bassOsc.start(now);
  bassOsc.stop(now + 0.3);
}

// 21. Son de victoire (fanfare)
function playVictorySound() {
  if (!gameState.soundEnabled) return;
  initAudioContext();

  const now = audioContext.currentTime;
  const notes = [523, 659, 784, 1047]; // Do, Mi, Sol, Do (octave)

  notes.forEach((freq, idx) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.type = 'square';
    osc.frequency.value = freq;

    const startTime = now + idx * 0.1;
    gain.gain.setValueAtTime(0.1, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

    osc.start(startTime);
    osc.stop(startTime + 0.2);
  });
}

/* ============================================================ */
/* 22. VIBRATION API */
/* ============================================================ */

function vibrate(pattern = 20) {
  if (!gameState.vibrationEnabled) return;
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

// 23. Vibration personnalisée par couleur
function vibrateColor(colorLabel) {
  const patterns = {
    green: [10, 5, 10],      // Double tap
    red: [20, 10, 20],       // Triple tap
    yellow: [15, 5, 15, 5, 15], // Rapide triple
    blue: [30]               // Seul long
  };
  vibrate(patterns[colorLabel] || 20);
}

/* ============================================================ */
/* 24. GESTION DE LA SÉQUENCE */
/* ============================================================ */

// 25. Ajouter une couleur aléatoire à la séquence
function addRandomColor() {
  const colorKeys = Object.keys(CONFIG.colors);
  const randomColor = colorKeys[Math.floor(Math.random() * colorKeys.length)];
  gameState.sequence.push(randomColor);
}

// 26. Jouer la séquence complète (tour ordinateur)
async function playSequence() {
  gameState.isComputerPlaying = true;
  gameState.isPlayerTurn = false;
  gameState.playerSequence = [];

  // 27. Vitesse adaptée au mode
  let noteDuration = CONFIG.noteLength;
  let pauseDuration = CONFIG.pauseBetweenNotes;

  if (gameState.speed === 'slow') {
    noteDuration = CONFIG.noteLength * 1.3;
    pauseDuration = CONFIG.pauseBetweenNotes * 1.3;
  } else if (gameState.speed === 'fast') {
    noteDuration = CONFIG.noteLength * 0.7;
    pauseDuration = CONFIG.pauseBetweenNotes * 0.7;
  }

  // 28. Appliquer la vitesse progressive
  const speedFactor = Math.max(
    CONFIG.minSpeedMultiplier,
    1 - (gameState.level - 1) * CONFIG.speedIncreasePerRound
  );
  noteDuration *= speedFactor;
  pauseDuration *= speedFactor;

  // 29. Attendre un peu avant de commencer
  await sleep(500);

  // 30. Jouer chaque note de la séquence
  for (let i = 0; i < gameState.sequence.length; i++) {
    const color = gameState.sequence[i];

    // 31. Illuminer le bouton
    highlightButton(color);

    // 32. Jouer le son
    playNote(color, noteDuration);

    // 33. Vibration
    vibrateColor(color);

    // 34. Attendre la fin de la note
    await sleep(noteDuration + pauseDuration);
  }

  gameState.isComputerPlaying = false;
  gameState.isPlayerTurn = true;

  // 35. Mettre à jour le statut
  updateStatus('Votre tour !');
}

// 36. Fonction sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================================================ */
/* 37. GESTION DES BOUTONS JOUEUR */
/* ============================================================ */

// 38. Illuminer un bouton
function highlightButton(colorLabel) {
  const btn = document.querySelector(`.simon-${colorLabel}`);
  if (!btn) return;

  btn.classList.add('active');

  // Retirer la classe après 200ms
  setTimeout(() => {
    btn.classList.remove('active');
  }, 300);
}

// 39. Clic sur un bouton Simon
function handleButtonClick(colorLabel) {
  if (!gameState.isPlayerTurn || gameState.isComputerPlaying) return;

  // 40. Ajouter à la séquence du joueur
  gameState.playerSequence.push(colorLabel);

  // 41. Jouer le son & effet visuel
  highlightButton(colorLabel);
  playNote(colorLabel);
  vibrateColor(colorLabel);

  // 42. Vérifier si c'est correct
  const index = gameState.playerSequence.length - 1;
  if (gameState.playerSequence[index] !== gameState.sequence[index]) {
    // 43. ERREUR !
    handleError();
    return;
  }

  // 44. Vérifier si le joueur a complété la séquence
  if (gameState.playerSequence.length === gameState.sequence.length) {
    // 45. Séquence correcte complètement !
    gameState.score += 10;
    gameState.level++;
    updateHUD();

    // 46. Vérifier si palier atteint
    if (gameState.level % CONFIG.victoryThreshold === 0) {
      showVictoryPalier(gameState.level);
    }

    // 47. Pause avant la prochaine séquence
    gameState.isPlayerTurn = false;
    updateStatus('Bravo ! Séquence suivante...');

    setTimeout(() => {
      addRandomColor();
      playSequence();
    }, 1000);
  }
}

// 48. Gestion des erreurs
function handleError() {
  playErrorSound();
  vibrate([50, 50, 50, 50, 50]); // Vibration d'erreur intense
  updateStatus('ERREUR !');

  // 49. Animer le flash rouge
  document.body.style.background = 'rgba(255, 0, 0, 0.3)';
  setTimeout(() => {
    document.body.style.background = '';
  }, 300);

  gameState.isPlayerTurn = false;

  if (gameState.mode === 'strict') {
    // 50. Mode Strict : Game Over immédiat
    gameState.gameOver = true;
    endGame();
  } else {
    // 51. Mode Normal : Rejouer la séquence
    updateStatus('Recommençons...');
    setTimeout(() => {
      playSequence();
    }, 1000);
  }
}

/* ============================================================ */
/* 52. GESTION DE L'INTERFACE HUD */
/* ============================================================ */

// 53. Mettre à jour l'affichage HUD
function updateHUD() {
  document.getElementById('levelDisplay').textContent = gameState.level;
  document.getElementById('highScoreHud').textContent = gameState.highScore;
  document.getElementById('modeDisplay').textContent = gameState.mode === 'strict' ? 'STRICT' : 'NORMAL';
  document.getElementById('ledScore').textContent = String(gameState.level).padStart(2, '0');
  document.getElementById('sequenceCounter').textContent = gameState.sequence.length;
}

// 54. Mettre à jour le statut
function updateStatus(text) {
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  if (statusText) statusText.textContent = text;
  if (statusDot) statusDot.classList.toggle('playing', gameState.isComputerPlaying);
}

/* ============================================================ */
/* 55. DÉMARRAGE DU JEU */
/* ============================================================ */

// 56. Commencer une nouvelle partie
function startGame() {
  // 57. Réinitialiser l'état
  gameState.sequence = [];
  gameState.playerSequence = [];
  gameState.score = 0;
  gameState.level = 1;
  gameState.gameOver = false;
  gameState.isGameRunning = true;

  // 58. Ajouter la première couleur
  addRandomColor();

  // 59. Mettre à jour l'affichage
  updateHUD();
  updateStatus('Prêt !');

  // 60. Afficher le game screen
  showScreen('gameScreen');

  // 61. Lancer la boucle de jeu
  setTimeout(() => {
    playSequence();
  }, 500);
}

// 62. Enregistrer le résultat d'une partie
function saveGameResult() {
  // 63. Mettre à jour le high score
  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
    saveHighScore(gameState.highScore);
  }

  // 64. Vérifier nouveau record puis enregistrer cette partie
  const currentBoard = gameState.leaderboard[gameState.mode] || [];
  const isNewRecord = currentBoard.length === 0 || gameState.score > currentBoard[0].score;
  addToLeaderboard(gameState.score, gameState.level);

  return isNewRecord;
}

// 65. Fin de partie
function endGame() {
  gameState.isGameRunning = false;
  gameState.isPlayerTurn = false;
  gameState.isComputerPlaying = false;

  const isNewRecord = saveGameResult();

  // 66. Afficher le game over
  showGameOverScreen(isNewRecord);
}

/* ============================================================ */
/* 66. ÉCRANS & NAVIGATION SPA */
/* ============================================================ */

// 67. Afficher un écran
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('screen-active');
  });
  document.getElementById(screenId)?.classList.add('screen-active');
}

// 68. Afficher l'écran game over
function showGameOverScreen(isNewRecord) {
  document.getElementById('finalScore').textContent = gameState.score;
  document.getElementById('finalSequence').textContent = gameState.level - 1;
  document.getElementById('finalMode').textContent = gameState.mode === 'strict' ? 'Strict' : 'Normal';

  if (isNewRecord) {
    document.getElementById('newRecordBanner').style.display = 'block';
    playVictorySound();
    vibrate([20, 10, 20, 10, 20, 10, 20]);
  } else {
    document.getElementById('newRecordBanner').style.display = 'none';
  }

  showScreen('gameOverScreen');
}

// 69. Afficher modal palier victoire
function showVictoryPalier(level) {
  const modal = document.getElementById('victoryModal');
  const message = document.getElementById('victoryMessage');

  message.textContent = `Vous avez atteint ${level} séquences ! C'est incroyable !`;
  modal.style.display = 'flex';

  playVictorySound();
  vibrate([30, 10, 30, 10, 30]);
}

/* ============================================================ */
/* 70. LEADERBOARD */
/* ============================================================ */

// 71. Charger le leaderboard
function loadLeaderboard() {
  const saved = localStorage.getItem('simonLeaderboard');
  if (saved) {
    try {
      const parsedLeaderboard = JSON.parse(saved);
      gameState.leaderboard = {
        normal: Array.isArray(parsedLeaderboard.normal) ? parsedLeaderboard.normal : [],
        strict: Array.isArray(parsedLeaderboard.strict) ? parsedLeaderboard.strict : []
      };
    } catch {
      // Une ancienne donnée invalide ne doit pas empêcher le jeu de démarrer.
      localStorage.removeItem('simonLeaderboard');
    }
  }

  // 72. Charger aussi le high score global
  const hsaved = localStorage.getItem('simonHighScore');
  if (hsaved) {
    gameState.highScore = parseInt(hsaved);
  }
}

// 73. Sauvegarder le high score global
function saveHighScore(score) {
  localStorage.setItem('simonHighScore', score.toString());
}

// 74. Ajouter une entrée au leaderboard
function addToLeaderboard(score, level) {
  const entry = {
    score,             // Points réellement affichés au joueur
    level: level - 1,  // Nombre de séquences réussies
    timestamp: new Date().getTime()
  };

  gameState.leaderboard[gameState.mode].push(entry);
  gameState.leaderboard[gameState.mode].sort((a, b) => b.score - a.score);
  gameState.leaderboard[gameState.mode] = gameState.leaderboard[gameState.mode].slice(0, 10); // Top 10

  saveLeaderboard();
}

// 75. Sauvegarder le leaderboard
function saveLeaderboard() {
  localStorage.setItem('simonLeaderboard', JSON.stringify(gameState.leaderboard));
}

// 76. Afficher le leaderboard
function displayLeaderboard(mode) {
  const list = gameState.leaderboard[mode] || [];
  const container = document.getElementById('leaderboardList');

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-leaderboard">Aucun score enregistré</div>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];

  container.innerHTML = list.map((entry, idx) => {
    const medal = medals[idx] || '•';
    return `
            <div class="leaderboard-entry">
                <div class="rank-medal">${medal}</div>
                <div class="entry-name">#${idx + 1}</div>
                <div class="entry-score">${entry.score}</div>
            </div>
        `;
  }).join('');
}

/* ============================================================ */
/* 77. EVENT LISTENERS - MENU */
/* ============================================================ */

// 78. Sélectionner le mode de jeu
document.querySelectorAll('.mode-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gameState.mode = btn.dataset.mode;
  });
});

// 79. Sélectionner la vitesse
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('speed-active'));
    btn.classList.add('speed-active');
    gameState.speed = btn.dataset.speed;
  });
});

// 80. Bouton démarrer du menu
document.getElementById('startGameBtn')?.addEventListener('click', startGame);

// 81. Bouton leaderboard du menu
document.getElementById('leaderboardMenuBtn')?.addEventListener('click', () => {
  displayLeaderboard('normal');
  showScreen('leaderboardScreen');
});

/* ============================================================ */
/* 82. EVENT LISTENERS - GAME SCREEN */
/* ============================================================ */

// 83. Clic sur les 4 boutons Simon
document.querySelectorAll('.simon-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    handleButtonClick(color);
  });

  // 84. Vibration au toucher (feedback haptique)
  btn.addEventListener('touchstart', (e) => {
    vibrate(10);
  });
});

// 85. Bouton Recommencer
document.getElementById('restartGameBtn')?.addEventListener('click', startGame);

// 86. Bouton Quitter
document.getElementById('quitGameBtn')?.addEventListener('click', () => {
  // En mode Normal, le joueur choisit lui-même de terminer sa session.
  if (gameState.isGameRunning && gameState.score > 0) {
    saveGameResult();
  }
  gameState.isGameRunning = false;
  gameState.isPlayerTurn = false;
  gameState.isComputerPlaying = false;
  showScreen('menuScreen');
});

/* ============================================================ */
/* 88. EVENT LISTENERS - GAME OVER SCREEN */
/* ============================================================ */

// 89. Rejouer
document.getElementById('retryGameOverBtn')?.addEventListener('click', startGame);

// 90. Menu depuis game over
document.getElementById('menuGameOverBtn')?.addEventListener('click', () => {
  showScreen('menuScreen');
});

/* ============================================================ */
/* 91. EVENT LISTENERS - LEADERBOARD SCREEN */
/* ============================================================ */

// 92. Onglets leaderboard
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    btn.classList.add('tab-active');
    displayLeaderboard(btn.dataset.tab);
  });
});

// 93. Bouton retour leaderboard
document.getElementById('leaderboardBackBtn')?.addEventListener('click', () => {
  showScreen('menuScreen');
});

/* ============================================================ */
/* 94. EVENT LISTENERS - MODAL VICTOIRE */
/* ============================================================ */

// 95. Confirmer le palier
document.getElementById('victoryConfirmBtn')?.addEventListener('click', () => {
  document.getElementById('victoryModal').style.display = 'none';
});

/* ============================================================ */
/* 96. INITIALISATION AU DÉMARRAGE */
/* ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // 97. Charger les données sauvegardées
  loadLeaderboard();

  // 98. Mettre à jour le high score d'affichage
  document.getElementById('highScoreHud').textContent = gameState.highScore;

  // 99. Afficher le menu par défaut
  showScreen('menuScreen');

  // 100. Log de démarrage
  console.log('🎮 Simon Néon initialized!');
});

/* ============================================================ */
/* 101. SUPPORT AUDIO CONTEXT UNLOCKING (Mobile) */
/* ============================================================ */

// 102. Débloquer l'audio context sur click (requis sur mobile iOS)
document.addEventListener('click', () => {
  initAudioContext();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}, { once: true });

// 103. Alternative touch pour déverrouillage audio
document.addEventListener('touchstart', () => {
  initAudioContext();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}, { once: true });
