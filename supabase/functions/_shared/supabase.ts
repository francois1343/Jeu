import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";

function requiredEnv(primary: string, fallback?: string): string {
  const value = Deno.env.get(primary) ?? (fallback ? Deno.env.get(fallback) : undefined);
  if (!value) throw new Error(`missing_environment_variable:${primary}`);
  return value;
}

function firstKeyFromDictionary(name: string): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const dictionary = JSON.parse(raw) as Record<string, unknown>;
    return Object.values(dictionary).find((value): value is string => (
      typeof value === "string" && value.length > 0
    ));
  } catch {
    throw new Error(`invalid_environment_variable:${name}`);
  }
}

function secretKey(): string {
  return Deno.env.get("SUPABASE_SECRET_KEY")
    ?? firstKeyFromDictionary("SUPABASE_SECRET_KEYS")
    ?? requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function publishableKey(): string {
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? firstKeyFromDictionary("SUPABASE_PUBLISHABLE_KEYS")
    ?? requiredEnv("SUPABASE_ANON_KEY");
}

export function adminClient(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    secretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function authenticatedUser(request: Request): Promise<User> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "authentication_required");

  const client = createClient(
    requiredEnv("SUPABASE_URL"),
    publishableKey(),
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
