(function arcadeFeedbackStore(global) {
  "use strict";

  const STORAGE_KEY = "arcade.feedback.v1";
  const EMAIL_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";
  const MAX_REPORTS = 250;
  const TYPES = Object.freeze(["bug", "suggestion", "problème visuel", "jeu", "compte", "autre"]);
  const URGENCIES = Object.freeze(["faible", "normale", "élevée", "critique"]);
  const STATUSES = Object.freeze(["nouveau", "à vérifier", "en cours", "résolu"]);
  const emailConfig = global.ARCADE_CONFIG?.feedbackEmail || {};
  let memoryFallback = { version: 1, reports: [] };

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function clean(value, maxLength) {
    return String(value || "").normalize("NFKC").trim().slice(0, maxLength);
  }

  function randomId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readState() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed?.version === 1 && Array.isArray(parsed.reports)) return parsed;
    } catch (_) {
      return clone(memoryFallback);
    }
    return clone(memoryFallback);
  }

  function writeState(state) {
    memoryFallback = clone(state);
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Le retour reste disponible pendant la session si le stockage est indisponible.
    }
    global.dispatchEvent?.(new CustomEvent("arcade-feedback-change"));
  }

  function findReport(state, reportId) {
    return state.reports.find((report) => report.id === reportId) || null;
  }

  function mutateReport(reportId, mutation) {
    const state = readState();
    const report = findReport(state, reportId);
    if (!report) throw new Error("feedback_not_found");
    mutation(report);
    report.updatedAt = new Date().toISOString();
    writeState(state);
    return clone(report);
  }

  function create(input = {}) {
    const type = clean(input.type, 40).toLocaleLowerCase("fr-BE");
    const urgency = clean(input.urgency, 20).toLocaleLowerCase("fr-BE");
    const description = clean(input.description, 2000);
    if (!TYPES.includes(type)) throw new Error("invalid_feedback_type");
    if (!URGENCIES.includes(urgency)) throw new Error("invalid_feedback_urgency");
    if (description.length < 10) throw new Error("feedback_description_too_short");

    const now = new Date().toISOString();
    const report = {
      id: randomId(),
      type,
      gameKey: clean(input.gameKey, 80) || "home",
      gameTitle: clean(input.gameTitle, 120) || "Accueil / interface générale",
      urgency,
      description,
      reporterPseudo: clean(input.reporterPseudo, 20) || null,
      status: "nouveau",
      createdAt: now,
      updatedAt: now,
      delivery: {
        channel: "emailjs",
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        sentAt: null,
        error: null,
      },
    };
    const state = readState();
    state.reports = [report, ...state.reports].slice(0, MAX_REPORTS);
    writeState(state);
    return clone(report);
  }

  function list(filters = {}) {
    return readState().reports
      .filter((report) => ["type", "urgency", "gameKey", "status"].every(
        (key) => !filters[key] || report[key] === filters[key],
      ))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  function updateStatus(reportId, status) {
    if (!STATUSES.includes(status)) throw new Error("invalid_feedback_status");
    return mutateReport(reportId, (report) => {
      report.status = status;
    });
  }

  function requireLocalAdmin() {
    if (!global.ArcadeLocalStore?.adminExportState) throw new Error("admin_required");
    try {
      global.ArcadeLocalStore.adminExportState();
    } catch (_) {
      throw new Error("admin_required");
    }
  }

  function adminUpdate(reportId, input = {}) {
    requireLocalAdmin();
    return mutateReport(reportId, (report) => {
      const type = clean(input.type ?? report.type, 40).toLocaleLowerCase("fr-BE");
      const urgency = clean(input.urgency ?? report.urgency, 20).toLocaleLowerCase("fr-BE");
      const status = clean(input.status ?? report.status, 30).toLocaleLowerCase("fr-BE");
      const description = clean(input.description ?? report.description, 2000);
      if (!TYPES.includes(type)) throw new Error("invalid_feedback_type");
      if (!URGENCIES.includes(urgency)) throw new Error("invalid_feedback_urgency");
      if (!STATUSES.includes(status)) throw new Error("invalid_feedback_status");
      if (description.length < 10) throw new Error("feedback_description_too_short");
      report.type = type;
      report.urgency = urgency;
      report.status = status;
      report.gameKey = clean(input.gameKey ?? report.gameKey, 80) || "home";
      report.gameTitle = clean(input.gameTitle ?? report.gameTitle, 120) || "Accueil / interface générale";
      report.reporterPseudo = clean(input.reporterPseudo ?? report.reporterPseudo, 20) || null;
      report.description = description;
    });
  }

  function adminRemove(reportId) {
    requireLocalAdmin();
    const state = readState();
    const index = state.reports.findIndex((report) => report.id === reportId);
    if (index < 0) throw new Error("feedback_not_found");
    const [removed] = state.reports.splice(index, 1);
    writeState(state);
    return clone(removed);
  }

  function normalizeImportedReport(candidate) {
    const type = clean(candidate?.type, 40).toLocaleLowerCase("fr-BE");
    const urgency = clean(candidate?.urgency, 20).toLocaleLowerCase("fr-BE");
    const status = clean(candidate?.status, 30).toLocaleLowerCase("fr-BE");
    const description = clean(candidate?.description, 2000);
    if (!candidate?.id || !TYPES.includes(type) || !URGENCIES.includes(urgency)
      || !STATUSES.includes(status) || description.length < 10) throw new Error("invalid_import");
    return {
      ...clone(candidate),
      id: clean(candidate.id, 120),
      type,
      urgency,
      status,
      description,
      gameKey: clean(candidate.gameKey, 80) || "home",
      gameTitle: clean(candidate.gameTitle, 120) || "Accueil / interface générale",
      reporterPseudo: clean(candidate.reporterPseudo, 20) || null,
      createdAt: candidate.createdAt || new Date().toISOString(),
      updatedAt: candidate.updatedAt || candidate.createdAt || new Date().toISOString(),
      delivery: candidate.delivery && typeof candidate.delivery === "object"
        ? clone(candidate.delivery)
        : { channel: "import", status: "pending", attempts: 0 },
    };
  }

  function adminExportState() {
    requireLocalAdmin();
    return clone(readState());
  }

  function adminImportState(payload, mode = "merge") {
    requireLocalAdmin();
    const source = payload?.data?.feedback || payload?.feedback || payload;
    if (source?.version !== 1 || !Array.isArray(source.reports)) throw new Error("invalid_import");
    const imported = source.reports.map(normalizeImportedReport);
    const reports = mode === "replace"
      ? imported
      : [...imported, ...readState().reports].filter((report, index, all) => (
        all.findIndex((candidate) => candidate.id === report.id) === index
      ));
    const next = { version: 1, reports: reports.slice(0, MAX_REPORTS) };
    writeState(next);
    return clone(next);
  }

  function templateParams(report) {
    const pseudo = report.reporterPseudo || "Visiteur anonyme";
    const subject = `[Francis Arcade] ${report.type} · ${report.gameTitle} · ${report.urgency}`;
    const message = [
      `Référence : ${report.id}`,
      `Type : ${report.type}`,
      `Urgence : ${report.urgency}`,
      `Jeu / zone : ${report.gameTitle} (${report.gameKey})`,
      `Pseudo : ${pseudo}`,
      `Statut : ${report.status}`,
      `Date : ${report.createdAt}`,
      "",
      report.description,
    ].join("\n");

    return {
      subject,
      title: subject,
      message,
      from_name: pseudo,
      name: pseudo,
      user_name: pseudo,
      report_id: report.id,
      report_type: report.type,
      type: report.type,
      urgency: report.urgency,
      game: report.gameTitle,
      game_key: report.gameKey,
      description: report.description,
      pseudo,
      status: report.status,
      created_at: report.createdAt,
      page_url: global.location?.href || "",
      user_agent: global.navigator?.userAgent || "",
    };
  }

  async function sendByEmail(reportId) {
    const state = readState();
    const report = findReport(state, reportId);
    if (!report) throw new Error("feedback_not_found");
    if (!emailConfig.enabled || !emailConfig.serviceId || !emailConfig.templateId || !emailConfig.publicKey) {
      throw new Error("email_not_configured");
    }
    if (typeof global.fetch !== "function") throw new Error("email_unavailable");

    mutateReport(reportId, (item) => {
      item.delivery ||= {};
      item.delivery.channel = "emailjs";
      item.delivery.status = "sending";
      item.delivery.attempts = Number(item.delivery.attempts || 0) + 1;
      item.delivery.lastAttemptAt = new Date().toISOString();
      item.delivery.error = null;
    });

    try {
      const response = await global.fetch(EMAIL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: emailConfig.serviceId,
          template_id: emailConfig.templateId,
          user_id: emailConfig.publicKey,
          template_params: templateParams(report),
        }),
      });
      if (!response.ok) {
        const details = clean(await response.text(), 240);
        throw new Error(`emailjs_${response.status}:${details}`);
      }
      return mutateReport(reportId, (item) => {
        item.delivery.status = "sent";
        item.delivery.sentAt = new Date().toISOString();
        item.delivery.error = null;
      });
    } catch (error) {
      mutateReport(reportId, (item) => {
        item.delivery.status = "failed";
        item.delivery.error = clean(error?.message, 240) || "email_delivery_failed";
      });
      throw new Error("email_delivery_failed");
    }
  }

  global.ArcadeFeedbackStore = Object.freeze({
    storageKey: STORAGE_KEY,
    types: TYPES,
    urgencies: URGENCIES,
    statuses: STATUSES,
    create,
    list,
    updateStatus,
    sendByEmail,
    adminUpdate,
    adminRemove,
    adminExportState,
    adminImportState,
  });
})(window);
