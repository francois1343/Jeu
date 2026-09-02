"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "js", "arcade-admin-loader.js"), "utf8");

assert.match(home, /js\/arcade-admin-loader\.js/);
for (const resource of [
  "css/arcade-admin.css",
  "js/core/arcade-admin-config.js",
  "js/core/arcade-audit-store.js",
  "js/core/arcade-admin-data.js",
  "js/arcade-admin.js",
]) {
  assert.match(loader, new RegExp(resource.replaceAll(".", "\\.")), `${resource} doit être chargé par le loader ADMIN`);
}
assert.doesNotMatch(home, /<script src="js\/arcade-admin\.js"/);
assert.doesNotMatch(home, /<link rel="stylesheet" href="css\/arcade-admin\.css"/);
assert.doesNotMatch(worker, /arcade-favicon\.png/);
assert.ok(fs.statSync(path.join(root, "assets", "icons", "arcade-icon-v2-192.png")).size < 100_000);

console.log("Chargement léger et ressources à la demande : OK");
