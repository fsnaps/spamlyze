import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

export const RATE_PER_MINUTE = () => Number(process.env.API_RATE_PER_MINUTE ?? 60);

/**
 * Fixed one-minute window per API key, counted in Firestore so it holds across instances.
 * Documents carry expiresAt for a Firestore TTL policy on the apiRateLimits collection.
 */
export async function takeRate(keyId: string): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const limit = RATE_PER_MINUTE();
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const ref = db().collection("apiRateLimits").doc(`${keyId.slice(0, 32)}_${minute}`);
  const allowed = await db().runTransaction(async (tx) => {
    const count = ((await tx.get(ref)).get("count") as number) ?? 0;
    if (count >= limit) return false;
    tx.set(ref, { count: FieldValue.increment(1), expiresAt: Timestamp.fromMillis(now + 10 * 60_000) }, { merge: true });
    return true;
  });
  if (allowed) return { ok: true };
  return { ok: false, retryAfter: Math.max(1, Math.ceil(((minute + 1) * 60_000 - now) / 1000)) };
}
