document.addEventListener("DOMContentLoaded", () => {
  const GRID_W = 50;
  const GRID_H = 50;
  const TICK_MS = 88;
  const CRASH_DURATION = 680;
  const PLAYER_COLOR = "#2ff5ff";
  const CPU_COLOR = "#ff5c39";
  const OBSTACLE_COLOR = "#9c6cff";

  const AI_PROFILES = {
    easy: {
      label: "PROTOCOLE COOL",
      cadence: 3,
      lookAhead: 2,
      floodDepth: 60,
      aggression: 0,
    },
    medium: {
      label: "PROTOCOLE TACTIQUE",
      cadence: 1,
      lookAhead: 7,
      floodDepth: 260,
      aggression: 0.2,
    },
    hardcore: {
      label: "PROTOCOLE PRÉDATEUR",
      cadence: 1,
      lookAhead: 11,
      floodDepth: 900,
      aggression: 0.85,
    },
  };

  function loadGlobalWins() {
    try {
      return Number.parseInt(localStorage.getItem("cyber_lightcycle_wins"), 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  const STATE = {
    mode: "menu",
    difficulty: "easy",
    scorePlayer: 0,
    scoreCPU: 0,
    globalWins: loadGlobalWins(),
    roundNumber: 1,
    tickMs: TICK_MS,
    tickCount: 0,
    lastTick: 0,
    lastRender: 0,
    crashEndsAt: 0,
    pendingOutcome: null,
    board: [],
    obstacles: [],
    particles: [],
    impacts: [],
    arenaSize: 0,
  };

  const DOM = {
    canvas: document.getElementById("game-canvas"),
    ctx: document.getElementById("game-canvas").getContext("2d"),
    stage: document.getElementById("game-stage"),
    wrapper: document.getElementById("canvas-wrapper"),
    hud: document.getElementById("hud"),
    hudPlayer: document.getElementById("hud-player"),
    hudCPU: document.getElementById("hud-cpu"),
    hudRound: document.getElementById("hud-round"),
    hudStatus: document.getElementById("hud-status"),
    cpuLevelLabel: document.getElementById("cpu-level-label"),
    menuOverlay: document.getElementById("menu-overlay"),
    resultOverlay: document.getElementById("result-overlay"),
    resultCard: document.querySelector(".result-card"),
    resultKicker: document.getElementById("result-kicker"),
    resultEmblem: document.getElementById("result-emblem"),
    resultMessage: document.getElementById("result-message"),
    roundDetails: document.getElementById("round-details"),
    scorePlayer: document.getElementById("score-player"),
    scoreCPU: document.getElementById("score-cpu"),
    playerPips: Array.from(document.querySelectorAll("#player-pips i")),
    cpuPips: Array.from(document.querySelectorAll("#cpu-pips i")),
    globalWins: document.getElementById("global-wins"),
    mobileControls: document.getElementById("mobile-controls"),
    nextButton: document.getElementById("btn-next"),
  };

  let cellSize = 1;
  let pixelRatio = 1;
  let player = null;
  let cpu = null;
  let animationFrame = null;
  let touchStartX = 0;
  let touchStartY = 0;

  DOM.globalWins.textContent = STATE.globalWins;

  // ---------------------------------------------------------------------------
  // Arena sizing: canvas pixels, CSS pixels and visible borders share one edge.
  // ---------------------------------------------------------------------------
  function resizeArena() {
    if (STATE.mode === "playing" || STATE.mode === "crashing") {
      DOM.mobileControls.classList.toggle("hidden", window.innerWidth > 680);
    }
    const stageRect = DOM.stage.getBoundingClientRect();
    const outerSize = Math.max(1, Math.floor(Math.min(stageRect.width, stageRect.height)));
    DOM.wrapper.style.width = `${outerSize}px`;
    DOM.wrapper.style.height = `${outerSize}px`;

    const cssWidth = DOM.wrapper.clientWidth;
    const cssHeight = DOM.wrapper.clientHeight;
    const size = Math.max(1, Math.floor(Math.min(cssWidth, cssHeight)));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    DOM.canvas.width = Math.round(size * pixelRatio);
    DOM.canvas.height = Math.round(size * pixelRatio);
    DOM.canvas.style.width = `${size}px`;
    DOM.canvas.style.height = `${size}px`;
    DOM.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    STATE.arenaSize = size;
    cellSize = size / GRID_W;
    render();
  }

  window.addEventListener("resize", resizeArena);
  document.fonts?.ready?.then(resizeArena);

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------
  const Audio = {
    ctx: null,
    engineOsc: null,
    engineGain: null,

    init() {
      try {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch (error) {
        this.ctx = null;
      }
    },

    tone(frequency, duration, type = "sine", volume = 0.08) {
      if (!this.ctx) return;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.ctx.destination);
      oscillator.start();
      oscillator.stop(this.ctx.currentTime + duration);
    },

    startEngine() {
      if (!this.ctx) return;
      this.stopEngine();
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 42;
      this.engineGain.gain.value = 0.035;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    },

    stopEngine() {
      if (!this.engineOsc) return;
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      } catch (error) {
        // The oscillator may already be stopped during a rapid restart.
      }
      this.engineOsc = null;
      this.engineGain = null;
    },

    playTurn() {
      this.tone(780, 0.07, "sine", 0.055);
    },

    playCrash() {
      if (!this.ctx) return;
      const duration = 0.42;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < bufferSize; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      noise.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1300, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.26, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
      this.tone(76, 0.38, "square", 0.1);
    },
  };

  function triggerVibrate(pattern = [70, 30, 90]) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ---------------------------------------------------------------------------
  // Board, layouts and entities
  // ---------------------------------------------------------------------------
  function createEmptyBoard() {
    return Array.from({ length: GRID_W }, () => Array(GRID_H).fill(0));
  }

  function addObstacle(x, y) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    if ((x < 14 || x > 36) && Math.abs(y - 25) < 3) return;
    if (STATE.board[x][y] !== 0) return;
    STATE.board[x][y] = 3;
    STATE.obstacles.push({ x, y });
  }

  function addHorizontal(y, startX, endX) {
    for (let x = startX; x <= endX; x += 1) addObstacle(x, y);
  }

  function addVertical(x, startY, endY) {
    for (let y = startY; y <= endY; y += 1) addObstacle(x, y);
  }

  function buildArenaLayout() {
    STATE.obstacles = [];
    if (STATE.difficulty === "easy") return;

    const pattern = (STATE.roundNumber - 1) % 3;
    if (pattern === 0) {
      addVertical(23, 7, 17);
      addVertical(26, 32, 42);
      addHorizontal(20, 8, 16);
      addHorizontal(29, 33, 41);
    } else if (pattern === 1) {
      addVertical(15, 10, 19);
      addVertical(34, 30, 39);
      addHorizontal(14, 28, 38);
      addHorizontal(35, 11, 21);
    } else {
      addHorizontal(18, 17, 23);
      addHorizontal(18, 27, 33);
      addHorizontal(31, 17, 23);
      addHorizontal(31, 27, 33);
      addVertical(17, 19, 23);
      addVertical(32, 26, 30);
    }

    if (STATE.difficulty !== "hardcore") return;

    if (pattern === 0) {
      addHorizontal(12, 33, 40);
      addHorizontal(37, 9, 16);
      addVertical(11, 13, 18);
      addVertical(38, 31, 36);
    } else if (pattern === 1) {
      addHorizontal(24, 20, 23);
      addHorizontal(25, 26, 29);
      addVertical(20, 25, 29);
      addVertical(29, 20, 24);
    } else {
      addVertical(24, 6, 13);
      addVertical(25, 36, 43);
      addHorizontal(10, 7, 13);
      addHorizontal(39, 36, 42);
    }
  }

  class Lightcycle {
    constructor(x, y, dx, dy, color, isPlayer) {
      this.x = x;
      this.y = y;
      this.dx = dx;
      this.dy = dy;
      this.nextDx = dx;
      this.nextDy = dy;
      this.color = color;
      this.isPlayer = isPlayer;
      this.alive = true;
      this.trail = [];
    }

    setDirection(dx, dy) {
      if (!this.alive) return;
      if (this.dx === -dx && this.dy === -dy) return;
      if (this.nextDx === dx && this.nextDy === dy) return;
      this.nextDx = dx;
      this.nextDy = dy;
      if (this.isPlayer) Audio.playTurn();
    }

    applyQueuedDirection() {
      this.dx = this.nextDx;
      this.dy = this.nextDy;
    }

    markCurrentCell() {
      if (!this.alive || !isInside(this.x, this.y)) return;
      this.trail.push({ x: this.x, y: this.y });
      STATE.board[this.x][this.y] = this.isPlayer ? 1 : 2;
    }

    nextCell() {
      return { x: this.x + this.dx, y: this.y + this.dy };
    }
  }

  function isInside(x, y) {
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  }

  function isSafe(x, y) {
    if (!isInside(x, y) || STATE.board[x][y] !== 0) return false;
    if (player?.alive && player.x === x && player.y === y) return false;
    if (cpu?.alive && cpu.x === x && cpu.y === y) return false;
    return true;
  }

  function initRound() {
    cancelAnimationFrame(animationFrame);
    STATE.board = createEmptyBoard();
    STATE.particles = [];
    STATE.impacts = [];
    STATE.tickMs = TICK_MS;
    STATE.tickCount = 0;
    STATE.pendingOutcome = null;
    buildArenaLayout();

    player = new Lightcycle(9, Math.floor(GRID_H / 2), 1, 0, PLAYER_COLOR, true);
    cpu = new Lightcycle(40, Math.floor(GRID_H / 2), -1, 0, CPU_COLOR, false);

    STATE.mode = "playing";
    STATE.lastTick = performance.now();
    STATE.lastRender = STATE.lastTick;
    DOM.resultOverlay.classList.add("hidden");
    DOM.wrapper.classList.remove("shake");
    DOM.hudRound.textContent = `MANCHE ${String(STATE.roundNumber).padStart(2, "0")}`;
    setHudStatus("EN COURSE", "live");
    updateActiveRider();

    Audio.init();
    Audio.startEngine();
    resizeArena();
    animationFrame = requestAnimationFrame(gameLoop);
  }

  // ---------------------------------------------------------------------------
  // Atomic movement and pixel-precise grid collision
  // ---------------------------------------------------------------------------
  function cellIsBlocked(cell) {
    return !isInside(cell.x, cell.y) || STATE.board[cell.x][cell.y] !== 0;
  }

  function getCollisionFlags(nextPlayer, nextCPU) {
    let playerCrash = cellIsBlocked(nextPlayer);
    let cpuCrash = cellIsBlocked(nextCPU);

    if (
      !playerCrash &&
      !cpuCrash &&
      nextPlayer.x === nextCPU.x &&
      nextPlayer.y === nextCPU.y
    ) {
      playerCrash = true;
      cpuCrash = true;
    }

    return { playerCrash, cpuCrash };
  }

  function advanceCycles() {
    if (!player.alive || !cpu.alive) return;

    updateAI();
    player.applyQueuedDirection();
    cpu.applyQueuedDirection();

    // Origins become solid trail before either destination is evaluated.
    player.markCurrentCell();
    cpu.markCurrentCell();

    const nextPlayer = player.nextCell();
    const nextCPU = cpu.nextCell();
    // One shared destination is resolved in this tick, before either head is drawn.
    const { playerCrash, cpuCrash } = getCollisionFlags(nextPlayer, nextCPU);

    if (!playerCrash) {
      player.x = nextPlayer.x;
      player.y = nextPlayer.y;
    }
    if (!cpuCrash) {
      cpu.x = nextCPU.x;
      cpu.y = nextCPU.y;
    }

    if (playerCrash) crashCycle(player, nextPlayer);
    if (cpuCrash) crashCycle(cpu, nextCPU);

    STATE.tickCount += 1;
    if (playerCrash || cpuCrash) {
      beginCrashSequence(playerCrash, cpuCrash);
    }
  }

  function crashCycle(cycle, impactCell) {
    cycle.alive = false;
    const x = Math.max(0, Math.min(GRID_W - 1, impactCell.x));
    const y = Math.max(0, Math.min(GRID_H - 1, impactCell.y));
    createExplosion(x, y, cycle.color);
  }

  function beginCrashSequence(playerCrash, cpuCrash) {
    if (STATE.mode !== "playing") return;
    STATE.mode = "crashing";
    STATE.crashEndsAt = performance.now() + CRASH_DURATION;
    STATE.pendingOutcome = playerCrash && cpuCrash
      ? "draw"
      : cpuCrash
        ? "win"
        : "lose";
    setHudStatus("IMPACT", "impact");
    Audio.stopEngine();
    Audio.playCrash();
    triggerVibrate();
    DOM.wrapper.classList.remove("shake");
    void DOM.wrapper.offsetWidth;
    DOM.wrapper.classList.add("shake");
  }

  // ---------------------------------------------------------------------------
  // AI: difficulty changes decisions and pressure, never movement speed.
  // ---------------------------------------------------------------------------
  const CARDINAL_MOVES = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  function updateAI() {
    if (!cpu.alive) return;
    const profile = AI_PROFILES[STATE.difficulty];
    const validMoves = CARDINAL_MOVES.filter(
      (move) => !(move.dx === -cpu.dx && move.dy === -cpu.dy),
    );
    const safeMoves = validMoves.filter((move) =>
      isSafe(cpu.x + move.dx, cpu.y + move.dy),
    );
    if (!safeMoves.length) return;

    const forwardSafe = isSafe(cpu.x + cpu.dx, cpu.y + cpu.dy);
    const shouldThink = STATE.tickCount % profile.cadence === 0;
    if (forwardSafe && !shouldThink) return;

    let chosenMove;
    if (STATE.difficulty === "easy") {
      const forward = safeMoves.find((move) => move.dx === cpu.dx && move.dy === cpu.dy);
      chosenMove = forward && Math.random() > 0.16
        ? forward
        : safeMoves[Math.floor(Math.random() * safeMoves.length)];
    } else {
      chosenMove = chooseStrategicMove(safeMoves, profile);
    }

    cpu.setDirection(chosenMove.dx, chosenMove.dy);
  }

  function chooseStrategicMove(moves, profile) {
    let bestScore = -Infinity;
    let bestMoves = [];

    moves.forEach((move) => {
      const nextX = cpu.x + move.dx;
      const nextY = cpu.y + move.dy;
      let score = straightRunLength(nextX, nextY, move, profile.lookAhead) * 4;
      score += floodFill(nextX, nextY, profile.floodDepth) * 0.08;

      const wallDistance = Math.min(nextX, GRID_W - 1 - nextX, nextY, GRID_H - 1 - nextY);
      score += Math.min(wallDistance, 7) * 0.35;

      if (profile.aggression > 0 && player.alive) {
        const currentDistance = Math.abs(cpu.x - player.x) + Math.abs(cpu.y - player.y);
        const nextDistance = Math.abs(nextX - player.x) + Math.abs(nextY - player.y);
        score += (currentDistance - nextDistance) * 5 * profile.aggression;
        score += pressureScore(nextX, nextY) * profile.aggression;
      }

      score += Math.random() * 0.6;
      if (score > bestScore + 0.01) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) <= 0.01) {
        bestMoves.push(move);
      }
    });

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function straightRunLength(startX, startY, move, maxDistance) {
    let x = startX;
    let y = startY;
    let distance = 0;
    for (let step = 0; step < maxDistance; step += 1) {
      if (!isSafe(x, y)) break;
      distance += 1;
      x += move.dx;
      y += move.dy;
    }
    return distance;
  }

  function pressureScore(x, y) {
    const predictedX = player.x + player.dx * 3;
    const predictedY = player.y + player.dy * 3;
    const distance = Math.abs(x - predictedX) + Math.abs(y - predictedY);
    return Math.max(0, 12 - distance);
  }

  function floodFill(startX, startY, maxDepth) {
    if (!isSafe(startX, startY)) return 0;
    const visited = Array.from({ length: GRID_W }, () => Array(GRID_H).fill(false));
    const queueX = [startX];
    const queueY = [startY];
    let head = 0;
    let count = 0;
    visited[startX][startY] = true;

    while (head < queueX.length && count < maxDepth) {
      const x = queueX[head];
      const y = queueY[head];
      head += 1;
      count += 1;

      for (const move of CARDINAL_MOVES) {
        const nextX = x + move.dx;
        const nextY = y + move.dy;
        if (
          isInside(nextX, nextY) &&
          !visited[nextX][nextY] &&
          STATE.board[nextX][nextY] === 0 &&
          !(player.alive && player.x === nextX && player.y === nextY)
        ) {
          visited[nextX][nextY] = true;
          queueX.push(nextX);
          queueY.push(nextY);
        }
      }
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // Rendering and impact feedback
  // ---------------------------------------------------------------------------
  function createExplosion(gridX, gridY, color) {
    const x = (gridX + 0.5) * cellSize;
    const y = (gridY + 0.5) * cellSize;
    const particleCount = 30;
    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.2;
      const speed = cellSize * (0.22 + Math.random() * 0.62);
      STATE.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: Math.max(1, cellSize * (0.16 + Math.random() * 0.22)),
        color,
      });
    }
    STATE.impacts.push({ x, y, radius: cellSize * 0.4, life: 1, color });
  }

  function drawArenaGrid() {
    const size = STATE.arenaSize;
    DOM.ctx.fillStyle = "#030611";
    DOM.ctx.fillRect(0, 0, size, size);

    DOM.ctx.save();
    DOM.ctx.lineWidth = 0.55;
    for (let index = 1; index < GRID_W; index += 1) {
      const position = index * cellSize;
      const major = index % 5 === 0;
      DOM.ctx.strokeStyle = major
        ? "rgba(47, 245, 255, 0.14)"
        : "rgba(113, 207, 255, 0.045)";
      DOM.ctx.beginPath();
      DOM.ctx.moveTo(position, 0);
      DOM.ctx.lineTo(position, size);
      DOM.ctx.stroke();
      DOM.ctx.beginPath();
      DOM.ctx.moveTo(0, position);
      DOM.ctx.lineTo(size, position);
      DOM.ctx.stroke();
    }

    DOM.ctx.fillStyle = "rgba(47, 245, 255, 0.17)";
    for (let x = 5; x < GRID_W; x += 5) {
      for (let y = 5; y < GRID_H; y += 5) {
        DOM.ctx.fillRect(x * cellSize - 0.7, y * cellSize - 0.7, 1.4, 1.4);
      }
    }
    DOM.ctx.restore();
  }

  function cellRect(x, y) {
    const left = x * cellSize;
    const top = y * cellSize;
    return {
      left,
      top,
      width: (x + 1) * cellSize - left,
      height: (y + 1) * cellSize - top,
    };
  }

  function drawObstacle(obstacle) {
    const rect = cellRect(obstacle.x, obstacle.y);
    DOM.ctx.save();
    DOM.ctx.fillStyle = "rgba(156, 108, 255, 0.42)";
    DOM.ctx.fillRect(rect.left, rect.top, rect.width + 0.2, rect.height + 0.2);
    DOM.ctx.strokeStyle = OBSTACLE_COLOR;
    DOM.ctx.lineWidth = Math.max(0.5, cellSize * 0.08);
    DOM.ctx.strokeRect(
      rect.left + cellSize * 0.16,
      rect.top + cellSize * 0.16,
      rect.width - cellSize * 0.32,
      rect.height - cellSize * 0.32,
    );
    DOM.ctx.restore();
  }

  function drawTrailCell(segment, color) {
    const rect = cellRect(segment.x, segment.y);
    const inset = Math.max(0.45, cellSize * 0.09);
    DOM.ctx.save();
    DOM.ctx.fillStyle = color;
    DOM.ctx.globalAlpha = 0.34;
    DOM.ctx.fillRect(rect.left, rect.top, rect.width + 0.16, rect.height + 0.16);
    DOM.ctx.globalAlpha = 0.92;
    DOM.ctx.fillRect(
      rect.left + inset,
      rect.top + inset,
      Math.max(1, rect.width - inset * 2),
      Math.max(1, rect.height - inset * 2),
    );
    DOM.ctx.restore();
  }

  function drawCycleHead(cycle) {
    if (!cycle?.alive) return;
    const centerX = (cycle.x + 0.5) * cellSize;
    const centerY = (cycle.y + 0.5) * cellSize;
    const radius = Math.max(2, cellSize * 0.72);
    DOM.ctx.save();
    DOM.ctx.shadowBlur = Math.max(8, cellSize * 2.4);
    DOM.ctx.shadowColor = cycle.color;
    DOM.ctx.fillStyle = cycle.color;
    DOM.ctx.translate(centerX, centerY);
    DOM.ctx.rotate(Math.atan2(cycle.dy, cycle.dx) + Math.PI / 4);
    DOM.ctx.fillRect(-radius / 2, -radius / 2, radius, radius);
    DOM.ctx.fillStyle = "#ffffff";
    DOM.ctx.globalAlpha = 0.82;
    DOM.ctx.fillRect(-radius * 0.16, -radius * 0.16, radius * 0.32, radius * 0.32);
    DOM.ctx.restore();
  }

  function drawParticles() {
    for (let index = STATE.particles.length - 1; index >= 0; index -= 1) {
      const particle = STATE.particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.95;
      particle.vy *= 0.95;
      particle.life -= 0.035;
      if (particle.life <= 0) {
        STATE.particles.splice(index, 1);
        continue;
      }
      DOM.ctx.save();
      DOM.ctx.globalAlpha = particle.life;
      DOM.ctx.fillStyle = particle.color;
      DOM.ctx.shadowBlur = 8;
      DOM.ctx.shadowColor = particle.color;
      DOM.ctx.fillRect(
        particle.x - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size,
      );
      DOM.ctx.restore();
    }
  }

  function drawImpacts() {
    for (let index = STATE.impacts.length - 1; index >= 0; index -= 1) {
      const impact = STATE.impacts[index];
      impact.radius += cellSize * 0.36;
      impact.life -= 0.045;
      if (impact.life <= 0) {
        STATE.impacts.splice(index, 1);
        continue;
      }
      DOM.ctx.save();
      DOM.ctx.globalAlpha = impact.life;
      DOM.ctx.strokeStyle = impact.color;
      DOM.ctx.lineWidth = Math.max(1, cellSize * 0.16 * impact.life);
      DOM.ctx.shadowBlur = 12;
      DOM.ctx.shadowColor = impact.color;
      DOM.ctx.beginPath();
      DOM.ctx.arc(impact.x, impact.y, impact.radius, 0, Math.PI * 2);
      DOM.ctx.stroke();
      DOM.ctx.restore();
    }
  }

  function render() {
    if (!STATE.arenaSize) return;
    DOM.ctx.clearRect(0, 0, STATE.arenaSize, STATE.arenaSize);
    drawArenaGrid();
    STATE.obstacles.forEach(drawObstacle);
    player?.trail.forEach((segment) => drawTrailCell(segment, player.color));
    cpu?.trail.forEach((segment) => drawTrailCell(segment, cpu.color));
    drawCycleHead(player);
    drawCycleHead(cpu);
    drawParticles();
    drawImpacts();
  }

  // ---------------------------------------------------------------------------
  // Main loop and results
  // ---------------------------------------------------------------------------
  function gameLoop(timestamp) {
    if (STATE.mode !== "playing" && STATE.mode !== "crashing") return;
    animationFrame = requestAnimationFrame(gameLoop);

    if (STATE.mode === "playing") {
      let steps = 0;
      while (timestamp - STATE.lastTick >= STATE.tickMs && steps < 3) {
        advanceCycles();
        STATE.lastTick += STATE.tickMs;
        steps += 1;
        if (STATE.mode !== "playing") break;
      }
      if (timestamp - STATE.lastTick > STATE.tickMs * 4) {
        STATE.lastTick = timestamp;
      }
    }

    render();

    if (STATE.mode === "crashing" && timestamp >= STATE.crashEndsAt) {
      resolveRound();
    }
  }

  function resolveRound() {
    if (STATE.mode !== "crashing") return;
    STATE.mode = "result";
    DOM.wrapper.classList.remove("shake");
    setHudStatus("PAUSE", "pause");

    if (STATE.pendingOutcome === "win") STATE.scorePlayer += 1;
    if (STATE.pendingOutcome === "lose") STATE.scoreCPU += 1;
    updateScores();

    if (STATE.scorePlayer >= 3 || STATE.scoreCPU >= 3) {
      endMatch();
      return;
    }

    const messages = {
      win: {
        title: "MANCHE GAGNÉE",
        kicker: "TRACÉ SUPÉRIEUR",
        emblem: "✓",
      },
      lose: {
        title: "SYSTÈME PRIORITAIRE",
        kicker: "SIGNAL INTERROMPU",
        emblem: "×",
      },
      draw: {
        title: "DOUBLE IMPACT",
        kicker: "COLLISION SIMULTANÉE",
        emblem: "◇",
      },
    };
    const result = messages[STATE.pendingOutcome];
    showResult({
      ...result,
      type: STATE.pendingOutcome,
      details: `SCORE // ${STATE.scorePlayer} — ${STATE.scoreCPU}`,
      matchOver: false,
    });
  }

  function endMatch() {
    const playerWon = STATE.scorePlayer >= 3;
    if (playerWon) {
      STATE.globalWins += 1;
      try {
        localStorage.setItem("cyber_lightcycle_wins", String(STATE.globalWins));
      } catch (error) {
        // The match remains playable if storage is unavailable.
      }
      DOM.globalWins.textContent = STATE.globalWins;
    }

    showResult({
      type: playerWon ? "win" : "lose",
      kicker: "MATCH TERMINÉ",
      emblem: playerWon ? "✓" : "×",
      title: playerWon ? "VICTOIRE TOTALE" : "ÉCHEC CRITIQUE",
      details: `SCORE FINAL // ${STATE.scorePlayer} — ${STATE.scoreCPU}`,
      matchOver: true,
    });
  }

  function showResult({ type, kicker, emblem, title, details, matchOver }) {
    DOM.resultCard.className = `result-card ${type}`;
    DOM.resultKicker.textContent = kicker;
    DOM.resultEmblem.firstElementChild.textContent = emblem;
    DOM.resultMessage.textContent = title;
    DOM.roundDetails.textContent = details;
    DOM.nextButton.classList.toggle("hidden", matchOver);
    DOM.resultOverlay.classList.remove("hidden");
  }

  function updateScores() {
    DOM.scorePlayer.textContent = STATE.scorePlayer;
    DOM.scoreCPU.textContent = STATE.scoreCPU;
    DOM.playerPips.forEach((pip, index) => pip.classList.toggle("filled", index < STATE.scorePlayer));
    DOM.cpuPips.forEach((pip, index) => pip.classList.toggle("filled", index < STATE.scoreCPU));
  }

  function setHudStatus(label, state) {
    DOM.hudStatus.innerHTML = `<i></i> ${label}`;
    DOM.hudStatus.dataset.state = state;
  }

  function updateActiveRider() {
    DOM.hudPlayer.classList.add("active");
    DOM.hudCPU.classList.add("active");
  }

  // ---------------------------------------------------------------------------
  // Controls and UI
  // ---------------------------------------------------------------------------
  function handleInput(direction) {
    if (STATE.mode !== "playing") return;
    const directions = {
      UP: [0, -1],
      DOWN: [0, 1],
      LEFT: [-1, 0],
      RIGHT: [1, 0],
    };
    const [dx, dy] = directions[direction];
    player.setDirection(dx, dy);
  }

  window.addEventListener("keydown", (event) => {
    const keyMap = {
      ArrowUp: "UP",
      w: "UP",
      W: "UP",
      z: "UP",
      Z: "UP",
      ArrowDown: "DOWN",
      s: "DOWN",
      S: "DOWN",
      ArrowLeft: "LEFT",
      a: "LEFT",
      A: "LEFT",
      q: "LEFT",
      Q: "LEFT",
      ArrowRight: "RIGHT",
      d: "RIGHT",
      D: "RIGHT",
    };
    const direction = keyMap[event.key];
    if (!direction) return;
    event.preventDefault();
    handleInput(direction);
  });

  DOM.canvas.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.changedTouches[0].clientX;
      touchStartY = event.changedTouches[0].clientY;
    },
    { passive: true },
  );

  DOM.canvas.addEventListener(
    "touchend",
    (event) => {
      const endX = event.changedTouches[0].clientX;
      const endY = event.changedTouches[0].clientY;
      const deltaX = endX - touchStartX;
      const deltaY = endY - touchStartY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
      handleInput(
        Math.abs(deltaX) > Math.abs(deltaY)
          ? deltaX > 0 ? "RIGHT" : "LEFT"
          : deltaY > 0 ? "DOWN" : "UP",
      );
    },
    { passive: true },
  );

  [
    ["btn-up", "UP"],
    ["btn-down", "DOWN"],
    ["btn-left", "LEFT"],
    ["btn-right", "RIGHT"],
  ].forEach(([id, direction]) => {
    document.getElementById(id).addEventListener("pointerdown", (event) => {
      event.preventDefault();
      handleInput(direction);
    });
  });

  document.querySelectorAll(".btn-diff").forEach((button) => {
    button.addEventListener("click", (event) => {
      document.querySelectorAll(".btn-diff").forEach((choice) => {
        choice.classList.toggle("active", choice === event.currentTarget);
      });
      STATE.difficulty = event.currentTarget.dataset.diff;
      DOM.cpuLevelLabel.textContent = AI_PROFILES[STATE.difficulty].label;
    });
  });

  function startMatch() {
    cancelAnimationFrame(animationFrame);
    Audio.init();
    Audio.stopEngine();
    STATE.mode = "transition";
    STATE.scorePlayer = 0;
    STATE.scoreCPU = 0;
    STATE.roundNumber = 1;
    updateScores();
    DOM.menuOverlay.classList.add("hidden");
    DOM.resultOverlay.classList.add("hidden");
    DOM.hud.classList.remove("hidden");
    DOM.cpuLevelLabel.textContent = AI_PROFILES[STATE.difficulty].label;
    DOM.mobileControls.classList.toggle("hidden", window.innerWidth > 680);
    requestAnimationFrame(initRound);
  }

  function returnToMenu() {
    cancelAnimationFrame(animationFrame);
    Audio.stopEngine();
    STATE.mode = "menu";
    player = null;
    cpu = null;
    STATE.board = [];
    STATE.obstacles = [];
    STATE.particles = [];
    STATE.impacts = [];
    DOM.hud.classList.add("hidden");
    DOM.mobileControls.classList.add("hidden");
    DOM.resultOverlay.classList.add("hidden");
    DOM.menuOverlay.classList.remove("hidden");
    requestAnimationFrame(resizeArena);
  }

  document.getElementById("btn-start").addEventListener("click", startMatch);
  document.getElementById("btn-hud-restart").addEventListener("click", startMatch);
  document.getElementById("btn-rematch").addEventListener("click", startMatch);
  document.getElementById("btn-next").addEventListener("click", () => {
    STATE.roundNumber += 1;
    initRound();
  });
  document.getElementById("btn-menu").addEventListener("click", returnToMenu);
  document.getElementById("btn-hud-menu").addEventListener("click", returnToMenu);

  resizeArena();
});
