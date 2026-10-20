import { ApiError, assertAllowedOrigin, corsHeaders, handleError, json } from "../_shared/http.ts";
import { adminClient, authenticatedUser } from "../_shared/supabase.ts";

function adminEmails(): Set<string> {
  return new Set(
    (Deno.env.get("ARCADE_ADMIN_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  try {
    assertAllowedOrigin(request);
    const user = await authenticatedUser(request);
    if (!user.email || !adminEmails().has(user.email.toLowerCase())) {
      throw new ApiError(403, "admin_required");
    }

    const body = await request.json().catch(() => ({}));
    if (body?.scope === "access") return json(request, { authorized: true });

    const days = Math.max(7, Math.min(Number(body?.days) || 30, 90));
    const admin = adminClient();
    const { data, error } = await admin.rpc("arcade_admin_dashboard", { p_days: days });
    if (error) throw error;
    return json(request, data);
  } catch (error) {
    return handleError(request, error);
  }
});
