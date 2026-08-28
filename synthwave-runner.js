/* Synthwave Runner — game loop, input and rendering */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = 960,
  H = 540,
  GROUND_Y = 390,
  STORAGE_KEY = "synthwaveRunnerHighScore",
  SETTINGS_KEY = "synthwaveRunnerDoubleJump";
const ui = Object.fromEntries(
  [
    "score",
    "speed",
    "highScore",
    "finalScore",
    "finalDistance",
    "finalSpeed",
    "record",
  ].map((key) => [
    key,
    document.getElementById(
      {
        score: "scoreValue",
        speed: "speedValue",
        highScore: "highScoreValue",
        finalScore: "finalScore",
        finalDistance: "finalDistance",
        finalSpeed: "finalSpeed",
        record: "newRecordBanner",
      }[key],
    ),
  ]),
);
const doubleJumpToggle = document.getElementById("doubleJumpToggle");
const doubleJumpStatus = document.getElementById("doubleJumpStatus");
const doubleJumpHint = document.getElementById("doubleJumpHint");
const pauseOverlay = document.getElementById("pauseOverlay");
const pauseButton = document.getElementById("pauseButton");

const game = {
  status: "menu",
  score: 0,
  bonusScore: 0,
  distance: 0,
  elapsed: 0,
  speed: 330,
  highScore: 0,
  settings: { doubleJump: true },
  player: null,
  obstacles: [],
  particles: [],
  stars: [],
  nextSpawn: 1.4,
  lastTime: 0,
  animationId: null,
  shake: 0,
  flash: 0,
};

class Player {
  constructor() {
    Object.assign(this, {
      x: 170,
      y: GROUND_Y - 42,
      width: 72,
      height: 42,
      vy: 0,
      jumps: 0,
      coyote: 0,
      squash: 0,
    });
  }
  get grounded() {
    return this.y + this.height >= GROUND_Y - 0.5;
  }
  jump() {
    const maxJumps = game.settings.doubleJump ? 2 : 1;
    const canGroundJump = this.grounded && this.vy >= 0;
    if (canGroundJump || this.coyote > 0 || this.jumps < maxJumps) {
      this.vy = -700;
      this.jumps += 1;
      this.coyote = 0;
      this.squash = 1;
      burst(this.x + 10, this.y + this.height - 4, 8, "#00f5ff", 120);
      sound("jump");
    }
  }
  fastFall() {
    if (!this.grounded && this.vy < 300) this.vy = 300;
  }
  update(dt) {
    const wasGrounded = this.grounded;
    if (!wasGrounded) this.coyote = Math.max(0, this.coyote - dt);
    this.vy += 1850 * dt;
    this.y += this.vy * dt;
    if (this.y + this.height >= GROUND_Y) {
      if (!wasGrounded && this.vy > 300)
        burst(this.x + 18, GROUND_Y - 6, 12, "#ff006e", 145);
      this.y = GROUND_Y - this.height;
      this.vy = 0;
      this.jumps = 0;
      this.coyote = 0.09;
    }
    this.squash = Math.max(0, this.squash - dt * 4);
  }
  draw() {
    const lift = Math.min(8, Math.abs(this.vy) / 95),
      y = this.y + lift;
    const pulse = 1 + Math.sin(game.elapsed * 9) * 0.08;
    ctx.save();
    ctx.translate(this.x, y);

    // Halo et ombre portée : la voiture reste identifiable sur toutes les couleurs du décor.
    const aura = ctx.createRadialGradient(36, 25, 4, 36, 25, 62 * pulse);
    aura.addColorStop(0, "rgba(55,246,255,.42)");
    aura.addColorStop(0.45, "rgba(255,61,157,.2)");
    aura.addColorStop(1, "rgba(55,246,255,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(-28, -36, 130, 118);
    ctx.fillStyle = "rgba(55,246,255,.35)";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#37f6ff";
    ctx.beginPath();
    ctx.ellipse(37, this.height + 3, 46, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Réacteur et faisceau avant.
    const flame = ctx.createLinearGradient(-30, 0, 8, 0);
    flame.addColorStop(0, "rgba(55,246,255,0)");
    flame.addColorStop(0.4, "#37f6ff");
    flame.addColorStop(1, "#fff6a8");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(8, 22);
    ctx.lineTo(-27 - pulse * 5, 27);
    ctx.lineTo(8, 33);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,232,107,.18)";
    ctx.beginPath();
    ctx.moveTo(69, 23);
    ctx.lineTo(118, 17);
    ctx.lineTo(118, 37);
    ctx.lineTo(69, 31);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 28;
    ctx.shadowColor = "#ff3d9d";
    ctx.lineJoin = "round";
    const body = ctx.createLinearGradient(0, 0, 0, this.height);
    body.addColorStop(0, "#fff2fb");
    body.addColorStop(0.16, "#ff8dcc");
    body.addColorStop(0.55, "#ff147a");
    body.addColorStop(1, "#7500a8");
    ctx.beginPath();
    ctx.moveTo(4, this.height - 4);
    ctx.lineTo(9, 18);
    ctx.lineTo(24, 6);
    ctx.lineTo(51, 6);
    ctx.lineTo(66, 19);
    ctx.lineTo(72, this.height - 4);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#16072f";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "#37f6ff";
    ctx.stroke();

    // Verrière, roues et lumières à fort contraste.
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#091846";
    ctx.strokeStyle = "#37f6ff";
    ctx.lineWidth = 2;
    ctx.fillRect(24, 12, 28, 13);
    ctx.strokeRect(24, 12, 28, 13);
    ctx.fillStyle = "#c9fbff";
    ctx.fillRect(28, 15, 20, 3);
    ctx.fillStyle = "#fff06a";
    ctx.shadowColor = "#fff06a";
    ctx.fillRect(66, 24, 7, 7);
    ctx.fillStyle = "#10062c";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#37f6ff";
    ctx.fillRect(11, this.height - 6, 18, 9);
    ctx.fillRect(49, this.height - 6, 18, 9);
    ctx.fillStyle = "#37f6ff";
    ctx.fillRect(15, this.height - 4, 10, 3);
    ctx.fillRect(53, this.height - 4, 10, 3);

    // Petit repère joueur, visible mais assez discret pour ne pas masquer les obstacles.
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#37f6ff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(29, -10);
    ctx.lineTo(36, -3);
    ctx.lineTo(43, -10);
    ctx.stroke();
    ctx.restore();
  }
}

class Obstacle {
  constructor(type) {
    this.type = type;
    this.x = W + 40;
    this.scored = false;
    if (type === "barrier") {
      this.width = 44 + Math.random() * 24;
      this.height = 54 + Math.random() * 34;
      this.y = GROUND_Y - this.height;
      this.color = Math.random() > 0.5 ? "#ff006e" : "#ffbe0b";
    } else {
      this.width = 66;
      this.height = 28;
      this.y = 290 + Math.random() * 45;
      this.color = "#00f5ff";
    }
  }
  update(dt) {
    this.x -= game.speed * dt;
  }
  hitbox() {
    return this.type === "barrier"
      ? { x: this.x + 5, y: this.y + 4, w: this.width - 10, h: this.height - 4 }
      : {
          x: this.x + 6,
          y: this.y + 7,
          w: this.width - 12,
          h: this.height - 14,
        };
  }
  draw() {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = this.color;
    if (this.type === "barrier") {
      const gradient = ctx.createLinearGradient(
        this.x,
        this.y,
        this.x,
        GROUND_Y,
      );
      gradient.addColorStop(0, "#fff3a5");
      gradient.addColorStop(0.15, this.color);
      gradient.addColorStop(1, "#5c003c");
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.fillStyle = "rgba(10,14,39,.75)";
      for (let y = this.y + 12; y < GROUND_Y; y += 16)
        ctx.fillRect(this.x + 3, y, this.width - 6, 5);
    } else {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y + 9, this.width, 10);
      ctx.fillStyle = "#eaffff";
      ctx.fillRect(this.x + 12, this.y + 12, this.width - 24, 3);
      ctx.fillStyle = "#ff006e";
      ctx.fillRect(this.x + this.width - 8, this.y + 7, 7, 14);
    }
    ctx.restore();
  }
}

function makeStars() {
  game.stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: Math.random() * 255,
    size: Math.random() * 1.8 + 0.4,
    alpha: Math.random() * 0.75 + 0.2,
  }));
}
function burst(x, y, count, color, velocity) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2,
      speed = velocity * (0.35 + Math.random() * 0.65);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.35,
      maxLife: 0.65,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}
function overlaps(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
function playerHitbox() {
  return {
    x: game.player.x + 9,
    y: game.player.y + 8,
    w: game.player.width - 18,
    h: game.player.height - 10,
  };
}
function spawnObstacle() {
  game.obstacles.push(
    new Obstacle(
      game.elapsed > 12 && Math.random() < 0.28 ? "drone" : "barrier",
    ),
  );
  game.nextSpawn =
    Math.max(0.72, 1.18 - game.elapsed * 0.008) + Math.random() * 0.52;
}

function update(dt) {
  if (game.status !== "running") return;
  game.elapsed += dt;
  game.speed = Math.min(620, 330 + game.elapsed * 8.5);
  game.distance += game.speed * dt * 0.024;
  game.score = Math.floor(game.distance * 10) + game.bonusScore;
  game.player.update(dt);
  game.nextSpawn -= dt;
  if (game.nextSpawn <= 0) spawnObstacle();
  game.obstacles.forEach((obstacle) => {
    obstacle.update(dt);
    if (!obstacle.scored && obstacle.x + obstacle.width < game.player.x) {
      obstacle.scored = true;
      game.bonusScore += 25;
      game.score += 25;
      burst(obstacle.x + obstacle.width / 2, obstacle.y, 6, "#ffbe0b", 80);
    }
  });
  game.obstacles = game.obstacles.filter(
    (obstacle) => obstacle.x + obstacle.width > -30,
  );
  if (
    game.obstacles.some((obstacle) =>
      overlaps(playerHitbox(), obstacle.hitbox()),
    )
  )
    finishGame();
  game.particles = game.particles.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 380 * dt;
    return p.life > 0;
  });
  game.shake = Math.max(0, game.shake - dt * 25);
  game.flash = Math.max(0, game.flash - dt * 2.7);
}

function drawGrid() {
  const horizon = GROUND_Y,
    scroll = (game.distance * 6) % 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, W, H - horizon);
  ctx.clip();
  const floor = ctx.createLinearGradient(0, horizon, 0, H);
  floor.addColorStop(0, "#341063");
  floor.addColorStop(1, "#120b42");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.lineWidth = 2;
  for (let i = 1; i < 13; i += 1) {
    const t = (i / 12 + scroll) % 1,
      y = horizon + t * t * (H - horizon + 60);
    ctx.strokeStyle = i % 2 ? "rgba(255,48,156,.92)" : "rgba(121,73,255,.8)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(55,246,255,.78)";
  for (let i = -10; i <= 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(W / 2, horizon);
    ctx.lineTo(W / 2 + i * 118, H);
    ctx.stroke();
  }
  ctx.restore();
}
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#17104b");
  sky.addColorStop(0.42, "#49247d");
  sky.addColorStop(0.72, "#e23891");
  sky.addColorStop(1, "#251057");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const horizonGlow = ctx.createRadialGradient(
    W * 0.62,
    330,
    20,
    W * 0.62,
    330,
    390,
  );
  horizonGlow.addColorStop(0, "rgba(255,222,122,.48)");
  horizonGlow.addColorStop(0.35, "rgba(255,74,166,.25)");
  horizonGlow.addColorStop(1, "rgba(55,246,255,0)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 0, W, H);
  game.stars.forEach((star) => {
    ctx.fillStyle = `rgba(222,245,255,${star.alpha})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
  const sx = W * 0.69,
    sy = 180,
    radius = 108,
    sun = ctx.createLinearGradient(sx, sy - radius, sx, sy + radius);
  sun.addColorStop(0, "#fff6a8");
  sun.addColorStop(0.38, "#ffc45c");
  sun.addColorStop(1, "#ff3d9d");
  ctx.save();
  ctx.shadowBlur = 45;
  ctx.shadowColor = "#ffca63";
  ctx.beginPath();
  ctx.arc(sx, sy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#7d296f";
  for (let y = sy - 35; y < sy + radius; y += 15)
    ctx.fillRect(sx - radius, y, radius * 2, 5);
  ctx.restore();
  const mountains = ctx.createLinearGradient(0, 185, 0, GROUND_Y);
  mountains.addColorStop(0, "#7338a8");
  mountains.addColorStop(1, "#29105f");
  ctx.fillStyle = mountains;
  ctx.beginPath();
  ctx.moveTo(0, 310);
  ctx.lineTo(130, 205);
  ctx.lineTo(250, 307);
  ctx.lineTo(370, 175);
  ctx.lineTo(520, 309);
  ctx.lineTo(650, 215);
  ctx.lineTo(790, 310);
  ctx.lineTo(W, 190);
  ctx.lineTo(W, GROUND_Y);
  ctx.lineTo(0, GROUND_Y);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,251,255,.95)";
  ctx.lineWidth = 3;
  ctx.shadowBlur = 12;
  ctx.shadowColor = "#37f6ff";
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(20,11,65,.88)";
  for (let x = 0; x < W; x += 48) {
    const height = 20 + ((x * 17) % 74);
    ctx.fillRect(x, GROUND_Y - height, 34, height);
    ctx.fillStyle = "#ffd84d";
    for (let y = GROUND_Y - height + 10; y < GROUND_Y - 5; y += 14)
      ctx.fillRect(x + 7, y, 4, 5);
    ctx.fillStyle = "rgba(20,11,65,.88)";
  }
  drawGrid();
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(
    (Math.random() - 0.5) * game.shake,
    (Math.random() - 0.5) * game.shake,
  );
  drawBackground();
  game.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
  if (game.player) game.player.draw();
  game.obstacles.forEach((obstacle) => obstacle.draw());
  ctx.restore();
  if (game.flash) {
    ctx.fillStyle = `rgba(255,0,110,${game.flash * 0.32})`;
    ctx.fillRect(0, 0, W, H);
  }
  ui.score.textContent = String(game.score).padStart(5, "0");
  ui.speed.textContent = `${(game.speed / 330).toFixed(1)}x`;
}
function loop(time) {
  const dt = Math.min(0.035, (time - game.lastTime) / 1000 || 0);
  game.lastTime = time;
  update(dt);
  draw();
  game.animationId = requestAnimationFrame(loop);
}
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((screen) =>
      screen.classList.toggle("screen-active", screen.id === id),
    );
}
function setPauseVisible(visible) {
  pauseOverlay.hidden = !visible;
  pauseButton.setAttribute("aria-expanded", String(visible));
}
function pauseGame() {
  if (game.status !== "running") return;
  game.status = "paused";
  setPauseVisible(true);
}
function resumeGame() {
  if (game.status !== "paused") return;
  game.status = "running";
  game.lastTime = performance.now();
  setPauseVisible(false);
}
function returnToMenu() {
  game.status = "menu";
  setPauseVisible(false);
  showScreen("menuScreen");
  ui.highScore.textContent = game.highScore;
  game.player = null;
  game.obstacles = [];
  game.particles = [];
  if (game.animationId) {
    cancelAnimationFrame(game.animationId);
    game.animationId = null;
  }
}
function startGame() {
  window.ArcadeGameSession?.start({ source: "start_button" });
  Object.assign(game, {
    status: "running",
    score: 0,
    bonusScore: 0,
    distance: 0,
    elapsed: 0,
    speed: 330,
    player: new Player(),
    obstacles: [],
    particles: [],
    nextSpawn: 1.3,
    shake: 0,
    flash: 0,
  });
  setPauseVisible(false);
  showScreen("gameScreen");
  if (!game.animationId) {
    game.lastTime = performance.now();
    game.animationId = requestAnimationFrame(loop);
  }
}
function finishGame() {
  if (game.status !== "running") return;
  game.status = "over";
  window.ArcadeGameSession?.completeByScore(game.score, {
    distance: Math.floor(game.distance),
  });
  game.shake = 16;
  game.flash = 1;
  burst(game.player.x + 35, game.player.y + 21, 36, "#ffbe0b", 340);
  sound("crash");
  if (navigator.vibrate) navigator.vibrate([70, 30, 100]);
  const newRecord = game.score > game.highScore;
  if (newRecord) {
    game.highScore = game.score;
    localStorage.setItem(STORAGE_KEY, String(game.highScore));
  }
  ui.record.hidden = !newRecord;
  ui.finalScore.textContent = game.score;
  ui.finalDistance.textContent = Math.floor(game.distance);
  ui.finalSpeed.textContent = (game.speed / 330).toFixed(1);
  window.setTimeout(() => showScreen("gameOverScreen"), 420);
}
function loadHighScore() {
  const saved = Number.parseInt(localStorage.getItem(STORAGE_KEY), 10);
  game.highScore = Number.isFinite(saved) ? saved : 0;
  ui.highScore.textContent = game.highScore;
}
function syncDoubleJumpSetting(save = true) {
  game.settings.doubleJump = doubleJumpToggle.checked;
  doubleJumpStatus.textContent = game.settings.doubleJump
    ? "ACTIVÉ"
    : "DÉSACTIVÉ";
  doubleJumpHint.textContent = game.settings.doubleJump
    ? "🌀 Double saut activé"
    : "↟ Saut simple activé";
  if (save)
    localStorage.setItem(SETTINGS_KEY, String(game.settings.doubleJump));
}
function loadSettings() {
  doubleJumpToggle.checked = localStorage.getItem(SETTINGS_KEY) !== "false";
  syncDoubleJumpSetting(false);
}
let audioContext;
function sound(kind) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain(),
      now = audioContext.currentTime;
    oscillator.type = kind === "crash" ? "sawtooth" : "square";
    oscillator.frequency.setValueAtTime(kind === "crash" ? 160 : 330, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === "crash" ? 45 : 660,
      now + (kind === "crash" ? 0.25 : 0.09),
    );
    gain.gain.setValueAtTime(kind === "crash" ? 0.09 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + (kind === "crash" ? 0.28 : 0.11),
    );
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + (kind === "crash" ? 0.28 : 0.11));
  } catch {
    /* Audio is optional. */
  }
}
function handleAction(event) {
  if (event?.target?.closest("button")) return;
  if (game.status === "running") game.player.jump();
}
document.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
    event.preventDefault();
    handleAction();
  }
  if (["ArrowDown", "KeyS"].includes(event.code) && game.status === "running") {
    event.preventDefault();
    game.player.fastFall();
  }
  if (["Escape", "KeyP"].includes(event.code) && game.status === "running") {
    event.preventDefault();
    pauseGame();
  } else if (
    ["Escape", "KeyP"].includes(event.code) &&
    game.status === "paused"
  ) {
    event.preventDefault();
    resumeGame();
  }
});
let touchY = 0;
canvas.addEventListener("pointerdown", (event) => {
  touchY = event.clientY;
  handleAction(event);
});
canvas.addEventListener("pointerup", (event) => {
  if (game.status === "running" && event.clientY - touchY > 35)
    game.player.fastFall();
});
doubleJumpToggle.addEventListener("change", () => syncDoubleJumpSetting(true));
pauseButton.addEventListener("click", pauseGame);
document.getElementById("resumeButton").addEventListener("click", resumeGame);
document
  .getElementById("pauseMenuButton")
  .addEventListener("click", returnToMenu);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.status === "running") pauseGame();
});
document.getElementById("startButton").addEventListener("click", startGame);
document.getElementById("restartButton").addEventListener("click", startGame);
document.getElementById("menuButton").addEventListener("click", returnToMenu);
loadHighScore();
loadSettings();
makeStars();
draw();
showScreen("menuScreen");
