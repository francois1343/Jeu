import { ApiError, assertAllowedOrigin, corsHeaders, handleError, json } from "../_shared/http.ts";
import { sha256 } from "../_shared/crypto.ts";
import { adminClient, authenticatedUser } from "../_shared/supabase.ts";

type Challenge = {
  publicData: Record<string, unknown>;
  answer: string;
};

function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const maxUint = 0xffffffff;
  const limit = maxUint - (maxUint % range);
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return min + (value[0] % range);
}

function createMathChallenge(): Challenge {
  const operation = randomInt(0, 2);
  let left = randomInt(6, 45);
  let right = randomInt(2, 20);
  let symbol = "+";
  let answer = left + right;

  if (operation === 1) {
    if (right > left) [left, right] = [right, left];
    symbol = "−";
    answer = left - right;
  } else if (operation === 2) {
    left = randomInt(3, 12);
    right = randomInt(3, 12);
    symbol = "×";
    answer = left * right;
  }

  return {
    publicData: {
      kind: "math",
      title: "Calcul éclair",
      prompt: `${left} ${symbol} ${right} = ?`,
      input_mode: "number",
      min_completion_ms: 1200,
    },
    answer: String(answer),
  };
}

function createSequenceChallenge(): Challenge {
  const start = randomInt(2, 18);
  const step = randomInt(2, 9);
  const sequence = Array.from({ length: 5 }, (_, index) => start + index * step);
  const answer = start + sequence.length * step;
  return {
    publicData: {
      kind: "sequence",
      title: "Suite néon",
      prompt: `${sequence.join(" · ")} · ?`,
      input_mode: "number",
      min_completion_ms: 1600,
    },
    answer: String(answer),
  };
}

function createIntruderChallenge(): Challenge {
  const parity = randomInt(0, 1);
  const values = Array.from({ length: 6 }, () => randomInt(2, 24) * 2 + parity);
  const intruderIndex = randomInt(0, values.length - 1);
  values[intruderIndex] += 1;
  return {
    publicData: {
      kind: "intruder",
      title: "Intrus logique",
      prompt: "Quel nombre ne suit pas la règle ?",
      choices: values,
      input_mode: "choice",
      min_completion_ms: 1800,
    },
    answer: String(intruderIndex),
  };
}

function createChallenge(gameKey: string): Challenge {
  if (gameKey === "challenge_math") return createMathChallenge();
  if (gameKey === "challenge_sequence") return createSequenceChallenge();
  if (gameKey === "challenge_intruder") return createIntruderChallenge();
  throw new ApiError(400, "unknown_challenge");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  try {
    assertAllowedOrigin(request);
    const user = await authenticatedUser(request);
    const body = await request.json();
    const gameKey = String(body.game_key ?? "");
    const idempotencyKey = String(body.idempotency_key ?? "");
    if (!/^[a-z0-9:_-]{12,100}$/.test(idempotencyKey)) {
      throw new ApiError(400, "invalid_idempotency_key");
    }

    const challenge = createChallenge(gameKey);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const secretHash = await sha256(`${sessionId}:${challenge.answer}`);
    const admin = adminClient();
    const { data, error } = await admin.rpc("arcade_start_session", {
      p_session_id: sessionId,
      p_user_id: user.id,
      p_game_key: gameKey,
      p_idempotency_key: idempotencyKey,
      p_challenge_public: challenge.publicData,
      p_secret_hash: secretHash,
      p_expires_at: expiresAt,
    });
    if (error) throw error;
    return json(request, data);
  } catch (error) {
    return handleError(request, error);
  }
});
