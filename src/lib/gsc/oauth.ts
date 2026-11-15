import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { site } from "@/lib/site";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const NONCE_COOKIE = "gsc_nonce";
export const redirectUri = () => `${process.env.GSC_REDIRECT_BASE ?? site.url}/api/gsc/callback`;

export const gscEnabled = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

export function sign(value: string) {
  return createHmac("sha256", process.env.GOOGLE_OAUTH_CLIENT_SECRET!).update(value).digest("base64url");
}

/** State = deepId.nonce.signature. The nonce is also set in a short-lived cookie. */
export function makeState(deepId: string) {
  const nonce = randomBytes(16).toString("base64url");
  const body = `${deepId}.${nonce}`;
  return { state: `${body}.${sign(body)}`, nonce };
}

export function readState(state: string | null, cookieNonce: string | undefined): string | null {
  const parts = state?.split(".") ?? [];
  if (parts.length !== 3 || !cookieNonce) return null;
  const [deepId, nonce, sig] = parts;
  const expected = Buffer.from(sign(`${deepId}.${nonce}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (nonce !== cookieNonce) return null;
  return deepId;
}

export function authUrl(state: string, scope = GSC_SCOPE, redirect = redirectUri()) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirect,
    response_type: "code",
    scope,
    // One-time import: no refresh token, nothing to store.
    access_type: "online",
    state,
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export async function exchangeCode(
  code: string,
  redirect = redirectUri(),
): Promise<{ accessToken: string; scope: string; idToken?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as { access_token?: string; scope?: string; id_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`token exchange failed: ${json.error ?? res.status}`);
  return { accessToken: json.access_token, scope: json.scope ?? "", idToken: json.id_token };
}

/** Best effort: the token is short-lived anyway, but we drop it as soon as the import is done. */
export async function revoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}
