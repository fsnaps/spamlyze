import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { accounts } from "./accounts";
import { apiError, type ApiContext } from "./http";

// Idempotency-Key on POST requests: a client that retries after a network error gets the first
// answer back instead of being charged twice. Only successful (2xx) answers are kept, for 24 h:
// an error never charged anything, so retrying with the same key simply runs the request again.

const KEEP_MS = 24 * 3600_000;
/** A request still marked in progress after this long crashed: the key can be used again. */
const STALE_MS = 3 * 60_000;
const KEY_RE = /^[\x21-\x7e]{1,255}$/;

type Stored = {
  fingerprint: string;
  state: "pending" | "done";
  lockedAt: number;
  status?: number;
  body?: string;
  location?: string | null;
  expiresAt: Timestamp;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Runs `run` at most once per Idempotency-Key and account. Without the header, just runs it.
 * The same key with a different request body is refused (422), and a key whose first request
 * is still running gets a 409 so the client waits instead of starting a second one.
 */
export async function withIdempotency(
  ctx: ApiContext,
  request: Request,
  bodyText: string,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key");
  if (key === null) return run();
  if (!KEY_RE.test(key)) {
    return apiError(400, "invalid_idempotency_key", "Idempotency-Key must be 1 to 255 printable ASCII characters, such as a UUID.");
  }
  const ref = accounts().doc(ctx.accountId).collection("idempotency").doc(sha256(key));
  const fingerprint = sha256(`${request.method} ${new URL(request.url).pathname}\n${bodyText}`);

  const claim = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.data() as Stored | undefined;
    const now = Date.now();
    if (prev && prev.expiresAt.toMillis() > now) {
      if (prev.fingerprint !== fingerprint) return { kind: "mismatch" as const };
      if (prev.state === "done") return { kind: "replay" as const, prev };
      if (now - prev.lockedAt < STALE_MS) return { kind: "busy" as const };
    }
    tx.set(ref, { fingerprint, state: "pending", lockedAt: now, expiresAt: Timestamp.fromMillis(now + KEEP_MS) } satisfies Stored);
    return { kind: "run" as const };
  });

  if (claim.kind === "mismatch") {
    return apiError(422, "idempotency_key_reused", "This Idempotency-Key was already used with a different request. Use a new key.");
  }
  if (claim.kind === "busy") {
    return apiError(409, "idempotency_in_progress", "A request with this Idempotency-Key is still running. Retry in a few seconds.", {
      "retry-after": "5",
    });
  }
  if (claim.kind === "replay") {
    const { prev } = claim;
    return new Response(prev.body, {
      status: prev.status,
      headers: {
        "content-type": "application/json",
        "idempotent-replayed": "true",
        ...(prev.location ? { location: prev.location } : {}),
      },
    });
  }

  let res: Response;
  try {
    res = await run();
  } catch (err) {
    await ref.delete().catch(() => undefined);
    throw err;
  }
  if (res.status < 200 || res.status >= 300) {
    await ref.delete().catch(() => undefined);
    return res;
  }
  const body = await res.text();
  const location = res.headers.get("location");
  await ref
    .update({ state: "done", status: res.status, body, location })
    .catch((err) => console.error("idempotency store failed", err instanceof Error ? err.message : err));
  return new Response(body, { status: res.status, headers: res.headers });
}
