// Neon Card Match - logique de partie et classement quotidien local
const DIFFICULTES = Object.freeze({
  easy: Object.freeze({ label: "Facile", detail: "1 couleur · ♥", couleurs: Object.freeze(["coeur"]) }),
  normal: Object.freeze({ label: "Normal", detail: "2 couleurs · ♥ ♠", couleurs: Object.freeze(["coeur", "pique"]) }),
  hard: Object.freeze({ label: "Difficile", detail: "4 couleurs · ♥ ♦ ♣ ♠", couleurs: Object.freeze(["coeur", "carreau", "trefle", "pique"]) }),
});
const SYMBOLES = Object.freeze({ coeur: "♥", pique: "♠", carreau: "♦", trefle: "♣" });
const NOMBRE_TIRAGES = 10;
const TAILLE_MAIN = 5;
const DUREE_PARTIE = 60;
const SCORE_MINIMUM_VICTOIRE = 3;
const DAILY_LEADERBOARD_KEY = "francis-arcade-neon-card-match-daily-v2";
const LEGACY_LEADERBOARD_KEY = "francis-arcade-neon-card-match-daily-v1";

let mainJoueur = [];
let deckOrdi = [];
let tourIndex = 0;
let score = 0;
let tempsRestant = DUREE_PARTIE;
let intervalTimer = null;
let jeuFini = false;
let dropEventsInitialised = false;
let resetAtMidnightTimer = null;
let difficulteSelectionnee = "normal";
let carteEnCoursDeDrag = null;
let indexCarteDragguee = null;

const elScore = document.getElementById("score");
const elTour = document.getElementById("turn");
const elTimer = document.getElementById("timer");
const elCarteOrdi = document.getElementById("computer-card-display");
const elMainJoueur = document.getElementById("player-hand");
const elDropZone = document.getElementById("drop-zone");
const elMessage = document.getElementById("game-message");
const btnPasser = document.getElementById("btn-pass");
const btnRejouer = document.getElementById("btn-replay");
const btnStart = document.getElementById("btn-start");
const btnMenu = document.getElementById("btn-menu");
const btnResultMenu = document.getElementById("btn-result-menu");
const btnLeaderboard = document.getElementById("btn-leaderboard");
const btnCloseLeaderboard = document.getElementById("btn-close-leaderboard");
const leaderboardModal = document.getElementById("leaderboard-modal");
const menuScreen = document.getElementById("menu-screen");
const gameScreen = document.getElementById("game-screen");
const resultPanel = document.getElementById("result-panel");
const resultTitle = document.getElementById("result-title");
const resultMessage = document.getElementById("result-message");
const resultScore = document.getElementById("result-score");
const leaderboardList = document.getElementById("daily-leaderboard");
const leaderboardEmpty = document.getElementById("leaderboard-empty");
const leaderboardDate = document.getElementById("leaderboard-date");
const leaderboardMode = document.getElementById("leaderboard-mode");
const difficultyButtons = document.querySelectorAll("[data-difficulty]");
const difficultyDescription = document.getElementById("difficulty-description");
const gameDifficulty = document.getElementById("game-difficulty");

function genererPaquetComplet() {
  const paquet = [];
  for (const couleur of DIFFICULTES[difficulteSelectionnee].couleurs) {
    for (let valeur = 1; valeur <= 10; valeur += 1) paquet.push({ valeur, couleur });
  }
  return paquet;
}

function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

function cleDuJour(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function scoresVides() {
  return { easy: [], normal: [], hard: [] };
}

function normaliserScores(scores) {
  return (Array.isArray(scores) ? scores : [])
    .filter((entry) => Number.isFinite(Number(entry?.score)) && typeof entry?.name === "string")
    .map((entry) => ({
      name: entry.name.slice(0, 24),
      score: Math.max(0, Math.floor(Number(entry.score))),
      timestamp: Number(entry.timestamp) || 0,
    }))
    .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
    .slice(0, 5);
}

function lireClassementDuJour() {
  const date = cleDuJour();
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_LEADERBOARD_KEY) || "null");
    if (saved?.date === date) {
      const scores = scoresVides();
      if (Array.isArray(saved.scores)) scores.normal = normaliserScores(saved.scores);
      else Object.keys(scores).forEach((difficulty) => { scores[difficulty] = normaliserScores(saved.scores?.[difficulty]); });
      return { date, scores };
    }

    const legacy = JSON.parse(localStorage.getItem(LEGACY_LEADERBOARD_KEY) || "null");
    const fresh = {
      date,
      scores: {
        ...scoresVides(),
        normal: legacy?.date === date ? normaliserScores(legacy.scores) : [],
      },
    };
    localStorage.setItem(DAILY_LEADERBOARD_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return { date, scores: scoresVides() };
  }
}

function enregistrerClassement(classement) {
  try {
    localStorage.setItem(DAILY_LEADERBOARD_KEY, JSON.stringify(classement));
  } catch {
    // Le jeu reste jouable même sans stockage local.
  }
}

function nomDuJoueur() {
  const pseudo = window.ArcadeLocalStore?.getActiveProfile?.()?.pseudo;
  return typeof pseudo === "string" && pseudo.trim() ? pseudo.trim().slice(0, 24) : "Joueur";
}

function ajouterScoreDuJour(points) {
  const classement = lireClassementDuJour();
  classement.scores[difficulteSelectionnee].push({
    name: nomDuJoueur(),
    score: Math.max(0, Math.floor(points)),
    timestamp: Date.now(),
  });
  classement.scores[difficulteSelectionnee] = normaliserScores(classement.scores[difficulteSelectionnee]);
  enregistrerClassement(classement);
  afficherClassementDuJour();
}

function afficherClassementDuJour() {
  const classement = lireClassementDuJour();
  const entries = classement.scores[difficulteSelectionnee] || [];
  leaderboardList.innerHTML = "";
  leaderboardDate.textContent = `Réinitialisation à minuit · ${new Date().toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })}`;
  leaderboardMode.textContent = `Mode ${DIFFICULTES[difficulteSelectionnee].label.toLowerCase()} · ${DIFFICULTES[difficulteSelectionnee].detail}`;

  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-entry";

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = ["★", "◆", "●"][index] || String(index + 1);

    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = entry.name;

    const points = document.createElement("strong");
    points.className = "leaderboard-score";
    points.textContent = `${entry.score} pts`;

    item.append(rank, name, points);
    leaderboardList.appendChild(item);
  });

  leaderboardEmpty.hidden = entries.length > 0;
}

function choisirDifficulte(difficulty) {
  if (!DIFFICULTES[difficulty]) return;
  difficulteSelectionnee = difficulty;
  const selected = DIFFICULTES[difficulty];

  difficultyButtons.forEach((button) => {
    const active = button.dataset.difficulty === difficulty;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  difficultyDescription.textContent = `${selected.label} : ${selected.detail}. Plus il y a de couleurs, plus le signal est difficile à retrouver.`;
  gameDifficulty.textContent = `${selected.label} · ${selected.detail}`;
  afficherClassementDuJour();
}

function programmerResetMinuit() {
  if (resetAtMidnightTimer) clearTimeout(resetAtMidnightTimer);
  const prochainMinuit = new Date();
  prochainMinuit.setHours(24, 0, 0, 50);
  resetAtMidnightTimer = setTimeout(() => {
    enregistrerClassement({ date: cleDuJour(), scores: scoresVides() });
    afficherClassementDuJour();
    programmerResetMinuit();
  }, prochainMinuit.getTime() - Date.now());
}

function ouvrirClassement() {
  afficherClassementDuJour();
  leaderboardModal.classList.remove("hidden");
  btnCloseLeaderboard.focus();
}

function fermerClassement() {
  leaderboardModal.classList.add("hidden");
  btnLeaderboard.focus();
}

function afficherMenu() {
  clearInterval(intervalTimer);
  intervalTimer = null;
  carteEnCoursDeDrag = null;
  indexCarteDragguee = null;
  resultPanel.classList.add("hidden");
  gameScreen.classList.add("hidden");
  gameScreen.setAttribute("aria-hidden", "true");
  menuScreen.classList.remove("hidden");
  menuScreen.setAttribute("aria-hidden", "false");
  afficherClassementDuJour();
}

function afficherJeu() {
  menuScreen.classList.add("hidden");
  menuScreen.setAttribute("aria-hidden", "true");
  gameScreen.classList.remove("hidden");
  gameScreen.setAttribute("aria-hidden", "false");
}

function nouvellePartie() {
  score = 0;
  tourIndex = 0;
  tempsRestant = DUREE_PARTIE;
  jeuFini = false;
  clearInterval(intervalTimer);

  const paquetMelange = melanger(genererPaquetComplet());
  mainJoueur = paquetMelange.slice(0, TAILLE_MAIN);
  deckOrdi = melanger([...mainJoueur, ...paquetMelange.slice(TAILLE_MAIN, NOMBRE_TIRAGES)]);

  resultPanel.classList.add("hidden");
  btnPasser.disabled = false;
  elTimer.classList.remove("timer-low");
  elMessage.textContent = "";
  majScoreUI();
  majTimerUI();
  initialiserEventsDrop();
  afficherTour();
  demarrerChrono();
}

function demarrerPartie() {
  window.ArcadeGameSession?.start({ mode: difficulteSelectionnee, difficulty: difficulteSelectionnee });
  afficherJeu();
  nouvellePartie();
}

function demarrerChrono() {
  intervalTimer = setInterval(() => {
    tempsRestant -= 1;
    majTimerUI();
    if (tempsRestant <= 10) elTimer.classList.add("timer-low");
    if (tempsRestant <= 0) terminerPartie("Temps écoulé.");
  }, 1000);
}

function majTimerUI() {
  elTimer.textContent = Math.max(0, tempsRestant);
}

function majScoreUI() {
  elScore.textContent = score;
}

function afficherTour() {
  if (jeuFini) return;
  if (tourIndex >= NOMBRE_TIRAGES) {
    terminerPartie("Les 10 signaux ont été reçus.");
    return;
  }

  elTour.textContent = tourIndex + 1;
  elMessage.textContent = "";
  elCarteOrdi.innerHTML = creerElementCarteHTML(deckOrdi[tourIndex]);
  afficherMainJoueur();
}

function creerElementCarteHTML(carte) {
  return `<div class="card ${carte.couleur}"><span>${carte.valeur}</span><span class="symbol">${SYMBOLES[carte.couleur]}</span></div>`;
}

function afficherMainJoueur() {
  elMainJoueur.innerHTML = "";
  mainJoueur.forEach((carte, index) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = creerElementCarteHTML(carte);
    const divCarte = tempDiv.firstElementChild;
    divCarte.setAttribute("draggable", "true");
    divCarte.addEventListener("dragstart", (event) => {
      carteEnCoursDeDrag = carte;
      indexCarteDragguee = index;
      event.target.classList.add("active");
      event.dataTransfer.effectAllowed = "move";
    });
    divCarte.addEventListener("dragend", (event) => event.target.classList.remove("active"));
    elMainJoueur.appendChild(divCarte);
  });
}

function initialiserEventsDrop() {
  if (dropEventsInitialised) return;
  dropEventsInitialised = true;

  elDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elDropZone.classList.add("active");
  });
  elDropZone.addEventListener("dragleave", (event) => {
    event.preventDefault();
    elDropZone.classList.remove("active");
  });
  elDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elDropZone.classList.remove("active");
    if (!carteEnCoursDeDrag || jeuFini) return;
    traiterTentative(carteEnCoursDeDrag, indexCarteDragguee);
    carteEnCoursDeDrag = null;
    indexCarteDragguee = null;
  });
}

function traiterTentative(carteJoueur, index) {
  const carteOrdi = deckOrdi[tourIndex];
  if (carteJoueur.valeur === carteOrdi.valeur && carteJoueur.couleur === carteOrdi.couleur) {
    score += 1;
    mainJoueur.splice(index, 1);
    majScoreUI();
    tourSuivant();
  } else if (carteJoueur.valeur === carteOrdi.valeur) {
    elMessage.textContent = "Même valeur, mauvaise couleur : passez ce signal.";
  } else {
    elMessage.textContent = "Cette carte ne correspond pas au signal.";
  }
}

function tourSuivant() {
  if (!jeuFini) {
    tourIndex += 1;
    afficherTour();
  }
}

function terminerPartie(message) {
  if (jeuFini) return;
  jeuFini = true;
  clearInterval(intervalTimer);
  intervalTimer = null;
  btnPasser.disabled = true;
  elTimer.classList.remove("timer-low");
  elCarteOrdi.innerHTML = '<div class="card end-card">FIN</div>';

  const victoire = score >= SCORE_MINIMUM_VICTOIRE;
  resultTitle.textContent = victoire ? "Signal maîtrisé !" : "Transmission terminée";
  resultMessage.textContent = `${message} ${victoire ? "Vous atteignez le seuil de victoire." : "Atteignez 3 points pour valider la victoire Arcade."}`;
  resultScore.textContent = score;
  resultPanel.classList.remove("hidden");

  ajouterScoreDuJour(score);
  window.ArcadeGameSession?.completeByScore(score, {
    score,
    turnsPlayed: tourIndex,
    timeRemaining: Math.max(0, tempsRestant),
    difficulty: difficulteSelectionnee,
  });
}

difficultyButtons.forEach((button) => button.addEventListener("click", () => choisirDifficulte(button.dataset.difficulty)));
btnStart.addEventListener("click", demarrerPartie);
btnPasser.addEventListener("click", tourSuivant);
btnRejouer.addEventListener("click", demarrerPartie);
btnMenu.addEventListener("click", () => {
  if (!jeuFini) window.ArcadeGameSession?.abandon("menu_return");
  afficherMenu();
});
btnLeaderboard.addEventListener("click", ouvrirClassement);
btnCloseLeaderboard.addEventListener("click", fermerClassement);
leaderboardModal.addEventListener("click", (event) => {
  if (event.target === leaderboardModal) fermerClassement();
});
btnResultMenu.addEventListener("click", () => {
  afficherMenu();
  ouvrirClassement();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !leaderboardModal.classList.contains("hidden")) fermerClassement();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) afficherClassementDuJour();
});

choisirDifficulte("normal");
programmerResetMinuit();
