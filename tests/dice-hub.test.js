"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "games", "dice-hub", "dice-hub.html"), "utf8");
const script = fs.readFileSync(path.join(root, "games", "dice-hub", "dice-hub.js"), "utf8");
const css = fs.readFileSync(path.join(root, "games", "dice-hub", "dice-hub.css"), "utf8");
const bridge = fs.readFileSync(path.join(root, "js", "core", "arcade-game-bridge.js"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "js", "core", "arcade-config.js"), "utf8");
const gameConfig = fs.readFileSync(path.join(root, "js", "core", "arcade-game-config.js"), "utf8");
const districtGames = [
  fs.readFileSync(path.join(root, "games", "421", "index.html"), "utf8"),
  fs.readFileSync(path.join(root, "games", "Yahtzee", "yahtzee.html"), "utf8"),
  fs.readFileSync(path.join(root, "games", "Neon Dice Arena", "NeonDiceArena.html"), "utf8"),
];
const bohemeCss = fs.readFileSync(path.join(root, "games", "Yahtzee", "yahtzee.css"), "utf8");

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
assert.match(script, /count >= 12/, "Le lancer doit afficher assez d'étapes pour rendre l'animation perceptible");
assert.match(script, /}, 75\)/, "Le rythme du lancer doit rester lisible");
assert.match(script, /function updateRollingValues/, "L'animation doit actualiser les faces sans recréer les dés");
assert.match(css, /@keyframes dice-tumble/, "Les dés doivent disposer d'une animation de lancer visible");
assert.match(css, /\.result-die-value/, "La valeur de chaque dé doit rester fortement contrastée");
districtGames.forEach((gameHtml) => {
  assert.match(gameHtml, /data-arcade-home[^>]*href="\.\.\/dice-hub\/dice-hub\.html"/, "Chaque jeu de dés doit revenir au Dice District");
  assert.match(gameHtml, />← Dice District<\/a>/, "Le retour au District doit être explicite");
  assert.match(gameHtml, /class="arcade-district-session-slot" data-arcade-session-slot/, "Le menu du jeu doit être ancré en haut de chaque table");
});
assert.match(districtGames[0], /id="player-dice"/, "Le plateau 421 doit exposer les dés du joueur");
assert.match(fs.readFileSync(path.join(root, "games", "421", "421.js"), "utf8"), /pipPositions/, "Le 421 doit générer de vraies faces à points");
assert.match(fs.readFileSync(path.join(root, "games", "421", "421.css"), "utf8"), /\.die-tile[\s\S]*\.pip-mc/, "Les faces du 421 doivent être visibles et positionnées");
assert.match(fs.readFileSync(path.join(root, "games", "421", "421.css"), "utf8"), /@media \(min-width:\s*900px\) and \(min-height:\s*680px\)[\s\S]*body\s*\{\s*overflow:\s*hidden/, "Le 421 ne doit pas défiler inutilement sur desktop");
assert.match(bohemeCss, /#arcadeGameShellButton\s*\{\s*display:\s*none\s*!important/, "Dés de Bohème doit masquer le menu commun redondant");
assert.match(gameConfig, /"farkle-boheme"[\s\S]*showMenu:\s*false/, "Dés de Bohème doit masquer le lanceur dès sa création");
assert.match(gameConfig, /de:\s*game\([\s\S]*showMenu:\s*false/, "Dice District doit masquer le menu commun redondant");
assert.doesNotMatch(districtGames[1], /id="btn-quit"/, "Le retour Dice District doit remplacer le bouton Quitter de Dés de Bohème");
assert.match(bohemeCss, /body\s*>\s*\.arcade-home-link[\s\S]*var\(--bright-gold\)/, "Le retour Dice District doit reprendre les couleurs de la taverne");
assert.match(bohemeCss, /\.round-info[\s\S]*border-radius:\s*14px/, "Le bloc Objectif doit être adouci");
assert.match(bohemeCss, /\.control-dock[\s\S]*border-radius:\s*20px/, "Le panneau de lancer doit être modernisé");
assert.match(script, /francis_arcade_dice_settings_v1/);
assert.match(script, /francis_arcade_dice_stats_v1/);
assert.match(script, /francis_arcade_dice_config_v1/);
assert.match(home, /launchGame\('games\/dice-hub\/dice-hub\.html'/);
assert.match(home, /<h2 class="game-title">Dice District<\/h2>/);
assert.match(bridge, /\.arcade-return/, "Le pont doit réutiliser le retour Arcade de Dice District");
assert.match(html, /data-arcade-session-slot/, "Dice District doit ancrer le menu commun dans son en-tête");
assert.match(bridge, /arcade-session-hud--docked/, "Le HUD commun doit pouvoir être ancré hors du contenu");
assert.match(html, /class="free-mode-badge"[^>]*>FREE</, "Lancer libre doit afficher son statut gratuit");
assert.match(html, /id="play-button"[^>]*data-arcade-start-mode="magic"/, "Le bouton gratuit doit transmettre son mode au bridge");
assert.doesNotMatch(html, /id="mode-status"/, "Le statut redondant Table sélectionnée / Prêt doit être retiré");
assert.doesNotMatch(html, /id="open-settings"/, "Le panneau de table ne doit pas dupliquer le bouton Paramètres de l'en-tête");
assert.match(html, /id="open-settings-header"/, "Le bouton Paramètres principal doit rester disponible dans l'en-tête");
assert.match(script, /free:\s*true/, "Le mode Lancer libre doit être configuré comme gratuit");
assert.match(config, /de:\s*Object\.freeze\(\{ practiceModes:\s*Object\.freeze\(\["magic"\]\)/, "Le lancer libre doit démarrer sans mise");
assert.match(bridge, /isPracticeMode[\s\S]*session\.economyMode = "practice"/, "Le bridge serveur doit respecter les modes gratuits");
assert.match(css, /@media \(min-width:\s*1051px\) and \(min-height:\s*680px\)/, "Le menu PC doit tenir sans espacement vertical superflu");
assert.match(css, /\.mode-content\s*\{\s*min-width:\s*0;/, "Les libellés des cartes doivent pouvoir se contracter");
assert.match(css, /\.header-actions \.arcade-session-hud[\s\S]*var\(--accent\)/, "Le statut des Coins doit reprendre le thème orange du District");
assert.match(css, /@media \(max-width:\s*430px\)[\s\S]*\.arcade-return[\s\S]*font-size:\s*0;/, "Le retour Arcade doit devenir compact sur petit mobile");
assert.match(home, /<div class="game-icon" aria-hidden="true">🎲<\/div>/);
assert.doesNotMatch(home, /dice-(?:art|preview|hub-logo)/, "La carte d’accueil doit rester sobre et cohérente avec les autres émojis");
assert.match(home, /data-category-filter="dice"/);
assert.doesNotMatch(home + html, /[⚀⚁⚂⚃⚄⚅]/, "Les dés ne doivent pas dépendre de glyphes Unicode variables selon la plateforme");
assert.doesNotMatch(html, /⌂/, "Le retour vers l’arcade doit utiliser un libellé explicite");
assert.match(script, /function currentCount\(\)/);
assert.match(script, /Math\.min\(12, Math\.max\(1/);
for (const theme of ["solar", "electric", "ultraviolet", "emerald", "crimson"]) assert.match(html, new RegExp(`value="${theme}"`));
assert.match(config, /de: Object\.freeze\(\["chance", "dice"\]\)/);
assert.doesNotMatch(config, /de: Object\.freeze\(\{ economyMode: "practice" \}\)/, "Le hub de dés doit utiliser la mise commune");

console.log("Mini-hub Jeux de dés : structure et compatibilité vérifiées");
