"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "202609240001_connect4_live.sql"), "utf8");
const html = fs.readFileSync(path.join(root, "games", "puissance4", "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "games", "puissance4", "puissance4.js"), "utf8");
const live = fs.readFileSync(path.join(root, "games", "puissance4", "puissance4-live.js"), "utf8");
const client = fs.readFileSync(path.join(root, "js", "core", "arcade-supabase-client.entry.js"), "utf8");

for (const table of ["connect4_ratings", "connect4_rooms", "connect4_matches"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
}

for (const rpc of ["connect4_create_room", "connect4_join_room", "connect4_get_room", "connect4_play", "connect4_resign", "connect4_get_leaderboard"]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, "i"));
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`), `${rpc} doit être réservé aux comptes authentifiés`);
}

assert.match(migration, /connect4_rooms_read_participant/i);
assert.match(migration, /revoke all on public\.connect4_ratings, public\.connect4_rooms, public\.connect4_matches/i);
assert.match(migration, /alter publication supabase_realtime add table public\.connect4_rooms/i);
assert.match(migration, /make_interval\(secs => room\.turn_seconds\)/i);
assert.match(migration, /32\.0 \* \(red_score - red_expected\)/i);
assert.match(migration, /room\.current_player = 1 then room\.yellow_user_id/i);

assert.match(html, /data-opp="live"/);
assert.match(html, /id="live-room-code"/);
assert.match(html, /id="live-turn-seconds"/);
assert.match(html, /id="live-leaderboard"/);
assert.match(html, /id="live-reconnect"/);
assert.match(html, /wss:\/\/nnqfomqgagfshujyfrtl\.supabase\.co/);
assert.match(html, /arcade-supabase-client\.min\.js/);
assert.match(html, /puissance4-live\.js/);

assert.match(game, /window\.Puissance4Live\?\.playColumn/);
assert.match(game, /window\.Puissance4Game = Object\.freeze/);
assert.match(live, /api\.subscribeRoom/);
assert.match(live, /searchParams\.set\("room", code\)/);
assert.match(live, /api\.resign/);
assert.match(live, /api\.getLeaderboard/);
assert.match(live, /addEventListener\("online"/);
assert.match(live, /addEventListener\("visibilitychange"/);
assert.match(live, /setInterval[\s\S]*syncRoom/);
assert.match(client, /client\.rpc\(functionName, parameters\)/);
assert.match(client, /postgres_changes/);
assert.doesNotMatch(client, /from\(["']connect4_rooms["']\)\s*\.(?:insert|update|upsert|delete)/i);
assert.doesNotMatch(live, /from\(["']connect4_/i);

console.log("Socle Puissance 4 Live autoritaire vérifié : OK");
