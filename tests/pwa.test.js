"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.ok(manifest.name && manifest.short_name, "Le manifeste doit nommer l’application");
assert.ok(manifest.theme_color && manifest.background_color, "Les couleurs PWA sont requises");

for (const size of [192, 512]) {
  const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}` && entry.type === "image/png");
  assert.ok(icon, `L’icône ${size}x${size} est requise`);
  const data = fs.readFileSync(path.join(root, icon.src));
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "L’icône doit être un PNG");
  assert.equal(data.readUInt32BE(16), size, `Largeur incorrecte pour ${size}px`);
  assert.equal(data.readUInt32BE(20), size, `Hauteur incorrecte pour ${size}px`);
}

const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(home, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(home, /rel="icon" type="image\/png" href="assets\/icons\/arcade-favicon\.png"/);
assert.match(home, /js\/pwa-config\.js/);
assert.match(home, /js\/pwa-install\.js/);

const simon = fs.readFileSync(path.join(root, "games", "simon", "index.html"), "utf8");
assert.match(simon, /href="\.\.\/\.\.\/assets\/icons\/favicon\.svg"/);

const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
assert.match(worker, /APP_SHELL/);
assert.match(worker, /SKIP_WAITING/);
assert.match(worker, /staleWhileRevalidate/);

console.log("Configuration PWA vérifiée : OK");
