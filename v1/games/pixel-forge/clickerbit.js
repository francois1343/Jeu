/* ============================================================ */
/* PIXEL FORGE - game.js                                        */
/* Clicker/Idle Game avec Web Audio API + Vibration API         */
/* ============================================================ */

/* ============================================================ */
/* CONFIGURATION GLOBALE & DATA */
/* ============================================================ */

// Configuration des 4 ères technologiques
const ERAS = [
  {
    id: 0,
    name: "8-BITS",
    className: "era-8bits",
    unlockedAt: 0,
    upgrades: [
      {
        id: "cpu386",
        name: "CPU 386",
        effect: "+1 bits/sec",
        baseCost: 15,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "ram16mb",
        name: "RAM 16MB",
        effect: "+2 bits/sec",
        baseCost: 100,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "gpu8bit",
        name: "GPU 8-bits",
        effect: "+5 bits/sec",
        baseCost: 500,
        increment: 1.15,
        owned: 0,
      },
    ],
  },
  {
    id: 1,
    name: "16-BITS",
    className: "era-16bits",
    unlockedAt: 5000,
    upgrades: [
      {
        id: "manette3btn",
        name: "Manette 3 boutons",
        effect: "+10 bits/sec",
        baseCost: 2000,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "cartridge",
        name: "Cartouche poussiéreuse",
        effect: "+25 bits/sec",
        baseCost: 10000,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "coprocessor",
        name: "Co-processeur",
        effect: "+50 bits/sec",
        baseCost: 50000,
        increment: 1.15,
        owned: 0,
      },
    ],
  },
  {
    id: 2,
    name: "32/64-BITS",
    className: "era-32bits",
    unlockedAt: 500000,
    upgrades: [
      {
        id: "cdrom2x",
        name: "Lecteur CD-ROM 2X",
        effect: "+100 bits/sec",
        baseCost: 150000,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "ram128mb",
        name: "RAM 128MB",
        effect: "+250 bits/sec",
        baseCost: 750000,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "gpu3d",
        name: "GPU 3D",
        effect: "+500 bits/sec",
        baseCost: 3500000,
        increment: 1.15,
        owned: 0,
      },
    ],
  },
  {
    id: 3,
    name: "CYBER-RETRO",
    className: "era-cyber",
    unlockedAt: 50000000,
    upgrades: [
      {
        id: "ai_retro",
        name: "IA Rétro",
        effect: "+1000 bits/sec",
        baseCost: 10000000,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "quantum",
        name: "Processeur Quantum",
        effect: "+5000 bits/sec",
        baseCost: 50000000,
        increment: 1.15,
        owned: 0,
      },
      {
        id: "infinite",
        name: "Puissance Infinie",
        effect: "+∞ bits/sec",
        baseCost: 500000000,
        increment: 1.15,
        owned: 0,
      },
    ],
  },
];

// Seuil de référence pour le bonus de Prestige : le seuil de la
// dernière ère. Avant, le bonus était calculé "par milliard de
// bits", alors que la dernière ère se débloque à 50 millions —
// un joueur pouvait prestiger dès l'accès au Reset Matrix pour un
// bonus de 0%. En calant la référence sur ce seuil, atteindre la
// dernière ère garantit déjà un bonus non nul.
const PRESTIGE_REFERENCE_BITS = ERAS[ERAS.length - 1].unlockedAt;

/* ============================================================ */
/* GAME STATE - État global du jeu */
/* ============================================================ */

const gameState = {
  // Ressources
  bits: 0,
  bitsPerSecond: 0,
  prestige: 0,
  prestigeBonus: 1.0, // Multiplicateur de bonus prestige

  // Progression
  currentEra: 0,
  upgrades: {}, // Map de upgrades achetées {id: count}

  // UI/UX
  soundEnabled: true,
  vibrationEnabled: true,

  // Timing
  lastAutoClickTime: Date.now(),
};

// Mémorise le dernier texte de score affiché, pour ne rejouer
// l'animation de "pop" que lorsque la valeur affichée change
// vraiment (voir updateScoreDisplay).
let lastDisplayedScoreText = null;

// Feedback de rythme : la série est volontairement visuelle et
// ne modifie pas l'économie du jeu.
let clickStreak = 0;
let lastClickTimestamp = 0;
let streakResetTimer = null;
let reactorHitTimer = null;
let eraTransitionTimer = null;
let saveStatusTimer = null;

const UPGRADE_ICONS = {
  cpu386: "▦",
  ram16mb: "▤",
  gpu8bit: "◆",
  manette3btn: "✣",
  cartridge: "▰",
  coprocessor: "◈",
  cdrom2x: "◉",
  ram128mb: "▥",
  gpu3d: "◇",
  ai_retro: "◉",
  quantum: "✶",
  infinite: "∞",
};

/* ============================================================ */
/* UTILITY FUNCTIONS - Fonctions utilitaires */
/* ============================================================ */

// Formater un nombre grand en notation lisible (1000 → "1K", 1000000 → "1M")
function formatNumber(num) {
  if (num < 1000) return Math.floor(num).toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + "K";
  if (num < 1000000000) return (num / 1000000).toFixed(1) + "M";
  if (num < 1000000000000) return (num / 1000000000).toFixed(1) + "B";
  return (num / 1000000000000).toFixed(1) + "T";
}

// Clamp un nombre entre min et max
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Obtenir le coût réel d'un upgrade après achat multiple.
// NB : ce coût ne dépend PAS du bonus de prestige. Avant, il était
// multiplié par gameState.prestigeBonus — ce qui rendait chaque
// upgrade plus cher à mesure qu'on prestige, alors que ce même
// bonus augmente aussi la production : le prestige s'annulait
// en grande partie lui-même. Le bonus de prestige n'agit
// maintenant que sur la production (voir recalculateBitsPerSecond).
function getUpgradeCost(upgrade) {
  return Math.floor(
    upgrade.baseCost * Math.pow(upgrade.increment, upgrade.owned),
  );
}

// Obtenir l'ère actuelle
function getCurrentEra() {
  return ERAS[gameState.currentEra];
}

// Checker si une ère est déverrouillée
function isEraUnlocked(eraId) {
  return gameState.bits >= ERAS[eraId].unlockedAt;
}

/* ============================================================ */
/* WEB AUDIO API - Synthèse de sons 8-bits */
/* ============================================================ */

// Contexte audio global (lazy-init)
let audioContext = null;

// Initialiser (ou réactiver) le contexte audio. Sur iOS Safari, un
// AudioContext peut démarrer en état "suspended" et ne jamais
// produire de son tant qu'il n'est pas explicitement relancé au
// sein d'un geste utilisateur — d'où le resume() ci-dessous,
// appelé à chaque interaction (clic, achat...).
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

// Jouer un bip court (click sound)
function playClickSound() {
  if (!gameState.soundEnabled) return;

  initAudioContext();
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  // Une série rapide fait légèrement monter la note : le joueur
  // ressent le rythme sans que cela change la valeur des clics.
  osc.frequency.value = 720 + Math.min(clickStreak, 12) * 24;
  osc.type = "square";

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

  osc.start(now);
  osc.stop(now + 0.05);
}

// Jouer un son d'achat (upgrade purchase)
function playBuySound() {
  if (!gameState.soundEnabled) return;

  initAudioContext();
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.frequency.setValueAtTime(400, now);
  osc.frequency.linearRampToValueAtTime(1000, now + 0.15);
  osc.type = "square";

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

  osc.start(now);
  osc.stop(now + 0.15);
}

// Jouer une fanfare prestige (reset sound)
function playPrestigeSound() {
  if (!gameState.soundEnabled) return;

  initAudioContext();
  const now = audioContext.currentTime;

  // Petite mélodie : do, mi, sol, do
  const notes = [262, 330, 392, 523]; // C4, E4, G4, C5
  const noteDuration = 0.2;

  notes.forEach((freq, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.frequency.value = freq;
    osc.type = "square";

    const startTime = now + index * noteDuration;
    gain.gain.setValueAtTime(0.2, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteDuration);

    osc.start(startTime);
    osc.stop(startTime + noteDuration);
  });
}

// Jouer un son d'erreur (affordance négative)
function playErrorSound() {
  if (!gameState.soundEnabled) return;

  initAudioContext();
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.frequency.setValueAtTime(600, now);
  osc.frequency.linearRampToValueAtTime(200, now + 0.2);
  osc.type = "square";

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

  osc.start(now);
  osc.stop(now + 0.2);
}

/* ============================================================ */
/* VIBRATION API - Haptique mobile */
/* ============================================================ */

// Vibration courte (feedback au click)
function vibrate(duration = 10) {
  if (!gameState.vibrationEnabled) return;
  if ("vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}

// Vibration d'achat (plus longue)
function vibrateBuy() {
  if (!gameState.vibrationEnabled) return;
  if ("vibrate" in navigator) {
    navigator.vibrate([10, 5, 10]);
  }
}

// Vibration prestige (maximal)
function vibratePrestige() {
  if (!gameState.vibrationEnabled) return;
  if ("vibrate" in navigator) {
    navigator.vibrate([20, 10, 20, 10, 20]);
  }
}

/* ============================================================ */
/* FLOATING NUMBERS - Les +1 qui flottent */
/* ============================================================ */

// Créer un nombre flottant au clic
function createFloatingNumber(x, y, value) {
  const container = document.getElementById("floatingContainer");
  if (!container) return;

  const floatDiv = document.createElement("div");

  floatDiv.className = "floating-number";
  floatDiv.textContent = `+${value}`;
  floatDiv.style.left = x + "px";
  floatDiv.style.top = y + "px";

  container.appendChild(floatDiv);

  setTimeout(() => {
    floatDiv.remove();
  }, 1000);
}

// Projection de quelques pixels depuis le point de contact.
function createClickBurst(x, y) {
  const container = document.getElementById("floatingContainer");
  if (
    !container ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  for (let index = 0; index < 7; index += 1) {
    const angle = (Math.PI * 2 * index) / 7 + Math.random() * 0.25;
    const distance = 28 + Math.random() * 28;
    const spark = document.createElement("span");

    spark.className = "click-spark";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
    container.appendChild(spark);

    setTimeout(() => spark.remove(), 560);
  }
}

function updateClickFeedback() {
  const now = performance.now();
  const streakBadge = document.getElementById("streakBadge");
  const reactorZone = document.getElementById("reactorZone");

  clickStreak = now - lastClickTimestamp < 780 ? clickStreak + 1 : 1;
  lastClickTimestamp = now;

  if (streakBadge) {
    streakBadge.textContent = `SÉRIE // ${clickStreak}`;
    streakBadge.classList.toggle("is-active", clickStreak > 1);
  }

  if (reactorZone) {
    reactorZone.classList.remove("reactor-hit");
    void reactorZone.offsetWidth;
    reactorZone.classList.add("reactor-hit");
    clearTimeout(reactorHitTimer);
    reactorHitTimer = setTimeout(
      () => reactorZone.classList.remove("reactor-hit"),
      220,
    );
  }

  clearTimeout(streakResetTimer);
  streakResetTimer = setTimeout(() => {
    clickStreak = 0;
    streakBadge?.classList.remove("is-active");
  }, 1000);
}

function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "game-toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 1700);
}

function showEraTransition(eraName) {
  const transition = document.getElementById("eraTransition");
  const transitionName = document.getElementById("eraTransitionName");
  if (!transition || !transitionName) return;

  clearTimeout(eraTransitionTimer);
  transitionName.textContent = eraName;
  transition.classList.remove("is-active");
  void transition.offsetWidth;
  transition.classList.add("is-active");
  transition.setAttribute("aria-hidden", "false");

  eraTransitionTimer = setTimeout(() => {
    transition.classList.remove("is-active");
    transition.setAttribute("aria-hidden", "true");
  }, 1650);
}

/* ============================================================ */
/* MISE À JOUR DE L'INTERFACE */
/* ============================================================ */

// Mettre à jour l'affichage du score.
// Le "pop" (scoreSlideDown) ne se rejoue que si le texte affiché
// change réellement : avant, l'animation était réinitialisée à
// CHAQUE appel (soit 10x/seconde via l'auto-clicker), causant un
// clignotement permanent du score, même bits/sec à 0.
function updateScoreDisplay() {
  const scoreValue = document.getElementById("scoreValue");
  const bitsPerSecondDisplay = document.getElementById("bitsPerSecond");

  if (!scoreValue || !bitsPerSecondDisplay) {
    console.warn("Score display elements not found");
    return;
  }

  const formattedBits = formatNumber(gameState.bits);
  bitsPerSecondDisplay.textContent = `+${formatNumber(gameState.bitsPerSecond)} bits/sec`;

  if (formattedBits !== lastDisplayedScoreText) {
    scoreValue.textContent = formattedBits;

    // Relance immédiate de l'animation (sans setTimeout) via un
    // forced reflow : plus fiable que l'ancien délai de 10ms.
    scoreValue.style.animation = "none";
    void scoreValue.offsetWidth;
    scoreValue.style.animation = "scoreSlideDown 0.3s ease-out";

    lastDisplayedScoreText = formattedBits;
  }
}

// Mettre à jour l'affichage de l'ère et son objectif visuel.
function updateEraDisplay() {
  const eraName = document.getElementById("eraName");
  const eraProgress = document.getElementById("eraProgress");
  const eraProgressFill = document.getElementById("eraProgressFill");
  const eraTrack = document.getElementById("eraTrack");
  const eraObjective = document.getElementById("eraObjective");
  const prestigeStatus = document.getElementById("prestigeStatus");
  const currentEra = getCurrentEra();

  if (!eraName || !eraProgress || !currentEra) return;

  eraName.textContent = currentEra.name;
  if (prestigeStatus) {
    prestigeStatus.textContent = `CORE x${gameState.prestigeBonus.toFixed(2)}`;
  }

  const nextEraId = gameState.currentEra + 1;
  let progress = 100;

  if (nextEraId < ERAS.length) {
    const nextEra = ERAS[nextEraId];
    const eraRange = nextEra.unlockedAt - currentEra.unlockedAt;
    progress = Math.min(
      100,
      Math.floor(
        ((gameState.bits - currentEra.unlockedAt) / Math.max(1, eraRange)) *
          100,
      ),
    );
    progress = clamp(progress, 0, 100);
    eraProgress.textContent = `${progress}%`;

    if (eraObjective) {
      const remaining = Math.max(0, nextEra.unlockedAt - gameState.bits);
      eraObjective.textContent = `${nextEra.name} // ${formatNumber(remaining)} BITS RESTANTS`;
    }
  } else {
    eraProgress.textContent = "100%";
    if (eraObjective) {
      eraObjective.textContent = "MATRICE COMPLÈTE // PRESTIGE DISPONIBLE";
    }
  }

  if (eraProgressFill) {
    eraProgressFill.style.width = `${progress}%`;
  }
  if (eraTrack) {
    eraTrack.setAttribute("aria-valuenow", progress.toString());
  }
}

// Construire entièrement la liste des upgrades (coûteux : à
// n'appeler que lorsque le contenu doit vraiment changer, c'est-
// à-dire après un achat, un changement d'ère, ou au chargement).
function renderUpgradesList() {
  const upgradesList = document.getElementById("upgradesList");
  if (!upgradesList) {
    console.warn("Upgrades list element not found");
    return;
  }

  upgradesList.innerHTML = "";

  const currentEra = getCurrentEra();
  if (!currentEra || !currentEra.upgrades) {
    console.warn("Current era not found");
    return;
  }

  currentEra.upgrades.forEach((upgrade) => {
    const cost = getUpgradeCost(upgrade);
    const canAfford = gameState.bits >= cost;
    const affordProgress = Math.min(100, (gameState.bits / cost) * 100);

    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.dataset.upgradeId = upgrade.id;
    card.style.setProperty("--afford-progress", `${affordProgress}%`);
    if (!canAfford) card.classList.add("disabled");

    card.innerHTML = `
      <div class="upgrade-card-top">
        <span class="upgrade-icon" aria-hidden="true">${UPGRADE_ICONS[upgrade.id] || "◇"}</span>
        <div class="upgrade-info">
          <div class="upgrade-name">${upgrade.name}</div>
          <div class="upgrade-effect">${upgrade.effect}</div>
        </div>
        <div class="upgrade-owned">LV.${upgrade.owned}</div>
      </div>
      <div class="upgrade-card-bottom">
        <div class="upgrade-cost"><span>COÛT MODULE</span>💾 ${formatNumber(cost)}</div>
      </div>
      <div class="afford-meter" aria-hidden="true">
        <span class="afford-meter-fill"></span>
      </div>
    `;

    const buyBtn = document.createElement("button");
    buyBtn.className = "upgrade-buy-btn";
    buyBtn.type = "button";
    buyBtn.textContent = "INSTALLER";
    buyBtn.setAttribute("aria-label", `Installer ${upgrade.name}`);
    buyBtn.disabled = !canAfford;
    buyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      buyUpgrade(upgrade);
    });

    card.querySelector(".upgrade-card-bottom").appendChild(buyBtn);
    upgradesList.appendChild(card);
  });
}

// Version légère : ne fait que basculer l'état "abordable / pas
// abordable" des cartes déjà présentes, sans reconstruire le DOM.
// C'est cette fonction (et non renderUpgradesList) qui doit
// tourner à chaque tick de l'auto-clicker.
function refreshUpgradesAffordability() {
  const upgradesList = document.getElementById("upgradesList");
  if (!upgradesList) return;

  const currentEra = getCurrentEra();
  if (!currentEra) return;

  currentEra.upgrades.forEach((upgrade) => {
    const card = upgradesList.querySelector(
      `[data-upgrade-id="${upgrade.id}"]`,
    );
    if (!card) return;

    const cost = getUpgradeCost(upgrade);
    const canAfford = gameState.bits >= cost;
    const affordProgress = Math.min(100, (gameState.bits / cost) * 100);

    card.classList.toggle("disabled", !canAfford);
    card.style.setProperty("--afford-progress", `${affordProgress}%`);

    const buyBtn = card.querySelector(".upgrade-buy-btn");
    if (buyBtn) buyBtn.disabled = !canAfford;
  });
}

// Mettre à jour le bouton prestige
function updatePrestigeButton() {
  const prestigeButton = document.getElementById("prestigeButton");
  if (gameState.currentEra === ERAS.length - 1) {
    prestigeButton.style.display = "inline-block";
  } else {
    prestigeButton.style.display = "none";
  }
}

// Calculer le gain de prestige (en %) pour un total de bits donné
function calculatePrestigeGain(bits) {
  return Math.floor((bits / PRESTIGE_REFERENCE_BITS) * 5);
}

// Mettre à jour le modal prestige
function updatePrestigeModal() {
  const prestigeBits = document.getElementById("prestigeBits");
  const prestigeBonus = document.getElementById("prestigeBonus");

  prestigeBits.textContent = formatNumber(gameState.bits);
  prestigeBonus.textContent = calculatePrestigeGain(gameState.bits);
}

// Mettre à jour tous les affichages (coûteux, volontairement).
// À appeler après un achat, un changement d'ère, un prestige ou
// au chargement — jamais dans la boucle d'auto-clicker.
function updateAllDisplay() {
  updateScoreDisplay();
  updateEraDisplay();
  renderUpgradesList();
  updatePrestigeButton();
}

/* ============================================================ */
/* LOGIQUE DE CLICK & AUTO-CLICKER */
/* ============================================================ */

// Ajouter des bits au clic
function clickButton(event) {
  window.ArcadeGameSession?.start({ mode: "clicker" });
  if (!event) return;

  const clickValue = 1; // 1 bit par click
  gameState.bits += clickValue;

  const floatingContainer = document.getElementById("floatingContainer");
  const containerRect = floatingContainer.getBoundingClientRect();

  // Position du clic pour le floating number.
  // Ordre volontaire : changedTouches d'abord (seule liste non
  // vide sur un touchend), puis touches (au cas où on serait
  // appelé depuis touchstart), puis clientX/Y (souris), puis
  // fallback centre écran. Avant, seul "touches" était vérifié :
  // sur touchend, cette liste est toujours vide, donc le "+1"
  // apparaissait systématiquement au centre de l'écran sur
  // mobile au lieu de suivre le doigt.
  let x, y;
  if (event.changedTouches && event.changedTouches.length > 0) {
    x = event.changedTouches[0].clientX;
    y = event.changedTouches[0].clientY;
  } else if (event.touches && event.touches.length > 0) {
    x = event.touches[0].clientX;
    y = event.touches[0].clientY;
  } else if (
    event.clientX !== undefined &&
    (event.clientX !== 0 || event.clientY !== 0)
  ) {
    x = event.clientX;
    y = event.clientY;
  } else {
    x = containerRect.left + containerRect.width / 2;
    y = containerRect.top + containerRect.height / 2;
  }

  // Les coordonnées des événements sont relatives au viewport,
  // tandis que le nombre est positionné dans le gabarit mobile centré.
  const localX = x - containerRect.left;
  const localY = y - containerRect.top;

  createFloatingNumber(localX - 15, localY - 50, clickValue);
  createClickBurst(localX, localY);
  updateClickFeedback();

  playClickSound();
  vibrate(10);

  updateScoreDisplay();
  updateEraDisplay();
  refreshUpgradesAffordability();
}

// Auto-clicker - Générer des bits automatiquement.
// Ne touche plus qu'aux mises à jour légères (texte + état des
// boutons) : la liste d'upgrades n'est plus reconstruite ici.
function autoClick() {
  const now = Date.now();
  const deltaTime = (now - gameState.lastAutoClickTime) / 1000;
  gameState.lastAutoClickTime = now;

  const bitsGenerated = gameState.bitsPerSecond * deltaTime;
  gameState.bits += bitsGenerated;

  updateScoreDisplay();
  updateEraDisplay();
  refreshUpgradesAffordability();
}

// Lancer le loop d'auto-click
function startAutoClickLoop() {
  setInterval(autoClick, 100);
}

/* ============================================================ */
/* SYSTÈME D'UPGRADES */
/* ============================================================ */

// Acheter un upgrade
function buyUpgrade(upgrade) {
  const cost = getUpgradeCost(upgrade);

  if (gameState.bits < cost) {
    playErrorSound();
    vibrate(50);
    return;
  }

  gameState.bits -= cost;
  upgrade.owned += 1;

  recalculateBitsPerSecond();

  playBuySound();
  vibrateBuy();

  showToast(`${upgrade.name} // NIVEAU ${upgrade.owned}`);

  checkForNewEra();

  updateAllDisplay();
}

// Recalculer le BPS (bits per second)
function recalculateBitsPerSecond() {
  gameState.bitsPerSecond = 0;

  ERAS.forEach((era) => {
    era.upgrades.forEach((upgrade) => {
      const match = upgrade.effect.match(/\+(\d+)/);
      if (match) {
        const baseValue = parseInt(match[1]);
        gameState.bitsPerSecond += baseValue * upgrade.owned;
      }
    });
  });

  // Le bonus de prestige n'agit que sur la production, plus sur
  // le coût des upgrades (voir getUpgradeCost).
  gameState.bitsPerSecond *= gameState.prestigeBonus;
}

/* ============================================================ */
/* SYSTÈME D'ÈRES */
/* ============================================================ */

// Checker si une nouvelle ère doit être déverrouillée
function checkForNewEra() {
  if (gameState.currentEra >= ERAS.length - 1) return;

  const nextEraId = gameState.currentEra + 1;
  if (isEraUnlocked(nextEraId)) {
    gameState.currentEra = nextEraId;

    const era = ERAS[nextEraId];
    document.body.className = era.className;

    playBuySound();
    vibratePrestige();

    showEraTransition(era.name);

    updateAllDisplay();
  }
}

// Initialiser les ères au démarrage
function initializeEras() {
  let maxUnlockedEra = 0;
  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (isEraUnlocked(i)) {
      maxUnlockedEra = i;
      break;
    }
  }

  gameState.currentEra = maxUnlockedEra;

  const era = ERAS[gameState.currentEra];
  document.body.className = era.className;
}

/* ============================================================ */
/* PRESTIGE SYSTEM */
/* ============================================================ */

function openPrestigeModal() {
  const modal = document.getElementById("prestigeModal");
  modal.classList.add("modal-active");
  updatePrestigeModal();
}

function closePrestigeModal() {
  const modal = document.getElementById("prestigeModal");
  modal.classList.remove("modal-active");
}

function confirmPrestige() {
  const prestigeGain = calculatePrestigeGain(gameState.bits);
  gameState.prestige += prestigeGain;
  gameState.prestigeBonus = 1.0 + gameState.prestige * 0.01; // +1% par prestige

  gameState.bits = 0;
  gameState.bitsPerSecond = 0;
  gameState.currentEra = 0;

  ERAS.forEach((era) => {
    era.upgrades.forEach((upgrade) => {
      upgrade.owned = 0;
    });
  });

  document.body.className = ERAS[0].className;

  playPrestigeSound();
  vibratePrestige();

  closePrestigeModal();

  saveGameState();
  updateAllDisplay();
}

/* ============================================================ */
/* CONFIRMATION MODAL GÉNÉRIQUE (remplace window.confirm)        */
/* Réutilise les classes .modal / .modal-content déjà stylées    */
/* dans style.css, pour rester cohérent avec l'esthétique du     */
/* jeu au lieu d'ouvrir la popup native du navigateur.            */
/* ============================================================ */

function showConfirmDialog(message, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `
        <div class="modal-content">
            <h2 class="modal-title">⚠️ CONFIRMATION ⚠️</h2>
            <p class="prestige-description">${message}</p>
            <div class="modal-buttons">
                <button type="button" class="btn btn-secondary" data-action="cancel">ANNULER</button>
                <button type="button" class="btn btn-danger" data-action="confirm">CONFIRMER</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  // Ajout de la classe active après insertion pour déclencher la
  // transition CSS existante (.modal.modal-active).
  requestAnimationFrame(() => overlay.classList.add("modal-active"));

  function cleanup() {
    overlay.classList.remove("modal-active");
    setTimeout(() => overlay.remove(), 250);
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });
  overlay
    .querySelector('[data-action="cancel"]')
    .addEventListener("click", cleanup);
  overlay
    .querySelector('[data-action="confirm"]')
    .addEventListener("click", () => {
      cleanup();
      onConfirm();
    });
}

/* ============================================================ */
/* LOCAL STORAGE - Sauvegarde/Restauration */
/* ============================================================ */

const SAVE_KEY = "pixelForge_save";

function updateSaveStatus(label, saved = false) {
  const status = document.querySelector(".save-status");
  const statusLabel = document.getElementById("saveStatusLabel");
  if (!status || !statusLabel) return;

  clearTimeout(saveStatusTimer);
  statusLabel.textContent = label;
  status.classList.toggle("is-saved", saved);

  if (saved) {
    saveStatusTimer = setTimeout(() => {
      statusLabel.textContent = "AUTO-SAVE";
      status.classList.remove("is-saved");
    }, 1800);
  }
}

function saveGameState(showFeedback = false) {
  const saveData = {
    bits: gameState.bits,
    bitsPerSecond: gameState.bitsPerSecond,
    prestige: gameState.prestige,
    prestigeBonus: gameState.prestigeBonus,
    currentEra: gameState.currentEra,
    soundEnabled: gameState.soundEnabled,
    vibrationEnabled: gameState.vibrationEnabled,
    eras: ERAS.map((era) => ({
      upgrades: era.upgrades.map((u) => ({ id: u.id, owned: u.owned })),
    })),
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    if (showFeedback) updateSaveStatus("ENREGISTRÉ", true);
    return true;
  } catch (err) {
    console.error("Erreur lors de la sauvegarde:", err);
    if (showFeedback) updateSaveStatus("ERREUR", false);
    return false;
  }
}

function loadGameState() {
  const saveData = localStorage.getItem(SAVE_KEY);
  if (!saveData) return false;

  try {
    const data = JSON.parse(saveData);

    gameState.bits = data.bits || 0;
    gameState.bitsPerSecond = data.bitsPerSecond || 0;
    gameState.prestige = data.prestige || 0;
    gameState.prestigeBonus = data.prestigeBonus || 1.0;
    gameState.currentEra = data.currentEra || 0;
    gameState.soundEnabled = data.soundEnabled !== false;
    gameState.vibrationEnabled = data.vibrationEnabled !== false;

    if (data.eras) {
      data.eras.forEach((eraData, eraIndex) => {
        if (ERAS[eraIndex] && eraData.upgrades) {
          eraData.upgrades.forEach((upgData) => {
            const upgrade = ERAS[eraIndex].upgrades.find(
              (u) => u.id === upgData.id,
            );
            if (upgrade) {
              upgrade.owned = upgData.owned || 0;
            }
          });
        }
      });
    }

    return true;
  } catch (err) {
    console.error("Erreur lors de la restauration de la sauvegarde:", err);
    return false;
  }
}

// Effacer toutes les données (confirmation via modal thématique,
// plus de window.confirm natif qui cassait l'immersion pixel-art)
function wipeGameData() {
  showConfirmDialog(
    "Cela va réinitialiser TOUT le jeu (bits, upgrades, prestige). Cette action est irréversible.",
    () => {
      gameState.bits = 0;
      gameState.bitsPerSecond = 0;
      gameState.prestige = 0;
      gameState.prestigeBonus = 1.0;
      gameState.currentEra = 0;

      ERAS.forEach((era) => {
        era.upgrades.forEach((upgrade) => {
          upgrade.owned = 0;
        });
      });

      localStorage.removeItem(SAVE_KEY);

      document.body.className = ERAS[0].className;
      updateAllDisplay();
    },
  );
}

/* ============================================================ */
/* NAVIGATION SPA - Gestion des écrans */
/* ============================================================ */

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("screen-active");
  });

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add("screen-active");
  }
}

function updateStartButtonLabel() {
  const label = startButton?.querySelector("span");
  const helper = startButton?.querySelector("small");
  const hasProgress =
    gameState.bits > 0 ||
    gameState.bitsPerSecond > 0 ||
    gameState.prestige > 0 ||
    ERAS.some((era) => era.upgrades.some((upgrade) => upgrade.owned > 0));

  if (!label || !helper) return;

  label.textContent = hasProgress
    ? "REPRENDRE LA FORGE"
    : "INITIALISER LA FORGE";
  helper.textContent = hasProgress
    ? "PROGRESSION SAUVEGARDÉE"
    : "APPUYER POUR COMMENCER";
}

function returnToMenu() {
  saveGameState(true);
  updateStartButtonLabel();
  showScreen("menuScreen");
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("modal-active");
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("modal-active");
  }
}

/* ============================================================ */
/* EVENT LISTENERS - Attacher tous les contrôles */
/* ============================================================ */

const startButton = document.getElementById("startButton");
if (startButton) {
  startButton.addEventListener("click", () => {
    showScreen("gameScreen");
    updateAllDisplay();
  });
} else {
  console.warn("Start button not found");
}

const clickButtonEl = document.getElementById("clickButton");
if (clickButtonEl) {
  clickButtonEl.addEventListener("click", clickButton);

  clickButtonEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
  });
  clickButtonEl.addEventListener("touchend", (e) => {
    e.preventDefault();
    clickButton(e);
  });
} else {
  console.warn("Click button element not found");
}

document
  .getElementById("prestigeButton")
  ?.addEventListener("click", openPrestigeModal);
document
  .getElementById("confirmPrestigeButton")
  ?.addEventListener("click", confirmPrestige);
document
  .getElementById("cancelPrestigeButton")
  ?.addEventListener("click", closePrestigeModal);

document.getElementById("prestigeModal")?.addEventListener("click", (e) => {
  if (e.target.id === "prestigeModal") {
    closePrestigeModal();
  }
});

document.getElementById("settingsButton")?.addEventListener("click", () => {
  openModal("settingsModal");
});

document.getElementById("saveButton")?.addEventListener("click", () => {
  if (saveGameState(true)) {
    showToast("PROGRESSION ENREGISTRÉE");
  }
});

document.getElementById("menuButton")?.addEventListener("click", returnToMenu);

document
  .getElementById("closeSettingsButton")
  ?.addEventListener("click", () => {
    closeModal("settingsModal");
  });

document.getElementById("settingsModal")?.addEventListener("click", (e) => {
  if (e.target.id === "settingsModal") {
    closeModal("settingsModal");
  }
});

document.getElementById("soundToggle")?.addEventListener("change", (e) => {
  gameState.soundEnabled = e.target.checked;
  saveGameState();
});

document.getElementById("vibrationToggle")?.addEventListener("change", (e) => {
  gameState.vibrationEnabled = e.target.checked;
  saveGameState();
});

document
  .getElementById("wipeDataButton")
  ?.addEventListener("click", wipeGameData);

// Fermeture des modals au clavier (Échap) — absente auparavant.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePrestigeModal();
    closeModal("settingsModal");
  }
});

// Sauvegarde de sécurité quand l'onglet passe en arrière-plan ou
// se ferme : avant, seule une sauvegarde toutes les 5s existait,
// pouvant perdre jusqu'à 5s de progression à la fermeture.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveGameState();
  }
});
window.addEventListener("pagehide", () => saveGameState());

/* ============================================================ */
/* INITIALISATION DU JEU */
/* ============================================================ */

function initGame() {
  loadGameState();
  initializeEras();
  recalculateBitsPerSecond();

  showScreen("menuScreen");
  updateAllDisplay();
  updateStartButtonLabel();

  const soundToggle = document.getElementById("soundToggle");
  const vibrationToggle = document.getElementById("vibrationToggle");
  if (soundToggle) soundToggle.checked = gameState.soundEnabled;
  if (vibrationToggle) vibrationToggle.checked = gameState.vibrationEnabled;

  startAutoClickLoop();

  setInterval(saveGameState, 5000);
  setInterval(checkForNewEra, 100);

  console.log("🎮 Pixel Forge initialisé. Bits:", formatNumber(gameState.bits));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGame);
} else {
  setTimeout(initGame, 100);
}
