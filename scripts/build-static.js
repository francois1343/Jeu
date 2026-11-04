"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const { applyMetadata } = require("./apply-seo-metadata");
const { generate, siteBase } = require("./generate-sitemap");

const DEFAULT_SITE_URL = "https://jeu-sand-delta.vercel.app/";
const ROOT_FILES = ["index.html", "404.html", "offline.html", "manifest.webmanifest", "service-worker.js"];
const DIRECTORIES = ["assets", "css", "games", "js", "legal", "vendor", "admin"];
const EXTENSIONS = new Set([".html", ".css", ".js", ".png", ".svg", ".woff2", ".txt", ".csv"]);

function copyPublicDirectory(source, destination) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`Lien symbolique interdit dans la sortie Web : ${source}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Lien symbolique interdit dans la sortie Web : ${from}`);
    if (entry.isDirectory()) copyPublicDirectory(from, to);
    else if ((EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || entry.name === "LICENSE") && !entry.name.endsWith(".entry.js")) fs.copyFileSync(from, to);
  }
}

function build(root = path.resolve(__dirname, ".."), rawOrigin = process.env.ARCADE_SITE_URL || DEFAULT_SITE_URL) {
  const origin = siteBase(rawOrigin); // Validate before touching an existing build.
  root = fs.realpathSync(root);
  const out = path.resolve(root, "dist");
  if (path.dirname(out) !== root || path.basename(out) !== "dist") throw new Error("Sortie dist non sûre");
  if (fs.existsSync(out)) {
    if (fs.lstatSync(out).isSymbolicLink() || fs.realpathSync(out) !== out) throw new Error("dist doit être un dossier local, pas un lien");
    fs.rmSync(out, { recursive: true, force: true });
  }
  fs.mkdirSync(out);
  for (const file of ROOT_FILES) {
    const from = path.join(root, file);
    if (fs.lstatSync(from).isSymbolicLink()) throw new Error(`Fichier Web lié interdit : ${file}`);
    fs.copyFileSync(from, path.join(out, file));
  }
  for (const directory of DIRECTORIES) copyPublicDirectory(path.join(root, directory), path.join(out, directory));
  fs.mkdirSync(path.join(out, "data"));
  const audit = path.join(root, "data", "ux-audit.json");
  if (fs.lstatSync(audit).isSymbolicLink()) throw new Error("L'audit public doit être un fichier local");
  fs.copyFileSync(audit, path.join(out, "data", "ux-audit.json"));
  buildSync({
    absWorkingDir: root,
    entryPoints: ["js/core/arcade-supabase-client.entry.js"],
    bundle: true, minify: true, format: "iife", target: "es2020",
    outfile: path.join(out, "vendor", "supabase", "arcade-supabase-client.min.js"), legalComments: "none",
  });
  const pages = applyMetadata(out);
  const sitemap = generate(out, origin.href);
  return { output: out, pages, sitemap: sitemap.count, base: sitemap.base };
}

if (require.main === module) console.log(JSON.stringify(build(), null, 2));
module.exports = { build, DEFAULT_SITE_URL };
