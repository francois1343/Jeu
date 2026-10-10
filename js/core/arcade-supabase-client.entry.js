import { createClient } from "@supabase/supabase-js";

(function installArcadeSupabase(global) {
  "use strict";

  const config = global.ARCADE_CONFIG || {};
  const url = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.supabasePublishableKey || "");

  if (!url || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    global.ArcadeSupabase = null;
    return;
  }

  const client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "implicit",
      storageKey: `arcade.auth.${config.supabaseProjectRef || "default"}`,
    },
    global: {
      headers: { "x-application-name": "francis-arcade" },
    },
  });
  const pendingSettlementsKey = `arcade.pending-settlements.${config.supabaseProjectRef || "default"}`;

  function readPendingSettlements() {
    try {
      const value = JSON.parse(global.localStorage?.getItem(pendingSettlementsKey) || "[]");
      return Array.isArray(value) ? value.filter((item) => item?.sessionId && ["won", "lost", "abandoned"].includes(item?.outcome)).slice(-20) : [];
    } catch (_) {
      return [];
    }
  }

  function writePendingSettlements(items) {
    try {
      if (items.length) global.localStorage?.setItem(pendingSettlementsKey, JSON.stringify(items));
      else global.localStorage?.removeItem(pendingSettlementsKey);
    } catch (_) {
      // Le règlement courant continue même si le stockage privé est indisponible.
    }
  }

  function rememberSettlement(sessionId, outcome, metadata) {
    const items = readPendingSettlements();
    const existing = items.find((item) => item.sessionId === sessionId);
    if (existing) return existing;
    const item = {
      sessionId: String(sessionId),
      outcome: String(outcome),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      queuedAt: new Date().toISOString(),
    };
    writePendingSettlements([...items, item].slice(-20));
    return item;
  }

  function forgetSettlement(sessionId) {
    writePendingSettlements(readPendingSettlements().filter((item) => item.sessionId !== sessionId));
  }

  function redirectUrl() {
    const target = new URL("index.html", global.location.href);
    target.search = "";
    target.hash = "";
    return target.href;
  }

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  async function getSession() {
    const data = unwrap(await client.auth.getSession());
    return data.session || null;
  }

  async function getAccount() {
    const session = await getSession();
    if (!session?.user) return null;
    await flushPendingSettlements();

    const [profileResult, walletResult, transactionResult, economyResult] = await Promise.all([
      client.from("profiles").select("user_id,display_name,created_at,updated_at").eq("user_id", session.user.id).single(),
      client.from("wallet_accounts").select("user_id,balance_units,lifetime_earned_units,lifetime_spent_units,updated_at").eq("user_id", session.user.id).single(),
      client.from("wallet_transactions").select("id,transaction_type,amount_units,balance_after_units,reference_type,reference_id,metadata,created_at").order("created_at", { ascending: false }).limit(30),
      client.from("economy_config").select("version,enabled,unit_name,units_per_coin,starter_grant_units,default_play_cost_units,default_win_payout_units").single(),
    ]);

    return {
      session,
      user: session.user,
      profile: unwrap(profileResult),
      wallet: unwrap(walletResult),
      transactions: unwrap(transactionResult) || [],
      economy: unwrap(economyResult),
    };
  }

  async function signUp({ email, password, pseudo }) {
    return unwrap(await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: pseudo },
        emailRedirectTo: redirectUrl(),
      },
    }));
  }

  async function signIn({ email, password }) {
    return unwrap(await client.auth.signInWithPassword({ email, password }));
  }

  async function signOut() {
    return unwrap(await client.auth.signOut({ scope: "local" }));
  }

  async function requestPasswordReset(email) {
    return unwrap(await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }));
  }

  async function updatePassword(password) {
    return unwrap(await client.auth.updateUser({ password }));
  }

  async function invoke(functionName, body) {
    return unwrap(await client.functions.invoke(functionName, { body }));
  }

  async function connect4Rpc(functionName, parameters = {}) {
    return unwrap(await client.rpc(functionName, parameters));
  }

  async function arcadeRpc(functionName, parameters = {}) {
    return unwrap(await client.rpc(functionName, parameters));
  }

  async function matchRpc(functionName, parameters = {}) {
    return unwrap(await client.rpc(functionName, parameters));
  }

  function settleGameRequest(item) {
    return arcadeRpc("arcade_settle_client_game", {
      p_session_id: item.sessionId,
      p_outcome: item.outcome,
      p_client_result: item.metadata,
    });
  }

  async function flushPendingSettlements() {
    const items = readPendingSettlements();
    for (const item of items) {
      try {
        await settleGameRequest(item);
        forgetSettlement(item.sessionId);
      } catch (_) {
        // Conservé localement pour la prochaine reconnexion ou le prochain retour à l'accueil.
      }
    }
  }

  function subscribeConnect4Room(roomId, onChange, onStatus) {
    const channel = client
      .channel(`connect4-room:${roomId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "connect4_rooms",
        filter: `id=eq.${roomId}`,
      }, onChange)
      .subscribe((status, error) => onStatus?.(status, error));

    return Object.freeze({
      unsubscribe() {
        return client.removeChannel(channel);
      },
    });
  }

  function subscribeArcadeMatch(matchId, onChange, onStatus) {
    const id = String(matchId || "");
    const channel = client
      .channel(`arcade-match:${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "matches",
        filter: `id=eq.${id}`,
      }, (payload) => onChange?.("match", payload))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "match_players",
        filter: `match_id=eq.${id}`,
      }, (payload) => onChange?.("player", payload))
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "match_events",
        filter: `match_id=eq.${id}`,
      }, (payload) => onChange?.("event", payload))
      .subscribe((status, error) => onStatus?.(status, error));

    return Object.freeze({
      unsubscribe() {
        return client.removeChannel(channel);
      },
    });
  }

  global.ArcadeSupabase = Object.freeze({
    getSession,
    getAccount,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword,
    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange(callback).data.subscription;
    },
    startChallenge(gameKey, idempotencyKey) {
      return invoke("start-challenge", {
        game_key: gameKey,
        idempotency_key: idempotencyKey,
      });
    },
    settleChallenge(sessionId, answer) {
      return invoke("settle-challenge", {
        session_id: sessionId,
        answer: String(answer),
      });
    },
    startGame(gameKey, idempotencyKey) {
      return arcadeRpc("arcade_start_client_game", {
        p_game_key: String(gameKey || ""),
        p_idempotency_key: String(idempotencyKey || ""),
      });
    },
    async getGameSession(sessionId) {
      await flushPendingSettlements();
      return arcadeRpc("arcade_get_client_game", { p_session_id: sessionId });
    },
    async settleGame(sessionId, outcome, metadata = {}) {
      const item = rememberSettlement(sessionId, String(outcome || ""), metadata);
      const result = await settleGameRequest(item);
      forgetSettlement(item.sessionId);
      return result;
    },
    flushPendingSettlements,
    matches: Object.freeze({
      create(gameKey, mode, options = {}) {
        return matchRpc("arcade_match_create", {
          p_game_key: String(gameKey || ""),
          p_mode: String(mode || ""),
          p_options: options,
        });
      },
      findOpponent(gameKey, options = {}) {
        return matchRpc("arcade_match_find", {
          p_game_key: String(gameKey || ""),
          p_options: options,
        });
      },
      createInvite(matchId, inviteeUserId = null, ttlMinutes = 30) {
        return matchRpc("arcade_match_create_invite", {
          p_match_id: matchId,
          p_invitee_user_id: inviteeUserId,
          p_ttl_minutes: ttlMinutes,
        });
      },
      acceptInvite(token) {
        return matchRpc("arcade_match_accept_invite", { p_token: String(token || "") });
      },
      get(matchId) {
        return matchRpc("arcade_match_get", { p_match_id: matchId });
      },
      heartbeat(matchId) {
        return matchRpc("arcade_match_heartbeat", { p_match_id: matchId });
      },
      disconnect(matchId) {
        return matchRpc("arcade_match_disconnect", { p_match_id: matchId });
      },
      submitTurn(matchId, expectedVersion, action, actorSlot = null) {
        return matchRpc("arcade_match_submit_turn", {
          p_match_id: matchId,
          p_expected_version: expectedVersion,
          p_action: action,
          p_actor_slot: actorSlot,
        });
      },
      reportResult(matchId, expectedVersion, result) {
        return matchRpc("arcade_match_report_result", {
          p_match_id: matchId,
          p_expected_version: expectedVersion,
          p_result: result,
        });
      },
      abandon(matchId) {
        return matchRpc("arcade_match_abandon", { p_match_id: matchId });
      },
      subscribe: subscribeArcadeMatch,
    }),
    connect4: Object.freeze({
      createRoom(turnSeconds = 30) {
        return connect4Rpc("connect4_create_room", { p_turn_seconds: turnSeconds });
      },
      joinRoom(code) {
        return connect4Rpc("connect4_join_room", { p_code: String(code || "") });
      },
      getRoom(code) {
        return connect4Rpc("connect4_get_room", { p_code: String(code || "") });
      },
      play(code, column) {
        return connect4Rpc("connect4_play", { p_code: String(code || ""), p_column: column });
      },
      resign(code) {
        return connect4Rpc("connect4_resign", { p_code: String(code || "") });
      },
      getLeaderboard() {
        return connect4Rpc("connect4_get_leaderboard");
      },
      subscribeRoom: subscribeConnect4Room,
    }),
  });
})(window);
