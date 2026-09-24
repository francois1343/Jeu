"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rawOrigin = process.env.ARCADE_SITE_URL;
if (!rawOrigin) {
  throw new Error("Définissez ARCADE_SITE_URL avec le domaine public, par exemple https://arcade.example.com");
}

const origin = new URL(rawOrigin);
if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("ARCADE_SITE_URL doit être une origine HTTPS sans chemin, requête ni fragment.");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules"].includes(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

const excluded = new Set(["404.html", "offline.html"]);
const publicPages = walk(root)
  .filter((file) => file.endsWith(".html"))
  .map((file) => ({ file, relative: path.relative(root, file).replaceAll(path.sep, "/") }))
  .filter((page) => !excluded.has(page.relative))
  .sort((left, right) => left.relative.localeCompare(right.relative, "fr"))
  .map((page) => ({
    ...page,
    location: page.relative === "index.html" ? origin.href : new URL(page.relative, origin).href,
  }));

const socialImage = new URL("assets/icons/arcade-icon-v2-512.png", origin).href;
for (const page of publicPages) {
  let source = fs.readFileSync(page.file, "utf8");
  source = source.replace(/^[ \t]*<!-- SEO_DEPLOY_START -->[\s\S]*?<!-- SEO_DEPLOY_END -->[ \t]*(?:\r?\n)?/im, "");
  const deployMetadata = [
    "    <!-- SEO_DEPLOY_START -->",
    `    <link rel="canonical" href="${page.location}" />`,
    `    <meta property="og:url" content="${page.location}" />`,
    `    <meta property="og:image" content="${socialImage}" />`,
    `    <meta name="twitter:image" content="${socialImage}" />`,
    "    <!-- SEO_DEPLOY_END -->",
  ].join("\n");
  source = source.replace(/^[ \t]*<\/head>/im, `${deployMetadata}\n  </head>`);
  fs.writeFileSync(page.file, source, "utf8");
}

const locations = publicPages.map((page) => page.location);

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...locations.map((location) => `  <url><loc>${location.replaceAll("&", "&amp;")}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

fs.writeFileSync(path.join(root, "sitemap.xml"), xml, "utf8");
fs.writeFileSync(path.join(root, "robots.txt"), [
  "User-agent: *",
  "Allow: /",
  `Sitemap: ${new URL("sitemap.xml", origin).href}`,
  "",
].join("\n"), "utf8");

console.log(`Sitemap généré : ${locations.length} URL pour ${origin.origin}.`);
