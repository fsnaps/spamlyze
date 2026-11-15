import { createHmac, timingSafeEqual } from "node:crypto";
import { site } from "@/lib/site";

// Kept free of "server-only" so the proxy can import it.
export const ADMIN_COOKIE = "sl_admin";
export const SESSION_DAYS = 14;
export const ADMIN_NONCE = "sl_admin_nonce";
export const adminRedirect = () => `${site.url}/api/admin/callback`;

const key = () => `admin-session:${process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ""}`;
const mac = (v: string) => createHmac("sha256", key()).update(v).digest("base64url");

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Cookie value: base64url(email).expiry.signature */
export function makeSession(email: string) {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + SESSION_DAYS * 86_400_000}`;
  return `${body}.${mac(body)}`;
}

export function readSession(value: string | undefined): string | null {
  if (!value || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) return null;
  const [b64, exp, sig] = value.split(".");
  if (!b64 || !exp || !sig) return null;
  const expected = Buffer.from(mac(`${b64}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  const email = Buffer.from(b64, "base64url").toString();
  return adminEmails().includes(email) ? email : null;
}
