"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));
let checked = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    try {
      new Function(match[1]);
      checked += 1;
    } catch (error) {
      throw new Error(`${file} · script inline ${index + 1}: ${error.message}`);
    }
  });
}

console.log(`Scripts inline vérifiés : ${checked}`);
