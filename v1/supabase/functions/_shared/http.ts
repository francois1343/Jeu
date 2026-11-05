const DEFAULT_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "http://127.0.0.1:4173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  const selected = allowed.includes(origin) ? origin : allowed[0];
  return { ...DEFAULT_HEADERS, "Access-Control-Allow-Origin": selected };
}

export function assertAllowedOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins().includes(origin)) {
    throw new ApiError(403, "origin_not_allowed");
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

export function handleError(request: Request, error: unknown): Response {
  console.error(error);
  if (error instanceof ApiError) {
    return json(request, { error: error.code }, error.status);
  }

  const message = error instanceof Error ? error.message : "internal_error";
  const knownClientErrors = [
    "economy_disabled",
    "game_not_economy_enabled",
    "insufficient_balance",
    "start_rate_limit",
    "daily_start_limit",
    "session_not_found",
    "rewarded_ad_daily_limit",
    "wallet_not_found",
  ];
  const code = knownClientErrors.find((known) => message.includes(known));
  return json(request, { error: code ?? "internal_error" }, code ? 409 : 500);
}
