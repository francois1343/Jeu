(function arcadeGameShell(global) {
  "use strict";

  const sessionApi = global.ArcadeGameSession;
  const preferencesApi = global.ArcadeGamePreferences;
  const store = global.ArcadeLocalStore;
  const config = global.ARCADE_GAME_CONFIG || {};
  const shellConfig = config.shell || {};
  const terminalStates = new Set(["won", "lost", "abandoned"]);
  const shellScriptUrl = global.document.currentScript?.src || "";
  let adapter = {};
  let pausedByShell = false;
  let pausedByVisibility = false;
  let lastFocused = null;
  let lastTerminalState = null;
  let activated = false;
  let bindAttempts = 0;
  let dialog = null;
  let resumeRequest = null;

  function element(id) {
    return global.document.getElementById(id);
  }

  function resolvedGameKey() {
    if (sessionApi?.gameKey) return sessionApi.gameKey;
    const path = decodeURIComponent(global.location.pathname).replace(/\\/g, "/").toLocaleLowerCase("fr");
    const segments = path.split("/").filter(Boolean);
    const folder = segments.length > 1 ? segments[segments.length - 2] : "";
    return global.document.body?.dataset.arcadeGame || shellConfig.routeAliases?.[folder] || null;
  }

  function gameConfig() {
    return shellConfig.games?.[resolvedGameKey()] || {};
  }

  function injectStyleSheet() {
    if (!shellScriptUrl || global.document.querySelector("link[data-arcade-game-shell]")) return;
    const link = global.document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../../css/shared/arcade-game-shell.css", shellScriptUrl).href;
    link.dataset.arcadeGameShell = "true";
    global.document.head.appendChild(link);
  }

  function createDialog() {
    dialog = global.document.createElement("dialog");
    dialog.id = "arcadeGameShellDialog";
    dialog.className = "arcade-game-shell-dialog";
    dialog.setAttribute("aria-labelledby", "arcadeGameShellTitle");
    dialog.innerHTML = `
      <div class="arcade-game-shell-panel">
        <header>
          <div><span>FRANCIS ARCADE</span><h2 id="arcadeGameShellTitle">Menu du jeu</h2></div>
          <button type="button" data-shell-close aria-label="Fermer le menu">×</button>
        </header>
        <nav aria-label="Menu commun du jeu">
          <button type="button" data-shell-view="overview" aria-current="page">Partie</button>
          <button type="button" data-shell-view="tutorial">Tutoriel</button>
          <button type="button" data-shell-view="leaderboard">Classement</button>
          <button type="button" data-shell-view="settings">Paramètres</button>
          <button type="button" data-shell-view="rules">Règles</button>
        </nav>
        <section data-shell-panel="overview">
          <div class="arcade-shell-session-card">
            <span id="arcadeShellState">Prête</span>
            <strong id="arcadeShellGame">Jeu</strong>
            <small id="arcadeShellEconomy"></small>
            <p id="arcadeShellResult" class="arcade-shell-result" role="status" aria-live="polite"></p>
            <p id="arcadeShellPauseInfo" class="arcade-shell-pause-info"></p>
          </div>
          <div class="arcade-shell-actions">
            <button type="button" class="is-primary" id="arcadeShellContinue">Jouer</button>
            <button type="button" id="arcadeShellReplay" class="arcade-session-replay" hidden>Rejouer</button>
            <button type="button" class="is-danger" id="arcadeShellHome">Retour à l’Arcade</button>
          </div>
        </section>
        <section data-shell-panel="tutorial" hidden>
          <p class="arcade-shell-explanation">L'essentiel pour jouer en moins de dix secondes.</p>
          <ol class="arcade-shell-tutorial" id="arcadeShellTutorial"></ol>
          <div class="arcade-shell-actions">
            <button type="button" class="is-primary" id="arcadeShellTutorialStart">Compris, jouer</button>
            <button type="button" id="arcadeShellTutorialSkip">Ignorer</button>
          </div>
        </section>
        <section data-shell-panel="leaderboard" hidden>
          <p class="arcade-shell-explanation">Meilleurs scores enregistrés pour les profils de ce navigateur.</p>
          <ol class="arcade-shell-leaderboard" id="arcadeShellLeaderboard"></ol>
        </section>
        <section data-shell-panel="settings" hidden>
          <div class="arcade-shell-settings" id="arcadeShellSettings"></div>
          <label class="arcade-shell-select">Intensité visuelle<select id="arcadeShellIntensity"></select></label>
          <p class="arcade-shell-explanation">Ces préférences suivent votre profil et sont disponibles pour tous les jeux compatibles.</p>
        </section>
        <section data-shell-panel="rules" hidden>
          <h3 id="arcadeShellRulesTitle">Règles</h3>
          <p id="arcadeShellRulesCopy"></p>
        </section>
        <p class="arcade-shell-status" id="arcadeShellStatus" role="status" aria-live="polite"></p>
      </div>`;
    global.document.body.appendChild(dialog);
  }

  function stateLabel(state) {
    return { created: "Prête", started: "En cours", won: "Gagnée", lost: "Perdue", abandoned: "Abandonnée" }[state] || "Indisponible";
  }

  function renderSession(detail = {}) {
    const session = detail.session || sessionApi.snapshot;
    if (!dialog) return;
    if (!session) {
      element("arcadeShellState").textContent = "Entraînement";
      element("arcadeShellState").dataset.state = "standalone";
      element("arcadeShellGame").textContent = gameConfig().title || global.document.title || "Jeu";
      element("arcadeShellEconomy").textContent = "Ouverture directe · aucun Coin engagé";
      element("arcadeShellContinue").hidden = false;
      element("arcadeShellContinue").textContent = "Continuer";
      element("arcadeShellReplay").hidden = true;
      element("arcadeShellResult").hidden = true;
      return;
    }
    element("arcadeShellState").textContent = stateLabel(session.state);
    element("arcadeShellState").dataset.state = session.state;
    element("arcadeShellGame").textContent = session.title || session.gameKey;
    element("arcadeShellEconomy").textContent = session.economyMode === "practice"
      ? "Mode entraînement · aucun Coin engagé"
      : `${session.wagerUnits / Number(global.ARCADE_CONFIG?.coins?.unitsPerCoin || 100)} Coin par partie`;
    const terminal = terminalStates.has(session.state);
    element("arcadeShellContinue").hidden = terminal;
    element("arcadeShellContinue").textContent = session.state === "started" ? "Reprendre" : "Jouer";
    element("arcadeShellReplay").hidden = !terminal;
    const result = element("arcadeShellResult");
    const score = Number(session.metadata?.score);
    result.hidden = !terminal;
    result.textContent = terminal
      ? `${stateLabel(session.state)}${Number.isFinite(score) ? ` · Score ${score.toLocaleString("fr-BE")}` : ""}`
      : "";
  }

  function tutorialSeenKey() {
    const profile = store?.getActiveProfile?.();
    const owner = profile?.id || profile?.pseudo || "local";
    return `arcade.tutorial.v${config.version || 1}.${owner}.${resolvedGameKey() || "game"}`;
  }

  function markTutorialSeen() {
    try { global.localStorage?.setItem(tutorialSeenKey(), "1"); } catch (_) { /* Le tutoriel reste disponible sans stockage. */ }
  }

  function tutorialWasSeen() {
    try { return global.localStorage?.getItem(tutorialSeenKey()) === "1"; } catch (_) { return false; }
  }

  function renderTutorial() {
    const list = element("arcadeShellTutorial");
    list.replaceChildren();
    const fallbackTitle = sessionApi?.snapshot?.title || gameConfig().title || "ce jeu";
    const fallback = [
      { title: "Objectif", text: `Terminez une partie de ${fallbackTitle} avec le meilleur résultat possible.` },
      { title: "Commandes", text: "Utilisez les commandes affichées dans le jeu ; le menu commun reste accessible à tout moment." },
      { title: "Conseil", text: "Consultez l’onglet Règles avant votre première partie." },
    ];
    const steps = adapter.tutorial || gameConfig().tutorial || fallback;
    steps.slice(0, 3).forEach((step, index) => {
      const item = global.document.createElement("li");
      const number = global.document.createElement("span");
      const copy = global.document.createElement("div");
      const title = global.document.createElement("strong");
      const text = global.document.createElement("p");
      number.textContent = String(index + 1);
      title.textContent = step.title || `Étape ${index + 1}`;
      text.textContent = step.text || "";
      copy.append(title, text); item.append(number, copy); list.appendChild(item);
    });
  }

  function showView(view) {
    dialog.querySelectorAll("[data-shell-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.shellPanel !== view;
    });
    dialog.querySelectorAll("[data-shell-view]").forEach((button) => {
      if (button.dataset.shellView === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view === "leaderboard") renderLeaderboard();
    if (view === "tutorial") renderTutorial();
  }

  function renderLeaderboard() {
    const list = element("arcadeShellLeaderboard");
    list.replaceChildren();
    const key = resolvedGameKey();
    const rows = (store?.listProfiles?.() || []).flatMap((profile) => (profile.sessions || [])
      .filter((session) => session.gameKey === key && Number.isFinite(Number(session.metadata?.score)))
      .map((session) => ({ pseudo: profile.pseudo, score: Number(session.metadata.score), at: session.resolvedAt || session.createdAt })))
      .sort((left, right) => right.score - left.score)
      .slice(0, Number(shellConfig.leaderboardLimit || 10));
    if (!rows.length) {
      const empty = global.document.createElement("li");
      empty.className = "is-empty";
      empty.textContent = "Aucun score central enregistré pour ce jeu.";
      list.appendChild(empty);
      return;
    }
    rows.forEach((row, index) => {
      const item = global.document.createElement("li");
      const rank = global.document.createElement("span");
      const pseudo = global.document.createElement("strong");
      const score = global.document.createElement("b");
      rank.textContent = String(index + 1);
      pseudo.textContent = row.pseudo;
      score.textContent = row.score.toLocaleString("fr-BE");
      item.append(rank, pseudo, score);
      list.appendChild(item);
    });
  }

  function renderSettings() {
    const settings = element("arcadeShellSettings");
    settings.replaceChildren();
    const preferences = preferencesApi.get();
    [
      ["sound", "Effets sonores"],
      ["music", "Musique"],
      ["vibration", "Vibration"],
      ["animations", "Animations"],
    ].forEach(([key, label]) => {
      const row = global.document.createElement("label");
      const text = global.document.createElement("span");
      const input = global.document.createElement("input");
      text.textContent = label;
      input.type = "checkbox";
      input.checked = Boolean(preferences[key]);
      input.addEventListener("change", () => preferencesApi.update({ [key]: input.checked }));
      row.append(text, input);
      settings.appendChild(row);
    });
    const intensity = element("arcadeShellIntensity");
    intensity.replaceChildren();
    (config.preferences?.visualIntensities || []).forEach((entry) => {
      const option = global.document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      intensity.appendChild(option);
    });
    intensity.value = preferences.visualIntensity;
  }

  function renderRules() {
    const game = gameConfig();
    element("arcadeShellRulesTitle").textContent = adapter.rulesTitle || game.rulesTitle || "Règles du jeu";
    element("arcadeShellRulesCopy").textContent = adapter.rules || game.rules || "Consultez les indications affichées dans le jeu pour découvrir son objectif et ses commandes.";
  }

  function pauseForShell() {
    resumeRequest = null;
    if (sessionApi.id && sessionApi.state !== "started") return false;
    if (typeof adapter.pause === "function") {
      adapter.pause();
      pausedByShell = true;
      return true;
    }
    const detail = { gameKey: resolvedGameKey(), handled: false, resume: null };
    global.dispatchEvent?.(new CustomEvent("arcade:pause-request", { detail }));
    if (detail.handled) {
      pausedByShell = true;
      resumeRequest = typeof detail.resume === "function" ? detail.resume : null;
      return true;
    }
    return false;
  }

  function open(view = "overview") {
    lastFocused = global.document.activeElement;
    const gamePaused = pauseForShell();
    global.document.documentElement.dataset.arcadeShellOpen = "true";
    renderSession();
    const pauseInfo = element("arcadeShellPauseInfo");
    pauseInfo.textContent = sessionApi.state === "started" || !sessionApi.id
      ? (gamePaused ? "Partie suspendue pendant l’ouverture du menu." : "Menu de pause ouvert · les commandes du jeu sont bloquées.")
      : "Configurez la partie, consultez les règles, puis lancez-vous.";
    pauseInfo.dataset.mode = gamePaused ? "native" : "menu";
    renderSettings();
    renderRules();
    renderTutorial();
    showView(view);
    if (!dialog.open) dialog.showModal();
    global.dispatchEvent?.(new CustomEvent("arcade:shell-open", { detail: { view } }));
    dialog.querySelector("[data-shell-close]")?.focus();
  }

  function close() {
    if (dialog?.open) dialog.close();
    if (pausedByShell && typeof adapter.resume === "function") adapter.resume();
    else if (pausedByShell && resumeRequest) resumeRequest();
    if (pausedByShell) {
      global.dispatchEvent?.(new CustomEvent("arcade:resume-request", { detail: { gameKey: resolvedGameKey() } }));
    }
    pausedByShell = false;
    resumeRequest = null;
    delete global.document.documentElement.dataset.arcadeShellOpen;
    global.dispatchEvent?.(new CustomEvent("arcade:shell-close"));
    if (lastFocused?.isConnected) lastFocused.focus();
  }

  function goHome() {
    const active = sessionApi.state === "started";
    if (active && !global.confirm("Abandonner cette partie et revenir à Francis Arcade ?")) return;
    if (["created", "started"].includes(sessionApi.state)) sessionApi.abandon("common_menu_return");
    global.location.assign(new URL(shellConfig.homeUrl || "../../index.html", global.location.href).href);
  }

  function bind() {
    const hud = element("arcadeSessionHud");
    if (element("arcadeGameShellButton")) return true;
    const button = global.document.createElement("button");
    button.id = "arcadeGameShellButton";
    button.type = "button";
    button.textContent = "Menu";
    button.setAttribute("aria-haspopup", "dialog");
    button.addEventListener("click", () => open("overview"));
    if (hud) {
      hud.appendChild(button);
      hud.classList.add("has-common-menu");
    } else {
      button.classList.add("arcade-game-shell-launcher");
      button.setAttribute("aria-label", "Ouvrir le menu commun du jeu");
      global.document.body.appendChild(button);
    }

    dialog.querySelector("[data-shell-close]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); event.stopPropagation(); });
    dialog.addEventListener("pointerdown", (event) => event.stopPropagation());
    dialog.addEventListener("pointerup", (event) => event.stopPropagation());
    dialog.addEventListener("keydown", (event) => event.stopPropagation());
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.querySelectorAll("[data-shell-view]").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.shellView)));
    element("arcadeShellContinue").addEventListener("click", close);
    element("arcadeShellReplay").addEventListener("click", () => sessionApi.id && sessionApi.replay());
    element("arcadeShellHome").addEventListener("click", goHome);
    element("arcadeShellTutorialStart").addEventListener("click", () => { markTutorialSeen(); close(); });
    element("arcadeShellTutorialSkip").addEventListener("click", () => { markTutorialSeen(); close(); });
    element("arcadeShellIntensity").addEventListener("change", (event) => preferencesApi.update({ visualIntensity: event.target.value }));
    preferencesApi.subscribe(() => renderSettings());
    sessionApi.subscribe((detail) => {
      renderSession(detail);
      const state = detail.session?.state;
      if (terminalStates.has(state) && state !== lastTerminalState) {
        lastTerminalState = state;
        global.setTimeout(() => open("overview"), 0);
      }
    });
    global.document.addEventListener("visibilitychange", () => {
      if (global.document.hidden && (sessionApi.state === "started" || !sessionApi.id) && typeof adapter.pause === "function") {
        adapter.pause();
        pausedByVisibility = true;
      } else if (!global.document.hidden && pausedByVisibility) {
        pausedByVisibility = false;
        if (!dialog.open) open("overview");
      }
    });
    return true;
  }

  function configure(nextAdapter = {}) {
    adapter = { ...adapter, ...nextAdapter };
    renderRules();
    renderTutorial();
  }

  function init() {
    if (!sessionApi || !preferencesApi || !resolvedGameKey()) return;
    injectStyleSheet();
    createDialog();
    activate();
  }

  function activate() {
    if (activated) return;
    if (!bind()) {
      bindAttempts += 1;
      if (bindAttempts < 80) global.setTimeout(activate, 25);
      return;
    }
    activated = true;
    global.dispatchEvent?.(new CustomEvent("arcade:shell-ready"));
    const hasTutorial = (adapter.tutorial || gameConfig().tutorial || []).length > 0;
    if ((sessionApi.state === "created" || !sessionApi.id) && hasTutorial && !tutorialWasSeen()) {
      global.setTimeout(() => open("tutorial"), 0);
    }
  }

  global.ArcadeGameShell = Object.freeze({
    configure,
    open,
    close,
    get isOpen() { return Boolean(dialog?.open); },
    get game() { return gameConfig(); },
    get gameKey() { return resolvedGameKey(); },
  });
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
