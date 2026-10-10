"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const migration = read("supabase", "migrations", "202610110002_arcade_match_service.sql");
const reconnectGuard = read("supabase", "migrations", "202610110003_arcade_match_reconnect_timeout.sql");
const browserClient = read("js", "core", "arcade-supabase-client.entry.js");
const serviceSource = read("js", "core", "arcade-match.js");
const bridge = read("js", "core", "arcade-game-bridge.js");

for (const table of ["matches", "match_players", "match_invites", "match_events"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
}

for (const mode of ["solo", "bot", "local", "invite", "matchmaking"]) {
  assert.match(migration, new RegExp(`'${mode}'`));
}

for (const rpc of [
  "arcade_match_create", "arcade_match_find", "arcade_match_create_invite",
  "arcade_match_accept_invite", "arcade_match_get", "arcade_match_heartbeat",
  "arcade_match_disconnect", "arcade_match_submit_turn", "arcade_match_report_result",
  "arcade_match_abandon",
]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, "i"));
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]{0,180}to authenticated`, "i"));
}

assert.match(migration, /grant execute on function public\.arcade_match_settle[\s\S]{0,160}to service_role/i);
assert.doesNotMatch(migration, /grant execute on function public\.arcade_match_settle[\s\S]{0,160}to authenticated/i);
assert.match(migration, /stale_match_version/i);
assert.match(migration, /not_your_turn/i);
assert.match(migration, /public\.digest\(convert_to\(invite_token, 'UTF8'\), 'sha256'\)/i);
assert.match(migration, /status', 'awaiting_server_validation'/i);
assert.match(migration, /alter publication supabase_realtime add table public\.matches/i);
assert.match(reconnectGuard, /player\.last_seen_at\s*<=\s*clock_timestamp\(\)/i);
assert.match(reconnectGuard, /'reason', 'reconnect_timeout'/i);
assert.match(reconnectGuard, /grant execute on function public\.arcade_match_heartbeat\(uuid\) to authenticated/i);
assert.match(browserClient, /matches:\s*Object\.freeze/);
assert.match(browserClient, /arcade_match_submit_turn/);
assert.match(browserClient, /subscribeArcadeMatch/);
assert.match(bridge, /loadSharedScript\("arcade-match\.js"\)/);

const calls = [];
let remote = {
  id: "match-1",
  game_key: "test-game",
  mode: "solo",
  status: "active",
  version: 1,
  current_player_slot: 1,
  players: [{ slot: 1, kind: "human", metadata: {} }],
  options: {},
  result: null,
};
const matchesApi = {
  async create(gameKey, mode, options) {
    calls.push(["create", gameKey, mode, options]);
    remote = { ...remote, game_key: gameKey, mode, options };
    return remote;
  },
  async submitTurn(matchId, version, action, slot) {
    calls.push(["turn", matchId, version, action, slot]);
    remote = { ...remote, version: version + 1, current_player_slot: 1 };
    return remote;
  },
  async reportResult(matchId, version, result) {
    calls.push(["result", matchId, version, result]);
    return { accepted: true, settled: false, status: "awaiting_server_validation" };
  },
  async abandon(matchId) {
    calls.push(["abandon", matchId]);
    remote = { ...remote, status: "abandoned", result: { reason: "abandonment" } };
    return remote;
  },
  async get() { return remote; },
  async heartbeat() { return remote; },
  async disconnect() { return remote; },
  subscribe() { return { unsubscribe() {} }; },
};

const window = {
  ArcadeSupabase: { matches: matchesApi },
  location: { href: "https://example.test/games/test/index.html" },
  navigator: { onLine: true },
  document: { hidden: false, addEventListener() {} },
  addEventListener() {},
  dispatchEvent() {},
  setInterval() { return 1; },
  clearInterval() {},
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  URL,
};
window.window = window;
vm.runInNewContext(serviceSource, window);

(async () => {
  assert.deepEqual(Object.values(window.ArcadeMatch.MODES), ["solo", "bot", "local", "invite", "matchmaking"]);
  await window.ArcadeMatch.create({ gameKey: "test-game", mode: "solo", options: { level: 2 } });
  await window.ArcadeMatch.submitTurn({ type: "move", value: 4 });
  const acknowledgement = await window.ArcadeMatch.reportResult({ winner_slot: 1 });
  assert.equal(acknowledgement.settled, false, "Un resultat navigateur ne doit jamais terminer le match");
  await window.ArcadeMatch.abandon();
  assert.deepEqual(calls.map(([name]) => name), ["create", "turn", "result", "abandon"]);
  assert.equal(calls[1][2], 1, "Le tour doit transmettre la version attendue");
  assert.equal(calls[2][2], 2, "Le resultat propose doit transmettre la version courante");
  window.ArcadeMatch.destroy();
  console.log("Service ArcadeMatch partage et contrat serveur verifies : OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
