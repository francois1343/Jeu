"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const migration = read("supabase", "migrations", "202610200001_admin_dashboard.sql");
const edgeFunction = read("supabase", "functions", "admin-dashboard", "index.ts");
const browserClient = read("js", "core", "arcade-supabase-client.entry.js");
const serverPlatform = read("js", "core", "arcade-platform-supabase.js");
const loader = read("js", "arcade-admin-loader.js");
const page = read("admin", "index.html");
const styles = read("admin", "admin.css");
const controlStyles = read("admin", "admin-controls.css");
const script = read("admin", "admin.js");
const worker = read("service-worker.js");

assert.match(migration, /create or replace function public\.arcade_admin_dashboard/i);
assert.match(migration, /security definer/i);
assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /users\.email/i, "Le rapport ne doit pas renvoyer les emails des joueurs");

assert.match(edgeFunction, /assertAllowedOrigin\(request\)/);
assert.match(edgeFunction, /authenticatedUser\(request\)/);
assert.match(edgeFunction, /ARCADE_ADMIN_EMAILS/);
assert.match(edgeFunction, /adminClient\(\)/);
assert.match(edgeFunction, /admin_required/);
assert.doesNotMatch(edgeFunction, /@[a-z0-9.-]+\.[a-z]{2,}/i, "Aucun email administrateur ne doit être commis");

assert.match(browserClient, /checkAdminAccess\(\)/);
assert.match(browserClient, /getAdminDashboard\(days\s*=\s*30\)/);
assert.match(serverPlatform, /refreshAdminAccess/);
assert.match(loader, /admin\/index\.html/);

assert.match(page, /id="dashboard"/);
assert.match(page, /id="playerRows"/);
assert.match(page, /id="signupChart"/);
assert.match(page, /id="auditFindings"/);
assert.match(page, /id="roadmap"/);
assert.match(page, /name="robots" content="noindex,nofollow"/);
assert.doesNotMatch(page, /<(?:script|link)\b[^>]*(?:src|href)="https?:\/\//i);
assert.match(styles, /@media\s*\(max-width:\s*720px\)/i);
assert.match(styles, /\.metric-grid/);
assert.match(styles, /\.line-chart/);
assert.match(controlStyles, /min-height:\s*44px/);
assert.match(script, /getAdminDashboard/);
assert.match(script, /ux-audit\.json/);
assert.match(worker, /admin\/index\.html/);
assert.match(worker, /data\/ux-audit\.json/);

const audit = JSON.parse(read("data", "ux-audit.json"));
assert(audit.summary.pages_audited >= 40, "L'audit doit couvrir tout le catalogue");
assert.equal(audit.results.length, (audit.summary.pages_audited + 2) * (audit.viewports?.length || 2), "Chaque page doit être testée sur tous les viewports annoncés");
assert(audit.findings.length >= 5);
assert.equal(audit.roadmap.length, 4);

console.log("Centre de pilotage sécurisé et audit UX mesurable : OK");
