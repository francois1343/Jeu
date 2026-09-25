"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const homePath = path.join(root, "index.html");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules"].includes(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    lt: "<",
    nbsp: " ",
    quot: '"',
    raquo: "»",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

function plainText(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function catalogueDescriptions() {
  const home = fs.readFileSync(homePath, "utf8");
  const descriptions = new Map();
  for (const match of home.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const article = match[0];
    const launch = article.match(/launchGame\(\s*['"]([^'"]+\.html)['"]/i);
    const description = article.match(/<p\s+class=["']game-description["']>([\s\S]*?)<\/p>/i);
    if (launch && description) {
      descriptions.set(launch[1].replaceAll("/", path.sep), plainText(description[1]));
    }
  }
  return descriptions;
}

const catalogue = catalogueDescriptions();
const fixedDescriptions = new Map([
  ["index.html", "Découvrez Francis Arcade, une collection gratuite de jeux arcade néon sur ordinateur et mobile : réflexion, réflexes, cartes, dés et défis."],
  ["404.html", "Cette page de Francis Arcade est introuvable. Revenez à l’accueil pour choisir un jeu."],
  ["offline.html", "Francis Arcade est momentanément hors connexion. Retrouvez les jeux déjà chargés ou réessayez lorsque le réseau revient."],
]);

function descriptionFor(relativePath, title, existing) {
  if (fixedDescriptions.has(relativePath)) return fixedDescriptions.get(relativePath);
  if (relativePath.startsWith(`legal${path.sep}`) && existing) return existing;
  const catalogPath = relativePath.replaceAll(path.sep, "/");
  const catalogueText = catalogue.get(catalogPath.replaceAll("/", path.sep));
  if (catalogueText) return `${catalogueText} Jouez gratuitement sur Francis Arcade.`;
  return `Jouez gratuitement à ${title} sur Francis Arcade, une expérience néon accessible sur ordinateur et mobile.`;
}

function allowArcadeBackend(source, relativePath) {
  if (!relativePath.startsWith(`games${path.sep}`)) return source;
  const required = [
    "https://nnqfomqgagfshujyfrtl.supabase.co",
    "wss://nnqfomqgagfshujyfrtl.supabase.co",
  ];
  return source.replace(/connect-src\s+([^;]+);/i, (directive, values) => {
    const tokens = values.trim().split(/\s+/);
    required.forEach((value) => {
      if (!tokens.includes(value)) tokens.push(value);
    });
    return `connect-src ${tokens.join(" ")};`;
  });
}

const pages = walk(root).filter((file) => file.endsWith(".html"));
for (const page of pages) {
  let source = fs.readFileSync(page, "utf8");
  const relativePath = path.relative(root, page);
  source = allowArcadeBackend(source, relativePath);
  const titleMatch = source.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) throw new Error(`Titre absent : ${relativePath}`);

  const title = plainText(titleMatch[1]);
  const oldDescription = source.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']\s*\/?>/i)?.[1];
  const description = descriptionFor(relativePath, title, oldDescription ? decodeEntities(oldDescription) : "");

  source = source
    .replace(/^[ \t]*<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->[ \t]*(?:\r?\n)?/im, "")
    .replace(/^[ \t]*<meta\s+name=["']description["'][^>]*>[ \t]*(?:\r?\n)?/gim, "");

  const robots = ["404.html", "offline.html"].includes(relativePath)
    ? '    <meta name="robots" content="noindex, follow" />\n'
    : "";
  const block = [
    "    <!-- SEO_META_START -->",
    `    <meta name="description" content="${attribute(description)}" />`,
    robots.trimEnd(),
    `    <meta property="og:title" content="${attribute(title)}" />`,
    `    <meta property="og:description" content="${attribute(description)}" />`,
    '    <meta property="og:type" content="website" />',
    '    <meta property="og:site_name" content="Francis Arcade" />',
    '    <meta property="og:locale" content="fr_BE" />',
    '    <meta name="twitter:card" content="summary" />',
    "    <!-- SEO_META_END -->",
  ].filter(Boolean).join("\n");

  source = source.replace(titleMatch[0], `${titleMatch[0]}\n${block}`);
  source = source.replace(/(<!-- SEO_META_END -->)\r?\n[ \t]*(?=<)/, "$1\n    ");
  fs.writeFileSync(page, source, "utf8");
}

console.log(`Métadonnées SEO actualisées : ${pages.length} pages.`);
