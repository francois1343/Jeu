"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const values = new Map();
const events = [];

global.window = global;
global.document = { documentElement: { dataset: {} } };
global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};
global.addEventListener = () => {};
global.dispatchEvent = (event) => events.push(event);
global.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
};
global.ARCADE_CONFIG = {
  coins: { unitsPerCoin: 100 },
  localEconomy: {
    starterCoins: 5,
    playCostCoins: 1,
    winPayoutCoins: 1.25,
    maxHistoryEntries: 60,
    maxSessionEntries: 40,
    adminPseudos: ["ADMIN"],
  },
};

require("../js/core/arcade-game-config.js");
require("../js/core/arcade-local-store.js");

ArcadeLocalStore.login("Alice");
assert.deepEqual(ArcadeLocalStore.getGamePreferences(), {
  sound: true,
  music: true,
  vibration: true,
  animations: true,
  visualIntensity: "balanced",
});

require("../js/core/arcade-game-preferences.js");
ArcadeGamePreferences.update({ sound: false, vibration: false, visualIntensity: "calm" });
assert.equal(ArcadeGamePreferences.allowsSound(), false);
assert.equal(document.documentElement.dataset.arcadeSound, "off");
assert.equal(document.documentElement.dataset.arcadeVisualIntensity, "calm");
assert.equal(ArcadeLocalStore.getGamePreferences().vibration, false);
assert.ok(events.some((event) => event.type === "arcade:preferences-change"));

assert.deepEqual(ARCADE_GAME_CONFIG.transitions.created, ["started", "abandoned"]);
assert.deepEqual(ARCADE_GAME_CONFIG.transitions.started, ["won", "lost", "abandoned"]);

const pages = [];
function collect(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (entry.name.endsWith(".html")) pages.push(target);
  });
}
collect(path.join(root, "games"));
assert.equal(pages.length, 35, "Le parc de jeux attendu doit rester complet");
pages.forEach((page) => {
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /arcade-game-bridge\.js/, `${path.relative(root, page)} doit charger le pont central`);
});

const game2048 = fs.readFileSync(path.join(root, "games", "2048", "index.html"), "utf8");
assert.match(game2048, /<body[^>]*data-arcade-shell="true"/, "2048 doit être le pilote du menu commun");

const crossy = fs.readFileSync(path.join(root, "games", "crossy-turfu", "index.html"), "utf8");
assert.match(crossy, /setItem\("crossy_tokens"/, "Les jetons Crossy doivent avoir leur stockage propre");
assert.doesNotMatch(crossy, /setItem\("crossy_coins"/, "Crossy ne doit plus écrire dans une monnaie nommée Coins");

console.log("Socle commun des jeux vérifié : OK");
