"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const skippedDirectories = new Set([".git", "node_modules", "supabase", "docs", "tests"]);
const issues = [];

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) return [];
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath);
    return [filePath];
  });
}

function isLocalReference(value) {
  return value
    && !/^(?:[a-z]+:|\/\/|#)/i.test(value.trim());
}

function verifyReference(file, value) {
  if (!isLocalReference(value)) return;
  const reference = value.trim().split(/[?#]/, 1)[0];
  if (!reference) return;
  const target = reference.startsWith("/")
    ? path.join(root, reference.slice(1))
    : path.resolve(path.dirname(file), reference);
  if (!fs.existsSync(target)) {
    issues.push(`${path.relative(root, file)} -> ${value}`);
  }
}

const files = collectFiles(root);

for (const file of files.filter((item) => item.endsWith(".html"))) {
  const html = fs.readFileSync(file, "utf8");
  for (const match of html.matchAll(/(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
    verifyReference(file, match[2]);
  }
}

for (const file of files.filter((item) => item.endsWith(".css"))) {
  const css = fs.readFileSync(file, "utf8");
  for (const match of css.matchAll(/url\(\s*["']?([^"'\)\s]+)["']?\s*\)/gi)) {
    verifyReference(file, match[1]);
  }
}

const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const match of home.matchAll(/launchGame\('([^']+)'/g)) {
  verifyReference(path.join(root, "index.html"), match[1]);
}

if (issues.length) {
  throw new Error(`Ressources locales introuvables :\n${issues.join("\n")}`);
}

console.log(`Liens locaux vérifiés : ${files.filter((item) => item.endsWith(".html")).length} pages`);
