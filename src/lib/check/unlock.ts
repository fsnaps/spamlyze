import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The detailed Quick Check (issues 2-3 and the spam signals) is unlocked with an email:
// by a cookie set when the form is sent, or by the signed link in the email.
export const unlockCookie = (checkId: string) => `slq_${checkId}`;

function secret() {
  // IP_HASH_SALT isn't set in production: without a real secret anyone could forge unlock links.
  return process.env.REPORT_UNLOCK_SECRET || process.env.API_KEY_PEPPER || process.env.IP_HASH_SALT || "spamlyze";
}

export function unlockToken(checkId: string): string {
  return createHmac("sha256", secret()).update(`unlock:${checkId}`).digest("base64url").slice(0, 22);
}

export function validUnlockToken(checkId: string, token: string | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(unlockToken(checkId));
  return a.length === b.length && timingSafeEqual(a, b);
}
