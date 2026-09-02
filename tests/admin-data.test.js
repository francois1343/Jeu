"use strict";

global.window = global;
global.CustomEvent = class CustomEvent {};
global.addEventListener = () => {};
global.dispatchEvent = () => {};
global.document = { querySelectorAll: () => [] };

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
    gameCategories: {},
    gamePolicies: {},
  },
  shop: { items: [] },
};

require("../js/core/arcade-local-store.js");
require("../js/core/arcade-stats.js");
require("../js/core/arcade-feedback.js");
require("../js/core/arcade-admin-data.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

ArcadeLocalStore.login("ADMIN");
const created = ArcadeAdminData.saveRecord("profiles", { pseudo: "Neo Test", balanceCoins: 3.5 });
assert(created.id === "neo test" && created.balanceUnits === 350, "L’admin doit pouvoir créer un profil local");

const updated = ArcadeAdminData.saveRecord("profiles", { id: created.id, pseudo: "Neo Test", balanceCoins: 4.25 });
assert(updated.balanceUnits === 425, "L’admin doit pouvoir modifier le solde d’un profil");

const report = ArcadeAdminData.saveRecord("feedback", {
  type: "bug",
  urgency: "normale",
  status: "nouveau",
  gameKey: "home",
  gameTitle: "Accueil",
  reporterPseudo: "Neo Test",
  description: "Le bouton de test ne répond pas correctement.",
});
ArcadeAdminData.saveRecord("feedback", { ...report, status: "en cours" });
assert(ArcadeAdminData.getRows("feedback")[0].statut === "en cours", "Le feedback doit être modifiable");

const snapshot = ArcadeAdminData.exportSnapshot();
assert(snapshot.schema === "francis-arcade-local-admin", "L’export doit avoir un schéma versionné");
assert(snapshot.data.localStore.profiles[created.id], "L’export doit contenir les profils");
assert(snapshot.data.feedback.reports.length === 1, "L’export doit contenir les feedbacks");

ArcadeAdminData.deleteRecord("profiles", created.id);
assert(!ArcadeLocalStore.getProfile(created.id), "La suppression locale doit retirer le profil");
ArcadeAdminData.importSnapshot(snapshot, "merge");
assert(ArcadeLocalStore.getProfile(created.id)?.balanceUnits === 425, "L’import doit restaurer le profil");

let adminProtected = false;
try { ArcadeAdminData.deleteRecord("profiles", "admin"); }
catch (error) { adminProtected = error.message === "admin_self_protected"; }
assert(adminProtected, "Le profil ADMIN actif doit être protégé contre la suppression");

ArcadeLocalStore.logout();
let denied = false;
try { ArcadeAdminData.getRows("profiles"); }
catch (error) { denied = error.message === "admin_required"; }
assert(denied, "La console de données doit refuser un profil non ADMIN");

console.log("Console de données ADMIN locale : OK");
