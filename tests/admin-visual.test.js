"use strict";

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
    adminPseudos: ["ADMIN", "ROOT"],
    gamePolicies: {},
  },
  shop: { items: [] },
};

require("../js/core/arcade-admin-config.js");
require("../js/core/arcade-local-store.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(ARCADE_ADMIN_CONFIG.themes.length === 3, "Trois thèmes admin doivent être centralisés");
assert(ARCADE_ADMIN_CONFIG.fonts.length === 4, "Quatre choix de police doivent être proposés");
assert(ARCADE_ADMIN_CONFIG.effects.length === 3, "Trois intensités d’effets doivent être proposées");

ArcadeLocalStore.login("ADMIN");
assert(ArcadeLocalStore.adminGetVisualPreferences().themeId === "executive", "Le thème professionnel doit être sélectionné par défaut");
ArcadeLocalStore.adminSaveVisualPreferences({
  themeId: "violet-office",
  fontId: "arcade-accent",
  effectsId: "minimal",
});

ArcadeLocalStore.login("ROOT");
assert(ArcadeLocalStore.adminGetVisualPreferences().themeId === "executive", "Chaque profil admin doit avoir ses propres préférences");
ArcadeLocalStore.adminSaveVisualPreferences({ themeId: "graphite", fontId: "data-mono", effectsId: "signature" });

ArcadeLocalStore.login("ADMIN");
const restored = ArcadeLocalStore.adminGetVisualPreferences();
assert(restored.themeId === "violet-office" && restored.fontId === "arcade-accent" && restored.effectsId === "minimal", "Les préférences doivent suivre le profil ADMIN");

console.log("Thèmes et préférences visuelles ADMIN : OK");
