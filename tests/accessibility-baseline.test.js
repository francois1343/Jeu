"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".html") ? [fullPath] : [];
  });
}

const allPages = htmlFiles(root);
const gamePages = htmlFiles(path.join(root, "games"));

for (const page of allPages) {
  const source = fs.readFileSync(page, "utf8");
  const label = path.relative(root, page);

  for (const match of source.matchAll(/<button\b[^>]*>/gi)) {
    assert.match(match[0], /\btype\s*=\s*["'][^"']+["']/i, `Bouton sans type explicite dans ${label}`);
  }

  assert.doesNotMatch(
    source,
    /<(?:div|span)\b[^>]*\bonclick\s*=/i,
    `Faux contrôle cliquable dans ${label}`,
  );
}

for (const page of gamePages) {
  const source = fs.readFileSync(page, "utf8");
  const label = path.relative(root, page);
  const headings = source.match(/<h1\b/gi) || [];
  assert.equal(headings.length, 1, `${label} doit contenir exactement un h1`);

  for (const match of source.matchAll(/<canvas\b[^>]*>/gi)) {
    assert.match(
      match[0],
      /\b(?:aria-label|aria-labelledby|aria-hidden)\s*=/i,
      `Canvas sans nom accessible ou masquage explicite dans ${label}`,
    );
  }
}

const sharedStyles = fs.readFileSync(path.join(root, "css", "shared", "arcade-game-shell.css"), "utf8");
assert.match(sharedStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
assert.match(sharedStyles, /html body \*::before/);
assert.match(sharedStyles, /animation-iteration-count:\s*1\s*!important/i);

const preferences = fs.readFileSync(path.join(root, "js", "core", "arcade-game-preferences.js"), "utf8");
assert.match(preferences, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
assert.match(preferences, /allowsAnimations:\s*\(\)\s*=>\s*current\.animations\s*&&\s*!prefersReducedMotion\(\)/);

console.log(`Accessibilité vérifiée : ${allPages.length} pages, ${gamePages.length} jeux`);
