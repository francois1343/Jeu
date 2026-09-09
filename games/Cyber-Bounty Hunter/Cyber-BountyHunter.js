class AudioEngine {
  constructor() {
    this.ctx = null;
    this.alarmOsc = null;
  }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  playTone(freq, type, duration, vol, slideFreq = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideFreq)
      osc.frequency.exponentialRampToValueAtTime(
        slideFreq,
        this.ctx.currentTime + duration,
      );
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playScan() {
    this.playTone(880, "sine", 0.15, 0.1, 1200);
  }
  playSuccess() {
    this.playTone(1200, "square", 0.1, 0.1, 2000);
    setTimeout(() => this.playTone(1600, "square", 0.15, 0.1, 2400), 100);
  }
  playError() {
    this.playTone(150, "sawtooth", 0.4, 0.2, 80);
  }

  toggleAlarm(on) {
    if (!this.ctx) return;
    if (on && !this.alarmOsc) {
      this.alarmOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      this.alarmOsc.type = "square";
      this.alarmOsc.frequency.value = 600;
      // Modulation LFO pour l'effet sirène
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 5;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 200;
      lfo.connect(lfoGain);
      lfoGain.connect(this.alarmOsc.frequency);

      gain.gain.value = 0.05;
      this.alarmOsc.connect(gain);
      gain.connect(this.ctx.destination);
      this.alarmOsc.start();
      lfo.start();
      this.alarmOsc.lfo = lfo; // Référence pour stopper
    } else if (!on && this.alarmOsc) {
      this.alarmOsc.stop();
      if (this.alarmOsc.lfo) this.alarmOsc.lfo.stop();
      this.alarmOsc = null;
    }
  }
}

class CyberBounty {
  constructor() {
    this.canvas = document.getElementById("crowdCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.targetCtx = document.getElementById("targetCanvas").getContext("2d");
    this.audio = new AudioEngine();
    this.width = 0;
    this.height = 0;
    this.pixelRatio = 1;

    // Entités Cyberpunk (Emojis pour rendu performant sur Canvas)
    this.avatars = ["🤖", "👾", "👽", "💀", "🤡", "👹", "👺", "👻", "🤠", "🥶"];

    this.state = {
      isRunning: false,
      level: 1,
      score: 0,
      time: 100, // %
      maxTime: 100,
      depletionRate: 4, // % par seconde
      targetIndex: 0,
      crowd: [],
      gridSize: 0,
      laserAnim: null,
    };

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindEvents();
  }

  resize() {
    const oldWidth = this.width;
    const oldHeight = this.height;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width || window.innerWidth * 0.7));
    this.height = Math.max(1, Math.round(rect.height || window.innerHeight * 0.75));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    if (oldWidth > 1 && oldHeight > 1 && this.state.crowd.length) {
      this.state.crowd.forEach((avatar) => {
        avatar.x = Math.max(0, Math.min(this.width, avatar.x * this.width / oldWidth));
        avatar.y = Math.max(0, Math.min(this.height, avatar.y * this.height / oldHeight));
      });
    }
  }

  bindEvents() {
    document
      .getElementById("btn-start")
      .addEventListener("click", () => this.start());
    document
      .getElementById("btn-restart")
      .addEventListener("click", () => this.start());

    this.canvas.addEventListener("pointerdown", (e) => {
      if (!this.state.isRunning || this.state.laserAnim) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.checkClick(x, y);
    });
  }

  start() {
    this.audio.init();
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-over").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    // Le Canvas doit être mesuré après avoir rendu #app visible.
    this.resize();

    this.state.level = 1;
    this.state.score = 0;
    this.state.time = 100;
    this.state.depletionRate = 4;

    this.updateHUD();
    this.initLevel();

    this.state.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initLevel() {
    this.audio.playScan();

    // Progression de la difficulté
    if (this.state.level <= 3) this.state.gridSize = 4;
    else if (this.state.level <= 6) this.state.gridSize = 6;
    else if (this.state.level <= 10) this.state.gridSize = 8;
    else this.state.gridSize = 10;

    this.state.depletionRate = 4 + this.state.level * 0.5; // Le temps s'écoule de plus en plus vite

    // Choix de la cible
    this.state.targetIndex = Math.floor(Math.random() * this.avatars.length);
    this.drawTarget();

    // Génération de la foule
    this.state.crowd = [];
    const numAvatars = this.state.gridSize * this.state.gridSize;
    const cellW = this.canvas.width / this.state.gridSize;
    const cellH = this.canvas.height / this.state.gridSize;

    const targetPos = Math.floor(Math.random() * numAvatars);

    for (let i = 0; i < numAvatars; i++) {
      const isTarget = i === targetPos;
      let avatarIndex = isTarget
        ? this.state.targetIndex
        : Math.floor(Math.random() * this.avatars.length);

      // Empêcher les doublons de cible
      while (!isTarget && avatarIndex === this.state.targetIndex) {
        avatarIndex = Math.floor(Math.random() * this.avatars.length);
      }

      const col = i % this.state.gridSize;
      const row = Math.floor(i / this.state.gridSize);

      // Offset aléatoire dans la cellule
      const offsetX = (Math.random() - 0.5) * (cellW * 0.4);
      const offsetY = (Math.random() - 0.5) * (cellH * 0.4);

      const moveSpeed = this.state.level > 5 ? 12 + this.state.level * 2.4 : 0;

      this.state.crowd.push({
        char: this.avatars[avatarIndex],
        x: col * cellW + cellW / 2 + offsetX,
        y: row * cellH + cellH / 2 + offsetY,
        vx: (Math.random() - 0.5) * moveSpeed,
        vy: (Math.random() - 0.5) * moveSpeed,
        size: Math.min(cellW, cellH) * 0.6,
        isTarget: isTarget,
        flicker: this.state.level > 10 ? Math.random() > 0.8 : false,
      });
    }
  }

  drawTarget() {
    const ctx = this.targetCtx;
    ctx.clearRect(0, 0, 120, 120);
    ctx.font = "60px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Effet néon sur la cible
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = 15;
    ctx.fillText(this.avatars[this.state.targetIndex], 60, 65);
    ctx.shadowBlur = 0;
  }

  checkClick(cx, cy) {
    let hit = false;
    // Vérifier du dernier dessiné au premier (Z-index)
    for (let i = this.state.crowd.length - 1; i >= 0; i--) {
      const p = this.state.crowd[i];
      const dist = Math.hypot(cx - p.x, cy - p.y);
      if (dist < p.size * 0.6) {
        hit = true;
        if (p.isTarget) this.handleSuccess(p);
        else this.handleError();
        break;
      }
    }
  }

  handleSuccess(p) {
    this.audio.playSuccess();
    this.state.score += 100 * this.state.level;
    this.state.level++;
    this.state.time = Math.min(100, this.state.time + 15); // +15% temps

    // Animation Laser Capture
    this.state.laserAnim = {
      x: p.x,
      y: p.y,
      radius: p.size * 2,
      maxRadius: p.size,
      alpha: 1,
    };

    setTimeout(() => {
      this.state.laserAnim = null;
      this.initLevel();
    }, 600);
    this.updateHUD();
  }

  handleError() {
    this.audio.playError();
    this.state.time = Math.max(0, this.state.time - 15); // Pénalité sévère

    // Red Flash & Shake
    const overlay = document.getElementById("flash-overlay");
    overlay.style.opacity = "0.5";
    document.getElementById("app").classList.add("shake");

    setTimeout(() => {
      overlay.style.opacity = "0";
      document.getElementById("app").classList.remove("shake");
    }, 400);
  }

  updateHUD() {
    document.getElementById("level").textContent = this.state.level;
    document.getElementById("score").textContent = this.state.score;
  }

  gameOver() {
    this.state.isRunning = false;
    this.audio.toggleAlarm(false);
    this.audio.playError();
    document.getElementById("app").classList.add("hidden");
    document.getElementById("game-over").classList.remove("hidden");
    document.getElementById("final-score").textContent = this.state.score;
  }

  loop(timestamp) {
    if (!this.state.isRunning) return;

    const dt = Math.min(0.05, Math.max(0, (timestamp - this.lastTime) / 1000));
    this.lastTime = timestamp;

    // Drain Time (Sauf pendant l'animation de capture)
    if (!this.state.laserAnim) {
      this.state.time -= this.state.depletionRate * dt;
    }

    // Update UI Timer
    const bar = document.getElementById("timer-bar");
    bar.style.width = `${this.state.time}%`;

    if (this.state.time > 50) {
      bar.className = "";
      this.audio.toggleAlarm(false);
    } else if (this.state.time > 20) {
      bar.className = "warning";
      this.audio.toggleAlarm(false);
    } else {
      bar.className = "danger";
      this.audio.toggleAlarm(true);
    }

    if (this.state.time <= 0) {
      this.gameOver();
      return;
    }

    // Clear Canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    // Draw Crowd
    this.state.crowd.forEach((p) => {
      // Mouvement (Drift)
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Rebond bords
      const avatarRadius = p.size * 0.42;
      if (p.x < avatarRadius || p.x > this.width - avatarRadius) { p.x = Math.max(avatarRadius, Math.min(this.width - avatarRadius, p.x)); p.vx *= -1; }
      if (p.y < avatarRadius || p.y > this.height - avatarRadius) { p.y = Math.max(avatarRadius, Math.min(this.height - avatarRadius, p.y)); p.vy *= -1; }

      // Effet Flicker Haut Niveau
      if (p.flicker && Math.random() < 0.05) return;

      this.ctx.font = `${p.size}px Arial`;
      this.ctx.fillText(p.char, p.x, p.y);
    });

    // Draw Laser Capture Anim
    if (this.state.laserAnim) {
      const l = this.state.laserAnim;
      l.radius += (l.maxRadius - l.radius) * 0.2; // Lerp
      l.alpha -= 0.05;

      this.ctx.beginPath();
      this.ctx.arc(l.x, l.y, Math.max(0.1, l.radius), 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(0, 243, 255, ${Math.max(0, l.alpha)})`;
      this.ctx.lineWidth = 5;
      this.ctx.shadowColor = "#00f3ff";
      this.ctx.shadowBlur = 10;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0; // Reset
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Lancement global
window.addEventListener("DOMContentLoaded", () => {
  window.game = new CyberBounty();
});
