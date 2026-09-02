"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
global.CustomEvent = class CustomEvent {};
global.addEventListener = () => {};
global.dispatchEvent = () => {};

const values = new Map();
global.localStorage = {
  getItem: (key) => (values.has(key) ? values.get(key) : null),
  setItem: (key, value) => values.set(key, value),
};
global.ARCADE_CONFIG = {
  coins: { unitsPerCoin: 100 },
  localEconomy: {
    starterCoins: 5,
    maxHistoryEntries: 60,
    maxSessionEntries: 40,
    adminPseudos: ["ADMIN"],
    gamePolicies: {},
  },
  shop: { items: [] },
};
const source = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "francis_arcade_audit_global.json"), "utf8"));
const csvSource = fs.readFileSync(path.join(__dirname, "..", "francis_arcade_audit_global_export.csv"), "utf8");
global.fetch = async () => ({ ok: true, json: async () => source });

require("../js/core/arcade-local-store.js");
require("../js/core/arcade-audit-store.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function run() {
  ArcadeLocalStore.login("ADMIN");
  await ArcadeAuditStore.init();
  assert(ArcadeAuditStore.list().length === source.audit_items.length, "Le JSON global doit initialiser l’audit local");

  const first = ArcadeAuditStore.list()[0];
  ArcadeAuditStore.save({
    previousId: first.id,
    id: first.id,
    category: first.catégorie,
    title: first.titre,
    priority: first.priorité,
    status: "en_cours",
    objective: first.objectif,
    checklist: first.checklist,
  });
  assert(ArcadeAuditStore.list()[0].statut === "en_cours", "Un audit doit pouvoir être modifié localement");

  const imported = JSON.parse(JSON.stringify(source));
  imported.audit_items.push({
    id: "TEST-001",
    category: "Test",
    title: "Élément importé",
    objective: "Vérifier l’import direct du fichier global.",
    priority: "confort",
    status: "backlog",
    checklist: ["Contrôle local"],
  });
  ArcadeAuditStore.adminImportDocument(imported, "merge");
  assert(ArcadeAuditStore.list().some((item) => item.id === "TEST-001"), "Le JSON global doit être importable directement");

  ArcadeAuditStore.adminImportCsv(csvSource, "replace");
  assert(ArcadeAuditStore.list().length === source.audit_items.length, "Le CSV doit reconstruire les 32 éléments d’audit");
  assert(ArcadeAuditStore.getDocument().roadmap.length === source.roadmap.length, "Le CSV doit reconstruire la roadmap");
  assert(ArcadeAuditStore.getDocument().user_journeys.length === source.user_journeys.length, "Le CSV doit reconstruire les parcours");

  ArcadeLocalStore.logout();
  let denied = false;
  try { ArcadeAuditStore.remove("TEST-001"); }
  catch (error) { denied = error.message === "admin_required"; }
  assert(denied, "La modification d’audit doit être réservée à ADMIN");

  console.log("Audit global JSON et copie locale ADMIN : OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
