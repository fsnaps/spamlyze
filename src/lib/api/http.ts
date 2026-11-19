import "server-only";
import { clientIp } from "@/lib/check/guard";
import { getApiAccount, type ApiAccount } from "./accounts";
import { apiEnabled } from "./config";
import { ApiConfigError, findApiKey, touchApiKey, type ApiKeyDoc } from "./keys";

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
    const ip = clientIp(request.headers);
    await touchApiKey(found.keyId, found.data, ip);
    return { accountId: found.data.accountId, account, keyId: found.keyId, key: found.data, ip };
  } catch (err) {
    if (err instanceof ApiConfigError) console.error("API misconfigured:", err.message);
    else console.error("API auth failed", err);
    return apiError(503, "unavailable", "The API is temporarily unavailable. Please try again later.");
  }
}
