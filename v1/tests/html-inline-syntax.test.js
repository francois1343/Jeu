"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
function findHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".html") ? [filePath] : [];
  });
}

const htmlFiles = findHtmlFiles(root);
let checked = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    try {
      new Function(match[1]);
      checked += 1;
    } catch (error) {
      throw new Error(`${path.relative(root, file)} · script inline ${index + 1}: ${error.message}`);
    }
  });
}

console.log(`Scripts inline vérifiés : ${checked}`);
