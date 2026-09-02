(function diceDistrict() {
  "use strict";

  const SETTINGS_KEY = "francis_arcade_dice_settings_v1";
  const STATS_KEY = "francis_arcade_dice_stats_v1";
  const CONFIG_KEY = "francis_arcade_dice_config_v1";
  const MAX_RECENT = 12;
  const MAX_BOARD = 20;

  const modes = Object.freeze({
    magic: Object.freeze({
      title: "Dé Magique",
      kicker: "MODE CLASSIQUE",
      description: "Choisissez le nombre de dés et de faces, puis laissez le hasard décider.",
      players: "1+",
      duration: "LIBRE",
      level: "FACILE",
      ready: true,
      table: "TABLE 01",
      rules: `
        <p>Le générateur conserve le fonctionnement du jeu original : choisissez entre 2 et 100 faces, puis lancez maintenant de 1 à 12 dés simultanément. Chaque dé produit une valeur aléatoire comprise entre 1 et son nombre de faces.</p>
        <h3>COMMENT JOUER</h3>
        <ol><li>Choisissez le nombre de faces ou utilisez un préréglage D4 à D100.</li><li>Choisissez ensuite entre 1 et 12 dés.</li><li>Appuyez sur « Lancer les dés », cliquez sur le plateau ou utilisez la barre Espace.</li><li>Les résultats, le total et vos statistiques sont enregistrés localement.</li></ol>
        <h3>CLASSEMENT</h3>
        <p>Pour comparer des configurations différentes, le leaderboard utilise le total obtenu par rapport au maximum possible : 18 sur 2D10 vaut 90 %, par exemple.</p>`,
    }),
    "421": Object.freeze({
      title: "421",
      kicker: "MODE COMBINAISONS",
      description: "Trois dés, des combinaisons et jusqu’à trois lancers par manche.",
      players: "2–4",
      duration: "10 MIN",
      level: "MOYEN",
      ready: false,
      table: "TABLE 02",
      rules: `
        <p class="coming-note">Cette table est préparée dans le hub mais son moteur de jeu n’est pas encore activé.</p>
        <h3>FORMAT PRÉVU</h3>
        <ol><li>Chaque joueur lance trois dés.</li><li>Il peut conserver certains dés et relancer les autres, avec trois lancers maximum.</li><li>Les combinaisons seront comparées selon les règles affichées dans la future table Francis Arcade.</li></ol>
        <p>Son historique et son classement disposent déjà d’un espace séparé de celui du Dé Magique.</p>`,
    }),
    yahtzee: Object.freeze({
      title: "Yahtzee",
      kicker: "MODE SCORE",
      description: "Cinq dés, treize catégories de score et des choix tactiques à chaque tour.",
      players: "1–4",
      duration: "15 MIN",
      level: "MOYEN",
      ready: false,
      table: "TABLE 03",
      rules: `
        <p class="coming-note">La feuille de score et le moteur à cinq dés seront ajoutés dans une prochaine évolution.</p>
        <h3>FORMAT PRÉVU</h3>
        <ol><li>Lancez cinq dés jusqu’à trois fois par tour.</li><li>Gardez les dés utiles entre les lancers.</li><li>Inscrivez le résultat dans une catégorie encore libre de la feuille de score.</li></ol>
        <p>Les scores Yahtzee resteront séparés des résultats du Dé Magique et du 421.</p>`,
    }),
  });

  const availableThemes = Object.freeze(["solar", "electric", "ultraviolet", "emerald", "crimson"]);
  const defaultSettings = Object.freeze({ sound: true, vibration: true, animation: true, dieClick: true, theme: "solar" });
  let selectedMode = "magic";
  let boardMode = "magic";
  let rolling = false;
  let clearArmed = false;
  let clearTimer = 0;
  let audioContext = null;
  let toastTimer = 0;
  let settings = loadJson(SETTINGS_KEY, defaultSettings);
  let diceConfig = loadJson(CONFIG_KEY, { faces: 6, count: 1 });
  let stats = loadJson(STATS_KEY, {
    magic: { totalRolls: 0, totalRatio: 0, best: null, recent: [], leaderboard: [] },
    "421": { leaderboard: [] },
    yahtzee: { leaderboard: [] },
  });

  const elements = {};

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" ? { ...fallback, ...value } : JSON.parse(JSON.stringify(fallback));
    } catch (_) {
      return JSON.parse(JSON.stringify(fallback));
    }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Le jeu reste utilisable sans stockage. */ }
  }

  function cacheElements() {
    [
      "player-name", "menu-screen", "game-screen", "mode-status", "selected-mode-kicker", "selected-mode-title",
      "selected-mode-description", "mode-players", "mode-duration", "mode-level", "play-button", "availability-note",
      "open-rules", "open-leaderboard", "open-settings", "open-settings-header", "back-to-menu", "game-rules",
      "game-leaderboard", "game-settings", "play-die", "result-caption", "roll-button", "generator-state", "roll-summary", "roll-total",
      "dice-faces", "faces-label", "dice-count", "count-label", "stat-rolls", "stat-best", "stat-average", "roll-history", "clear-history",
      "leaderboard-dialog", "leaderboard-list", "rules-dialog", "rules-kicker", "rules-title", "rules-copy",
      "settings-dialog", "settings-form", "setting-sound", "setting-vibration", "setting-animation", "setting-die-click", "toast",
    ].forEach((id) => { elements[id] = document.getElementById(id); });
  }

  function activePlayer() {
    try { return window.ArcadeLocalStore?.getActiveProfile?.()?.pseudo || "JOUEUR LOCAL"; } catch (_) { return "JOUEUR LOCAL"; }
  }

  function normaliseStats() {
    stats.magic ||= {};
    stats.magic.totalRolls = Number(stats.magic.totalRolls || 0);
    stats.magic.totalRatio = Number(stats.magic.totalRatio || 0);
    stats.magic.recent = Array.isArray(stats.magic.recent) ? stats.magic.recent : [];
    stats.magic.leaderboard = Array.isArray(stats.magic.leaderboard) ? stats.magic.leaderboard : [];
    stats["421"] ||= { leaderboard: [] };
    stats.yahtzee ||= { leaderboard: [] };
    stats["421"].leaderboard = Array.isArray(stats["421"].leaderboard) ? stats["421"].leaderboard : [];
    stats.yahtzee.leaderboard = Array.isArray(stats.yahtzee.leaderboard) ? stats.yahtzee.leaderboard : [];
  }

  function applySettings() {
    settings = { ...defaultSettings, ...settings };
    document.body.dataset.theme = availableThemes.includes(settings.theme) ? settings.theme : "solar";
    elements["setting-sound"].checked = Boolean(settings.sound);
    elements["setting-vibration"].checked = Boolean(settings.vibration);
    elements["setting-animation"].checked = Boolean(settings.animation);
    elements["setting-die-click"].checked = Boolean(settings.dieClick);
    const themeInput = document.querySelector(`input[name="theme"][value="${document.body.dataset.theme}"]`);
    if (themeInput) themeInput.checked = true;
    elements["play-die"].setAttribute("aria-disabled", String(!settings.dieClick));
    elements["play-die"].title = settings.dieClick ? "Cliquer pour lancer les dés" : "Activez « Clic sur le dé » dans les paramètres";
  }

  function selectMode(modeKey) {
    if (!modes[modeKey]) return;
    selectedMode = modeKey;
    const mode = modes[modeKey];
    document.querySelectorAll(".table-card[data-mode]").forEach((card) => {
      const active = card.dataset.mode === modeKey;
      card.classList.toggle("is-selected", active);
      card.setAttribute("aria-checked", String(active));
    });
    elements["selected-mode-kicker"].textContent = mode.kicker;
    elements["selected-mode-title"].textContent = mode.title;
    elements["selected-mode-description"].textContent = mode.description;
    elements["mode-players"].textContent = mode.players;
    elements["mode-duration"].textContent = mode.duration;
    elements["mode-level"].textContent = mode.level;
    elements["mode-status"].textContent = mode.ready ? "PRÊT" : "EN PRÉPARATION";
    elements["play-button"].disabled = !mode.ready;
    elements["play-button"].querySelector("span").textContent = mode.ready ? "JOUER" : "BIENTÔT DISPONIBLE";
    elements["availability-note"].textContent = mode.ready
      ? "Mode d’entraînement gratuit · aucun Coin débité"
      : "Consultez déjà les règles et le futur classement de cette table";
  }

  function showScreen(name) {
    const playing = name === "game";
    elements["menu-screen"].hidden = playing;
    elements["menu-screen"].classList.toggle("is-active", !playing);
    elements["game-screen"].hidden = !playing;
    elements["game-screen"].classList.toggle("is-active", playing);
    window.scrollTo({ top: 0, behavior: settings.animation ? "smooth" : "auto" });
    (playing ? elements["roll-button"] : elements["play-button"]).focus({ preventScroll: true });
  }

  function startMagicSession() {
    window.ArcadeGameSession?.start?.({ mode: "magic", faces: currentFaces(), diceCount: currentCount(), source: "dice_hub_play" });
  }

  function playSelectedMode() {
    if (!modes[selectedMode].ready) return;
    startMagicSession();
    showScreen("game");
    sound(680, .07, "square");
  }

  function openDialog(dialog) {
    if (!dialog?.showModal || dialog.open) return;
    dialog.showModal();
  }

  function closeDialog(button) {
    button.closest("dialog")?.close();
  }

  function openRules(modeKey = selectedMode) {
    const mode = modes[modeKey] || modes.magic;
    elements["rules-kicker"].textContent = mode.table;
    elements["rules-title"].textContent = `RÈGLES · ${mode.title.toUpperCase()}`;
    elements["rules-copy"].innerHTML = mode.rules;
    openDialog(elements["rules-dialog"]);
  }

  function renderLeaderboard() {
    const list = stats[boardMode]?.leaderboard || [];
    elements["leaderboard-list"].replaceChildren();
    if (!list.length) {
      const empty = document.createElement("li");
      empty.className = "empty-board";
      empty.textContent = modes[boardMode].ready ? "Aucun lancer classé. À vous d’ouvrir le tableau." : "Table en préparation · classement réservé.";
      elements["leaderboard-list"].appendChild(empty);
      return;
    }
    list.slice(0, 10).forEach((entry, index) => {
      const item = document.createElement("li");
      const rankPlayer = document.createElement("span");
      rankPlayer.className = "rank-player";
      const rank = document.createElement("b");
      rank.className = "rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      const player = document.createElement("span");
      player.className = "player";
      const name = document.createElement("strong");
      name.textContent = entry.player || "JOUEUR LOCAL";
      const date = document.createElement("small");
      date.textContent = new Date(entry.date).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
      player.append(name, date);
      rankPlayer.append(rank, player);
      const result = document.createElement("span");
      result.className = "board-result";
      const score = document.createElement("strong");
      score.textContent = `${Math.round(entry.ratio * 100)} %`;
      const detail = document.createElement("small");
      const diceCount = Number(entry.diceCount || 1);
      const total = Number(entry.total ?? entry.result ?? 0);
      detail.textContent = diceCount > 1 ? `${total} / ${diceCount * entry.faces} · ${diceCount}D${entry.faces}` : `${total} / D${entry.faces}`;
      result.append(score, detail);
      item.append(rankPlayer, result);
      elements["leaderboard-list"].appendChild(item);
    });
  }

  function openLeaderboard(modeKey = selectedMode) {
    boardMode = modes[modeKey] ? modeKey : "magic";
    document.querySelectorAll("[data-board-mode]").forEach((tab) => {
      const active = tab.dataset.boardMode === boardMode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderLeaderboard();
    openDialog(elements["leaderboard-dialog"]);
  }

  function currentFaces() {
    const value = Math.round(Number(elements["dice-faces"].value) || 6);
    return Math.min(100, Math.max(2, value));
  }

  function updateFaces(value, commit = true) {
    const faces = Math.min(100, Math.max(2, Math.round(Number(value) || 6)));
    if (commit) {
      elements["dice-faces"].value = String(faces);
      diceConfig.faces = faces;
      saveJson(CONFIG_KEY, diceConfig);
    }
    elements["faces-label"].textContent = `D${faces}`;
    document.querySelectorAll("[data-faces]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.faces) === faces));
    return faces;
  }

  function currentCount() {
    const value = Math.round(Number(elements["dice-count"].value) || 1);
    return Math.min(12, Math.max(1, value));
  }

  function updateCount(value, commit = true) {
    const count = Math.min(12, Math.max(1, Math.round(Number(value) || 1)));
    if (commit) {
      elements["dice-count"].value = String(count);
      diceConfig.count = count;
      saveJson(CONFIG_KEY, diceConfig);
    }
    elements["count-label"].textContent = `×${count}`;
    elements["roll-button"].querySelector("span").textContent = count === 1 ? "LANCER LE DÉ" : `LANCER ${count} DÉS`;
    document.querySelectorAll("[data-count]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.count) === count));
    if (!rolling) {
      renderDiceValues(Array(count).fill("?"));
      elements["roll-summary"].hidden = true;
      elements["result-caption"].textContent = count === 1 ? "Configurez le dé puis lancez-le." : `${count} dés prêts sur le plateau.`;
    }
    return count;
  }

  function renderDiceValues(values) {
    elements["play-die"].replaceChildren();
    elements["play-die"].classList.toggle("is-multi", values.length > 1);
    elements["play-die"].classList.toggle("is-crowded", values.length > 6);
    elements["play-die"].dataset.count = String(values.length);
    values.forEach((value, index) => {
      const die = document.createElement("span");
      die.className = "result-die";
      if (index === 0) die.id = "dice-result";
      die.textContent = String(value);
      die.style.setProperty("--die-tilt", `${((index % 5) - 2) * 1.5}deg`);
      elements["play-die"].appendChild(die);
    });
    elements["play-die"].setAttribute("aria-label", values.every((value) => value === "?")
      ? `${values.length} ${values.length > 1 ? "dés prêts" : "dé prêt"}`
      : `Résultats : ${values.join(", ")}`);
  }

  function sound(frequency, duration = .06, type = "sine") {
    if (!settings.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) { /* Audio optionnel. */ }
  }

  function vibrate(pattern) {
    if (settings.vibration && navigator.vibrate) navigator.vibrate(pattern);
  }

  function recordRoll(values, faces) {
    const total = values.reduce((sum, value) => sum + value, 0);
    const diceCount = values.length;
    const entry = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, date: new Date().toISOString(), player: activePlayer(), values, result: total, total, diceCount, faces, ratio: total / (faces * diceCount) };
    stats.magic.totalRolls += 1;
    stats.magic.totalRatio += entry.ratio;
    stats.magic.recent.unshift(entry);
    stats.magic.recent = stats.magic.recent.slice(0, MAX_RECENT);
    if (!stats.magic.best || entry.ratio > stats.magic.best.ratio || (entry.ratio === stats.magic.best.ratio && entry.total > (stats.magic.best.total ?? stats.magic.best.result))) stats.magic.best = entry;
    stats.magic.leaderboard.push(entry);
    stats.magic.leaderboard.sort((a, b) => b.ratio - a.ratio || (b.total ?? b.result) - (a.total ?? a.result) || Date.parse(a.date) - Date.parse(b.date));
    stats.magic.leaderboard = stats.magic.leaderboard.slice(0, MAX_BOARD);
    saveJson(STATS_KEY, stats);
    renderStats();
  }

  function renderStats() {
    const magic = stats.magic;
    elements["stat-rolls"].textContent = new Intl.NumberFormat("fr-BE").format(magic.totalRolls);
    if (magic.best) {
      const bestCount = Number(magic.best.diceCount || 1);
      const bestTotal = Number(magic.best.total ?? magic.best.result);
      elements["stat-best"].textContent = `${bestTotal}/${bestCount * magic.best.faces}`;
    } else elements["stat-best"].textContent = "—";
    elements["stat-average"].textContent = magic.totalRolls ? `${Math.round((magic.totalRatio / magic.totalRolls) * 100)} %` : "—";
    elements["roll-history"].replaceChildren();
    if (!magic.recent.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "Aucun lancer enregistré.";
      elements["roll-history"].appendChild(empty);
      return;
    }
    magic.recent.forEach((entry, index) => {
      const item = document.createElement("li");
      const number = document.createElement("b");
      number.textContent = String(index + 1).padStart(2, "0");
      const meta = document.createElement("span");
      const diceCount = Number(entry.diceCount || 1);
      const values = Array.isArray(entry.values) ? entry.values : [entry.result];
      meta.textContent = `${new Date(entry.date).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })} · ${diceCount}D${entry.faces} · ${values.join(" + ")}`;
      const result = document.createElement("strong");
      result.textContent = `Σ ${entry.total ?? entry.result}`;
      item.append(number, meta, result);
      elements["roll-history"].appendChild(item);
    });
  }

  function finishRoll(values, faces) {
    const total = values.reduce((sum, value) => sum + value, 0);
    const maximum = faces * values.length;
    renderDiceValues(values);
    elements["play-die"].classList.remove("is-rolling");
    elements["generator-state"].textContent = "RÉSULTAT VALIDÉ";
    elements["roll-total"].textContent = String(total);
    elements["roll-summary"].hidden = values.length === 1;
    elements["result-caption"].textContent = values.length === 1
      ? `${total} sur un D${faces} · ${Math.round((total / maximum) * 100)} %`
      : `${values.length}D${faces} · total ${total} sur ${maximum} · ${Math.round((total / maximum) * 100)} %`;
    elements["roll-button"].disabled = false;
    rolling = false;
    sound(total === maximum ? 980 : 700, .14, "triangle");
    vibrate(total === maximum ? [35, 35, 70] : 45);
    recordRoll(values, faces);
    if (total === maximum) showToast(`Jackpot maximal : ${total} / ${maximum} !`);
  }

  function roll() {
    if (rolling || elements["game-screen"].hidden) return;
    const faces = updateFaces(currentFaces());
    const diceCount = updateCount(currentCount());
    rolling = true;
    elements["roll-button"].disabled = true;
    elements["generator-state"].textContent = "CALCUL EN COURS";
    elements["result-caption"].textContent = `Lancement de ${diceCount}D${faces}…`;
    elements["roll-summary"].hidden = true;
    renderDiceValues(Array(diceCount).fill("?"));
    elements["play-die"].classList.toggle("is-rolling", settings.animation);
    sound(500, .1, "square");
    vibrate(20);

    if (!settings.animation) {
      finishRoll(Array.from({ length: diceCount }, () => Math.floor(Math.random() * faces) + 1), faces);
      return;
    }

    let count = 0;
    const timer = window.setInterval(() => {
      renderDiceValues(Array.from({ length: diceCount }, () => Math.floor(Math.random() * faces) + 1));
      elements["play-die"].classList.add("is-rolling");
      sound(340 + count * 24, .025, "square");
      count += 1;
      if (count >= 10) {
        window.clearInterval(timer);
        finishRoll(Array.from({ length: diceCount }, () => Math.floor(Math.random() * faces) + 1), faces);
      }
    }, 50);
  }

  function clearRecentHistory() {
    if (!clearArmed) {
      clearArmed = true;
      elements["clear-history"].textContent = "CONFIRMER";
      showToast("Cliquez encore pour effacer les derniers lancers.");
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        clearArmed = false;
        elements["clear-history"].textContent = "EFFACER";
      }, 3500);
      return;
    }
    window.clearTimeout(clearTimer);
    clearArmed = false;
    elements["clear-history"].textContent = "EFFACER";
    stats.magic.recent = [];
    saveJson(STATS_KEY, stats);
    renderStats();
    showToast("Historique récent effacé. Le leaderboard est conservé.");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
  }

  function saveSettings(event) {
    event.preventDefault();
    settings = {
      sound: elements["setting-sound"].checked,
      vibration: elements["setting-vibration"].checked,
      animation: elements["setting-animation"].checked,
      dieClick: elements["setting-die-click"].checked,
      theme: document.querySelector('input[name="theme"]:checked')?.value || "solar",
    };
    saveJson(SETTINGS_KEY, settings);
    applySettings();
    elements["settings-dialog"].close();
    sound(820, .08, "triangle");
    showToast("Paramètres enregistrés sur cet appareil.");
  }

  function bindEvents() {
    const tableCards = [...document.querySelectorAll(".table-card[data-mode]")];
    tableCards.forEach((card, index) => {
      card.addEventListener("click", () => selectMode(card.dataset.mode));
      card.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const offset = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tableCards.length - 1 : (index + offset + tableCards.length) % tableCards.length;
        tableCards[nextIndex].focus();
        selectMode(tableCards[nextIndex].dataset.mode);
      });
    });
    elements["play-button"].addEventListener("pointerdown", startMagicSession);
    elements["play-button"].addEventListener("click", playSelectedMode);
    elements["back-to-menu"].addEventListener("click", () => showScreen("menu"));
    elements["open-rules"].addEventListener("click", () => openRules());
    elements["game-rules"].addEventListener("click", () => openRules("magic"));
    elements["open-leaderboard"].addEventListener("click", () => openLeaderboard());
    elements["game-leaderboard"].addEventListener("click", () => openLeaderboard("magic"));
    [elements["open-settings"], elements["open-settings-header"], elements["game-settings"]].forEach((button) => button.addEventListener("click", () => openDialog(elements["settings-dialog"])));
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button)));
    document.querySelectorAll(".arcade-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
    document.querySelectorAll("[data-board-mode]").forEach((tab) => tab.addEventListener("click", () => { boardMode = tab.dataset.boardMode; openLeaderboard(boardMode); }));
    document.querySelectorAll("[data-faces]").forEach((button) => button.addEventListener("click", () => updateFaces(button.dataset.faces)));
    document.querySelectorAll("[data-count]").forEach((button) => button.addEventListener("click", () => updateCount(button.dataset.count)));
    document.querySelectorAll('input[name="theme"]').forEach((input) => input.addEventListener("change", () => { document.body.dataset.theme = input.value; }));
    elements["dice-faces"].addEventListener("input", () => updateFaces(elements["dice-faces"].value, false));
    elements["dice-faces"].addEventListener("change", () => updateFaces(elements["dice-faces"].value));
    elements["dice-count"].addEventListener("input", () => updateCount(elements["dice-count"].value, false));
    elements["dice-count"].addEventListener("change", () => updateCount(elements["dice-count"].value));
    elements["roll-button"].addEventListener("click", roll);
    elements["play-die"].addEventListener("click", () => { if (settings.dieClick) roll(); });
    elements["clear-history"].addEventListener("click", clearRecentHistory);
    elements["settings-form"].addEventListener("submit", saveSettings);
    document.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.repeat || elements["game-screen"].hidden || event.target.matches("input,button") || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      roll();
    });
  }

  function init() {
    cacheElements();
    normaliseStats();
    elements["player-name"].textContent = activePlayer().toUpperCase();
    applySettings();
    selectMode("magic");
    updateFaces(diceConfig.faces);
    updateCount(diceConfig.count);
    renderStats();
    bindEvents();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
