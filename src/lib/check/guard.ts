import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

export class GuardError extends Error {}

const PER_IP_DAILY = Number(process.env.QUICK_CHECK_PER_IP_DAILY ?? 3);
const GLOBAL_DAILY = Number(process.env.QUICK_CHECK_GLOBAL_DAILY ?? 200);
const CACHE_HOURS = 24;

/** reCAPTCHA v3: fails closed in production when not configured. */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<void> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("RECAPTCHA_SECRET_KEY is not set; refusing quick checks");
      throw new GuardError("The free check is temporarily unavailable.");
    }
    return; // local development
  }
  if (!token) throw new GuardError("Please reload the page and try again.");
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as
    | { success?: boolean; score?: number; action?: string }
    | null;
  if (!data?.success || data.action !== "quick_check" || (data.score ?? 0) < 0.5) {
    throw new GuardError("We couldn't verify you're human. Please try again.");
  }
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const today = () => new Date().toISOString().slice(0, 10);

/** Atomically takes one unit from the IP's and the global daily quota, or throws. */
export async function takeQuota(ip: string): Promise<void> {
  const salt = process.env.IP_HASH_SALT ?? "spamlyze";
  const ipKey = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
  const day = today();
  const ipRef = db().collection("rateLimits").doc(`ip_${ipKey}_${day}`);
  const globalRef = db().collection("rateLimits").doc(`global_${day}`);
  const expiresAt = Timestamp.fromMillis(Date.now() + 2 * 86_400_000);

  await db().runTransaction(async (tx) => {
    const [ipSnap, globalSnap] = await Promise.all([tx.get(ipRef), tx.get(globalRef)]);
    if ((ipSnap.get("count") ?? 0) >= PER_IP_DAILY) {
      throw new GuardError(`You've used your ${PER_IP_DAILY} free checks for today. Come back tomorrow.`);
    }
    if ((globalSnap.get("count") ?? 0) >= GLOBAL_DAILY) {
      throw new GuardError("We've reached today's limit of free checks. Please come back tomorrow.");
    }
    tx.set(ipRef, { count: FieldValue.increment(1), expiresAt }, { merge: true });
    tx.set(globalRef, { count: FieldValue.increment(1), expiresAt }, { merge: true });
  });
}

/** Returns the id of a check of this domain from the last 24 hours, if any. */
export async function cachedCheck(domain: string): Promise<string | null> {
  const snap = await db().collection("checkCache").doc(domain).get();
  if (!snap.exists) return null;
  const at = snap.get("createdAt") as Timestamp | undefined;
  if (!at || Date.now() - at.toMillis() > CACHE_HOURS * 3_600_000) return null;
  return (snap.get("checkId") as string) ?? null;
}
