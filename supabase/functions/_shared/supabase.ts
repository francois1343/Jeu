import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";

function requiredEnv(primary: string, fallback?: string): string {
  const value = Deno.env.get(primary) ?? (fallback ? Deno.env.get(fallback) : undefined);
  if (!value) throw new Error(`missing_environment_variable:${primary}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function authenticatedUser(request: Request): Promise<User> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "authentication_required");

  const client = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "authentication_required");
  return data.user;
}
