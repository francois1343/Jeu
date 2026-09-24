"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules"].includes(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

const pages = walk(root).filter((file) => file.endsWith(".html"));
const descriptions = new Set();
for (const page of pages) {
  const source = fs.readFileSync(page, "utf8");
  const relative = path.relative(root, page);
  const description = source.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1];
  assert.ok(description && description.length >= 50, `Meta description absente ou trop courte : ${relative}`);
  assert.match(source, /<meta\s+property="og:title"/i, `og:title absent : ${relative}`);
  assert.match(source, /<meta\s+property="og:description"/i, `og:description absent : ${relative}`);
  assert.match(source, /<meta\s+property="og:site_name"\s+content="Francis Arcade"/i, `og:site_name absent : ${relative}`);
  if (!relative.startsWith(`legal${path.sep}`)) {
    assert.ok(!descriptions.has(description), `Meta description dupliquée : ${relative}`);
    descriptions.add(description);
  }
  assert.doesNotMatch(source, /<(?:script|link)\b[^>]*(?:src|href)="https?:\/\//i, `Dépendance CDN distante : ${relative}`);
}

const missing = fs.readFileSync(path.join(root, "404.html"), "utf8");
const offline = fs.readFileSync(path.join(root, "offline.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");

assert.match(missing, /name="robots" content="noindex, follow"/);
assert.match(offline, /name="robots" content="noindex, follow"/);
assert.match(worker, /caches\.match\("\.\/offline\.html"\)/);
assert.doesNotMatch(worker, /\|\|\s*\(await caches\.match\("\.\/index\.html"\)\)/);
assert.match(robots, /User-agent:\s*\*/);
assert.match(robots, /Allow:\s*\//);
assert.doesNotMatch(robots, /localhost|127\.0\.0\.1/);
assert.ok(fs.existsSync(path.join(root, "scripts", "generate-sitemap.js")));
const sitemapGenerator = fs.readFileSync(path.join(root, "scripts", "generate-sitemap.js"), "utf8");
assert.match(sitemapGenerator, /ARCADE_SITE_URL/);
assert.match(sitemapGenerator, /rel=\"canonical\"/);
assert.match(sitemapGenerator, /property=\"og:url\"/);
assert.match(sitemapGenerator, /property=\"og:image\"/);
assert.ok(!fs.existsSync(path.join(root, "assets", "icons", "arcade-favicon.png")), "Le favicon source lourd doit être supprimé");
assert.ok(fs.statSync(path.join(root, "assets", "icons", "arcade-icon-v2-512.png")).size < 400_000, "L'icône 512 px doit être optimisée");

console.log(`SEO et fonctionnement hors ligne vérifiés : ${pages.length} pages.`);
