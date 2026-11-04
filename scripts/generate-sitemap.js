"use strict";

const fs = require("node:fs");
const path = require("node:path");

function siteBase(rawOrigin) {
  if (!rawOrigin) throw new Error("Définissez ARCADE_SITE_URL, par exemple https://francois1343.github.io/Jeu/");
  const base = new URL(rawOrigin);
  if (base.protocol !== "https:" || base.search || base.hash || base.username || base.password) {
    throw new Error("ARCADE_SITE_URL doit être une URL HTTPS, éventuellement avec un sous-chemin, sans identifiant, requête ni fragment.");
  }
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return base;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "dist", "tests", "docs", "android", "coverage", "vendor"].includes(entry.name) || entry.isSymbolicLink()) return [];
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function generate(root, rawOrigin) {
const origin = siteBase(rawOrigin);
const excluded = new Set(["404.html", "offline.html"]);
const publicPages = walk(root)
  .filter((file) => file.endsWith(".html"))
  .map((file) => ({ file, relative: path.relative(root, file).replaceAll(path.sep, "/") }))
  .filter((page) => !excluded.has(page.relative))
  .map((page) => ({ ...page, source: fs.readFileSync(page.file, "utf8") }))
  .filter((page) => !page.relative.startsWith("admin/") && ![...page.source.matchAll(/<meta\b[^>]*\bname\s*=\s*["'](?:robots|googlebot)["'][^>]*>/ig)].some(match => /\bnoindex\b/i.test(match[0])))
  .sort((left, right) => left.relative.localeCompare(right.relative, "fr"))
  .map((page) => ({
    ...page,
    location: page.relative === "index.html" ? origin.href : new URL(page.relative, origin).href,
  }));

const socialImage = new URL("assets/icons/arcade-icon-v2-512.png", origin).href;
for (const page of publicPages) {
  let source = page.source;
  if (!/<\/head\s*>/i.test(source)) throw new Error(`Balise head manquante : ${page.relative}`);
  source = source.replace(/\s*<!-- SEO_DEPLOY_START -->[\s\S]*?<!-- SEO_DEPLOY_END -->\s*/g, "\n");
  source = source.replace(/\s*<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>\s*/gi, "\n");
  const deployMetadata = [
    "    <!-- SEO_DEPLOY_START -->",
    `    <link rel="canonical" href="${page.location}" />`,
    `    <meta property="og:url" content="${page.location}" />`,
    `    <meta property="og:image" content="${socialImage}" />`,
    `    <meta name="twitter:image" content="${socialImage}" />`,
    "    <!-- SEO_DEPLOY_END -->",
  ].join("\n");
  page.output = source.replace(/\s*<\/head\s*>/i, `\n${deployMetadata}\n  </head>`);
}
for (const page of publicPages) fs.writeFileSync(page.file, page.output, "utf8");

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

return { count: locations.length, base: origin.href, locations };
}

if (require.main === module) {
  const result = generate(path.resolve(process.argv[2] || path.join(__dirname, "..", "dist")), process.env.ARCADE_SITE_URL);
  console.log(`Sitemap généré : ${result.count} URL pour ${result.base}.`);
}
module.exports = { generate, siteBase };
