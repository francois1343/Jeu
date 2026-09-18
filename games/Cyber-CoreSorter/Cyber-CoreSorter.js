"use strict";

const STORAGE_KEY = "francis_arcade_cyber_core_sorter_v2";
const CORE_COLORS = Object.freeze({ cyan: "#00f3ff", magenta: "#ff3bd4" });

function difficultyFor(sorted) {
  const level = Math.min(12, 1 + Math.floor(sorted / 18));
  return {
    level,
    spawnEvery: Math.max(480, 1800 - (level - 1) * 125),
    fuse: Math.max(3000, 8500 - (level - 1) * 430),
    maxActive: Math.min(10, 3 + Math.floor(level / 2)),
    gateCount: level === 1 ? 1 : level === 2 ? 2 : 3,
    burstChance: level < 3 ? 0 : Math.min(.62, .18 + level * .045),
    speed: Math.min(150, 48 + level * 8),
  };
}

function zoneForX(x, width) {
  if (x <= width * .29) return "cyan";
  if (x >= width * .71) return "magenta";
  return null;
}

class AudioEngine {
  constructor(muted = false) { this.context = null; this.muted = muted; }
  init() {
    if (this.muted) return;
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === "suspended") this.context.resume();
  }
  tone(frequency, duration = .08, type = "sine", volume = .06, delay = 0) {
    if (this.muted || !this.context || window.ArcadeGamePreferences?.allowsSound?.() === false) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(start); oscillator.stop(start + duration);
  }
  grab() { this.tone(410, .045, "sine", .035); }
  sort(combo) { this.tone(520 + Math.min(combo, 10) * 22, .09, "triangle", .07); this.tone(780, .11, "sine", .04, .045); }
  spawn() { this.tone(150, .06, "square", .018); }
  gate() { this.tone(82, .12, "sawtooth", .045); this.tone(118, .09, "square", .03, .06); }
  drop(combo) { this.tone(280, .045, "sine", .07); this.tone(640 + Math.min(combo, 12) * 18, .13, "triangle", .065, .035); }
  tick(criticality) { this.tone(920 + criticality * 480, .035, "square", .035); }
  levelUp() { [523, 659, 784, 1046].forEach((note, index) => this.tone(note, .16, "triangle", .055, index * .055)); }
  explode() {
    [150, 95, 52].forEach((note, index) => this.tone(note, .42, "sawtooth", .12, index * .055));
    if (this.muted || !this.context || window.ArcadeGamePreferences?.allowsSound?.() === false) return;
    const length = Math.floor(this.context.sampleRate * .55); const buffer = this.context.createBuffer(1, length, this.context.sampleRate); const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = this.context.createBufferSource(); const gain = this.context.createGain(); source.buffer = buffer; gain.gain.value = .16; source.connect(gain); gain.connect(this.context.destination); source.start();
  }
}

class CyberCoreSorter {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.context = this.canvas.getContext("2d");
    this.elements = {};
    ["hud", "score", "combo", "level", "best-score", "cyan-count", "magenta-count", "zone-labels", "status-message", "start-screen", "pause-screen", "game-over-screen", "game-over-reason", "final-score", "final-combo", "new-record", "btn-start", "btn-restart", "btn-menu", "btn-pause", "btn-resume", "btn-quit", "btn-sound", "btn-leaderboard", "btn-close-leaderboard", "leaderboard-dialog", "leaderboard-list", "leaderboard-empty"].forEach((id) => { this.elements[id] = document.getElementById(id); });

    const saved = this.loadSettings();
    this.bestScore = saved.bestScore;
    this.leaderboard = saved.leaderboard;
    const sharedSound = window.ArcadeGamePreferences?.get?.().sound;
    this.audio = new AudioEngine(typeof sharedSound === "boolean" ? !sharedSound : saved.muted);
    this.width = 0; this.height = 0; this.ratio = 1;
    this.mode = "menu"; this.cores = []; this.particles = [];
    this.score = 0; this.combo = 0; this.bestCombo = 0; this.totalSorted = 0;
    this.sorted = { cyan: 0, magenta: 0 }; this.siloFill = { cyan: 0, magenta: 0 };
    this.gates = []; this.siloClears = []; this.tickClock = 0; this.sinceLastSort = 99;
    this.nextId = 1; this.spawnClock = 0; this.draggedId = null; this.keyboardId = null;
    this.lastTime = performance.now(); this.statusTimer = 0; this.wakeLock = null;

    this.resize(); this.bindEvents(); this.updateSoundButton(); this.updateHUD(); this.renderLeaderboard();
    window.ArcadeGamePreferences?.subscribe?.(({ preferences }) => {
      this.audio.muted = !preferences.sound;
      this.updateSoundButton();
    });
    requestAnimationFrame((time) => this.loop(time));
  }

  loadSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const bestScore = Math.max(0, Number(value?.bestScore) || 0);
      const leaderboard = Array.isArray(value?.leaderboard) ? value.leaderboard.filter((entry) => Number(entry?.score) > 0).map((entry) => ({ score: Number(entry.score), level: Math.max(1, Number(entry.level) || 1), combo: Math.max(0, Number(entry.combo) || 0), cores: Math.max(0, Number(entry.cores) || 0), date: entry.date || null })).sort((a, b) => b.score - a.score).slice(0, 10) : [];
      if (!leaderboard.length && bestScore > 0) leaderboard.push({ score: bestScore, level: 1, combo: 0, cores: 0, date: null });
      return { bestScore, muted: Boolean(value?.muted), leaderboard };
    } catch (_) { return { bestScore: 0, muted: false, leaderboard: [] }; }
  }
  saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestScore: this.bestScore, muted: this.audio.muted, leaderboard: this.leaderboard })); } catch (_) { /* Le jeu reste jouable sans stockage local. */ }
  }
  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("beforeunload", () => this.saveSettings());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.mode === "running") this.pause();
      else if (!document.hidden && this.mode === "running") this.requestWakeLock();
    });

    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.pointerUp(event, true));

    this.elements["btn-start"].addEventListener("click", () => this.start());
    this.elements["btn-restart"].addEventListener("click", () => this.restart());
    this.elements["btn-menu"].addEventListener("click", () => this.showMenu());
    this.elements["btn-pause"].addEventListener("click", () => this.pause());
    this.elements["btn-resume"].addEventListener("click", () => this.resume());
    this.elements["btn-quit"].addEventListener("click", () => this.requestMenu());
    this.elements["btn-sound"].addEventListener("click", () => this.toggleSound());
    this.elements["btn-leaderboard"].addEventListener("click", () => this.openLeaderboard());
    this.elements["btn-close-leaderboard"].addEventListener("click", () => this.elements["leaderboard-dialog"].close());
    this.elements["leaderboard-dialog"].addEventListener("click", (event) => { if (event.target === this.elements["leaderboard-dialog"]) this.elements["leaderboard-dialog"].close(); });
  }
  openLeaderboard() {
    this.audio.init(); this.audio.tone(540, .07, "sine", .04); this.renderLeaderboard();
    const dialog = this.elements["leaderboard-dialog"];
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  }
  renderLeaderboard() {
    const list = this.elements["leaderboard-list"]; list.replaceChildren();
    this.leaderboard.forEach((entry) => {
      const row = document.createElement("li"); row.className = "leaderboard-row";
      const meta = document.createElement("div"); meta.className = "leaderboard-meta";
      const title = document.createElement("strong"); title.textContent = `NIVEAU ${entry.level} · ${entry.cores} NOYAUX`;
      const date = document.createElement("small"); date.textContent = entry.date ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(entry.date)) : "Ancien record";
      const points = document.createElement("div"); points.className = "leaderboard-points"; points.textContent = entry.score.toLocaleString("fr-FR");
      const combo = document.createElement("small"); combo.textContent = `SÉRIE ×${entry.combo}`;
      meta.append(title, date); points.appendChild(combo); row.append(meta, points); list.appendChild(row);
    });
    this.elements["leaderboard-empty"].classList.toggle("hidden", this.leaderboard.length > 0);
  }
  recordScore() {
    if (this.score <= 0) return;
    this.leaderboard.push({ score: this.score, level: difficultyFor(this.totalSorted).level, combo: this.bestCombo, cores: this.totalSorted, date: new Date().toISOString() });
    this.leaderboard.sort((a, b) => b.score - a.score || b.combo - a.combo || b.cores - a.cores);
    this.leaderboard = this.leaderboard.slice(0, 10); this.renderLeaderboard();
  }
  resize() {
    const oldWidth = this.width || window.innerWidth;
    const oldHeight = this.height || window.innerHeight;
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.cores.forEach((core) => {
      core.x = Math.max(core.radius, Math.min(this.width - core.radius, core.x * this.width / oldWidth));
      core.y = Math.max(105 + core.radius, Math.min(this.height - 65 - core.radius, core.y * this.height / oldHeight));
    });
    this.layoutGates();
  }
  layoutGates() {
    const positions = [.39, .5, .61];
    if (!this.gates.length) this.gates = positions.map((ratio, id) => ({ id, x: this.width * ratio, open: 0, state: "idle", pending: 0, timer: 0 }));
    else this.gates.forEach((gate, index) => { gate.x = this.width * positions[index]; });
  }
  start() {
    if (["won", "lost", "abandoned"].includes(window.ArcadeGameSession?.state)) {
      window.ArcadeGameSession.replay();
      return;
    }
    this.audio.init(); this.requestWakeLock();
    this.mode = "running"; this.cores = []; this.particles = [];
    this.score = 0; this.combo = 0; this.bestCombo = 0; this.totalSorted = 0; this.sorted = { cyan: 0, magenta: 0 }; this.siloFill = { cyan: 0, magenta: 0 };
    this.siloClears = []; this.tickClock = 0; this.sinceLastSort = 99;
    this.gates.forEach((gate) => Object.assign(gate, { open: 0, state: "idle", pending: 0, timer: 0 }));
    this.nextId = 1; this.spawnClock = difficultyFor(0).spawnEvery; this.draggedId = null; this.keyboardId = null;
    this.lastTime = performance.now();
    this.hidePanels();
    this.elements.hud.classList.remove("hidden");
    this.elements.hud.classList.remove("critical");
    this.elements["zone-labels"].classList.remove("hidden");
    this.elements["btn-pause"].classList.remove("hidden");
    this.updateHUD(); this.showStatus("CONFINEMENT ACTIF", "good");
    window.ArcadeGameSession?.start?.({ game: "cyber-core-sorter", mode: "classic" });
  }
  restart() {
    if (["won", "lost", "abandoned"].includes(window.ArcadeGameSession?.state)) window.ArcadeGameSession.replay();
    else this.start();
  }
  requestMenu() {
    if (window.ArcadeGameSession?.state === "started") {
      if (!window.confirm("Quitter cette partie en cours ?")) return;
      window.ArcadeGameSession.abandon("core_sorter_menu_return");
    }
    this.showMenu();
  }
  showMenu() {
    this.mode = "menu"; this.cores = []; this.particles = []; this.draggedId = null; this.releaseWakeLock();
    this.hidePanels(); this.elements["start-screen"].classList.remove("hidden");
    this.elements.hud.classList.add("hidden"); this.elements.hud.classList.remove("critical"); this.elements["zone-labels"].classList.add("hidden"); this.elements["btn-pause"].classList.add("hidden");
  }
  hidePanels() { ["start-screen", "pause-screen", "game-over-screen"].forEach((id) => this.elements[id].classList.add("hidden")); }
  pause() {
    if (this.mode !== "running") return;
    this.mode = "paused"; this.draggedId = null; this.canvas.classList.remove("dragging"); this.releaseWakeLock();
    this.elements["pause-screen"].classList.remove("hidden"); this.elements["btn-pause"].classList.add("hidden");
  }
  resume() {
    if (this.mode !== "paused") return;
    this.mode = "running"; this.lastTime = performance.now(); this.elements["pause-screen"].classList.add("hidden"); this.elements["btn-pause"].classList.remove("hidden");
    this.audio.init(); this.requestWakeLock();
  }
  toggleSound() {
    this.audio.muted = !this.audio.muted;
    window.ArcadeGamePreferences?.update?.({ sound: !this.audio.muted });
    if (!this.audio.muted) { this.audio.init(); this.audio.tone(660, .08, "sine", .05); }
    this.updateSoundButton(); this.saveSettings();
  }
  updateSoundButton() {
    const button = this.elements["btn-sound"];
    button.textContent = this.audio.muted ? "×" : "♪";
    button.setAttribute("aria-pressed", String(this.audio.muted));
    button.setAttribute("aria-label", this.audio.muted ? "Activer le son" : "Désactiver le son");
  }
  async requestWakeLock() {
    try { if ("wakeLock" in navigator && !this.wakeLock) this.wakeLock = await navigator.wakeLock.request("screen"); } catch (_) { this.wakeLock = null; }
  }
  async releaseWakeLock() {
    try { await this.wakeLock?.release(); } catch (_) { /* Wake Lock déjà libéré. */ }
    this.wakeLock = null;
  }

  pointerPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  pointerDown(event) {
    if (this.mode !== "running") return;
    const point = this.pointerPosition(event);
    const core = [...this.cores].reverse().find((item) => Math.hypot(point.x - item.x, point.y - item.y) <= item.radius * 1.25);
    if (!core) return;
    event.preventDefault(); this.canvas.setPointerCapture?.(event.pointerId);
    this.draggedId = core.id; this.keyboardId = core.id; core.dragging = true;
    core.offsetX = point.x - core.x; core.offsetY = point.y - core.y;
    this.canvas.classList.add("dragging"); this.audio.init(); this.audio.grab();
  }
  pointerMove(event) {
    if (this.mode !== "running" || this.draggedId === null) return;
    const core = this.cores.find((item) => item.id === this.draggedId);
    if (!core) return;
    event.preventDefault(); const point = this.pointerPosition(event);
    core.x = Math.max(core.radius, Math.min(this.width - core.radius, point.x - core.offsetX));
    core.y = Math.max(95 + core.radius, Math.min(this.height - 48 - core.radius, point.y - core.offsetY));
  }
  pointerUp(event, cancelled = false) {
    if (this.draggedId === null) return;
    const core = this.cores.find((item) => item.id === this.draggedId);
    this.draggedId = null; this.canvas.classList.remove("dragging");
    try { this.canvas.releasePointerCapture?.(event.pointerId); } catch (_) { /* Capture déjà perdue. */ }
    if (!core) return;
    core.dragging = false;
    if (cancelled || this.mode !== "running") return;
    const zone = zoneForX(core.x, this.width);
    if (zone) this.resolveCore(core, zone);
  }
  onKeyDown(event) {
    if (event.key === "Escape" || event.key.toLowerCase() === "p") {
      if (this.mode === "running") this.pause(); else if (this.mode === "paused") this.resume();
      return;
    }
    if (this.mode !== "running" || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    let core = this.cores.find((item) => item.id === this.keyboardId);
    if (!core) core = [...this.cores].sort((a, b) => a.remaining - b.remaining)[0];
    if (!core) return;
    this.keyboardId = core.id;
    this.resolveCore(core, event.key === "ArrowLeft" ? "cyan" : "magenta");
  }

  triggerWave() {
    const settings = difficultyFor(this.totalSorted);
    const activeIndexes = settings.gateCount === 1 ? [1] : settings.gateCount === 2 ? [0, 2] : [0, 1, 2];
    const idle = activeIndexes.filter((index) => this.gates[index].state === "idle");
    if (!idle.length) return false;
    const simultaneous = settings.level >= 3 && idle.length > 1 && Math.random() < .46;
    const chosen = simultaneous ? idle.sort(() => Math.random() - .5).slice(0, 2) : [idle[Math.floor(Math.random() * idle.length)]];
    chosen.forEach((index) => {
      const gate = this.gates[index]; gate.state = "opening"; gate.pending = Math.random() < settings.burstChance ? 2 : 1; gate.timer = 0; this.audio.gate();
    });
    return true;
  }
  updateGates(delta) {
    this.gates.forEach((gate) => {
      if (gate.state === "opening") { gate.open = Math.min(1, gate.open + delta * 3.5); if (gate.open >= 1) { gate.state = "releasing"; gate.timer = 0; } }
      else if (gate.state === "releasing") {
        gate.timer -= delta;
        if (gate.timer <= 0 && gate.pending > 0 && this.cores.length < difficultyFor(this.totalSorted).maxActive) { this.spawnCore(gate.id); gate.pending--; gate.timer = .2; }
        if (gate.pending === 0) { gate.state = "holding"; gate.timer = .18; }
      } else if (gate.state === "holding") { gate.timer -= delta; if (gate.timer <= 0) gate.state = "closing"; }
      else if (gate.state === "closing") { gate.open = Math.max(0, gate.open - delta * 3); if (gate.open <= 0) gate.state = "idle"; }
    });
  }
  spawnCore(gateIndex = 1) {
    const settings = difficultyFor(this.totalSorted);
    if (this.cores.length >= settings.maxActive) return;
    const radius = Math.max(25, Math.min(35, this.width * .045));
    const gate = this.gates[gateIndex] || this.gates[1]; const x = gate.x + (Math.random() - .5) * 10; const y = 125;
    const type = Math.random() < .5 ? "cyan" : "magenta";
    this.cores.push({ id: this.nextId++, type, x, y, radius, vx: (Math.random() - .5) * 26, vy: settings.speed, remaining: settings.fuse, maxFuse: settings.fuse, phase: Math.random() * Math.PI * 2, dragging: false, offsetX: 0, offsetY: 0 });
    this.audio.spawn();
  }
  resolveCore(core, zone) {
    if (zone !== core.type) {
      this.createExplosion(core.x, core.y, CORE_COLORS[core.type]);
      this.endGame(`Un noyau ${core.type === "cyan" ? "cyan" : "magenta"} a été envoyé dans le mauvais canal.`);
      return;
    }
    this.cores = this.cores.filter((item) => item.id !== core.id);
    const oldLevel = difficultyFor(this.totalSorted).level;
    this.combo = this.sinceLastSort <= 2.35 ? this.combo + 1 : 1; this.sinceLastSort = 0; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const multiplier = Math.min(5, 1 + Math.floor(this.combo / 5));
    this.score += 100 * multiplier; this.totalSorted++; this.sorted[zone]++; this.siloFill[zone]++;
    this.createImplosion(core.x, core.y, CORE_COLORS[zone]); this.audio.drop(this.combo);
    if (this.siloFill[zone] >= 40) {
      const bonus = 4000 * multiplier; this.score += bonus; this.siloFill[zone] = 0; this.siloClears.push({ type: zone, life: 1.15, maxLife: 1.15 });
      const siloX = zone === "cyan" ? this.width * .15 : this.width * .85; this.createSiloBurst(siloX, this.height * .55, CORE_COLORS[zone]);
      this.showStatus(`SILO PURGÉ — COMBO +${bonus.toLocaleString("fr-FR")}`, "good"); this.audio.levelUp();
    } else this.showStatus(this.combo >= 5 ? `SÉRIE ×${this.combo}` : "NOYAU CONFINÉ", "good");
    const newLevel = difficultyFor(this.totalSorted).level;
    if (newLevel > oldLevel) { this.audio.levelUp(); this.showStatus(`NIVEAU ${newLevel} — FRÉQUENCE ACCRUE`, "good"); }
    this.updateHUD();
  }
  endGame(reason) {
    if (this.mode !== "running") return;
    this.mode = "gameover"; this.draggedId = null; this.canvas.classList.remove("dragging"); this.elements.hud.classList.remove("critical"); this.audio.explode(); this.releaseWakeLock();
    document.getElementById("game-container").classList.remove("screen-shake"); void document.getElementById("game-container").offsetWidth; document.getElementById("game-container").classList.add("screen-shake");
    const previousBest = this.bestScore;
    this.bestScore = Math.max(this.bestScore, this.score); this.recordScore(); this.saveSettings(); this.updateHUD();
    this.elements["game-over-reason"].textContent = reason;
    this.elements["final-score"].textContent = this.score.toLocaleString("fr-FR");
    this.elements["final-combo"].textContent = this.bestCombo.toLocaleString("fr-FR");
    this.elements["new-record"].classList.toggle("hidden", this.score <= previousBest || this.score === 0);
    this.elements["btn-pause"].classList.add("hidden");
    setTimeout(() => { if (this.mode === "gameover") this.elements["game-over-screen"].classList.remove("hidden"); }, 520);
    window.ArcadeGameSession?.lose?.({ score: this.score, bestCombo: this.bestCombo, level: difficultyFor(this.totalSorted).level, reason });
  }
  updateHUD() {
    this.elements.score.textContent = this.score.toLocaleString("fr-FR");
    this.elements.combo.textContent = `×${Math.max(1, this.combo)}`;
    this.elements.level.textContent = difficultyFor(this.totalSorted).level;
    this.elements["best-score"].textContent = this.bestScore.toLocaleString("fr-FR");
    this.elements["cyan-count"].textContent = `${this.siloFill.cyan} / 40`;
    this.elements["magenta-count"].textContent = `${this.siloFill.magenta} / 40`;
  }
  showStatus(message, type = "") {
    const element = this.elements["status-message"];
    element.textContent = message; element.className = `status-message show ${type}`;
    clearTimeout(this.statusTimer); this.statusTimer = setTimeout(() => { element.className = "status-message"; }, 900);
  }
  createExplosion(x, y, color) {
    for (let index = 0; index < 54; index++) {
      const angle = Math.random() * Math.PI * 2; const speed = 70 + Math.random() * 280;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .9 + Math.random() * .45, maxLife: 1.35, size: 2 + Math.random() * 7, color });
    }
  }
  createImplosion(x, y, color) {
    for (let index = 0; index < 14; index++) {
      const angle = Math.random() * Math.PI * 2; const speed = 40 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .38 + Math.random() * .28, maxLife: .66, size: 1 + Math.random() * 4, color });
    }
  }
  createSiloBurst(x, y, color) {
    for (let index = 0; index < 70; index++) {
      const angle = Math.random() * Math.PI * 2; const speed = 90 + Math.random() * 330;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .8 + Math.random() * .7, maxLife: 1.5, size: 2 + Math.random() * 6, color });
    }
  }

  update(delta) {
    if (this.mode === "running") {
      const settings = difficultyFor(this.totalSorted); this.sinceLastSort += delta;
      this.spawnClock = Math.min(settings.spawnEvery, this.spawnClock + delta * 1000);
      if (this.spawnClock >= settings.spawnEvery && this.cores.length < settings.maxActive && this.triggerWave()) this.spawnClock = 0;
      this.updateGates(delta);
      let expired = null;
      this.cores.forEach((core) => {
        core.remaining -= delta * 1000 * (core.dragging ? .2 : 1); core.phase += delta * 2.4;
        if (!core.dragging) {
          core.x += core.vx * delta; core.y += core.vy * delta; core.vy = Math.min(settings.speed * 1.25, core.vy + settings.speed * .08 * delta);
          const left = this.width * .31 + core.radius; const right = this.width * .69 - core.radius;
          if (core.x < left || core.x > right) { core.x = Math.max(left, Math.min(right, core.x)); core.vx *= -.85; }
          if (core.y > this.height - 78 - core.radius) { core.y = this.height - 78 - core.radius; core.vy = -settings.speed * .52; }
          if (core.y < 122 && core.vy < 0) core.vy = settings.speed;
        }
        if (core.remaining <= 0 && !expired) expired = core;
      });
      const critical = this.cores.filter((core) => core.remaining / core.maxFuse < .26);
      this.elements.hud.classList.toggle("critical", critical.length > 0);
      if (critical.length) {
        const danger = Math.max(...critical.map((core) => 1 - core.remaining / core.maxFuse)); this.tickClock -= delta;
        if (this.tickClock <= 0) { this.audio.tick(danger); this.tickClock = Math.max(.09, .43 - danger * .36); }
      } else this.tickClock = 0;
      if (this.sinceLastSort > 2.8 && this.combo) { this.combo = 0; this.updateHUD(); }
      if (expired) { this.createExplosion(expired.x, expired.y, CORE_COLORS[expired.type]); this.endGame("La charge d'un noyau a atteint sa masse critique."); }
    }
    this.siloClears.forEach((effect) => { effect.life -= delta; }); this.siloClears = this.siloClears.filter((effect) => effect.life > 0);
    this.particles.forEach((particle) => { particle.life -= delta; particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.vx *= .975; particle.vy *= .975; });
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }
  loop(time) {
    const delta = Math.min(.04, Math.max(0, (time - this.lastTime) / 1000)); this.lastTime = time;
    this.update(delta); this.render(time / 1000); requestAnimationFrame((next) => this.loop(next));
  }

  render(time) {
    const ctx = this.context; ctx.clearRect(0, 0, this.width, this.height);
    this.drawArena(ctx, time);
    this.drawSilos(ctx, time); this.drawGates(ctx, time); this.drawLowerGarages(ctx, time);
    this.cores.forEach((core) => this.drawCore(ctx, core, time));
    this.drawParticles(ctx);
  }
  drawArena(ctx, time) {
    const leftEdge = this.width * .29; const rightEdge = this.width * .71;
    const cyanGradient = ctx.createLinearGradient(0, 0, leftEdge, 0); cyanGradient.addColorStop(0, "rgba(0,243,255,.18)"); cyanGradient.addColorStop(1, "rgba(0,243,255,.015)");
    const magentaGradient = ctx.createLinearGradient(rightEdge, 0, this.width, 0); magentaGradient.addColorStop(0, "rgba(255,59,212,.015)"); magentaGradient.addColorStop(1, "rgba(255,59,212,.18)");
    ctx.fillStyle = cyanGradient; ctx.fillRect(0, 0, leftEdge, this.height);
    ctx.fillStyle = magentaGradient; ctx.fillRect(rightEdge, 0, this.width - rightEdge, this.height);
    const track = ctx.createLinearGradient(leftEdge, 0, rightEdge, 0); track.addColorStop(0, "rgba(90,125,155,.08)"); track.addColorStop(.5, "rgba(170,210,235,.14)"); track.addColorStop(1, "rgba(90,125,155,.08)"); ctx.fillStyle = track; ctx.fillRect(leftEdge, 92, rightEdge - leftEdge, this.height - 147);
    ctx.save(); ctx.setLineDash([8, 12]); ctx.lineDashOffset = -time * 18; ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,243,255,.42)"; ctx.beginPath(); ctx.moveTo(leftEdge, 92); ctx.lineTo(leftEdge, this.height - 55); ctx.stroke();
    ctx.strokeStyle = "rgba(255,59,212,.42)"; ctx.beginPath(); ctx.moveTo(rightEdge, 92); ctx.lineTo(rightEdge, this.height - 55); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = "rgba(190,220,255,.08)"; ctx.lineWidth = 1;
    const center = this.width / 2; for (let ring = 1; ring <= 4; ring++) { ctx.beginPath(); ctx.arc(center, this.height / 2, ring * 52 + Math.sin(time * 1.5 + ring) * 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  drawGates(ctx, time) {
    const settings = difficultyFor(this.totalSorted); const active = settings.gateCount === 1 ? [1] : settings.gateCount === 2 ? [0,2] : [0,1,2];
    this.gates.forEach((gate) => {
      const width = Math.max(58, Math.min(92, this.width * .13)); const y = 91; const lit = active.includes(gate.id);
      ctx.save(); ctx.translate(gate.x, y); ctx.shadowColor = lit ? "#9bcfff" : "transparent"; ctx.shadowBlur = lit ? 10 : 0; ctx.fillStyle = lit ? "#172637" : "#0b1119"; ctx.strokeStyle = lit ? "#6d92ae" : "#26313d"; ctx.lineWidth = 2; ctx.fillRect(-width/2, -16, width, 34); ctx.strokeRect(-width/2, -16, width, 34);
      const separation = gate.open * width * .38; ctx.fillStyle = "#26394a"; ctx.fillRect(-width/2 + 4 - separation, -12, width/2 - 6, 26); ctx.fillRect(2 + separation, -12, width/2 - 6, 26);
      ctx.fillStyle = lit ? "#9bcfff" : "#344351"; ctx.fillRect(-3, -10, 6, 22); ctx.restore();
    });
  }
  drawSilos(ctx, time) {
    const top = Math.min(142, this.height * .21); const bottom = this.height - 68; const height = Math.max(170, bottom - top); const siloWidth = Math.max(82, this.width * .255 - 18);
    ["cyan", "magenta"].forEach((type) => {
      const isCyan = type === "cyan"; const x = isCyan ? 10 : this.width - siloWidth - 10; const color = CORE_COLORS[type]; const fill = this.siloFill[type];
      const chamberX = x + 13; const chamberY = top + 39; const chamberW = siloWidth - 26; const chamberH = height - 70;
      ctx.save();

      // Tuyau d'admission et trappe circulaire dirigés vers la piste centrale.
      const intakeY = top + 72; const hatchX = isCyan ? x + siloWidth - 2 : x + 2; const pipeEnd = isCyan ? this.width * .292 : this.width * .708;
      ctx.strokeStyle = "#34495b"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(hatchX, intakeY); ctx.lineTo(pipeEnd, intakeY); ctx.stroke();
      ctx.strokeStyle = `${color}66`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hatchX, intakeY); ctx.lineTo(pipeEnd, intakeY); ctx.stroke();
      ctx.fillStyle = "#101a25"; ctx.strokeStyle = "#71889b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hatchX, intakeY, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hatchX, intakeY, 11 + Math.sin(time * 2.2) * 1.5, 0, Math.PI * 2); ctx.stroke();

      // Châssis blindé extérieur et pieds du silo.
      ctx.shadowColor = color; ctx.shadowBlur = 11; ctx.fillStyle = "rgba(6,13,22,.9)"; ctx.strokeStyle = "#53697c"; ctx.lineWidth = 4; this.roundRect(ctx, x, top, siloWidth, height, 22); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = "#1a2a38"; ctx.fillRect(x + 8, top + 8, siloWidth - 16, 27); ctx.fillRect(x + 8, bottom - 26, siloWidth - 16, 18);
      ctx.strokeStyle = "#7990a2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 17, bottom); ctx.lineTo(x + 12, bottom + 18); ctx.moveTo(x + siloWidth - 17, bottom); ctx.lineTo(x + siloWidth - 12, bottom + 18); ctx.stroke();

      // Chambre vitrée, reflet et énergie de remplissage.
      const glass = ctx.createLinearGradient(chamberX, 0, chamberX + chamberW, 0); glass.addColorStop(0, `${color}18`); glass.addColorStop(.28, "rgba(220,245,255,.08)"); glass.addColorStop(.48, "rgba(255,255,255,.015)"); glass.addColorStop(1, `${color}12`);
      ctx.fillStyle = glass; ctx.strokeStyle = `${color}88`; ctx.lineWidth = 2; this.roundRect(ctx, chamberX, chamberY, chamberW, chamberH, 13); ctx.fill(); ctx.stroke();
      ctx.save(); this.roundRect(ctx, chamberX, chamberY, chamberW, chamberH, 13); ctx.clip();
      const energyTop = chamberY + chamberH * (1 - fill / 40); const energy = ctx.createLinearGradient(0, energyTop, 0, chamberY + chamberH); energy.addColorStop(0, `${color}22`); energy.addColorStop(1, `${color}55`); ctx.fillStyle = energy; ctx.fillRect(chamberX, energyTop, chamberW, chamberY + chamberH - energyTop);
      ctx.globalAlpha = .2; ctx.strokeStyle = color; ctx.lineWidth = 1; for (let line = chamberY + 13; line < chamberY + chamberH; line += 17) { ctx.beginPath(); ctx.moveTo(chamberX, line); ctx.lineTo(chamberX + chamberW, line - 7); ctx.stroke(); } ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,.15)"; this.roundRect(ctx, chamberX + 7, chamberY + 8, Math.max(3, chamberW * .045), chamberH - 18, 3); ctx.fill();

      // Empilement réel des 40 noyaux, cinq colonnes sur huit rangées.
      const columns = 5; const gapX = (chamberW - 20) / (columns - 1); const gapY = Math.min(23, (chamberH - 26) / 8); const radius = Math.max(3.5, Math.min(8, gapX * .27));
      for (let index = 0; index < fill; index++) {
        const column = index % columns; const row = Math.floor(index / columns); const px = chamberX + 10 + column * gapX; const py = chamberY + chamberH - 13 - row * gapY;
        ctx.shadowColor = color; ctx.shadowBlur = 7; ctx.fillStyle = "#071018"; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.globalAlpha = .65; ctx.beginPath(); ctx.arc(px - radius * .25, py - radius * .25, radius * .3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }

      // Jauge verticale, plaque technique et boulons d'armature.
      const gaugeX = isCyan ? x + siloWidth - 8 : x + 4; ctx.fillStyle = "#071018"; ctx.fillRect(gaugeX, chamberY + 8, 4, chamberH - 16); ctx.fillStyle = color; ctx.fillRect(gaugeX, chamberY + 8 + (chamberH - 16) * (1 - fill / 40), 4, (chamberH - 16) * fill / 40);
      ctx.font = `700 ${Math.max(7, Math.min(10, siloWidth * .055))}px Orbitron`; ctx.textAlign = "center"; ctx.fillStyle = color; ctx.fillText(`CONFINEMENT ${type.toUpperCase()}`, x + siloWidth / 2, top + 26);
      [[x+10,top+12],[x+siloWidth-10,top+12],[x+10,bottom-10],[x+siloWidth-10,bottom-10]].forEach(([boltX,boltY]) => { ctx.fillStyle = "#9fb0bd"; ctx.beginPath(); ctx.arc(boltX,boltY,2.2,0,Math.PI*2); ctx.fill(); });

      const clear = this.siloClears.find((effect) => effect.type === type);
      if (clear) { const alpha = clear.life / clear.maxLife; ctx.globalAlpha = alpha; ctx.fillStyle = "#fff"; ctx.shadowColor = color; ctx.shadowBlur = 45; ctx.fillRect(chamberX + chamberW * .43, chamberY, chamberW * .14, chamberH); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x + siloWidth / 2, chamberY + chamberH / 2, (1 - alpha) * siloWidth * .7, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    });
  }
  drawLowerGarages(ctx, time) {
    const trackLeft = this.width * .31; const trackRight = this.width * .69; const totalWidth = trackRight - trackLeft; const gap = 7; const doorWidth = (totalWidth - gap * 2) / 3; const top = this.height - 69; const doorHeight = 59;
    this.gates.forEach((gate, index) => {
      const x = trackLeft + index * (doorWidth + gap); const activity = gate.open; const shutterLift = activity * doorHeight * .22;
      ctx.save();
      ctx.fillStyle = "#070c13"; ctx.strokeStyle = "#52677a"; ctx.lineWidth = 3; ctx.fillRect(x, top, doorWidth, doorHeight); ctx.strokeRect(x, top, doorWidth, doorHeight);
      ctx.save(); ctx.beginPath(); ctx.rect(x + 4, top + 4, doorWidth - 8, doorHeight - 8); ctx.clip();
      const shutter = ctx.createLinearGradient(0, top, 0, top + doorHeight); shutter.addColorStop(0, "#263949"); shutter.addColorStop(1, "#101b26"); ctx.fillStyle = shutter; ctx.fillRect(x + 4, top + 4 - shutterLift, doorWidth - 8, doorHeight - 8);
      ctx.strokeStyle = "rgba(170,205,225,.24)"; ctx.lineWidth = 1; for (let railY = top + 9 - shutterLift; railY < top + doorHeight; railY += 8) { ctx.beginPath(); ctx.moveTo(x + 5, railY); ctx.lineTo(x + doorWidth - 5, railY); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = "#071018"; ctx.strokeStyle = "#8195a5"; ctx.lineWidth = 2; ctx.fillRect(x - 3, top - 8, doorWidth + 6, 10); ctx.strokeRect(x - 3, top - 8, doorWidth + 6, 10);
      ctx.fillStyle = activity > .15 ? "#b6f7ff" : "#ffb23e"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x + doorWidth - 10, top - 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "rgba(6,10,15,.78)"; ctx.fillRect(x + 7, top + doorHeight - 16, doorWidth - 14, 11); ctx.fillStyle = "#91a4b5"; ctx.font = `600 ${Math.max(6, Math.min(8, doorWidth * .09))}px Orbitron`; ctx.textAlign = "center"; ctx.fillText(`GARAGE 0${index + 1}`, x + doorWidth / 2, top + doorHeight - 8);
      ctx.restore();
    });
  }
  roundRect(ctx, x, y, width, height, radius) { ctx.beginPath(); ctx.moveTo(x+radius,y); ctx.arcTo(x+width,y,x+width,y+height,radius); ctx.arcTo(x+width,y+height,x,y+height,radius); ctx.arcTo(x,y+height,x,y,radius); ctx.arcTo(x,y,x+width,y,radius); ctx.closePath(); }
  drawCore(ctx, core, time) {
    const color = CORE_COLORS[core.type]; const urgency = 1 - Math.max(0, core.remaining / core.maxFuse); const pulse = 1 + Math.sin(time * (4 + urgency * 12) + core.phase) * (.025 + urgency * .09); const criticalFlash = urgency > .74 && Math.sin(time * (18 + urgency * 10)) > .1;
    ctx.save(); ctx.translate(core.x, core.y); ctx.scale(pulse, pulse);
    ctx.shadowColor = criticalFlash ? "#ffffff" : urgency > .72 ? "#ff4155" : color; ctx.shadowBlur = 14 + urgency * 24;
    ctx.fillStyle = criticalFlash ? "#eaffff" : "#07101a"; ctx.strokeStyle = criticalFlash ? "#ffffff" : color; ctx.lineWidth = core.dragging ? 5 : 3;
    ctx.beginPath(); ctx.arc(0, 0, core.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.rotate(time * (core.type === "cyan" ? 1.2 : -1.2) + core.phase);
    ctx.setLineDash([5, 6]); ctx.lineWidth = 2; ctx.globalAlpha = .75; ctx.beginPath(); ctx.arc(0, 0, core.radius * .72, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.rotate(-(time * (core.type === "cyan" ? 1.2 : -1.2) + core.phase)); ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(-5, -6, 1, 0, 0, core.radius * .55); glow.addColorStop(0, "#ffffff"); glow.addColorStop(.22, color); glow.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, core.radius * .58, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = urgency > .72 ? "#ff4155" : "rgba(255,255,255,.65)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, core.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, core.remaining / core.maxFuse)); ctx.stroke();
    if (urgency > .72) { ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(core.radius * .45)}px Orbitron`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(Math.ceil(core.remaining / 1000), 0, 1); }
    if (core.id === this.keyboardId) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.arc(0,0,core.radius+12,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }
  drawParticles(ctx) {
    this.particles.forEach((particle) => { ctx.save(); ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = particle.color; ctx.shadowColor = particle.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = { difficultyFor, zoneForX };
function configureCyberCoreShell() {
  window.ArcadeGameShell?.configure?.({
    pause: () => window.cyberCoreSorter?.pause(),
    resume: () => window.cyberCoreSorter?.resume(),
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("arcade:shell-ready", configureCyberCoreShell);
  window.addEventListener("DOMContentLoaded", () => {
    window.cyberCoreSorter = new CyberCoreSorter();
    configureCyberCoreShell();
  });
}
