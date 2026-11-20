import { apiError, authenticate } from "@/lib/api/http";
import { createApiReport } from "@/lib/api/reports";

/** POST /v1/reports {"url": "example.com", "maxPages": 500}: starts a Deep Report, returns 202 with its id. */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = (await request.json().catch(() => null)) as { url?: unknown; maxPages?: unknown } | null;
  if (!body || typeof body !== "object") return apiError(400, "invalid_body", 'Send a JSON body: {"url": "example.com"}');
  return createApiReport(ctx, body);
}
