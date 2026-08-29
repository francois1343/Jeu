/* ============================================================ */
/* NEON OVERDRIVE - game.js                                    */
/* Shmup rétro avec Canvas, game loop 60 FPS, physique complète */
/* ============================================================ */

/* ============================================================ */
/* 1. CANVAS SETUP */
/* ============================================================ */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 2. Dimensions virtuelles du canvas (400x600)
const CANVAS_WIDTH = canvas.width; // 400
const CANVAS_HEIGHT = canvas.height; // 600

/* ============================================================ */
/* 3. CONFIGURATION GLOBALE */
/* ============================================================ */

const CONFIG = {
  // 4. Vaisseau du joueur
  playerSize: 16,
  playerSpeed: 4,
  playerLerpFactor: 0.15, // Lissage du mouvement (0.15 = réaction rapide)
  playerPaddingBottom: CANVAS_HEIGHT * 0.3, // Zone limite en bas

  // 5. Tir
  bulletSpeed: 6,
  bulletSize: 4,
  fireInterval: 10, // frames entre chaque tir automatique

  // 6. Ennemis
  enemyInitialSpeed: 0.8,
  enemySpeedPerLevel: 0.07,
  enemySpeedVariation: 0.15,
  enemySize: 12,
  waveSpacing: 3, // Vagues par niveau

  // 7. Boss
  bossSize: 32,
  bossMaxHealth: 20,
  bossFireInterval: 90,
  bossProjectileSpeed: 1.2,

  // 8. Particules
  particleLifetime: 60, // frames (à 60 FPS = 1 sec)

  // 9. Screen shake
  maxScreenShake: 10,

  // 10. Physique générale
  gravity: 0.1,
  friction: 0.98,
};

/* ============================================================ */
/* 11. GAME STATE */
/* ============================================================ */

const gameState = {
  // 12. Ressources et progression
  score: 0,
  level: 1,
  playerHealth: 3,

  // 13. Listes d'objets (updatées chaque frame)
  player: null,
  bullets: [],
  enemies: [],
  particles: [],
  powerups: [],
  boss: null,

  // 14. État du jeu
  isGameOver: false,
  isGameStarted: false,
  isPaused: false,
  waveIndex: 0,
  enemySpawnCounter: 0,

  // 15. Paramètres acoustiques
  soundEnabled: true,
  vibrationEnabled: true,

  // 16. Screen shake
  screenShakeAmount: 0,

  // 17. High score
  highScores: [],
};

/* ============================================================ */
/* 18. PARALLAX BACKGROUND */
/* ============================================================ */

// 19. Trois couches d'étoiles qui défilent à des vitesses différentes
class ParallaxLayer {
  constructor(speed, color = "#ffffff") {
    this.speed = speed;
    this.color = color;
    this.offset = 0;
    this.stars = [];

    // 20. Générer 30 étoiles aléatoires par couche
    for (let i = 0; i < 30; i++) {
      this.stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: Math.random() * 1.5 + 0.5,
      });
    }
  }

  // 21. Mettre à jour le défilement
  update() {
    this.offset += this.speed;
    if (this.offset > CANVAS_HEIGHT) {
      this.offset = 0;
    }
  }

  // 22. Dessiner les étoiles
  draw(ctx) {
    ctx.fillStyle = this.color;
    this.stars.forEach((star) => {
      let y = (star.y + this.offset) % CANVAS_HEIGHT;
      if (y < 0) y += CANVAS_HEIGHT;
      ctx.fillRect(star.x, y, star.size, star.size);
    });
  }
}

const parallaxLayers = [
  new ParallaxLayer(0.3, "#0088ff"), // Couche lointaine (cyan)
  new ParallaxLayer(0.6, "#00ff88"), // Couche intermédiaire (vert)
  new ParallaxLayer(1.0, "#ffffff"), // Couche proche (blanc)
];

/* ============================================================ */
/* 23. CLASSE PLAYER */
/* ============================================================ */

class Player {
  constructor() {
    this.x = CANVAS_WIDTH / 2;
    this.y = CANVAS_HEIGHT - 50;
    this.targetX = this.x;
    this.targetY = this.y;
    this.size = CONFIG.playerSize;
    this.fireCooldown = 0;
  }

  // 24. Mettre à jour position (suivi souris/doigt avec Lerp)
  update(mouseX, mouseY) {
    // 25. Limiter Y au bas 30%
    const minY = CANVAS_HEIGHT - CONFIG.playerPaddingBottom;
    this.targetY = Math.min(Math.max(mouseY, minY), CANVAS_HEIGHT - this.size);
    this.targetX = Math.max(Math.min(mouseX, CANVAS_WIDTH - this.size), 0);

    // 26. Lerp smooth (interpolation linéaire)
    this.x += (this.targetX - this.x) * CONFIG.playerLerpFactor;
    this.y += (this.targetY - this.y) * CONFIG.playerLerpFactor;
  }

  // 27. Tirer automatiquement, même lorsque le vaisseau reste immobile
  fire() {
    this.fireCooldown--;
    if (this.fireCooldown <= 0) {
      gameState.bullets.push(new Bullet(this.x, this.y - this.size));
      playSound("shoot");
      vibrate(8);
      this.fireCooldown = CONFIG.fireInterval;
    }
  }

  // 29. Dessiner le vaisseau
  draw(ctx) {
    // 30. Triangle simple (vaisseau classique)
    ctx.fillStyle = "#00ffff";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#00ffff";

    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.size); // Pointe avant
    ctx.lineTo(this.x - this.size / 2, this.y + this.size); // Gauche
    ctx.lineTo(this.x + this.size / 2, this.y + this.size); // Droite
    ctx.closePath();
    ctx.fill();

    // 31. Réacteurs animés (carrés bleus/roses qui clignotent)
    ctx.fillStyle = Math.random() > 0.5 ? "#ff00ff" : "#00ffff";
    ctx.fillRect(this.x - 4, this.y + this.size - 2, 3, 4);
    ctx.fillRect(this.x + 2, this.y + this.size - 2, 3, 4);

    ctx.shadowBlur = 0;
  }
}

/* ============================================================ */
/* 32. CLASSE BULLET (Tirs du joueur) */
/* ============================================================ */

class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = -CONFIG.bulletSpeed;
    this.size = CONFIG.bulletSize;
  }

  // 33. Mettre à jour position
  update() {
    this.x += this.vx;
    this.y += this.vy;
  }

  // 34. Vérifier si la balle est sortie de l'écran
  isOffScreen() {
    return (
      this.y < -10 ||
      this.y > CANVAS_HEIGHT + 10 ||
      this.x < -10 ||
      this.x > CANVAS_WIDTH + 10
    );
  }

  // 35. Dessiner la balle
  draw(ctx) {
    ctx.fillStyle = "#ffff00";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ffff00";
    ctx.fillRect(
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size,
    );
    ctx.shadowBlur = 0;
  }
}

/* ============================================================ */
/* 36. CLASSE ENEMY */
/* ============================================================ */

class Enemy {
  constructor(x, y, health = 1, size = CONFIG.enemySize) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 0.5; // Léger mouvement latéral
    this.vy =
      CONFIG.enemyInitialSpeed *
      (1 + (gameState.level - 1) * CONFIG.enemySpeedPerLevel);
    this.health = health;
    this.size = size;
  }

  // 37. Mettre à jour position
  update() {
    this.x += this.vx;
    this.y += this.vy;

    // 38. Limiter à l'écran horizontalement
    if (this.x < 0 || this.x > CANVAS_WIDTH) {
      this.vx *= -1;
    }
    this.x = Math.max(0, Math.min(CANVAS_WIDTH, this.x));
  }

  // 39. Vérifier si sortie de l'écran
  isOffScreen() {
    return this.y > CANVAS_HEIGHT + 20;
  }

  // 40. Prendre des dégâts
  takeDamage(amount = 1) {
    this.health -= amount;
  }

  // 41. Dessiner l'ennemi
  draw(ctx) {
    ctx.fillStyle = "#ff00ff";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff00ff";
    ctx.fillRect(
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size,
    );

    // 42. Petit carré blanc pour les yeux
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(this.x - 4, this.y - 2, 2, 2);
    ctx.fillRect(this.x + 2, this.y - 2, 2, 2);
    ctx.shadowBlur = 0;
  }
}

/* ============================================================ */
/* 43. CLASSE BOSS */
/* ============================================================ */

class Boss {
  constructor() {
    this.x = CANVAS_WIDTH / 2;
    this.y = 60;
    this.size = CONFIG.bossSize;
    this.health = Math.round(
      CONFIG.bossMaxHealth * (1 + (gameState.level - 1) * 0.1),
    );
    this.maxHealth = this.health;
    this.shootCounter = 0;
  }

  // 44. Mettre à jour
  update() {
    this.shootCounter++;

    // 45. Boss tire un éventail lent et lisible vers le bas.
    if (this.shootCounter > CONFIG.bossFireInterval) {
      this.fireCircle();
      this.shootCounter = 0;
    }
  }

  // 46. Tirer un éventail dont l'orientation varie légèrement à chaque salve
  fireCircle() {
    const directions = Math.min(7, 5 + Math.floor((gameState.level - 1) / 3));
    const spread = Math.PI / 2;
    const centerAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.35;
    for (let i = 0; i < directions; i++) {
      const angle = centerAngle - spread / 2 + (i / (directions - 1)) * spread;
      const enemy = new Enemy(
        this.x + Math.cos(angle) * 50,
        this.y + Math.sin(angle) * 50,
        1,
        8,
      );
      enemy.vx = Math.cos(angle) * CONFIG.bossProjectileSpeed;
      enemy.vy = Math.sin(angle) * CONFIG.bossProjectileSpeed;
      gameState.enemies.push(enemy);
    }
  }

  // 47. Prendre des dégâts
  takeDamage(amount = 1) {
    this.health -= amount;
  }

  // 48. Dessiner le boss
  draw(ctx) {
    ctx.fillStyle = "#ff0080";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#ff0080";
    ctx.fillRect(
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size,
    );

    // 49. Barre de vie du boss
    const healthBarWidth = 80;
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(
      this.x - healthBarWidth / 2,
      this.y - 30,
      healthBarWidth * healthPercent,
      4,
    );
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - healthBarWidth / 2, this.y - 30, healthBarWidth, 4);

    ctx.shadowBlur = 0;
  }
}

/* ============================================================ */
/* 50. CLASSE PARTICLE */
/* ============================================================ */

class Particle {
  constructor(x, y, vx, vy, color = "#ff00ff", life = CONFIG.particleLifetime) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = 3;
  }

  // 51. Mettre à jour avec physique
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += CONFIG.gravity;
    this.vx *= CONFIG.friction;
    this.life--;
  }

  // 52. Vérifier si morte
  isDead() {
    return this.life <= 0;
  }

  // 53. Dessiner
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size,
    );
    ctx.globalAlpha = 1;
  }
}

/* ============================================================ */
/* 54. CLASSE POWERUP */
/* ============================================================ */

class PowerUp {
  constructor(x, y, type = "doubleFire") {
    this.x = x;
    this.y = y;
    this.type = type; // 'doubleFire', 'laser', 'shield'
    this.size = 10;
    this.vy = 1;
  }

  // 55. Mettre à jour
  update() {
    this.y += this.vy;
  }

  // 56. Vérifier si sortie
  isOffScreen() {
    return this.y > CANVAS_HEIGHT;
  }

  // 57. Dessiner
  draw(ctx) {
    ctx.fillStyle = "#ffff00";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#ffff00";
    ctx.fillRect(
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size,
    );

    // 58. Caractère selon le type
    ctx.fillStyle = "#000000";
    ctx.font = "8px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const char =
      this.type === "doubleFire" ? "2" : this.type === "laser" ? "L" : "S";
    ctx.fillText(char, this.x, this.y);

    ctx.shadowBlur = 0;
  }
}

/* ============================================================ */
/* 59. COLLISION DETECTION */
/* ============================================================ */

// 60. Vérifie collision rectangle vs rectangle
function checkCollision(a, b) {
  const sizeA = a.size || 16;
  const sizeB = b.size || 12;

  return (
    a.x - sizeA / 2 < b.x + sizeB / 2 &&
    a.x + sizeA / 2 > b.x - sizeB / 2 &&
    a.y - sizeA / 2 < b.y + sizeB / 2 &&
    a.y + sizeA / 2 > b.y - sizeB / 2
  );
}

// 61. Mettre à jour toutes les collisions
function updateCollisions() {
  // 62. Balles vs ennemis
  for (let bIdx = gameState.bullets.length - 1; bIdx >= 0; bIdx--) {
    const bullet = gameState.bullets[bIdx];
    for (let eIdx = gameState.enemies.length - 1; eIdx >= 0; eIdx--) {
      const enemy = gameState.enemies[eIdx];
      if (checkCollision(bullet, enemy)) {
        gameState.bullets.splice(bIdx, 1);
        enemy.takeDamage(1);

        if (enemy.health <= 0) {
          // 63. Créer explosion
          createExplosion(enemy.x, enemy.y, "#ff00ff", 15);
          gameState.score += 100 * gameState.level;
          playSound("explode");
          vibrate(15);
          gameState.enemies.splice(eIdx, 1);

          // 64. 20% de chance de power-up
          if (Math.random() < 0.2) {
            gameState.powerups.push(new PowerUp(enemy.x, enemy.y));
          }
        }
        break;
      }
    }
  }

  // 65. Balles vs boss
  if (gameState.boss) {
    for (let bIdx = gameState.bullets.length - 1; bIdx >= 0; bIdx--) {
      const bullet = gameState.bullets[bIdx];
      if (checkCollision(bullet, gameState.boss)) {
        gameState.bullets.splice(bIdx, 1);
        gameState.boss.takeDamage(1);
        playSound("explode");

        if (gameState.boss.health <= 0) {
          createExplosion(gameState.boss.x, gameState.boss.y, "#ff0080", 50);
          gameState.score += 5000 * gameState.level;
          gameState.boss = null;
          // Les projectiles restants du boss disparaissent avec lui.
          gameState.enemies = [];
          gameState.level++;
          playSound("arpeggio");
          shakeScreen(8);
        }
        break;
      }
    }
  }

  // 66. Joueur vs ennemis
  for (let eIdx = gameState.enemies.length - 1; eIdx >= 0; eIdx--) {
    const enemy = gameState.enemies[eIdx];
    if (checkCollision(gameState.player, enemy)) {
      gameState.playerHealth--;
      createExplosion(gameState.player.x, gameState.player.y, "#00ffff", 20);
      gameState.enemies.splice(eIdx, 1);
      playSound("hit");
      shakeScreen(5);
      vibrate(50);

      if (gameState.playerHealth <= 0) {
        gameState.isGameOver = true;
        playSound("gameover");
        vibratePrestige();
      }
    }
  }

  // 67. Joueur vs power-ups
  for (let pIdx = gameState.powerups.length - 1; pIdx >= 0; pIdx--) {
    const powerup = gameState.powerups[pIdx];
    if (checkCollision(gameState.player, powerup)) {
      // 68. À implémenter : activer le power-up
      gameState.powerups.splice(pIdx, 1);
      playSound("powerup");
    }
  }
}

/* ============================================================ */
/* 69. EXPLOSION PARTICLES */
/* ============================================================ */

function createExplosion(x, y, color, count = 15) {
  // 70. Créer des particules qui explosent dans toutes les directions
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    gameState.particles.push(new Particle(x, y, vx, vy, color));
  }
}

/* ============================================================ */
/* 71. SCREEN SHAKE */
/* ============================================================ */

function shakeScreen(intensity = 5) {
  // 72. Secouer l'écran pendant quelques frames
  gameState.screenShakeAmount = Math.min(
    gameState.screenShakeAmount + intensity,
    CONFIG.maxScreenShake,
  );
}

/* ============================================================ */
/* 73. SPAWNING - Vagues d'ennemis */
/* ============================================================ */

function spawnWave() {
  // 74. Toutes les 3 vagues, faire apparaître le boss avant le niveau suivant.
  if (gameState.waveIndex >= CONFIG.waveSpacing) {
    gameState.boss = new Boss();
    gameState.waveIndex = 0;
    shakeScreen(3);
    return;
  }

  // Après la première vague, chaque vague nettoyée fait progresser d'un niveau.
  if (gameState.waveIndex > 0) {
    gameState.level++;
  }

  // 75. Choisir une formation pour que chaque niveau ait un rythme différent.
  const patterns = ["line", "staggered", "flanks"];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const enemyCount = 5 + Math.floor(gameState.level / 2);
  for (let i = 0; i < enemyCount; i++) {
    let x;
    let y;

    if (pattern === "staggered") {
      const columns = Math.min(3, enemyCount);
      x = (CANVAS_WIDTH / (columns + 1)) * ((i % columns) + 1);
      y = -20 - Math.floor(i / columns) * 42;
    } else if (pattern === "flanks") {
      const fromLeft = i % 2 === 0;
      x = fromLeft
        ? 25 + Math.random() * 50
        : CANVAS_WIDTH - 25 - Math.random() * 50;
      y = -20 - Math.floor(i / 2) * 32;
    } else {
      x =
        (CANVAS_WIDTH / (enemyCount + 1)) * (i + 1) +
        (Math.random() - 0.5) * 28;
      y = -20 - Math.random() * 45;
    }

    const enemy = new Enemy(Math.max(15, Math.min(CANVAS_WIDTH - 15, x)), y);
    const speedFactor =
      1 -
      CONFIG.enemySpeedVariation +
      Math.random() * CONFIG.enemySpeedVariation * 2;
    enemy.vy *= speedFactor;

    if (pattern === "flanks") {
      enemy.vx = x < CANVAS_WIDTH / 2 ? 0.45 : -0.45;
    } else {
      enemy.vx *= 0.7 + Math.random() * 1.2;
    }

    gameState.enemies.push(enemy);
  }

  // 76. Comptabiliser la vague terminée
  gameState.waveIndex++;
}

/* ============================================================ */
/* 77. WEB AUDIO API */
/* ============================================================ */

let audioContext = null;

// 78. Initialiser le contexte audio
function initAudioContext() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// 79. Son de tir (Pew!)
function playSound(type) {
  if (!gameState.soundEnabled) return;
  initAudioContext();

  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.type = "square";

  if (type === "shoot") {
    osc.frequency.value = 600;
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
  } else if (type === "explode") {
    // Bruit blanc crépitant
    const noise = audioContext.createBufferSource();
    const buffer = audioContext.createBuffer(
      1,
      audioContext.sampleRate * 0.2,
      audioContext.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    noise.connect(gain);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    noise.start(now);
    noise.stop(now + 0.2);
  } else if (type === "powerup") {
    // Arpège rétro
    const notes = [400, 500, 600, 800];
    notes.forEach((freq, idx) => {
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.connect(g);
      g.connect(audioContext.destination);
      o.frequency.value = freq;
      o.type = "square";
      g.gain.setValueAtTime(0.05, now + idx * 0.05);
      g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.1);
      o.start(now + idx * 0.05);
      o.stop(now + idx * 0.05 + 0.1);
    });
  } else if (type === "arpeggio") {
    // Fanfare boss
    const notes = [400, 500, 800];
    notes.forEach((freq, idx) => {
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.connect(g);
      g.connect(audioContext.destination);
      o.frequency.value = freq;
      o.type = "square";
      g.gain.setValueAtTime(0.1, now + idx * 0.1);
      g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.2);
      o.start(now + idx * 0.1);
      o.stop(now + idx * 0.1 + 0.2);
    });
  } else if (type === "hit") {
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === "gameover") {
    // Son baissant
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.5);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

/* ============================================================ */
/* 80. VIBRATION API */
/* ============================================================ */

function vibrate(duration = 10) {
  if (!gameState.vibrationEnabled) return;
  if ("vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}

function vibratePrestige() {
  if (!gameState.vibrationEnabled) return;
  if ("vibrate" in navigator) {
    navigator.vibrate([20, 10, 20, 10, 20]);
  }
}

/* ============================================================ */
/* 81. GAME LOOP - UPDATE & DRAW */
/* ============================================================ */

// 82. Mettre à jour la logique du jeu
function update(mouseX, mouseY) {
  if (!gameState.isGameStarted || gameState.isPaused || gameState.isGameOver)
    return;

  // 83. Mettre à jour parallax
  parallaxLayers.forEach((layer) => layer.update());

  // 84. Mettre à jour joueur et tir automatique
  gameState.player.update(mouseX, mouseY);
  gameState.player.fire();

  // 85. Mettre à jour balles
  gameState.bullets = gameState.bullets.filter((b) => {
    b.update();
    return !b.isOffScreen();
  });

  // 86. Mettre à jour ennemis
  gameState.enemies = gameState.enemies.filter((e) => {
    e.update();
    return !e.isOffScreen();
  });

  // 87. Mettre à jour boss
  if (gameState.boss) {
    gameState.boss.update();
  }

  // 88. Mettre à jour particules
  gameState.particles = gameState.particles.filter((p) => {
    p.update();
    return !p.isDead();
  });

  // 89. Mettre à jour power-ups
  gameState.powerups = gameState.powerups.filter((pu) => {
    pu.update();
    return !pu.isOffScreen();
  });

  // 90. Collisions
  updateCollisions();

  // 91. Spawning automatique
  if (gameState.enemies.length === 0 && !gameState.boss) {
    spawnWave();
  }

  // 92. Diminuer le screen shake
  gameState.screenShakeAmount *= 0.9;
}

// 93. Dessiner tous les éléments
function draw() {
  // 94. Effacer le canvas
  ctx.fillStyle = "#0a0e27";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 95. Screen shake offset
  const shakeX = (Math.random() - 0.5) * gameState.screenShakeAmount;
  const shakeY = (Math.random() - 0.5) * gameState.screenShakeAmount;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // 96. Dessiner parallax
  parallaxLayers.forEach((layer) => layer.draw(ctx));

  // 97. Dessiner joueur
  gameState.player.draw(ctx);

  // 98. Dessiner balles
  gameState.bullets.forEach((b) => b.draw(ctx));

  // 99. Dessiner ennemis
  gameState.enemies.forEach((e) => e.draw(ctx));

  // 100. Dessiner boss
  if (gameState.boss) {
    gameState.boss.draw(ctx);
  }

  // 101. Dessiner particules
  gameState.particles.forEach((p) => p.draw(ctx));

  // 102. Dessiner power-ups
  gameState.powerups.forEach((pu) => pu.draw(ctx));

  ctx.restore();

  // 103. Mettre à jour HUD
  document.getElementById("levelDisplay").textContent =
    `NIVEAU: ${gameState.level}`;
  document.getElementById("scoreDisplay").textContent =
    `SCORE: ${gameState.score}`;
  document.getElementById("healthDisplay").textContent =
    `❤️ ${gameState.playerHealth}`;
}

/* ============================================================ */
/* 104. MAIN GAME LOOP */
/* ============================================================ */

let mouseX = CANVAS_WIDTH / 2;
let mouseY = CANVAS_HEIGHT - 50;
let lastFrameTime = Date.now();
let gameLoopRunning = false;

// 105. Suivi souris / doigt
document.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  mouseY = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
});

document.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.touches[0].clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  mouseY = (e.touches[0].clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
});

// 106. Boucle de jeu principale (60 FPS)
function gameLoop() {
  update(mouseX, mouseY);
  draw();
  requestAnimationFrame(gameLoop);
}

/* ============================================================ */
/* 107. HIGH SCORE & LOCALSTORAGE */
/* ============================================================ */

const PLAYER_ID_STORAGE_KEY = "neonOverdrivePlayerId";
const LEGACY_SCORES_STORAGE_KEY = "neonOverdriveScores";

// 108. Obtenir l'identifiant local du joueur (un par installation/navigateur)
function getPlayerScoresStorageKey() {
  let playerId = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (!playerId) {
    playerId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
  }
  return `neonOverdriveScores_${playerId}`;
}

// 109. Charger les trois meilleurs scores personnels
function loadHighScores() {
  const storageKey = getPlayerScoresStorageKey();
  const saved = localStorage.getItem(storageKey);
  const legacyScores = localStorage.getItem(LEGACY_SCORES_STORAGE_KEY);

  try {
    const scores = JSON.parse(saved || legacyScores || "[]");
    gameState.highScores = Array.isArray(scores)
      ? scores
          .filter(Number.isFinite)
          .sort((a, b) => b - a)
          .slice(0, 3)
      : [];
  } catch {
    gameState.highScores = [];
  }

  localStorage.setItem(storageKey, JSON.stringify(gameState.highScores));
}

// 110. Ajouter un score uniquement s'il entre dans le Top 3. Retourne son rang.
function saveHighScore(score) {
  if (score <= 0) return null;

  const qualifies =
    gameState.highScores.length < 3 || score > gameState.highScores[2];
  if (!qualifies) return null;

  gameState.highScores.push(score);
  gameState.highScores.sort((a, b) => b - a);
  gameState.highScores = gameState.highScores.slice(0, 3);
  localStorage.setItem(
    getPlayerScoresStorageKey(),
    JSON.stringify(gameState.highScores),
  );
  return gameState.highScores.indexOf(score) + 1;
}

// 111. Supprimer uniquement les scores personnels du joueur actuel
function clearHighScores() {
  localStorage.removeItem(getPlayerScoresStorageKey());
  localStorage.removeItem(LEGACY_SCORES_STORAGE_KEY);
  gameState.highScores = [];
  displayTopScores();
}

// 112. Afficher le Top 3 personnel
function displayTopScores() {
  const container = document.getElementById("topScores");
  if (gameState.highScores.length === 0) {
    container.innerHTML = '<p class="no-scores">Pas encore de records...</p>';
  } else {
    container.innerHTML = gameState.highScores
      .map(
        (score, idx) =>
          `<p class="score-item"><span class="score-rank">${idx + 1}.</span> ${score}</p>`,
      )
      .join("");
  }
}

/* ============================================================ */
/* 111. NAVIGATION SPA */
/* ============================================================ */

// 112. Afficher écran
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("screen-active");
  });
  document.getElementById(screenId).classList.add("screen-active");
}

// 113. Démarrer le jeu
function startGame() {
  gameState.score = 0;
  gameState.playerHealth = 3;
  gameState.level = 1;
  gameState.isGameOver = false;
  gameState.isGameStarted = false;
  gameState.isPaused = false;
  gameState.player = new Player();
  gameState.bullets = [];
  gameState.enemies = [];
  gameState.particles = [];
  gameState.powerups = [];
  gameState.boss = null;
  gameState.waveIndex = 0;

  document.getElementById("pauseOverlay").hidden = true;

  showScreen("gameScreen");

  // 114. Countdown "3 2 1 GO"
  let count = 3;
  const readyText = document.getElementById("readyText");
  readyText.style.display = "block";

  const countDown = setInterval(() => {
    count--;
    readyText.textContent = count === 0 ? "GO!" : count;

    if (count < 0) {
      clearInterval(countDown);
      readyText.style.display = "none";
      gameState.isGameStarted = true;
      window.ArcadeGameSession?.start({ source: "countdown_complete" });
      spawnWave();
      if (!gameLoopRunning) {
        gameLoopRunning = true;
        gameLoop();
      }
    }
  }, 1000);
}
// 115. Game Over
function endGame() {
  // Le jeu n'est plus actif : sinon le contrôleur de fin relance cet écran
  // toutes les 16 ms, y compris après un clic sur « Main Menu ».
  gameState.isGameStarted = false;
  gameState.isPaused = false;
  window.ArcadeGameSession?.completeByScore(gameState.score, {
    level: gameState.level,
    wave: gameState.waveIndex,
  });
  document.getElementById("pauseOverlay").hidden = true;
  showScreen("gameOverScreen");

  const previousBestScore = gameState.highScores[0] || 0;
  const leaderboardRank = saveHighScore(gameState.score);
  const recordBanner = document.getElementById("newRecordBanner");
  if (leaderboardRank) {
    recordBanner.style.display = "block";
    recordBanner.querySelector(".new-record-text").textContent =
      gameState.score > previousBestScore
        ? "🎊 NEW HIGH SCORE! 🎊"
        : `🏆 TOP 3 SCORE — #${leaderboardRank}! 🏆`;
  } else {
    recordBanner.style.display = "none";
  }

  displayTopScores();

  document.getElementById("finalScore").textContent = gameState.score;
  document.getElementById("finalLevel").textContent = gameState.level;
}

// 116. Pause / reprise de la partie
function setPaused(isPaused) {
  if (!gameState.isGameStarted || gameState.isGameOver) return;
  gameState.isPaused = isPaused;
  document.getElementById("pauseOverlay").hidden = !isPaused;
}

function returnToMenuFromPause() {
  const confirmed = window.confirm(
    "Êtes-vous sûr de vouloir quitter la partie et revenir au menu ?",
  );
  if (!confirmed) return;

  gameState.isPaused = false;
  gameState.isGameStarted = false;
  gameState.isGameOver = false;
  document.getElementById("pauseOverlay").hidden = true;
  displayTopScores();
  showScreen("menuScreen");
}

/* ============================================================ */
/* 117. EVENT LISTENERS */
/* ============================================================ */

document.getElementById("startButton")?.addEventListener("click", startGame);
document.getElementById("restartButton")?.addEventListener("click", startGame);
document
  .getElementById("pauseButton")
  ?.addEventListener("click", () => setPaused(true));
document
  .getElementById("resumeButton")
  ?.addEventListener("click", () => setPaused(false));
document
  .getElementById("quitToMenuButton")
  ?.addEventListener("click", returnToMenuFromPause);
document.getElementById("menuButton")?.addEventListener("click", () => {
  gameState.isGameStarted = false;
  displayTopScores();
  showScreen("menuScreen");
});
document.getElementById("clearScoresButton")?.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Êtes-vous sûr de vouloir supprimer toutes les données du leaderboard ? Cette action est irréversible.",
  );
  if (confirmed) clearHighScores();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!gameState.isGameStarted || gameState.isGameOver) return;
  event.preventDefault();
  setPaused(!gameState.isPaused);
});

// 118. Quand le jeu se termine
setInterval(() => {
  if (
    gameState.isGameStarted &&
    gameState.isGameOver &&
    gameState.playerHealth <= 0
  ) {
    endGame();
  }
}, 16);

/* ============================================================ */
/* 119. INITIALISATION */
/* ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // 120. Charger high scores au démarrage
  loadHighScores();
  displayTopScores();

  // 121. Afficher le menu
  showScreen("menuScreen");

  console.log("🌌 Neon Overdrive initialized!");
});
