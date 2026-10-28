"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawnSync} = require("node:child_process");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-seo-"));
try {
  fs.mkdirSync(path.join(temporary, "scripts"));
  fs.mkdirSync(path.join(temporary, "games", "snake"), {recursive: true});
  fs.mkdirSync(path.join(temporary, "admin"));
  const generator = path.join(temporary, "scripts", "generate-sitemap.js");
  fs.copyFileSync(path.join(__dirname, "../scripts/generate-sitemap.js"), generator);
  const html = '<html><head>\n</head><body>Game</body></html>';
  for (const relative of ["index.html", "games/snake/index.html", "admin/index.html", "404.html", "offline.html"]) {
    fs.writeFileSync(path.join(temporary, relative), html);
  }
  fs.writeFileSync(path.join(temporary, "private.html"), html.replace("<head>", '<head><meta name="robots" content="noindex,follow">'));
  function generate(url) {
    return spawnSync(process.execPath, [generator], {encoding: "utf8", env: {...process.env, ARCADE_SITE_URL: url}});
  }
  assert.equal(generate("https://francois1343.github.io/Jeu").status, 0);
  const xml = fs.readFileSync(path.join(temporary, "sitemap.xml"), "utf8");
  assert.match(xml, /https:\/\/francois1343\.github\.io\/Jeu\//);
  assert.match(xml, /https:\/\/francois1343\.github\.io\/Jeu\/games\/snake\/index\.html/);
  assert.doesNotMatch(xml, /admin\/|404\.html|offline\.html|private\.html/);
  const home = fs.readFileSync(path.join(temporary, "index.html"), "utf8");
  assert.match(home, /canonical" href="https:\/\/francois1343\.github\.io\/Jeu\/"/);
  assert.equal(generate("https://francois1343.github.io/Jeu/").status, 0);
  assert.equal(fs.readFileSync(path.join(temporary, "index.html"), "utf8"), home, "La génération doit être idempotente");
  assert.equal(generate("https://arcade.example.com/").status, 0);
  for (const bad of ["http://example.com/", "https://name:secret@example.com/", "https://example.com/?q=1", "https://example.com/#fragment"]) {
    assert.notEqual(generate(bad).status, 0);
  }
  console.log("Déploiement SEO : sous-chemin GitHub Pages, exclusions et idempotence vérifiés.");
} finally {
  const resolved = fs.realpathSync(temporary);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("arcade-seo-"));
  fs.rmSync(resolved, {recursive: true, force: true});
}
