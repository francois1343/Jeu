"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const sandbox = { window: {} };

vm.runInNewContext(read("js", "core", "arcade-game-config.js"), sandbox, {
  filename: "arcade-game-config.js",
});

const pilots = [
  { key: "crossyturfu", html: ["games", "crossy-turfu", "index.html"], scripts: [], styles: [] },
  { key: "421-duel", html: ["games", "421", "index.html"], scripts: [["games", "421", "421.js"]], styles: [["games", "421", "421.css"]] },
  { key: "farkle-boheme", html: ["games", "Yahtzee", "yahtzee.html"], scripts: [["games", "Yahtzee", "yahtzee.js"]], styles: [["games", "Yahtzee", "yahtzee.css"]] },
  { key: "poker", html: ["games", "Poker", "poker.html"], scripts: [["games", "Poker", "poker.js"]], styles: [["games", "Poker", "poker.css"]] },
  { key: "cyber-core-sorter", html: ["games", "Cyber-CoreSorter", "Cyber-CoreSorter.html"], scripts: [["games", "Cyber-CoreSorter", "Cyber-CoreSorter.js"]], styles: [["games", "Cyber-CoreSorter", "Cyber-CoreSorter.css"]] },
  { key: "taquin", html: ["games", "taquin", "index.html"], scripts: [["games", "taquin", "taquin.js"]], styles: [["games", "taquin", "taquin.css"]] },
];

const gameConfig = sandbox.window.ARCADE_GAME_CONFIG;
assert.equal(gameConfig.version, 2, "Le contrat de configuration Premium doit être en version 2");

pilots.forEach((pilot) => {
  const html = read(...pilot.html);
  const source = [html, ...pilot.scripts.map((file) => read(...file))].join("\n");
  const styles = [html, ...pilot.styles.map((file) => read(...file))].join("\n");
  const label = pilot.html.join("/");
  const tutorial = gameConfig.shell.games[pilot.key]?.tutorial;

  assert.match(html, /<body[^>]*data-arcade-shell="true"/i, `${label} doit activer le shell commun`);
  assert.match(html, /arcade-game-bridge\.js/i, `${label} doit charger le bridge de session`);
  assert.match(html, /<main\b/i, `${label} doit exposer une région main`);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i, `${label} doit autoriser le zoom`);
  assert.match(source, /ArcadeGameShell\?*\.configure|ArcadeGameShell\.configure/i, `${label} doit raccorder son adaptateur au shell`);
  assert.match(source, /pause\s*(?::|\()/i, `${label} doit déclarer un adaptateur de pause`);
  assert.match(source, /resume\s*(?::|\()/i, `${label} doit déclarer un adaptateur de reprise`);
  assert.match(source, /ArcadeGameSession(?:\?\.)?\.replay\s*\(/i, `${label} doit recréer la session lors d'un rejeu terminal`);
  assert.match(styles, /:focus-visible/i, `${label} doit rendre le focus clavier visible`);
  assert.match(styles, /prefers-reduced-motion/i, `${label} doit respecter la réduction des mouvements`);

  assert(Array.isArray(tutorial), `${pilot.key} doit posséder un tutoriel`);
  assert.equal(tutorial.length, 3, `${pilot.key} doit proposer exactement trois étapes`);
  const wordCount = tutorial.flatMap((step) => `${step.title} ${step.text}`.trim().split(/\s+/)).length;
  assert(wordCount <= 60, `${pilot.key} dépasse les 60 mots du tutoriel court`);
});

const shellSource = read("js", "core", "arcade-game-shell.js");
const shellStyles = read("css", "shared", "arcade-game-shell.css");
assert.match(shellSource, /aria-live="polite"/, "Le résultat commun doit être annoncé");
assert.match(shellSource, /visibilitychange/, "Le shell doit suspendre une partie passée en arrière-plan");
assert.match(shellSource, /tutorialSeenKey/, "La consultation du tutoriel doit être mémorisée");
assert.match(shellStyles, /data-arcade-animations="off"/, "Le réglage d'animations commun doit être appliqué");

const poker = `${read("games", "Poker", "poker.html")}\n${read("games", "Poker", "poker.js")}`;
assert.doesNotMatch(poker, /€|\beuros?\b/i, "Poker ne doit pas suggérer une monnaie réelle");
assert.match(poker, /jetons fictifs/i, "Poker doit expliciter que ses jetons sont fictifs");

console.log("Contrat UX automatisable des six pilotes vérifié : OK");
