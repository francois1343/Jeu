"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), "utf8");

for (const page of ["mentions-legales.html", "confidentialite.html", "cgu.html"]) {
  const source = read("legal", page);
  assert.match(source, /<html lang="fr">/i, `${page} doit déclarer sa langue`);
  assert.equal((source.match(/<h1\b/gi) || []).length, 1, `${page} doit avoir un h1 unique`);
  assert.match(source, /Content-Security-Policy/i, `${page} doit activer la CSP`);
  assert.match(source, /arcade-fonts\.css/i, `${page} doit utiliser les polices locales`);
}

const home = read("index.html");
for (const target of ["mentions-legales", "confidentialite", "cgu"]) {
  assert.match(home, new RegExp(`legal/${target}\\.html`), `Lien légal absent : ${target}`);
}
assert.match(home, /name="privacyConsent"[^>]*required/i, "Le consentement EmailJS doit être explicite et obligatoire");

assert.match(home, /css\/shared\/arcade-fonts\.css/i, "L'accueil doit charger les polices locales");

const fontStyles = read("css", "shared", "arcade-fonts.css");
for (const font of [
  "orbitron-latin.woff2",
  "rajdhani-latin-400.woff2",
  "rajdhani-latin-500.woff2",
  "rajdhani-latin-600.woff2",
  "rajdhani-latin-700.woff2",
]) {
  assert.match(fontStyles, new RegExp(font.replace(".", "\\.")), `Police non declaree : ${font}`);
  assert(fs.existsSync(path.join(root, "assets", "fonts", font)), `Fichier de police absent : ${font}`);
}
for (const license of ["OFL-Orbitron.txt", "OFL-Rajdhani.txt"]) {
  assert(fs.existsSync(path.join(root, "assets", "fonts", license)), `Licence de police absente : ${license}`);
}

const feedback = read("js", "core", "arcade-feedback.js");
assert.doesNotMatch(feedback, /page_url|user_agent/, "URL et navigateur ne doivent plus faire partie du message EmailJS");
assert.match(feedback, /privacy_consent_required/);
assert.match(feedback, /credentials:\s*"omit"/);
assert.match(feedback, /referrerPolicy:\s*"no-referrer"/);
assert.match(feedback, /RETENTION_DAYS/);

function collect(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules"].includes(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(fullPath, extension);
    return entry.isFile() && fullPath.endsWith(extension) ? [fullPath] : [];
  });
}

for (const page of collect(root, ".html")) {
  const source = fs.readFileSync(page, "utf8");
  const relative = path.relative(root, page);
  assert.match(source, /Content-Security-Policy/i, `CSP absente : ${path.relative(root, page)}`);
  assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/i, `Police distante : ${path.relative(root, page)}`);
  assert.doesNotMatch(source, /(?:cdnjs\.cloudflare|cdn\.jsdelivr)\.com/i, `CDN distant : ${path.relative(root, page)}`);
  assert.match(source, /arcade-fonts\.css/i, `Polices locales absentes : ${path.relative(root, page)}`);
  if (relative === "index.html") {
    assert.match(source, /connect-src[^;]*https:\/\/api\.emailjs\.com/, "EmailJS doit etre autorise uniquement sur l'accueil");
    assert.match(source, /connect-src[^;]*https:\/\/nnqfomqgagfshujyfrtl\.supabase\.co/, "Supabase doit etre autorise uniquement sur l'accueil");
  } else {
    assert.doesNotMatch(source, /connect-src[^;]*api\.emailjs\.com/, `EmailJS autorisé inutilement : ${relative}`);
  }
}

for (const stylesheet of collect(root, ".css")) {
  assert.doesNotMatch(
    fs.readFileSync(stylesheet, "utf8"),
    /fonts\.(?:googleapis|gstatic)\.com/i,
    `Police distante : ${path.relative(root, stylesheet)}`,
  );
}

const connectFour = read("games", "puissance4", "index.html");
assert.match(connectFour, /\.\.\/\.\.\/vendor\/three\/three\.min\.js/);
assert.match(connectFour, /\.\.\/\.\.\/vendor\/three\/OrbitControls\.js/);
for (const asset of ["three.min.js", "OrbitControls.js", "LICENSE"]) {
  assert(fs.existsSync(path.join(root, "vendor", "three", asset)), `Dépendance Three.js absente : ${asset}`);
}

const worker = read("service-worker.js");
for (const asset of [
  "mentions-legales.html",
  "confidentialite.html",
  "cgu.html",
  "legal.css",
  "arcade-fonts.css",
  "orbitron-latin.woff2",
  "rajdhani-latin-400.woff2",
  "rajdhani-latin-500.woff2",
  "rajdhani-latin-600.woff2",
  "rajdhani-latin-700.woff2",
]) {
  assert.match(worker, new RegExp(asset.replace(".", "\\.")), `${asset} doit être disponible hors ligne`);
}

console.log("Pages légales, consentement et dépendances locales : OK");
