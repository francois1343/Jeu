// ===== CONFIG =====
const CELL = 28;
const GRID_W = 22;
const GRID_H = 18;

const SPEED_START = 130;
const SPEED_INC = 3;
const SPEED_MIN = 35;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// UI layout offsets
const PAD = 20;
const CANVAS_W = GRID_W * CELL + PAD * 2;
const CANVAS_H = GRID_H * CELL + PAD * 2;

// ===== GAME STATE =====
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = null;
let score = 0;
let level = 1;
let speed = SPEED_START;
let phase = 0;
let running = true;
let paused = false;

let highScore = parseInt(localStorage.getItem("neon_highscore") || "0");

// ===== INIT =====
function initGame() {
  snake = [
    { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) },
    { x: Math.floor(GRID_W / 2) - 1, y: Math.floor(GRID_H / 2) },
    { x: Math.floor(GRID_W / 2) - 2, y: Math.floor(GRID_H / 2) },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  level = 1;
  speed = SPEED_START;
  paused = false;
  running = true;
  spawnFood();
}

function spawnFood() {
  const empty = [];
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      if (!snake.some((s) => s.x === x && s.y === y)) empty.push({ x, y });
    }
  }
  if (empty.length === 0) {
    running = false;
    return;
  }
  food = empty[Math.floor(Math.random() * empty.length)];
}

function moveSnake() {
  if (!running || paused) return;

  direction = nextDirection;

  const head = snake[0];
  const newHead = {
    x: (head.x + direction.x + GRID_W) % GRID_W,
    y: (head.y + direction.y + GRID_H) % GRID_H,
  };

  if (snake.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
    running = false;
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    score++;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("neon_highscore", highScore);
    }
    speed = Math.max(SPEED_MIN, speed - SPEED_INC);
    level = 1 + Math.floor(score / 5);
    spawnFood();
  } else {
    snake.pop();
  }
}

// ===== DRAWING =====
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Board background
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid
  ctx.strokeStyle = "#1a1f2e";
  for (let i = 0; i <= GRID_W; i++) {
    ctx.beginPath();
    ctx.moveTo(PAD + i * CELL, PAD);
    ctx.lineTo(PAD + i * CELL, PAD + GRID_H * CELL);
    ctx.stroke();
  }
  for (let j = 0; j <= GRID_H; j++) {
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + j * CELL);
    ctx.lineTo(PAD + GRID_W * CELL, PAD + j * CELL);
    ctx.stroke();
  }

  // Draw snake
  for (let i = 0; i < snake.length; i++) {
    const seg = snake[i];
    const x = PAD + seg.x * CELL + 3;
    const y = PAD + seg.y * CELL + 3;
    const size = CELL - 6;

    if (i === 0) {
      // Head glow
      ctx.fillStyle = "#00ffff44";
      ctx.beginPath();
      ctx.ellipse(x + size / 2, y + size / 2, size, size, 0, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = "#00ff9f";
      ctx.fillRect(x, y, size, size);
    } else {
      const fade = 1 - i / snake.length;
      ctx.fillStyle = fade > 0.6 ? "#00d9ff" : "#004d66";
      ctx.fillRect(x, y, size, size);
    }
  }

  // Food pulse
  if (food) {
    const base = CELL - 10;
    const pulse = Math.sin(phase * 0.1) * 3 + 4;

    ctx.fillStyle = "#ff4da6aa";
    ctx.beginPath();
    ctx.ellipse(
      PAD + food.x * CELL + CELL / 2,
      PAD + food.y * CELL + CELL / 2,
      base / 2 + pulse,
      base / 2 + pulse,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = "#ff0080";
    ctx.beginPath();
    ctx.ellipse(
      PAD + food.x * CELL + CELL / 2,
      PAD + food.y * CELL + CELL / 2,
      base / 2,
      base / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Score / header
  ctx.fillStyle = "#e0e7ff";
  ctx.font = "18px Arial";
  ctx.fillText(`Score : ${score}`, CANVAS_W + 20, 50);
  ctx.fillText(`Niveau : ${level}`, CANVAS_W + 20, 80);
  ctx.fillText(`Record : ${highScore}`, CANVAS_W + 20, 110);

  // Pause
  if (!running) {
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ff0080";
    ctx.font = "48px Arial";
    ctx.fillText("GAME OVER", CANVAS_W / 2 - 140, CANVAS_H / 2);

    ctx.font = "20px Arial";
    ctx.fillStyle = "#e0e7ff";
    ctx.fillText(
      "Appuie sur R pour rejouer",
      CANVAS_W / 2 - 140,
      CANVAS_H / 2 + 50,
    );
  }

  if (paused && running) {
    ctx.fillStyle = "#00000055";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fbbf24";
    ctx.font = "32px Arial";
    ctx.fillText("PAUSE", CANVAS_W / 2 - 60, CANVAS_H / 2);
  }
}

// ===== MAIN LOOP =====
let lastMove = 0;
function loop(ts) {
  phase++;

  if (ts - lastMove > speed) {
    moveSnake();
    lastMove = ts;
  }

  draw();
  requestAnimationFrame(loop);
}

// ===== CONTROLS =====
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if (k === "arrowup" || k === "w") {
    if (direction.y !== 1) nextDirection = { x: 0, y: -1 };
  }
  if (k === "arrowdown" || k === "s") {
    if (direction.y !== -1) nextDirection = { x: 0, y: 1 };
  }
  if (k === "arrowleft" || k === "a") {
    if (direction.x !== 1) nextDirection = { x: -1, y: 0 };
  }
  if (k === "arrowright" || k === "d") {
    if (direction.x !== -1) nextDirection = { x: 1, y: 0 };
  }

  if (k === " ") paused = !paused;

  if (k === "r") initGame();

  if (k === "q") window.close();
});

// ===== START =====
initGame();
requestAnimationFrame(loop);
