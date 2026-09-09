document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. CONFIGURATION & ÉTAT GLOBAL
  // ==========================================
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // UI Elements
  const ui = {
    mainMenu: document.getElementById("main-menu"),
    gameUi: document.getElementById("game-ui"),
    cupArea: document.getElementById("cup-area"),
    cupElement: document.getElementById("cup-element"),
    controlsPerudo: document.getElementById("controls-perudo"),
    controlsCraps: document.getElementById("controls-craps"),
    playerBank: document.getElementById("player-bank"),
    gameInfo: document.getElementById("game-info"),
    historyList: document.getElementById("history-list"),
    btnQuit: document.getElementById("btn-quit"),
  };

  // État du jeu
  const state = {
    mode: null, // 'PERUDO' ou 'CRAPS'
    bank: 1000,
    dice: [],
    isShaking: false,
    shakeForce: 0,
    lastTime: 0,
    arenaRadius: 0,
    center: { x: 0, y: 0 },
  };

  // Audio Context
  let audioCtx = null;

  // ==========================================
  // 2. MOTEUR AUDIO (WEB AUDIO API)
  // ==========================================
  function initAudio() {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playSound(type, intensity = 1) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === "bounce") {
      // Bruit sec de plastique/résine
      osc.type = "triangle";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
      gainNode.gain.setValueAtTime(0.3 * intensity, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "shake") {
      // Bruit sourd de dés dans un gobelet
      osc.type = "square";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "chip") {
      // Son métallique/cristallin de jeton
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, now);
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  // ==========================================
  // 3. MOTEUR PHYSIQUE ET ENTITÉS
  // ==========================================
  class Die {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.size = 40;
      this.radius = this.size * 0.7; // Rayon de collision
      this.vx = (Math.random() - 0.5) * 30;
      this.vy = (Math.random() - 0.5) * 30;
      this.friction = 0.98;
      this.angle = Math.random() * Math.PI * 2;
      this.vAngle = (Math.random() - 0.5) * 0.5;
      this.face = Math.floor(Math.random() * 6) + 1;
      this.isRolling = true;
      this.color = "#ff00ff"; // Magenta par défaut
    }

    update(deltaTime) {
      // Vélocité et Friction
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= this.friction;
      this.vy *= this.friction;

      // Rotation
      this.angle += this.vAngle;
      this.vAngle *= this.friction;

      const speed = Math.hypot(this.vx, this.vy);

      // Changement de face aléatoire pendant le roulement
      if (speed > 1 && Math.random() > 0.7) {
        this.face = Math.floor(Math.random() * 6) + 1;
      }

      // Arrêt complet
      if (speed < 0.1 && this.isRolling) {
        this.vx = 0;
        this.vy = 0;
        this.vAngle = 0;
        this.isRolling = false;
        if (navigator.vibrate) navigator.vibrate(10);
        checkGameState(); // Vérifie les règles une fois les dés arrêtés
      }

      // Collision Arène (Circulaire)
      const distToCenter = Math.hypot(
        this.x - state.center.x,
        this.y - state.center.y,
      );
      if (distToCenter + this.radius > state.arenaRadius) {
        // Vecteur normal de la bordure
        const nx = (this.x - state.center.x) / distToCenter;
        const ny = (this.y - state.center.y) / distToCenter;

        // Repositionnement
        this.x = state.center.x + nx * (state.arenaRadius - this.radius);
        this.y = state.center.y + ny * (state.arenaRadius - this.radius);

        // Réflexion de la vélocité (rebond)
        const dotProduct = this.vx * nx + this.vy * ny;
        this.vx -= 2 * dotProduct * nx;
        this.vy -= 2 * dotProduct * ny;

        // Perte d'énergie sur les bandes
        this.vx *= 0.8;
        this.vy *= 0.8;

        if (speed > 2) playSound("bounce", Math.min(speed / 20, 1));
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Corps du dé (Néon Glass)
      ctx.beginPath();
      ctx.roundRect(-this.size / 2, -this.size / 2, this.size, this.size, 8);
      ctx.fillStyle = "rgba(20, 20, 20, 0.8)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.stroke();

      // Rendu des points
      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 5;
      ctx.shadowColor = "#fff";
      const dotOffset = this.size * 0.25;
      const drawDot = (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      };

      if ([1, 3, 5].includes(this.face)) drawDot(0, 0);
      if ([2, 3, 4, 5, 6].includes(this.face)) {
        drawDot(-dotOffset, -dotOffset);
        drawDot(dotOffset, dotOffset);
      }
      if ([4, 5, 6].includes(this.face)) {
        drawDot(dotOffset, -dotOffset);
        drawDot(-dotOffset, dotOffset);
      }
      if (this.face === 6) {
        drawDot(0, -dotOffset);
        drawDot(0, dotOffset);
      }

      ctx.restore();
    }
  }

  // Résolution des collisions entre dés (AABB basique pour la démo)
  function resolveDiceCollisions() {
    for (let i = 0; i < state.dice.length; i++) {
      for (let j = i + 1; j < state.dice.length; j++) {
        const d1 = state.dice[i];
        const d2 = state.dice[j];
        const dx = d2.x - d1.x;
        const dy = d2.y - d1.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = d1.radius + d2.radius;

        if (distance < minDistance) {
          // Écarte les dés
          const overlap = minDistance - distance;
          const nx = dx / distance;
          const ny = dy / distance;

          d1.x -= (nx * overlap) / 2;
          d1.y -= (ny * overlap) / 2;
          d2.x += (nx * overlap) / 2;
          d2.y += (ny * overlap) / 2;

          // Échange d'énergie (collision élastique simple)
          const tempVx = d1.vx;
          const tempVy = d1.vy;
          d1.vx = d2.vx * 0.8;
          d1.vy = d2.vy * 0.8;
          d2.vx = tempVx * 0.8;
          d2.vy = tempVy * 0.8;

          if (Math.hypot(d1.vx, d1.vy) > 2) playSound("bounce", 0.5);
        }
      }
    }
  }

  // ==========================================
  // 4. LOGIQUE DE JEU ET ÉVÉNEMENTS
  // ==========================================
  function logHistory(message) {
    const li = document.createElement("li");
    li.innerText = `> ${message}`;
    ui.historyList.appendChild(li);
    ui.historyList.parentElement.scrollTop =
      ui.historyList.parentElement.scrollHeight;
  }

  function throwDice(count, color = "#00f3ff") {
    state.dice = [];
    for (let i = 0; i < count; i++) {
      const die = new Die(
        state.center.x + (Math.random() - 0.5) * 50,
        state.center.y + (Math.random() - 0.5) * 50,
      );
      die.color = color;
      state.dice.push(die);
    }
    ui.gameInfo.innerText = "Dés en mouvement...";
  }

  function checkGameState() {
    // Vérifie si TOUS les dés sont arrêtés
    if (state.dice.some((d) => d.isRolling)) return;
    if (state.dice.length === 0) return;

    if (state.mode === "CRAPS") {
      const total = state.dice.reduce((sum, d) => sum + d.face, 0);
      ui.gameInfo.innerText = `Résultat: ${total}`;
      logHistory(`Lancer: ${total}`);
      // Logique Craps simplifiée
      if ([7, 11].includes(total)) {
        logHistory("Gagné ! +100¤");
        updateBank(100);
      } else if ([2, 3, 12].includes(total)) {
        logHistory("Craps ! Perdu -100¤");
        updateBank(-100);
      }
    } else if (state.mode === "PERUDO") {
      ui.gameInfo.innerText = "À vous de jouer / surenchérir";
    }
  }

  function updateBank(amount) {
    state.bank += amount;
    ui.playerBank.innerText = `${state.bank} ¤`;
    playSound("chip");
  }

  // Gobelet : Secousse et Lancer
  let shakeInterval;
  ui.cupArea.addEventListener("mousedown", startShake);
  ui.cupArea.addEventListener("touchstart", startShake, { passive: false });

  window.addEventListener("mouseup", endShake);
  window.addEventListener("touchend", endShake);

  function startShake(e) {
    if (e.cancelable) e.preventDefault();
    initAudio();
    state.isShaking = true;
    ui.cupElement.classList.add("shake-anim");

    shakeInterval = setInterval(() => {
      playSound("shake");
      if (navigator.vibrate) navigator.vibrate(15);
    }, 150);
  }

  function endShake() {
    if (!state.isShaking) return;
    state.isShaking = false;
    ui.cupElement.classList.remove("shake-anim");
    clearInterval(shakeInterval);

    // Lancer les dés selon le mode
    const count = state.mode === "CRAPS" ? 2 : 5;
    const color = state.mode === "CRAPS" ? "#00f3ff" : "#ffaa00";
    throwDice(count, color);
  }

  // ==========================================
  // 5. BOUCLE DE RENDU ET NAVIGATION
  // ==========================================
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.center.x = canvas.width / 2;
    state.center.y = canvas.height / 2 - 50; // Décalé vers le haut à cause de l'UI
    state.arenaRadius = Math.min(canvas.width, canvas.height) * 0.4;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function gameLoop(timestamp) {
    const deltaTime = timestamp - state.lastTime;
    state.lastTime = timestamp;

    // Effacer le canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dessiner l'Arène (Néon)
    ctx.beginPath();
    ctx.arc(state.center.x, state.center.y, state.arenaRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 243, 255, 0.3)";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 30;
    ctx.shadowColor = "#00f3ff";
    ctx.stroke();
    ctx.fillStyle = "rgba(10, 10, 15, 0.8)";
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mise à jour et rendu des dés
    resolveDiceCollisions();
    state.dice.forEach((die) => {
      die.update(deltaTime);
      die.draw(ctx);
    });

    requestAnimationFrame(gameLoop);
  }

  // Navigation des Menus
  document.getElementById("btn-mode-perudo").addEventListener("click", () => {
    initAudio();
    state.mode = "PERUDO";
    ui.mainMenu.classList.add("hidden");
    ui.gameUi.classList.remove("hidden");
    ui.controlsPerudo.classList.remove("hidden");
    logHistory("Démarrage des Dés menteurs. Préparez-vous.");
    throwDice(5, "#ffaa00");
  });

  document.getElementById("btn-mode-craps").addEventListener("click", () => {
    initAudio();
    state.mode = "CRAPS";
    ui.mainMenu.classList.add("hidden");
    ui.gameUi.classList.remove("hidden");
    ui.controlsCraps.classList.remove("hidden");
    logHistory("Démarrage du Craps express. Secouez le gobelet !");
  });

  ui.btnQuit.addEventListener("click", () => {
    state.mode = null;
    state.dice = [];
    ui.gameUi.classList.add("hidden");
    ui.controlsPerudo.classList.add("hidden");
    ui.controlsCraps.classList.add("hidden");
    ui.mainMenu.classList.remove("hidden");
  });

  // Démarrage de la boucle
  requestAnimationFrame(gameLoop);
});
