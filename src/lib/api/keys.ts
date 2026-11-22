import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

// Keys look like spz_live_<32 base62 chars> (~190 bits). Only an HMAC of the key is stored,
// keyed with the API_KEY_PEPPER secret: a leaked Firestore export cannot be used to call the API,
// and the lookup is by document id, so there is no string comparison to time.

export const KEY_PREFIX = "spz_live_";
const KEY_RE = /^spz_live_[0-9A-Za-z]{32}$/;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Don't write lastUsedAt more than once per this many ms for a key (Firestore cost). */
const LAST_USED_EVERY_MS = 60_000;

export class ApiConfigError extends Error {}

export type ApiKeyDoc = {
  accountId: string;
  name: string;
  /** Shown in lists so people can tell keys apart: "spz_live_AbCd…wXyZ". */
  hint: string;
  createdAt: Timestamp;
  revokedAt: Timestamp | null;
  lastUsedAt: Timestamp | null;
  lastUsedIp: string | null;
  /** Last time each client IP used the key (keys: IP with "." and ":" as "_"), for the admin security view. */
  ips?: Record<string, Timestamp>;
  /** Last time the key hit the rate limit. */
  rateLimitedAt?: Timestamp | null;
};

export const ipField = (ip: string) => `ip_${ip.replace(/[^0-9A-Za-z]/g, "_").slice(0, 64)}`;
export const ipFromField = (f: string) => f.replace(/^ip_/, "").replace(/_/g, f.includes("_") && f.split("_").length > 5 ? ":" : ".");

export const keys = () => db().collection("apiKeys");

function pepper(): string {
  const p = process.env.API_KEY_PEPPER;
  if (p && p.length >= 32) return p;
  if (process.env.NODE_ENV === "production") throw new ApiConfigError("API_KEY_PEPPER is not set");
  return "dev-only-pepper-do-not-use-in-production";
}

export function hashKey(key: string): string {
  return createHmac("sha256", pepper()).update(key).digest("hex");
}

export function generateKey(): string {
  // Rejection sampling keeps every character uniformly random.
  let out = "";
  while (out.length < 32) {
    for (const b of randomBytes(48)) {
      if (b < 248 && out.length < 32) out += BASE62[b % 62];
    }
  }
  return KEY_PREFIX + out;
}

export const keyHint = (key: string) => `${key.slice(0, KEY_PREFIX.length + 4)}…${key.slice(-4)}`;

/** Creates a key for an account. The full key is returned once and never stored. */
export async function createApiKey(accountId: string, name: string): Promise<{ key: string; keyId: string; hint: string }> {
  const key = generateKey();
  const keyId = hashKey(key);
  const hint = keyHint(key);
  await keys().doc(keyId).create({
    accountId,
    name: name.slice(0, 60) || "Default",
    hint,
    createdAt: FieldValue.serverTimestamp(),
    revokedAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
  });
  return { key, keyId, hint };
}

/** Returns the key's record when the key exists and isn't revoked. */
export async function findApiKey(key: string): Promise<{ keyId: string; data: ApiKeyDoc } | null> {
  if (!KEY_RE.test(key)) return null;
  const keyId = hashKey(key);
  const snap = await keys().doc(keyId).get();
  if (!snap.exists) return null;
  const data = snap.data() as ApiKeyDoc;
  if (data.revokedAt) return null;
  return { keyId, data };
}

/** Records when and from where a key was last used, at most once a minute. Never throws. */
export async function touchApiKey(keyId: string, data: ApiKeyDoc, ip: string): Promise<void> {
  const last = data.lastUsedAt?.toMillis() ?? 0;
  if (Date.now() - last < LAST_USED_EVERY_MS && data.lastUsedIp === ip) return;
  await keys()
    .doc(keyId)
    .update({ lastUsedAt: FieldValue.serverTimestamp(), lastUsedIp: ip, [`ips.${ipField(ip)}`]: FieldValue.serverTimestamp() })
    .catch((err) => console.error("apiKey touch failed", err instanceof Error ? err.message : err));
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  const ref = keys().doc(keyId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("revokedAt")) return false;
    tx.update(ref, { revokedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

export async function listApiKeys(accountId: string): Promise<(ApiKeyDoc & { keyId: string })[]> {
  const snap = await keys().where("accountId", "==", accountId).get();
  return snap.docs
    .map((d) => ({ keyId: d.id, ...(d.data() as ApiKeyDoc) }))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

/** Notes that a key hit the rate limit (security view). Never throws. */
export async function markRateLimited(keyId: string): Promise<void> {
  await keys()
    .doc(keyId)
    .update({ rateLimitedAt: FieldValue.serverTimestamp() })
    .catch(() => undefined);
}
