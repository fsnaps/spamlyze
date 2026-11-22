import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { site } from "@/lib/site";

// Sign-in for API customers (Google, email only). Separate cookie and signing key from the admin
// session: a customer session can never open /admin, and the reverse.
export const ACCOUNT_COOKIE = "sl_account";
export const ACCOUNT_NONCE = "sl_account_nonce";
export const ACCOUNT_SESSION_DAYS = 14;
export const accountRedirect = () => `${site.url}/api/account/callback`;

const key = () => `account-session:${process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ""}`;
const mac = (v: string) => createHmac("sha256", key()).update(v).digest("base64url");

/** Cookie value: base64url(email).expiry.signature */
export function makeAccountSession(email: string) {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + ACCOUNT_SESSION_DAYS * 86_400_000}`;
  return `${body}.${mac(body)}`;
}

export function readAccountSession(value: string | undefined): string | null {
  if (!value || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) return null;
  const [b64, exp, sig] = value.split(".");
  if (!b64 || !exp || !sig) return null;
  const expected = Buffer.from(mac(`${b64}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  return Buffer.from(b64, "base64url").toString();
}

/** The signed-in customer's email, or null. */
export async function accountEmail(): Promise<string | null> {
  return readAccountSession((await cookies()).get(ACCOUNT_COOKIE)?.value);
}
