(function adminDashboard(global) {
  "use strict";

  const api = global.ArcadeSupabase;
  const state = { dashboard: null, audit: null, view: "overview", query: "" };
  const unitsPerCoin = Number(global.ARCADE_CONFIG?.coins?.unitsPerCoin || 100);

  const element = (id) => document.getElementById(id);
  const integer = (value) => new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 }).format(Number(value || 0));
  const coins = (units) => new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 }).format(Number(units || 0) / unitsPerCoin);
  const date = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium" }).format(new Date(value)) : "Jamais";

  function setSync(message, status = "idle") {
    const node = element("syncState");
    node.dataset.state = status;
    node.querySelector("span").textContent = message;
  }

  function showAccess(message, error = false) {
    element("accessPanel").hidden = false;
    element("dashboard").hidden = true;
    element("accessMessage").textContent = message;
    setSync(error ? "Accès refusé" : "Connexion requise", error ? "error" : "idle");
  }

  function metric(label, value, note, icon) {
    const card = element("metricTemplate").content.firstElementChild.cloneNode(true);
    card.querySelector(".metric-icon").textContent = icon;
    card.querySelector("small").textContent = label;
    card.querySelector("strong").textContent = value;
    card.querySelector("p").textContent = note;
    return card;
  }

  function renderMetrics() {
    const overview = state.dashboard.overview || {};
    const total = Number(overview.total_sessions || 0);
    const winRate = total ? Math.round(Number(overview.wins || 0) / total * 100) : 0;
    element("metricGrid").replaceChildren(
      metric("Comptes créés", integer(overview.total_accounts), `${integer(overview.confirmed_accounts)} confirmés`, "◎"),
      metric("Actifs · 7 jours", integer(overview.active_7d), `${integer(overview.active_24h)} sur 24 h`, "↗"),
      metric("Coins disponibles", coins(overview.total_balance_units), `${coins(overview.average_balance_units)} en moyenne`, "◈"),
      metric("Parties", integer(total), `${integer(overview.sessions_7d)} cette semaine`, "▶"),
      metric("Taux de victoire", `${winRate}%`, `${integer(overview.wins)} victoires`, "✓"),
      metric("Matchs ouverts", integer(overview.open_matches), `${integer(overview.completed_matches)} terminés`, "⇄"),
      metric("Jeux vérifiés", integer(state.dashboard.quality?.verified_games), `${integer(state.dashboard.quality?.catalog_games)} au catalogue`, "◆"),
      metric("Jeux serveur", integer(state.dashboard.quality?.server_verified_games), "validation autoritaire", "⌁"),
    );
  }

  function renderLineChart(id, values) {
    const svg = element(id);
    const width = 640, height = 220, left = 34, right = 12, top = 18, bottom = 30;
    const max = Math.max(1, ...values.map((item) => Number(item.count || 0)));
    const x = (index) => left + (values.length <= 1 ? 0 : index / (values.length - 1) * (width - left - right));
    const y = (value) => top + (1 - Number(value || 0) / max) * (height - top - bottom);
    const points = values.map((item, index) => `${x(index)},${y(item.count)}`).join(" ");
    const area = `${left},${height - bottom} ${points} ${x(values.length - 1)},${height - bottom}`;
    const labels = values.filter((_, index) => index === 0 || index === values.length - 1 || index === Math.floor(values.length / 2));
    svg.innerHTML = `
      <line class="chart-grid" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
      <line class="chart-grid" x1="${left}" y1="${top}" x2="${width - right}" y2="${top}" />
      <polygon class="chart-area" points="${area}" />
      <polyline class="chart-line" points="${points}" />
      ${values.map((item, index) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(item.count)}" r="4"><title>${item.date} · ${item.count}</title></circle>`).join("")}
      ${labels.map((item) => { const index = values.indexOf(item); return `<text class="chart-label" x="${x(index)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : index === values.length - 1 ? "end" : "middle"}">${new Date(item.date).toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}</text>`; }).join("")}
      <text class="chart-label" x="${left - 8}" y="${top + 4}" text-anchor="end">${max}</text>`;
  }

  function renderBars() {
    const rows = state.dashboard.coin_distribution || [];
    const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
    element("coinDistribution").innerHTML = rows.map((row) => `<div class="bar-row"><span>${row.label}</span><span class="bar-track"><i class="bar-fill" style="width:${Number(row.count || 0) / max * 100}%"></i></span><strong>${integer(row.count)}</strong></div>`).join("");
    const games = state.dashboard.top_games || [];
    element("topGames").innerHTML = games.length ? games.map((game, index) => `<div class="rank-row"><span>${String(index + 1).padStart(2, "0")}</span><span><strong>${game.game_key}</strong><small>${integer(game.unique_players)} joueur${Number(game.unique_players) > 1 ? "s" : ""}</small></span><strong>${integer(game.sessions)}</strong></div>`).join("") : "<p class=table-note>Aucune partie enregistrée.</p>";
  }

  function renderPlayers() {
    const needle = state.query.normalize("NFKC").toLocaleLowerCase("fr-BE");
    const rows = (state.dashboard.players || []).filter((player) => String(player.display_name || "").normalize("NFKC").toLocaleLowerCase("fr-BE").includes(needle));
    element("playerRows").innerHTML = rows.length ? rows.map((player) => `<tr><td><strong>${escapeHtml(player.display_name)}</strong><small>${String(player.user_id).slice(0, 8)}…</small></td><td class="coin-value">${coins(player.balance_units)} 🪙</td><td>${coins(player.lifetime_earned_units)}</td><td>${coins(player.lifetime_spent_units)}</td><td>${integer(player.sessions)}</td><td>${integer(player.wins)}</td><td>${date(player.last_sign_in_at)}</td></tr>`).join("") : "<tr><td colspan=7>Aucun joueur correspondant.</td></tr>";
    element("playerCount").textContent = `${rows.length} joueur${rows.length > 1 ? "s" : ""} affiché${rows.length > 1 ? "s" : ""} · aucune adresse e-mail exposée dans ce tableau.`;
  }

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value ?? "");
    return node.innerHTML;
  }

  function renderQuality() {
    const audit = state.audit || {};
    const summary = audit.summary || {};
    const quality = state.dashboard.quality || {};
    const catalog = Math.max(1, Number(quality.catalog_games || 0));
    const cards = [
      ["Responsive", summary.responsive_pass_percent ?? 0, `${summary.pages_without_overflow ?? 0}/${summary.pages_audited ?? 0} pages sans débordement`],
      ["Cibles tactiles", summary.touch_target_pass_percent ?? 0, "Boutons et liens ≥ 44 px"],
      ["Shell commun", summary.shared_shell_percent ?? 100, "Navigation cohérente"],
      ["Validation serveur", Math.round(Number(quality.server_verified_games || 0) / catalog * 100), `${integer(quality.server_verified_games)}/${integer(quality.catalog_games)} jeux`],
    ];
    element("qualityProgress").innerHTML = cards.map(([label, value, note]) => `<article class="quality-card"><header><span>${label}</span><strong>${value}%</strong></header><div class="progress-track"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div><p>${note}</p></article>`).join("");
    const findings = audit.findings || [];
    element("auditFindings").innerHTML = findings.map((finding) => `<article class="finding" data-severity="${finding.severity}"><i class="severity"></i><div><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.detail)}</p></div><em>${escapeHtml(finding.scope)}</em></article>`).join("");
    element("auditDate").textContent = audit.generated_at ? `Audit du ${date(audit.generated_at)}` : "Audit local";
    const roadmap = audit.roadmap || [];
    element("roadmap").innerHTML = roadmap.map((step, index) => `<article class="roadmap-step"><span>0${index + 1} · ${escapeHtml(step.status)}</span><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.detail)}</p><progress max="100" value="${Number(step.progress || 0)}">${Number(step.progress || 0)}%</progress></article>`).join("");
    const readiness = Number(summary.commercial_readiness_percent || 0);
    element("readinessOrb").style.setProperty("--value", readiness);
    element("readinessValue").textContent = `${readiness}%`;
  }

  function render() {
    renderMetrics();
    renderLineChart("signupChart", state.dashboard.daily_signups || []);
    renderLineChart("sessionChart", state.dashboard.daily_sessions || []);
    element("signupTotalLabel").textContent = `${integer((state.dashboard.daily_signups || []).reduce((sum, item) => sum + Number(item.count || 0), 0))} sur la période`;
    element("sessionTotalLabel").textContent = `${integer((state.dashboard.daily_sessions || []).reduce((sum, item) => sum + Number(item.count || 0), 0))} sur la période`;
    renderBars();
    renderPlayers();
    renderQuality();
  }

  async function load() {
    setSync("Synchronisation…", "idle");
    const session = await api?.getSession?.();
    if (!session) {
      showAccess("Connectez-vous d’abord à votre compte depuis l’accueil.");
      return;
    }
    try {
      const [dashboard, audit] = await Promise.all([
        api.getAdminDashboard(Number(element("rangeDays").value)),
        fetch("../data/ux-audit.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null),
      ]);
      state.dashboard = dashboard;
      state.audit = audit;
      element("accessPanel").hidden = true;
      element("dashboard").hidden = false;
      render();
      setSync(`À jour · ${new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`, "ok");
    } catch (error) {
      const denied = String(error?.message || "").includes("admin_required") || Number(error?.status) === 403;
      showAccess(denied ? "Ce compte n’est pas autorisé à ouvrir le centre de pilotage." : "Impossible de charger les données administrateur.", true);
    }
  }

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
    document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== state.view; });
  }));
  element("playerSearch").addEventListener("input", (event) => { state.query = event.target.value; renderPlayers(); });
  element("rangeDays").addEventListener("change", load);
  element("refreshDashboard").addEventListener("click", load);
  api?.onAuthStateChange?.(() => setTimeout(load, 0));
  load();
})(window);
