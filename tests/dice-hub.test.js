"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "games", "dice-hub", "dice-hub.html"), "utf8");
const script = fs.readFileSync(path.join(root, "games", "dice-hub", "dice-hub.js"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "js", "core", "arcade-config.js"), "utf8");

for (const id of [
  "menu-screen", "play-button", "game-screen", "dice-faces", "dice-count", "dice-result", "roll-total", "roll-button",
  "leaderboard-dialog", "leaderboard-list", "rules-dialog", "settings-dialog", "settings-form",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Élément requis manquant : ${id}`);
}

const modeDefinitions = { magic: /magic: Object\.freeze/, "421": /"421": Object\.freeze/, yahtzee: /yahtzee: Object\.freeze/ };
for (const mode of Object.keys(modeDefinitions)) {
  assert.match(html, new RegExp(`data-mode=["']${mode}["']`), `Sélecteur de table manquant : ${mode}`);
  assert.match(script, modeDefinitions[mode], `Configuration du mode manquante : ${mode}`);
}

assert.match(script, /Math\.floor\(Math\.random\(\) \* faces\) \+ 1/, "Le lancer aléatoire original doit être conservé");
assert.match(script, /count >= 10/, "Les dix valeurs de l’animation originale doivent être conservées");
assert.match(script, /}, 50\)/, "Le rythme original de 50 ms doit être conservé");
assert.match(script, /francis_arcade_dice_settings_v1/);
assert.match(script, /francis_arcade_dice_stats_v1/);
assert.match(script, /francis_arcade_dice_config_v1/);
assert.match(home, /launchGame\('games\/dice-hub\/dice-hub\.html'/);
assert.match(home, /<h2 class="game-title">Dice District<\/h2>/);
assert.match(home, /<div class="game-icon" aria-hidden="true">🎲<\/div>/);
assert.doesNotMatch(home, /dice-(?:art|preview|hub-logo)/, "La carte d’accueil doit rester sobre et cohérente avec les autres émojis");
assert.match(home, /data-category-filter="dice"/);
assert.doesNotMatch(home + html, /[⚀⚁⚂⚃⚄⚅]/, "Les dés ne doivent pas dépendre de glyphes Unicode variables selon la plateforme");
assert.doesNotMatch(html, /⌂/, "Le retour vers l’arcade doit utiliser un libellé explicite");
assert.match(script, /function currentCount\(\)/);
assert.match(script, /Math\.min\(12, Math\.max\(1/);
for (const theme of ["solar", "electric", "ultraviolet", "emerald", "crimson"]) assert.match(html, new RegExp(`value="${theme}"`));
assert.match(config, /de: Object\.freeze\(\["chance", "dice"\]\)/);
assert.match(config, /de: Object\.freeze\(\{ economyMode: "practice" \}\)/, "Le hub de dés doit rester gratuit comme l’ancien lancer intégré");

console.log("Mini-hub Jeux de dés : structure et compatibilité vérifiées");
