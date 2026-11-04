"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { build, DEFAULT_SITE_URL } = require("../scripts/build-static");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if ([".git", "node_modules", "dist", ".vercel"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  }).sort();
}

function fingerprint(directory) {
  return Object.fromEntries(files(directory).map(file => [path.relative(directory, file), crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
}

function verifyPublishedPaths(base) {
  const xml = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
  const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(locations.length, 47, "Accueil, 43 jeux et trois pages légales");
  for (const location of locations) {
    assert.ok(location.startsWith(base), `Origine/sous-chemin incorrect : ${location}`);
    const relative = decodeURIComponent(location.slice(base.length)) || "index.html";
    assert.ok(fs.existsSync(path.join(out, relative)), `Sitemap sans fichier : ${relative}`);
    const html = fs.readFileSync(path.join(out, relative), "utf8");
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(html.includes(`rel="canonical" href="${location}"`));
    assert.equal(html.slice(html.indexOf("<body")), fs.readFileSync(path.join(root, relative), "utf8").slice(fs.readFileSync(path.join(root, relative), "utf8").indexOf("<body")), `Le build a altéré le jeu : ${relative}`);
  }
  assert.doesNotMatch(xml, /admin\/|offline\.html|404\.html|\/dist\//);
  assert.ok(fs.readFileSync(path.join(out, "robots.txt"), "utf8").includes(`Sitemap: ${base}sitemap.xml`));
  execFileSync(process.execPath, [path.join(root, "tests", "local-links.test.js")], { env: { ...process.env, ARCADE_STATIC_DIR: out } });
  const worker = fs.readFileSync(path.join(out, "service-worker.js"), "utf8");
  const shell = worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1];
  for (const asset of JSON.parse(shell.replace(/,\s*]/, "]"))) assert.ok(fs.existsSync(path.resolve(out, asset)), `Précache PWA absent : ${asset}`);
}

test("sortie Web complète, répétable, sans documents privés ni mutation des sources", () => {
  const before = fingerprint(root);
  const result = build(root, DEFAULT_SITE_URL);
  assert.equal(result.pages, 50);
  assert.equal(result.sitemap, 47);
  for (const excluded of [".git", ".env", "supabase", "docs", "tests", "scripts", "package.json", "package-lock.json", "README.md", "francis_arcade_audit_global.json", "francis_arcade_audit_global_export.csv", "Francis_Arcade_Audit_Trello.xlsx", "js/core/arcade-supabase-client.entry.js"]) assert.equal(fs.existsSync(path.join(out, excluded)), false, `${excluded} exposé`);
  assert.ok(fs.existsSync(path.join(out, "games", "jeuxdesphrases", "jeu-des-phrases.csv")), "Les données publiques du jeu de phrases sont nécessaires");
  verifyPublishedPaths(DEFAULT_SITE_URL);
  const first = fingerprint(out);
  fs.writeFileSync(path.join(out, "obsolete.html"), "ancien build");
  build(root, DEFAULT_SITE_URL);
  assert.deepEqual(fingerprint(out), first, "Build non déterministe ou reliquat conservé");
  build(root, "https://francois1343.github.io/Jeu/");
  verifyPublishedPaths("https://francois1343.github.io/Jeu/");
  build(root, DEFAULT_SITE_URL);
  assert.deepEqual(fingerprint(root), before, "Le build ne doit modifier aucun fichier source");
});
