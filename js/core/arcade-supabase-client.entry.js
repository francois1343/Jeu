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
  });
})(window);
