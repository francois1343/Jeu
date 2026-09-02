(function arcadeAdminUi(global) {
  "use strict";

  const data = global.ArcadeAdminData;
  const store = global.ArcadeLocalStore;
  const visualConfig = global.ARCADE_ADMIN_CONFIG || { themes: [], fonts: [], effects: [], defaults: {} };
  const state = {
    dataset: "audit",
    rows: [],
    query: "",
    view: "data",
    savedVisualPreferences: null,
    draftVisualPreferences: null,
  };
  const columns = {
    audit: ["id", "catégorie", "titre", "priorité", "statut", "objectif", "contrôles"],
    profiles: ["pseudo", "coins", "admin", "parties", "achats", "updatedAt"],
    feedback: ["type", "urgence", "statut", "jeu", "pseudo", "description", "createdAt"],
    sessions: ["profil", "jeu", "état", "mode", "mise", "gain", "score", "createdAt"],
    transactions: ["profil", "type", "libellé", "jeu", "montant", "soldeAprès", "createdAt"],
    statistics: ["jeu", "parties", "victoires", "défaites", "abandons", "réussite", "scoreMoyen"],
    leaderboard: ["rang", "profil", "jeu", "score", "état", "resolvedAt"],
    games: ["jeu", "catégories", "chemin", "politique"],
    shop: ["objet", "catégorie", "emplacement", "prix", "rareté", "actif"],
  };
  const labels = {
    updatedAt: "Mise à jour", createdAt: "Création", resolvedAt: "Fin",
    réussite: "Réussite %", scoreMoyen: "Score moyen", soldeAprès: "Solde après",
  };

  function element(id) {
    return global.document.getElementById(id);
  }

  function setStatus(message, type = "") {
    const node = element("adminDataStatus");
    if (!node) return;
    node.textContent = message;
    if (type) node.dataset.state = type;
    else delete node.dataset.state;
  }

  function readableError(error) {
    const messages = {
      admin_required: "Cette console est réservée au profil ADMIN local.",
      audit_unavailable: "Le fichier d’audit global n’a pas pu être chargé.",
      invalid_audit_item: "Complétez correctement l’identifiant, le titre, la catégorie, l’objectif, la priorité et le statut.",
      audit_item_exists: "Cet identifiant d’audit existe déjà.",
      invalid_pseudo: "Le pseudo doit contenir entre 2 et 20 caractères autorisés.",
      profile_exists: "Un profil utilise déjà ce pseudo.",
      profile_not_found: "Ce profil n’existe plus.",
      admin_self_protected: "Le profil ADMIN actif ne peut pas être renommé ou supprimé.",
      negative_balance: "Le solde doit être un nombre positif ou nul.",
      feedback_description_too_short: "La description doit contenir au moins 10 caractères.",
      invalid_import: "Ce fichier n’est pas une sauvegarde Francis Arcade valide.",
      invalid_audit_csv: "Ce CSV ne correspond pas au format d’audit Francis Arcade.",
      admin_profile_required: "Une restauration complète doit contenir le profil ADMIN actif.",
      readonly_dataset: "Ce jeu de données provient du code ou est calculé : il est en lecture seule.",
    };
    return messages[error?.message] || "L’opération locale n’a pas pu être effectuée.";
  }

  function formatValue(key, value) {
    if (value === true) return "Oui";
    if (value === false) return "Non";
    if (value === null || value === undefined || value === "") return "—";
    if (key.endsWith("At")) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("fr-BE", {
        dateStyle: "short", timeStyle: "short",
      }).format(date);
    }
    return String(value);
  }

  function filteredRows() {
    const needle = state.query.normalize("NFKC").toLocaleLowerCase("fr-BE");
    if (!needle) return state.rows;
    return state.rows.filter((row) => Object.values(row).some((value) => (
      String(value ?? "").normalize("NFKC").toLocaleLowerCase("fr-BE").includes(needle)
    )));
  }

  function createCell(tag, text, className = "") {
    const node = global.document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function visualOption(collection, id) {
    return collection.find((item) => item.id === id) || collection[0] || null;
  }

  function applyVisualPreferences(preferences) {
    const dialog = element("adminDialog");
    if (!dialog || !preferences) return;
    const theme = visualOption(visualConfig.themes, preferences.themeId);
    const font = visualOption(visualConfig.fonts, preferences.fontId);
    const effects = visualOption(visualConfig.effects, preferences.effectsId);
    dialog.dataset.adminTheme = theme?.id || "";
    dialog.dataset.adminFont = font?.id || "";
    dialog.dataset.adminEffects = effects?.id || "";
    Object.entries(theme?.variables || {}).forEach(([property, value]) => dialog.style.setProperty(property, value));
    if (font) {
      dialog.style.setProperty("--admin-font-body", font.body);
      dialog.style.setProperty("--admin-font-heading", font.heading);
    }
    Object.entries(effects?.variables || {}).forEach(([property, value]) => dialog.style.setProperty(property, value));
  }

  function setAppearanceStatus(message, stateName = "") {
    const node = element("adminAppearanceStatus");
    node.textContent = message;
    if (stateName) node.dataset.state = stateName;
    else delete node.dataset.state;
  }

  function renderThemeChoices() {
    const root = element("adminThemeChoices");
    root.replaceChildren();
    visualConfig.themes.forEach((theme) => {
      const button = global.document.createElement("button");
      button.type = "button";
      button.className = "admin-theme-choice";
      button.dataset.themeId = theme.id;
      button.setAttribute("aria-pressed", String(state.draftVisualPreferences?.themeId === theme.id));
      const swatches = global.document.createElement("span");
      swatches.className = "admin-theme-swatches";
      theme.preview.forEach((color) => {
        const swatch = global.document.createElement("i");
        swatch.style.background = color;
        swatches.appendChild(swatch);
      });
      const copy = global.document.createElement("span");
      copy.append(createCell("strong", theme.name), createCell("small", theme.description));
      button.append(swatches, copy);
      button.addEventListener("click", () => {
        state.draftVisualPreferences = { ...state.draftVisualPreferences, themeId: theme.id };
        applyVisualPreferences(state.draftVisualPreferences);
        renderThemeChoices();
        setAppearanceStatus("Aperçu actif — utilisez Appliquer pour le conserver.");
      });
      root.appendChild(button);
    });
  }

  function updateAppearanceDescriptions() {
    const font = visualOption(visualConfig.fonts, element("adminFontChoice").value);
    const effects = visualOption(visualConfig.effects, element("adminEffectsChoice").value);
    element("adminFontDescription").textContent = font?.description || "";
    element("adminEffectsDescription").textContent = effects?.description || "";
  }

  function syncAppearanceControls() {
    const preferences = state.draftVisualPreferences;
    if (!preferences) return;
    element("adminFontChoice").value = preferences.fontId;
    element("adminEffectsChoice").value = preferences.effectsId;
    renderThemeChoices();
    updateAppearanceDescriptions();
  }

  function loadVisualPreferences() {
    state.savedVisualPreferences = store.adminGetVisualPreferences();
    state.draftVisualPreferences = { ...state.savedVisualPreferences };
    applyVisualPreferences(state.savedVisualPreferences);
    syncAppearanceControls();
  }

  function showAdminView(view) {
    if (!state.savedVisualPreferences) loadVisualPreferences();
    state.view = view;
    const appearance = view === "appearance";
    element("adminDataWorkspace").hidden = appearance;
    element("adminAppearancePanel").hidden = !appearance;
    element("adminDataTab").tabIndex = appearance ? -1 : 0;
    element("adminAppearanceTab").tabIndex = appearance ? 0 : -1;
    element("adminDataTab").setAttribute("aria-selected", String(!appearance));
    element("adminAppearanceTab").setAttribute("aria-selected", String(appearance));
    closeEditor();
    if (appearance) {
      state.draftVisualPreferences = { ...state.savedVisualPreferences };
      applyVisualPreferences(state.draftVisualPreferences);
      syncAppearanceControls();
      setAppearanceStatus("");
    } else {
      applyVisualPreferences(state.savedVisualPreferences);
      refresh();
    }
  }

  function openEditor(record = null) {
    const mutable = ["audit", "profiles", "feedback"].includes(state.dataset);
    if (!mutable) return;
    const editor = element("adminRecordEditor");
    const form = element("adminRecordForm");
    form.reset();
    form.elements.recordId.value = record?.id || "";
    const fieldsets = { audit: "adminAuditFields", profiles: "adminProfileFields", feedback: "adminFeedbackFields" };
    Object.entries(fieldsets).forEach(([datasetId, fieldsetId]) => {
      const fieldset = element(fieldsetId);
      const inactive = state.dataset !== datasetId;
      fieldset.hidden = inactive;
      fieldset.disabled = inactive;
    });
    element("adminRecordEditorTitle").textContent = `${record ? "Modifier" : "Ajouter"} · ${data.datasets.find((item) => item.id === state.dataset).label}`;

    if (state.dataset === "audit") {
      form.elements.auditId.value = record?.id || "";
      form.elements.category.value = record?.catégorie || "";
      form.elements.title.value = record?.titre || "";
      form.elements.priority.value = record?.priorité || "importante";
      form.elements.auditStatus.value = record?.statut || "a_faire";
      form.elements.objective.value = record?.objectif || "";
      form.elements.checklist.value = record?.checklist || "";
    } else if (state.dataset === "profiles") {
      form.elements.pseudo.value = record?.pseudo || "";
      form.elements.balanceCoins.value = record?.coins ?? 5;
    } else {
      const original = record ? global.ArcadeFeedbackStore.list().find((item) => item.id === record.id) : null;
      form.elements.type.value = original?.type || "bug";
      form.elements.urgency.value = original?.urgency || "normale";
      form.elements.status.value = original?.status || "nouveau";
      form.elements.gameTitle.value = original?.gameTitle || "Accueil / interface générale";
      form.elements.gameKey.value = original?.gameKey || "home";
      form.elements.reporterPseudo.value = original?.reporterPseudo || "";
      form.elements.description.value = original?.description || "";
    }
    editor.hidden = false;
    editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => editor.querySelector("input:not([type=hidden]), select")?.focus(), 0);
  }

  function closeEditor() {
    element("adminRecordEditor").hidden = true;
  }

  function actionCell(row) {
    const cell = global.document.createElement("td");
    cell.className = "admin-table-actions";
    const edit = createCell("button", "Modifier");
    edit.type = "button";
    edit.className = "admin-table-button";
    edit.addEventListener("click", () => openEditor(row));
    const remove = createCell("button", "Supprimer");
    remove.type = "button";
    remove.className = "admin-table-button is-danger";
    remove.disabled = state.dataset === "profiles" && row.admin;
    remove.addEventListener("click", () => removeRecord(row));
    cell.append(edit, remove);
    return cell;
  }

  function renderTable() {
    const table = element("adminDataTable");
    const head = table.tHead || table.createTHead();
    const body = table.tBodies[0] || table.createTBody();
    head.replaceChildren();
    body.replaceChildren();
    const selectedColumns = columns[state.dataset] || [];
    const mutable = ["audit", "profiles", "feedback"].includes(state.dataset);
    const header = global.document.createElement("tr");
    selectedColumns.forEach((key) => header.appendChild(createCell("th", labels[key] || key)));
    if (mutable) header.appendChild(createCell("th", "Actions"));
    head.appendChild(header);

    const rows = filteredRows();
    if (!rows.length) {
      const row = global.document.createElement("tr");
      const cell = createCell("td", state.query ? "Aucun résultat pour cette recherche." : "Aucune donnée locale disponible.", "admin-table-empty");
      cell.colSpan = selectedColumns.length + (mutable ? 1 : 0);
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      rows.forEach((record) => {
        const row = global.document.createElement("tr");
        selectedColumns.forEach((key) => {
          const cell = createCell("td", formatValue(key, record[key]));
          cell.dataset.label = labels[key] || key;
          if (["description", "chemin", "catégories"].includes(key)) cell.className = "admin-table-long";
          row.appendChild(cell);
        });
        if (mutable) row.appendChild(actionCell(record));
        body.appendChild(row);
      });
    }
    element("adminDataCount").textContent = `${rows.length} résultat${rows.length === 1 ? "" : "s"}`;
    element("adminAddRecord").hidden = !mutable;
    element("adminDatasetMode").textContent = mutable ? "Modifiable localement" : "Lecture seule";
    element("adminDatasetMode").dataset.mode = mutable ? "write" : "read";
  }

  function renderSummary() {
    const profileRows = data.getRows("profiles");
    const auditRows = data.getRows("audit");
    const feedbackRows = data.getRows("feedback");
    const sessionRows = data.getRows("sessions");
    element("adminSummaryProfiles").textContent = profileRows.length;
    element("adminSummaryCoins").textContent = profileRows.reduce((sum, item) => sum + item.coins, 0).toLocaleString("fr-BE", { maximumFractionDigits: 2 });
    element("adminSummarySessions").textContent = sessionRows.length;
    element("adminSummaryAudit").textContent = auditRows.filter((item) => item.statut !== "termine").length;
    element("adminSummaryFeedback").textContent = feedbackRows.filter((item) => item.statut !== "résolu").length;
  }

  function refresh(message = "") {
    try {
      data.requireAdmin();
      state.rows = data.getRows(state.dataset);
      renderSummary();
      renderTable();
      if (message) setStatus(message, "success");
    } catch (error) {
      setStatus(readableError(error), "error");
      element("adminDialog")?.close();
    }
  }

  function removeRecord(row) {
    const label = row.pseudo || row.description || row.id;
    if (!global.confirm(`Supprimer « ${String(label).slice(0, 80)} » de ce navigateur ?`)) return;
    try {
      data.deleteRecord(state.dataset, row.id);
      global.ArcadePlatform?.refreshAccount?.();
      closeEditor();
      refresh("Donnée supprimée du stockage local.");
    } catch (error) {
      setStatus(readableError(error), "error");
    }
  }

  function saveRecord(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const record = state.dataset === "audit"
        ? {
          previousId: values.recordId, id: values.auditId, category: values.category,
          title: values.title, priority: values.priority, status: values.auditStatus,
          objective: values.objective, checklist: values.checklist,
        }
        : state.dataset === "profiles"
          ? { id: values.recordId, pseudo: values.pseudo, balanceCoins: values.balanceCoins }
          : {
          id: values.recordId, type: values.type, urgency: values.urgency, status: values.status,
          gameTitle: values.gameTitle, gameKey: values.gameKey,
          reporterPseudo: values.reporterPseudo, description: values.description,
        };
      data.saveRecord(state.dataset, record);
      global.ArcadePlatform?.refreshAccount?.();
      closeEditor();
      refresh(values.recordId ? "Donnée mise à jour localement." : "Donnée ajoutée localement.");
    } catch (error) {
      setStatus(readableError(error), "error");
    }
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = global.document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportJson() {
    try {
      const snapshot = data.exportSnapshot();
      download(`francis-arcade-backup-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(snapshot, null, 2)}\n`, "application/json");
      setStatus("Sauvegarde JSON complète téléchargée.", "success");
    } catch (error) {
      setStatus(readableError(error), "error");
    }
  }

  function csvCell(value) {
    const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    try {
      const rows = filteredRows();
      const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const csv = [keys.map(csvCell).join(";"), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(";"))].join("\r\n");
      download(`francis-arcade-${state.dataset}-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
      setStatus(`Export CSV de ${rows.length} ligne${rows.length === 1 ? "" : "s"} téléchargé.`, "success");
    } catch (error) {
      setStatus(readableError(error), "error");
    }
  }

  async function importFile(event) {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) return;
    try {
      const mode = element("adminImportMode").value;
      if (mode === "replace" && !global.confirm("Remplacer toutes les données locales par cette sauvegarde ? Cette action est irréversible sans export préalable.")) return;
      const text = await file.text();
      const isCsv = file.name.toLocaleLowerCase("fr-BE").endsWith(".csv") || file.type === "text/csv";
      if (isCsv) data.importCsv(text, mode);
      else data.importSnapshot(JSON.parse(text), mode);
      global.ArcadePlatform?.refreshAccount?.();
      loadVisualPreferences();
      closeEditor();
      refresh(mode === "replace" ? "Sauvegarde restaurée localement." : "Sauvegarde fusionnée avec les données locales.");
    } catch (error) {
      setStatus(readableError(error), "error");
    }
  }

  function init() {
    if (!data) return;
    const datasetSelect = element("adminDataset");
    data.datasets.forEach((dataset) => {
      const option = global.document.createElement("option");
      option.value = dataset.id;
      option.textContent = dataset.label;
      datasetSelect.appendChild(option);
    });
    datasetSelect.value = state.dataset;
    visualConfig.fonts.forEach((font) => {
      const option = global.document.createElement("option");
      option.value = font.id;
      option.textContent = font.name;
      element("adminFontChoice").appendChild(option);
    });
    visualConfig.effects.forEach((effects) => {
      const option = global.document.createElement("option");
      option.value = effects.id;
      option.textContent = effects.name;
      element("adminEffectsChoice").appendChild(option);
    });
    datasetSelect.addEventListener("change", () => {
      state.dataset = datasetSelect.value;
      state.query = "";
      element("adminDataSearch").value = "";
      closeEditor();
      refresh();
    });
    element("adminDataSearch").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderTable();
    });
    element("adminAddRecord").addEventListener("click", () => openEditor());
    element("adminRecordCancel").addEventListener("click", closeEditor);
    element("adminRecordCancelBottom").addEventListener("click", closeEditor);
    element("adminRecordForm").addEventListener("submit", saveRecord);
    element("adminExportJson").addEventListener("click", exportJson);
    element("adminExportCsv").addEventListener("click", exportCsv);
    element("adminImportFile").addEventListener("change", importFile);
    element("adminImportButton").addEventListener("click", () => element("adminImportFile").click());
    element("adminDataTab").addEventListener("click", () => showAdminView("data"));
    element("adminAppearanceTab").addEventListener("click", () => showAdminView("appearance"));
    element("adminDialog").querySelector(".admin-section-nav").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [element("adminDataTab"), element("adminAppearanceTab")];
      const currentIndex = tabs.indexOf(global.document.activeElement);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
          : event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    });
    element("adminFontChoice").addEventListener("change", (event) => {
      state.draftVisualPreferences = { ...state.draftVisualPreferences, fontId: event.target.value };
      applyVisualPreferences(state.draftVisualPreferences);
      updateAppearanceDescriptions();
      setAppearanceStatus("Aperçu actif — utilisez Appliquer pour le conserver.");
    });
    element("adminEffectsChoice").addEventListener("change", (event) => {
      state.draftVisualPreferences = { ...state.draftVisualPreferences, effectsId: event.target.value };
      applyVisualPreferences(state.draftVisualPreferences);
      updateAppearanceDescriptions();
      setAppearanceStatus("Aperçu actif — utilisez Appliquer pour le conserver.");
    });
    element("adminAppearanceReset").addEventListener("click", () => {
      state.draftVisualPreferences = { ...visualConfig.defaults };
      applyVisualPreferences(state.draftVisualPreferences);
      syncAppearanceControls();
      setAppearanceStatus("Valeurs par défaut prévisualisées. Elles ne sont pas encore enregistrées.");
    });
    element("adminAppearanceCancel").addEventListener("click", () => {
      state.draftVisualPreferences = { ...state.savedVisualPreferences };
      applyVisualPreferences(state.savedVisualPreferences);
      syncAppearanceControls();
      setAppearanceStatus("Aperçu annulé.");
    });
    element("adminAppearanceApply").addEventListener("click", () => {
      try {
        state.savedVisualPreferences = store.adminSaveVisualPreferences(state.draftVisualPreferences);
        state.draftVisualPreferences = { ...state.savedVisualPreferences };
        applyVisualPreferences(state.savedVisualPreferences);
        setAppearanceStatus("Préférences enregistrées pour ce profil ADMIN.", "success");
      } catch (error) {
        setAppearanceStatus(readableError(error), "error");
      }
    });
    element("openAdminButton")?.addEventListener("click", () => setTimeout(() => {
      loadVisualPreferences();
      showAdminView("data");
    }, 0));
    element("adminDialog")?.addEventListener("close", () => {
      closeEditor();
      applyVisualPreferences(state.savedVisualPreferences);
    });
    global.addEventListener("arcade-local-store-change", () => {
      if (element("adminDialog")?.open) refresh();
    });
    global.addEventListener("arcade-feedback-change", () => {
      if (element("adminDialog")?.open) refresh();
    });
    global.addEventListener("arcade-audit-change", () => {
      if (element("adminDialog")?.open) refresh();
    });
  }

  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
