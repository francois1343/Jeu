import { ApiError, handleError, json } from "../_shared/http.ts";
import { hmacSha256, safeEqual } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  try {
    const secret = Deno.env.get("REWARDED_AD_WEBHOOK_SECRET");
    if (!secret) throw new Error("missing_environment_variable:REWARDED_AD_WEBHOOK_SECRET");

    const timestamp = request.headers.get("x-arcade-timestamp") ?? "";
    const signature = request.headers.get("x-arcade-signature") ?? "";
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      throw new ApiError(401, "expired_signature");
    }

    const rawBody = await request.text();
    const expected = await hmacSha256(secret, `${timestamp}.${rawBody}`);
    if (!safeEqual(signature.toLowerCase(), expected)) throw new ApiError(401, "invalid_signature");

    const payload = JSON.parse(rawBody);
    if (payload.completed !== true) throw new ApiError(400, "reward_not_completed");
    if (!/^[0-9a-f-]{36}$/i.test(String(payload.user_id ?? ""))) {
      throw new ApiError(400, "invalid_user_id");
    }
    if (!/^[A-Za-z0-9:_-]{6,160}$/.test(String(payload.reward_id ?? ""))) {
      throw new ApiError(400, "invalid_reward_id");
    }

    const admin = adminClient();
    const { data, error } = await admin.rpc("arcade_credit_rewarded_ad", {
      p_user_id: payload.user_id,
      p_provider: String(payload.provider ?? "unknown").slice(0, 40),
      p_provider_reward_id: payload.reward_id,
      p_placement: String(payload.placement ?? "home").slice(0, 80),
      p_metadata: { provider_payload_version: payload.version ?? 1 },
    });
    if (error) throw error;
    return json(request, data);
  } catch (error) {
    return handleError(request, error);
  }
});
