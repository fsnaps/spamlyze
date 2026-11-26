import { createApiCheck } from "@/lib/api/checks";
import { apiError, authenticate } from "@/lib/api/http";
import { withIdempotency } from "@/lib/api/idempotency";
import { isHitAnswer } from "@/lib/hit-answers";

/**
 * POST /v1/checks {"url": "example.com", "hitBySpamUpdate": "yes"}: runs a Quick Check (about 30-45 s) and returns it.
 * hitBySpamUpdate is optional: whether the site lost traffic after a spam update ("yes" | "no" | "unsure").
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const text = await request.text().catch(() => "");
  let body: { url?: unknown; hitBySpamUpdate?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!body || typeof body !== "object") return apiError(400, "invalid_body", 'Send a JSON body: {"url": "example.com"}');
  const hit = body.hitBySpamUpdate;
  if (hit != null && !isHitAnswer(hit)) return apiError(400, "invalid_hit_by_spam_update", 'hitBySpamUpdate must be "yes", "no" or "unsure" when given.');
  return withIdempotency(ctx, request, text, () => createApiCheck(ctx, body.url, hit ?? undefined));
}
