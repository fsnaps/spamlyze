import "server-only";
import { clientIp } from "@/lib/check/guard";
import { getApiAccount, type ApiAccount } from "./accounts";
import { apiEnabled } from "./config";
import type { CreditError } from "./credits";
import { ApiConfigError, findApiKey, touchApiKey, type ApiKeyDoc } from "./keys";
import { RATE_PER_MINUTE, takeRate } from "./rate-limit";

export type ApiContext = {
  accountId: string;
  account: ApiAccount;
  keyId: string;
  key: ApiKeyDoc;
  ip: string;
};

/** Every API error has the same shape: { "error": { "code", "message" } }. */
export function apiError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

function readKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-api-key")?.trim() || null;
}

/**
 * Checks the API key of a request. Returns the caller's context, or the error Response to send.
 * The same 401 is used for a missing, unknown and revoked key so keys can't be probed.
 */
export async function authenticate(request: Request): Promise<ApiContext | Response> {
  const raw = readKey(request);
  if (!raw) return apiError(401, "missing_api_key", "Send your API key in the Authorization header: Bearer spz_live_…");
  try {
    const found = await findApiKey(raw);
    if (!found) return apiError(401, "invalid_api_key", "This API key is invalid or has been revoked.");
    const account = await getApiAccount(found.data.accountId);
    if (!account) return apiError(401, "invalid_api_key", "This API key is invalid or has been revoked.");
    if (!apiEnabled() && !account.beta) {
      return apiError(503, "api_not_open", "The Spamlyze API opens on December 1, 2026.");
    }
    if (account.status !== "active") {
      return apiError(403, "account_suspended", "This account is suspended. Contact hello@spamlyze.com.");
    }
    const rate = await takeRate(found.keyId);
    if (!rate.ok) {
      return apiError(429, "rate_limited", `Too many requests: ${RATE_PER_MINUTE()} per minute per key.`, {
        "retry-after": String(rate.retryAfter),
      });
    }
    const ip = clientIp(request.headers);
    await touchApiKey(found.keyId, found.data, ip);
    return { accountId: found.data.accountId, account, keyId: found.keyId, key: found.data, ip };
  } catch (err) {
    if (err instanceof ApiConfigError) console.error("API misconfigured:", err.message);
    else console.error("API auth failed", err);
    return apiError(503, "unavailable", "The API is temporarily unavailable. Please try again later.");
  }
}

/** Maps a credits failure to its API error (402 for money, 429 for the daily cap). */
export function creditErrorResponse(err: CreditError): Response {
  if (err.code === "insufficient_credits") return apiError(402, err.code, err.message);
  if (err.code === "daily_cap_reached") return apiError(429, err.code, err.message);
  return apiError(401, "invalid_api_key", "This API key is invalid or has been revoked.");
}
