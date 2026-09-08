/**
 * DÉS DE BOHÊME — Farkle à six dés
 * Web Audio API, physique Canvas 2D et partie joueur contre IA / deux joueurs.
 */

"use strict";

// Évalue uniquement des sélections entièrement valides. Le meilleur découpage
// est retenu lorsqu'une main peut être interprétée de plusieurs façons.
function evalCombination(diceArray) {
  if (!Array.isArray(diceArray) || diceArray.length === 0 || diceArray.length > 6 || diceArray.some((v) => !Number.isInteger(v) || v < 1 || v > 6)) {
    return { valid: false, score: 0, breakdown: [] };
  }

  const counts = Array(7).fill(0);
  diceArray.forEach((value) => counts[value]++);
  const memo = new Map();

  function solve(current) {
    const key = current.slice(1).join("");
    if (memo.has(key)) return memo.get(key);
    if (current.slice(1).every((count) => count === 0)) return { score: 0, breakdown: [] };

    let best = null;
    const tryPart = (needed, points, label) => {
      if (needed.some((amount, face) => amount > current[face])) return;
      const next = current.slice();
      needed.forEach((amount, face) => { next[face] -= amount; });
      const rest = solve(next);
      if (!rest) return;
      const candidate = { score: points + rest.score, breakdown: [label, ...rest.breakdown] };
      if (!best || candidate.score > best.score) best = candidate;
    };

    if (current[1]) { const part = Array(7).fill(0); part[1] = 1; tryPart(part, 100, "1 seul (100)"); }
    if (current[5]) { const part = Array(7).fill(0); part[5] = 1; tryPart(part, 50, "5 seul (50)"); }

    for (let face = 1; face <= 6; face++) {
      for (let amount = 3; amount <= current[face]; amount++) {
        const part = Array(7).fill(0);
        part[face] = amount;
        const triple = face === 1 ? 1000 : face * 100;
        tryPart(part, triple * (2 ** (amount - 3)), `${amount} × ${face} (${triple * (2 ** (amount - 3))})`);
      }
    }

    const straights = [
      { faces: [1, 2, 3, 4, 5, 6], score: 1500, label: "Grande suite (1 500)" },
      { faces: [2, 3, 4, 5, 6], score: 750, label: "Suite 2—6 (750)" },
      { faces: [1, 2, 3, 4, 5], score: 500, label: "Suite 1—5 (500)" },
    ];
    straights.forEach(({ faces, score, label }) => {
      const part = Array(7).fill(0);
      faces.forEach((face) => { part[face] = 1; });
      tryPart(part, score, label);
    });

    memo.set(key, best);
    return best;
  }

  const result = solve(counts);
  return result ? { valid: true, score: result.score, breakdown: result.breakdown } : { valid: false, score: 0, breakdown: [] };
}

function hasScoringCombination(values) {
  if (values.some((value) => value === 1 || value === 5)) return true;
  const counts = Array(7).fill(0);
  values.forEach((value) => counts[value]++);
  return counts.some((count) => count >= 3);
}

function bestScoringSelection(dice) {
  let best = null;
  const limit = 1 << dice.length;
  for (let mask = 1; mask < limit; mask++) {
    const values = [];
    const indexes = [];
    for (let index = 0; index < dice.length; index++) {
      if (mask & (1 << index)) { values.push(dice[index].value); indexes.push(dice[index].id); }
    }
    const result = evalCombination(values);
    if (result.valid && (!best || result.score > best.score || (result.score === best.score && indexes.length > best.indexes.length))) {
      best = { ...result, indexes };
    }
  }
  return best;
}

class SoundEngine {
  constructor() { this.ctx = null; this.lastImpact = 0; }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  tone(frequency, duration = .08, type = "sine", volume = .09, delay = 0) {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain); gain.connect(this.ctx.destination);
    oscillator.start(start); oscillator.stop(start + duration);
  }
  playClick(pitch = 440) { this.tone(pitch, .07, "sine", .08); }
  playDiceImpact() {
    if (!this.ctx || this.ctx.currentTime - this.lastImpact < .045) return;
    this.lastImpact = this.ctx.currentTime;
    this.tone(90 + Math.random() * 55, .09, "triangle", .1);
  }
  playScore() { [392, 523.25, 659.25, 783.99].forEach((note, i) => this.tone(note, .18, "triangle", .07, i * .06)); }
  playBust() { [180, 135, 90].forEach((note, i) => this.tone(note, .24, "sawtooth", .08, i * .11)); }
  playHotDice() { [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, .2, "square", .055, i * .07)); }
  playVictory() { [392, 523.25, 659.25, 784, 1046.5].forEach((note, i) => this.tone(note, .35, "triangle", .08, i * .1)); }
}

class PhysicsDice {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dice = [];
    this.size = 58;
    this.width = 0;
    this.height = 0;
    this.resize();
    window.addEventListener("resize", () => { this.resize(); this.resetPositions(); });
    this.initDice();
  }
  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * ratio); this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.size = this.width < 520 ? 48 : 58;
  }
  initDice() {
    this.dice = Array.from({ length: 6 }, (_, id) => ({ id, value: Math.floor(Math.random() * 6) + 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0, vAngle: 0, state: "table", rolling: false }));
    this.resetPositions();
  }
  resetPositions() {
    const compact = this.width < 650;
    const columns = compact ? 3 : 6;
    const gap = this.size + (compact ? 14 : 18);
    const startX = this.width / 2 - ((columns - 1) * gap) / 2;
    const centerY = Math.max(250, Math.min(this.height * .48, this.height - 310));
    this.dice.forEach((die, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      die.x = startX + column * gap;
      die.y = centerY + row * gap;
      die.vx = 0; die.vy = 0; die.vAngle = 0; die.angle = 0; die.rolling = false;
    });
  }
  roll(sound) {
    const rollable = this.dice.filter((die) => die.state === "table");
    rollable.forEach((die) => {
      die.rolling = true;
      die.vx = (Math.random() - .5) * 30;
      die.vy = (Math.random() - .5) * 24 - 7;
      die.vAngle = (Math.random() - .5) * .45;
      die.value = Math.floor(Math.random() * 6) + 1;
    });
    if (rollable.length) sound.playDiceImpact();
  }
  update(sound) {
    let moving = false;
    const margin = this.size / 2 + 8;
    const top = Math.max(190, this.height * .23);
    const bottom = Math.max(top + this.size + 12, this.height - (this.width < 520 ? 265 : 225));
    const bounds = { left: margin, right: this.width - margin, top, bottom };

    this.dice.forEach((die) => {
      if (!die.rolling) return;
      die.x += die.vx; die.y += die.vy; die.angle += die.vAngle;
      die.vx *= .925; die.vy *= .925; die.vAngle *= .91;
      if (die.x < bounds.left || die.x > bounds.right) { die.vx *= -.68; die.x = Math.max(bounds.left, Math.min(bounds.right, die.x)); sound.playDiceImpact(); }
      if (die.y < bounds.top || die.y > bounds.bottom) { die.vy *= -.68; die.y = Math.max(bounds.top, Math.min(bounds.bottom, die.y)); sound.playDiceImpact(); }
      if (Math.abs(die.vx) > .42 || Math.abs(die.vy) > .42 || Math.abs(die.vAngle) > .012) {
        if (Math.random() < .3) die.value = Math.floor(Math.random() * 6) + 1;
        moving = true;
      } else { die.vx = 0; die.vy = 0; die.vAngle = 0; die.rolling = false; }
    });
    return moving;
  }
  render(active = true) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (!active) return;
    this.dice.forEach((die) => {
      this.ctx.save(); this.ctx.translate(die.x, die.y); this.ctx.rotate(die.angle);
      const style = {
        table: { fill: "#e4d0a5", stroke: "#8b6638", pip: "#2a160c", shadow: "rgba(0,0,0,.55)" },
        selected: { fill: "#d8a747", stroke: "#ffe29a", pip: "#2a160c", shadow: "#d4a84e" },
        banked: { fill: "#39271c", stroke: "#72583e", pip: "#bfae8e", shadow: "rgba(0,0,0,.55)" },
      }[die.state];
      this.ctx.fillStyle = style.fill; this.ctx.strokeStyle = style.stroke; this.ctx.lineWidth = die.state === "selected" ? 4 : 3;
      this.ctx.shadowColor = style.shadow; this.ctx.shadowBlur = die.state === "selected" ? 18 : 10; this.ctx.shadowOffsetY = 6;
      const half = this.size / 2;
      this.roundRect(-half, -half, this.size, this.size, 9); this.ctx.fill(); this.ctx.stroke();
      this.ctx.shadowOffsetY = 0; this.drawPips(die.value, half, style.pip);
      if (die.state === "banked") { this.ctx.fillStyle = "#f0ca6a"; this.ctx.font = "bold 12px sans-serif"; this.ctx.fillText("✓", half - 12, half - 5); }
      this.ctx.restore();
    });
  }
  drawPips(value, half, color) {
    this.ctx.fillStyle = color; this.ctx.shadowColor = color; this.ctx.shadowBlur = 1;
    const radius = Math.max(3.6, this.size * .075); const q = half * .5;
    const dots = { 1:[[0,0]], 2:[[-q,-q],[q,q]], 3:[[-q,-q],[0,0],[q,q]], 4:[[-q,-q],[q,-q],[-q,q],[q,q]], 5:[[-q,-q],[q,-q],[0,0],[-q,q],[q,q]], 6:[[-q,-q],[q,-q],[-q,0],[q,0],[-q,q],[q,q]] };
    dots[value].forEach(([x,y]) => { this.ctx.beginPath(); this.ctx.arc(x,y,radius,0,Math.PI*2); this.ctx.fill(); });
  }
  roundRect(x,y,w,h,r) { this.ctx.beginPath(); this.ctx.moveTo(x+r,y); this.ctx.arcTo(x+w,y,x+w,y+h,r); this.ctx.arcTo(x+w,y+h,x,y+h,r); this.ctx.arcTo(x,y+h,x,y,r); this.ctx.arcTo(x,y,x+w,y,r); this.ctx.closePath(); }
  dieAt(x, y) { return [...this.dice].reverse().find((die) => Math.abs(x - die.x) <= this.size * .62 && Math.abs(y - die.y) <= this.size * .62); }
}

class FarkleGame {
  constructor() {
    this.sound = new SoundEngine();
    this.physics = new PhysicsDice(document.getElementById("gameCanvas"));
    this.players = [{ name: "Henry", score: 0 }, { name: "Aubergiste", score: 0 }];
    this.mode = "ai"; this.target = 2000; this.currentPlayer = 0; this.turnScore = 0;
    this.gameActive = false; this.isRolling = false; this.awaitingSelection = false; this.turnLocked = false; this.epoch = 0; this.toastTimer = 0;
    this.bindEvents(); this.gameLoop(); this.renderDiceHUD();
  }
  $(id) { return document.getElementById(id); }
  bindEvents() {
    this.$("btn-start").addEventListener("click", () => { this.sound.init(); this.sound.playClick(620); this.startNewGame(); });
    this.$("btn-restart").addEventListener("click", () => { this.sound.init(); this.sound.playClick(620); this.startNewGame(); });
    this.$("btn-menu").addEventListener("click", () => this.quitToMenu());
    this.$("btn-quit").addEventListener("click", () => this.quitToMenu());
    this.$("btn-roll").addEventListener("click", () => this.rollDice(false));
    this.$("btn-bank").addEventListener("click", () => this.bankTurn(false));
    this.physics.canvas.addEventListener("pointerup", (event) => {
      const rect = this.physics.canvas.getBoundingClientRect();
      const die = this.physics.dieAt(event.clientX - rect.left, event.clientY - rect.top);
      if (die) this.toggleDie(die.id, false);
    });
  }
  isAITurn() { return this.mode === "ai" && this.currentPlayer === 1; }
  isHumanTurn() { return this.gameActive && !this.isAITurn(); }
  showScreen(id) { ["main-menu", "game-ui", "game-over"].forEach((screen) => this.$(screen).classList.add("hidden")); this.$(id).classList.remove("hidden"); }
  quitToMenu() { this.epoch++; this.gameActive = false; this.isRolling = false; this.turnLocked = true; this.$("bust-alert").classList.add("hidden"); this.showScreen("main-menu"); this.sound.playClick(260); }
  startNewGame() {
    this.epoch++;
    this.mode = this.$("game-mode").value;
    this.target = Number(this.$("target-score").value) || 2000;
    this.players = [{ name: "Henry", score: 0 }, { name: this.mode === "ai" ? "Aubergiste" : "Joueur 2", score: 0 }];
    this.currentPlayer = 0; this.gameActive = true; this.isRolling = false; this.turnLocked = false;
    this.physics.initDice(); this.$("bust-alert").classList.add("hidden"); this.showScreen("game-ui"); this.startTurn();
  }
  startTurn() {
    this.turnScore = 0; this.awaitingSelection = false; this.isRolling = false; this.turnLocked = false;
    this.physics.dice.forEach((die) => { die.state = "table"; die.rolling = false; });
    this.physics.resetPositions(); this.updateHUD(); this.renderDiceHUD();
    this.showToast(`Au tour de ${this.players[this.currentPlayer].name}`);
    if (this.isAITurn()) this.schedule(() => this.rollDice(true), 850);
  }
  currentSelection() { return this.physics.dice.filter((die) => die.state === "selected"); }
  selectionResult() { return evalCombination(this.currentSelection().map((die) => die.value)); }
  toggleDie(id, byAI) {
    if (!this.gameActive || this.turnLocked || this.isRolling || !this.awaitingSelection || (!byAI && !this.isHumanTurn())) return;
    const die = this.physics.dice[id];
    if (!die || die.state === "banked") return;
    die.state = die.state === "selected" ? "table" : "selected";
    if (!byAI) this.sound.playClick(die.state === "selected" ? 650 : 360);
    this.updateHUD(); this.renderDiceHUD();
  }
  commitSelection() {
    const result = this.selectionResult();
    if (!result.valid) return false;
    this.turnScore += result.score;
    this.currentSelection().forEach((die) => { die.state = "banked"; });
    return true;
  }
  rollDice(byAI) {
    if (!this.gameActive || this.turnLocked || this.isRolling || (!byAI && !this.isHumanTurn())) return;
    if (this.awaitingSelection && !this.commitSelection()) { this.showToast("Choisissez au moins une combinaison valable."); return; }

    const hotDice = this.physics.dice.every((die) => die.state === "banked");
    if (hotDice) {
      this.physics.dice.forEach((die) => { die.state = "table"; });
      this.physics.resetPositions(); this.sound.playHotDice(); this.showToast("MAIN PLEINE — les six dés reviennent !", 1500);
    }

    this.sound.init();
    if (!byAI) this.sound.playClick(500);
    this.awaitingSelection = false; this.isRolling = true;
    this.physics.roll(this.sound); this.updateHUD(); this.renderDiceHUD();
  }
  onRollComplete() {
    if (!this.gameActive) return;
    this.isRolling = false; this.awaitingSelection = true;
    const rolled = this.physics.dice.filter((die) => die.state === "table").map((die) => die.value);
    this.renderDiceHUD(); this.updateHUD();
    if (!hasScoringCombination(rolled)) { this.schedule(() => this.bustTurn(), 450); return; }
    if (this.isAITurn()) this.schedule(() => this.playAIChoice(), 650);
  }
  bustTurn() {
    if (!this.gameActive) return;
    this.turnScore = 0; this.awaitingSelection = false; this.turnLocked = true; this.sound.playBust();
    this.$("bust-alert").classList.remove("hidden"); this.updateHUD();
    this.schedule(() => { this.$("bust-alert").classList.add("hidden"); this.passTurn(); }, 1550);
  }
  bankTurn(byAI) {
    if (!this.gameActive || this.turnLocked || this.isRolling || !this.awaitingSelection || (!byAI && !this.isHumanTurn()) || !this.commitSelection()) return;
    const banked = this.turnScore;
    this.players[this.currentPlayer].score += banked;
    this.awaitingSelection = false; this.turnLocked = true; this.sound.playScore(); this.updateHUD(); this.renderDiceHUD();
    if (this.players[this.currentPlayer].score >= this.target) { this.endGame(this.currentPlayer); return; }
    this.showToast(`${this.players[this.currentPlayer].name} encaisse ${this.format(banked)} points.`, 1300);
    this.schedule(() => this.passTurn(), 900);
  }
  passTurn() { if (!this.gameActive) return; this.currentPlayer = 1 - this.currentPlayer; this.startTurn(); }
  playAIChoice() {
    if (!this.gameActive || this.turnLocked || !this.isAITurn() || !this.awaitingSelection) return;
    const available = this.physics.dice.filter((die) => die.state === "table");
    const choice = bestScoringSelection(available);
    if (!choice) { this.bustTurn(); return; }
    choice.indexes.forEach((id) => { this.physics.dice[id].state = "selected"; });
    this.updateHUD(); this.renderDiceHUD();
    const potential = this.turnScore + choice.score;
    const needed = this.target - this.players[1].score;
    const unselected = available.length - choice.indexes.length;
    const nextDice = unselected === 0 ? 6 : unselected;
    const comfortablyAhead = this.players[1].score > this.players[0].score + 350;
    const shouldBank = potential >= needed || potential >= 500 || (nextDice <= 2 && potential >= 250) || (comfortablyAhead && potential >= 300);
    this.showToast(shouldBank ? `L'aubergiste préfère encaisser.` : `L'aubergiste tente encore sa chance.`);
    this.schedule(() => shouldBank ? this.bankTurn(true) : this.rollDice(true), 900);
  }
  updateHUD() {
    const result = this.selectionResult();
    const selectedCount = this.currentSelection().length;
    const rawRemaining = this.physics.dice.filter((die) => die.state === "table").length;
    const afterSelection = rawRemaining - selectedCount;
    const diceToRoll = afterSelection === 0 && result.valid ? 6 : Math.max(0, afterSelection);
    this.players.forEach((player, index) => {
      this.$(`player-name-${index}`).textContent = player.name.toUpperCase();
      this.$(`player-score-${index}`).textContent = this.format(player.score);
      this.$(`player-card-${index}`).classList.toggle("active", index === this.currentPlayer);
    });
    this.$("goal-score").textContent = this.format(this.target);
    this.$("turn-label").textContent = `TOUR DE ${this.players[this.currentPlayer].name.toUpperCase()}`;
    this.$("selected-score").textContent = this.format(result.score);
    this.$("turn-score").textContent = this.format(this.turnScore);
    this.$("dice-remaining").textContent = this.awaitingSelection ? diceToRoll : rawRemaining;
    const detail = this.$("selection-detail");
    detail.classList.toggle("invalid", selectedCount > 0 && !result.valid);
    if (this.isRolling) detail.textContent = "Les dés roulent sur la table…";
    else if (!this.awaitingSelection) detail.textContent = this.isAITurn() ? "L'aubergiste prend les dés…" : "Lancez les dés pour commencer.";
    else if (!selectedCount) detail.textContent = "Sélectionnez au moins un dé ou une combinaison qui marque.";
    else if (!result.valid) detail.textContent = "Sélection incomplète : tous les dés choisis doivent marquer.";
    else detail.textContent = result.breakdown.join(" + ");
    const human = this.isHumanTurn();
    this.$("btn-roll").disabled = !human || this.turnLocked || this.isRolling || (this.awaitingSelection && !result.valid);
    this.$("btn-bank").disabled = !human || this.turnLocked || this.isRolling || !this.awaitingSelection || !result.valid;
    this.$("btn-roll").textContent = this.awaitingSelection ? "GARDER & RELANCER" : "LANCER LES DÉS";
  }
  renderDiceHUD() {
    const container = this.$("dice-container"); container.replaceChildren();
    const result = this.selectionResult();
    this.physics.dice.forEach((die) => {
      const button = document.createElement("button"); button.type = "button";
      button.className = `die-ui ${die.state}${die.state === "selected" && !result.valid ? " invalid" : ""}`;
      button.setAttribute("aria-label", `Dé ${die.id + 1}, valeur ${die.value}, ${die.state === "banked" ? "conservé" : die.state === "selected" ? "sélectionné" : "sur la table"}`);
      button.setAttribute("aria-pressed", String(die.state === "selected"));
      button.disabled = die.state === "banked" || this.turnLocked || this.isRolling || !this.awaitingSelection || !this.isHumanTurn();
      button.textContent = die.value;
      if (die.state === "banked") { const mark = document.createElement("span"); mark.className = "state-mark"; mark.textContent = "✓"; button.appendChild(mark); }
      button.addEventListener("click", () => this.toggleDie(die.id, false)); container.appendChild(button);
    });
  }
  showToast(message, duration = 1100) {
    const toast = this.$("turn-toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
  }
  schedule(callback, delay) { const token = this.epoch; setTimeout(() => { if (this.gameActive && token === this.epoch) callback(); }, delay); }
  endGame(winner) {
    this.gameActive = false; this.turnLocked = true; this.epoch++; this.sound.playVictory();
    const player = this.players[winner]; this.$("winner-title").textContent = `${player.name.toUpperCase()} L'EMPORTE`;
    this.$("winner-copy").textContent = `${player.name} atteint l'objectif de ${this.format(this.target)} points et remporte la partie.`;
    this.$("final-player-0").textContent = `${this.players[0].name} ${this.format(this.players[0].score)}`;
    this.$("final-player-1").textContent = `${this.format(this.players[1].score)} ${this.players[1].name}`;
    const endToken = this.epoch;
    this.scheduleUnsafe(() => { if (this.epoch === endToken) this.showScreen("game-over"); }, 650);
  }
  scheduleUnsafe(callback, delay) { setTimeout(callback, delay); }
  format(value) { return Number(value || 0).toLocaleString("fr-FR"); }
  gameLoop() {
    if (this.gameActive) {
      const moving = this.physics.update(this.sound); this.physics.render(true);
      if (this.isRolling && !moving) this.onRollComplete();
    } else this.physics.render(false);
    requestAnimationFrame(() => this.gameLoop());
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = { evalCombination, hasScoringCombination, bestScoringSelection };
if (typeof window !== "undefined") {
  window.evalCombination = evalCombination;
  window.FarkleRules = { evalCombination, hasScoringCombination, bestScoringSelection };
  window.addEventListener("DOMContentLoaded", () => { window.game = new FarkleGame(); });
}
