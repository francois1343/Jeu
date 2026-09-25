"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const migration = read("supabase", "migrations", "202608290001_arcade_economy.sql");
const paidSessions = read("supabase", "migrations", "202609250002_paid_game_sessions.sql");
const config = read("js", "core", "arcade-config.js");
const gitignore = read(".gitignore");
const sharedClient = read("supabase", "functions", "_shared", "supabase.ts");
const sharedHttp = read("supabase", "functions", "_shared", "http.ts");
const browserClient = read("js", "core", "arcade-supabase-client.entry.js");
const serverPlatform = read("js", "core", "arcade-platform-supabase.js");
const gameBridge = read("js", "core", "arcade-game-bridge.js");
const homeScript = read("js", "home.js");
const home = read("index.html");

function gamePages(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return gamePages(fullPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [fullPath] : [];
  });
}

for (const table of [
  "profiles",
  "wallet_accounts",
  "wallet_transactions",
  "game_catalog",
  "game_sessions",
  "reward_claims",
]) {
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    `RLS absente sur ${table}`,
  );
}

assert.match(migration, /wallet_transactions_immutable/i, "Le journal des Coins doit etre immuable");
assert.match(migration, /unique\s*\(user_id,\s*idempotency_key\)/i, "Les operations doivent etre idempotentes");
assert.match(migration, /revoke all on public\.wallet_accounts[\s\S]*from anon, authenticated/i);
assert.match(migration, /grant execute on function public\.arcade_start_session[\s\S]*to service_role/i);
assert.match(migration, /grant execute on function public\.arcade_settle_session[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /grant execute on function public\.arcade_(?:start|settle)[\s\S]{0,300}to (?:anon|authenticated)/i);
assert.match(paidSessions, /default_play_cost_units\s*=\s*100/i);
assert.match(paidSessions, /default_win_payout_units\s*=\s*200/i);
assert.match(paidSessions, /auth\.uid\(\)/i);
assert.match(paidSessions, /potential_payout_units/i);
assert.match(paidSessions, /unique|idempotency_key/i);
assert.match(paidSessions, /grant execute on function public\.arcade_start_client_game\(text, text\) to authenticated/i);
assert.match(paidSessions, /grant execute on function public\.arcade_settle_client_game\(uuid, text, jsonb\) to authenticated/i);
assert.doesNotMatch(paidSessions, /p_(?:cost|payout|amount)_units/i, "Le navigateur ne doit jamais choisir un montant de portefeuille");

assert.match(sharedClient, /authenticatedUser\(request/i, "Les fonctions doivent verifier l'utilisateur");
assert.match(sharedClient, /SUPABASE_SECRET_KEYS/, "Les cles secretes Supabase actuelles doivent etre prises en charge");
assert.match(sharedClient, /SUPABASE_PUBLISHABLE_KEYS/, "Les cles publiques Supabase actuelles doivent etre prises en charge");
assert.match(sharedHttp, /assertAllowedOrigin/, "Les origines doivent etre controlees");
assert.match(sharedHttp, /"Vary": "Origin"/, "Les reponses CORS doivent varier selon l'origine");

assert.match(gitignore, /supabase\/functions\/\.env/, "Les secrets locaux des fonctions doivent etre ignores");
assert.match(config, /mode:\s*arcadeLocalQaMode\s*\?\s*"local-test"\s*:\s*"supabase"/, "Supabase doit etre le mode normal");
assert.match(config, /\["127\.0\.0\.1",\s*"localhost"\]/, "Le mode QA local doit rester limite a la machine locale");
assert.match(config, /supabaseUrl:\s*"https:\/\/[a-z]+\.supabase\.co"/, "L'URL publique Supabase doit etre configuree");
assert.match(config, /supabasePublishableKey:\s*"sb_publishable_[A-Za-z0-9_-]+"/, "La cle publishable doit etre configuree");
assert.doesNotMatch(config, /sb_secret_[A-Za-z0-9_-]+/, "Une cle secrete Supabase est exposee dans le frontend");
assert.doesNotMatch(config, /service_role\s*[:=]\s*["'][^"']+/i, "Une cle service_role est exposee dans le frontend");

assert.match(browserClient, /createClient\(url, publishableKey/);
assert.match(browserClient, /persistSession:\s*true/);
assert.match(browserClient, /signInWithPassword/);
assert.match(browserClient, /resetPasswordForEmail/);
assert.match(browserClient, /from\("wallet_accounts"\)\.select/);
assert.doesNotMatch(browserClient, /from\("wallet_accounts"\)\.(?:insert|update|upsert|delete)/, "Le navigateur ne doit jamais ecrire le portefeuille");
assert.doesNotMatch(browserClient, /from\("wallet_transactions"\)\.(?:insert|update|upsert|delete)/, "Le navigateur ne doit jamais ecrire les transactions");
assert.match(serverPlatform, /arcadeServer/);
assert.match(browserClient, /arcade_start_client_game/);
assert.match(browserClient, /arcade_settle_client_game/);
assert.match(gameBridge, /serverApi\.startGame/);
assert.match(gameBridge, /serverApi\.settleGame/);
assert.match(homeScript, /ArcadeSupabase\?\.startGame\("pile-face"/);
assert.match(homeScript, /ArcadeSupabase\.settleGame/);
assert.match(serverPlatform, /startChallenge/);
assert.match(serverPlatform, /settleChallenge/);
assert.match(home, /vendor\/supabase\/arcade-supabase-client\.min\.js/);
assert.match(home, /js\/core\/arcade-platform-supabase\.js/);
assert.match(home, /name="email"/);
assert.match(home, /name="password"/);
assert.match(home, /id="authConsent"/);
assert.match(home, /https:\/\/nnqfomqgagfshujyfrtl\.supabase\.co/);
assert(fs.existsSync(path.join(root, "vendor", "supabase", "arcade-supabase-client.min.js")), "Bundle Supabase local absent");
assert(fs.existsSync(path.join(root, "vendor", "supabase", "LICENSE")), "Licence Supabase absente");
for (const page of gamePages(path.join(root, "games"))) {
  const source = fs.readFileSync(page, "utf8");
  assert.match(source, /connect-src[^;]*https:\/\/nnqfomqgagfshujyfrtl\.supabase\.co[^;]*wss:\/\/nnqfomqgagfshujyfrtl\.supabase\.co/i, `Connexion Supabase interdite par la CSP : ${path.relative(root, page)}`);
}

for (const functionName of ["start-challenge", "settle-challenge"]) {
  const source = read("supabase", "functions", functionName, "index.ts");
  assert.match(source, /assertAllowedOrigin\(request\)/, `${functionName} doit refuser les origines inconnues`);
  assert.match(source, /authenticatedUser\(request\)/, `${functionName} doit exiger une session Auth`);
}

console.log("Socle server-first Supabase et anti-fuite de secrets : OK");
