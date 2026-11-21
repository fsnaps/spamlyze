import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSession } from "@/lib/admin/session";
import type { DeepReport } from "./types";

// Deep Reports are "anyone with the link" by default (128-bit random ids). A buyer can make one
// private: it then opens only in a browser holding the report's access cookie (set when making it
// private, or by a sign-in link emailed to the purchase address) or for a signed-in admin.

const SIGN_IN_LINK_MINUTES = 60;
const COOKIE_DAYS = 180;

/** Server secret for the signatures; null when none is configured (private mode then stays off). */
function secret(): string | null {
  return process.env.API_KEY_PEPPER || process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;
}

const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("base64url");

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const accessCookie = (id: string) => `sld_${id}`;
export const privateModeAvailable = (report: DeepReport) => Boolean(secret() && report.email);

/** Cookie value: expiry.signature, tied to the report. */
export function accessCookieValue(id: string): { value: string; maxAge: number } {
  const exp = Date.now() + COOKIE_DAYS * 86_400_000;
  return { value: `${exp}.${mac(secret()!, `access:${id}:${exp}`)}`, maxAge: COOKIE_DAYS * 86_400 };
}

function validAccess(id: string, value: string | undefined): boolean {
  const key = secret();
  if (!key || !value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, mac(key, `access:${id}:${exp}`));
}

/** Whether this request may see the report. */
export async function canViewDeep(id: string, report: DeepReport): Promise<boolean> {
  if (!report.private) return true;
  const jar = await cookies();
  return validAccess(id, jar.get(accessCookie(id))?.value) || Boolean(readSession(jar.get(ADMIN_COOKIE)?.value));
}

/** One-hour sign-in link token for the purchase email. */
export function signInToken(id: string, email: string): string {
  const exp = Date.now() + SIGN_IN_LINK_MINUTES * 60_000;
  return `${exp}.${mac(secret()!, `signin:${id}:${email.toLowerCase()}:${exp}`)}`;
}

export function validSignInToken(id: string, email: string | undefined, token: string | null): boolean {
  const key = secret();
  if (!key || !email || !token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, mac(key, `signin:${id}:${email.toLowerCase()}:${exp}`));
}

/** "jo***@example.com", to remind the buyer which address to use without exposing it. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(4, user.length - 2)))}@${domain}`;
}
