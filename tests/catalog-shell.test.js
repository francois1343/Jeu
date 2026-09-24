"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js", "core", "arcade-game-config.js"), "utf8"), sandbox);

const shell = sandbox.window.ARCADE_GAME_CONFIG.shell;
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogKeys = [...new Set([...home.matchAll(/data-game="([^"]+)"/g)].map((match) => match[1]))];

assert.equal(catalogKeys.length, 43, "L’index doit exposer les 43 entrées attendues");
for (const key of catalogKeys) {
  const game = shell.games[key];
  assert(game, `Configuration du menu commun absente pour ${key}`);
  assert(game.title && game.rulesTitle && game.rules, `Règles incomplètes pour ${key}`);
  assert.equal(game.tutorial?.length, 3, `Le tutoriel de ${key} doit contenir trois étapes`);
  for (const step of game.tutorial) assert(step.title && step.text, `Étape de tutoriel incomplète pour ${key}`);
}

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".html") ? [fullPath] : [];
  });
}

const pages = htmlFiles(path.join(root, "games"));
assert.equal(pages.length, 43, "Le catalogue doit conserver ses 43 pages de jeu");
for (const page of pages) {
  const folder = path.basename(path.dirname(page)).toLocaleLowerCase("fr");
  const key = shell.routeAliases[folder];
  assert(key, `Route du menu commun absente pour ${path.relative(root, page)}`);
  assert(shell.games[key], `La route ${folder} pointe vers une configuration inconnue : ${key}`);
}

const bridge = fs.readFileSync(path.join(root, "js", "core", "arcade-game-bridge.js"), "utf8");
assert.match(bridge, /dataset\.arcadeShell !== "false"/, "Le shell doit être actif par défaut");
assert.doesNotMatch(bridge, /dataset\.arcadeShell === "true"/, "Le shell ne doit plus dépendre d’une liste blanche de pages");

const shellSource = fs.readFileSync(path.join(root, "js", "core", "arcade-game-shell.js"), "utf8");
for (const label of ["Tutoriel", "Classement", "Paramètres", "Règles"]) {
  assert.match(shellSource, new RegExp(label), `L’onglet ${label} doit rester disponible`);
}
assert.match(shellSource, /arcade:pause-request/, "Le contrat de pause commun doit rester disponible");
assert.match(shellSource, /arcade-game-shell-launcher/, "Le menu doit fonctionner en ouverture directe");

console.log(`Menu commun vérifié : ${catalogKeys.length} entrées et ${pages.length} pages couvertes`);
