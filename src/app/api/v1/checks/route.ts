import { createApiCheck } from "@/lib/api/checks";
import { apiError, authenticate } from "@/lib/api/http";
import { withIdempotency } from "@/lib/api/idempotency";

/** POST /v1/checks {"url": "example.com"}: runs a Quick Check (about 30-45 s) and returns it. */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const text = await request.text().catch(() => "");
  let body: { url?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!body || typeof body !== "object") return apiError(400, "invalid_body", 'Send a JSON body: {"url": "example.com"}');
  return withIdempotency(ctx, request, text, () => createApiCheck(ctx, body.url));
}
