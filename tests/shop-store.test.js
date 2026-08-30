"use strict";

global.window = global;
global.CustomEvent = class CustomEvent {};
global.dispatchEvent = () => {};

const values = new Map();
global.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
};
global.ARCADE_CONFIG = {
  coins: { unitsPerCoin: 100 },
  localEconomy: { starterCoins: 5, maxHistoryEntries: 60, maxSessionEntries: 40 },
  shop: {
    items: [
      { id: "theme-a", name: "Thème A", slot: "theme", priceCoins: 2 },
      { id: "theme-b", name: "Thème B", slot: "theme", priceCoins: 1 },
      { id: "avatar-a", name: "Avatar A", slot: "avatar", priceCoins: 1 },
      { id: "costly", name: "Objet coûteux", slot: "badge", priceCoins: 10 },
    ],
  },
};

require("../js/core/arcade-local-store.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

ArcadeLocalStore.login("Alice");
let profile = ArcadeLocalStore.purchaseShopItem("theme-a");
assert(profile.balanceUnits === 300, "L’achat doit débiter le portefeuille existant");
assert(profile.inventory.some((entry) => entry.itemId === "theme-a"), "L’objet acheté doit rejoindre l’inventaire");
assert(profile.equipped.theme === "theme-a", "Le nouvel objet doit être équipé automatiquement");
assert(profile.history[0].type === "shop_purchase", "L’achat doit être historisé comme transaction boutique");

let duplicateRejected = false;
try {
  ArcadeLocalStore.purchaseShopItem("theme-a");
} catch (error) {
  duplicateRejected = error.message === "shop_item_owned";
}
assert(duplicateRejected, "Un même objet ne doit pas pouvoir être acheté deux fois");
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 300, "Un doublon refusé ne doit pas débiter le solde");

ArcadeLocalStore.purchaseShopItem("theme-b");
profile = ArcadeLocalStore.equipShopItem("theme-a");
assert(profile.equipped.theme === "theme-a", "Un objet possédé doit pouvoir être rééquipé");
assert(profile.balanceUnits === 200, "Équiper un objet possédé doit être gratuit");

profile = ArcadeLocalStore.purchaseShopItem("avatar-a");
assert(profile.equipped.avatar === "avatar-a", "Les emplacements d’équipement doivent rester indépendants");

let insufficientRejected = false;
try {
  ArcadeLocalStore.purchaseShopItem("costly");
} catch (error) {
  insufficientRejected = error.message === "insufficient_balance";
}
assert(insufficientRejected, "Un achat trop cher doit être refusé");
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 100, "Un achat refusé ne doit pas modifier le solde");

console.log("Boutique locale, inventaire et équipement : OK");
