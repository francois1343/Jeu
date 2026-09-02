(function arcadeAuditStore(global) {
  "use strict";

  const STORAGE_KEY = "arcade.audit.v1";
  const SOURCE_URL = "francis_arcade_audit_global.json";
  const SOURCE_CSV_URL = "francis_arcade_audit_global_export.csv";
  const DEFAULT_STATUSES = ["backlog", "a_faire", "en_cours", "bloque", "termine"];
  const DEFAULT_PRIORITIES = ["critique", "importante", "confort", "future"];
  let memoryFallback = null;
  let ready = false;

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function clean(value, maxLength = 500) {
    return String(value || "").normalize("NFKC").trim().slice(0, maxLength);
  }

  function requireAdmin() {
    if (!global.ArcadeLocalStore?.adminExportState) throw new Error("admin_required");
    global.ArcadeLocalStore.adminExportState();
  }

  function validateDocument(document) {
    if (!document?.project || !Array.isArray(document.audit_items)
      || !Array.isArray(document.statuses) || !Array.isArray(document.priorities)) {
      throw new Error("invalid_audit_import");
    }
    const ids = new Set();
    document.audit_items.forEach((item) => {
      const id = clean(item?.id, 40);
      if (!id || ids.has(id) || !clean(item?.title, 160)) throw new Error("invalid_audit_import");
      ids.add(id);
    });
    return document;
  }

  function parseCsv(text) {
    const matrix = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else cell += character;
      } else if (character === '"') quoted = true;
      else if (character === ",") {
        row.push(cell);
        cell = "";
      } else if (character === "\n") {
        row.push(cell.replace(/\r$/, ""));
        if (row.some((value) => value !== "")) matrix.push(row);
        row = [];
        cell = "";
      } else cell += character;
    }
    row.push(cell.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) matrix.push(row);
    const [headers, ...records] = matrix;
    if (!headers?.includes("record_type")) throw new Error("invalid_audit_csv");
    return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }

  function parseDetails(value) {
    try { return value ? JSON.parse(value) : {}; } catch (_) { throw new Error("invalid_audit_csv"); }
  }

  function documentFromCsv(text) {
    const current = getDocument();
    const document = {
      project: {},
      statuses: current?.statuses || DEFAULT_STATUSES,
      priorities: current?.priorities || DEFAULT_PRIORITIES,
      labels: [],
      audit_items: [],
      user_journeys: [],
      roadmap: [],
      admin_data_strategy: {},
      product_rule: "",
    };
    parseCsv(text).forEach((record) => {
      const details = parseDetails(record.details);
      if (record.record_type === "project") {
        document.project[record.id.replace(/^project_/, "")] = record.objective;
      } else if (record.record_type === "label") document.labels.push(details);
      else if (record.record_type === "audit_item") {
        document.audit_items.push({
          id: record.id,
          category: record.category,
          title: record.title,
          objective: record.objective,
          priority: record.priority,
          status: record.status,
          checklist: Array.isArray(details.checklist) ? details.checklist : [],
        });
      } else if (record.record_type === "user_journey") {
        document.user_journeys.push({
          id: record.id,
          name: record.title,
          steps: Array.isArray(details.steps) ? details.steps : [],
          goal: record.objective,
        });
      } else if (record.record_type === "roadmap") document.roadmap.push(details);
      else if (record.record_type === "admin_strategy") document.admin_data_strategy = details;
      else if (record.record_type === "product_rule") document.product_rule = record.objective;
    });
    return validateDocument(document);
  }

  function readState() {
    try {
      const value = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "null");
      if (value?.version === 1 && value.document) return value;
    } catch (_) {
      // La copie mémoire garde l'audit disponible pour la session.
    }
    return memoryFallback;
  }

  function writeState(state) {
    memoryFallback = clone(state);
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    ready = true;
    global.dispatchEvent?.(new CustomEvent("arcade-audit-change"));
  }

  async function init() {
    const stored = readState();
    if (stored) {
      ready = true;
      global.dispatchEvent?.(new CustomEvent("arcade-audit-change"));
      return clone(stored.document);
    }
    try {
      const response = await global.fetch(SOURCE_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error("audit_source_unavailable");
      const document = validateDocument(await response.json());
      writeState({ version: 1, source: SOURCE_URL, importedAt: new Date().toISOString(), document });
      return clone(document);
    } catch (_) {
      try {
        const response = await global.fetch(SOURCE_CSV_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error("audit_source_unavailable");
        const document = documentFromCsv(await response.text());
        writeState({ version: 1, source: SOURCE_CSV_URL, importedAt: new Date().toISOString(), document });
        return clone(document);
      } catch (_) {
        ready = true;
        global.dispatchEvent?.(new CustomEvent("arcade-audit-change"));
        return null;
      }
    }
  }

  function getDocument() {
    const state = readState();
    return state?.document ? clone(state.document) : null;
  }

  function list() {
    const document = getDocument();
    if (!document) return [];
    return document.audit_items.map((item) => ({
      id: item.id,
      catégorie: item.category,
      titre: item.title,
      priorité: item.priority,
      statut: item.status,
      objectif: item.objective,
      contrôles: Array.isArray(item.checklist) ? item.checklist.length : 0,
      checklist: Array.isArray(item.checklist) ? item.checklist.join("\n") : "",
    }));
  }

  function save(input = {}) {
    requireAdmin();
    const state = readState();
    if (!state?.document) throw new Error("audit_unavailable");
    const previousId = clean(input.previousId || input.id, 40);
    const id = clean(input.id, 40).toLocaleUpperCase("fr-BE");
    const title = clean(input.title, 160);
    const category = clean(input.category, 80);
    const objective = clean(input.objective, 600);
    const priority = clean(input.priority, 30);
    const status = clean(input.status, 30);
    const checklist = String(input.checklist || "").split(/\r?\n/).map((item) => clean(item, 220)).filter(Boolean);
    if (!id || !title || !category || !objective || !state.document.priorities.includes(priority)
      || !state.document.statuses.includes(status)) throw new Error("invalid_audit_item");
    const existingIndex = state.document.audit_items.findIndex((item) => item.id === previousId);
    const duplicate = state.document.audit_items.some((item, index) => item.id === id && index !== existingIndex);
    if (duplicate) throw new Error("audit_item_exists");
    const item = { id, category, title, objective, priority, status, checklist };
    if (existingIndex >= 0) state.document.audit_items.splice(existingIndex, 1, item);
    else state.document.audit_items.push(item);
    state.updatedAt = new Date().toISOString();
    writeState(state);
    return clone(item);
  }

  function remove(itemId) {
    requireAdmin();
    const state = readState();
    if (!state?.document) throw new Error("audit_unavailable");
    const index = state.document.audit_items.findIndex((item) => item.id === itemId);
    if (index < 0) throw new Error("audit_item_not_found");
    const [removed] = state.document.audit_items.splice(index, 1);
    state.updatedAt = new Date().toISOString();
    writeState(state);
    return clone(removed);
  }

  function adminExportState() {
    requireAdmin();
    const state = readState();
    return state ? clone(state) : null;
  }

  function adminImportDocument(payload, mode = "merge") {
    requireAdmin();
    const incoming = validateDocument(clone(payload?.document || payload));
    const current = readState();
    let document = incoming;
    if (mode === "merge" && current?.document) {
      const byId = new Map(current.document.audit_items.map((item) => [item.id, item]));
      incoming.audit_items.forEach((item) => byId.set(item.id, item));
      document = {
        ...current.document,
        ...incoming,
        audit_items: [...byId.values()],
      };
    }
    const next = {
      version: 1,
      source: payload?.source || SOURCE_URL,
      importedAt: new Date().toISOString(),
      document,
    };
    writeState(next);
    return clone(next);
  }

  function adminImportCsv(text, mode = "merge") {
    requireAdmin();
    return adminImportDocument(documentFromCsv(text), mode);
  }

  global.ArcadeAuditStore = Object.freeze({
    storageKey: STORAGE_KEY,
    sourceUrl: SOURCE_URL,
    sourceCsvUrl: SOURCE_CSV_URL,
    init,
    isReady: () => ready,
    getDocument,
    list,
    save,
    remove,
    adminExportState,
    adminImportDocument,
    adminImportCsv,
  });

  init();
})(window);
