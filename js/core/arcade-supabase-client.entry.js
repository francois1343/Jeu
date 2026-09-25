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
