import { apiError, authenticate } from "@/lib/api/http";
import { withIdempotency } from "@/lib/api/idempotency";
import { createApiReport } from "@/lib/api/reports";
import { isHitAnswer } from "@/lib/hit-answers";

/**
 * POST /v1/reports {"url": "example.com", "maxPages": 500, "hitBySpamUpdate": "yes", "searchConsole": "wait", "onSearchConsoleTimeout": "run"}:
 * starts a Deep Report (or makes it wait for the owner to connect Search Console), returns 202 with its id.
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const text = await request.text().catch(() => "");
  let body: { url?: unknown; maxPages?: unknown; hitBySpamUpdate?: unknown; searchConsole?: unknown; onSearchConsoleTimeout?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!body || typeof body !== "object") return apiError(400, "invalid_body", 'Send a JSON body: {"url": "example.com"}');
  if (body.hitBySpamUpdate != null && !isHitAnswer(body.hitBySpamUpdate)) {
    return apiError(400, "invalid_hit_by_spam_update", 'hitBySpamUpdate must be "yes", "no" or "unsure" when given.');
  }
  return withIdempotency(ctx, request, text, () => createApiReport(ctx, body));
}
