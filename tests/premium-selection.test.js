"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const configSource = fs.readFileSync(path.join(root, "js", "core", "arcade-config.js"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sandbox = { window: {} };

vm.runInNewContext(configSource, sandbox, { filename: "arcade-config.js" });

const pilots = Array.from(sandbox.window.ARCADE_CONFIG.editorial.premiumPilotKeys);
const expected = [
  "crossyturfu",
  "421-duel",
  "farkle-boheme",
  "poker",
  "cyber-core-sorter",
  "taquin",
];

assert.deepEqual(pilots, expected, "La sélection canonique des six pilotes a changé");
assert.equal(new Set(pilots).size, 6, "Les six pilotes doivent être uniques");
assert(!pilots.includes("cyber-symbol-poker"), "Cyber-Symbol Poker doit rester hors de la sélection Premium");

const featuredSection = home.match(/<section class="featured-games"[\s\S]*?<\/section>/i);
assert(featuredSection, "La vitrine À jouer maintenant est introuvable");

const featuredKeys = [...featuredSection[0].matchAll(/data-game="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(featuredKeys, pilots, "La vitrine doit correspondre à la sélection canonique et conserver son ordre");

console.log("Sélection des six pilotes Premium figée et cohérente : OK");
