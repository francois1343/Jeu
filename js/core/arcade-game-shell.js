(function arcadeGameShell(global) {
  "use strict";

  const sessionApi = global.ArcadeGameSession;
  const preferencesApi = global.ArcadeGamePreferences;
  const store = global.ArcadeLocalStore;
  const config = global.ARCADE_GAME_CONFIG || {};
  const shellConfig = config.shell || {};
  const shellScriptUrl = global.document.currentScript?.src || "";
  let adapter = {};
  let pausedByShell = false;
  let dialog = null;

  function element(id) {
    return global.document.getElementById(id);
  }

  function gameConfig() {
    return shellConfig.games?.[sessionApi?.gameKey] || {};
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
          <button type="button" data-shell-view="leaderboard">Leaderboard</button>
          <button type="button" data-shell-view="settings">Paramètres</button>
          <button type="button" data-shell-view="rules">Règles</button>
        </nav>
        <section data-shell-panel="overview">
          <div class="arcade-shell-session-card">
            <span id="arcadeShellState">Prête</span>
            <strong id="arcadeShellGame">Jeu</strong>
            <small id="arcadeShellEconomy"></small>
          </div>
          <div class="arcade-shell-actions">
            <button type="button" class="is-primary" id="arcadeShellContinue">Jouer</button>
            <button type="button" id="arcadeShellReplay" hidden>Rejouer</button>
            <button type="button" class="is-danger" id="arcadeShellHome">Retour à l’Arcade</button>
          </div>
        </section>
        <section data-shell-panel="leaderboard" hidden>
          <p class="arcade-shell-explanation">Scores enregistrés par le système central sur ce navigateur.</p>
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
    if (!session || !dialog) return;
    element("arcadeShellState").textContent = stateLabel(session.state);
    element("arcadeShellState").dataset.state = session.state;
    element("arcadeShellGame").textContent = session.title || session.gameKey;
    element("arcadeShellEconomy").textContent = session.economyMode === "practice"
      ? "Mode entraînement · aucun Coin engagé"
      : `${session.wagerUnits / Number(global.ARCADE_CONFIG?.coins?.unitsPerCoin || 100)} Coin par partie`;
    const terminal = ["won", "lost", "abandoned"].includes(session.state);
    element("arcadeShellContinue").hidden = terminal;
    element("arcadeShellContinue").textContent = session.state === "started" ? "Reprendre" : "Jouer";
    element("arcadeShellReplay").hidden = !terminal;
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
  }

  function renderLeaderboard() {
    const list = element("arcadeShellLeaderboard");
    list.replaceChildren();
    const rows = (store?.listProfiles?.() || []).flatMap((profile) => (profile.sessions || [])
      .filter((session) => session.gameKey === sessionApi.gameKey && Number.isFinite(Number(session.metadata?.score)))
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
    element("arcadeShellRulesCopy").textContent = adapter.rules || game.rules || "Les règles détaillées seront reliées à ce menu lors de l’adaptation de ce jeu.";
  }

  function open() {
    if (sessionApi.state === "started" && typeof adapter.pause === "function") {
      adapter.pause();
      pausedByShell = true;
    }
    renderSession();
    renderSettings();
    renderRules();
    showView("overview");
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog?.open) dialog.close();
    if (pausedByShell && typeof adapter.resume === "function") adapter.resume();
    pausedByShell = false;
  }

  function goHome() {
    const active = sessionApi.state === "started";
    if (active && !global.confirm("Abandonner cette partie et revenir à Francis Arcade ?")) return;
    if (["created", "started"].includes(sessionApi.state)) sessionApi.abandon("common_menu_return");
    global.location.assign(new URL(shellConfig.homeUrl || "../../index.html", global.location.href).href);
  }

  function bind() {
    const hud = element("arcadeSessionHud");
    if (!hud || element("arcadeGameShellButton")) return;
    const button = global.document.createElement("button");
    button.id = "arcadeGameShellButton";
    button.type = "button";
    button.textContent = "Menu";
    button.setAttribute("aria-haspopup", "dialog");
    button.addEventListener("click", open);
    hud.appendChild(button);
    hud.classList.add("has-common-menu");

    dialog.querySelector("[data-shell-close]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.querySelectorAll("[data-shell-view]").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.shellView)));
    element("arcadeShellContinue").addEventListener("click", close);
    element("arcadeShellReplay").addEventListener("click", () => sessionApi.replay());
    element("arcadeShellHome").addEventListener("click", goHome);
    element("arcadeShellIntensity").addEventListener("change", (event) => preferencesApi.update({ visualIntensity: event.target.value }));
    preferencesApi.subscribe(() => renderSettings());
    sessionApi.subscribe(renderSession);
  }

  function configure(nextAdapter = {}) {
    adapter = { ...adapter, ...nextAdapter };
    renderRules();
  }

  function init() {
    if (!sessionApi?.id || !preferencesApi) return;
    injectStyleSheet();
    createDialog();
    bind();
    global.dispatchEvent?.(new CustomEvent("arcade:shell-ready"));
  }

  global.ArcadeGameShell = Object.freeze({ configure, open, close });
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
