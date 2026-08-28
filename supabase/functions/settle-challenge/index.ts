import { ApiError, assertAllowedOrigin, corsHeaders, handleError, json } from "../_shared/http.ts";
import { safeEqual, sha256 } from "../_shared/crypto.ts";
import { adminClient, authenticatedUser } from "../_shared/supabase.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  try {
    assertAllowedOrigin(request);
    const user = await authenticatedUser(request);
    const body = await request.json();
    const sessionId = String(body.session_id ?? "");
    const answer = String(body.answer ?? "").trim();
    if (!/^[0-9a-f-]{36}$/.test(sessionId) || answer.length > 40) {
      throw new ApiError(400, "invalid_submission");
    }

    const admin = adminClient();
    const { data: session, error: sessionError } = await admin
      .from("game_sessions")
      .select("id,user_id,status,started_at,expires_at,challenge_public,challenge_secret_hash")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new ApiError(404, "session_not_found");

    const elapsedMs = Date.now() - new Date(session.started_at).getTime();
    const minCompletionMs = Number(session.challenge_public?.min_completion_ms ?? 0);
    const submittedHash = await sha256(`${sessionId}:${answer}`);
    const isCorrect = safeEqual(submittedHash, session.challenge_secret_hash);
    const isInvalid = elapsedMs < minCompletionMs;

    const { data, error } = await admin.rpc("arcade_settle_session", {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_won: isCorrect && !isInvalid,
      p_invalid: isInvalid,
      p_client_result: {
        elapsed_ms: elapsedMs,
        submitted_at: new Date().toISOString(),
      },
    });
    if (error) throw error;
    return json(request, data);
  } catch (error) {
    return handleError(request, error);
  }
});
